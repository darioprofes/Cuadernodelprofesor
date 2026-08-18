-- Perfil docente del profesor (tipo de profesor: rasgos de estilo/carácter
-- al enseñar), guardado una vez en Preferencias y reutilizado en el
-- contexto de todas las Situaciones de Aprendizaje generadas con IA -- para
-- que la IA escriba coherente con cómo enseña este profesor concreto, no
-- con un "eres un profesor" genérico.

ALTER TABLE app_preferences
    ADD COLUMN teacher_profile JSONB NOT NULL DEFAULT '[]';
