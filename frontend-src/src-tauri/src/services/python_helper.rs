use crate::error::ApiError;
use std::io::Write;
use std::process::{Command, Stdio};
use tauri::Manager;

// Localiza y lanza el sidecar Python empaquetado con PyInstaller
// (--onedir, instalado como RECURSO de Tauri -- no como sidecar
// "externalBin", ese mecanismo espera un único fichero, no una carpeta ya
// desempaquetada. Ver frontend-src/src-tauri/python-helper/ y la memoria
// del proyecto sobre esta decisión). Cada subcomando recibe sus bytes de
// entrada por stdin (evita crear y limpiar ficheros temporales) y
// devuelve un único JSON por stdout con código de salida 0, o
// {"error": "..."} por stderr con código 1 si algo falla dentro de
// Python -- nunca una traza cruda que este lado no sabría interpretar.
fn ejecutar(app: &tauri::AppHandle, subcomando: &str, entrada: &[u8]) -> Result<serde_json::Value, ApiError> {
    let exe_path = app
        .path()
        .resolve("python-helper/python-helper.exe", tauri::path::BaseDirectory::Resource)
        .map_err(|e| ApiError::internal(format!("No se pudo localizar python-helper: {e}")))?;

    let mut child = Command::new(&exe_path)
        .arg(subcomando)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ApiError::internal(format!("No se pudo iniciar python-helper: {e}")))?;

    // El propio python-helper lee TODO stdin antes de escribir nada a
    // stdout, así que no hay riesgo de interbloqueo aquí -- escribir y
    // cerrar stdin (el .take() se suelta al final de esta sentencia) antes
    // de esperar la salida.
    child
        .stdin
        .take()
        .expect("stdin del proceso hijo")
        .write_all(entrada)
        .map_err(|e| ApiError::internal(format!("No se pudo escribir en python-helper: {e}")))?;

    let output = child
        .wait_with_output()
        .map_err(|e| ApiError::internal(format!("python-helper falló al ejecutarse: {e}")))?;

    if !output.status.success() {
        let stderr_texto = String::from_utf8_lossy(&output.stderr);
        let detalle = serde_json::from_str::<serde_json::Value>(&stderr_texto)
            .ok()
            .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(String::from))
            .unwrap_or_else(|| stderr_texto.to_string());
        return Err(ApiError::bad_request(detalle));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|e| ApiError::internal(format!("python-helper devolvió algo que no es JSON: {e}")))
}

pub fn importar_horario_pdf(app: &tauri::AppHandle, bytes: Vec<u8>) -> Result<serde_json::Value, ApiError> {
    ejecutar(app, "importar-horario", &bytes)
}

pub fn importar_calendario_pdf(app: &tauri::AppHandle, bytes: Vec<u8>) -> Result<serde_json::Value, ApiError> {
    ejecutar(app, "importar-calendario", &bytes)
}

// Subcomandos cuya entrada es JSON (no bytes crudos como el PDF de arriba)
// -- serializa y reutiliza el mismo mecanismo.
pub fn educastur_sincronizar(app: &tauri::AppHandle, payload: serde_json::Value) -> Result<serde_json::Value, ApiError> {
    let entrada = serde_json::to_vec(&payload).map_err(ApiError::internal)?;
    ejecutar(app, "educastur-sincronizar", &entrada)
}
