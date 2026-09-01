-- ==========================================================
-- Paridad con varias migraciones web que nunca se portaron a escritorio
-- ==========================================================
--
-- Perfil Docente (mismos campos que api/app/migrations/0014_teacher_profile,
-- 0019_teacher_notes, 0020_teacher_personal_data) -- se habían dejado fuera
-- a propósito en su momento ("Solo web por ahora: no hay protocolo/comando
-- equivalente en Tauri todavía", ver TeacherProfileManager.tsx), ahora se
-- completa el resto de comandos Rust en el mismo cambio que esta migración.
ALTER TABLE app_preferences ADD COLUMN teacher_profile TEXT NOT NULL DEFAULT '[]';
ALTER TABLE app_preferences ADD COLUMN teacher_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE app_preferences ADD COLUMN teacher_name TEXT NOT NULL DEFAULT '';
ALTER TABLE app_preferences ADD COLUMN teacher_photo BLOB;
ALTER TABLE app_preferences ADD COLUMN teacher_photo_content_type TEXT;

-- Alias corto de columna + escala propia de una tarea (mismos campos que
-- api/app/migrations/0016_assignment_short_name, 0018_puntuacion_maxima_directa).
ALTER TABLE assignments ADD COLUMN short_name TEXT;
ALTER TABLE assignments ADD COLUMN puntuacion_maxima NUMERIC;
ALTER TABLE grades ADD COLUMN direct_score_raw NUMERIC;

-- Rasgos del grupo (mismo campo que api/app/migrations/0013_situacion_aprendizaje).
ALTER TABLE classes ADD COLUMN caracteristicas_grupo TEXT NOT NULL DEFAULT '[]';

-- Situación de Aprendizaje completa: competencias específicas vinculadas,
-- contexto de partida, producto final y examen final (mismos campos que
-- api/app/migrations/0013_situacion_aprendizaje) -- sin esto, crear una SA
-- completa en escritorio perdía silenciosamente estos 4 datos.
ALTER TABLE programming_units ADD COLUMN linked_specific_competence_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE programming_units ADD COLUMN context TEXT;
ALTER TABLE programming_units ADD COLUMN final_product TEXT NOT NULL DEFAULT '{"incluido": false}';
ALTER TABLE programming_units ADD COLUMN final_exam TEXT NOT NULL DEFAULT '{"incluido": false}';

-- NOTA (no resuelto en esta migración): 'criterial_exam' sigue sin ser un
-- valor válido en los CHECK de evaluation_tools.type / assignments.evaluation_method
-- aquí -- SQLite no admite ALTER/DROP CONSTRAINT, ensancharlos exige recrear
-- ambas tablas (CREATE nueva + copiar + DROP + RENAME), con cuidado extra
-- por las FKs que las referencian. Se deja pendiente para una migración
-- aparte en vez de arriesgar esta.
