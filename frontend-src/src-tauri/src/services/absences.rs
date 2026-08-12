use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

const COLUMNS: &str = "id, enrollment_id, date, period_index, tipo_falta, educastur_falta_id, synced_at, sync_error, updated_at";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "enrollmentId": row.get::<_, String>(1)?,
        "date": row.get::<_, String>(2)?,
        "periodIndex": row.get::<_, i64>(3)?,
        "tipoFalta": row.get::<_, String>(4)?,
        "educasturFaltaId": row.get::<_, Option<i64>>(5)?,
        "syncedAt": row.get::<_, Option<String>>(6)?,
        "syncError": row.get::<_, Option<String>>(7)?,
        "updatedAt": row.get::<_, String>(8)?,
    }))
}

// Lectura en bloque para pintar la pestaña "Asistencia" de una clase
// entera -- JOIN a enrollments porque absences no tiene class_id propia,
// mismo criterio que services/absences.py::list_absences_for_class.
pub fn list_for_class(conn: &Connection, class_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.enrollment_id, a.date, a.period_index, a.tipo_falta, a.educastur_falta_id, a.synced_at, a.sync_error, a.updated_at \
         FROM absences a JOIN enrollments e ON e.id = a.enrollment_id WHERE e.class_id = ?",
    )?;
    let rows = stmt.query_map(params![class_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

const SQLITE_CONSTRAINT_FOREIGNKEY: i32 = 787;
const SQLITE_CONSTRAINT_CHECK: i32 = 275;

fn map_write_error(e: rusqlite::Error) -> ApiError {
    if let rusqlite::Error::SqliteFailure(sqlite_err, _) = &e {
        match sqlite_err.extended_code {
            SQLITE_CONSTRAINT_FOREIGNKEY => return ApiError::not_found("La matrícula no existe."),
            SQLITE_CONSTRAINT_CHECK => {
                return ApiError { status: 422, detail: "Tipo de falta inválido: debe ser R, J o I.".to_string() }
            }
            _ => {}
        }
    }
    ApiError::internal(e)
}

// Upsert por (enrollment_id, date, period_index) -- clic izquierdo/derecho
// en la UI siempre manda la fila completa; si ya existía una falta en esa
// franja se sustituye (editar el tipo no crea una segunda fila). Al
// cambiar de tipo se limpia el estado de sincronización previo -- mismo
// criterio que services/absences.py::put_absence. synced_at/
// educastur_falta_id nunca los pone nada en escritorio (sin sincronización
// con Educastur aquí, ver comentario de la migración 0002).
pub fn put(conn: &Connection, enrollment_id: &str, body: Value) -> Result<Value, ApiError> {
    let date = body.get("date").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("date es obligatoria"))?;
    let period_index = body.get("periodIndex").and_then(Value::as_i64)
        .ok_or_else(|| ApiError::bad_request("periodIndex es obligatorio"))?;
    let tipo_falta = body.get("tipoFalta").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("tipoFalta es obligatorio"))?;

    let id = db::new_uuid();
    conn.execute(
        "INSERT INTO absences (id, enrollment_id, date, period_index, tipo_falta, updated_at) \
         VALUES (?,?,?,?,?,?) \
         ON CONFLICT (enrollment_id, date, period_index) DO UPDATE SET \
            tipo_falta = excluded.tipo_falta, synced_at = NULL, sync_error = NULL, updated_at = excluded.updated_at",
        params![id, enrollment_id, date, period_index, tipo_falta, db::now_iso()],
    ).map_err(map_write_error)?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM absences WHERE enrollment_id = ? AND date = ? AND period_index = ?"
    ))?;
    let mut rows = stmt.query_map(params![enrollment_id, date, period_index], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(row?),
        None => Err(ApiError::internal("no se pudo releer la falta tras guardarla")),
    }
}

