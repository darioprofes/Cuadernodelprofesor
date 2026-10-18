use rusqlite::{params, types::{Value as SqlValue, ValueRef}, Connection, OptionalExtension};
use serde_json::{json, Map, Value};
use crate::{db, error::ApiError};
use chrono::Datelike;

pub fn history_cutoff(today: chrono::NaiveDate) -> String {
    format!("{}-09-01T00:00:00+02:00", if today.month() >= 9 { today.year() } else { today.year()-1 })
}
pub fn prune_expired(conn: &Connection, today: chrono::NaiveDate) -> rusqlite::Result<usize> {
    conn.execute("DELETE FROM change_history AS h WHERE julianday(h.created_at)<julianday(?1) AND NOT EXISTS (SELECT 1 FROM change_history newer WHERE newer.batch_id=h.batch_id AND julianday(newer.created_at)>=julianday(?1))", [history_cutoff(today)])
}
pub fn maybe_prune(conn: &Connection) -> rusqlite::Result<()> {
    let today=chrono::Local::now().date_naive();
    let last: Option<String>=conn.query_row("SELECT last_pruned_on FROM history_context WHERE id=1",[],|r|r.get(0))?;
    if last.as_deref()!=Some(&today.to_string()) {
        let tx=conn.unchecked_transaction()?;
        prune_expired(&tx,today)?;
        tx.execute("UPDATE history_context SET last_pruned_on=? WHERE id=1",[today.to_string()])?;
        tx.commit()?;
    }
    Ok(())
}
pub fn clear(conn: &Connection, body: Value) -> Result<Value,ApiError> {
    if body["confirmation"]!="BORRAR HISTORIAL" { return Err(ApiError::bad_request("Confirma el borrado de todo el historial.")); }
    let deleted=conn.execute("DELETE FROM change_history",[])?;
    Ok(json!({"deleted":deleted}))
}

