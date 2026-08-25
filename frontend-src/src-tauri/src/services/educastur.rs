use std::sync::OnceLock;

use chrono::{Datelike, NaiveDate};
use regex::Regex;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;
use crate::services::python_helper;

// ==========================================================
// Sincronización con Educastur (escritorio)
// ==========================================================
//
// Adaptación de api/app/services/educastur_sync.py::sincronizar al
// modelo de dos piezas del sidecar (ver services/python_helper.rs y
// python-helper/src/educastur_orchestrator.py): AQUÍ se hace todo lo que
// toca la base de datos local (qué faltas están pendientes, festivos del
// curso, franja horaria, guardar resultados) -- las llamadas HTTP reales
// a Educastur (login, tramos, buscar alumnado, marcar falta) viven en el
// sidecar Python, que no toca la base de datos para nada (ver la nota de
// diseño en la memoria del proyecto sobre por qué: SQLite en este
// programa solo admite un escritor, el propio Rust).
//
// Si se toca la lógica de emparejamiento en el original (Python), revisar
// también python-helper/src/educastur_orchestrator.py -- las dos copias
// tienen que seguir de acuerdo en qué es un día no lectivo, qué franja
// corresponde a qué hora, etc.

fn period_range_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // Mismo patrón que parsePeriodRange en utils.ts (TS, compartido web+
    // escritorio) y _PERIOD_RANGE_RE en educastur_sync.py -- las tres
    // versiones tienen que reconocer exactamente los mismos rangos.
    RE.get_or_init(|| Regex::new(r"(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})").unwrap())
}

fn parse_period_range(label: &str) -> Option<(i64, i64)> {
    let caps = period_range_re().captures(label)?;
    let h1: i64 = caps[1].parse().ok()?;
    let m1: i64 = caps[2].parse().ok()?;
    let h2: i64 = caps[3].parse().ok()?;
    let m2: i64 = caps[4].parse().ok()?;
    Some((h1 * 60 + m1, h2 * 60 + m2))
}

// Mismo criterio que _is_dia_no_lectivo en educastur_sync.py e isHoliday
// en CalendarView.tsx: findesemana se comprueba aparte de los festivos
// configurados, nunca hay clase en sábado/domingo aunque no estén
// marcados como festivo.
fn is_dia_no_lectivo(fecha: &str, holidays: &Value) -> bool {
    let Ok(d) = NaiveDate::parse_from_str(fecha, "%Y-%m-%d") else {
        return false;
    };
    if d.weekday().num_days_from_monday() >= 5 {
        return true;
    }
    let Some(arr) = holidays.as_array() else {
        return false;
    };
    for h in arr {
        let (Some(start), Some(end)) = (
            h.get("startDate").and_then(Value::as_str),
            h.get("endDate").and_then(Value::as_str),
        ) else {
            continue;
        };
        if let (Ok(s), Ok(e)) = (
            NaiveDate::parse_from_str(start, "%Y-%m-%d"),
            NaiveDate::parse_from_str(end, "%Y-%m-%d"),
        ) {
            if d >= s && d <= e {
                return true;
            }
        }
    }
    false
}

struct PendingRow {
    id: String,
    date: String,
    period_index: i64,
    tipo_falta: String,
    educastur_falta_id: Option<i64>,
    dni: Option<String>,
    nombre: Option<String>,
    primer_apellido: Option<String>,
    segundo_apellido: Option<String>,
    periods_json: String,
    holidays_json: String,
}

fn nombre_completo(row: &PendingRow) -> String {
    [&row.nombre, &row.primer_apellido, &row.segundo_apellido]
        .iter()
        .filter_map(|o| o.as_deref())
        .collect::<Vec<_>>()
        .join(" ")
}

