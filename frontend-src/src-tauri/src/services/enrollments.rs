use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, student_id, class_id, acneae, centro_procedencia, ha_repetido_curso, \
    materias_pendientes, programa_especifico, neae, neae_detalle, medidas_educativas, \
    indicaciones_pti, observaciones_tutor, plano_x, plano_y, plano_color, created_at, updated_at";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let acneae: String = row.get(3)?;
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "studentId": row.get::<_, String>(1)?,
        "classId": row.get::<_, String>(2)?,
        "acneae": serde_json::from_str::<Value>(&acneae).unwrap_or_else(|_| json!([])),
        "centroProcedencia": row.get::<_, Option<String>>(4)?,
        "haRepetidoCurso": row.get::<_, Option<bool>>(5)?,
        "materiasPendientes": row.get::<_, Option<String>>(6)?,
        "programaEspecifico": row.get::<_, Option<String>>(7)?,
        "neae": row.get::<_, Option<bool>>(8)?,
        "neaeDetalle": row.get::<_, Option<String>>(9)?,
        "medidasEducativas": row.get::<_, Option<String>>(10)?,
        "indicacionesPti": row.get::<_, Option<String>>(11)?,
        "observacionesTutor": row.get::<_, Option<String>>(12)?,
        "planoX": row.get::<_, Option<f64>>(13)?,
        "planoY": row.get::<_, Option<f64>>(14)?,
        "planoColor": row.get::<_, Option<String>>(15)?,
        "createdAt": row.get::<_, String>(16)?,
        "updatedAt": row.get::<_, String>(17)?,
    }))
}

pub fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM enrollments WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection, class_id: &str) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM enrollments WHERE class_id = ? ORDER BY created_at"))?;
    let rows = stmt.query_map(params![class_id], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

// student_id ya resuelto por el llamante (routers::dispatch): o venía como
// studentId en el body, o se creó la persona primero con students::create a
// partir de newStudent -- mismo reparto de responsabilidad que create_
// enrollment/post_enrollment en el backend web (exclusividad validada en el
// router, no aquí).
pub fn create(conn: &Connection, class_id: &str, student_id: &str, body: &Value) -> Result<Value, ApiError> {
    let acneae = body.get("acneae").cloned().unwrap_or_else(|| json!([]));
    let s = |k: &str| body.get(k).and_then(Value::as_str);
    let b = |k: &str| body.get(k).and_then(Value::as_bool);
    let f = |k: &str| body.get(k).and_then(Value::as_f64);

    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO enrollments (id, student_id, class_id, acneae, centro_procedencia, ha_repetido_curso, materias_pendientes, programa_especifico, neae, neae_detalle, medidas_educativas, indicaciones_pti, observaciones_tutor, plano_x, plano_y, plano_color, created_at, updated_at) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        params![
            id, student_id, class_id,
            serde_json::to_string(&acneae).map_err(ApiError::internal)?,
            s("centroProcedencia"), b("haRepetidoCurso"), s("materiasPendientes"), s("programaEspecifico"),
            b("neae"), s("neaeDetalle"), s("medidasEducativas"), s("indicacionesPti"), s("observacionesTutor"),
            f("planoX"), f("planoY"), s("planoColor"), now.clone(), now,
        ],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer la matrícula recién creada"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Matrícula no encontrada."))?;
    let merged = merge_object(&current, &body);
    let acneae = merged.get("acneae").cloned().unwrap_or_else(|| json!([]));
    let s = |k: &str| merged.get(k).and_then(Value::as_str);
    let b = |k: &str| merged.get(k).and_then(Value::as_bool);
    let f = |k: &str| merged.get(k).and_then(Value::as_f64);

    conn.execute(
        "UPDATE enrollments SET acneae = ?, centro_procedencia = ?, ha_repetido_curso = ?, materias_pendientes = ?, programa_especifico = ?, neae = ?, neae_detalle = ?, medidas_educativas = ?, indicaciones_pti = ?, observaciones_tutor = ?, plano_x = ?, plano_y = ?, plano_color = ?, updated_at = ? WHERE id = ?",
        params![
            serde_json::to_string(&acneae).map_err(ApiError::internal)?,
            s("centroProcedencia"), b("haRepetidoCurso"), s("materiasPendientes"), s("programaEspecifico"),
            b("neae"), s("neaeDetalle"), s("medidasEducativas"), s("indicacionesPti"), s("observacionesTutor"),
            f("planoX"), f("planoY"), s("planoColor"), db::now_iso(), id,
        ],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer la matrícula tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn.execute("DELETE FROM enrollments WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Matrícula no encontrada."));
    }
    Ok(Value::Null)
}
