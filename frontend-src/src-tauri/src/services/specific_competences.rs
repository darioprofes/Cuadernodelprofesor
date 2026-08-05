use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::{self, ApiError};

use super::merge_object;

const COLUMNS: &str = "id, course_id, code, description";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "courseId": row.get::<_, String>(1)?,
        "code": row.get::<_, String>(2)?,
        "description": row.get::<_, String>(3)?,
    }))
}

fn fetch_descriptor_ids(conn: &Connection, competence_id: &str) -> Result<Vec<Value>, ApiError> {
    let mut stmt = conn.prepare(
        "SELECT descriptor_id FROM specific_competence_descriptors WHERE specific_competence_id = ?",
    )?;
    let rows = stmt.query_map(params![competence_id], |row| row.get::<_, String>(0))?;
    let ids: Result<Vec<String>, _> = rows.collect();
    Ok(ids?.into_iter().map(Value::String).collect())
}

pub fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM specific_competences WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => {
            let mut sc = row?;
            sc["keyCompetenceDescriptorIds"] = Value::Array(fetch_descriptor_ids(conn, id)?);
            Ok(Some(sc))
        }
        None => Ok(None),
    }
}

pub fn list(conn: &Connection, course_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM specific_competences WHERE course_id = ? ORDER BY code"))?;
    let rows = stmt.query_map(params![course_id], row_to_json)?;
    let mut result = Vec::new();
    for row in rows {
        let mut sc = row?;
        let id = sc["id"].as_str().unwrap().to_string();
        sc["keyCompetenceDescriptorIds"] = Value::Array(fetch_descriptor_ids(conn, &id)?);
        result.push(sc);
    }
    Ok(Value::Array(result))
}

pub fn create(conn: &Connection, course_id: &str, body: Value) -> Result<Value, ApiError> {
    let code = body.get("code").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("code es obligatorio"))?;
    let description = body.get("description").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("description es obligatoria"))?;

    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO specific_competences (id, course_id, code, description, created_at, updated_at) VALUES (?,?,?,?,?,?)",
        params![id, course_id, code, description, now.clone(), now],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer la competencia específica recién creada"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Competencia específica no encontrada."))?;
    let merged = merge_object(&current, &body);
    let code = merged.get("code").and_then(Value::as_str).unwrap_or_default();
    let description = merged.get("description").and_then(Value::as_str).unwrap_or_default();

    conn.execute(
        "UPDATE specific_competences SET code = ?, description = ?, updated_at = ? WHERE id = ?",
        params![code, description, db::now_iso(), id],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer la competencia específica tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn
        .execute("DELETE FROM specific_competences WHERE id = ?", params![id])
        .map_err(|e| error::conflict_or_internal(e, "No se puede borrar: hay criterios de evaluación que la referencian."))?;
    if changed == 0 {
        return Err(ApiError::not_found("Competencia específica no encontrada."));
    }
    Ok(Value::Null)
}

pub fn link_descriptor(conn: &Connection, competence_id: &str, descriptor_id: &str) -> Result<Value, ApiError> {
    conn.execute(
        "INSERT OR IGNORE INTO specific_competence_descriptors (specific_competence_id, descriptor_id) VALUES (?, ?)",
        params![competence_id, descriptor_id],
    )?;
    Ok(Value::Null)
}

pub fn unlink_descriptor(conn: &Connection, competence_id: &str, descriptor_id: &str) -> Result<Value, ApiError> {
    conn.execute(
        "DELETE FROM specific_competence_descriptors WHERE specific_competence_id = ? AND descriptor_id = ?",
        params![competence_id, descriptor_id],
    )?;
    Ok(Value::Null)
}
