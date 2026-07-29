// Escala de espaciado semántica: nombra el PAPEL del espacio (qué tan denso
// es este bloque), no el número de Tailwind — así un componente pide
// `SPACING.card` en vez de repetir "p-4" de memoria, y cambiar la densidad
// general de la app es editar aquí, no buscar por todo el repo. Los
// valores en sí ya eran el patrón dominante observado en la app (p-2/p-3/
// p-4/p-6, space-y-2/4/6, gap-1.5/2/4) — esto solo lo pone en un sitio y le
// da nombre, no inventa una escala nueva.
export const SPACING = {
    // Padding
    compact: 'p-2',   // controles pequeños, celdas densas
    field: 'p-3',      // aire alrededor de un único campo/fila
    card: 'p-4',       // tarjetas, secciones dentro de un panel
    modal: 'p-6',      // cuerpo de un modal

    // Ritmo vertical entre bloques (space-y-*)
    stackTight: 'space-y-2',
    stack: 'space-y-4',
    stackLoose: 'space-y-6',

    // Espacio entre elementos en fila/columna (gap-*)
    gapTight: 'gap-1.5',
    gap: 'gap-2',
    gapLoose: 'gap-4',
} as const;

export type SpacingKey = keyof typeof SPACING;
