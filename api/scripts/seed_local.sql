-- Datos exclusivamente ficticios para el entorno local.
-- Es idempotente: se puede ejecutar varias veces sin duplicar registros.

BEGIN;

INSERT INTO app_preferences (id, layout_mode, default_calendar_view, grade_scale)
VALUES (true, 'compact', 'week', '[{"label":"Insuficiente","min":0,"max":4.99},{"label":"Suficiente","min":5,"max":5.99},{"label":"Bien","min":6,"max":6.99},{"label":"Notable","min":7,"max":8.99},{"label":"Sobresaliente","min":9,"max":10}]')
ON CONFLICT (id) DO NOTHING;

INSERT INTO shortcuts (id, label, url, icon, sort_order) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Aula virtual', 'https://example.invalid/aula', 'GraduationCap', 1),
  ('10000000-0000-4000-8000-000000000002', 'Documentación de prueba', 'https://example.invalid/docs', 'BookOpen', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO academic_years (id, label, start_date, end_date, is_current, holidays, periods) VALUES
  ('20000000-0000-4000-8000-000000000001', '2026-2027 (demostración)', '2026-09-01', '2027-06-30', true,
   '[{"id":"22000000-0000-4000-8000-000000000001","name":"Festivo local (demostración)","startDate":"2026-09-15","endDate":"2026-09-15","type":"festivo"},{"id":"22000000-0000-4000-8000-000000000002","name":"Vacaciones de invierno","startDate":"2026-12-23","endDate":"2027-01-07","type":"vacaciones"},{"id":"22000000-0000-4000-8000-000000000003","name":"Vacaciones de primavera","startDate":"2027-03-27","endDate":"2027-04-05","type":"vacaciones"}]',
   '["08:30 – 09:25","09:25 – 10:20","10:40 – 11:35","11:35 – 12:30"]')
ON CONFLICT (id) DO NOTHING;

-- Corrige únicamente el formato antiguo de los festivos que usaba la
-- primera versión del seed. No reemplaza cambios posteriores del usuario.
UPDATE academic_years
SET holidays = '[{"id":"22000000-0000-4000-8000-000000000001","name":"Festivo local (demostración)","startDate":"2026-09-15","endDate":"2026-09-15","type":"festivo"},{"id":"22000000-0000-4000-8000-000000000002","name":"Vacaciones de invierno","startDate":"2026-12-23","endDate":"2027-01-07","type":"vacaciones"},{"id":"22000000-0000-4000-8000-000000000003","name":"Vacaciones de primavera","startDate":"2027-03-27","endDate":"2027-04-05","type":"vacaciones"}]'::jsonb,
    periods = '["08:30 – 09:25","09:25 – 10:20","10:40 – 11:35","11:35 – 12:30"]'::jsonb,
    updated_at = now()
WHERE id = '20000000-0000-4000-8000-000000000001'
  AND holidays = '[{"start":"2026-12-23","end":"2027-01-07","label":"Vacaciones de invierno"},{"start":"2027-03-27","end":"2027-04-05","label":"Vacaciones de primavera"}]'::jsonb;

INSERT INTO evaluation_periods (id, academic_year_id, name, start_date, end_date, weight) VALUES
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Primera evaluación', '2026-09-01', '2026-12-18', 1),
  ('21000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Segunda evaluación', '2027-01-08', '2027-03-26', 1),
  ('21000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Tercera evaluación', '2027-04-06', '2027-06-30', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO courses (id, level, subject, type) VALUES
  ('30000000-0000-4000-8000-000000000001', '4.º ESO', 'Matemáticas B', 'academic'),
  ('30000000-0000-4000-8000-000000000002', '2.º ESO', 'Matemáticas', 'academic')
ON CONFLICT (id) DO NOTHING;

INSERT INTO academic_year_courses (id, academic_year_id, course_id) VALUES
  ('31000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('31000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO classes (id, academic_year_id, course_id, grupo, schedule, icono, color_acento) VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'A', '[{"day":1,"periodIndex":0,"aula":"Aula 12"},{"day":2,"periodIndex":2,"aula":"Aula 12"},{"day":3,"periodIndex":1,"aula":"Aula 12"},{"day":4,"periodIndex":3,"aula":"Aula 12"},{"day":5,"periodIndex":0,"aula":"Aula 12"}]', 'Calculator', 222),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'B', '[{"day":1,"periodIndex":2,"aula":"Aula 08"},{"day":2,"periodIndex":0,"aula":"Aula 08"},{"day":3,"periodIndex":3,"aula":"Aula 08"},{"day":4,"periodIndex":1,"aula":"Aula 08"},{"day":5,"periodIndex":2,"aula":"Aula 08"}]', 'Sigma', 152)
ON CONFLICT (id) DO NOTHING;

-- También actualiza el horario si el conjunto se vuelve a ejecutar.
UPDATE classes
SET schedule = CASE id
  WHEN '40000000-0000-4000-8000-000000000001'::uuid THEN '[{"day":1,"periodIndex":0,"aula":"Aula 12"},{"day":2,"periodIndex":2,"aula":"Aula 12"},{"day":3,"periodIndex":1,"aula":"Aula 12"},{"day":4,"periodIndex":3,"aula":"Aula 12"},{"day":5,"periodIndex":0,"aula":"Aula 12"}]'::jsonb
  WHEN '40000000-0000-4000-8000-000000000002'::uuid THEN '[{"day":1,"periodIndex":2,"aula":"Aula 08"},{"day":2,"periodIndex":0,"aula":"Aula 08"},{"day":3,"periodIndex":3,"aula":"Aula 08"},{"day":4,"periodIndex":1,"aula":"Aula 08"},{"day":5,"periodIndex":2,"aula":"Aula 08"}]'::jsonb
END,
updated_at = now()
WHERE id IN ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002');

INSERT INTO students (id, nombre, primer_apellido, segundo_apellido, fecha_nacimiento, autorizacion_imagen, autorizacion_salidas) VALUES
  ('50000000-0000-4000-8000-000000000001', 'Alex', 'Montes', 'Vega', '2010-02-14', true, true),
  ('50000000-0000-4000-8000-000000000002', 'Bruna', 'Campos', 'Solís', '2010-07-03', false, true),
  ('50000000-0000-4000-8000-000000000003', 'Ciro', 'Díaz', 'Luna', '2010-10-21', true, false),
  ('50000000-0000-4000-8000-000000000004', 'Dana', 'Iglesias', 'Ríos', '2010-05-12', true, true),
  ('50000000-0000-4000-8000-000000000005', 'Elia', 'Navarro', 'Marín', '2012-01-19', true, true),
  ('50000000-0000-4000-8000-000000000006', 'Fabio', 'Pardo', 'Sanz', '2012-08-26', false, true),
  ('50000000-0000-4000-8000-000000000007', 'Gala', 'Rey', 'Mora', '2012-04-05', true, true),
  ('50000000-0000-4000-8000-000000000008', 'Hugo', 'Vidal', 'Núñez', '2012-11-11', true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO enrollments (id, student_id, class_id, centro_procedencia, ha_repetido_curso, plano_x, plano_y, plano_color) VALUES
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'IES de ejemplo', false, 1, 1, '#2563eb'),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'IES de ejemplo', false, 2, 1, '#7c3aed'),
  ('51000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'IES de ejemplo', false, 3, 1, '#059669'),
  ('51000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 'IES de ejemplo', true, 4, 1, '#ea580c'),
  ('51000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000002', 'IES de ejemplo', false, 1, 1, '#2563eb'),
  ('51000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000002', 'IES de ejemplo', false, 2, 1, '#7c3aed'),
  ('51000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000002', 'IES de ejemplo', false, 3, 1, '#059669'),
  ('51000000-0000-4000-8000-000000000008', '50000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000002', 'IES de ejemplo', false, 4, 1, '#ea580c')
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, class_id, evaluation_period_id, name, weight, type) VALUES
  ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Pruebas escritas', 0.6, 'normal'),
  ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Trabajo diario', 0.4, 'normal')
ON CONFLICT (id) DO NOTHING;

INSERT INTO assignments (id, class_id, category_id, evaluation_period_id, name, date, evaluation_method, peso_en_categoria, importancia) VALUES
  ('61000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Control de álgebra', '2026-10-16', 'direct_grade', 1, 'normal'),
  ('61000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', 'Cuaderno y participación', '2026-10-23', 'direct_grade', 1, 'normal')
ON CONFLICT (id) DO NOTHING;

INSERT INTO grades (enrollment_id, assignment_id, direct_score) VALUES
  ('51000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 8.5),
  ('51000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000001', 6.2),
  ('51000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000001', 7.4),
  ('51000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000001', 4.8),
  ('51000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002', 9.0),
  ('51000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 7.8),
  ('51000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000002', 8.6),
  ('51000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000002', 6.5)
ON CONFLICT (enrollment_id, assignment_id) DO NOTHING;

INSERT INTO tasks (id, academic_year_id, texto, hecho, fecha_inicio, fecha_fin) VALUES
  ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Preparar la unidad de proporcionalidad', false, '2026-10-19', '2026-10-23'),
  ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Revisar las calificaciones de la primera evaluación', false, '2026-12-14', '2026-12-18'),
  ('70000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Enviar recordatorio de material', true, '2026-10-01', '2026-10-01')
ON CONFLICT (id) DO NOTHING;

INSERT INTO meetings (id, academic_year_id, fecha, hora, tipo, con_quien, motivo, acuerdos, seguimiento) VALUES
  ('71000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '2026-10-22', '16:30', 'tutoria', 'Familia ficticia de Alex Montes', 'Seguimiento del inicio de curso', 'Mantener una agenda semanal de trabajo.', 'Revisar dentro de tres semanas.'),
  ('71000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '2026-10-28', '13:30', 'departamento', 'Departamento de Matemáticas', 'Coordinación de criterios', 'Usar una rúbrica común.', 'Llevar borrador a la próxima reunión.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO agenda_notes (id, academic_year_id, fecha, texto) VALUES
  ('72000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '2026-10-20', 'Llevar material manipulativo para la actividad de proporcionalidad.'),
  ('72000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '2026-10-23', 'Publicar la tarea de repaso antes del fin de semana.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO journal_entries (id, academic_year_id, class_id, date, period_index, notes) VALUES
  ('73000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '2026-10-19', 1, 'Introducción a la proporcionalidad. Buena participación general.'),
  ('73000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '2026-10-21', 1, 'Resolución cooperativa de problemas con porcentajes.')
ON CONFLICT (id) DO NOTHING;

COMMIT;
