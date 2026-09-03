use tauri::Manager;

mod db;
mod error;
mod routers;
mod services;

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
// ver services/photos.rs) -- comandos dedicados para subir/borrar. Servirlas
// de vuelta a un <img> es cosa del protocolo studentphoto:// (ver más
// abajo), no de un comando.
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

// Foto de perfil del profesor: mismo criterio que las de alumnado (comandos
// dedicados para subir/borrar, protocolo custom para servirla), pero sobre
// la fila única de preferencias -- sin id, solo hay una.
#[tauri::command]
fn set_teacher_photo(
  state: tauri::State<db::DbState>,
  bytes: Vec<u8>,
  content_type: String,
) -> Result<(), error::ApiError> {
  let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::preferences::set_photo(&conn, bytes, &content_type)
}

#[tauri::command]
fn delete_teacher_photo(state: tauri::State<db::DbState>) -> Result<(), error::ApiError> {
  let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::preferences::delete_photo(&conn)
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

// Sidecar Python (ver services/python_helper.rs) -- comando aparte, no en
// api_request, porque no toca la base de datos y sus bytes de entrada
// (el PDF) no tienen sitio natural en ese contrato JSON genérico.
#[tauri::command]
fn importar_horario_pdf(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<serde_json::Value, error::ApiError> {
  services::python_helper::importar_horario_pdf(&app, bytes)
}

#[tauri::command]
fn importar_calendario_pdf(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<serde_json::Value, error::ApiError> {
  services::python_helper::importar_calendario_pdf(&app, bytes)
}

// Igual criterio que backup_export/backup_import: aparte de api_request
// porque necesita algo que el despachador genérico no recibe -- aquí, un
// AppHandle para localizar y lanzar el sidecar Python (ver
// services/educastur.rs y services/python_helper.rs).
#[tauri::command]
fn educastur_sincronizar(
  app: tauri::AppHandle,
  state: tauri::State<db::DbState>,
  body: serde_json::Value,
) -> Result<serde_json::Value, error::ApiError> {
  let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::educastur::sincronizar(&conn, &app, body)
}

// Modo rescate (ver services/rescue.rs): apagado por defecto, solo actúa
// si el profesor lo configuró a mano en Ajustes. La configuración (token
// de GitHub, ruta a la clave privada age) vive en un fichero propio fuera
// del SQLite de dominio, para que nunca acabe dentro de un backup_export.
#[tauri::command]
fn rescue_get_config(app: tauri::AppHandle) -> Result<services::rescue::RescueConfig, error::ApiError> {
  services::rescue::get_config(&app)
}

#[tauri::command]
fn rescue_set_config(app: tauri::AppHandle, config: services::rescue::RescueConfig) -> Result<(), error::ApiError> {
  services::rescue::set_config(&app, &config)
}

// Trae y descifra la copia, pero NO la importa -- solo un resumen (nº de
// alumnos/clases/...) para poder confirmar antes de sobrescribir nada.
#[tauri::command]
fn rescue_check(app: tauri::AppHandle) -> Result<serde_json::Value, error::ApiError> {
  services::rescue::check(&app)
}

#[tauri::command]
fn rescue_summarize_local(state: tauri::State<db::DbState>) -> Result<serde_json::Value, error::ApiError> {
  let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::rescue::summarize_local(&conn)
}

// Vuelve a traer y descifrar (no reutiliza lo de rescue_check, para no
// tener que guardar varios MB de vuelta cifrados en el estado de React
// solo por si el usuario confirma) y esta vez sí importa de verdad.
#[tauri::command]
fn rescue_confirm_import(app: tauri::AppHandle, state: tauri::State<db::DbState>) -> Result<(), error::ApiError> {
  let mut conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::rescue::confirm_import(&app, &mut conn)
}

// "Volver al servidor": exporta esta copia de escritorio, la cifra y la
// sube -- el runner auto-alojado del servidor la recoge y hace el resto
// (copia de seguridad previa del servidor + importación) por su cuenta.
#[tauri::command]
fn rescue_upload_to_server(app: tauri::AppHandle, state: tauri::State<db::DbState>) -> Result<(), error::ApiError> {
  let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::rescue::upload_to_server(&app, &conn)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
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
    // Misma idea que studentphoto:// de arriba, pero sin id -- solo hay una
    // foto de profesor. <img src="teacherphoto://x"> tal cual en
    // TeacherProfileManager.tsx (el path se ignora, siempre es la única fila).
    .register_uri_scheme_protocol("teacherphoto", |ctx, _request| {
      let state = ctx.app_handle().state::<db::DbState>();
      let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
      match services::preferences::get_photo(&conn) {
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
      api_request,
      set_student_photo,
      delete_student_photo,
      set_teacher_photo,
      delete_teacher_photo,
      backup_export,
      backup_import,
      importar_horario_pdf,
      importar_calendario_pdf,
      educastur_sincronizar,
      rescue_get_config,
      rescue_set_config,
      rescue_check,
      rescue_summarize_local,
      rescue_confirm_import,
      rescue_upload_to_server
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
