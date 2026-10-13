use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

const COLUMNS: &str = "id, class_id, category_id, evaluation_period_id, evaluation_tool_id, \
    programming_unit_id, name, date, evaluation_method, linked_criteria, \
    recovers_assignment_ids, peso_en_categoria, importancia, importancia_personalizada, \
    created_at, updated_at, short_name, puntuacion_maxima, assignment_group, column_order";

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
        "shortName": row.get::<_, Option<String>>(16)?,
        "puntuacionMaxima": row.get::<_, Option<f64>>(17)?,
        "assignmentGroup": row.get::<_, Option<String>>(18)?.and_then(|raw| serde_json::from_str::<Value>(&raw).ok()),
        "columnOrder": row.get::<_, Option<f64>>(19)?,
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
    let tx = conn.unchecked_transaction()?;
    let result = create_inner(&tx, class_id, body)?;
    tx.commit()?;
    Ok(result)
}

fn create_inner(conn: &Connection, class_id: &str, body: Value) -> Result<Value, ApiError> {
    validate_group(conn, class_id, None, &body)?;
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
    let short_name = body.get("shortName").and_then(Value::as_str);
    let puntuacion_maxima = body.get("puntuacionMaxima").and_then(Value::as_f64);
    let group = body.get("assignmentGroup").filter(|v| !v.is_null()).map(serde_json::to_string).transpose().map_err(ApiError::internal)?;
    let column_order = body.get("columnOrder").and_then(Value::as_f64);

    let id = db::new_uuid();
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO assignments (id, class_id, category_id, evaluation_period_id, evaluation_tool_id, programming_unit_id, name, date, evaluation_method, linked_criteria, recovers_assignment_ids, peso_en_categoria, importancia, importancia_personalizada, created_at, updated_at, short_name, puntuacion_maxima, assignment_group, column_order) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        params![
            id, class_id, category_id, evaluation_period_id, evaluation_tool_id, programming_unit_id,
            name, date, evaluation_method,
            serde_json::to_string(&linked_criteria).map_err(ApiError::internal)?,
            serde_json::to_string(&recovers_ids).map_err(ApiError::internal)?,
            peso_en_categoria, importancia, importancia_personalizada, now.clone(), now,
            short_name, puntuacion_maxima, group, column_order,
        ],
    )?;
    move_members(conn, &body, true)?;
    if let Some(group_id) = body["joinGroupId"].as_str() {
        let parent = get_one(conn, group_id)?.ok_or_else(|| ApiError::bad_request("Grupo no encontrado."))?;
        if parent["assignmentGroup"].is_null() || group.is_some() || parent["classId"].as_str() != Some(class_id) || parent["categoryId"] != body["categoryId"] || parent["evaluationPeriodId"] != body["evaluationPeriodId"] {
            return Err(ApiError::bad_request("El grupo debe pertenecer a la misma clase, categoría y evaluación."));
        }
        let mut config = parent["assignmentGroup"].clone();
        config["memberIds"].as_array_mut().ok_or_else(|| ApiError::bad_request("Lista del grupo inválida."))?.push(json!(id));
        conn.execute("UPDATE assignments SET assignment_group = ?, updated_at = ? WHERE id = ?", params![serde_json::to_string(&config).map_err(ApiError::internal)?, db::now_iso(), group_id])?;
    }
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer la tarea evaluable recién creada"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let tx = conn.unchecked_transaction()?;
    let result = update_inner(&tx, id, body)?;
    tx.commit()?;
    Ok(result)
}

fn update_inner(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Tarea evaluable no encontrada."))?;
    let merged = merge_object(&current, &body);
    let class_id = current["classId"].as_str().unwrap_or_default();
    validate_group(conn, class_id, Some(id), &merged)?;
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
    let short_name = merged.get("shortName").and_then(Value::as_str);
    let puntuacion_maxima = merged.get("puntuacionMaxima").and_then(Value::as_f64);
    let group = merged.get("assignmentGroup").filter(|v| !v.is_null()).map(serde_json::to_string).transpose().map_err(ApiError::internal)?;
    let column_order = merged.get("columnOrder").and_then(Value::as_f64);

    conn.execute(
        "UPDATE assignments SET category_id = ?, evaluation_period_id = ?, evaluation_tool_id = ?, programming_unit_id = ?, name = ?, date = ?, evaluation_method = ?, linked_criteria = ?, recovers_assignment_ids = ?, peso_en_categoria = ?, importancia = ?, importancia_personalizada = ?, updated_at = ?, short_name = ?, puntuacion_maxima = ?, assignment_group = ?, column_order = ? WHERE id = ?",
        params![
            category_id, evaluation_period_id, evaluation_tool_id, programming_unit_id, name, date, evaluation_method,
            serde_json::to_string(&linked_criteria).map_err(ApiError::internal)?,
            serde_json::to_string(&recovers_ids).map_err(ApiError::internal)?,
            peso_en_categoria, importancia, importancia_personalizada, db::now_iso(),
            short_name, puntuacion_maxima, group, column_order, id,
        ],
    )?;
    if current["assignmentGroup"].is_null() && (current["categoryId"] != merged["categoryId"] || current["evaluationPeriodId"] != merged["evaluationPeriodId"]) {
        detach_member(conn, class_id, id)?;
    }
    move_members(conn, &merged, body.get("assignmentGroup").is_some())?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer la tarea evaluable tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let tx = conn.unchecked_transaction()?;
    let result = delete_inner(&tx, id)?;
    tx.commit()?;
    Ok(result)
}

