-- Orden manual del alumnado en la lista de una clase (drag & drop en
-- GradebookTable.tsx) -- NULL mientras no se haya reordenado nunca a mano,
-- en cuyo caso el frontend cae a orden alfabético/por grupo de referencia.
ALTER TABLE enrollments ADD COLUMN orden INTEGER;
