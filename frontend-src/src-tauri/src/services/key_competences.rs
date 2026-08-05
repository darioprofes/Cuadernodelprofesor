use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

fn kc_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "code": row.get::<_, String>(1)?,
        "description": row.get::<_, String>(2)?,
    }))
}

fn descriptor_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "keyCompetenceId": row.get::<_, String>(1)?,
        "code": row.get::<_, String>(2)?,
        "description": row.get::<_, String>(3)?,
        "stage": row.get::<_, Option<String>>(4)?,
    }))
}

fn fetch_descriptors(conn: &Connection, key_competence_id: &str) -> Result<Vec<Value>, ApiError> {
    let mut stmt = conn.prepare(
        "SELECT id, key_competence_id, code, description, stage FROM operational_descriptors WHERE key_competence_id = ? ORDER BY code",
    )?;
    let rows = stmt.query_map(params![key_competence_id], descriptor_row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(items?)
}

pub fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare("SELECT id, code, description FROM key_competences WHERE id = ?")?;
    let mut rows = stmt.query_map(params![id], kc_row_to_json)?;
    match rows.next() {
        Some(row) => {
            let mut kc = row?;
            kc["descriptors"] = Value::Array(fetch_descriptors(conn, id)?);
            Ok(Some(kc))
        }
        None => Ok(None),
    }
}

pub fn list(conn: &Connection) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare("SELECT id, code, description FROM key_competences ORDER BY code")?;
    let rows = stmt.query_map([], kc_row_to_json)?;
    let mut result = Vec::new();
    for row in rows {
        let mut kc = row?;
        let id = kc["id"].as_str().unwrap().to_string();
        kc["descriptors"] = Value::Array(fetch_descriptors(conn, &id)?);
        result.push(kc);
    }
    Ok(Value::Array(result))
}

pub fn create(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let code = body.get("code").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("code es obligatorio"))?;
    let description = body.get("description").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("description es obligatoria"))?;

    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO key_competences (id, code, description, created_at, updated_at) VALUES (?,?,?,?,?)",
        params![id, code, description, now.clone(), now],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer la competencia clave recién creada"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Competencia clave no encontrada."))?;
    let merged = merge_object(&current, &body);
    let code = merged.get("code").and_then(Value::as_str).unwrap_or_default();
    let description = merged.get("description").and_then(Value::as_str).unwrap_or_default();

    conn.execute(
        "UPDATE key_competences SET code = ?, description = ?, updated_at = ? WHERE id = ?",
        params![code, description, db::now_iso(), id],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer la competencia clave tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM key_competences WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Competencia clave no encontrada."));
    }
    Ok(Value::Null)
}

fn get_descriptor(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(
        "SELECT id, key_competence_id, code, description, stage FROM operational_descriptors WHERE id = ?",
    )?;
    let mut rows = stmt.query_map(params![id], descriptor_row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn create_descriptor(conn: &Connection, key_competence_id: &str, body: Value) -> Result<Value, ApiError> {
    let code = body.get("code").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("code es obligatorio"))?;
    let description = body.get("description").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("description es obligatoria"))?;
    let stage = body.get("stage").and_then(Value::as_str);

    let id = db::new_uuid();
    conn.execute(
        "INSERT INTO operational_descriptors (id, key_competence_id, code, description, stage) VALUES (?,?,?,?,?)",
        params![id, key_competence_id, code, description, stage],
    )?;
    get_descriptor(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer el descriptor recién creado"))
}

pub fn update_descriptor(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_descriptor(conn, id)?.ok_or_else(|| ApiError::not_found("Descriptor no encontrado."))?;
    let merged = merge_object(&current, &body);
    let code = merged.get("code").and_then(Value::as_str).unwrap_or_default();
    let description = merged.get("description").and_then(Value::as_str).unwrap_or_default();
    let stage = merged.get("stage").and_then(Value::as_str);

    conn.execute(
        "UPDATE operational_descriptors SET code = ?, description = ?, stage = ? WHERE id = ?",
        params![code, description, stage, id],
    )?;
    get_descriptor(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer el descriptor tras actualizar"))
}

pub fn delete_descriptor(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM operational_descriptors WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Descriptor no encontrado."));
    }
    Ok(Value::Null)
}
