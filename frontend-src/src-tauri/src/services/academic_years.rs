use chrono::{Duration, NaiveDate};
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::{self, ApiError};

use super::merge_object;

const YEAR_COLUMNS: &str = "id, label, start_date, end_date, is_current, holidays, periods";
const PERIOD_COLUMNS: &str = "id, academic_year_id, name, start_date, end_date, weight";
const YC_COLUMNS: &str = "id, academic_year_id, course_id, created_at";

fn year_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let holidays: String = row.get(5)?;
    let periods: String = row.get(6)?;
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "label": row.get::<_, String>(1)?,
        "startDate": row.get::<_, String>(2)?,
        "endDate": row.get::<_, String>(3)?,
        "isCurrent": row.get::<_, bool>(4)?,
        "holidays": serde_json::from_str::<Value>(&holidays).unwrap_or_else(|_| json!([])),
        "periods": serde_json::from_str::<Value>(&periods).unwrap_or_else(|_| json!([])),
    }))
}

pub fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {YEAR_COLUMNS} FROM academic_years WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], year_row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {YEAR_COLUMNS} FROM academic_years ORDER BY start_date DESC"))?;
    let rows = stmt.query_map([], year_row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

// Igual reparto que _default_evaluation_periods en el backend web: 3
// tercios del rango de fechas del curso, sembrados una vez al crearlo (no
// una sola vez en toda la vida de la app, como hacía INITIAL_ACADEMIC_
// CONFIGURATION en el sistema anterior -- crear un curso es ahora una
// acción explícita y repetible).
fn default_evaluation_periods(start: NaiveDate, end: NaiveDate) -> Vec<(&'static str, NaiveDate, NaiveDate)> {
    let total_days = (end - start).num_days();
    let third = total_days / 3;
    let p1_end = start + Duration::days(third);
    let p2_end = start + Duration::days(2 * third);
    vec![
        ("1ª Evaluación", start, p1_end),
        ("2ª Evaluación", p1_end + Duration::days(1), p2_end),
        ("3ª Evaluación", p2_end + Duration::days(1), end),
    ]
}

fn parse_date(value: Option<&str>, field: &str) -> Result<NaiveDate, ApiError> {
    let raw = value.ok_or_else(|| ApiError::bad_request(format!("{field} es obligatoria")))?;
    NaiveDate::parse_from_str(raw, "%Y-%m-%d").map_err(|_| ApiError::bad_request(format!("{field} no es una fecha válida")))
}

pub fn create(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let label = body.get("label").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("label es obligatorio"))?;
    let start = parse_date(body.get("startDate").and_then(Value::as_str), "startDate")?;
    let end = parse_date(body.get("endDate").and_then(Value::as_str), "endDate")?;
    if end <= start {
        return Err(ApiError::bad_request("endDate debe ser posterior a startDate"));
    }

    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO academic_years (id, label, start_date, end_date, created_at, updated_at) VALUES (?,?,?,?,?,?)",
        params![id, label, start.to_string(), end.to_string(), now.clone(), now],
    )?;

    for (name, p_start, p_end) in default_evaluation_periods(start, end) {
        conn.execute(
            "INSERT INTO evaluation_periods (id, academic_year_id, name, start_date, end_date, weight) VALUES (?,?,?,?,?,1)",
            params![db::new_uuid(), id, name, p_start.to_string(), p_end.to_string()],
        )?;
    }

    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer el curso académico recién creado"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Curso académico no encontrado."))?;
    let merged = merge_object(&current, &body);
    let label = merged.get("label").and_then(Value::as_str).unwrap_or_default();
    let start_date = merged.get("startDate").and_then(Value::as_str).unwrap_or_default();
    let end_date = merged.get("endDate").and_then(Value::as_str).unwrap_or_default();
    let holidays = merged.get("holidays").cloned().unwrap_or_else(|| json!([]));
    let periods = merged.get("periods").cloned().unwrap_or_else(|| json!([]));

    conn.execute(
        "UPDATE academic_years SET label = ?, start_date = ?, end_date = ?, holidays = ?, periods = ?, updated_at = ? WHERE id = ?",
        params![
            label, start_date, end_date,
            serde_json::to_string(&holidays).map_err(ApiError::internal)?,
            serde_json::to_string(&periods).map_err(ApiError::internal)?,
            db::now_iso(), id,
        ],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer el curso académico tras actualizar"))
}

// Desactiva cualquier otro curso marcado como actual y activa este --
// secuencial (sin envolver en una transacción explícita: proceso único, sin
// escrituras concurrentes que puedan intercalarse) para que en ningún
// momento haya dos filas con is_current a la vez, que es lo que protege el
// índice único parcial del baseline.
pub fn activate(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM academic_years WHERE id = ?)",
        params![id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(ApiError::not_found("Curso académico no encontrado."));
    }
    let now = db::now_iso();
    conn.execute(
        "UPDATE academic_years SET is_current = 0, updated_at = ? WHERE is_current = 1 AND id != ?",
        params![now, id],
    )?;
    conn.execute(
        "UPDATE academic_years SET is_current = 1, updated_at = ? WHERE id = ?",
        params![db::now_iso(), id],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer el curso académico tras activarlo"))
}

