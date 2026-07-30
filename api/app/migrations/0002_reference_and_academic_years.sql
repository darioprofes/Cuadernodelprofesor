-- ==========================================================
-- Referencia/currículo + academic_years + students (Fase 2)
-- ==========================================================
--
-- Aditiva por completo: no toca app_db/app_db_history/student_photos (el
-- sistema de blob sigue funcionando en paralelo hasta que el frontend deje
-- de depender de él). DDL exacto según fase-0-ddl-y-api.md, ya cerrado.

-- ---------- Global ----------

CREATE TABLE app_preferences (
    id BOOLEAN PRIMARY KEY DEFAULT true,
    layout_mode TEXT,
    default_calendar_view TEXT,
    grade_scale JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT app_preferences_singleton CHECK (id)
);

CREATE TABLE shortcuts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT,
    primer_apellido TEXT,
    segundo_apellido TEXT,
    fecha_nacimiento DATE,
    dni TEXT,
    telefono_urgencias TEXT,
    tutor1 JSONB,
    tutor2 JSONB,
    domicilio_direccion TEXT,
    domicilio_localidad TEXT,
    domicilio_codigo_postal TEXT,
    domicilio_telefono TEXT,
    alergias TEXT,
    enfermedades_relevantes TEXT,
    medicacion_habitual TEXT,
    intolerancias_alimentarias TEXT,
    observaciones_sanitarias TEXT,
    autorizacion_imagen BOOLEAN,
    autorizacion_salidas BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX students_apellidos_idx ON students (primer_apellido, segundo_apellido, nombre);

-- ---------- Referencia / currículo ----------

CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level TEXT NOT NULL,
    subject TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'academic' CHECK (type IN ('academic', 'other')),
    peso_criterios_manual BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE key_competences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE operational_descriptors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_competence_id UUID NOT NULL REFERENCES key_competences(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL
);
CREATE INDEX operational_descriptors_key_competence_idx ON operational_descriptors (key_competence_id);

CREATE TABLE specific_competences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX specific_competences_course_idx ON specific_competences (course_id);

CREATE TABLE specific_competence_descriptors (
    specific_competence_id UUID NOT NULL REFERENCES specific_competences(id) ON DELETE CASCADE,
    descriptor_id UUID NOT NULL REFERENCES operational_descriptors(id) ON DELETE CASCADE,
    PRIMARY KEY (specific_competence_id, descriptor_id)
);
CREATE INDEX specific_competence_descriptors_reverse_idx ON specific_competence_descriptors (descriptor_id);

CREATE TABLE evaluation_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    competence_id UUID NOT NULL REFERENCES specific_competences(id) ON DELETE RESTRICT,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    weight NUMERIC,
    exclude_from_weighting BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX evaluation_criteria_course_idx ON evaluation_criteria (course_id);
CREATE INDEX evaluation_criteria_competence_idx ON evaluation_criteria (competence_id);

CREATE TABLE basic_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL
);
CREATE INDEX basic_knowledge_course_idx ON basic_knowledge (course_id);

CREATE TABLE programming_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sessions INTEGER NOT NULL DEFAULT 0,
    start_date DATE,
    session_details JSONB NOT NULL DEFAULT '[]',
    linked_criteria_ids UUID[] NOT NULL DEFAULT '{}',
    linked_basic_knowledge_ids UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX programming_units_course_idx ON programming_units (course_id);

CREATE TABLE evaluation_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('checklist', 'rating_scale', 'rubric')),
    name TEXT NOT NULL,
    levels JSONB NOT NULL DEFAULT '[]',
    items JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- academic_years (sin datos de instancia todavia: eso es la Fase 3) ----------

CREATE TABLE academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL UNIQUE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT false,
    holidays JSONB NOT NULL DEFAULT '[]',
    periods JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT academic_years_dates CHECK (end_date > start_date)
);
CREATE UNIQUE INDEX academic_years_one_current ON academic_years (is_current) WHERE is_current;

CREATE TABLE evaluation_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    weight NUMERIC NOT NULL DEFAULT 1
);
CREATE INDEX evaluation_periods_year_idx ON evaluation_periods (academic_year_id);
