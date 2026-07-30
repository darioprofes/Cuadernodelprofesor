-- ==========================================================
-- Migración base: contenido exacto de schema.sql (sistema de blob único)
-- ==========================================================
--
-- Esta migración es una foto exacta del schema.sql que existía antes de
-- introducir el sistema de migraciones — no cambia ni una tabla. Su único
-- propósito es que el nuevo runner (apply_migrations(), ver services/db.py)
-- tome el control del arranque sin alterar el estado actual de la base. Las
-- tablas nuevas del modelo relacional (curso académico, alumnado, notas...)
-- llegan en migraciones posteriores, numeradas a partir de aquí.
--
-- Como toda migración ya publicada: no se edita nunca. Un cambio de forma
-- se hace con una migración nueva.

CREATE TABLE IF NOT EXISTS app_db (

    id BOOLEAN PRIMARY KEY DEFAULT true,

    blob BYTEA NOT NULL,

    -- Se incrementa en cada PUT /db aceptado. El frontend manda la versión
    -- que cree tener vigente (cabecera X-Blob-Version) y solo se acepta el
    -- PUT si coincide con esta — así una pestaña vieja (o un guardado que
    -- se solapó con otro) no puede sobrescribir en silencio un cambio más
    -- reciente: recibe 409 y avisa en vez de pisar datos.
    version INTEGER NOT NULL DEFAULT 1,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT app_db_singleton CHECK (id)

);

ALTER TABLE app_db ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- ==========================================================
-- Historial mínimo del blob
-- ==========================================================
--
-- Antes de sobrescribir app_db, se archiva aquí la versión saliente. No es
-- un backup completo con retención larga — es la red de seguridad mínima
-- para poder recuperar la última versión buena si un PUT llega corrupto o
-- si algo sale mal justo después de guardar. services/app_db.py se queda
-- solo con las últimas 20 filas (borra las más viejas en cada guardado).

CREATE TABLE IF NOT EXISTS app_db_history (

    id SERIAL PRIMARY KEY,

    blob BYTEA NOT NULL,

    version INTEGER NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

-- ==========================================================
-- Fotos de alumnado, aparte del blob principal
-- ==========================================================
--
-- Student.foto vive en el frontend como data URL (base64) embebida en el
-- JSON del blob de arriba. Si se guardara ahí, cada autoguardado (cada 1.5s
-- tras CUALQUIER cambio, no solo de fotos) volvería a subir el binario
-- SQLite completo, fotos incluidas, aunque el cambio real fuera un texto
-- suelto en otra pantalla — el blob solo crece y cada guardado es cada vez
-- más pesado. Separarlas en tablas dentro del mismo SQLite no serviría de
-- nada (db.export() siempre serializa el fichero entero igual), así que
-- viven en su propia tabla de Postgres, con su propio endpoint
-- (routers/photos.py) al margen del ciclo de autoguardado del blob.
--
-- NOTA: esta forma (student_id TEXT, data_url TEXT) es la de hoy, sin FK
-- porque el alumnado solo existe dentro del blob. Cuando el modelo
-- relacional tenga una tabla students real, una migración posterior
-- reemplaza esta tabla por la nueva forma (student_id UUID FK, BYTEA) —
-- no se toca aquí para mantener esta migración como una foto fiel de lo
-- que ya existía.

CREATE TABLE IF NOT EXISTS student_photos (

    student_id TEXT PRIMARY KEY,

    data_url TEXT NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

);