// Borra classes explícitamente ANTES que academic_years -- mismo motivo que
// el backend web: si no, la cascada directa academic_years->evaluation_
// periods puede toparse con categories/assignments que classes todavía no
// ha liberado (RESTRICT). Ver comentario largo en services/academic_years.py.
pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    conn.execute("DELETE FROM classes WHERE academic_year_id = ?", params![id])?;
    let changed = conn.execute("DELETE FROM academic_years WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Curso académico no encontrado."));
    }
    Ok(Value::Null)
}

fn period_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "academicYearId": row.get::<_, String>(1)?,
        "name": row.get::<_, String>(2)?,
        "startDate": row.get::<_, String>(3)?,
        "endDate": row.get::<_, String>(4)?,
        "weight": row.get::<_, f64>(5)?,
    }))
}

fn get_period(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {PERIOD_COLUMNS} FROM evaluation_periods WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], period_row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list_periods(conn: &Connection, year_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {PERIOD_COLUMNS} FROM evaluation_periods WHERE academic_year_id = ? ORDER BY start_date"))?;
    let rows = stmt.query_map(params![year_id], period_row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create_period(conn: &Connection, year_id: &str, body: Value) -> Result<Value, ApiError> {
    let name = body.get("name").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("name es obligatorio"))?;
    let start_date = body.get("startDate").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("startDate es obligatoria"))?;
    let end_date = body.get("endDate").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("endDate es obligatoria"))?;
    let weight = body.get("weight").and_then(Value::as_f64).unwrap_or(1.0);

    let id = db::new_uuid();
    conn.execute(
        "INSERT INTO evaluation_periods (id, academic_year_id, name, start_date, end_date, weight) VALUES (?,?,?,?,?,?)",
        params![id, year_id, name, start_date, end_date, weight],
    )?;
    get_period(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer el período recién creado"))
}

pub fn update_period(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_period(conn, id)?.ok_or_else(|| ApiError::not_found("Período de evaluación no encontrado."))?;
    let merged = merge_object(&current, &body);
    let name = merged.get("name").and_then(Value::as_str).unwrap_or_default();
    let start_date = merged.get("startDate").and_then(Value::as_str).unwrap_or_default();
    let end_date = merged.get("endDate").and_then(Value::as_str).unwrap_or_default();
    let weight = merged.get("weight").and_then(Value::as_f64).unwrap_or(1.0);

    conn.execute(
        "UPDATE evaluation_periods SET name = ?, start_date = ?, end_date = ?, weight = ? WHERE id = ?",
        params![name, start_date, end_date, weight, id],
    )?;
    get_period(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer el período tras actualizar"))
}

pub fn delete_period(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn
        .execute("DELETE FROM evaluation_periods WHERE id = ?", params![id])
        .map_err(|e| error::conflict_or_internal(e, "No se puede borrar: hay categorías o tareas evaluables que usan este período."))?;
    if changed == 0 {
        return Err(ApiError::not_found("Período de evaluación no encontrado."));
    }
    Ok(Value::Null)
}

fn yc_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "academicYearId": row.get::<_, String>(1)?,
        "courseId": row.get::<_, String>(2)?,
        "createdAt": row.get::<_, String>(3)?,
    }))
}

pub fn list_year_courses(conn: &Connection, year_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {YC_COLUMNS} FROM academic_year_courses WHERE academic_year_id = ?"))?;
    let rows = stmt.query_map(params![year_id], yc_row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create_year_course(conn: &Connection, year_id: &str, body: Value) -> Result<Value, ApiError> {
    let course_id = body.get("courseId").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("courseId es obligatorio"))?;
    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO academic_year_courses (id, academic_year_id, course_id, created_at) VALUES (?,?,?,?)",
        params![id, year_id, course_id, now],
    ).map_err(|e| error::unique_or_fk_or_internal(
        e,
        "Esta materia ya está añadida a este curso académico.",
        "Curso académico o materia no encontrados.",
    ))?;

    let mut stmt = conn.prepare(&format!("SELECT {YC_COLUMNS} FROM academic_year_courses WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], yc_row_to_json)?;
    match rows.next() {
        Some(row) => Ok(row?),
        None => Err(ApiError::internal("no se pudo releer el enlace recién creado")),
    }
}

// Sin FK compuesta que impida el borrado mientras existan classes de esa
// (year, course) -- relación declarativa, el bloqueo se hace aquí a nivel
// de aplicación, igual que en services/academic_years.py.
pub fn delete_year_course(conn: &Connection, year_id: &str, course_id: &str) -> Result<Value, ApiError> {
    let blocked: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM classes WHERE academic_year_id = ? AND course_id = ?)",
        params![year_id, course_id],
        |row| row.get(0),
    )?;
    if blocked {
        return Err(ApiError {
            status: 409,
            detail: "No se puede quitar: hay grupos (clases) de esta materia en este curso académico. Bórralos o reasígnalos primero.".to_string(),
        });
    }
    let changed = conn.execute(
        "DELETE FROM academic_year_courses WHERE academic_year_id = ? AND course_id = ?",
        params![year_id, course_id],
    )?;
    if changed == 0 {
        return Err(ApiError::not_found("Esta materia no está añadida a este curso académico."));
    }
    Ok(Value::Null)
}