const TABLES: &[&str] = &["courses", "evaluation_criteria", "evaluation_tools", "categories", "assignments", "grades"];
fn conflict(message: &str) -> ApiError { ApiError { status: 409, detail: message.into() } }
fn value(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => n.as_i64().map(SqlValue::Integer).unwrap_or_else(|| SqlValue::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => SqlValue::Text(s.clone()),
        _ => SqlValue::Text(v.to_string()),
    }
}
fn keys(table: &str) -> &[&str] { if table == "grades" { &["enrollment_id", "assignment_id"] } else { &["id"] } }
fn canonical(mut row: Value) -> Value {
    if let Some(obj)=row.as_object_mut() { obj.remove("updated_at"); }
    for k in ["created_at"] {
        if let Some(s)=row[k].as_str() { if let Ok(time)=chrono::DateTime::parse_from_rfc3339(s) { row[k]=json!(time.timestamp_micros()); } }
    }
    row
}
fn current(conn: &Connection, table: &str, snapshot: &Value) -> Result<Option<Value>, ApiError> {
    let predicate = keys(table).iter().map(|k| format!("{k}=?")).collect::<Vec<_>>().join(" AND ");
    let values = keys(table).iter().map(|k| value(&snapshot[*k])).collect::<Vec<_>>();
    let mut stmt = conn.prepare(&format!("SELECT * FROM {table} WHERE {predicate}"))?;
    let names = stmt.column_names().iter().map(|n| n.to_string()).collect::<Vec<_>>();
    Ok(stmt.query_row(rusqlite::params_from_iter(values), |row| {
        let mut obj = Map::new();
        for (i, name) in names.iter().enumerate() {
            let mut v = match row.get_ref(i)? {
                ValueRef::Null => Value::Null,
                ValueRef::Integer(n) => json!(n),
                ValueRef::Real(n) => json!(n),
                ValueRef::Text(s) => json!(String::from_utf8_lossy(s)),
                ValueRef::Blob(_) => Value::Null,
            };
            if ["levels","items","linked_criteria","recovers_assignment_ids","assignment_group","tool_results"].contains(&name.as_str()) {
                if let Some(s)=v.as_str() { v=serde_json::from_str(s).unwrap_or(v); }
            }
            if ["peso_criterios_manual","exclude_from_weighting"].contains(&name.as_str()) && !v.is_null() { v=json!(v.as_i64().unwrap_or(0)!=0); }
            obj.insert(name.clone(), v);
        }
        Ok(Value::Object(obj))
    }).optional()?)
}
fn changes(conn: &Connection, batch: &str) -> Result<Vec<Value>, ApiError> {
    let mut stmt = conn.prepare("SELECT table_name,row_key,label,before_data,after_data,undone_at FROM change_history WHERE batch_id=? ORDER BY id")?;
    let rows = stmt.query_map([batch], |r| {
        let b: Option<String> = r.get(3)?; let a: Option<String> = r.get(4)?;
        Ok(json!({"table":r.get::<_,String>(0)?, "key":r.get::<_,String>(1)?, "label":r.get::<_,String>(2)?,
            "before":b.and_then(|s| serde_json::from_str::<Value>(&s).ok()), "after":a.and_then(|s| serde_json::from_str::<Value>(&s).ok()), "undoneAt":r.get::<_,Option<String>>(5)?}))
    })?.collect::<Result<Vec<_>,_>>()?;
    if rows.is_empty() { return Err(ApiError::not_found("Cambio no encontrado.")); }
    let mut merged: Vec<Value> = Vec::new();
    for row in rows {
        if !TABLES.contains(&row["table"].as_str().unwrap_or("")) { return Err(conflict("Cambio no compatible.")); }
        if let Some(existing) = merged.iter_mut().find(|e| e["table"]==row["table"] && e["key"]==row["key"]) { existing["after"]=row["after"].clone(); }
        else { merged.push(row); }
    }
    merged.retain(|r| !r["before"].is_null() || !r["after"].is_null());
    Ok(merged)
}
fn reason(conn: &Connection, rows: &[Value], batch: &str) -> Result<Option<String>, ApiError> {
    for row in rows {
        if !row["undoneAt"].is_null() { return Ok(Some("Este cambio ya está deshecho.".into())); }
        let snapshot = if row["after"].is_null() { &row["before"] } else { &row["after"] };
        let actual = current(conn, row["table"].as_str().unwrap(), snapshot)?.unwrap_or(Value::Null);
        if canonical(actual) != canonical(row["after"].clone()) { return Ok(Some("Hay cambios posteriores en los mismos datos. Deshaz primero esos cambios para no perder información.".into())); }
        let table=row["table"].as_str().unwrap();
        if ["assignments","evaluation_tools"].contains(&table) && !row["before"].is_null() && !row["after"].is_null() {
            let identity=row["after"]["id"].as_str().unwrap_or("");
            let later: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM change_history h WHERE h.table_name='grades' AND h.undone_at IS NULL AND h.id>(SELECT max(id) FROM change_history WHERE batch_id=?1) AND json_extract(COALESCE(h.after_data,h.before_data),'$.assignment_id') IN (SELECT id FROM assignments WHERE (?2='assignments' AND id=?3) OR (?2='evaluation_tools' AND evaluation_tool_id=?3)))",params![batch,table,identity],|r|r.get(0))?;
            if later { return Ok(Some("Se han cambiado notas después de esta configuración. Deshaz primero esos cambios para conservar las notas posteriores.".into())); }
        }
    }
    Ok(None)
}
pub fn list(conn: &Connection, class_id: &str, page: u32) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare("SELECT batch_id,min(created_at),max(undone_at),count(*),group_concat(DISTINCT label) FROM change_history WHERE batch_id IN (SELECT batch_id FROM change_history WHERE class_id=?1 OR course_id=(SELECT course_id FROM classes WHERE id=?1) OR (class_id IS NULL AND course_id IS NULL AND table_name='evaluation_tools')) GROUP BY batch_id ORDER BY min(id) DESC LIMIT 200 OFFSET ?2")?;
    let rows = stmt.query_map(params![class_id, i64::from(page)*200], |r| Ok(json!({"id":r.get::<_,String>(0)?,"createdAt":r.get::<_,String>(1)?,"undoneAt":r.get::<_,Option<String>>(2)?,"changeCount":r.get::<_,i64>(3)?,"label":r.get::<_,String>(4)?})))?.collect::<Result<Vec<_>,_>>()?;
    Ok(json!(rows))
}
pub fn preview(conn: &Connection, batch: &str) -> Result<Value, ApiError> {
    let rows = changes(conn, batch)?; let why = reason(conn, &rows, batch)?;
    Ok(json!({"id":batch,"canRestore":why.is_none(),"reason":why,"changes":rows}))
}
pub fn restore(conn: &Connection, batch: &str) -> Result<Value, ApiError> {
    let tx = conn.unchecked_transaction()?;
    let mut rows = changes(&tx, batch)?;
    if let Some(why) = reason(&tx, &rows, batch)? { return Err(conflict(&why)); }
    tx.execute("UPDATE history_context SET disabled=1 WHERE id=1", [])?;
    // Only grade insertions are audited; undoing their creation cannot cascade.
    for row in rows.iter().filter(|r| r["before"].is_null()) {
        let table = row["table"].as_str().unwrap();
        let predicate=keys(table).iter().map(|k| format!("{k}=?")).collect::<Vec<_>>().join(" AND ");
        tx.execute(&format!("DELETE FROM {table} WHERE {predicate}"), rusqlite::params_from_iter(keys(table).iter().map(|k| value(&row["after"][*k]))))?;
    }
    rows.sort_by_key(|r| TABLES.iter().position(|t| Some(*t)==r["table"].as_str()).unwrap());
    for row in rows.iter().filter(|r| !r["before"].is_null()) {
        let table=row["table"].as_str().unwrap(); let obj=row["before"].as_object().ok_or_else(|| conflict("Copia incompatible."))?;
        let cols=obj.keys().cloned().collect::<Vec<_>>();
        if cols.iter().any(|c| !c.chars().all(|ch| ch.is_ascii_alphanumeric() || ch=='_')) { return Err(conflict("Copia incompatible.")); }
        let updates=cols.iter().filter(|c| !keys(table).contains(&c.as_str())).map(|c| format!("{c}=excluded.{c}")).collect::<Vec<_>>().join(",");
        let query=format!("INSERT INTO {table} ({}) VALUES ({}) ON CONFLICT ({}) DO UPDATE SET {updates}",cols.join(","),vec!["?";cols.len()].join(","),keys(table).join(","));
        tx.execute(&query,rusqlite::params_from_iter(cols.iter().map(|c| value(&obj[c])))).map_err(|_| conflict("Faltan datos relacionados o existe un conflicto. No se ha restaurado nada."))?;
    }
    tx.execute("UPDATE change_history SET undone_at=? WHERE batch_id=?",params![db::now_iso(),batch])?;
    tx.execute("UPDATE history_context SET disabled=0 WHERE id=1",[])?;
    tx.commit()?;
    Ok(json!({"restored":true}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routers::dispatch;
    fn fixture() -> (Connection, String) {
        let conn=db::test_connection();
        conn.execute_batch("INSERT INTO academic_years(id,label,start_date,end_date,created_at,updated_at) VALUES ('y','2026','2026-09-01','2027-06-30','now','now');
          INSERT INTO courses(id,level,subject,created_at,updated_at) VALUES ('course','1 ESO','Materia','now','now');
          INSERT INTO classes(id,academic_year_id,course_id,created_at,updated_at) VALUES ('class','y','course','now','now');
          INSERT INTO evaluation_periods(id,academic_year_id,name,start_date,end_date) VALUES ('p','y','Primera','2026-09-01','2026-12-20');
          INSERT INTO categories(id,class_id,evaluation_period_id,name,weight) VALUES ('cat','class','p','Trabajo',100);
          INSERT INTO students(id,nombre,created_at,updated_at) VALUES ('s','Eva','now','now');
          INSERT INTO enrollments(id,student_id,class_id,created_at,updated_at) VALUES ('e','s','class','now','now');").unwrap();
        let task=dispatch(&conn,"POST","/classes/class/assignments",Some(json!({"name":"Tarea","categoryId":"cat","evaluationPeriodId":"p","evaluationMethod":"direct_grade"}))).unwrap();
        (conn,task["id"].as_str().unwrap().to_string())
    }
    fn latest(conn: &Connection) -> String { list(conn,"class",0).unwrap()[0]["id"].as_str().unwrap().into() }
    #[test]
    fn retention_uses_school_year_and_preserves_complete_batches() {
        use chrono::NaiveDate;
        assert_eq!(history_cutoff(NaiveDate::from_ymd_opt(2026,8,31).unwrap()),"2025-09-01T00:00:00+02:00");
        assert_eq!(history_cutoff(NaiveDate::from_ymd_opt(2026,9,1).unwrap()),"2026-09-01T00:00:00+02:00");
        let (conn,_)=fixture();
        for (batch,date) in [("old","2026-08-31T21:59:59Z"),("mixed","2026-08-31T21:59:59Z"),("mixed","2026-08-31T22:00:00Z"),("current","2026-10-01T00:00:00Z")] {
            conn.execute("INSERT INTO change_history(batch_id,table_name,row_key,label,created_at) VALUES (?,'courses','course','Prueba',?)",params![batch,date]).unwrap();
        }
        assert_eq!(prune_expired(&conn,NaiveDate::from_ymd_opt(2026,10,18).unwrap()).unwrap(),1);
        assert_eq!(conn.query_row("SELECT count(*) FROM change_history",[],|r|r.get::<_,i64>(0)).unwrap(),3);
        assert_eq!(conn.query_row("SELECT count(*) FROM courses",[],|r|r.get::<_,i64>(0)).unwrap(),1);
    }
    #[test]
    fn manual_clear_requires_confirmation_and_keeps_live_data() {
        let (conn,id)=fixture();
        dispatch(&conn,"PUT",&format!("/assignments/{id}/grades/e"),Some(json!({"directScore":7}))).unwrap();
        assert_eq!(dispatch(&conn,"POST","/history/clear",Some(json!({}))).unwrap_err().status,400);
        let before=crate::services::backup::export_all(&conn).unwrap();
        assert_eq!(dispatch(&conn,"POST","/history/clear",Some(json!({"confirmation":"BORRAR HISTORIAL"}))).unwrap()["deleted"],1);
        let after=crate::services::backup::export_all(&conn).unwrap();
        for (table,data) in before.as_object().unwrap() { if table!="change_history" { assert_eq!(&after[table],data); } }
        assert!(list(&conn,"class",0).unwrap().as_array().unwrap().is_empty());
        dispatch(&conn,"PUT",&format!("/assignments/{id}/grades/e"),Some(json!({"directScore":8}))).unwrap();
        assert_eq!(list(&conn,"class",0).unwrap().as_array().unwrap().len(),1);
    }
    #[test]
    fn undo_grade_refuses_newer_change_and_supports_stepwise_undo() {
        let (conn,id)=fixture(); let path=format!("/assignments/{id}/grades/e");
        dispatch(&conn,"PUT",&path,Some(json!({"directScore":0}))).unwrap(); let first=latest(&conn);
        dispatch(&conn,"PUT",&path,Some(json!({"directScore":8}))).unwrap(); let second=latest(&conn);
        assert!(!preview(&conn,&first).unwrap()["canRestore"].as_bool().unwrap());
        assert_eq!(restore(&conn,&first).unwrap_err().status,409);
        restore(&conn,&second).unwrap();
        assert_eq!(crate::services::grades::list_for_class(&conn,"class").unwrap()[0]["directScore"],0.0);
        restore(&conn,&first).unwrap();
        assert!(crate::services::grades::list_for_class(&conn,"class").unwrap().as_array().unwrap().is_empty());
        assert_eq!(restore(&conn,&first).unwrap_err().status,409);
    }
    #[test]
    fn deleted_task_restores_grades_and_survives_backup() {
        let (conn,id)=fixture();
        dispatch(&conn,"PUT",&format!("/assignments/{id}/grades/e"),Some(json!({"toolResults":{"c1":7}}))).unwrap();
        dispatch(&conn,"DELETE",&format!("/assignments/{id}"),None).unwrap(); let batch=latest(&conn);
        assert_eq!(preview(&conn,&batch).unwrap()["changes"].as_array().unwrap().len(),2);
        let dump=crate::services::backup::export_all(&conn).unwrap();
        let mut restored=db::test_connection(); crate::services::backup::import_all(&mut restored,&dump).unwrap();
        restore(&restored,&batch).unwrap();
        assert_eq!(crate::services::grades::list_for_class(&restored,"class").unwrap()[0]["toolResults"]["c1"],7);
        assert!(crate::services::assignments::get_one(&restored,&id).unwrap().is_some());
        assert_eq!(restored.query_row("SELECT count(*) FROM change_history",[],|r|r.get::<_,i64>(0)).unwrap(),3);
    }
    #[test]
    fn assignment_change_is_blocked_if_later_grades_exist() {
        let (conn,id)=fixture();
        dispatch(&conn,"PATCH",&format!("/assignments/{id}"),Some(json!({"name":"Tarea modificada"}))).unwrap(); let batch=latest(&conn);
        assert!(preview(&conn,&batch).unwrap()["canRestore"].as_bool().unwrap());
        dispatch(&conn,"PUT",&format!("/assignments/{id}/grades/e"),Some(json!({"directScore":5}))).unwrap();
        assert_eq!(restore(&conn,&batch).unwrap_err().status,409);
    }
    #[test]
    fn saving_same_grade_does_not_block_undo() {
        let (conn,id)=fixture(); let path=format!("/assignments/{id}/grades/e");
        dispatch(&conn,"PUT",&path,Some(json!({"directScore":5}))).unwrap(); let batch=latest(&conn);
        dispatch(&conn,"PUT",&path,Some(json!({"directScore":5}))).unwrap();
        assert_eq!(latest(&conn),batch);
        restore(&conn,&batch).unwrap();
        assert!(crate::services::grades::list_for_class(&conn,"class").unwrap().as_array().unwrap().is_empty());
    }
}
