use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, course_id, name, sessions, start_date, session_details, \
    linked_criteria_ids, linked_basic_knowledge_ids, created_at, updated_at";

fn id_array_to_json(raw: &str) -> Value {
    serde_json::from_str::<Value>(raw).unwrap_or_else(|_| json!([]))
}

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let session_details: String = row.get(5)?;
    let linked_criteria_ids: String = row.get(6)?;
    let linked_basic_knowledge_ids: String = row.get(7)?;
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "courseId": row.get::<_, String>(1)?,
        "name": row.get::<_, String>(2)?,
        "sessions": row.get::<_, i64>(3)?,
        "startDate": row.get::<_, Option<String>>(4)?,
        "sessionDetails": id_array_to_json(&session_details),
        "linkedCriteriaIds": id_array_to_json(&linked_criteria_ids),
        "linkedBasicKnowledgeIds": id_array_to_json(&linked_basic_knowledge_ids),
        "createdAt": row.get::<_, String>(8)?,
        "updatedAt": row.get::<_, String>(9)?,
    }))
}

fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM programming_units WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection, course_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM programming_units WHERE course_id = ? ORDER BY start_date IS NULL, start_date, name"
    ))?;
    let rows = stmt.query_map(params![course_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, course_id: &str, body: Value) -> Result<Value, ApiError> {
    let name = body.get("name").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("name es obligatorio"))?;
    let sessions = body.get("sessions").and_then(Value::as_i64).unwrap_or(0);
    let start_date = body.get("startDate").and_then(Value::as_str);
    let session_details = body.get("sessionDetails").cloned().unwrap_or_else(|| json!([]));
    let linked_criteria = body.get("linkedCriteriaIds").cloned().unwrap_or_else(|| json!([]));
    let linked_knowledge = body.get("linkedBasicKnowledgeIds").cloned().unwrap_or_else(|| json!([]));

    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO programming_units (id, course_id, name, sessions, start_date, session_details, linked_criteria_ids, linked_basic_knowledge_ids, created_at, updated_at) \
         VALUES (?,?,?,?,?,?,?,?,?,?)",
        params![
            id, course_id, name, sessions, start_date,
            serde_json::to_string(&session_details).map_err(ApiError::internal)?,
            serde_json::to_string(&linked_criteria).map_err(ApiError::internal)?,
            serde_json::to_string(&linked_knowledge).map_err(ApiError::internal)?,
            now.clone(), now,
        ],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer la unidad de programación recién creada"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Unidad de programación no encontrada."))?;
    let merged = merge_object(&current, &body);
    let name = merged.get("name").and_then(Value::as_str).unwrap_or_default();
    let sessions = merged.get("sessions").and_then(Value::as_i64).unwrap_or(0);
    let start_date = merged.get("startDate").and_then(Value::as_str);
    let session_details = merged.get("sessionDetails").cloned().unwrap_or_else(|| json!([]));
    let linked_criteria = merged.get("linkedCriteriaIds").cloned().unwrap_or_else(|| json!([]));
    let linked_knowledge = merged.get("linkedBasicKnowledgeIds").cloned().unwrap_or_else(|| json!([]));

    conn.execute(
        "UPDATE programming_units SET name = ?, sessions = ?, start_date = ?, session_details = ?, linked_criteria_ids = ?, linked_basic_knowledge_ids = ?, updated_at = ? WHERE id = ?",
        params![
            name, sessions, start_date,
            serde_json::to_string(&session_details).map_err(ApiError::internal)?,
            serde_json::to_string(&linked_criteria).map_err(ApiError::internal)?,
            serde_json::to_string(&linked_knowledge).map_err(ApiError::internal)?,
            db::now_iso(), id,
        ],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer la unidad de programación tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM programming_units WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Unidad de programación no encontrada."));
    }
    Ok(Value::Null)
}