// Igual criterio que services/absences.py::delete_absence: si la falta
// nunca llegó a subirse a Educastur (educastur_falta_id NULL -- siempre,
// en escritorio, ninguna sincronización lo pone), se borra al momento. Si
// lo tuviera (solo podría llegar por una copia de seguridad importada
// desde la web), se deja en blanco pendiente en vez de borrarla -- mismo
// esquema y comportamiento que el backend web, aunque en la práctica
// desktop nunca sincroniza nada.
pub fn delete(conn: &Connection, enrollment_id: &str, date: &str, period_index: i64) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(
        "SELECT educastur_falta_id FROM absences WHERE enrollment_id = ? AND date = ? AND period_index = ?"
    )?;
    let mut rows = stmt.query_map(params![enrollment_id, date, period_index], |row| row.get::<_, Option<i64>>(0))?;
    let educastur_falta_id = match rows.next() {
        Some(v) => v?,
        None => return Err(ApiError::not_found("Falta no encontrada.")),
    };

    if educastur_falta_id.is_none() {
        conn.execute(
            "DELETE FROM absences WHERE enrollment_id = ? AND date = ? AND period_index = ?",
            params![enrollment_id, date, period_index],
        )?;
    } else {
        conn.execute(
            "UPDATE absences SET tipo_falta = '', synced_at = NULL, sync_error = NULL, updated_at = ? \
             WHERE enrollment_id = ? AND date = ? AND period_index = ?",
            params![db::now_iso(), enrollment_id, date, period_index],
        )?;
    }
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routers;
    use serde_json::json;

    fn setup_enrollment(conn: &Connection) -> String {
        let year = routers::dispatch(conn, "POST", "/academic-years", Some(json!({"label": "2026-2027", "startDate": "2026-09-01", "endDate": "2027-06-30"}))).unwrap();
        let year_id = year["id"].as_str().unwrap().to_string();
        let course = routers::dispatch(conn, "POST", "/courses", Some(json!({"level": "1 ESO", "subject": "Música"}))).unwrap();
        let course_id = course["id"].as_str().unwrap().to_string();
        let class = routers::dispatch(conn, "POST", &format!("/academic-years/{year_id}/classes"), Some(json!({"courseId": course_id, "grupo": "A"}))).unwrap();
        let class_id = class["id"].as_str().unwrap().to_string();
        let enrollment = routers::dispatch(conn, "POST", &format!("/classes/{class_id}/enrollments"), Some(json!({"newStudent": {"nombre": "Eva"}}))).unwrap();
        enrollment["id"].as_str().unwrap().to_string()
    }

    #[test]
    fn put_upserts_and_resets_sync_state_on_type_change() {
        let conn = db::test_connection();
        let enrollment_id = setup_enrollment(&conn);

        let created = put(&conn, &enrollment_id, json!({"date": "2026-09-15", "periodIndex": 0, "tipoFalta": "I"})).unwrap();
        assert_eq!(created["tipoFalta"], "I");
        assert_eq!(created["syncedAt"], Value::Null);
        let id = created["id"].as_str().unwrap().to_string();

        // Simula que ya se "sincronizó" (aunque en desktop nada lo hace de
        // verdad) para comprobar que un cambio de tipo la limpia.
        conn.execute("UPDATE absences SET synced_at = ?, educastur_falta_id = 42 WHERE id = ?", params![db::now_iso(), id]).unwrap();

        let updated = put(&conn, &enrollment_id, json!({"date": "2026-09-15", "periodIndex": 0, "tipoFalta": "J"})).unwrap();
        assert_eq!(updated["id"], id); // mismo slot, no duplica
        assert_eq!(updated["tipoFalta"], "J");
        assert_eq!(updated["syncedAt"], Value::Null); // se limpió al cambiar de tipo
        assert_eq!(updated["educasturFaltaId"], 42); // el id de Educastur no se toca
    }

    #[test]
    fn put_invalid_tipo_falta_is_422() {
        let conn = db::test_connection();
        let enrollment_id = setup_enrollment(&conn);
        let err = put(&conn, &enrollment_id, json!({"date": "2026-09-15", "periodIndex": 0, "tipoFalta": "X"})).unwrap_err();
        assert_eq!(err.status, 422);
    }

    #[test]
    fn delete_never_synced_hard_deletes() {
        let conn = db::test_connection();
        let enrollment_id = setup_enrollment(&conn);
        put(&conn, &enrollment_id, json!({"date": "2026-09-15", "periodIndex": 0, "tipoFalta": "R"})).unwrap();

        delete(&conn, &enrollment_id, "2026-09-15", 0).unwrap();

        let listed = list_for_class(&conn, "no-existe").unwrap();
        assert_eq!(listed.as_array().unwrap().len(), 0);
        let err = delete(&conn, &enrollment_id, "2026-09-15", 0).unwrap_err();
        assert_eq!(err.status, 404);
    }

    #[test]
    fn delete_already_synced_leaves_blank_pending_row() {
        let conn = db::test_connection();
        let enrollment_id = setup_enrollment(&conn);
        let created = put(&conn, &enrollment_id, json!({"date": "2026-09-15", "periodIndex": 0, "tipoFalta": "I"})).unwrap();
        let id = created["id"].as_str().unwrap().to_string();
        conn.execute("UPDATE absences SET synced_at = ?, educastur_falta_id = 99 WHERE id = ?", params![db::now_iso(), id]).unwrap();

        delete(&conn, &enrollment_id, "2026-09-15", 0).unwrap();

        let mut stmt = conn.prepare("SELECT tipo_falta, synced_at, educastur_falta_id FROM absences WHERE id = ?").unwrap();
        let row = stmt.query_row(params![id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, Option<i64>>(2)?))).unwrap();
        assert_eq!(row.0, ""); // en blanco, pendiente de subir el borrado
        assert_eq!(row.1, None); // pendiente de sincronizar
        assert_eq!(row.2, Some(99)); // conserva el id de Educastur para poder borrarla allí también
    }
}
