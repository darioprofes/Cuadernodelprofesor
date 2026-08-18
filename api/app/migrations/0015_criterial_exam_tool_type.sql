-- Examen criterial: cuarto tipo de instrumento de evaluación (junto a
-- checklist/rating_scale/rubric). Cada ítem es una pregunta, `weight` se
-- reutiliza como sus puntos máximos, y el profesor introduce los puntos
-- obtenidos en vez de un check o un nivel -- el motor de cálculo ya
-- existente (calculateToolGlobalScore/calculateCriterionScoresFromTool en
-- el frontend) deriva la nota global Y la nota por criterio con la misma
-- media ponderada por `weight` que ya usan los demás instrumentos.

ALTER TABLE evaluation_tools DROP CONSTRAINT evaluation_tools_type_check;
ALTER TABLE evaluation_tools ADD CONSTRAINT evaluation_tools_type_check
    CHECK (type IN ('checklist', 'rating_scale', 'rubric', 'criterial_exam'));

ALTER TABLE assignments DROP CONSTRAINT assignments_evaluation_method_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_evaluation_method_check
    CHECK (evaluation_method IN ('direct_grade', 'checklist', 'rating_scale', 'rubric', 'criterial_exam'));
