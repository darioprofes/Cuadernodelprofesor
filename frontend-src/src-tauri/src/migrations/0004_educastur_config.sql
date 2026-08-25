-- ==========================================================
-- Configuración de la sincronización con Educastur (id/centro/perfil ya
-- resueltos, para no tener que volver a preguntarle a Educastur cada vez)
-- ==========================================================
--
-- Mismo esquema que la tabla educastur_config del backend web (creada por
-- api/app/migrations/, ver services/educastur_sync.py::_get_config/
-- _save_config), traducida a dialecto SQLite -- singleton, mismo criterio
-- que app_preferences en 0001_baseline.sql.

CREATE TABLE educastur_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    id_empleado INTEGER,
    id_centro INTEGER,
    id_perfil INTEGER,
    nombre_profesor TEXT,
    updated_at TEXT NOT NULL
);
