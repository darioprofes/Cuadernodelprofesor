-- ==========================================================
-- Blob único de la app (fork de CuadernMestre)
-- ==========================================================
--
-- Todo el estado de la app (clases, alumnado, calificaciones, currículo,
-- programación, configuración académica...) vive serializado como una base
-- SQLite completa (sql.js) en el propio navegador, exportada a binario. Aquí
-- solo se persiste ese binario tal cual, en una fila singleton (uso
-- personal, sin multi-tenant): CHECK(id) fuerza que "id" solo pueda ser
-- true, y la PRIMARY KEY sobre esa única columna booleana garantiza que
-- nunca haya más de una fila.
--

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

CREATE TABLE IF NOT EXISTS student_photos (

    student_id TEXT PRIMARY KEY,

    data_url TEXT NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

);
