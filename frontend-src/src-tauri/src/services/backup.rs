use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::Connection;
use serde_json::{json, Map, Value};

use crate::error::ApiError;

// Mismo orden y mismas 24 tablas que _TABLES_IN_DEPENDENCY_ORDER en
// api/app/services/backup.py -- padres antes que hijos, para que
// import_all pueda insertar en este orden sin violar ninguna FK (el
// borrado previo va en orden inverso, ver import_all).
const TABLES_IN_DEPENDENCY_ORDER: &[&str] = &[
    "app_preferences",
    "shortcuts",
    "students",
    "key_competences",
    "operational_descriptors",
    "courses",
    "specific_competences",
    "specific_competence_descriptors",
    "evaluation_criteria",
    "basic_knowledge",
    "programming_units",
    "evaluation_tools",
    "academic_years",
    "evaluation_periods",
    "academic_year_courses",
    "classes",
    "enrollments",
    "categories",
    "assignments",
    "grades",
    "journal_entries",
    "tasks",
    "meetings",
    "agenda_notes",
];

// El backend web distingue columnas JSONB con una consulta genérica a
// information_schema (data_type = 'jsonb'). SQLite no tiene un tipo JSON
// real que se pueda introspeccionar así -- todas las columnas JSON de
// este baseline son TEXT igual que cualquier otra columna de texto (ver
// migrations/0001_baseline.sql) -- así que aquí se declara la lista a
// mano, calcada de esa misma migración. Si migrations/0001_baseline.sql
// gana una columna JSON nueva, esta lista hay que actualizarla a la vez.
fn json_columns(table: &str) -> &'static [&'static str] {
    match table {
        "app_preferences" => &["grade_scale"],
        "students" => &["tutor1", "tutor2"],
        "programming_units" => &["session_details", "linked_criteria_ids", "linked_basic_knowledge_ids"],
        "evaluation_tools" => &["levels", "items"],
        "academic_years" => &["holidays", "periods"],
        "classes" => &["schedule", "skipped_days"],
        "enrollments" => &["acneae"],
        "assignments" => &["linked_criteria", "recovers_assignment_ids"],
        "grades" => &["tool_results"],
        _ => &[],
    }
}

fn sqlite_ref_to_json(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).to_string()),
        // No debería darse salvo "foto" (BYTEA/BLOB), ya excluida por
        // nombre de columna -- igual que memoryview -> None en backup.py.
        ValueRef::Blob(_) => Value::Null,
    }
}

pub fn export_all(conn: &Connection) -> Result<Value, ApiError> {
    let mut dump = Map::new();

    for table in TABLES_IN_DEPENDENCY_ORDER {
        let mut stmt = conn.prepare(&format!("SELECT * FROM {table}"))?;
        let column_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
        let json_cols = json_columns(table);

        let rows = stmt.query_map([], |row| {
            let mut obj = Map::new();
            for (i, col) in column_names.iter().enumerate() {
                if col == "foto" {
                    continue;
                }
                let value_ref = row.get_ref(i)?;
                let json_val = if json_cols.contains(&col.as_str()) {
                    match value_ref {
                        ValueRef::Text(t) => serde_json::from_slice::<Value>(t).unwrap_or(Value::Null),
                        ValueRef::Null => Value::Null,
                        other => sqlite_ref_to_json(other),
                    }
                } else {
                    sqlite_ref_to_json(value_ref)
                };
                obj.insert(col.clone(), json_val);
            }
            Ok(Value::Object(obj))
        })?;

        let items: Result<Vec<Value>, rusqlite::Error> = rows.collect();
        dump.insert((*table).to_string(), Value::Array(items?));
    }

    Ok(Value::Object(dump))
}

