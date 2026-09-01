-- Indicar si el alumno participa en el programa bilingüe -- mismo criterio
-- que ha_repetido_curso (0002_reference_and_academic_years.sql), un booleano
-- aparte en vez de sobrecargar el texto libre de programa_especifico
-- (pensado para Diversificación/PMAR, no para esto).
ALTER TABLE enrollments ADD COLUMN programa_bilingue BOOLEAN;
