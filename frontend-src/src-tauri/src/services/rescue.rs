// Modo rescate: si el servidor web falla, traer la última copia de
// seguridad automática (cifrada, subida por el servidor a un repo privado
// de GitHub -- ver el cron del servidor, farodocente-backups) y
// restaurarla aquí, en escritorio, para poder seguir trabajando esos
// días. Apagado por defecto -- solo actúa si el profesor lo ha
// configurado a mano en Ajustes (repo, token de GitHub, ruta a su clave
// privada age). La app de escritorio normal, sin configurar esto, no
// habla con GitHub en ningún momento.
//
// La configuración (token de GitHub, ruta a la clave privada) vive en un
// fichero JSON propio (rescue_config.json), separado a propósito del
// SQLite de dominio -- así nunca viaja dentro de un export_all()/
// import_all() de backup.rs, ni por accidente.

use std::io::{Read, Write};

use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::error::ApiError;

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct RescueConfig {
    // "usuario/repositorio", p.ej. "darioprofes/farodocente-backups"
    pub repo: Option<String>,
    pub github_token: Option<String>,
    // Ruta absoluta al fichero rescue-key.txt generado con age-keygen.
    // Se lee del disco cada vez, nunca se copia su contenido aquí.
    pub age_key_path: Option<String>,
}

fn config_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    crate::db::data_dir(app).join("rescue_config.json")
}

pub fn get_config(app: &tauri::AppHandle) -> Result<RescueConfig, ApiError> {
    let path = config_path(app);
    if !path.exists() {
        return Ok(RescueConfig::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(ApiError::internal)?;
    serde_json::from_str(&raw).map_err(ApiError::internal)
}

pub fn set_config(app: &tauri::AppHandle, config: &RescueConfig) -> Result<(), ApiError> {
    let path = config_path(app);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(ApiError::internal)?;
    }
    let raw = serde_json::to_string_pretty(config).map_err(ApiError::internal)?;
    std::fs::write(&path, raw).map_err(ApiError::internal)
}

fn require_config(config: &RescueConfig) -> Result<(&str, &str, &str), ApiError> {
    let repo = config.repo.as_deref().filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::bad_request("Modo rescate sin configurar: falta el repositorio."))?;
    let token = config.github_token.as_deref().filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::bad_request("Modo rescate sin configurar: falta el token de GitHub."))?;
    let key_path = config.age_key_path.as_deref().filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::bad_request("Modo rescate sin configurar: falta la ruta a la clave privada."))?;
    Ok((repo, token, key_path))
}

// El repo del servidor deja siempre el volcado más reciente en la raíz con
// este nombre fijo (ver /root/scripts/backup_to_github.sh) -- no hace
// falta listar el árbol del repo para encontrarlo.
const BACKUP_FILE_PATH: &str = "backup.json.age";

fn github_get(url: &str, token: &str) -> Result<serde_json::Value, ApiError> {
    let response = ureq::get(url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "FaroDocente-modo-rescate")
        .call()
        .map_err(|e| match e {
            ureq::Error::Status(404, _) => ApiError::bad_request(
                "GitHub responde 404 -- revisa el repositorio, el token (¿tiene permiso de lectura de contenido?) o si aún no hay ninguna copia subida."
            ),
            ureq::Error::Status(401, _) | ureq::Error::Status(403, _) => ApiError::bad_request(
                "GitHub rechaza el token -- revisa que sea válido y tenga acceso de lectura a este repositorio."
            ),
            other => ApiError::internal(other),
        })?;

    response.into_json().map_err(ApiError::internal)
}

