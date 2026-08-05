use rusqlite::{params, Connection};

use crate::error::ApiError;

// A diferencia del resto del backend (JSON vía api_request), las fotos
// viajan como bytes crudos -- por comandos Tauri dedicados (igual que
// load_db/save_db ya hacían) para subir/borrar, y por el protocolo
// studentphoto:// (ver lib.rs) para servirlas a un <img>, evitando el
// mismo problema de inflar cada respuesta JSON que ya se evitó en web con
// BYTEA + GET /photos/{id} aparte.

pub fn get(conn: &Connection, student_id: &str) -> Result<Option<(Vec<u8>, String)>, ApiError> {
    let result = conn.query_row(
        "SELECT foto, foto_content_type FROM students WHERE id = ? AND foto IS NOT NULL",
        params![student_id],
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

pub fn set(conn: &Connection, student_id: &str, bytes: Vec<u8>, content_type: &str) -> Result<(), ApiError> {
    let changed = conn.execute(
        "UPDATE students SET foto = ?, foto_content_type = ? WHERE id = ?",
        params![bytes, content_type, student_id],
    )?;
    if changed == 0 {
        return Err(ApiError::not_found("Alumno/a no encontrado/a."));
    }
    Ok(())
}

pub fn delete(conn: &Connection, student_id: &str) -> Result<(), ApiError> {
    let changed = conn.execute(
        "UPDATE students SET foto = NULL, foto_content_type = NULL WHERE id = ?",
        params![student_id],
    )?;
    if changed == 0 {
        return Err(ApiError::not_found("Alumno/a no encontrado/a."));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn set_get_delete_round_trip() {
        let conn = db::test_connection();
        conn.execute(
            "INSERT INTO students (id, nombre, created_at, updated_at) VALUES ('s1', 'Ana', '2026-08-05T00:00:00Z', '2026-08-05T00:00:00Z')",
            [],
        ).unwrap();

        assert_eq!(get(&conn, "s1").unwrap(), None);

        set(&conn, "s1", vec![1, 2, 3], "image/png").unwrap();
        let (bytes, content_type) = get(&conn, "s1").unwrap().unwrap();
        assert_eq!(bytes, vec![1, 2, 3]);
        assert_eq!(content_type, "image/png");

        delete(&conn, "s1").unwrap();
        assert_eq!(get(&conn, "s1").unwrap(), None);

        let err = set(&conn, "no-existe", vec![1], "image/png").unwrap_err();
        assert_eq!(err.status, 404);
        let err = delete(&conn, "no-existe").unwrap_err();
        assert_eq!(err.status, 404);
    }
}