fn delete_inner(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    if let Some(current) = get_one(conn, id)? { detach_member(conn, current["classId"].as_str().unwrap_or_default(), id)?; }
    let changed = conn.execute("DELETE FROM assignments WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(ApiError::not_found("Tarea evaluable no encontrada."));
    }
    Ok(Value::Null)
}

fn validate_group(conn: &Connection, class_id: &str, id: Option<&str>, body: &Value) -> Result<(), ApiError> {
    let Some(config) = body.get("assignmentGroup").filter(|value| !value.is_null()) else { return Ok(()); };
    let ids = config["memberIds"].as_array().ok_or_else(|| ApiError::bad_request("Lista de tareas inválida."))?;
    if !matches!(config["color"].as_str(), Some("blue" | "violet" | "emerald" | "amber")) { return Err(ApiError::bad_request("Color de grupo inválido.")); }
    if let Some(weights) = config["memberWeights"].as_object() {
        if weights.iter().any(|(key, value)| !ids.iter().any(|id| id.as_str() == Some(key)) || !value.as_f64().map(|w| w.is_finite() && w > 0.0).unwrap_or(false)) {
            return Err(ApiError::bad_request("Los pesos internos deben ser positivos y corresponder a tareas del grupo."));
        }
    }
    let category_valid: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM categories WHERE id = ? AND class_id = ? AND evaluation_period_id = ? AND type != 'recovery')", params![body["categoryId"].as_str(), class_id, body["evaluationPeriodId"].as_str()], |row| row.get(0))?;
    if !category_valid { return Err(ApiError::bad_request("Un grupo debe estar en una categoría normal de la clase.")); }
    let mut seen = std::collections::HashSet::new();
    let rows = list(conn, class_id)?;
    let rows = rows.as_array().unwrap();
    for member_id in ids {
        let member_id = member_id.as_str().ok_or_else(|| ApiError::bad_request("Id de tarea inválido."))?;
        if Some(member_id) == id || !seen.insert(member_id) { return Err(ApiError::bad_request("Una tarea no puede repetirse ni incluirse a sí misma.")); }
        let member = rows.iter().find(|a| a["id"].as_str() == Some(member_id)).ok_or_else(|| ApiError::bad_request("La tarea no pertenece a esta clase."))?;
        if member["evaluationPeriodId"] != body["evaluationPeriodId"] { return Err(ApiError::bad_request("Las tareas deben ser de la misma evaluación.")); }
        if !member["assignmentGroup"].is_null() { return Err(ApiError::bad_request("No se pueden anidar grupos.")); }
        let recovery: bool = conn.query_row("SELECT type = 'recovery' FROM categories WHERE id = ?", params![member["categoryId"].as_str()], |row| row.get(0))?;
        if recovery { return Err(ApiError::bad_request("Las recuperaciones no se pueden incluir en grupos.")); }
    }
    for row in rows {
        if row["id"].as_str() == id { continue; }
        if let Some(members) = row["assignmentGroup"]["memberIds"].as_array() {
            if members.iter().any(|v| v.as_str() == id || v.as_str().map(|v| seen.contains(v)).unwrap_or(false)) {
                return Err(ApiError::bad_request("Cada tarea solo puede pertenecer a un grupo. Retírala del anterior primero."));
            }
        }
    }
    if let Some(id) = id {
        let has_grades: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM grades WHERE assignment_id = ?)", [id], |row| row.get(0))?;
        if has_grades { return Err(ApiError::bad_request("Una tarea con notas no puede convertirse en grupo.")); }
    }
    Ok(())
}

