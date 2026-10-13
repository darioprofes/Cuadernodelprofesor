# Grupos de tareas del cuaderno

Un grupo es un bloque de columnas dentro de una categoría: un resultado calculado y las subcolumnas de sus tareas. Comparten color; el resultado tiene un tono más marcado. Plegar el bloque no modifica sus notas ni el cálculo.

## Uso

1. Pulsa **Añadir grupo** en la categoría y escribe su nombre.
2. Selecciona tareas existentes de esa evaluación. Las tareas de otras categorías se trasladan a la categoría del grupo al guardar.
3. Ajusta los pesos internos. Corresponden a la importancia personalizada habitual de cada tarea, no a un segundo sistema de pesos.
4. Configura la importancia del grupo frente a otras evidencias y, opcionalmente, su peso en la media tradicional por categorías.
5. **Añadir tarea** en la cabecera crea nuevas tareas directamente en el grupo.
6. Califica las tareas normalmente. El resultado del grupo es de solo lectura; pulsarlo muestra las notas por criterio.

Las flechas ordenan columnas. Sobre el resultado mueven el bloque completo; sobre una tarea incluida la mueven entre sus subcolumnas. El orden se guarda y no afecta a las notas.

Cambiar una tarea de categoría o evaluación la retira del grupo. Cambiar la categoría del grupo traslada sus tareas juntas. Quitar una tarea o disolver el grupo conserva notas y devuelve el cómputo individual. No se permiten grupos anidados, tareas en dos grupos ni recuperaciones dentro de un grupo.

## Cálculo

Los criterios se deducen de las tareas; no se seleccionan en el grupo.

Para cada alumno y criterio:

`nota del grupo = suma(nota × importancia de tarea × ratio del criterio) / suma(importancia de tarea × ratio del criterio)`

Solo participan tareas con nota para ese criterio y peso positivo. Una nota pendiente no se convierte en cero; un cero registrado sí participa. Las notas de instrumentos se derivan primero con el motor habitual.

En la evaluación las tareas interiores quedan excluidas y el grupo aporta una sola evidencia por criterio, con su importancia. Añadir preguntas puede cambiar la nota interna, pero no aumenta automáticamente el peso del bloque frente a un examen.

La nota global del grupo usa el reparto igual/manual de criterios de la materia, renormalizado entre los criterios con nota. Las tareas sin criterios pueden dar una nota global, pero no inventan evidencias para criterios no vinculados. Las medias por categorías también excluyen las tareas interiores.

Los grupos no aparecen como tareas programadas en Hoy, agenda o exámenes; sus tareas sí mantienen sus fechas y presencia habitual.

## Persistencia y mantenimiento

El contenedor es un registro `assignments` con `assignment_group` (`memberIds`, `color` y `memberWeights`). Los pesos de esa configuración se aplican a la importancia de las tareas al guardar el grupo. El cálculo lee siempre la importancia actual de cada tarea; no reutiliza ese mapa como un peso adicional. No se guardan notas derivadas ni criterios propios del grupo.

`column_order` guarda el orden visual. Ambos campos son opcionales. El CRUD existente gestiona contenedores y tareas, y el servidor rechaza notas propias sobre grupos.

- PostgreSQL: migración `0028_assignment_groups.sql`; grupos, traslado de tareas y pesos se guardan en una transacción. Las operaciones de pertenencia se serializan mediante bloqueo de la fila de clase.
- SQLite: migración embebida `0013_assignment_groups.sql` y transacciones equivalentes. El exportador declara `assignment_group` como JSON para conservar el formato compatible con la web.
- `POST /classes/{classId}/assignments/reorder`: guarda atómicamente una lista completa de columnas hermanas y comprueba su categoría/grupo.
- `joinGroupId`: parámetro de creación; nueva tarea e incorporación al grupo se guardan juntas. No es una columna de datos.
- `services/assignmentGroups.ts`: motor de notas derivadas, exclusión de tareas interiores y bloques visuales.

Pruebas TypeScript: pesos, pendientes, ceros, criterios distintos, separación de alumnos/evaluaciones y ausencia de doble cómputo. Rust: CRUD, copias/restauración, cambios de categoría, orden y creación dentro del grupo sobre SQLite real en memoria. Python: contratos y validaciones sin conexión PostgreSQL.

Esta función requiere actualizar API y frontend; copiar solo los estáticos no basta. La migración PostgreSQL debe ensayarse sobre una base de pruebas antes de producción.
