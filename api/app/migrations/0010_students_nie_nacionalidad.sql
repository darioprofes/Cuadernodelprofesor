-- ==========================================================
-- NIE (Número de Identificación Escolar) y Nacionalidad en students
-- ==========================================================
--
-- NIE es el identificador de alumnado del sistema educativo asturiano
-- (SAUCE) — no confundir con el "NIE" español de Número de Identidad de
-- Extranjero, que en esta app vive en la columna `dni` (etiquetada
-- "DNI/NIE" en la ficha, ver StudentPersonalDataModal.tsx). A diferencia
-- del DNI, todo el alumnado tiene NIE desde que se matricula por primera
-- vez, así que es la clave real para no duplicar una persona al
-- reimportar el listado de SAUCE (ver services/sauceImport.ts en el
-- frontend). UNIQUE pero nullable: un alumno dado de alta a mano puede no
-- tenerlo todavía.

ALTER TABLE students ADD COLUMN nie TEXT UNIQUE;
ALTER TABLE students ADD COLUMN nacionalidad TEXT;
