-- Indicaciones del PTI (Plan de Trabajo Individualizado) del alumno en este
-- curso -- campo nuevo, distinto de medidas_educativas (que ya existía):
-- ese es el resumen de medidas aplicadas, este es el texto de las
-- indicaciones concretas del PTI, pensado como entrada para adaptar
-- materiales con IA (ver services/prompts/adaptacion_material.py). Vive en
-- enrollments, no en students, por el mismo motivo que el resto de campos
-- NEAE: es información de la matrícula de ESE curso, no de la persona.

ALTER TABLE enrollments ADD COLUMN indicaciones_pti TEXT;