fn fetch_encrypted(repo: &str, token: &str) -> Result<Vec<u8>, ApiError> {
    // La API de "contents" solo incluye el contenido en línea (base64)
    // para archivos de hasta 1 MB -- con fotos, el volcado ya pasa de 4 MB
    // sin problema, así que aquí siempre viene vacío (encoding: "none").
    // Hace falta un segundo paso por la API de blobs de Git (hasta 100 MB)
    // usando el sha que sí da la respuesta de "contents".
    let contents_url = format!("https://api.github.com/repos/{repo}/contents/{BACKUP_FILE_PATH}");
    let meta = github_get(&contents_url, token)?;

    let sha = meta["sha"].as_str()
        .ok_or_else(|| ApiError::internal("Respuesta inesperada de la API de GitHub (sin campo 'sha')."))?;

    let blob_url = format!("https://api.github.com/repos/{repo}/git/blobs/{sha}");
    let blob = github_get(&blob_url, token)?;

    let content_b64 = blob["content"].as_str()
        .ok_or_else(|| ApiError::internal("Respuesta inesperada de la API de blobs de GitHub (sin campo 'content')."))?;

    // La API de GitHub devuelve el base64 con saltos de línea cada 60
    // caracteres -- hay que quitarlos antes de decodificar.
    let cleaned: String = content_b64.chars().filter(|c| !c.is_whitespace()).collect();

    base64::engine::general_purpose::STANDARD.decode(cleaned).map_err(ApiError::internal)
}

fn load_identity(key_path: &str) -> Result<age::x25519::Identity, ApiError> {
    let key_file = std::fs::read_to_string(key_path)
        .map_err(|e| ApiError::bad_request(format!("No se pudo leer la clave privada en '{key_path}': {e}")))?;

    let identity_line = key_file
        .lines()
        .find(|line| line.starts_with("AGE-SECRET-KEY-1"))
        .ok_or_else(|| ApiError::bad_request("Ese archivo no contiene una clave privada age válida (se esperaba una línea AGE-SECRET-KEY-1...)."))?;

    identity_line
        .parse()
        .map_err(|e: &str| ApiError::bad_request(format!("Clave privada age inválida: {e}")))
}

fn decrypt(encrypted: &[u8], key_path: &str) -> Result<Vec<u8>, ApiError> {
    let identity = load_identity(key_path)?;

    let decryptor = match age::Decryptor::new(encrypted)
        .map_err(|e| ApiError::internal(format!("El archivo descargado no es un volcado age válido: {e}")))?
    {
        age::Decryptor::Recipients(d) => d,
        age::Decryptor::Passphrase(_) => {
            return Err(ApiError::internal("El volcado está cifrado con contraseña, no con clave pública -- no debería pasar, el script del servidor siempre cifra con age -r."));
        }
    };

    let mut reader = decryptor
        .decrypt(std::iter::once(&identity as &dyn age::Identity))
        .map_err(|e| ApiError::bad_request(format!("No se pudo descifrar (¿clave privada equivocada?): {e}")))?;

    let mut plaintext = Vec::new();
    reader.read_to_end(&mut plaintext).map_err(ApiError::internal)?;
    Ok(plaintext)
}

fn fetch_and_decrypt(config: &RescueConfig) -> Result<serde_json::Value, ApiError> {
    let (repo, token, key_path) = require_config(config)?;
    let encrypted = fetch_encrypted(repo, token)?;
    let plaintext = decrypt(&encrypted, key_path)?;
    serde_json::from_slice(&plaintext)
        .map_err(|e| ApiError::internal(format!("El contenido descifrado no es JSON válido: {e}")))
}

// Recuento por tabla (solo las que de verdad importan para hacerse una
// idea de qué se está a punto de traer) -- ni de lejos todas las 26, para
// no abrumar la pantalla de confirmación.
const TABLAS_RESUMEN: &[&str] = &["students", "classes", "courses", "enrollments", "grades", "meetings", "tasks"];

fn summarize(dump: &serde_json::Value) -> serde_json::Value {
    let mut resumen = serde_json::Map::new();
    for tabla in TABLAS_RESUMEN {
        let n = dump.get(*tabla).and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
        resumen.insert((*tabla).to_string(), serde_json::json!(n));
    }
    serde_json::Value::Object(resumen)
}

// Compara contra lo que YA hay en este SQLite -- para poder avisar antes
// de sobrescribir si la copia de rescate parece más vieja/pequeña de lo
// que ya tienes (p.ej. abriste el modo rescate sin que hiciera falta).
pub fn summarize_local(conn: &rusqlite::Connection) -> Result<serde_json::Value, ApiError> {
    let mut resumen = serde_json::Map::new();
    for tabla in TABLAS_RESUMEN {
        let n: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {tabla}"), [], |r| r.get(0))?;
        resumen.insert((*tabla).to_string(), serde_json::json!(n));
    }
    Ok(serde_json::Value::Object(resumen))
}

