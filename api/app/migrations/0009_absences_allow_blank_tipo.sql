-- ==========================================================
-- Permite tipo_falta = '' en absences: marca "pendiente de subir
-- en blanco a Educastur" (borra allí una falta que sí llegó a
-- subirse, sin dejar la fila local a medias mientras tanto).
-- ==========================================================
--
-- Solo se usa este valor cuando una falta con educastur_falta_id ya
-- asignado se elimina localmente (services/absences.py::delete_absence):
-- en vez de borrar la fila al momento, se deja marcada en blanco y
-- pendiente de sincronizar, para poder mandarle a Educastur el mismo
-- idFalta con tipoFalta='' (procesar_falta ya acepta ese valor) y así
-- borrarla también allí. Una vez esa subida en blanco tiene éxito, la
-- fila se borra de verdad (services/educastur_sync.py). Si la falta
-- nunca llegó a subirse (sin educastur_falta_id), el borrado local
-- sigue siendo inmediato — nada que limpiar en Educastur.

ALTER TABLE absences DROP CONSTRAINT absences_tipo_falta_check;
ALTER TABLE absences ADD CONSTRAINT absences_tipo_falta_check CHECK (tipo_falta IN ('R', 'J', 'I', ''));
