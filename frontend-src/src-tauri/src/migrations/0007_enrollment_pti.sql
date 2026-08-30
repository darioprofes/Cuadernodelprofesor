-- Indicaciones del PTI (Plan de Trabajo Individualizado) -- mismo cambio que
-- 0021_enrollment_pti.sql en el backend web (Postgres).

ALTER TABLE enrollments ADD COLUMN indicaciones_pti TEXT;