pub fn check(app: &tauri::AppHandle) -> Result<serde_json::Value, ApiError> {
    let config = get_config(app)?;
    let dump = fetch_and_decrypt(&config)?;
    Ok(summarize(&dump))
}

pub fn confirm_import(app: &tauri::AppHandle, conn: &mut rusqlite::Connection) -> Result<(), ApiError> {
    let config = get_config(app)?;
    let dump = fetch_and_decrypt(&config)?;
    crate::services::backup::import_all(conn, &dump)
}

// El nombre del archivo que recoge el servidor (ver .github/workflows/
// restore.yml + /root/scripts/restore_from_desktop.sh) -- fijo a
// propósito, el flujo de trabajo se dispara por ESTE path exacto.
const UPLOAD_FILE_PATH: &str = "restore-from-desktop.json.age";

fn encrypt_for_upload(plaintext: &[u8], key_path: &str) -> Result<Vec<u8>, ApiError> {
    // Cifra con la clave pública derivada de la MISMA clave privada que ya
    // usas para descifrar las copias del servidor -- una sola clave sirve
    // en los dos sentidos (el servidor guarda una copia de esta misma
    // clave privada para poder descifrar lo que subas). Ver el porqué de
    // esta decisión en la conversación de diseño: un servidor comprometido
    // ya tendría acceso directo a la base de datos real de todos modos,
    // así que no protege nada tener dos claves separadas.
    let identity = load_identity(key_path)?;
    let recipient = identity.to_public();

    let encryptor = age::Encryptor::with_recipients(vec![Box::new(recipient)])
        .ok_or_else(|| ApiError::internal("No se pudo preparar el cifrado."))?;

    let mut encrypted = Vec::new();
    {
        let mut writer = encryptor.wrap_output(&mut encrypted).map_err(ApiError::internal)?;
        writer.write_all(plaintext).map_err(ApiError::internal)?;
        writer.finish().map_err(ApiError::internal)?;
    }
    Ok(encrypted)
}

// PUT /repos/{repo}/contents/{path}: crea el archivo si no existe, o lo
// sustituye si ya existe -- para sustituirlo, la API de GitHub exige el
// sha del contenido actual (si no lo tenía, GitHub confunde la petición
// con un intento de crear un archivo que ya existe y la rechaza), así que
// primero se comprueba si ya hay uno.
fn upload_encrypted(repo: &str, token: &str, encrypted: &[u8]) -> Result<(), ApiError> {
    let url = format!("https://api.github.com/repos/{repo}/contents/{UPLOAD_FILE_PATH}");

    let existing_sha = match github_get(&url, token) {
        Ok(meta) => meta["sha"].as_str().map(|s| s.to_string()),
        Err(_) => None,
    };

    let content_b64 = base64::engine::general_purpose::STANDARD.encode(encrypted);

    let mut body = serde_json::json!({
        "message": "Restauración pendiente desde escritorio",
        "content": content_b64,
    });
    if let Some(sha) = existing_sha {
        body["sha"] = serde_json::Value::String(sha);
    }

    ureq::put(&url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "FaroDocente-modo-rescate")
        .send_json(body)
        .map_err(|e| match e {
            ureq::Error::Status(401, _) | ureq::Error::Status(403, _) => ApiError::bad_request(
                "GitHub rechaza el token -- revisa que tenga permiso de ESCRITURA en Contents para este repositorio, no solo lectura."
            ),
            other => ApiError::internal(other),
        })?;

    Ok(())
}

