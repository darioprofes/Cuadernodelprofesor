-- Notas libres del profesor sobre cómo prefiere el material que genera la
-- IA (más allá de los rasgos de estilo ya guardados en teacher_profile) --
-- se inyecta también en el prompt de cada Situación de Aprendizaje generada.

ALTER TABLE app_preferences
    ADD COLUMN teacher_notes TEXT NOT NULL DEFAULT '';
