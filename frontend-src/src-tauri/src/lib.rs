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

// Importar fotos desde PDF (mismo PDF "Fotografías del alumnado por
// unidad" de Educastur que en web) -- a diferencia de importar_horario_pdf
// necesita el listado de alumnado (para emparejar por NIE, ver
// services/photos.rs::list_for_pdf_match), así que aparte de bytes también
// abre la conexión SQLite.
#[tauri::command]
fn importar_fotos_pdf(app: tauri::AppHandle, state: tauri::State<db::DbState>, bytes: Vec<u8>) -> Result<serde_json::Value, error::ApiError> {
  let alumnos = {
    let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
    services::photos::list_for_pdf_match(&conn)?
  };
  services::python_helper::importar_fotos_pdf(&app, bytes, alumnos)
}

// Anonimizador (Herramientas IA): mismo sidecar Python, mismo criterio que
// importar_horario_pdf de arriba. El .docx viaja como bytes crudos en el
// argumento del comando (igual que set_student_photo) pero se manda al
// sidecar en base64 dentro de un JSON -- reintegrar_docx necesita ir
// acompañado del mapa código->dato real, así que los tres subcomandos
// comparten un único formato de entrada (ver
// python-helper/README.md). La respuesta de anonimizar_docx/
// reintegrar_docx ya trae el .docx resultante en base64 tal cual (mismo
// campo, mismo formato que ya devuelve la web) -- no hace falta decodificar
// aquí, el frontend ya sabe leerlo así.
#[tauri::command]
fn anonimizar_texto(app: tauri::AppHandle, texto: String) -> Result<serde_json::Value, error::ApiError> {
  services::python_helper::anonimizar_texto(&app, serde_json::json!({ "texto": texto }))
}

#[tauri::command]
fn anonimizar_docx(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<serde_json::Value, error::ApiError> {
  use base64::Engine;
  let docx_base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
  services::python_helper::anonimizar_docx(&app, serde_json::json!({ "docx_base64": docx_base64 }))
}

#[tauri::command]
fn reintegrar_docx(app: tauri::AppHandle, bytes: Vec<u8>, mapa: serde_json::Value) -> Result<serde_json::Value, error::ApiError> {
  use base64::Engine;
  let docx_base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
  services::python_helper::reintegrar_docx(&app, serde_json::json!({ "docx_base64": docx_base64, "mapa": mapa }))
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

// Sincronización con el servidor (ver services/server_sync.rs): apagada
// por defecto, solo actúa si el profesor la configuró a mano en Ajustes.
// La configuración (token de GitHub, ruta a la clave privada age) vive
// en un fichero propio fuera del SQLite de dominio, para que nunca acabe
// dentro de un backup_export.
#[tauri::command]
fn server_sync_get_config(app: tauri::AppHandle) -> Result<services::server_sync::ServerSyncConfig, error::ApiError> {
  services::server_sync::get_config(&app)
}

#[tauri::command]
fn server_sync_set_config(app: tauri::AppHandle, config: services::server_sync::ServerSyncConfig) -> Result<(), error::ApiError> {
  services::server_sync::set_config(&app, &config)
}

// Trae y descifra la copia, pero NO la importa -- solo un resumen (nº de
// alumnos/clases/...) para poder confirmar antes de sobrescribir nada.
#[tauri::command]
fn server_sync_check(app: tauri::AppHandle) -> Result<serde_json::Value, error::ApiError> {
  services::server_sync::check(&app)
}

#[tauri::command]
fn server_sync_summarize_local(state: tauri::State<db::DbState>) -> Result<serde_json::Value, error::ApiError> {
  let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::server_sync::summarize_local(&conn)
}

// Vuelve a traer y descifrar (no reutiliza lo de server_sync_check, para
// no tener que guardar varios MB de vuelta cifrados en el estado de React
// solo por si el usuario confirma) y esta vez sí importa de verdad.
#[tauri::command]
fn server_sync_confirm_import(app: tauri::AppHandle, state: tauri::State<db::DbState>) -> Result<(), error::ApiError> {
  let mut conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::server_sync::confirm_import(&app, &mut conn)
}

// "Volver al servidor": exporta esta copia de escritorio, la cifra y la
// sube -- el runner auto-alojado del servidor la recoge y hace el resto
// (copia de seguridad previa del servidor + importación) por su cuenta.
#[tauri::command]
fn server_sync_upload_to_server(app: tauri::AppHandle, state: tauri::State<db::DbState>) -> Result<(), error::ApiError> {
  let conn = state.0.lock().expect("mutex de la conexión SQLite envenenado");
  services::server_sync::upload_to_server(&app, &conn)
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
      importar_fotos_pdf,
      anonimizar_texto,
      anonimizar_docx,
      reintegrar_docx,
      educastur_sincronizar,
      server_sync_get_config,
      server_sync_set_config,
      server_sync_check,
      server_sync_summarize_local,
      server_sync_confirm_import,
      server_sync_upload_to_server
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
