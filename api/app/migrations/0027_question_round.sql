-- La ronda conserva cada intervención en grades.tool_results y la nota
-- acumulada en grades.direct_score. La descripción identifica qué se
-- observa en esta actividad concreta, no en una pregunta aislada.
ALTER TABLE assignments ADD COLUMN question_round_description TEXT;

ALTER TABLE assignments DROP CONSTRAINT assignments_evaluation_method_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_evaluation_method_check
    CHECK (evaluation_method IN ('direct_grade', 'checklist', 'rating_scale', 'rubric', 'criterial_exam', 'question_round'));
