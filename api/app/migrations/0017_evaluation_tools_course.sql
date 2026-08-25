-- Materia opcional en los instrumentos de evaluación (rúbricas, escalas,
-- listas de cotejo, exámenes criteriales): al haber muchos, agrupar/
-- filtrar por nivel+materia (courses ya combina ambos) hace falta para
-- encontrarlos. Opcional a propósito -- los ya existentes no tienen esta
-- información y no se migran a mano, quedan como "sin materia asignada"
-- hasta que el profesor la añada si quiere. ON DELETE SET NULL: borrar una
-- materia no debe arrastrar sus instrumentos, solo dejarlos sin asignar.

ALTER TABLE evaluation_tools ADD COLUMN course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
