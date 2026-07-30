-- ==========================================================
-- Datos de instancia por curso académico (Fase 3)
-- ==========================================================
--
-- Aditiva: no toca app_db/app_db_history/student_photos. student_photos
-- se queda deliberadamente con su forma actual (student_id TEXT, data_url)
-- aunque el DDL cerrado en fase-0-ddl-y-api.md especifique otra —
-- cambiarla ahora rompería /api/photos, que la app web ya desplegada sigue
-- usando en producción hasta que el frontend se reescriba (Fases 4-6). El
-- cambio de student_photos a FK real + BYTEA se hace en la Fase 7, cuando
-- ese consumidor viejo ya no exista.

CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    grupo TEXT,
    schedule JSONB NOT NULL DEFAULT '[]',
    skipped_days JSONB NOT NULL DEFAULT '[]',
    icono TEXT,
    color_acento INTEGER,
    mesa_profesor_x NUMERIC,
    mesa_profesor_y NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX classes_year_idx ON classes (academic_year_id);
CREATE INDEX classes_course_idx ON classes (course_id);

CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    acneae TEXT[] NOT NULL DEFAULT '{}',
    centro_procedencia TEXT,
    ha_repetido_curso BOOLEAN,
    materias_pendientes TEXT,
    programa_especifico TEXT,
    neae BOOLEAN,
    neae_detalle TEXT,
    medidas_educativas TEXT,
    observaciones_tutor TEXT,
    plano_x NUMERIC,
    plano_y NUMERIC,
    plano_color TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, class_id)
);
CREATE INDEX enrollments_class_idx ON enrollments (class_id);
CREATE INDEX enrollments_student_idx ON enrollments (student_id);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    evaluation_period_id UUID NOT NULL REFERENCES evaluation_periods(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    weight NUMERIC NOT NULL,
    type TEXT NOT NULL DEFAULT 'normal' CHECK (type IN ('normal', 'recovery'))
);
CREATE INDEX categories_class_idx ON categories (class_id);
CREATE INDEX categories_period_idx ON categories (evaluation_period_id);

CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    evaluation_period_id UUID NOT NULL REFERENCES evaluation_periods(id) ON DELETE RESTRICT,
    evaluation_tool_id UUID REFERENCES evaluation_tools(id) ON DELETE SET NULL,
    programming_unit_id UUID REFERENCES programming_units(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    date DATE,
    evaluation_method TEXT NOT NULL CHECK (evaluation_method IN ('direct_grade','checklist','rating_scale','rubric')),
    linked_criteria JSONB NOT NULL DEFAULT '[]',
    recovers_assignment_ids UUID[] NOT NULL DEFAULT '{}',
    peso_en_categoria NUMERIC,
    importancia TEXT,
    importancia_personalizada NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assignments_class_idx ON assignments (class_id);
CREATE INDEX assignments_category_idx ON assignments (category_id);

CREATE TABLE grades (
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    direct_score NUMERIC,
    recovery_score NUMERIC,
    tool_results JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (enrollment_id, assignment_id)
);
CREATE INDEX grades_assignment_idx ON grades (assignment_id);

CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    period_index INTEGER NOT NULL,
    notes TEXT,
    UNIQUE (class_id, date, period_index)
);
CREATE INDEX journal_entries_year_idx ON journal_entries (academic_year_id);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    hecho BOOLEAN NOT NULL DEFAULT false,
    fecha_inicio DATE,
    fecha_fin DATE
);
CREATE INDEX tasks_year_idx ON tasks (academic_year_id);

CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    hora TIME,
    tipo TEXT NOT NULL CHECK (tipo IN ('tutoria','departamento','familia','r_tutores')),
    con_quien TEXT,
    motivo TEXT,
    acuerdos TEXT,
    seguimiento TEXT
);
CREATE INDEX meetings_year_idx ON meetings (academic_year_id);

CREATE TABLE agenda_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    texto TEXT NOT NULL
);
CREATE INDEX agenda_notes_year_idx ON agenda_notes (academic_year_id);
