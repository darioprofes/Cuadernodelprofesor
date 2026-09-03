use base64::Engine;
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::Connection;
use serde_json::{json, Map, Value};

use crate::error::ApiError;

// Mismo orden que _TABLES_IN_DEPENDENCY_ORDER en api/app/services/backup.py
// -- padres antes que hijos, para que import_all pueda insertar en este
// orden sin violar ninguna FK (el borrado previo va en orden inverso, ver
// import_all). educastur_config (migración 0004) se añadió aquí más
// tarde que en la web -- hasta entonces no existía este lado de la
// sincronización con Educastur en escritorio (ver services/educastur.rs).
const TABLES_IN_DEPENDENCY_ORDER: &[&str] = &[
    "app_preferences",
    "shortcuts",
    "educastur_config",
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
    "absences",
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
// este esquema son TEXT igual que cualquier otra columna de texto -- así
// que aquí se declara la lista a mano, calcada de las migraciones (ver
// migrations/). Cualquier migración nueva que añada una columna JSON tiene
// que actualizar esta lista a la vez, o esa columna se exportará/
// importará como texto plano en vez de deserializarse.
fn json_columns(table: &str) -> &'static [&'static str] {
    match table {
        "app_preferences" => &["grade_scale", "teacher_profile"],
        "students" => &["tutor1", "tutor2"],
        "programming_units" => &[
            "session_details", "linked_criteria_ids", "linked_basic_knowledge_ids",
            "linked_specific_competence_ids", "final_product", "final_exam",
        ],
        "evaluation_tools" => &["levels", "items"],
        "academic_years" => &["holidays", "periods"],
        "classes" => &["schedule", "skipped_days", "caracteristicas_grupo"],
        "enrollments" => &["acneae"],
        "assignments" => &["linked_criteria", "recovers_assignment_ids"],
        "grades" => &["tool_results"],
        _ => &[],
    }
}

// SQLite no tiene tipo BOOLEAN real -- todas estas columnas se guardan como
// INTEGER (0/1), igual que cualquier otro entero, sin forma de distinguirlas
// por tipo (a diferencia de json_columns, que sí puede apoyarse en el tipo
// TEXT vs el resto). El backend web (Postgres) SÍ tiene columnas BOOLEAN de
// verdad, y un INSERT con un entero 0/1 donde espera boolean falla en seco
// (columna "x" es de tipo boolean pero la expresión es de tipo integer) --
// bug real, encontrado el 2026-09-03 restaurando una copia de escritorio en
// la web: había que declarar aquí, a mano, qué columnas son lógicamente
// booleanas para exportarlas como true/false en vez de 1/0. Calcado de las
// columnas BOOLEAN de api/app/migrations/ -- una columna booleana nueva en
// el esquema (a cualquier lado) tiene que añadirse aquí también.
fn bool_columns(table: &str) -> &'static [&'static str] {
    match table {
        "students" => &["autorizacion_imagen", "autorizacion_salidas"],
        "courses" => &["peso_criterios_manual"],
        "evaluation_criteria" => &["exclude_from_weighting"],
        "academic_years" => &["is_current"],
        "enrollments" => &["ha_repetido_curso", "neae", "programa_bilingue"],
        "tasks" => &["hecho"],
        _ => &[],
    }
}

fn sqlite_ref_to_json(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).to_string()),
        // BLOB (fotos): igual que memoryview -> base64 en backup.py -- se
        // quedaba fuera a propósito para no hinchar el backup, pero eso
        // rompía la promesa de que Exportar + Restablecer + Importar deja
        // todo como estaba (el alumnado volvía sin fotos). Sin ambigüedad
        // posible aquí (a diferencia de boolean/integer): cualquier valor
        // BLOB se codifica en base64, no hace falta una lista de columnas
        // para la exportación -- solo insert_row (más abajo) necesita
        // saber cuáles decodificar de vuelta, ver blob_columns.
        ValueRef::Blob(b) => Value::String(base64::engine::general_purpose::STANDARD.encode(b)),
    }
}

