use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, academic_year_id, fecha, texto";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "academicYearId": row.get::<_, String>(1)?,
        "fecha": row.get::<_, String>(2)?,
        "texto": row.get::<_, String>(3)?,
    }))
}

fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM agenda_notes WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection, year_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM agenda_notes WHERE academic_year_id = ? ORDER BY fecha"))?;
    let rows = stmt.query_map(params![year_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, year_id: &str, body: Value) -> Result<Value, ApiError> {
    let fecha = body.get("fecha").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("fecha es obligatoria"))?;
    let texto = body.get("texto").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("texto es obligatorio"))?;

    let id = db::new_uuid();
    conn.execute(
        "INSERT INTO agenda_notes (id, academic_year_id, fecha, texto) VALUES (?,?,?,?)",
        params![id, year_id, fecha, texto],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer la anotación recién creada"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Anotación no encontrada."))?;
    let merged = merge_object(&current, &body);
    let fecha = merged.get("fecha").and_then(Value::as_str).unwrap_or_default();
    let texto = merged.get("texto").and_then(Value::as_str).unwrap_or_default();

    conn.execute(
        "UPDATE agenda_notes SET fecha = ?, texto = ? WHERE id = ?",
        params![fecha, texto, id],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer la anotación tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM agenda_notes WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Anotación no encontrada."));
    }
    Ok(Value::Null)
}
