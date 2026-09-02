-- Quinto tipo de reunión: "Otras", para lo que no encaja en
-- tutoría/reunión de tutores/departamento/familia (p.ej. una reunión con
-- el equipo directivo, o algo puntual sin encaje en los otros 4) --
-- petición explícita del usuario.
ALTER TABLE meetings DROP CONSTRAINT meetings_tipo_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_tipo_check
    CHECK (tipo IN ('tutoria', 'departamento', 'familia', 'r_tutores', 'otras'));
