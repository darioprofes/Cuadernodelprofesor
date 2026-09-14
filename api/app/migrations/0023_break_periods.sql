-- El recreo es una característica de una franja del horario, no una materia
-- ni una clase. Se guarda por índice porque periodIndex ya es la referencia
-- estable que usan horarios y entradas del Diario.
ALTER TABLE academic_years
    ADD COLUMN break_period_indexes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Conserva el significado de los cursos ya creados que etiquetaron la franja
-- como "Recreo" antes de que existiera el campo explícito.
UPDATE academic_years
SET break_period_indexes = (
    SELECT COALESCE(jsonb_agg(idx - 1 ORDER BY idx), '[]'::jsonb)
    FROM jsonb_array_elements_text(periods) WITH ORDINALITY AS p(label, idx)
    WHERE lower(label) LIKE '%recreo%'
)
WHERE break_period_indexes = '[]'::jsonb;
