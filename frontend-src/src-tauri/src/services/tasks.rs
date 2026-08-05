use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, academic_year_id, texto, hecho, fecha_inicio, fecha_fin";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "academicYearId": row.get::<_, String>(1)?,
        "texto": row.get::<_, String>(2)?,
        "hecho": row.get::<_, bool>(3)?,
        "fechaInicio": row.get::<_, Option<String>>(4)?,
        "fechaFin": row.get::<_, Option<String>>(5)?,
    }))
}

fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM tasks WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection, year_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM tasks WHERE academic_year_id = ? ORDER BY fecha_fin IS NULL, fecha_fin"))?;
    let rows = stmt.query_map(params![year_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, year_id: &str, body: Value) -> Result<Value, ApiError> {
    let texto = body.get("texto").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("texto es obligatorio"))?;
    let hecho = body.get("hecho").and_then(Value::as_bool).unwrap_or(false);
    let fecha_inicio = body.get("fechaInicio").and_then(Value::as_str);
    let fecha_fin = body.get("fechaFin").and_then(Value::as_str);

    let id = db::new_uuid();
    conn.execute(
        "INSERT INTO tasks (id, academic_year_id, texto, hecho, fecha_inicio, fecha_fin) VALUES (?,?,?,?,?,?)",
        params![id, year_id, texto, hecho, fecha_inicio, fecha_fin],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer la tarea recién creada"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Tarea no encontrada."))?;
    let merged = merge_object(&current, &body);
    let texto = merged.get("texto").and_then(Value::as_str).unwrap_or_default();
    let hecho = merged.get("hecho").and_then(Value::as_bool).unwrap_or(false);
    let fecha_inicio = merged.get("fechaInicio").and_then(Value::as_str);
    let fecha_fin = merged.get("fechaFin").and_then(Value::as_str);

    conn.execute(
        "UPDATE tasks SET texto = ?, hecho = ?, fecha_inicio = ?, fecha_fin = ? WHERE id = ?",
        params![texto, hecho, fecha_inicio, fecha_fin, id],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer la tarea tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM tasks WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Tarea no encontrada."));
    }
    Ok(Value::Null)
}
