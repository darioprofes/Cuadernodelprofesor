use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::{self, ApiError};

use super::merge_object;

const COLUMNS: &str = "id, level, subject, type, peso_criterios_manual, created_at, updated_at";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "level": row.get::<_, String>(1)?,
        "subject": row.get::<_, String>(2)?,
        "type": row.get::<_, String>(3)?,
        "pesoCriteriosManual": row.get::<_, bool>(4)?,
        "createdAt": row.get::<_, String>(5)?,
        "updatedAt": row.get::<_, String>(6)?,
    }))
}

pub fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM courses WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM courses ORDER BY level, subject"))?;
    let rows = stmt.query_map([], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let level = body.get("level").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("level es obligatorio"))?;
    let subject = body.get("subject").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("subject es obligatoria"))?;
    let course_type = body.get("type").and_then(Value::as_str).unwrap_or("academic");
    let peso_manual = body.get("pesoCriteriosManual").and_then(Value::as_bool).unwrap_or(false);

    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO courses (id, level, subject, type, peso_criterios_manual, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
        params![id, level, subject, course_type, peso_manual, now.clone(), now],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer el curso recién creado"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Curso no encontrado."))?;
    let merged = merge_object(&current, &body);
    let level = merged.get("level").and_then(Value::as_str).unwrap_or_default();
    let subject = merged.get("subject").and_then(Value::as_str).unwrap_or_default();
    let course_type = merged.get("type").and_then(Value::as_str).unwrap_or("academic");
    let peso_manual = merged.get("pesoCriteriosManual").and_then(Value::as_bool).unwrap_or(false);

    conn.execute(
        "UPDATE courses SET level = ?, subject = ?, type = ?, peso_criterios_manual = ?, updated_at = ? WHERE id = ?",
        params![level, subject, course_type, peso_manual, db::now_iso(), id],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer el curso tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn
        .execute("DELETE FROM courses WHERE id = ?", params![id])
        .map_err(|e| error::conflict_or_internal(e, "No se puede borrar: hay clases que usan este curso."))?;
    if changed == 0 {
        return Err(ApiError::not_found("Curso no encontrado."));
    }
    Ok(Value::Null)
}
