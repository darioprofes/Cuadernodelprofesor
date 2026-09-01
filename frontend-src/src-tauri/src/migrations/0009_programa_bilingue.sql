-- Mismo campo que api/app/migrations/0022_programa_bilingue.sql en el
-- backend web, traducido a dialecto SQLite -- indicar si el alumno
-- participa en el programa bilingüe, aparte de programa_especifico (texto
-- libre pensado para Diversificación/PMAR, no para esto).
ALTER TABLE enrollments ADD COLUMN programa_bilingue INTEGER;
