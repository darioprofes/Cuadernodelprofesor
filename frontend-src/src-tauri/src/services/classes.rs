use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, academic_year_id, course_id, grupo, schedule, skipped_days, icono, \
    color_acento, mesa_profesor_x, mesa_profesor_y, created_at, updated_at, caracteristicas_grupo";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let schedule: String = row.get(4)?;
    let skipped_days: String = row.get(5)?;
    let caracteristicas_grupo: String = row.get(12)?;
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "academicYearId": row.get::<_, String>(1)?,
        "courseId": row.get::<_, String>(2)?,
        "grupo": row.get::<_, Option<String>>(3)?,
        "schedule": serde_json::from_str::<Value>(&schedule).unwrap_or_else(|_| json!([])),
        "skippedDays": serde_json::from_str::<Value>(&skipped_days).unwrap_or_else(|_| json!([])),
        "icono": row.get::<_, Option<String>>(6)?,
        "colorAcento": row.get::<_, Option<i64>>(7)?,
        "mesaProfesorX": row.get::<_, Option<f64>>(8)?,
        "mesaProfesorY": row.get::<_, Option<f64>>(9)?,
        "createdAt": row.get::<_, String>(10)?,
        "updatedAt": row.get::<_, String>(11)?,
        "caracteristicasGrupo": serde_json::from_str::<Value>(&caracteristicas_grupo).unwrap_or_else(|_| json!([])),
    }))
}

pub fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM classes WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection, year_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM classes WHERE academic_year_id = ? ORDER BY created_at"))?;
    let rows = stmt.query_map(params![year_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, year_id: &str, body: Value) -> Result<Value, ApiError> {
    let course_id = body.get("courseId").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("courseId es obligatorio"))?;
    let grupo = body.get("grupo").and_then(Value::as_str);
    let schedule = body.get("schedule").cloned().unwrap_or_else(|| json!([]));
    let skipped_days = body.get("skippedDays").cloned().unwrap_or_else(|| json!([]));
    let icono = body.get("icono").and_then(Value::as_str);
    let color_acento = body.get("colorAcento").and_then(Value::as_i64);
    let mesa_x = body.get("mesaProfesorX").and_then(Value::as_f64);
    let mesa_y = body.get("mesaProfesorY").and_then(Value::as_f64);
    let caracteristicas_grupo = body.get("caracteristicasGrupo").cloned().unwrap_or_else(|| json!([]));

    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO classes (id, academic_year_id, course_id, grupo, schedule, skipped_days, icono, color_acento, mesa_profesor_x, mesa_profesor_y, created_at, updated_at, caracteristicas_grupo) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        params![
            id, year_id, course_id, grupo,
            serde_json::to_string(&schedule).map_err(ApiError::internal)?,
            serde_json::to_string(&skipped_days).map_err(ApiError::internal)?,
            icono, color_acento, mesa_x, mesa_y, now.clone(), now,
            serde_json::to_string(&caracteristicas_grupo).map_err(ApiError::internal)?,
        ],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer la clase recién creada"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Clase no encontrada."))?;
    let merged = merge_object(&current, &body);
    let course_id = merged.get("courseId").and_then(Value::as_str).unwrap_or_default();
    let grupo = merged.get("grupo").and_then(Value::as_str);
    let schedule = merged.get("schedule").cloned().unwrap_or_else(|| json!([]));
    let skipped_days = merged.get("skippedDays").cloned().unwrap_or_else(|| json!([]));
    let icono = merged.get("icono").and_then(Value::as_str);
    let color_acento = merged.get("colorAcento").and_then(Value::as_i64);
    let mesa_x = merged.get("mesaProfesorX").and_then(Value::as_f64);
    let mesa_y = merged.get("mesaProfesorY").and_then(Value::as_f64);
    let caracteristicas_grupo = merged.get("caracteristicasGrupo").cloned().unwrap_or_else(|| json!([]));

    conn.execute(
        "UPDATE classes SET course_id = ?, grupo = ?, schedule = ?, skipped_days = ?, icono = ?, color_acento = ?, mesa_profesor_x = ?, mesa_profesor_y = ?, updated_at = ?, caracteristicas_grupo = ? WHERE id = ?",
        params![
            course_id, grupo,
            serde_json::to_string(&schedule).map_err(ApiError::internal)?,
            serde_json::to_string(&skipped_days).map_err(ApiError::internal)?,
            icono, color_acento, mesa_x, mesa_y, db::now_iso(),
            serde_json::to_string(&caracteristicas_grupo).map_err(ApiError::internal)?,
            id,
        ],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer la clase tras actualizar"))
}

// CASCADE sin más (enrollments/categories/assignments/grades vía class_id)
// -- el único ForeignKeyViolation real posible en esta tabla es al borrar
// el CURSO (courses, RESTRICT), no al borrar la clase.
pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM classes WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Clase no encontrada."));
    }
    Ok(Value::Null)
}
