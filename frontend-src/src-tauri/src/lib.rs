use tauri::Manager;

mod db;
mod error;
mod routers;
mod services;

// Nombre fijo del fichero SQLite en el directorio de datos de la app
// (independiente por completo de la persistencia remota que usa la versión
// web, ver frontend-src/services/localDb.ts).
const DB_FILE_NAME: &str = "profeplanner.db";

#[tauri::command]
fn load_db(app: tauri::AppHandle) -> Result<Option<Vec<u8>>, String> {
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
  let path = dir.join(DB_FILE_NAME);
  if !path.exists() {
    return Ok(None);
  }
  std::fs::read(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_db(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  std::fs::write(dir.join(DB_FILE_NAME), bytes).map_err(|e| e.to_string())
}

// Único comando genérico para todo el modelo relacional nuevo (ver plan,
// Fase 7, "Decisión de arquitectura") -- api.ts lo usa como transporte en
// vez de fetch() cuando isTauri() es cierto, sin que ningún hook de
// react-query tenga que saberlo.
#[tauri::command]
fn api_request(
  state: tauri::State<db::DbState>,
  method: String,
  path: String,
  body: Option<serde_json::Value>,
) -> Result<serde_json::Value, error::ApiError> {
  let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  routers::dispatch(&conn, &method, &path, body)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      let conn = db::open(&app.handle()).expect("no se pudo abrir/migrar el SQLite relacional");
      app.manage(db::DbState(std::sync::Mutex::new(conn)));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![load_db, save_db, api_request])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
