-- Mismo esquema que la migración web 0012 (ver api/app/migrations/), traducido
-- a dialecto SQLite -- nombre del bloque oficial al que pertenece un saber
-- básico. NULL = sin bloque conocido.
ALTER TABLE basic_knowledge ADD COLUMN block_name TEXT;
