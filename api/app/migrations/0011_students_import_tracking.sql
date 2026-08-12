-- ==========================================================
-- Rastro de la última importación de SAUCE en students
-- ==========================================================
--
-- imported_academic_year_id: curso académico en el que se importó (o
-- reimportó) esta persona por última vez desde SAUCE — permite que el
-- selector de "alumnado ya existente" al matricular filtre por defecto al
-- alumnado del curso actual, en vez de mezclarlo con alumnado antiguo de
-- cursos ya cerrados (ver ExistingStudentPicker.tsx).
--
-- ultimo_curso_sauce / ultima_unidad_sauce: Curso/Unidad tal como los trae
-- SAUCE en esa misma importación — no se usan para matricular
-- automáticamente (un grupo-clase puede mezclar alumnado de varias
-- Unidades, ver conversación de diseño), solo como filtro manual rápido
-- al elegir a quién matricular en una clase concreta.

ALTER TABLE students ADD COLUMN imported_academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN ultimo_curso_sauce TEXT;
ALTER TABLE students ADD COLUMN ultima_unidad_sauce TEXT;
