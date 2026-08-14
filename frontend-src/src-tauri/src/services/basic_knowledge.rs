use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, course_id, code, description, block_name";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "courseId": row.get::<_, String>(1)?,
        "code": row.get::<_, String>(2)?,
        "description": row.get::<_, String>(3)?,
        "blockName": row.get::<_, Option<String>>(4)?,
    }))
}

fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM basic_knowledge WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection, course_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM basic_knowledge WHERE course_id = ? ORDER BY code"))?;
    let rows = stmt.query_map(params![course_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, course_id: &str, body: Value) -> Result<Value, ApiError> {
    let code = body.get("code").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("code es obligatorio"))?;
    let description = body.get("description").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("description es obligatoria"))?;
    let block_name = body.get("blockName").and_then(Value::as_str);

    let id = db::new_uuid();
    conn.execute(
        "INSERT INTO basic_knowledge (id, course_id, code, description, block_name) VALUES (?,?,?,?,?)",
        params![id, course_id, code, description, block_name],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer el saber básico recién creado"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Conocimiento básico no encontrado."))?;
    let merged = merge_object(&current, &body);
    let code = merged.get("code").and_then(Value::as_str).unwrap_or_default();
    let description = merged.get("description").and_then(Value::as_str).unwrap_or_default();
    let block_name = merged.get("blockName").and_then(Value::as_str);

    conn.execute(
        "UPDATE basic_knowledge SET code = ?, description = ?, block_name = ? WHERE id = ?",
        params![code, description, block_name, id],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer el saber básico tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM basic_knowledge WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Conocimiento básico no encontrado."));
    }
    Ok(Value::Null)
}
