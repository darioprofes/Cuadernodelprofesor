-- Datos personales del profesor (nombre + foto), mismo criterio que la
-- ficha de alumnado pero reducido a lo que de verdad tiene sentido para un
-- perfil de un único profesor: nombre para mostrar en la app y una foto
-- opcional. BYTEA + content_type, mismo patrón que students.foto /
-- students.foto_content_type (ver migración 0006).

ALTER TABLE app_preferences
    ADD COLUMN teacher_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN teacher_photo BYTEA,
    ADD COLUMN teacher_photo_content_type TEXT;
