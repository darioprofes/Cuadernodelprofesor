use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "label": row.get::<_, String>(1)?,
        "url": row.get::<_, String>(2)?,
        "icon": row.get::<_, Option<String>>(3)?,
        "sortOrder": row.get::<_, i64>(4)?,
    }))
}

const COLUMNS: &str = "id, label, url, icon, sort_order";

fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM shortcuts WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM shortcuts ORDER BY sort_order, label"))?;
    let rows = stmt.query_map([], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let label = body.get("label").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("label es obligatorio"))?;
    let url = body.get("url").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("url es obligatoria"))?;
    let icon = body.get("icon").and_then(Value::as_str);
    let sort_order = body.get("sortOrder").and_then(Value::as_i64).unwrap_or(0);

    let id = db::new_uuid();
    conn.execute(
        "INSERT INTO shortcuts (id, label, url, icon, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        params![id, label, url, icon, sort_order, db::now_iso()],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer el acceso directo recién creado"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?
        .ok_or_else(|| ApiError::not_found("Acceso directo no encontrado."))?;
    let merged = merge_object(&current, &body);

    let label = merged.get("label").and_then(Value::as_str).unwrap_or_default();
    let url = merged.get("url").and_then(Value::as_str).unwrap_or_default();
    let icon = merged.get("icon").and_then(Value::as_str);
    let sort_order = merged.get("sortOrder").and_then(Value::as_i64).unwrap_or(0);

    conn.execute(
        "UPDATE shortcuts SET label = ?, url = ?, icon = ?, sort_order = ?, updated_at = ? WHERE id = ?",
        params![label, url, icon, sort_order, db::now_iso(), id],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer el acceso directo tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM shortcuts WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Acceso directo no encontrado."));
    }
    Ok(Value::Null)
}
