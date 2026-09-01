use rusqlite::Connection;
use std::sync::Mutex;
#[cfg(not(feature = "portable"))]
use tauri::Manager;

const DB_FILE_NAME: &str = "profeplanner.sqlite3";

pub struct DbState(pub Mutex<Connection>);

// (número de versión = posición en este array + 1, filename, contenido SQL).
// Embebido en el binario con include_str! porque en producción no hay
// carpeta migrations/ junto al .exe -- a diferencia del backend Python, que
// sí puede leer del disco.
const MIGRATIONS: &[(&str, &str)] = &[
    (
        "0001_baseline.sql",
        include_str!("migrations/0001_baseline.sql"),
    ),
    (
        "0002_absences_and_student_import_tracking.sql",
        include_str!("migrations/0002_absences_and_student_import_tracking.sql"),
    ),
    (
        "0003_basic_knowledge_block_name.sql",
        include_str!("migrations/0003_basic_knowledge_block_name.sql"),
    ),
    (
        "0004_educastur_config.sql",
        include_str!("migrations/0004_educastur_config.sql"),
    ),
    (
        "0005_educastur_consent.sql",
        include_str!("migrations/0005_educastur_consent.sql"),
    ),
    (
        "0006_evaluation_tools_course.sql",
        include_str!("migrations/0006_evaluation_tools_course.sql"),
    ),
    (
        "0007_enrollment_pti.sql",
        include_str!("migrations/0007_enrollment_pti.sql"),
    ),
    (
        "0008_teacher_profile_and_sa_fields.sql",
        include_str!("migrations/0008_teacher_profile_and_sa_fields.sql"),
    ),
    (
        "0009_programa_bilingue.sql",
        include_str!("migrations/0009_programa_bilingue.sql"),
    ),
];

// Sin la feature "portable" (build normal, el que empaqueta el instalador
// NSIS): %APPDATA%\es.lamarejada.farodocente\ -- comportamiento estándar de
// una app instalada en Windows, sobrevive a mover/reinstalar el .exe.
#[cfg(not(feature = "portable"))]
fn data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("no se pudo resolver el directorio de datos de la app")
}

// Con la feature "portable" (el .exe que se empaqueta suelto para el
// autoextraíble, ver desktop-dist/): junto al propio .exe, no en %APPDATA%
// -- petición explícita del usuario, para que la copia entera quepa en un
// USB sin dejar rastro en el sistema ni compartir datos con otra copia
// distinta instalada aparte. current_exe() (no resource_dir(), pensado para
// los recursos EMPAQUETADOS del bundle, no para "dónde está este .exe
// ahora mismo") es lo que de verdad responde a esa pregunta.
#[cfg(feature = "portable")]
fn data_dir(_app: &tauri::AppHandle) -> std::path::PathBuf {
    let exe = std::env::current_exe().expect("no se pudo resolver la ruta del propio ejecutable");
    exe.parent()
        .expect("el ejecutable no tiene carpeta contenedora")
        .join("data")
}

pub fn open(app: &tauri::AppHandle) -> rusqlite::Result<Connection> {
    let dir = data_dir(app);
    std::fs::create_dir_all(&dir).expect("no se pudo crear el directorio de datos de la app");
    let mut conn = Connection::open(dir.join(DB_FILE_NAME))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    apply_migrations(&mut conn)?;
    Ok(conn)
}

fn apply_migrations(conn: &mut Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            filename TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )?;

    for (index, (filename, sql)) in MIGRATIONS.iter().enumerate() {
        let version = (index + 1) as i64;
        let already_applied: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
            [version],
            |row| row.get(0),
        )?;
        if already_applied {
            continue;
        }
        // Cada migración en su propia transacción, forward-only -- mismo
        // criterio que services/db.py::apply_migrations() en el backend.
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO schema_migrations (version, filename) VALUES (?1, ?2)",
            rusqlite::params![version, filename],
        )?;
        tx.commit()?;
    }
    Ok(())
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

// Conexión en memoria con el esquema ya migrado, para los tests de
// routers/services de otros módulos -- evita levantar un AppHandle real de
// Tauri (y con él una ventana) solo para probar SQL.
#[cfg(test)]
pub fn test_connection() -> Connection {
    let mut conn = Connection::open_in_memory().expect("no se pudo abrir sqlite en memoria");
    conn.pragma_update(None, "foreign_keys", "ON").unwrap();
    apply_migrations(&mut conn).expect("no se pudo aplicar el baseline en el test");
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn baseline_migration_applies_and_is_idempotent() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        apply_migrations(&mut conn).unwrap();
        apply_migrations(&mut conn).unwrap(); // segundo arranque: no debe reaplicar nada

        let migration_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(migration_count, 9);

        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        // 24 tablas de dominio del baseline + absences (0002) + educastur_config
        // (0004) + schema_migrations -- 0003 solo añade una columna
        // (block_name), ninguna tabla nueva.
        assert_eq!(table_count, 27);

        // Comprobación de humo de una FK con ON DELETE CASCADE real (no solo
        // que el CREATE TABLE parseara, sino que la restricción funcione).
        conn.execute(
            "INSERT INTO academic_years (id, label, start_date, end_date, created_at, updated_at) VALUES ('y1','2026-2027','2026-09-01','2027-06-30','2026-08-05T00:00:00Z','2026-08-05T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO courses (id, level, subject, created_at, updated_at) VALUES ('c1','1 ESO','Biologia','2026-08-05T00:00:00Z','2026-08-05T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO classes (id, academic_year_id, course_id, created_at, updated_at) VALUES ('cl1','y1','c1','2026-08-05T00:00:00Z','2026-08-05T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute("DELETE FROM academic_years WHERE id = 'y1'", [])
            .unwrap();
        let remaining_classes: i64 = conn
            .query_row("SELECT COUNT(*) FROM classes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining_classes, 0, "ON DELETE CASCADE de academic_years->classes no funcionó");
    }
}
