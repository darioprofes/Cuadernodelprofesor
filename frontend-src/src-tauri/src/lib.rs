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

// Las fotos no pasan por api_request (JSON no es sitio para bytes crudos,
// ver services/photos.rs) -- comandos dedicados para subir/borrar, mismo
// patrón que load_db/save_db ya usaban. Servirlas de vuelta a un <img> es
// cosa del protocolo studentphoto:// (ver más abajo), no de un comando.
#[tauri::command]
fn set_student_photo(
  state: tauri::State<db::DbState>,
  student_id: String,
  bytes: Vec<u8>,
  content_type: String,
) -> Result<(), error::ApiError> {
  let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::photos::set(&conn, &student_id, bytes, &content_type)
}

#[tauri::command]
fn delete_student_photo(state: tauri::State<db::DbState>, student_id: String) -> Result<(), error::ApiError> {
  let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::photos::delete(&conn, &student_id)
}

// Copia de seguridad (bloque 8): mismo formato JSON genérico que
// /backup/export|import en el backend web, sobre las 24 tablas del
// baseline en vez de sobre Postgres. Comandos aparte (no en api_request)
// porque import necesita una transacción real (&mut Connection), que el
// router genérico -- pensado para operaciones sueltas de una sentencia --
// no ofrece.
#[tauri::command]
fn backup_export(state: tauri::State<db::DbState>) -> Result<serde_json::Value, error::ApiError> {
  let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::backup::export_all(&conn)
}

#[tauri::command]
fn backup_import(state: tauri::State<db::DbState>, dump: serde_json::Value) -> Result<(), error::ApiError> {
  let mut conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::backup::import_all(&mut conn, &dump)
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
    // Protocolo custom (no el "asset:" nativo de Tauri, pensado para
    // ficheros en disco, no bytes calculados al vuelo desde una consulta)
    // -- el frontend usa <img src="studentphoto://{id}"> tal cual,
    // StudentPhotoAvatar.tsx no distingue de una URL cualquiera. En
    // Windows (única plataforma de distribución de esta app, ver
    // CLAUDE.md) Tauri expone esto como http://studentphoto.localhost/{id}.
    .register_uri_scheme_protocol("studentphoto", |ctx, request| {
      let student_id = request.uri().path().trim_start_matches('/');
      let state = ctx.app_handle().state::<db::DbState>();
      let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
      match services::photos::get(&conn, student_id) {
        Ok(Some((bytes, content_type))) => tauri::http::Response::builder()
          .status(200)
          .header("Content-Type", content_type)
          .body(bytes)
          .unwrap(),
        _ => tauri::http::Response::builder()
          .status(404)
          .body(Vec::new())
          .unwrap(),
      }
    })
    .invoke_handler(tauri::generate_handler![
      load_db,
      save_db,
      api_request,
      set_student_photo,
      delete_student_photo,
      backup_export,
      backup_import
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
