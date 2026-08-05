-- ==========================================================
-- Fase 6: baja del sistema de blob único (solo web — escritorio sigue
-- usándolo hasta la Fase 7, ver src-tauri/) y fotos de alumnado reales
-- ==========================================================
--
-- app_db/app_db_history nunca los usa escritorio (habla con Tauri, no con
-- este backend) — solo RemoteDbAdapter (web) los usaba, y ese adaptador
-- desaparece en esta misma fase. Seguros de borrar sin condición.
--
-- student_photos (student_id TEXT, data_url TEXT) era la forma provisional
-- de la Fase 1 (students todavía no existía como tabla real). Ahora que sí
-- existe, las fotos pasan a vivir directamente en students como BYTEA +
-- content_type — mismo criterio que se pospuso explícitamente en
-- 0003_instance_data.sql hasta que routers/photos.py (el consumidor viejo)
-- dejara de existir. Ese momento es este.

DROP TABLE IF EXISTS app_db_history;
DROP TABLE IF EXISTS app_db;
DROP TABLE IF EXISTS student_photos;

ALTER TABLE students ADD COLUMN foto BYTEA;
ALTER TABLE students ADD COLUMN foto_content_type TEXT;
