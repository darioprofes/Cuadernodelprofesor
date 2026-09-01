use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::db;
use crate::error::ApiError;

use super::merge_object;

// Singleton (id = 1) -- mismo criterio que app_preferences en el backend
// web. GET siempre responde algo (valores por defecto si la fila no existe
// todavía), PUT hace upsert.
//
// teacher_name/teacher_profile/teacher_notes: Perfil Docente (mismos campos
// que api/app/migrations/0014_teacher_profile, 0019_teacher_notes,
// 0020_teacher_personal_data en el backend web) -- se habían dejado fuera
// del primer paso a escritorio, ver migrations/0008_teacher_profile_and_sa_fields.sql.
// teacherHasPhoto es un campo CALCULADO (teacher_photo IS NOT NULL), igual
// que en el backend web -- la foto en sí viaja aparte (ver get/set/delete_photo
// más abajo), nunca dentro de este JSON.
pub fn get(conn: &Connection) -> Result<Value, ApiError> {
    let row = conn.query_row(
        "SELECT layout_mode, default_calendar_view, grade_scale, teacher_name, teacher_profile, teacher_notes, teacher_photo IS NOT NULL FROM app_preferences WHERE id = 1",
        [],
        |row| {
            let layout_mode: Option<String> = row.get(0)?;
            let default_calendar_view: Option<String> = row.get(1)?;
            let grade_scale: String = row.get(2)?;
            let teacher_name: String = row.get(3)?;
            let teacher_profile: String = row.get(4)?;
            let teacher_notes: String = row.get(5)?;
            let teacher_has_photo: bool = row.get(6)?;
            Ok((layout_mode, default_calendar_view, grade_scale, teacher_name, teacher_profile, teacher_notes, teacher_has_photo))
        },
    );

    match row {
        Ok((layout_mode, default_calendar_view, grade_scale, teacher_name, teacher_profile, teacher_notes, teacher_has_photo)) => Ok(json!({
            "layoutMode": layout_mode,
            "defaultCalendarView": default_calendar_view,
            "gradeScale": serde_json::from_str::<Value>(&grade_scale).unwrap_or_else(|_| json!([])),
            "teacherName": teacher_name,
            "teacherProfile": serde_json::from_str::<Value>(&teacher_profile).unwrap_or_else(|_| json!([])),
            "teacherNotes": teacher_notes,
            "teacherHasPhoto": teacher_has_photo,
        })),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(json!({
            "layoutMode": Value::Null,
            "defaultCalendarView": Value::Null,
            "gradeScale": Value::Array(vec![]),
            "teacherName": "",
            "teacherProfile": Value::Array(vec![]),
            "teacherNotes": "",
            "teacherHasPhoto": false,
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
    let teacher_name = merged.get("teacherName").and_then(Value::as_str).unwrap_or("");
    let teacher_profile = merged.get("teacherProfile").cloned().unwrap_or_else(|| json!([]));
    let teacher_profile_str = serde_json::to_string(&teacher_profile).map_err(ApiError::internal)?;
    let teacher_notes = merged.get("teacherNotes").and_then(Value::as_str).unwrap_or("");

    // teacher_photo/teacher_photo_content_type quedan fuera a propósito de
    // este INSERT/UPDATE (ON CONFLICT no los toca): viajan por
    // get/set/delete_teacher_photo, nunca por aquí -- mismo motivo que
    // teacherHasPhoto es de solo lectura en el JSON de arriba.
    conn.execute(
        "INSERT INTO app_preferences (id, layout_mode, default_calendar_view, grade_scale, teacher_name, teacher_profile, teacher_notes, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
            layout_mode = excluded.layout_mode,
            default_calendar_view = excluded.default_calendar_view,
            grade_scale = excluded.grade_scale,
            teacher_name = excluded.teacher_name,
            teacher_profile = excluded.teacher_profile,
            teacher_notes = excluded.teacher_notes,
            updated_at = excluded.updated_at",
        params![layout_mode, default_calendar_view, grade_scale_str, teacher_name, teacher_profile_str, teacher_notes, db::now_iso()],
    )?;
    get(conn)
}

// Foto de perfil del profesor: mismo patrón que services/photos.rs (fotos
// de alumnado) pero sobre la fila única de preferencias en vez de por id.
// Si la fila de app_preferences todavía no existe (nunca se ha guardado
// nada), la crea con sus DEFAULT antes de fijar la foto -- a diferencia de
// update() de arriba, aquí no hay un "current" que journalear primero.
pub fn get_photo(conn: &Connection) -> Result<Option<(Vec<u8>, String)>, ApiError> {
    let result = conn.query_row(
        "SELECT teacher_photo, teacher_photo_content_type FROM app_preferences WHERE id = 1 AND teacher_photo IS NOT NULL",
        [],
        |row| {
            let bytes: Vec<u8> = row.get(0)?;
            let content_type: Option<String> = row.get(1)?;
            Ok((bytes, content_type))
        },
    );
    match result {
        Ok((bytes, content_type)) => Ok(Some((
            bytes,
            content_type.unwrap_or_else(|| "application/octet-stream".to_string()),
        ))),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn set_photo(conn: &Connection, bytes: Vec<u8>, content_type: &str) -> Result<(), ApiError> {
    conn.execute(
        "INSERT INTO app_preferences (id, grade_scale, updated_at, teacher_photo, teacher_photo_content_type)
         VALUES (1, '[]', ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
            teacher_photo = excluded.teacher_photo,
            teacher_photo_content_type = excluded.teacher_photo_content_type,
            updated_at = excluded.updated_at",
        params![db::now_iso(), bytes, content_type],
    )?;
    Ok(())
}

pub fn delete_photo(conn: &Connection) -> Result<(), ApiError> {
    conn.execute(
        "UPDATE app_preferences SET teacher_photo = NULL, teacher_photo_content_type = NULL, updated_at = ? WHERE id = 1",
        params![db::now_iso()],
    )?;
    Ok(())
}
