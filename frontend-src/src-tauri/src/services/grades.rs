use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let tool_results: Option<String> = row.get(4)?;
    Ok(json!({
        "enrollmentId": row.get::<_, String>(0)?,
        "assignmentId": row.get::<_, String>(1)?,
        "directScore": row.get::<_, Option<f64>>(2)?,
        "recoveryScore": row.get::<_, Option<f64>>(3)?,
        "toolResults": tool_results.and_then(|s| serde_json::from_str::<Value>(&s).ok()),
        "updatedAt": row.get::<_, String>(5)?,
    }))
}

// Lectura en bloque para cargar el cuaderno de una clase entera -- JOIN a
// assignments porque grades no tiene class_id propia (una nota siempre se
// llega a través de su tarea), mismo criterio que el backend web.
pub fn list_for_class(conn: &Connection, class_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(
        "SELECT g.enrollment_id, g.assignment_id, g.direct_score, g.recovery_score, g.tool_results, g.updated_at \
         FROM grades g JOIN assignments a ON a.id = g.assignment_id WHERE a.class_id = ?",
    )?;
    let rows = stmt.query_map(params![class_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

// Sin control de concurrencia (última escritura gana, a propósito -- ver
// plan, sección GRADE). Upsert simple sobre la PK compuesta.
pub fn put(conn: &Connection, assignment_id: &str, enrollment_id: &str, body: Value) -> Result<Value, ApiError> {
    let direct_score = body.get("directScore").and_then(Value::as_f64);
    let recovery_score = body.get("recoveryScore").and_then(Value::as_f64);
    let tool_results = body.get("toolResults").filter(|v| !v.is_null());
    let tool_results_str = tool_results
        .map(serde_json::to_string)
        .transpose()
        .map_err(ApiError::internal)?;

    conn.execute(
        "INSERT INTO grades (enrollment_id, assignment_id, direct_score, recovery_score, tool_results, updated_at) \
         VALUES (?,?,?,?,?,?) \
         ON CONFLICT (enrollment_id, assignment_id) DO UPDATE SET \
            direct_score = excluded.direct_score, \
            recovery_score = excluded.recovery_score, \
            tool_results = excluded.tool_results, \
            updated_at = excluded.updated_at",
        params![enrollment_id, assignment_id, direct_score, recovery_score, tool_results_str, db::now_iso()],
    ).map_err(|e| {
        // FOREIGN KEY: la tarea o la matrícula no existen -- mismo criterio
        // que ForeignKeyViolation -> 404 en el backend web.
        if let rusqlite::Error::SqliteFailure(sqlite_err, _) = &e {
            if sqlite_err.code == rusqlite::ErrorCode::ConstraintViolation {
                return ApiError::not_found("La tarea evaluable o la matrícula no existen.");
            }
        }
        ApiError::internal(e)
    })?;

    let mut stmt = conn.prepare(
        "SELECT enrollment_id, assignment_id, direct_score, recovery_score, tool_results, updated_at FROM grades WHERE enrollment_id = ? AND assignment_id = ?",
    )?;
    let mut rows = stmt.query_map(params![enrollment_id, assignment_id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(row?),
        None => Err(ApiError::internal("no se pudo releer la nota tras guardarla")),
    }
}

pub fn delete(conn: &Connection, assignment_id: &str, enrollment_id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute(
        "DELETE FROM grades WHERE assignment_id = ? AND enrollment_id = ?",
        params![assignment_id, enrollment_id],
    )?;
    if changed == 0 {
        return Err(ApiError::not_found("Nota no encontrada."));
    }
    Ok(Value::Null)
}
