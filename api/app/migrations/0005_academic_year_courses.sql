-- Declara qué materias (courses) imparte el profesor en un curso académico
-- concreto, independientemente de si ya existe algún grupo (classes) para
-- ella. Sin esto, "Materia" en la cabecera solo podría poblarse a partir de
-- classes ya creadas — obligaría a crear un grupo antes de poder "elegir
-- qué materias imparto este año", contradiciendo el flujo real (año →
-- elijo materias → añado grupos). Sin updated_at ni más columnas: es una
-- declaración pura, no un dato con contenido propio.
CREATE TABLE academic_year_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (academic_year_id, course_id)
);
CREATE INDEX academic_year_courses_year_idx ON academic_year_courses (academic_year_id);