fn json_value_to_sql(val: &Value) -> SqlValue {
    match val {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => n
            .as_i64()
            .map(SqlValue::Integer)
            .unwrap_or_else(|| SqlValue::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => SqlValue::Text(s.clone()),
        // Arrays/objetos fuera de json_columns no deberían darse en un
        // volcado bien formado, pero se serializan por seguridad en vez
        // de perderlos silenciosamente.
        other => SqlValue::Text(other.to_string()),
    }
}

fn insert_row(conn: &Connection, table: &str, row: &Value) -> Result<(), ApiError> {
    let obj = row.as_object()
        .ok_or_else(|| ApiError::bad_request(format!("Fila inválida en la tabla {table}.")))?;
    let json_cols = json_columns(table);

    let mut columns: Vec<String> = Vec::with_capacity(obj.len());
    let mut values: Vec<SqlValue> = Vec::with_capacity(obj.len());
    for (col, val) in obj {
        columns.push(col.clone());
        if json_cols.contains(&col.as_str()) && !val.is_null() {
            let s = serde_json::to_string(val).map_err(ApiError::internal)?;
            values.push(SqlValue::Text(s));
        } else if json_cols.contains(&col.as_str()) {
            values.push(SqlValue::Null);
        } else {
            values.push(json_value_to_sql(val));
        }
    }

    let placeholders = vec!["?"; columns.len()].join(", ");
    let sql = format!("INSERT INTO {table} ({}) VALUES ({placeholders})", columns.join(", "));
    conn.execute(&sql, rusqlite::params_from_iter(values.iter()))?;
    Ok(())
}

// Todo o nada como el backend web (allí una excepción hace rollback de la
// conexión completa) -- aquí se envuelve explícitamente en una
// transacción porque, a diferencia de los demás servicios (llamadas
// sueltas de una sola sentencia), esta es una única operación lógica de
// muchas sentencias. foreign_keys se apaga durante el borrado+reinserción
// (el orden de borrado inverso ya evita según qué violaciones, pero
// apagarlo es más robusto que depender de acertar el orden exacto en
// cada FK) y se reactiva al final, tanto si sale bien como si falla.
pub fn import_all(conn: &mut Connection, dump: &Value) -> Result<(), ApiError> {
    let obj = dump.as_object()
        .ok_or_else(|| ApiError::bad_request("El volcado no es un objeto JSON válido."))?;

    conn.pragma_update(None, "foreign_keys", "OFF")?;

    let result = (|| -> Result<(), ApiError> {
        let tx = conn.transaction()?;

        for table in TABLES_IN_DEPENDENCY_ORDER.iter().rev() {
            tx.execute(&format!("DELETE FROM {table}"), [])?;
        }

        for table in TABLES_IN_DEPENDENCY_ORDER {
            let rows = obj.get(*table).and_then(Value::as_array);
            if let Some(rows) = rows {
                for row in rows {
                    insert_row(&tx, table, row)?;
                }
            }
        }

        tx.commit()?;
        Ok(())
    })();

    conn.pragma_update(None, "foreign_keys", "ON")?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn export_then_import_round_trip() {
        let conn = db::test_connection();
        conn.execute(
            "INSERT INTO shortcuts (id, label, url, sort_order, updated_at) VALUES ('sc1','Aula','https://a','0','2026-08-05T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO students (id, nombre, tutor1, created_at, updated_at) VALUES ('s1','Ana', '{\"nombre\":\"Luis\"}', '2026-08-05T00:00:00Z', '2026-08-05T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO academic_years (id, label, start_date, end_date, holidays, created_at, updated_at) VALUES ('y1','2026-2027','2026-09-01','2027-06-30','[{\"id\":\"h1\"}]','2026-08-05T00:00:00Z','2026-08-05T00:00:00Z')",
            [],
        ).unwrap();

        let dump = export_all(&conn).unwrap();
        assert_eq!(dump["shortcuts"].as_array().unwrap().len(), 1);
        assert_eq!(dump["students"][0]["tutor1"]["nombre"], "Luis");
        assert_eq!(dump["academic_years"][0]["holidays"][0]["id"], "h1");

        let mut conn2 = db::test_connection();
        import_all(&mut conn2, &dump).unwrap();

        let shortcuts_after = crate::routers::dispatch(&conn2, "GET", "/shortcuts", None).unwrap();
        assert_eq!(shortcuts_after.as_array().unwrap().len(), 1);
        assert_eq!(shortcuts_after[0]["label"], "Aula");

        let students_after = crate::routers::dispatch(&conn2, "GET", "/students", None).unwrap();
        assert_eq!(students_after[0]["tutor1"]["nombre"], "Luis");

        // Reimportar sobre datos ya existentes sustituye, no duplica.
        import_all(&mut conn2, &dump).unwrap();
        let shortcuts_after_2 = crate::routers::dispatch(&conn2, "GET", "/shortcuts", None).unwrap();
        assert_eq!(shortcuts_after_2.as_array().unwrap().len(), 1);
    }

    // Si migrations/0001_baseline.sql gana o pierde una tabla de dominio y
    // TABLES_IN_DEPENDENCY_ORDER no se actualiza a la vez, este test falla
    // en vez de dejar la tabla nueva silenciosamente fuera de la copia de
    // seguridad.
    #[test]
    fn tables_in_dependency_order_matches_schema() {
        let conn = db::test_connection();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('sqlite_sequence', 'schema_migrations') ORDER BY name")
            .unwrap();
        let mut actual: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        actual.sort();

        let mut expected: Vec<String> = TABLES_IN_DEPENDENCY_ORDER.iter().map(|s| s.to_string()).collect();
        expected.sort();

        assert_eq!(actual, expected);
    }
}
