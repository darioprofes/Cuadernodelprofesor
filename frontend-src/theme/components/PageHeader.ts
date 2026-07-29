// Cabecera de sección de color (título + subtítulo/controles sobre fondo
// de acento) — antes cada pantalla tenía la suya con un padding ligeramente
// distinto (`p-4` vs `p-4 sm:p-5`) y sin altura mínima común, así que la
// cabecera acababa siendo más baja en las pantallas sin icono o sin
// subtítulo (Cuaderno, Agenda) que en las que sí los tienen (Clases,
// Reuniones...). `pageHeaderMinHeight` fija una altura común para las 5
// implementaciones (PageHeader, GradebookTable, ClassJournal, HorarioView,
// CalendarHeader) — la de "Hoy" es su propio héroe con ilustración y
// queda fuera a propósito, no tiene que igualarse a esto.
export const pageHeaderPaddingClassName = 'p-4 sm:p-5';

export const pageHeaderMinHeight = 'min-h-[5.5rem]';
