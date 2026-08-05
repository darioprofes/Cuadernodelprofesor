use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

use crate::db;
use crate::error::{self, ApiError};

use super::merge_object;

// Sin control de concurrencia optimista aquí (a diferencia del backend web,
// que compara expectedUpdatedAt): en escritorio hay un único proceso
// escritor, no hace falta -- ver plan, Fase 7, "Qué no cambia". Si el
// frontend manda expectedUpdatedAt (StudentPatch lo permite en el
// contrato compartido), simplemente se ignora: no es una columna real.
const COLUMNS: &str = "id, nombre, primer_apellido, segundo_apellido, fecha_nacimiento, dni, \
    telefono_urgencias, tutor1, tutor2, domicilio_direccion, domicilio_localidad, \
    domicilio_codigo_postal, domicilio_telefono, alergias, enfermedades_relevantes, \
    medicacion_habitual, intolerancias_alimentarias, observaciones_sanitarias, \
    autorizacion_imagen, autorizacion_salidas, foto_content_type, created_at, updated_at";

fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let tutor1: Option<String> = row.get(7)?;
    let tutor2: Option<String> = row.get(8)?;
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "nombre": row.get::<_, Option<String>>(1)?,
        "primerApellido": row.get::<_, Option<String>>(2)?,
        "segundoApellido": row.get::<_, Option<String>>(3)?,
        "fechaNacimiento": row.get::<_, Option<String>>(4)?,
        "dni": row.get::<_, Option<String>>(5)?,
        "telefonoUrgencias": row.get::<_, Option<String>>(6)?,
        "tutor1": tutor1.and_then(|s| serde_json::from_str::<Value>(&s).ok()),
        "tutor2": tutor2.and_then(|s| serde_json::from_str::<Value>(&s).ok()),
        "domicilioDireccion": row.get::<_, Option<String>>(9)?,
        "domicilioLocalidad": row.get::<_, Option<String>>(10)?,
        "domicilioCodigoPostal": row.get::<_, Option<String>>(11)?,
        "domicilioTelefono": row.get::<_, Option<String>>(12)?,
        "alergias": row.get::<_, Option<String>>(13)?,
        "enfermedadesRelevantes": row.get::<_, Option<String>>(14)?,
        "medicacionHabitual": row.get::<_, Option<String>>(15)?,
        "intoleranciasAlimentarias": row.get::<_, Option<String>>(16)?,
        "observacionesSanitarias": row.get::<_, Option<String>>(17)?,
        "autorizacionImagen": row.get::<_, Option<bool>>(18)?,
        "autorizacionSalidas": row.get::<_, Option<bool>>(19)?,
        "fotoContentType": row.get::<_, Option<String>>(20)?,
        "createdAt": row.get::<_, String>(21)?,
        "updatedAt": row.get::<_, String>(22)?,
    }))
}

pub fn get_one(conn: &Connection, id: &str) -> Result<Option<Value>, ApiError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM students WHERE id = ?"))?;
    let mut rows = stmt.query_map(params![id], row_to_json)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn list(conn: &Connection) -> Result<Value, ApiError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM students ORDER BY primer_apellido, segundo_apellido, nombre"
    ))?;
    let rows = stmt.query_map([], row_to_json)?;
    let items: Result<Vec<Value>, _> = rows.collect();
    Ok(Value::Array(items?))
}

fn tutor_json(value: Option<&Value>) -> Result<Option<String>, ApiError> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(v) => serde_json::to_string(v).map(Some).map_err(ApiError::internal),
    }
}

pub fn create(conn: &Connection, body: Value) -> Result<Value, ApiError> {
    let id = db::new_uuid();
    let now = db::now_iso();
    let s = |k: &str| body.get(k).and_then(Value::as_str);
    let b = |k: &str| body.get(k).and_then(Value::as_bool);
    let tutor1 = tutor_json(body.get("tutor1"))?;
    let tutor2 = tutor_json(body.get("tutor2"))?;

    conn.execute(
        "INSERT INTO students (
            id, nombre, primer_apellido, segundo_apellido, fecha_nacimiento, dni,
            telefono_urgencias, tutor1, tutor2, domicilio_direccion, domicilio_localidad,
            domicilio_codigo_postal, domicilio_telefono, alergias, enfermedades_relevantes,
            medicacion_habitual, intolerancias_alimentarias, observaciones_sanitarias,
            autorizacion_imagen, autorizacion_salidas, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        params![
            id, s("nombre"), s("primerApellido"), s("segundoApellido"), s("fechaNacimiento"), s("dni"),
            s("telefonoUrgencias"), tutor1, tutor2, s("domicilioDireccion"), s("domicilioLocalidad"),
            s("domicilioCodigoPostal"), s("domicilioTelefono"), s("alergias"), s("enfermedadesRelevantes"),
            s("medicacionHabitual"), s("intoleranciasAlimentarias"), s("observacionesSanitarias"),
            b("autorizacionImagen"), b("autorizacionSalidas"), now.clone(), now,
        ],
    )?;
    get_one(conn, &id)?.ok_or_else(|| ApiError::internal("no se pudo releer el alumno/a recién creado"))
}

pub fn update(conn: &Connection, id: &str, body: Value) -> Result<Value, ApiError> {
    let current = get_one(conn, id)?.ok_or_else(|| ApiError::not_found("Alumno/a no encontrado/a."))?;
    let merged = merge_object(&current, &body);
    let s = |k: &str| merged.get(k).and_then(Value::as_str);
    let b = |k: &str| merged.get(k).and_then(Value::as_bool);
    let tutor1 = tutor_json(merged.get("tutor1"))?;
    let tutor2 = tutor_json(merged.get("tutor2"))?;

    conn.execute(
        "UPDATE students SET nombre=?, primer_apellido=?, segundo_apellido=?, fecha_nacimiento=?, dni=?, \
         telefono_urgencias=?, tutor1=?, tutor2=?, domicilio_direccion=?, domicilio_localidad=?, \
         domicilio_codigo_postal=?, domicilio_telefono=?, alergias=?, enfermedades_relevantes=?, \
         medicacion_habitual=?, intolerancias_alimentarias=?, observaciones_sanitarias=?, \
         autorizacion_imagen=?, autorizacion_salidas=?, updated_at=? WHERE id=?",
        params![
            s("nombre"), s("primerApellido"), s("segundoApellido"), s("fechaNacimiento"), s("dni"),
            s("telefonoUrgencias"), tutor1, tutor2, s("domicilioDireccion"), s("domicilioLocalidad"),
            s("domicilioCodigoPostal"), s("domicilioTelefono"), s("alergias"), s("enfermedadesRelevantes"),
            s("medicacionHabitual"), s("intoleranciasAlimentarias"), s("observacionesSanitarias"),
            b("autorizacionImagen"), b("autorizacionSalidas"), db::now_iso(), id,
        ],
    )?;
    get_one(conn, id)?.ok_or_else(|| ApiError::internal("no se pudo releer el alumno/a tras actualizar"))
}

pub fn delete(conn: &Connection, id: &str) -> Result<Value, ApiError> {
    let changed = conn
        .execute("DELETE FROM students WHERE id = ?", params![id])
        .map_err(|e| error::conflict_or_internal(
            e,
            "No se puede borrar: tiene matrículas (y posiblemente notas) asociadas en algún curso académico.",
        ))?;
    if changed == 0 {
        return Err(ApiError::not_found("Alumno/a no encontrado/a."));
    }
    Ok(Value::Null)
}
