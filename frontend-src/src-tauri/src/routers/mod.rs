use rusqlite::Connection;
use serde_json::Value;

use crate::error::ApiError;
use crate::services::{evaluation_tools, preferences, shortcuts};

fn require_body(body: Option<Value>) -> Result<Value, ApiError> {
    body.ok_or_else(|| ApiError::bad_request("Falta el cuerpo de la petición"))
}

// Mini-router: despacha (método, segmentos de ruta) a la función de
// servicio correspondiente -- mismo criterio de agrupamiento que
// api/app/routers/*.py, pero como un único comando Tauri en vez de ~80
// comandos individuales (ver plan, sección "Decisión de arquitectura").
// Las rutas nuevas se añaden aquí a medida que cada bloque de la Fase 7
// migra sus entidades correspondientes.
pub fn dispatch(conn: &Connection, method: &str, path: &str, body: Option<Value>) -> Result<Value, ApiError> {
    let segments: Vec<&str> = path.trim_matches('/').split('/').filter(|s| !s.is_empty()).collect();

    match (method, segments.as_slice()) {
        ("GET", ["shortcuts"]) => shortcuts::list(conn),
        ("POST", ["shortcuts"]) => shortcuts::create(conn, require_body(body)?),
        ("PATCH", ["shortcuts", id]) => shortcuts::update(conn, id, require_body(body)?),
        ("DELETE", ["shortcuts", id]) => shortcuts::delete(conn, id),

        ("GET", ["preferences"]) => preferences::get(conn),
        ("PUT", ["preferences"]) => preferences::update(conn, require_body(body)?),

        ("GET", ["evaluation-tools"]) => evaluation_tools::list(conn),
        ("POST", ["evaluation-tools"]) => evaluation_tools::create(conn, require_body(body)?),
        ("PATCH", ["evaluation-tools", id]) => evaluation_tools::update(conn, id, require_body(body)?),
        ("DELETE", ["evaluation-tools", id]) => evaluation_tools::delete(conn, id),

        _ => Err(ApiError { status: 404, detail: format!("Ruta no encontrada: {method} {path}") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use serde_json::json;

    #[test]
    fn unknown_route_is_404() {
        let conn = db::test_connection();
        let err = dispatch(&conn, "GET", "/no-existe", None).unwrap_err();
        assert_eq!(err.status, 404);
    }

    #[test]
    fn shortcuts_crud_round_trip() {
        let conn = db::test_connection();

        let created = dispatch(
            &conn, "POST", "/shortcuts",
            Some(json!({"label": "Aula Virtual", "url": "https://aula.example", "sortOrder": 2})),
        ).unwrap();
        let id = created["id"].as_str().unwrap().to_string();
        assert_eq!(created["label"], "Aula Virtual");
        assert_eq!(created["sortOrder"], 2);

        let listed = dispatch(&conn, "GET", "/shortcuts", None).unwrap();
        assert_eq!(listed.as_array().unwrap().len(), 1);

        let updated = dispatch(
            &conn, "PATCH", &format!("/shortcuts/{id}"),
            Some(json!({"label": "Classroom"})),
        ).unwrap();
        assert_eq!(updated["label"], "Classroom");
        assert_eq!(updated["url"], "https://aula.example"); // no tocado por el patch, debe conservarse

        dispatch(&conn, "DELETE", &format!("/shortcuts/{id}"), None).unwrap();
        let listed_after = dispatch(&conn, "GET", "/shortcuts", None).unwrap();
        assert_eq!(listed_after.as_array().unwrap().len(), 0);

        let err = dispatch(&conn, "DELETE", &format!("/shortcuts/{id}"), None).unwrap_err();
        assert_eq!(err.status, 404);
    }

    #[test]
    fn preferences_defaults_then_partial_update() {
        let conn = db::test_connection();

        let defaults = dispatch(&conn, "GET", "/preferences", None).unwrap();
        assert_eq!(defaults["layoutMode"], Value::Null);
        assert_eq!(defaults["gradeScale"], json!([]));

        let updated = dispatch(
            &conn, "PUT", "/preferences",
            Some(json!({"layoutMode": "compact"})),
        ).unwrap();
        assert_eq!(updated["layoutMode"], "compact");

        // Un segundo PUT que solo toca otro campo no debe perder layoutMode.
        let updated2 = dispatch(
            &conn, "PUT", "/preferences",
            Some(json!({"defaultCalendarView": "week"})),
        ).unwrap();
        assert_eq!(updated2["layoutMode"], "compact");
        assert_eq!(updated2["defaultCalendarView"], "week");
    }

    #[test]
    fn evaluation_tools_crud_round_trip() {
        let conn = db::test_connection();

        let created = dispatch(
            &conn, "POST", "/evaluation-tools",
            Some(json!({"type": "checklist", "name": "Rúbrica oral", "items": [{"id": "1", "text": "Habla claro"}]})),
        ).unwrap();
        let id = created["id"].as_str().unwrap().to_string();
        assert_eq!(created["items"].as_array().unwrap().len(), 1);

        let updated = dispatch(
            &conn, "PATCH", &format!("/evaluation-tools/{id}"),
            Some(json!({"name": "Rúbrica oral (v2)"})),
        ).unwrap();
        assert_eq!(updated["name"], "Rúbrica oral (v2)");
        assert_eq!(updated["type"], "checklist");

        dispatch(&conn, "DELETE", &format!("/evaluation-tools/{id}"), None).unwrap();
        let err = dispatch(&conn, "PATCH", &format!("/evaluation-tools/{id}"), Some(json!({"name": "x"}))).unwrap_err();
        assert_eq!(err.status, 404);
    }
}