// "Volver al servidor": exporta lo que hay en esta copia de escritorio,
// lo cifra con la misma clave y lo sube al repo -- el runner auto-alojado
// del servidor recoge el archivo al instante (dispara por el propio
// evento de push, no por sondeo) y hace el resto (copia de seguridad
// previa del servidor + importación) sin que haga falta nada más aquí.
pub fn upload_to_server(app: &tauri::AppHandle, conn: &rusqlite::Connection) -> Result<(), ApiError> {
    let config = get_config(app)?;
    let (repo, token, key_path) = require_config(&config)?;

    let dump = crate::services::backup::export_all(conn)?;
    let plaintext = serde_json::to_vec(&dump).map_err(ApiError::internal)?;

    let encrypted = encrypt_for_upload(&plaintext, key_path)?;

    upload_encrypted(repo, token, &encrypted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use age::secrecy::ExposeSecret;

    // encrypt_for_upload (usada por "Volver al servidor") + decrypt (la
    // misma que usa el servidor real con el binario age -i) deben
    // entenderse entre sí: cifra con la pública derivada de una identidad
    // y comprueba que esa misma identidad la descifra de vuelta al texto
    // exacto -- sin esto, un fallo de compatibilidad entre cómo esta app
    // cifra y cómo `age -d -i` del servidor descifra no se detectaría
    // hasta probarlo con el runner real.
    #[test]
    fn encrypt_for_upload_round_trip() {
        let identity = age::x25519::Identity::generate();
        let key_file_content = format!("{}\n", identity.to_string().expose_secret());
        let tmp = std::env::temp_dir().join(format!("rescue_test_upload_key_{}.txt", uuid::Uuid::new_v4()));
        std::fs::write(&tmp, key_file_content).unwrap();

        let plaintext = br#"{"students":[{"id":"s1","nombre":"Ana"}]}"#;
        let encrypted = encrypt_for_upload(plaintext, tmp.to_str().unwrap()).unwrap();
        let decrypted = decrypt(&encrypted, tmp.to_str().unwrap()).unwrap();

        std::fs::remove_file(&tmp).ok();

        assert_eq!(decrypted, plaintext.to_vec());
    }

    // Cifra con age (misma librería, sin depender del binario externo) y
    // comprueba que decrypt() reconstruye el texto exacto -- cubre el
    // punto más frágil de todo el módulo (parseo de la clave privada +
    // API real del crate age) sin necesitar red ni el binario age.exe.
    #[test]
    fn decrypt_round_trip_with_real_age_identity() {
        let identity = age::x25519::Identity::generate();
        let recipient = identity.to_public();

        let plaintext = br#"{"students":[{"id":"s1","nombre":"Ana"}]}"#;

        let encryptor = age::Encryptor::with_recipients(vec![Box::new(recipient)]).unwrap();
        let mut encrypted = Vec::new();
        {
            let mut writer = encryptor.wrap_output(&mut encrypted).unwrap();
            writer.write_all(plaintext).unwrap();
            writer.finish().unwrap();
        }

        let key_file_content = format!("# comentario\n{}\n", identity.to_string().expose_secret());
        let tmp = std::env::temp_dir().join(format!("rescue_test_key_{}.txt", uuid::Uuid::new_v4()));
        std::fs::write(&tmp, key_file_content).unwrap();

        let result = decrypt(&encrypted, tmp.to_str().unwrap()).unwrap();
        std::fs::remove_file(&tmp).ok();

        assert_eq!(result, plaintext.to_vec());
    }

    #[test]
    fn decrypt_with_wrong_key_fails_clearly() {
        let real_identity = age::x25519::Identity::generate();
        let wrong_identity = age::x25519::Identity::generate();
        let recipient = real_identity.to_public();

        let encryptor = age::Encryptor::with_recipients(vec![Box::new(recipient)]).unwrap();
        let mut encrypted = Vec::new();
        {
            let mut writer = encryptor.wrap_output(&mut encrypted).unwrap();
            writer.write_all(b"secreto").unwrap();
            writer.finish().unwrap();
        }

        let key_file_content = format!("{}\n", wrong_identity.to_string().expose_secret());
        let tmp = std::env::temp_dir().join(format!("rescue_test_wrongkey_{}.txt", uuid::Uuid::new_v4()));
        std::fs::write(&tmp, key_file_content).unwrap();

        let result = decrypt(&encrypted, tmp.to_str().unwrap());
        std::fs::remove_file(&tmp).ok();

        assert!(result.is_err());
    }

    #[test]
    fn summarize_counts_rows_per_table() {
        let dump = serde_json::json!({
            "students": [{"id": "1"}, {"id": "2"}],
            "classes": [{"id": "c1"}],
        });
        let summary = summarize(&dump);
        assert_eq!(summary["students"], 2);
        assert_eq!(summary["classes"], 1);
        assert_eq!(summary["tasks"], 0);
    }
}
