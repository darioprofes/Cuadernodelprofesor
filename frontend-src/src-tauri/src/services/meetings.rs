use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, academic_year_id, fecha, hora, tipo, con_quien, motivo, acuerdos, seguimiento";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "academicYearId": row.get::<_, String>(1)?,
        "fecha": row.get::<_, String>(2)?,
        "hora": row.get::<_, Option<String>>(3)?,
        "tipo": row.get::<_, String>(4)?,
        "conQuien": row.get::<_, Option<String>>(5)?,
        "motivo": row.get::<_, Option<String>>(6)?,
        "acuerdos": row.get::<_, Option<String>>(7)?,
        "seguimiento": row.get::<_, Option<String>>(8)?,
    }))
}

fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM meetings WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection, year_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM meetings WHERE academic_year_id = ? ORDER BY fecha, hora"))?;
    let rows = stmt.query_map(params![year_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, year_id: &str, body: Value) -> Result<Value, ApiError> {
    let fecha = body.get("fecha").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("fecha es obligatoria"))?;
    let hora = body.get("hora").and_then(Value::as_str);
    let tipo = body.get("tipo").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("tipo es obligatorio"))?;
    let con_quien = body.get("conQuien").and_then(Value::as_str);
    let motivo = body.get("motivo").and_then(Value::as_str);
    let acuerdos = body.get("acuerdos").and_then(Value::as_str);
    let seguimiento = body.get("seguimiento").and_then(Value::as_str);

    let id = db::new_uuid();
    conn.execute(
        "INSERT INTO meetings (id, academic_year_id, fecha, hora, tipo, con_quien, motivo, acuerdos, seguimiento) VALUES (?,?,?,?,?,?,?,?,?)",
        params![id, year_id, fecha, hora, tipo, con_quien, motivo, acuerdos, seguimiento],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer la reunión recién creada"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Reunión no encontrada."))?;
    let merged = merge_object(&current, &body);
    let fecha = merged.get("fecha").and_then(Value::as_str).unwrap_or_default();
    let hora = merged.get("hora").and_then(Value::as_str);
    let tipo = merged.get("tipo").and_then(Value::as_str).unwrap_or_default();
    let con_quien = merged.get("conQuien").and_then(Value::as_str);
    let motivo = merged.get("motivo").and_then(Value::as_str);
    let acuerdos = merged.get("acuerdos").and_then(Value::as_str);
    let seguimiento = merged.get("seguimiento").and_then(Value::as_str);

    conn.execute(
        "UPDATE meetings SET fecha = ?, hora = ?, tipo = ?, con_quien = ?, motivo = ?, acuerdos = ?, seguimiento = ? WHERE id = ?",
        params![fecha, hora, tipo, con_quien, motivo, acuerdos, seguimiento, id],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer la reunión tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM meetings WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Reunión no encontrada."));
    }
    Ok(Value::Null)
}
