-- Amplía programming_units para producir Situaciones de Aprendizaje completas
-- (ver plan de diseño, sesión 2026-08-17/18): competencias específicas
-- vinculadas (hueco real, specific_competences no se conectaba con nada),
-- contexto de partida, producto final y examen final. session_details cambia
-- de forma: cada sesión pasa de {description} a {titulo, actividades: [...]}
-- -- se transforma el dato ya existente en vez de descartarlo.

ALTER TABLE programming_units
    ADD COLUMN linked_specific_competence_ids UUID[] NOT NULL DEFAULT '{}',
    ADD COLUMN context TEXT,
    ADD COLUMN final_product JSONB NOT NULL DEFAULT '{"incluido": false}',
    ADD COLUMN final_exam JSONB NOT NULL DEFAULT '{"incluido": false}';

UPDATE programming_units
SET session_details = (
    SELECT jsonb_agg(
        jsonb_build_object(
            'titulo', '',
            'actividades', jsonb_build_array(
                jsonb_build_object(
                    'titulo', '',
                    'tipo', NULL,
                    'agrupamiento', NULL,
                    'duracionMin', NULL,
                    'recursos', '[]'::jsonb,
                    'descripcion', elem->>'description',
                    'linkedCriteriaIds', '[]'::jsonb
                )
            )
        )
    )
    FROM jsonb_array_elements(session_details) AS elem
)
WHERE session_details IS NOT NULL AND jsonb_array_length(session_details) > 0;

ALTER TABLE classes
    ADD COLUMN caracteristicas_grupo TEXT[] NOT NULL DEFAULT '{}';
