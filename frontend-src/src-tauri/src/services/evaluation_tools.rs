use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, type, name, course_id, levels, items";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let levels: String = row.get(4)?;
    let items: String = row.get(5)?;
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "type": row.get::<_, String>(1)?,
        "name": row.get::<_, String>(2)?,
        "courseId": row.get::<_, Option<String>>(3)?,
        "levels": serde_json::from_str::<Value>(&levels).unwrap_or_else(|_| json!([])),
        "items": serde_json::from_str::<Value>(&items).unwrap_or_else(|_| json!([])),
    }))
}

fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM evaluation_tools WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM evaluation_tools ORDER BY name"))?;
    let rows = stmt.query_map([], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let tool_type = body.get("type").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("type es obligatorio"))?;
    let name = body.get("name").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("name es obligatorio"))?;
    let course_id = body.get("courseId").and_then(Value::as_str);
    let levels = body.get("levels").cloned().unwrap_or_else(|| json!([]));
    let items = body.get("items").cloned().unwrap_or_else(|| json!([]));

    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO evaluation_tools (id, type, name, course_id, levels, items, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            id, tool_type, name, course_id,
            serde_json::to_string(&levels).map_err(ApiError::internal)?,
            serde_json::to_string(&items).map_err(ApiError::internal)?,
            now.clone(), now,
        ],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer el instrumento recién creado"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?
        .ok_or_else(|| ApiError::not_found("Instrumento de evaluación no encontrado."))?;
    let merged = merge_object(&current, &body);

    let tool_type = merged.get("type").and_then(Value::as_str).unwrap_or_default();
    let name = merged.get("name").and_then(Value::as_str).unwrap_or_default();
    let course_id = merged.get("courseId").and_then(Value::as_str);
    let levels = merged.get("levels").cloned().unwrap_or_else(|| json!([]));
    let items = merged.get("items").cloned().unwrap_or_else(|| json!([]));

    conn.execute(
        "UPDATE evaluation_tools SET type = ?, name = ?, course_id = ?, levels = ?, items = ?, updated_at = ? WHERE id = ?",
        params![
            tool_type, name, course_id,
            serde_json::to_string(&levels).map_err(ApiError::internal)?,
            serde_json::to_string(&items).map_err(ApiError::internal)?,
            db::now_iso(), id,
        ],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer el instrumento tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM evaluation_tools WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Instrumento de evaluación no encontrado."));
    }
    Ok(Value::Null)
}
