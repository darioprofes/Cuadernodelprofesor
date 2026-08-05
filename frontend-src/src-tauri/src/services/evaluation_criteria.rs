use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, course_id, competence_id, code, description, weight, exclude_from_weighting";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "courseId": row.get::<_, String>(1)?,
        "competenceId": row.get::<_, String>(2)?,
        "code": row.get::<_, String>(3)?,
        "description": row.get::<_, String>(4)?,
        "weight": row.get::<_, Option<f64>>(5)?,
        "excludeFromWeighting": row.get::<_, bool>(6)?,
    }))
}

pub fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM evaluation_criteria WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection, course_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM evaluation_criteria WHERE course_id = ? ORDER BY code"))?;
    let rows = stmt.query_map(params![course_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, course_id: &str, body: Value) -> Result<Value, ApiError> {
    let competence_id = body.get("competenceId").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("competenceId es obligatorio"))?;
    let code = body.get("code").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("code es obligatorio"))?;
    let description = body.get("description").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("description es obligatoria"))?;
    let weight = body.get("weight").and_then(Value::as_f64);
    let exclude = body.get("excludeFromWeighting").and_then(Value::as_bool).unwrap_or(false);

    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO evaluation_criteria (id, course_id, competence_id, code, description, weight, exclude_from_weighting, created_at, updated_at) \
         VALUES (?,?,?,?,?,?,?,?,?)",
        params![id, course_id, competence_id, code, description, weight, exclude, now.clone(), now],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer el criterio recién creado"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Criterio no encontrado."))?;
    let merged = merge_object(&current, &body);
    let competence_id = merged.get("competenceId").and_then(Value::as_str).unwrap_or_default();
    let code = merged.get("code").and_then(Value::as_str).unwrap_or_default();
    let description = merged.get("description").and_then(Value::as_str).unwrap_or_default();
    let weight = merged.get("weight").and_then(Value::as_f64);
    let exclude = merged.get("excludeFromWeighting").and_then(Value::as_bool).unwrap_or(false);

    conn.execute(
        "UPDATE evaluation_criteria SET competence_id = ?, code = ?, description = ?, weight = ?, exclude_from_weighting = ?, updated_at = ? WHERE id = ?",
        params![competence_id, code, description, weight, exclude, db::now_iso(), id],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer el criterio tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM evaluation_criteria WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Criterio no encontrado."));
    }
    Ok(Value::Null)
}
