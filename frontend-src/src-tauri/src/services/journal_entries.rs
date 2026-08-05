use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

const COLUMNS: &str = "id, academic_year_id, class_id, date, period_index, notes";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "academicYearId": row.get::<_, String>(1)?,
        "classId": row.get::<_, String>(2)?,
        "date": row.get::<_, String>(3)?,
        "periodIndex": row.get::<_, i64>(4)?,
        "notes": row.get::<_, Option<String>>(5)?,
    }))
}

pub fn list(conn: &Connection, year_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM journal_entries WHERE academic_year_id = ? ORDER BY date, period_index"))?;
    let rows = stmt.query_map(params![year_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

// Upsert por (class_id, date, period_index) -- mismo UNIQUE que la tabla,
// así que guardar una anotación en una franja que ya tenía una la
// actualiza en vez de duplicarla, igual que el backend web.
pub fn create(conn: &Connection, year_id: &str, body: Value) -> Result<Value, ApiError> {
    let class_id = body.get("classId").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("classId es obligatorio"))?;
    let date = body.get("date").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("date es obligatoria"))?;
    let period_index = body.get("periodIndex").and_then(Value::as_i64)
        .ok_or_else(|| ApiError::bad_request("periodIndex es obligatorio"))?;
    let notes = body.get("notes").and_then(Value::as_str);

    let id = db::new_uuid();
    conn.execute(
        "INSERT INTO journal_entries (id, academic_year_id, class_id, date, period_index, notes) VALUES (?,?,?,?,?,?) \
         ON CONFLICT (class_id, date, period_index) DO UPDATE SET notes = excluded.notes",
        params![id, year_id, class_id, date, period_index, notes],
    )?;

    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM journal_entries WHERE class_id = ? AND date = ? AND period_index = ?"))?;
    let mut rows = stmt.query_map(params![class_id, date, period_index], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(row?),
        None => Err(ApiError::internal("no se pudo releer la anotación tras guardarla")),
    }
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let notes = body.get("notes").and_then(Value::as_str);
    let changed = conn.execute("UPDATE journal_entries SET notes = ? WHERE id = ?", params![notes, id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Anotación no encontrada."));
    }
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM journal_entries WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(row?),
        None => Err(ApiError::internal("no se pudo releer la anotación tras actualizar")),
    }
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM journal_entries WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Anotación no encontrada."));
    }
    Ok(Value::Null)
}
