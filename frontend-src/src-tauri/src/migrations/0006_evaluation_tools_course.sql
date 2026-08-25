-- Materia opcional en los instrumentos de evaluación -- mismo cambio que
-- 0017_evaluation_tools_course.sql en el backend web (Postgres). Opcional
-- a propósito: los instrumentos ya existentes no tienen esta información y
-- no se migran a mano, quedan sin materia asignada hasta que el profesor
-- la añada si quiere. ON DELETE SET NULL: borrar una materia no debe
-- arrastrar sus instrumentos, solo dejarlos sin asignar.

ALTER TABLE evaluation_tools ADD COLUMN course_id TEXT REFERENCES courses(id) ON DELETE SET NULL;
