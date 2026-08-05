use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

// Singleton (id = 1) -- mismo criterio que app_preferences en el backend
// web. GET siempre responde algo (valores por defecto si la fila no existe
// todavía), PUT hace upsert.
pub fn get(conn: &Connection) -> Result<Value, ApiError> {
    let row = conn.query_row(
        "SELECT layout_mode, default_calendar_view, grade_scale FROM app_preferences WHERE id = 1",
        [],
        |row| {
            let layout_mode: Option<String> = row.get(0)?;
            let default_calendar_view: Option<String> = row.get(1)?;
            let grade_scale: String = row.get(2)?;
            Ok((layout_mode, default_calendar_view, grade_scale))
        },
    );

    match row {
        Ok((layout_mode, default_calendar_view, grade_scale)) => Ok(json!({
            "layoutMode": layout_mode,
            "defaultCalendarView": default_calendar_view,
            "gradeScale": serde_json::from_str::<Value>(&grade_scale).unwrap_or_else(|_| json!([])),
        })),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(json!({
            "layoutMode": Value::Null,
            "defaultCalendarView": Value::Null,
            "gradeScale": Value::Array(vec![]),
        })),
        Err(e) => Err(e.into()),
    }
}

pub fn update(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let current = get(conn)?;
    let merged = merge_object(&current, &body);

    let layout_mode = merged.get("layoutMode").and_then(Value::as_str);
    let default_calendar_view = merged.get("defaultCalendarView").and_then(Value::as_str);
    let grade_scale = merged.get("gradeScale").cloned().unwrap_or_else(|| json!([]));
    let grade_scale_str = serde_json::to_string(&grade_scale).map_err(ApiError::internal)?;

    conn.execute(
        "INSERT INTO app_preferences (id, layout_mode, default_calendar_view, grade_scale, updated_at)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
            layout_mode = excluded.layout_mode,
            default_calendar_view = excluded.default_calendar_view,
            grade_scale = excluded.grade_scale,
            updated_at = excluded.updated_at",
        params![layout_mode, default_calendar_view, grade_scale_str, db::now_iso()],
    )?;
    get(conn)
}
