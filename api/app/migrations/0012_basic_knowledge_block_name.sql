-- Nombre del bloque oficial al que pertenece un saber básico (p.ej. "A.
-- Proyecto científico" en Biología y Geología). El código del saber básico
-- ya guardaba la letra del bloque ("A.1", "B.2"...) pero nunca su nombre
-- real -- ese dato no existe en ningún sitio del CSV/currículo importado
-- hasta ahora. NULL = sin bloque conocido (currículos propios del
-- profesor, o saberes sueltos sin agrupar). Denormalizado a propósito
-- (repetido en cada fila que comparte letra) en vez de una tabla aparte:
-- el patrón de acceso es siempre "todos los saberes de este curso a la
-- vez", nunca una consulta inversa por bloque suelto -- mismo criterio ya
-- aplicado a los vínculos M:N de programming_units.
ALTER TABLE basic_knowledge
    ADD COLUMN block_name TEXT;