fn detach_member(conn: &Connection, class_id: &str, id: &str) -> Result<(), ApiError> {
    let rows = list(conn, class_id)?;
    for row in rows.as_array().unwrap() {
        if let Some(members) = row["assignmentGroup"]["memberIds"].as_array() {
            if members.iter().any(|v| v.as_str() == Some(id)) {
                let mut config = row["assignmentGroup"].clone();
                config["memberIds"] = json!(members.iter().filter(|v| v.as_str() != Some(id)).collect::<Vec<_>>());
                if let Some(weights) = config["memberWeights"].as_object_mut() { weights.remove(id); }
                conn.execute("UPDATE assignments SET assignment_group = ?, updated_at = ? WHERE id = ?", params![serde_json::to_string(&config).map_err(ApiError::internal)?, db::now_iso(), row["id"].as_str()])?;
            }
        }
    }
    Ok(())
}

fn move_members(conn: &Connection, body: &Value, apply_weights: bool) -> Result<(), ApiError> {
    if let Some(ids) = body["assignmentGroup"]["memberIds"].as_array() {
        for id in ids {
            let weight = if apply_weights { id.as_str().and_then(|id| body["assignmentGroup"]["memberWeights"][id].as_f64()) } else { None };
            conn.execute("UPDATE assignments SET category_id = ?, importancia_personalizada = COALESCE(?, importancia_personalizada), updated_at = ? WHERE id = ?", params![body["categoryId"].as_str(), weight, db::now_iso(), id.as_str()])?;
        }
    }
    Ok(())
}

