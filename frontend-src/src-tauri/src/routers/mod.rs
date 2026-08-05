use rusqlite::Connection;
use serde_json::Value;

use crate::error::ApiError;
use crate::services::{
    academic_years, basic_knowledge, classes, courses, evaluation_criteria, evaluation_tools,
    enrollments, key_competences, preferences, programming_units, shortcuts, specific_competences,
    students,
};

fn require_body(body: Option<Value>) -> Result<Value, ApiError> {
    body.ok_or_else(|| ApiError::bad_request("Falta el cuerpo de la petición"))
}

fn found(item: Option<Value>, detail: &str) -> Result<Value, ApiError> {
    item.ok_or_else(|| ApiError::not_found(detail))
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

        // ---- Bloque 3: currículo/referencia ----
        ("GET", ["students"]) => students::list(conn),
        ("POST", ["students"]) => students::create(conn, require_body(body)?),
        ("GET", ["students", id]) => found(students::get_one(conn, id)?, "Alumno/a no encontrado/a."),
        ("PATCH", ["students", id]) => students::update(conn, id, require_body(body)?),
        ("DELETE", ["students", id]) => students::delete(conn, id),

        ("GET", ["courses"]) => courses::list(conn),
        ("POST", ["courses"]) => courses::create(conn, require_body(body)?),
        ("GET", ["courses", id]) => found(courses::get_one(conn, id)?, "Curso no encontrado."),
        ("PATCH", ["courses", id]) => courses::update(conn, id, require_body(body)?),
        ("DELETE", ["courses", id]) => courses::delete(conn, id),

        ("GET", ["key-competences"]) => key_competences::list(conn),
        ("POST", ["key-competences"]) => key_competences::create(conn, require_body(body)?),
        ("GET", ["key-competences", id]) => found(key_competences::get_one(conn, id)?, "Competencia clave no encontrada."),
        ("PATCH", ["key-competences", id]) => key_competences::update(conn, id, require_body(body)?),
        ("DELETE", ["key-competences", id]) => key_competences::delete(conn, id),
        ("POST", ["key-competences", key_competence_id, "descriptors"]) =>
            key_competences::create_descriptor(conn, key_competence_id, require_body(body)?),
        ("PATCH", ["key-competences", "descriptors", id]) => key_competences::update_descriptor(conn, id, require_body(body)?),
        ("DELETE", ["key-competences", "descriptors", id]) => key_competences::delete_descriptor(conn, id),

        ("GET", ["courses", course_id, "competences"]) => specific_competences::list(conn, course_id),
        ("POST", ["courses", course_id, "competences"]) => specific_competences::create(conn, course_id, require_body(body)?),
        ("GET", ["competences", id]) => found(specific_competences::get_one(conn, id)?, "Competencia específica no encontrada."),
        ("PATCH", ["competences", id]) => specific_competences::update(conn, id, require_body(body)?),
        ("DELETE", ["competences", id]) => specific_competences::delete(conn, id),
        ("POST", ["competences", competence_id, "descriptors"]) => {
            let descriptor_id = require_body(body)?
                .get("descriptorId").and_then(Value::as_str)
                .ok_or_else(|| ApiError::bad_request("descriptorId es obligatorio"))?
                .to_string();
            specific_competences::link_descriptor(conn, competence_id, &descriptor_id)
        }
        ("DELETE", ["competences", competence_id, "descriptors", descriptor_id]) =>
            specific_competences::unlink_descriptor(conn, competence_id, descriptor_id),

        ("GET", ["courses", course_id, "criteria"]) => evaluation_criteria::list(conn, course_id),
        ("POST", ["courses", course_id, "criteria"]) => evaluation_criteria::create(conn, course_id, require_body(body)?),
        ("GET", ["criteria", id]) => found(evaluation_criteria::get_one(conn, id)?, "Criterio no encontrado."),
        ("PATCH", ["criteria", id]) => evaluation_criteria::update(conn, id, require_body(body)?),
        ("DELETE", ["criteria", id]) => evaluation_criteria::delete(conn, id),

        ("GET", ["courses", course_id, "basic-knowledge"]) => basic_knowledge::list(conn, course_id),
        ("POST", ["courses", course_id, "basic-knowledge"]) => basic_knowledge::create(conn, course_id, require_body(body)?),
        ("PATCH", ["basic-knowledge", id]) => basic_knowledge::update(conn, id, require_body(body)?),
        ("DELETE", ["basic-knowledge", id]) => basic_knowledge::delete(conn, id),

        ("GET", ["courses", course_id, "programming-units"]) => programming_units::list(conn, course_id),
        ("POST", ["courses", course_id, "programming-units"]) => programming_units::create(conn, course_id, require_body(body)?),
        ("PATCH", ["programming-units", id]) => programming_units::update(conn, id, require_body(body)?),
        ("DELETE", ["programming-units", id]) => programming_units::delete(conn, id),

        // ---- Bloque 4: curso académico + instancia ----
        ("GET", ["academic-years"]) => academic_years::list(conn),
        ("POST", ["academic-years"]) => academic_years::create(conn, require_body(body)?),
        ("GET", ["academic-years", id]) => found(academic_years::get_one(conn, id)?, "Curso académico no encontrado."),
        ("PATCH", ["academic-years", id]) => academic_years::update(conn, id, require_body(body)?),
        ("POST", ["academic-years", id, "activate"]) => academic_years::activate(conn, id),
        ("DELETE", ["academic-years", id]) => academic_years::delete(conn, id),

        ("GET", ["academic-years", year_id, "evaluation-periods"]) => academic_years::list_periods(conn, year_id),
        ("POST", ["academic-years", year_id, "evaluation-periods"]) => academic_years::create_period(conn, year_id, require_body(body)?),
        ("PATCH", ["academic-years", "evaluation-periods", id]) => academic_years::update_period(conn, id, require_body(body)?),
        ("DELETE", ["academic-years", "evaluation-periods", id]) => academic_years::delete_period(conn, id),

        ("GET", ["academic-years", year_id, "courses"]) => academic_years::list_year_courses(conn, year_id),
        ("POST", ["academic-years", year_id, "courses"]) => academic_years::create_year_course(conn, year_id, require_body(body)?),
        ("DELETE", ["academic-years", year_id, "courses", course_id]) => academic_years::delete_year_course(conn, year_id, course_id),

        ("GET", ["academic-years", year_id, "classes"]) => classes::list(conn, year_id),
        ("POST", ["academic-years", year_id, "classes"]) => classes::create(conn, year_id, require_body(body)?),
        ("GET", ["classes", id]) => found(classes::get_one(conn, id)?, "Clase no encontrada."),
        ("PATCH", ["classes", id]) => classes::update(conn, id, require_body(body)?),
        ("DELETE", ["classes", id]) => classes::delete(conn, id),

        ("GET", ["classes", class_id, "enrollments"]) => enrollments::list(conn, class_id),
        ("POST", ["classes", class_id, "enrollments"]) => {
            let payload = require_body(body)?;
            let student_id_field = payload.get("studentId").and_then(Value::as_str);
            let new_student_field = payload.get("newStudent").filter(|v| !v.is_null());
            match (student_id_field, new_student_field) {
                (Some(student_id), None) => enrollments::create(conn, class_id, student_id, &payload),
                (None, Some(new_student)) => {
                    let created_student = students::create(conn, new_student.clone())?;
                    let student_id = created_student["id"].as_str().unwrap().to_string();
                    enrollments::create(conn, class_id, &student_id, &payload)
                }
                _ => Err(ApiError::bad_request("Indica exactamente uno de studentId o newStudent.")),
            }
        }
        ("PATCH", ["enrollments", id]) => enrollments::update(conn, id, require_body(body)?),
        ("DELETE", ["enrollments", id]) => enrollments::delete(conn, id),

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

    #[test]
    fn students_crud_round_trip() {
        let conn = db::test_connection();

        let created = dispatch(
            &conn, "POST", "/students",
            Some(json!({"nombre": "Ana", "primerApellido": "García", "tutor1": {"nombre": "Luis", "telefono": "600111222"}})),
        ).unwrap();
        let id = created["id"].as_str().unwrap().to_string();
        assert_eq!(created["nombre"], "Ana");
        assert_eq!(created["tutor1"]["nombre"], "Luis");

        let fetched = dispatch(&conn, "GET", &format!("/students/{id}"), None).unwrap();
        assert_eq!(fetched["primerApellido"], "García");

        let updated = dispatch(&conn, "PATCH", &format!("/students/{id}"), Some(json!({"dni": "12345678A"}))).unwrap();
        assert_eq!(updated["dni"], "12345678A");
        assert_eq!(updated["nombre"], "Ana"); // conservado tras el patch parcial

        dispatch(&conn, "DELETE", &format!("/students/{id}"), None).unwrap();
        let err = dispatch(&conn, "GET", &format!("/students/{id}"), None).unwrap_err();
        assert_eq!(err.status, 404);
    }

    #[test]
    fn student_delete_conflicts_when_enrolled() {
        let conn = db::test_connection();
        let student = dispatch(&conn, "POST", "/students", Some(json!({"nombre": "Bea"}))).unwrap();
        let student_id = student["id"].as_str().unwrap().to_string();

        // classes/enrollments todavía no tienen servicio Rust (llega en el
        // bloque 4) -- se insertan directas por SQL solo para tener una fila
        // que dispare el ON DELETE RESTRICT real del baseline.
        conn.execute(
            "INSERT INTO academic_years (id, label, start_date, end_date, created_at, updated_at) VALUES ('y1','2026-2027','2026-09-01','2027-06-30','2026-08-05T00:00:00Z','2026-08-05T00:00:00Z')",
            [],
        ).unwrap();
        let course = dispatch(&conn, "POST", "/courses", Some(json!({"level": "1 ESO", "subject": "Biología"}))).unwrap();
        let course_id = course["id"].as_str().unwrap().to_string();
        conn.execute(
            "INSERT INTO classes (id, academic_year_id, course_id, created_at, updated_at) VALUES ('c1','y1',?,'2026-08-05T00:00:00Z','2026-08-05T00:00:00Z')",
            rusqlite::params![course_id],
        ).unwrap();
        conn.execute(
            "INSERT INTO enrollments (id, student_id, class_id, created_at, updated_at) VALUES ('e1',?,'c1','2026-08-05T00:00:00Z','2026-08-05T00:00:00Z')",
            rusqlite::params![student_id],
        ).unwrap();

        let err = dispatch(&conn, "DELETE", &format!("/students/{student_id}"), None).unwrap_err();
        assert_eq!(err.status, 409);
    }

    #[test]
    fn courses_crud_round_trip() {
        let conn = db::test_connection();

        let created = dispatch(&conn, "POST", "/courses", Some(json!({"level": "3 ESO", "subject": "Física y Química"}))).unwrap();
        let id = created["id"].as_str().unwrap().to_string();
        assert_eq!(created["type"], "academic");
        assert_eq!(created["pesoCriteriosManual"], false);

        let updated = dispatch(&conn, "PATCH", &format!("/courses/{id}"), Some(json!({"pesoCriteriosManual": true}))).unwrap();
        assert_eq!(updated["pesoCriteriosManual"], true);
        assert_eq!(updated["subject"], "Física y Química");

        dispatch(&conn, "DELETE", &format!("/courses/{id}"), None).unwrap();
        let err = dispatch(&conn, "GET", &format!("/courses/{id}"), None).unwrap_err();
        assert_eq!(err.status, 404);
    }

    #[test]
    fn key_competences_with_descriptors() {
        let conn = db::test_connection();

        let kc = dispatch(&conn, "POST", "/key-competences", Some(json!({"code": "CCL", "description": "Competencia en comunicación lingüística"}))).unwrap();
        let kc_id = kc["id"].as_str().unwrap().to_string();
        assert_eq!(kc["descriptors"], json!([]));

        let descriptor = dispatch(
            &conn, "POST", &format!("/key-competences/{kc_id}/descriptors"),
            Some(json!({"code": "CCL1", "description": "Se expresa oralmente", "stage": "eso"})),
        ).unwrap();
        let descriptor_id = descriptor["id"].as_str().unwrap().to_string();
        assert_eq!(descriptor["keyCompetenceId"], kc_id);

        let listed = dispatch(&conn, "GET", "/key-competences", None).unwrap();
        assert_eq!(listed[0]["descriptors"].as_array().unwrap().len(), 1);

        let updated_descriptor = dispatch(
            &conn, "PATCH", &format!("/key-competences/descriptors/{descriptor_id}"),
            Some(json!({"stage": "bachillerato"})),
        ).unwrap();
        assert_eq!(updated_descriptor["stage"], "bachillerato");
        assert_eq!(updated_descriptor["code"], "CCL1");

        dispatch(&conn, "DELETE", &format!("/key-competences/descriptors/{descriptor_id}"), None).unwrap();
        let kc_after = dispatch(&conn, "GET", &format!("/key-competences/{kc_id}"), None).unwrap();
        assert_eq!(kc_after["descriptors"], json!([]));
    }

    #[test]
    fn specific_competences_link_descriptors_and_conflict_on_delete() {
        let conn = db::test_connection();
        let course = dispatch(&conn, "POST", "/courses", Some(json!({"level": "1 ESO", "subject": "Lengua"}))).unwrap();
        let course_id = course["id"].as_str().unwrap().to_string();
        let kc = dispatch(&conn, "POST", "/key-competences", Some(json!({"code": "CCL", "description": "..."}))).unwrap();
        let kc_id = kc["id"].as_str().unwrap().to_string();
        let descriptor = dispatch(&conn, "POST", &format!("/key-competences/{kc_id}/descriptors"), Some(json!({"code": "CCL1", "description": "..."}))).unwrap();
        let descriptor_id = descriptor["id"].as_str().unwrap().to_string();

        let sc = dispatch(&conn, "POST", &format!("/courses/{course_id}/competences"), Some(json!({"code": "CE1", "description": "..."}))).unwrap();
        let sc_id = sc["id"].as_str().unwrap().to_string();
        assert_eq!(sc["keyCompetenceDescriptorIds"], json!([]));

        dispatch(&conn, "POST", &format!("/competences/{sc_id}/descriptors"), Some(json!({"descriptorId": descriptor_id}))).unwrap();
        let listed = dispatch(&conn, "GET", &format!("/courses/{course_id}/competences"), None).unwrap();
        assert_eq!(listed[0]["keyCompetenceDescriptorIds"], json!([descriptor_id]));

        dispatch(&conn, "DELETE", &format!("/competences/{sc_id}/descriptors/{descriptor_id}"), None).unwrap();
        let after_unlink = dispatch(&conn, "GET", &format!("/competences/{sc_id}"), None).unwrap();
        assert_eq!(after_unlink["keyCompetenceDescriptorIds"], json!([]));

        // Un criterio que referencia la competencia debe bloquear su borrado (RESTRICT).
        dispatch(&conn, "POST", &format!("/courses/{course_id}/criteria"), Some(json!({"competenceId": sc_id, "code": "1.1", "description": "..."}))).unwrap();
        let err = dispatch(&conn, "DELETE", &format!("/competences/{sc_id}"), None).unwrap_err();
        assert_eq!(err.status, 409);
    }

    #[test]
    fn evaluation_criteria_basic_knowledge_and_programming_units_round_trip() {
        let conn = db::test_connection();
        let course = dispatch(&conn, "POST", "/courses", Some(json!({"level": "2 ESO", "subject": "Matemáticas"}))).unwrap();
        let course_id = course["id"].as_str().unwrap().to_string();
        let sc = dispatch(&conn, "POST", &format!("/courses/{course_id}/competences"), Some(json!({"code": "CE1", "description": "..."}))).unwrap();
        let sc_id = sc["id"].as_str().unwrap().to_string();

        let criterion = dispatch(
            &conn, "POST", &format!("/courses/{course_id}/criteria"),
            Some(json!({"competenceId": sc_id, "code": "1.1", "description": "Resuelve problemas", "weight": 2.5})),
        ).unwrap();
        let criterion_id = criterion["id"].as_str().unwrap().to_string();
        assert_eq!(criterion["excludeFromWeighting"], false);
        let updated_criterion = dispatch(&conn, "PATCH", &format!("/criteria/{criterion_id}"), Some(json!({"weight": 3.0}))).unwrap();
        assert_eq!(updated_criterion["weight"], 3.0);

        let knowledge = dispatch(&conn, "POST", &format!("/courses/{course_id}/basic-knowledge"), Some(json!({"code": "A", "description": "Álgebra"}))).unwrap();
        let knowledge_id = knowledge["id"].as_str().unwrap().to_string();
        dispatch(&conn, "PATCH", &format!("/basic-knowledge/{knowledge_id}"), Some(json!({"description": "Álgebra básica"}))).unwrap();

        let unit = dispatch(
            &conn, "POST", &format!("/courses/{course_id}/programming-units"),
            Some(json!({"name": "UD1", "sessions": 8, "linkedCriteriaIds": [criterion_id], "linkedBasicKnowledgeIds": [knowledge_id]})),
        ).unwrap();
        let unit_id = unit["id"].as_str().unwrap().to_string();
        assert_eq!(unit["linkedCriteriaIds"], json!([criterion_id]));

        let listed = dispatch(&conn, "GET", &format!("/courses/{course_id}/programming-units"), None).unwrap();
        assert_eq!(listed.as_array().unwrap().len(), 1);

        dispatch(&conn, "DELETE", &format!("/programming-units/{unit_id}"), None).unwrap();
        dispatch(&conn, "DELETE", &format!("/basic-knowledge/{knowledge_id}"), None).unwrap();
        dispatch(&conn, "DELETE", &format!("/criteria/{criterion_id}"), None).unwrap();
        let listed_after = dispatch(&conn, "GET", &format!("/courses/{course_id}/programming-units"), None).unwrap();
        assert_eq!(listed_after.as_array().unwrap().len(), 0);
    }

    #[test]
    fn academic_years_seed_default_periods_and_activate_is_exclusive() {
        let conn = db::test_connection();

        let year1 = dispatch(&conn, "POST", "/academic-years", Some(json!({"label": "2025-2026", "startDate": "2025-09-01", "endDate": "2026-06-30"}))).unwrap();
        let year1_id = year1["id"].as_str().unwrap().to_string();
        assert_eq!(year1["isCurrent"], false);

        let periods = dispatch(&conn, "GET", &format!("/academic-years/{year1_id}/evaluation-periods"), None).unwrap();
        assert_eq!(periods.as_array().unwrap().len(), 3);

        let year2 = dispatch(&conn, "POST", "/academic-years", Some(json!({"label": "2026-2027", "startDate": "2026-09-01", "endDate": "2027-06-30"}))).unwrap();
        let year2_id = year2["id"].as_str().unwrap().to_string();

        dispatch(&conn, "POST", &format!("/academic-years/{year1_id}/activate"), None).unwrap();
        dispatch(&conn, "POST", &format!("/academic-years/{year2_id}/activate"), None).unwrap();

        let year1_after = dispatch(&conn, "GET", &format!("/academic-years/{year1_id}"), None).unwrap();
        let year2_after = dispatch(&conn, "GET", &format!("/academic-years/{year2_id}"), None).unwrap();
        assert_eq!(year1_after["isCurrent"], false);
        assert_eq!(year2_after["isCurrent"], true);
    }

    #[test]
    fn academic_year_courses_link_conflicts_and_blocks() {
        let conn = db::test_connection();
        let year = dispatch(&conn, "POST", "/academic-years", Some(json!({"label": "2026-2027", "startDate": "2026-09-01", "endDate": "2027-06-30"}))).unwrap();
        let year_id = year["id"].as_str().unwrap().to_string();
        let course = dispatch(&conn, "POST", "/courses", Some(json!({"level": "1 ESO", "subject": "Música"}))).unwrap();
        let course_id = course["id"].as_str().unwrap().to_string();

        dispatch(&conn, "POST", &format!("/academic-years/{year_id}/courses"), Some(json!({"courseId": course_id}))).unwrap();
        let duplicate_err = dispatch(&conn, "POST", &format!("/academic-years/{year_id}/courses"), Some(json!({"courseId": course_id}))).unwrap_err();
        assert_eq!(duplicate_err.status, 409);

        let missing_course_err = dispatch(&conn, "POST", &format!("/academic-years/{year_id}/courses"), Some(json!({"courseId": "no-existe"}))).unwrap_err();
        assert_eq!(missing_course_err.status, 404);

        dispatch(&conn, "POST", &format!("/academic-years/{year_id}/classes"), Some(json!({"courseId": course_id, "grupo": "A"}))).unwrap();
        let blocked_err = dispatch(&conn, "DELETE", &format!("/academic-years/{year_id}/courses/{course_id}"), None).unwrap_err();
        assert_eq!(blocked_err.status, 409);
    }

    #[test]
    fn classes_and_enrollments_full_chain() {
        let conn = db::test_connection();
        let year = dispatch(&conn, "POST", "/academic-years", Some(json!({"label": "2026-2027", "startDate": "2026-09-01", "endDate": "2027-06-30"}))).unwrap();
        let year_id = year["id"].as_str().unwrap().to_string();
        let course = dispatch(&conn, "POST", "/courses", Some(json!({"level": "3 ESO", "subject": "Historia"}))).unwrap();
        let course_id = course["id"].as_str().unwrap().to_string();

        let class = dispatch(&conn, "POST", &format!("/academic-years/{year_id}/classes"), Some(json!({"courseId": course_id, "grupo": "B"}))).unwrap();
        let class_id = class["id"].as_str().unwrap().to_string();
        assert_eq!(class["grupo"], "B");

        // Alta con persona nueva en el mismo paso (newStudent).
        let enrollment1 = dispatch(
            &conn, "POST", &format!("/classes/{class_id}/enrollments"),
            Some(json!({"newStudent": {"nombre": "Carla", "primerApellido": "Ruiz"}})),
        ).unwrap();
        let student1_id = enrollment1["studentId"].as_str().unwrap().to_string();
        assert!(!student1_id.is_empty());

        // Confirma que la persona quedó realmente creada en /students.
        let student_check = dispatch(&conn, "GET", &format!("/students/{student1_id}"), None).unwrap();
        assert_eq!(student_check["nombre"], "Carla");

        // Alta de persona ya existente en una segunda clase.
        let student2 = dispatch(&conn, "POST", "/students", Some(json!({"nombre": "Diego"}))).unwrap();
        let student2_id = student2["id"].as_str().unwrap().to_string();
        let enrollment2 = dispatch(
            &conn, "POST", &format!("/classes/{class_id}/enrollments"),
            Some(json!({"studentId": student2_id, "planoX": 10.5, "planoY": 20.0})),
        ).unwrap();
        assert_eq!(enrollment2["planoX"], 10.5);

        // Ni studentId ni newStudent -> 400; ambos a la vez -> 400.
        let neither_err = dispatch(&conn, "POST", &format!("/classes/{class_id}/enrollments"), Some(json!({}))).unwrap_err();
        assert_eq!(neither_err.status, 400);
        let both_err = dispatch(
            &conn, "POST", &format!("/classes/{class_id}/enrollments"),
            Some(json!({"studentId": student2_id, "newStudent": {"nombre": "X"}})),
        ).unwrap_err();
        assert_eq!(both_err.status, 400);

        let listed = dispatch(&conn, "GET", &format!("/classes/{class_id}/enrollments"), None).unwrap();
        assert_eq!(listed.as_array().unwrap().len(), 2);

        let enrollment1_id = enrollment1["id"].as_str().unwrap().to_string();
        let updated = dispatch(&conn, "PATCH", &format!("/enrollments/{enrollment1_id}"), Some(json!({"haRepetidoCurso": true}))).unwrap();
        assert_eq!(updated["haRepetidoCurso"], true);

        // Borrar la clase desmatricula (CASCADE) sin borrar las personas.
        dispatch(&conn, "DELETE", &format!("/classes/{class_id}"), None).unwrap();
        let students_after = dispatch(&conn, "GET", "/students", None).unwrap();
        assert_eq!(students_after.as_array().unwrap().len(), 2);
        let enrollments_after_err = dispatch(&conn, "PATCH", &format!("/enrollments/{enrollment1_id}"), Some(json!({}))).unwrap_err();
        assert_eq!(enrollments_after_err.status, 404);
    }
}
