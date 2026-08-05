use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, class_id, evaluation_period_id, name, weight, type";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "classId": row.get::<_, String>(1)?,
        "evaluationPeriodId": row.get::<_, String>(2)?,
        "name": row.get::<_, String>(3)?,
        "weight": row.get::<_, f64>(4)?,
        "type": row.get::<_, String>(5)?,
    }))
}

fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM categories WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection, class_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM categories WHERE class_id = ? ORDER BY name"))?;
    let rows = stmt.query_map(params![class_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, class_id: &str, body: Value) -> Result<Value, ApiError> {
    let evaluation_period_id = body.get("evaluationPeriodId").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("evaluationPeriodId es obligatorio"))?;
    let name = body.get("name").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("name es obligatorio"))?;
    let weight = body.get("weight").and_then(Value::as_f64)
        .ok_or_else(|| ApiError::bad_request("weight es obligatorio"))?;
    let category_type = body.get("type").and_then(Value::as_str).unwrap_or("normal");

    let id = db::new_uuid();
    conn.execute(
        "INSERT INTO categories (id, class_id, evaluation_period_id, name, weight, type) VALUES (?,?,?,?,?,?)",
        params![id, class_id, evaluation_period_id, name, weight, category_type],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer la categoría recién creada"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Categoría no encontrada."))?;
    let merged = merge_object(&current, &body);
    let evaluation_period_id = merged.get("evaluationPeriodId").and_then(Value::as_str).unwrap_or_default();
    let name = merged.get("name").and_then(Value::as_str).unwrap_or_default();
    let weight = merged.get("weight").and_then(Value::as_f64).unwrap_or_default();
    let category_type = merged.get("type").and_then(Value::as_str).unwrap_or("normal");

    conn.execute(
        "UPDATE categories SET evaluation_period_id = ?, name = ?, weight = ?, type = ? WHERE id = ?",
        params![evaluation_period_id, name, weight, category_type, id],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer la categoría tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM categories WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Categoría no encontrada."));
    }
    Ok(Value::Null)
}