fn row_to_pending(row: &Row) -> rusqlite::Result<PendingRow> {
    Ok(PendingRow {
        id: row.get(0)?,
        date: row.get(1)?,
        period_index: row.get(2)?,
        tipo_falta: row.get(3)?,
        educastur_falta_id: row.get(4)?,
        dni: row.get(5)?,
        nombre: row.get(6)?,
        primer_apellido: row.get(7)?,
        segundo_apellido: row.get(8)?,
        periods_json: row.get(9)?,
        holidays_json: row.get(10)?,
    })
}

// Mismo JOIN que _pending_absences en educastur_sync.py -- absences no
// tiene class_id/academic_year_id propios, hace falta atravesar
// enrollments/students/classes/academic_years para llegar al periods/
// holidays del curso académico de esa clase.
fn pending_absences(conn: &Connection) -> Result<Vec<PendingRow>, ApiError> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.date, a.period_index, a.tipo_falta, a.educastur_falta_id, \
                s.dni, s.nombre, s.primer_apellido, s.segundo_apellido, \
                ay.periods, ay.holidays \
         FROM absences a \
         JOIN enrollments e ON e.id = a.enrollment_id \
         JOIN students s ON s.id = e.student_id \
         JOIN classes c ON c.id = e.class_id \
         JOIN academic_years ay ON ay.id = c.academic_year_id \
         WHERE a.synced_at IS NULL",
    )?;
    let rows = stmt.query_map([], row_to_pending)?;
    let items: Result<Vec<PendingRow>, _> = rows.collect();
    Ok(items?)
}

fn mark_synced(conn: &Connection, absence_id: &str, educastur_falta_id: Option<i64>) -> Result<(), ApiError> {
    conn.execute(
        "UPDATE absences SET synced_at = ?, sync_error = NULL, educastur_falta_id = ? WHERE id = ?",
        params![db::now_iso(), educastur_falta_id, absence_id],
    )?;
    Ok(())
}

fn mark_error(conn: &Connection, absence_id: &str, motivo: &str) -> Result<(), ApiError> {
    conn.execute(
        "UPDATE absences SET sync_error = ? WHERE id = ?",
        params![motivo, absence_id],
    )?;
    Ok(())
}

// Confirmación de borrado en Educastur: la fila ya no representa nada en
// ninguno de los dos sitios -- mismo criterio que _delete_synced_blank.
fn delete_synced_blank(conn: &Connection, absence_id: &str) -> Result<(), ApiError> {
    conn.execute("DELETE FROM absences WHERE id = ?", params![absence_id])?;
    Ok(())
}

