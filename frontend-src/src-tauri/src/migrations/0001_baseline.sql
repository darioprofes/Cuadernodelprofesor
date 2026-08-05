-- ==========================================================
-- Migración base del SQLite de escritorio (Fase 7)
-- ==========================================================
--
-- Traducción a dialecto SQLite del esquema relacional que ya usa el
-- backend web (api/app/migrations/0001..0006), en su forma actual
-- (post-0006: sin app_db/app_db_history/student_photos viejos, con
-- students.foto/foto_content_type reales). No es una réplica histórica de
-- las 6 migraciones de Postgres -- varias son estados transitorios que
-- nunca existieron en escritorio.
--
-- Reglas de traducción de tipos (ver plan, sección "Esquema SQLite"):
--   UUID              -> TEXT (generado en Rust con la crate uuid, antes del INSERT)
--   JSONB             -> TEXT (serializado/deserializado con serde_json)
--   BYTEA             -> BLOB
--   TIMESTAMPTZ/DATE/TIME -> TEXT en ISO-8601 (generado en Rust, no hay DEFAULT de columna)
--   TEXT[] / UUID[]   -> TEXT (JSON-encoded array)
--   BOOLEAN           -> INTEGER (0/1)
--   gen_random_uuid()/now() como DEFAULT -> no existen en SQLite, se generan en Rust
--
-- Como toda migración ya publicada: no se edita nunca. Un cambio de forma
-- se hace con una migración nueva (0002_...sql).

-- ---------- Global ----------

CREATE TABLE app_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    layout_mode TEXT,
    default_calendar_view TEXT,
    grade_scale TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
);

