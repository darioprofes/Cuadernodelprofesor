-- Distinción ESO/Bachillerato para descriptores operativos. En el sistema
-- anterior esto se codificaba en el propio id (sufijo -eso/-bach, generado
-- en el cliente); con ids reales de Postgres (gen_random_uuid()) esa
-- convención ya no es posible, así que se hace una columna real. NULL =
-- descriptor genérico, sin variante por etapa (comportamiento equivalente
-- al "generic" del sistema anterior).
ALTER TABLE operational_descriptors
    ADD COLUMN stage TEXT CHECK (stage IN ('eso', 'bachillerato'));
