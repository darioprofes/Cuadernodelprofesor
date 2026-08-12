-- ==========================================================
-- Faltas de asistencia local + rastro de importación de SAUCE en students
-- ==========================================================
--
-- Mismo esquema que las migraciones web 0007/0009/0010/0011 (ver
-- api/app/migrations/), traducido a dialecto SQLite. Sin sincronización
-- con Educastur en escritorio (necesita peticiones HTTP reales que solo
-- existen en el backend Python) -- educastur_falta_id/synced_at/sync_error
-- se quedan siempre NULL aquí, pero se mantienen en el esquema para que
-- GradebookTable.tsx (código 100% compartido con la web) no necesite una
-- rama de tipos distinta por plataforma.

-- SQLite no admite UNIQUE inline en ALTER TABLE ADD COLUMN (a diferencia
-- de Postgres) -- se añade la columna suelta y el índice único aparte,
-- mismo efecto (NULL no cuenta como duplicado tampoco aquí).
ALTER TABLE students ADD COLUMN nie TEXT;
CREATE UNIQUE INDEX students_nie_unique ON students (nie);
ALTER TABLE students ADD COLUMN nacionalidad TEXT;
ALTER TABLE students ADD COLUMN imported_academic_year_id TEXT REFERENCES academic_years(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN ultimo_curso_sauce TEXT;
ALTER TABLE students ADD COLUMN ultima_unidad_sauce TEXT;

CREATE TABLE absences (
    id TEXT PRIMARY KEY,
    enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    period_index INTEGER NOT NULL,
    tipo_falta TEXT NOT NULL CHECK (tipo_falta IN ('R', 'J', 'I', '')),
    educastur_falta_id INTEGER,
    synced_at TEXT,
    sync_error TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE (enrollment_id, date, period_index)
);
CREATE INDEX absences_enrollment_idx ON absences (enrollment_id);