CREATE TABLE shortcuts (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE students (
    id TEXT PRIMARY KEY,
    nombre TEXT,
    primer_apellido TEXT,
    segundo_apellido TEXT,
    fecha_nacimiento TEXT,
    dni TEXT,
    telefono_urgencias TEXT,
    tutor1 TEXT,
    tutor2 TEXT,
    domicilio_direccion TEXT,
    domicilio_localidad TEXT,
    domicilio_codigo_postal TEXT,
    domicilio_telefono TEXT,
    alergias TEXT,
    enfermedades_relevantes TEXT,
    medicacion_habitual TEXT,
    intolerancias_alimentarias TEXT,
    observaciones_sanitarias TEXT,
    autorizacion_imagen INTEGER,
    autorizacion_salidas INTEGER,
    foto BLOB,
    foto_content_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX students_apellidos_idx ON students (primer_apellido, segundo_apellido, nombre);

-- ---------- Referencia / currículo ----------

CREATE TABLE courses (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL,
    subject TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'academic' CHECK (type IN ('academic', 'other')),
    peso_criterios_manual INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE key_competences (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE operational_descriptors (
    id TEXT PRIMARY KEY,
    key_competence_id TEXT NOT NULL REFERENCES key_competences(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    stage TEXT CHECK (stage IN ('eso', 'bachillerato'))
);
CREATE INDEX operational_descriptors_key_competence_idx ON operational_descriptors (key_competence_id);

CREATE TABLE specific_competences (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX specific_competences_course_idx ON specific_competences (course_id);

CREATE TABLE specific_competence_descriptors (
    specific_competence_id TEXT NOT NULL REFERENCES specific_competences(id) ON DELETE CASCADE,
    descriptor_id TEXT NOT NULL REFERENCES operational_descriptors(id) ON DELETE CASCADE,
    PRIMARY KEY (specific_competence_id, descriptor_id)
);
CREATE INDEX specific_competence_descriptors_reverse_idx ON specific_competence_descriptors (descriptor_id);

CREATE TABLE evaluation_criteria (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    competence_id TEXT NOT NULL REFERENCES specific_competences(id) ON DELETE RESTRICT,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    weight NUMERIC,
    exclude_from_weighting INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX evaluation_criteria_course_idx ON evaluation_criteria (course_id);
CREATE INDEX evaluation_criteria_competence_idx ON evaluation_criteria (competence_id);

CREATE TABLE basic_knowledge (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL
);
CREATE INDEX basic_knowledge_course_idx ON basic_knowledge (course_id);

CREATE TABLE programming_units (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sessions INTEGER NOT NULL DEFAULT 0,
    start_date TEXT,
    session_details TEXT NOT NULL DEFAULT '[]',
    linked_criteria_ids TEXT NOT NULL DEFAULT '[]',
    linked_basic_knowledge_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX programming_units_course_idx ON programming_units (course_id);

CREATE TABLE evaluation_tools (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('checklist', 'rating_scale', 'rubric')),
    name TEXT NOT NULL,
    levels TEXT NOT NULL DEFAULT '[]',
    items TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- ---------- Curso académico + instancia ----------

CREATE TABLE academic_years (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 0,
    holidays TEXT NOT NULL DEFAULT '[]',
    periods TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (end_date > start_date)
);
CREATE UNIQUE INDEX academic_years_one_current ON academic_years (is_current) WHERE is_current = 1;

CREATE TABLE evaluation_periods (
    id TEXT PRIMARY KEY,
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    weight NUMERIC NOT NULL DEFAULT 1
);
CREATE INDEX evaluation_periods_year_idx ON evaluation_periods (academic_year_id);

CREATE TABLE academic_year_courses (
    id TEXT PRIMARY KEY,
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL,
    UNIQUE (academic_year_id, course_id)
);
CREATE INDEX academic_year_courses_year_idx ON academic_year_courses (academic_year_id);

CREATE TABLE classes (
    id TEXT PRIMARY KEY,
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    grupo TEXT,
    schedule TEXT NOT NULL DEFAULT '[]',
    skipped_days TEXT NOT NULL DEFAULT '[]',
    icono TEXT,
    color_acento INTEGER,
    mesa_profesor_x NUMERIC,
    mesa_profesor_y NUMERIC,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX classes_year_idx ON classes (academic_year_id);
CREATE INDEX classes_course_idx ON classes (course_id);

CREATE TABLE enrollments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    acneae TEXT NOT NULL DEFAULT '[]',
    centro_procedencia TEXT,
    ha_repetido_curso INTEGER,
    materias_pendientes TEXT,
    programa_especifico TEXT,
    neae INTEGER,
    neae_detalle TEXT,
    medidas_educativas TEXT,
    observaciones_tutor TEXT,
    plano_x NUMERIC,
    plano_y NUMERIC,
    plano_color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (student_id, class_id)
);
CREATE INDEX enrollments_class_idx ON enrollments (class_id);
CREATE INDEX enrollments_student_idx ON enrollments (student_id);

CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    evaluation_period_id TEXT NOT NULL REFERENCES evaluation_periods(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    weight NUMERIC NOT NULL,
    type TEXT NOT NULL DEFAULT 'normal' CHECK (type IN ('normal', 'recovery'))
);
CREATE INDEX categories_class_idx ON categories (class_id);
CREATE INDEX categories_period_idx ON categories (evaluation_period_id);

CREATE TABLE assignments (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    evaluation_period_id TEXT NOT NULL REFERENCES evaluation_periods(id) ON DELETE RESTRICT,
    evaluation_tool_id TEXT REFERENCES evaluation_tools(id) ON DELETE SET NULL,
    programming_unit_id TEXT REFERENCES programming_units(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    date TEXT,
    evaluation_method TEXT NOT NULL CHECK (evaluation_method IN ('direct_grade','checklist','rating_scale','rubric')),
    linked_criteria TEXT NOT NULL DEFAULT '[]',
    recovers_assignment_ids TEXT NOT NULL DEFAULT '[]',
    peso_en_categoria NUMERIC,
    importancia TEXT,
    importancia_personalizada NUMERIC,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX assignments_class_idx ON assignments (class_id);
CREATE INDEX assignments_category_idx ON assignments (category_id);

CREATE TABLE grades (
    enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    direct_score NUMERIC,
    recovery_score NUMERIC,
    tool_results TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (enrollment_id, assignment_id)
);
CREATE INDEX grades_assignment_idx ON grades (assignment_id);

CREATE TABLE journal_entries (
    id TEXT PRIMARY KEY,
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    period_index INTEGER NOT NULL,
    notes TEXT,
    UNIQUE (class_id, date, period_index)
);
CREATE INDEX journal_entries_year_idx ON journal_entries (academic_year_id);

CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    hecho INTEGER NOT NULL DEFAULT 0,
    fecha_inicio TEXT,
    fecha_fin TEXT
);
CREATE INDEX tasks_year_idx ON tasks (academic_year_id);

CREATE TABLE meetings (
    id TEXT PRIMARY KEY,
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    hora TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('tutoria','departamento','familia','r_tutores')),
    con_quien TEXT,
    motivo TEXT,
    acuerdos TEXT,
    seguimiento TEXT
);
CREATE INDEX meetings_year_idx ON meetings (academic_year_id);

CREATE TABLE agenda_notes (
    id TEXT PRIMARY KEY,
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    texto TEXT NOT NULL
);
CREATE INDEX agenda_notes_year_idx ON agenda_notes (academic_year_id);
