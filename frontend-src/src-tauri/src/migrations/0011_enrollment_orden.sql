-- Mismo campo que api/app/migrations/0025_enrollment_orden.sql en el
-- backend web -- orden manual del alumnado en la lista de una clase
-- (drag & drop en GradebookTable.tsx). NULL mientras no se haya
-- reordenado nunca a mano.
ALTER TABLE enrollments ADD COLUMN orden INTEGER;
