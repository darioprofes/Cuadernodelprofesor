-- Contenedores sin notas propias; criterios deducidos de las tareas incluidas.
ALTER TABLE assignments ADD COLUMN assignment_group JSONB;
ALTER TABLE assignments ADD COLUMN column_order DOUBLE PRECISION;
ALTER TABLE assignments ADD CONSTRAINT assignments_group_object_check
    CHECK (assignment_group IS NULL OR jsonb_typeof(assignment_group) = 'object');
