use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, class_id, category_id, evaluation_period_id, evaluation_tool_id, \
    programming_unit_id, name, date, evaluation_method, linked_criteria, \
    recovers_assignment_ids, peso_en_categoria, importancia, importancia_personalizada, \
    created_at, updated_at";

fn json_array(raw: &str) -> Value {
    serde_json::from_str::<Value>(raw).unwrap_or_else(|_| json!([]))
}

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let linked_criteria: String = row.get(9)?;
    let recovers_ids: String = row.get(10)?;
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "classId": row.get::<_, String>(1)?,
        "categoryId": row.get::<_, String>(2)?,
        "evaluationPeriodId": row.get::<_, String>(3)?,
        "evaluationToolId": row.get::<_, Option<String>>(4)?,
        "programmingUnitId": row.get::<_, Option<String>>(5)?,
        "name": row.get::<_, String>(6)?,
        "date": row.get::<_, Option<String>>(7)?,
        "evaluationMethod": row.get::<_, String>(8)?,
        "linkedCriteria": json_array(&linked_criteria),
        "recoversAssignmentIds": json_array(&recovers_ids),
        "pesoEnCategoria": row.get::<_, Option<f64>>(11)?,
        "importancia": row.get::<_, Option<String>>(12)?,
        "importanciaPersonalizada": row.get::<_, Option<f64>>(13)?,
        "createdAt": row.get::<_, String>(14)?,
        "updatedAt": row.get::<_, String>(15)?,
    }))
}

pub fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM assignments WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection, class_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM assignments WHERE class_id = ? ORDER BY date IS NULL, date, name"
    ))?;
    let rows = stmt.query_map(params![class_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

pub fn create(conn: &Connection, class_id: &str, body: Value) -> Result<Value, ApiError> {
    let category_id = body.get("categoryId").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("categoryId es obligatorio"))?;
    let evaluation_period_id = body.get("evaluationPeriodId").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("evaluationPeriodId es obligatorio"))?;
    let evaluation_tool_id = body.get("evaluationToolId").and_then(Value::as_str);
    let programming_unit_id = body.get("programmingUnitId").and_then(Value::as_str);
    let name = body.get("name").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("name es obligatorio"))?;
    let date = body.get("date").and_then(Value::as_str);
    let evaluation_method = body.get("evaluationMethod").and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("evaluationMethod es obligatorio"))?;
    let linked_criteria = body.get("linkedCriteria").cloned().unwrap_or_else(|| json!([]));
    let recovers_ids = body.get("recoversAssignmentIds").cloned().unwrap_or_else(|| json!([]));
    let peso_en_categoria = body.get("pesoEnCategoria").and_then(Value::as_f64);
    let importancia = body.get("importancia").and_then(Value::as_str);
    let importancia_personalizada = body.get("importanciaPersonalizada").and_then(Value::as_f64);

    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO assignments (id, class_id, category_id, evaluation_period_id, evaluation_tool_id, programming_unit_id, name, date, evaluation_method, linked_criteria, recovers_assignment_ids, peso_en_categoria, importancia, importancia_personalizada, created_at, updated_at) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        params![
            id, class_id, category_id, evaluation_period_id, evaluation_tool_id, programming_unit_id,
            name, date, evaluation_method,
            serde_json::to_string(&linked_criteria).map_err(ApiError::internal)?,
            serde_json::to_string(&recovers_ids).map_err(ApiError::internal)?,
            peso_en_categoria, importancia, importancia_personalizada, now.clone(), now,
        ],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer la tarea evaluable recién creada"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Tarea evaluable no encontrada."))?;
    let merged = merge_object(&current, &body);
    let category_id = merged.get("categoryId").and_then(Value::as_str).unwrap_or_default();
    let evaluation_period_id = merged.get("evaluationPeriodId").and_then(Value::as_str).unwrap_or_default();
    let evaluation_tool_id = merged.get("evaluationToolId").and_then(Value::as_str);
    let programming_unit_id = merged.get("programmingUnitId").and_then(Value::as_str);
    let name = merged.get("name").and_then(Value::as_str).unwrap_or_default();
    let date = merged.get("date").and_then(Value::as_str);
    let evaluation_method = merged.get("evaluationMethod").and_then(Value::as_str).unwrap_or_default();
    let linked_criteria = merged.get("linkedCriteria").cloned().unwrap_or_else(|| json!([]));
    let recovers_ids = merged.get("recoversAssignmentIds").cloned().unwrap_or_else(|| json!([]));
    let peso_en_categoria = merged.get("pesoEnCategoria").and_then(Value::as_f64);
    let importancia = merged.get("importancia").and_then(Value::as_str);
    let importancia_personalizada = merged.get("importanciaPersonalizada").and_then(Value::as_f64);

    conn.execute(
        "UPDATE assignments SET category_id = ?, evaluation_period_id = ?, evaluation_tool_id = ?, programming_unit_id = ?, name = ?, date = ?, evaluation_method = ?, linked_criteria = ?, recovers_assignment_ids = ?, peso_en_categoria = ?, importancia = ?, importancia_personalizada = ?, updated_at = ? WHERE id = ?",
        params![
            category_id, evaluation_period_id, evaluation_tool_id, programming_unit_id, name, date, evaluation_method,
            serde_json::to_string(&linked_criteria).map_err(ApiError::internal)?,
            serde_json::to_string(&recovers_ids).map_err(ApiError::internal)?,
            peso_en_categoria, importancia, importancia_personalizada, db::now_iso(), id,
        ],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer la tarea evaluable tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM assignments WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Tarea evaluable no encontrada."));
    }
    Ok(Value::Null)
}