fn get_config(conn: &Connection) -> Result<Value, ApiError> {
    let row = conn.query_row(
        "SELECT id_empleado, id_centro, id_perfil, nombre_profesor FROM educastur_config WHERE id = 1",
        [],
        |row| {
            Ok((
                row.get::<_, Option<i64>>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<i64>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        },
    );
    match row {
        Ok((id_empleado, id_centro, id_perfil, nombre_profesor)) => Ok(json!({
            "id_empleado": id_empleado, "id_centro": id_centro,
            "id_perfil": id_perfil, "nombre_profesor": nombre_profesor,
        })),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(json!({
            "id_empleado": Value::Null, "id_centro": Value::Null,
            "id_perfil": Value::Null, "nombre_profesor": Value::Null,
        })),
        Err(e) => Err(e.into()),
    }
}

fn save_config(conn: &Connection, id_empleado: i64, id_centro: i64, id_perfil: Option<i64>, nombre_profesor: Option<&str>) -> Result<(), ApiError> {
    conn.execute(
        "INSERT INTO educastur_config (id, id_empleado, id_centro, id_perfil, nombre_profesor, updated_at)
         VALUES (1, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
            id_empleado = excluded.id_empleado, id_centro = excluded.id_centro,
            id_perfil = excluded.id_perfil, nombre_profesor = excluded.nombre_profesor,
            updated_at = excluded.updated_at",
        params![id_empleado, id_centro, id_perfil, nombre_profesor, db::now_iso()],
    )?;
    Ok(())
}

// Activación + aviso de responsabilidad (migración 0005, solo escritorio --
// ver ese fichero para el motivo). Pensado para ir por la ruta genérica
// (GET/PUT /educastur/settings en routers/mod.rs), no necesita AppHandle.
pub fn get_settings(conn: &Connection) -> Result<Value, ApiError> {
    let row = conn.query_row(
        "SELECT sync_enabled, disclaimer_accepted_at FROM educastur_config WHERE id = 1",
        [],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
    );
    match row {
        Ok((enabled, accepted_at)) => Ok(json!({"enabled": enabled != 0, "disclaimerAcceptedAt": accepted_at})),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(json!({"enabled": false, "disclaimerAcceptedAt": Value::Null})),
        Err(e) => Err(e.into()),
    }
}

// Regla explícita: activar (enabled=true) exige acceptDisclaimer=true en la
// MISMA petición -- el frontend siempre muestra el aviso antes de mandar
// enabled=true, nunca reutiliza una aceptación de una sesión anterior para
// saltárselo (ver comentario "siempre" en el pedido original). Desactivar
// no exige nada y no borra disclaimer_accepted_at (queda como rastro de
// cuándo se aceptó por última vez).
pub fn save_settings(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let enabled = body.get("enabled").and_then(Value::as_bool).unwrap_or(false);
    let accept = body.get("acceptDisclaimer").and_then(Value::as_bool).unwrap_or(false);

    if enabled && !accept {
        return Err(ApiError::bad_request(
            "Para activar la sincronización con Educastur hay que aceptar el aviso.",
        ));
    }

    let disclaimer_accepted_at: Option<String> = if accept { Some(db::now_iso()) } else { None };

    conn.execute(
        "INSERT INTO educastur_config (id, sync_enabled, disclaimer_accepted_at, updated_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
            sync_enabled = excluded.sync_enabled,
            disclaimer_accepted_at = COALESCE(excluded.disclaimer_accepted_at, educastur_config.disclaimer_accepted_at),
            updated_at = excluded.updated_at",
        params![enabled as i64, disclaimer_accepted_at, db::now_iso()],
    )?;

    get_settings(conn)
}

// Parte 100% local del filtrado (día no lectivo / franja horaria
// irresoluble) -- separada de sincronizar() para poder probarla con un
// #[test] normal (rusqlite en memoria), sin necesitar un AppHandle real
// de Tauri, que solo hace falta a partir de aquí si queda algo procesable.
fn filtrar_procesables(conn: &Connection) -> Result<(Vec<Value>, Vec<Value>), ApiError> {
    let pending = pending_absences(conn)?;

    let mut errores: Vec<Value> = Vec::new();
    let mut procesables: Vec<Value> = Vec::new();

    for row in &pending {
        let holidays: Value = serde_json::from_str(&row.holidays_json).unwrap_or_else(|_| json!([]));

        if is_dia_no_lectivo(&row.date, &holidays) {
            let motivo = format!("{} es festivo o fin de semana -- no se pueden sincronizar faltas en días no lectivos.", row.date);
            mark_error(conn, &row.id, &motivo)?;
            errores.push(json!({"absenceId": row.id, "alumno": nombre_completo(row), "motivo": motivo}));
            continue;
        }

        let periods: Value = serde_json::from_str(&row.periods_json).unwrap_or_else(|_| json!([]));
        let label = periods.get(row.period_index as usize).and_then(Value::as_str);
        let rango = label.and_then(parse_period_range);

        let Some((hora_inicio, hora_fin)) = rango else {
            let motivo = "No se pudo resolver la franja horaria de esta falta (no hay clase en ese tramo).".to_string();
            mark_error(conn, &row.id, &motivo)?;
            errores.push(json!({"absenceId": row.id, "alumno": nombre_completo(row), "motivo": motivo}));
            continue;
        };

        procesables.push(json!({
            "absence_id": row.id,
            "fecha": row.date,
            "hora_inicio": hora_inicio,
            "hora_fin": hora_fin,
            "dni": row.dni,
            "nombre": row.nombre,
            "primer_apellido": row.primer_apellido,
            "segundo_apellido": row.segundo_apellido,
            "tipo_falta": row.tipo_falta,
            "educastur_falta_id": row.educastur_falta_id,
        }));
    }

    Ok((procesables, errores))
}

// Orquesta una sincronización completa: comprobaciones 100% locales
// primero (sin tocar Educastur) -> si queda algo procesable, una única
// llamada al sidecar (login->push->logout autocontenido ahí) -> escribir
// los resultados. Mismo orden que el original -- si no queda nada
// procesable, ni siquiera se llama al sidecar (ni se pide usuario/
// contraseña de verdad).
pub fn sincronizar(conn: &Connection, app: &tauri::AppHandle, body: Value) -> Result<Value, ApiError> {
    // Defensa en profundidad: aunque la UI ya oculta el botón de
    // sincronizar cuando esto está desactivado (ver GradebookTable.tsx),
    // se repite la comprobación aquí para que no haya ninguna vía (comando
    // Tauri invocado a mano, versión de UI desincronizada...) que se salte
    // el aviso de responsabilidad.
    if !get_settings(conn)?["enabled"].as_bool().unwrap_or(false) {
        return Err(ApiError::bad_request(
            "La sincronización con Educastur está desactivada. Actívala en Ajustes tras leer el aviso.",
        ));
    }

    let usuario = body.get("usuario").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("usuario es obligatorio"))?;
    let contrasena = body.get("contrasena").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("contrasena es obligatoria"))?;
    let id_empleado_input = body.get("idEmpleado").and_then(Value::as_i64);
    let id_centro_input = body.get("idCentro").and_then(Value::as_i64);
    let id_perfil_input = body.get("idPerfil").and_then(Value::as_i64);

    let (procesables, mut errores) = filtrar_procesables(conn)?;

    if procesables.is_empty() {
        // Nada que de verdad se pueda intentar -- ni siquiera se llama al
        // sidecar (ni se gasta el usuario/contraseña que ya se han dado).
        return Ok(json!({"sincronizadas": 0, "errores": errores}));
    }

    let stored = get_config(conn)?;

    let payload = json!({
        "usuario": usuario, "contrasena": contrasena,
        "id_empleado": id_empleado_input, "id_centro": id_centro_input, "id_perfil": id_perfil_input,
        "stored": stored,
        "procesables": procesables,
    });

    let resultado = python_helper::educastur_sincronizar(app, payload)?;

    let mut sincronizadas_count: i64 = 0;

    for item in resultado.get("sincronizadas").and_then(Value::as_array).into_iter().flatten() {
        let Some(absence_id) = item.get("absence_id").and_then(Value::as_str) else { continue };
        let educastur_falta_id = item.get("educastur_falta_id").and_then(Value::as_i64);
        let borrado = item.get("borrado").and_then(Value::as_bool).unwrap_or(false);
        if borrado {
            delete_synced_blank(conn, absence_id)?;
        } else {
            mark_synced(conn, absence_id, educastur_falta_id)?;
        }
        sincronizadas_count += 1;
    }

    for item in resultado.get("errores").and_then(Value::as_array).into_iter().flatten() {
        let Some(absence_id) = item.get("absence_id").and_then(Value::as_str) else { continue };
        let motivo = item.get("motivo").and_then(Value::as_str).unwrap_or_default();
        mark_error(conn, absence_id, motivo)?;
        errores.push(json!({
            "absenceId": absence_id,
            "alumno": item.get("alumno").cloned().unwrap_or(Value::Null),
            "motivo": motivo,
        }));
    }

    let id_empleado = resultado.get("id_empleado").and_then(Value::as_i64);
    let id_centro = resultado.get("id_centro").and_then(Value::as_i64);
    let id_perfil = resultado.get("id_perfil").and_then(Value::as_i64);
    let nombre_profesor = resultado.get("nombre_profesor").and_then(Value::as_str);

    if let (Some(e), Some(c)) = (id_empleado, id_centro) {
        save_config(conn, e, c, id_perfil, nombre_profesor)?;
    }

    Ok(json!({
        "sincronizadas": sincronizadas_count,
        "errores": errores,
        "idEmpleado": id_empleado,
        "idCentro": id_centro,
        "idPerfil": id_perfil,
        "nombreProfesor": nombre_profesor,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routers;

    // Curso académico con los DEFAULT_PERIODS de siempre (ver
    // academic_years.rs) -- periodIndex 0 es "1ª Hora (8:15-9:10)".
    fn setup_enrollment(conn: &Connection) -> (String, String) {
        let year = routers::dispatch(conn, "POST", "/academic-years", Some(json!({"label": "2026-2027", "startDate": "2026-09-01", "endDate": "2027-06-30"}))).unwrap();
        let year_id = year["id"].as_str().unwrap().to_string();
        let course = routers::dispatch(conn, "POST", "/courses", Some(json!({"level": "1 ESO", "subject": "Música"}))).unwrap();
        let course_id = course["id"].as_str().unwrap().to_string();
        let class = routers::dispatch(conn, "POST", &format!("/academic-years/{year_id}/classes"), Some(json!({"courseId": course_id, "grupo": "A"}))).unwrap();
        let class_id = class["id"].as_str().unwrap().to_string();
        let enrollment = routers::dispatch(conn, "POST", &format!("/classes/{class_id}/enrollments"), Some(json!({"newStudent": {"nombre": "Eva", "dni": "12345678A"}}))).unwrap();
        (year_id, enrollment["id"].as_str().unwrap().to_string())
    }

    fn insert_absence(conn: &Connection, enrollment_id: &str, date: &str, period_index: i64) {
        conn.execute(
            "INSERT INTO absences (id, enrollment_id, date, period_index, tipo_falta, updated_at) VALUES (?,?,?,?,?,?)",
            params![db::new_uuid(), enrollment_id, date, period_index, "I", db::now_iso()],
        ).unwrap();
    }

    #[test]
    fn parse_period_range_matches_known_label() {
        assert_eq!(parse_period_range("1ª Hora (8:15-9:10)"), Some((495, 550)));
        assert_eq!(parse_period_range("Recreo"), None);
    }

    #[test]
    fn is_dia_no_lectivo_treats_weekend_as_non_lectivo_without_holidays_configured() {
        assert!(is_dia_no_lectivo("2026-09-19", &json!([]))); // sábado
        assert!(!is_dia_no_lectivo("2026-09-15", &json!([]))); // martes
    }

    #[test]
    fn filtrar_procesables_resolves_valid_weekday_period() {
        let conn = db::test_connection();
        let (_year_id, enrollment_id) = setup_enrollment(&conn);
        insert_absence(&conn, &enrollment_id, "2026-09-15", 0); // martes

        let (procesables, errores) = filtrar_procesables(&conn).unwrap();

        assert_eq!(errores.len(), 0);
        assert_eq!(procesables.len(), 1);
        assert_eq!(procesables[0]["fecha"], "2026-09-15");
        assert_eq!(procesables[0]["hora_inicio"], 495); // 8:15
        assert_eq!(procesables[0]["hora_fin"], 550); // 9:10
    }

    #[test]
    fn filtrar_procesables_marks_weekend_as_error_and_persists_it() {
        let conn = db::test_connection();
        let (_year_id, enrollment_id) = setup_enrollment(&conn);
        insert_absence(&conn, &enrollment_id, "2026-09-19", 0); // sábado

        let (procesables, errores) = filtrar_procesables(&conn).unwrap();

        assert_eq!(procesables.len(), 0);
        assert_eq!(errores.len(), 1);
        assert!(errores[0]["motivo"].as_str().unwrap().contains("festivo o fin de semana"));

        // El error queda grabado en la propia fila, no solo en lo que se devuelve.
        let sync_error: Option<String> = conn.query_row(
            "SELECT sync_error FROM absences WHERE enrollment_id = ?", params![enrollment_id],
            |r| r.get(0),
        ).unwrap();
        assert!(sync_error.unwrap().contains("fin de semana"));
    }

    #[test]
    fn filtrar_procesables_marks_configured_holiday_as_error() {
        let conn = db::test_connection();
        let (year_id, enrollment_id) = setup_enrollment(&conn);
        routers::dispatch(&conn, "PATCH", &format!("/academic-years/{year_id}"), Some(json!({
            "holidays": [{"startDate": "2026-09-15", "endDate": "2026-09-15"}]
        }))).unwrap();
        insert_absence(&conn, &enrollment_id, "2026-09-15", 0); // martes, pero marcado festivo

        let (procesables, errores) = filtrar_procesables(&conn).unwrap();

        assert_eq!(procesables.len(), 0);
        assert_eq!(errores.len(), 1);
    }

    #[test]
    fn filtrar_procesables_marks_unresolvable_period_as_error() {
        let conn = db::test_connection();
        let (_year_id, enrollment_id) = setup_enrollment(&conn);
        insert_absence(&conn, &enrollment_id, "2026-09-15", 99); // fuera del rango de periods

        let (procesables, errores) = filtrar_procesables(&conn).unwrap();

        assert_eq!(procesables.len(), 0);
        assert_eq!(errores.len(), 1);
        assert!(errores[0]["motivo"].as_str().unwrap().contains("franja horaria"));
    }

    #[test]
    fn get_and_save_config_round_trip() {
        let conn = db::test_connection();
        let empty = get_config(&conn).unwrap();
        assert_eq!(empty["id_empleado"], Value::Null); // fila inexistente -> todo null

        save_config(&conn, 111, 222, Some(333), Some("Ana Profesora")).unwrap();
        let filled = get_config(&conn).unwrap();
        assert_eq!(filled["id_empleado"], 111);
        assert_eq!(filled["id_centro"], 222);
        assert_eq!(filled["id_perfil"], 333);
        assert_eq!(filled["nombre_profesor"], "Ana Profesora");

        // Guardar de nuevo actualiza la fila singleton, no inserta una segunda.
        save_config(&conn, 999, 222, None, None).unwrap();
        let updated = get_config(&conn).unwrap();
        assert_eq!(updated["id_empleado"], 999);
        assert_eq!(updated["id_perfil"], Value::Null);

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM educastur_config", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn get_settings_defaults_to_disabled_without_a_row() {
        let conn = db::test_connection();
        let settings = get_settings(&conn).unwrap();
        assert_eq!(settings["enabled"], false);
        assert_eq!(settings["disclaimerAcceptedAt"], Value::Null);
    }

    #[test]
    fn save_settings_requires_accept_disclaimer_to_enable() {
        let conn = db::test_connection();
        let err = save_settings(&conn, json!({"enabled": true})).unwrap_err();
        assert_eq!(err.status, 400);
        assert_eq!(get_settings(&conn).unwrap()["enabled"], false); // no se activó a medias
    }

    #[test]
    fn save_settings_enable_disable_round_trip() {
        let conn = db::test_connection();
        let enabled = save_settings(&conn, json!({"enabled": true, "acceptDisclaimer": true})).unwrap();
        assert_eq!(enabled["enabled"], true);
        assert!(enabled["disclaimerAcceptedAt"].as_str().is_some());

        let disabled = save_settings(&conn, json!({"enabled": false})).unwrap();
        assert_eq!(disabled["enabled"], false);
        // Se conserva el rastro de cuándo se aceptó -- desactivar no lo borra.
        assert!(disabled["disclaimerAcceptedAt"].as_str().is_some());
    }
}
