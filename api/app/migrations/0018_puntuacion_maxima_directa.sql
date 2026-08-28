-- Escala opcional de una tarea de nota directa (p.ej. un examen puntuado
-- sobre 8 en vez de sobre 10) -- el cálculo de medias sigue siendo SIEMPRE
-- en base 10 (direct_score no cambia de significado), esto solo permite
-- mostrar el valor tal cual se escribió en vez de la nota ya convertida.
ALTER TABLE assignments ADD COLUMN puntuacion_maxima NUMERIC;

-- El valor tal cual lo escribió el profesor (p.ej. "7" sobre una
-- puntuacion_maxima de 8) -- direct_score guarda la conversión a base 10
-- (7/8*10 = 8.75) para que el resto del motor de cálculo no tenga que
-- saber nada de escalas distintas. Null si la tarea no tiene una escala
-- propia (direct_score ya es directamente lo que se escribió).
ALTER TABLE grades ADD COLUMN direct_score_raw NUMERIC;