pub fn reorder(conn: &Connection, class_id: &str, body: Value) -> Result<Value, ApiError> {
    let tx = conn.unchecked_transaction()?;
    let ids = body["ids"].as_array().ok_or_else(|| ApiError::bad_request("Orden inválido."))?;
    let rows = list(&tx, class_id)?;
    let rows = rows.as_array().unwrap();
    let mut seen = std::collections::HashSet::new();
    for value in ids {
        let id = value.as_str().ok_or_else(|| ApiError::bad_request("Id inválido."))?;
        if !seen.insert(id) || !rows.iter().any(|row| row["id"].as_str() == Some(id)) { return Err(ApiError::bad_request("Orden de columnas inválido.")); }
    }
    let first = rows.iter().find(|row| Some(&row["id"]) == ids.first()).ok_or_else(|| ApiError::bad_request("Orden vacío."))?;
    let owner = |id: &Value| -> Option<&Value> { rows.iter().find(|row| row["assignmentGroup"]["memberIds"].as_array().map(|members| members.contains(id)).unwrap_or(false)).map(|row| &row["id"]) };
    let siblings: Vec<&Value> = rows.iter().filter(|row| row["categoryId"] == first["categoryId"] && row["evaluationPeriodId"] == first["evaluationPeriodId"] && owner(&row["id"]) == owner(&first["id"])).map(|row| &row["id"]).collect();
    if siblings.len() != ids.len() || siblings.iter().any(|id| !ids.contains(id)) { return Err(ApiError::bad_request("Solo se pueden ordenar columnas de la misma categoría o grupo.")); }
    for (order, id) in ids.iter().enumerate() { tx.execute("UPDATE assignments SET column_order = ?, updated_at = ? WHERE id = ?", params![order as f64, db::now_iso(), id.as_str()])?; }
    tx.commit()?;
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Connection {
        let conn = db::test_connection();
        conn.execute_batch("INSERT INTO academic_years(id,label,start_date,end_date,created_at,updated_at) VALUES ('y','2026','2026-09-01','2027-06-30','now','now');
          INSERT INTO courses(id,level,subject,created_at,updated_at) VALUES ('course','1 ESO','Materia','now','now');
          INSERT INTO classes(id,academic_year_id,course_id,created_at,updated_at) VALUES ('class','y','course','now','now');
          INSERT INTO evaluation_periods(id,academic_year_id,name,start_date,end_date) VALUES ('p','y','Primera','2026-09-01','2026-12-20');
          INSERT INTO categories(id,class_id,evaluation_period_id,name,weight) VALUES ('cat','class','p','Trabajo',100),('other','class','p','Otra',0);
          INSERT INTO students(id,nombre,created_at,updated_at) VALUES ('s','Eva','now','now');
          INSERT INTO enrollments(id,student_id,class_id,created_at,updated_at) VALUES ('e','s','class','now','now');").unwrap();
        conn
    }
    fn task(conn: &Connection, name: &str) -> Value {
        create(conn, "class", json!({"name":name,"categoryId":"cat","evaluationPeriodId":"p","evaluationMethod":"direct_grade"})).unwrap()
    }
    fn group(conn: &Connection, ids: Vec<&str>) -> Value {
        create(conn, "class", json!({"name":"Grupo","categoryId":"cat","evaluationPeriodId":"p","evaluationMethod":"direct_grade","assignmentGroup":{"memberIds":ids,"color":"blue"}})).unwrap()
    }
    #[test]
    fn group_crud_preserves_grades_and_backup() {
        let mut conn = fixture();
        let a = task(&conn, "Pregunta"); let id = a["id"].as_str().unwrap();
        crate::services::grades::put(&conn, id, "e", json!({"directScore":7})).unwrap();
        let g = group(&conn, vec![id]); let gid = g["id"].as_str().unwrap();
        assert!(crate::services::grades::put(&conn, gid, "e", json!({"directScore":10})).is_err());
        update(&conn, gid, json!({"assignmentGroup":{"memberIds":[id],"color":"blue","memberWeights":{id:2}},"columnOrder":3})).unwrap();
        assert_eq!(get_one(&conn, id).unwrap().unwrap()["importanciaPersonalizada"].as_f64(), Some(2.0));
        update(&conn, id, json!({"importanciaPersonalizada":4})).unwrap();
        update(&conn, gid, json!({"columnOrder":2})).unwrap();
        assert_eq!(get_one(&conn, id).unwrap().unwrap()["importanciaPersonalizada"].as_f64(), Some(4.0));
        let dump = crate::services::backup::export_all(&conn).unwrap();
        crate::services::backup::import_all(&mut conn, &dump).unwrap();
        assert_eq!(get_one(&conn, gid).unwrap().unwrap()["assignmentGroup"]["memberIds"][0], id);
        delete(&conn, gid).unwrap();
        assert!(get_one(&conn, id).unwrap().is_some());
        assert_eq!(crate::services::grades::list_for_class(&conn,"class").unwrap().as_array().unwrap().len(),1);
    }
    #[test]
    fn group_validation_and_removal() {
        let conn = fixture(); let a = task(&conn, "A"); let id = a["id"].as_str().unwrap();
        let g = group(&conn, vec![id]); let gid = g["id"].as_str().unwrap();
        assert!(create(&conn,"class",json!({"name":"Otro","categoryId":"cat","evaluationPeriodId":"p","evaluationMethod":"direct_grade","assignmentGroup":{"memberIds":[id],"color":"blue"}})).is_err());
        assert!(update(&conn,gid,json!({"assignmentGroup":{"memberIds":[gid],"color":"blue"}})).is_err());
        assert!(update(&conn,gid,json!({"assignmentGroup":{"memberIds":["missing"],"color":"blue"}})).is_err());
        assert!(update(&conn,gid,json!({"assignmentGroup":{"memberIds":[id],"color":"blue","memberWeights":{id:-1}}})).is_err());
        update(&conn,id,json!({"categoryId":"other"})).unwrap();
        assert!(get_one(&conn,gid).unwrap().unwrap()["assignmentGroup"]["memberIds"].as_array().unwrap().is_empty());
        update(&conn,gid,json!({"assignmentGroup":{"memberIds":[id],"color":"blue"}})).unwrap();
        assert_eq!(get_one(&conn,id).unwrap().unwrap()["categoryId"],"cat");
        delete(&conn,id).unwrap();
        assert!(get_one(&conn,gid).unwrap().unwrap()["assignmentGroup"]["memberIds"].as_array().unwrap().is_empty());
    }
    #[test]
    fn reorder_is_atomic_and_scoped() {
        let conn = fixture(); let a = task(&conn,"A"); let b = task(&conn,"B"); let c = task(&conn,"C");
        let g = group(&conn,vec![a["id"].as_str().unwrap(),b["id"].as_str().unwrap()]);
        reorder(&conn,"class",json!({"ids":[b["id"],a["id"]]})).unwrap();
        assert_eq!(get_one(&conn,b["id"].as_str().unwrap()).unwrap().unwrap()["columnOrder"].as_f64(),Some(0.0));
        assert!(reorder(&conn,"class",json!({"ids":[a["id"],c["id"]]})).is_err());
        assert_eq!(get_one(&conn,b["id"].as_str().unwrap()).unwrap().unwrap()["columnOrder"].as_f64(),Some(0.0));
        reorder(&conn,"class",json!({"ids":[c["id"],g["id"]]})).unwrap();
    }
    #[test]
    fn create_task_directly_in_group_is_atomic() {
        let conn = fixture(); let g = group(&conn,vec![]); let gid = g["id"].as_str().unwrap();
        let created = create(&conn,"class",json!({"name":"Nueva","categoryId":"cat","evaluationPeriodId":"p","evaluationMethod":"direct_grade","joinGroupId":gid})).unwrap();
        assert_eq!(get_one(&conn,gid).unwrap().unwrap()["assignmentGroup"]["memberIds"][0],created["id"]);
        let before = list(&conn,"class").unwrap().as_array().unwrap().len();
        assert!(create(&conn,"class",json!({"name":"Inválida","categoryId":"other","evaluationPeriodId":"p","evaluationMethod":"direct_grade","joinGroupId":gid})).is_err());
        assert_eq!(list(&conn,"class").unwrap().as_array().unwrap().len(),before);
    }
}