pub fn export_all(conn: &Connection) -> Result<Value, ApiError> {
    let mut dump = Map::new();

    for table in TABLES_IN_DEPENDENCY_ORDER {
        let mut stmt = conn.prepare(&format!("SELECT * FROM {table}"))?;
        let column_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
        let json_cols = json_columns(table);
        let bool_cols = bool_columns(table);

        let rows = stmt.query_map([], |row| {
            let mut obj = Map::new();
            for (i, col) in column_names.iter().enumerate() {
                let value_ref = row.get_ref(i)?;
                let json_val = if json_cols.contains(&col.as_str()) {
                    match value_ref {
                        ValueRef::Text(t) => serde_json::from_slice::<Value>(t).unwrap_or(Value::Null),
                        ValueRef::Null => Value::Null,
                        other => sqlite_ref_to_json(other),
                    }
                } else if bool_cols.contains(&col.as_str()) {
                    match value_ref {
                        ValueRef::Integer(i) => json!(i != 0),
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

// Columnas BLOB (fotos) -- solo dos en todo el esquema (students.foto,
// app_preferences.teacher_photo). Igual que json_columns/bool_columns: se
// declaran a mano en vez de vía introspección (SQLite sí distinguiría BLOB
// de TEXT con PRAGMA table_info, a diferencia de boolean, pero se mantiene
// el mismo criterio que el resto de este fichero). Una columna BLOB nueva
// tiene que añadirse aquí también, o se insertará como texto en vez de
// decodificarse de vuelta a bytes.
fn blob_columns(table: &str) -> &'static [&'static str] {
    match table {
        "students" => &["foto"],
        "app_preferences" => &["teacher_photo"],
        _ => &[],
    }
}

fn insert_row(conn: &Connection, table: &str, row: &Value) -> Result<(), ApiError> {
    let obj = row.as_object()
        .ok_or_else(|| ApiError::bad_request(format!("Fila inválida en la tabla {table}.")))?;
    let json_cols = json_columns(table);
    let blob_cols = blob_columns(table);

    let mut columns: Vec<String> = Vec::with_capacity(obj.len());
    let mut values: Vec<SqlValue> = Vec::with_capacity(obj.len());
    for (col, val) in obj {
        columns.push(col.clone());
        if json_cols.contains(&col.as_str()) && !val.is_null() {
            let s = serde_json::to_string(val).map_err(ApiError::internal)?;
            values.push(SqlValue::Text(s));
        } else if json_cols.contains(&col.as_str()) {
            values.push(SqlValue::Null);
        } else if blob_cols.contains(&col.as_str()) && !val.is_null() {
            let s = val.as_str()
                .ok_or_else(|| ApiError::bad_request(format!("Columna BLOB {col} de {table} no es texto base64.")))?;
            let bytes = base64::engine::general_purpose::STANDARD.decode(s).map_err(ApiError::internal)?;
            values.push(SqlValue::Blob(bytes));
        } else if blob_cols.contains(&col.as_str()) {
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
            "INSERT INTO students (id, nombre, tutor1, foto, created_at, updated_at) VALUES ('s1','Ana', '{\"nombre\":\"Luis\"}', ?1, '2026-08-05T00:00:00Z', '2026-08-05T00:00:00Z')",
            [&[1u8, 2, 3, 255] as &[u8]],
        ).unwrap();
        conn.execute(
            "INSERT INTO academic_years (id, label, start_date, end_date, holidays, created_at, updated_at) VALUES ('y1','2026-2027','2026-09-01','2027-06-30','[{\"id\":\"h1\"}]','2026-08-05T00:00:00Z','2026-08-05T00:00:00Z')",
            [],
        ).unwrap();

        let dump = export_all(&conn).unwrap();
        assert_eq!(dump["shortcuts"].as_array().unwrap().len(), 1);
        assert_eq!(dump["students"][0]["tutor1"]["nombre"], "Luis");
        assert_eq!(dump["academic_years"][0]["holidays"][0]["id"], "h1");
        // La foto viaja como base64 dentro del JSON, no se descarta -- ver
        // el comentario de sqlite_ref_to_json/blob_columns más arriba.
        assert_eq!(dump["students"][0]["foto"], "AQID/w==");

        let mut conn2 = db::test_connection();
        import_all(&mut conn2, &dump).unwrap();

        let shortcuts_after = crate::routers::dispatch(&conn2, "GET", "/shortcuts", None).unwrap();
        assert_eq!(shortcuts_after.as_array().unwrap().len(), 1);
        assert_eq!(shortcuts_after[0]["label"], "Aula");

        let foto_after: Vec<u8> = conn2.query_row("SELECT foto FROM students WHERE id = 's1'", [], |r| r.get(0)).unwrap();
        assert_eq!(foto_after, vec![1u8, 2, 3, 255]);

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
