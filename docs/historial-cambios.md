# Historial y papelera del cuaderno

Desde la cabecera de una clase, **Historial / Papelera** permite abrir una vista previa y pulsar **Restaurar este cambio**. Se muestran fecha, elemento y registros asociados, con paginación de 200 cambios. Las notas se identifican por el alumnado de la clase cuando su matrícula sigue disponible.

Se registran introducción, modificación y borrado de notas; modificaciones y borrados de tareas/grupos, categorías, criterios, instrumentos y materias (incluidos pesos). La creación de tareas, categorías o instrumentos no se deshace desde este historial. Al borrar una tarea o categoría, sus notas se archivan en el mismo lote y se recuperan juntas. Disolver un grupo registra también los cambios asociados realizados por el servicio.

La función empieza a registrar cuando se instala la migración. No recupera notas borradas antes de esa fecha. El historial permanece al cerrar y abrir la aplicación y se incluye en las copias. Las importaciones de copias completas sustituyen también su historial; no generan miles de cambios ficticios. Las notas pueden contener datos académicos sensibles: el historial usa las mismas bases y controles de acceso que el cuaderno.

## Retención y vaciado

Se conservan los cambios del curso escolar actual, del 1 de septiembre al 31 de agosto. No son doce meses móviles ni depende del curso que se esté consultando. Al primer uso diario de la base (y al abrir la base de escritorio) se eliminan los lotes anteriores; también se aplica la retención al importar una copia antigua. Si un lote cruza el comienzo de curso, se conserva entero para no romper restauraciones. PostgreSQL calcula el inicio en Europe/Madrid; el escritorio usa su fecha local. No se borra ningún dato actual del cuaderno.

El botón **Vaciar todo el historial** abre una confirmación que exige escribir **BORRAR HISTORIAL**. Elimina las versiones y papelera de todas las clases, incluidos los cambios ya deshechos. Esta operación no se puede deshacer desde la aplicación. Las notas, tareas y configuración vigentes siguen intactas, y se vuelven a registrar los cambios futuros. Las copias externas existentes no se modifican. Los archivos de base de datos pueden mantener su tamaño físico: el espacio de los registros borrados queda reutilizable sin ejecutar compactaciones que bloqueen el uso.

Cada lote contiene la versión anterior y posterior. Antes de restaurar, se comprueba que las filas todavía coinciden con la versión posterior registrada. Si existen cambios posteriores, hay que deshacerlos primero. Se bloquea también restaurar la configuración de una tarea/instrumento si después se han modificado sus notas. La restauración entera se revierte si falta una categoría, matrícula u otra dependencia. No se sobrescriben silenciosamente versiones nuevas. Un cambio ya deshecho queda marcado; no hay botón de rehacer.

Los lotes corresponden a transacciones/peticiones del backend. Una acción de interfaz que envía varias peticiones puede aparecer en varios lotes; se deshacen del más reciente al más antiguo. El historial de clase muestra también las modificaciones de su materia y de instrumentos globales compartidos. Estos últimos pueden afectar a otras clases al restaurarlos.

## Persistencia y pruebas

PostgreSQL: migración 0029, triggers con un identificador UUID por transacción. SQLite: migración 0014, triggers y contexto por petición al router. Imágenes JSON y claves de fila; no se recalculan ni inventan calificaciones. Restaurar conserva las fechas originales de las filas para permitir deshacer varios pasos sucesivos; la fecha del deshacer se guarda aparte en el historial.

Se prueban ceros, notas nuevas/modificadas, conflictos por notas posteriores, recuperación de tarea con notas, agrupaciones/categorías con cascadas, y exportación/importación del historial. El ensayo PostgreSQL requiere una base explícita desechable `profe_history_test_*`; nunca debe ejecutarse contra la base original.
