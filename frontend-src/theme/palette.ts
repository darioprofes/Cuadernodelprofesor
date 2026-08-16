// Paleta de la app, derivada de los colores del hero de "Hoy"
// (components/BannerCostero.tsx: colina verde, mar/faro azul, playa arena),
// para dar uniformidad visual entre cabeceras de tarjeta, títulos de página
// y acentos de navegación en vez de tonos sueltos de Tailwind (blue-600,
// orange-600...) elegidos sin relación entre sí.
export interface AccentColor {
    soft: string;   // fondo muy suave, para sombrear títulos de página / franjas
    base: string;   // tono medio, para iconos y acentos puntuales
    header: string; // tono intenso, para cabeceras de tarjeta con texto blanco
}

export const PALETTE = {
    // Colina del faro
    green: { soft: '#eef6ec', base: '#9cc49a', header: '#7aab74' },
    // Cuerpo del faro / mar
    blue: { soft: '#eaf3fb', base: '#bfe0f5', header: '#5b8fd1' },
    // Tejado del faro, el tono más intenso del hero
    navy: { soft: '#e8edf5', base: '#5b8fd1', header: '#2f5c99' },
    // Playa — dorado cálido, más alegre que el ocre original pero sin llegar al naranja vivo
    sand: { soft: '#faf4eb', base: '#d9b98c', header: '#ce9d58' },
    // Cielo/montañas lejanas, intensificado a un teal para tener un 5º acento
    teal: { soft: '#eaf6fa', base: '#c3d6ec', header: '#3f8fab' },
} as const satisfies Record<string, AccentColor>;

export type PaletteKey = keyof typeof PALETTE;

// Un acento por sección de navegación, reutilizando el mismo agrupamiento
// que ya existe en el Sidebar ("Enseñanza" / "Comunicación") para que el
// color del título de cada página refuerce esa misma agrupación.
export const SECTION_ACCENT: Record<string, PaletteKey> = {
    horario: 'blue',
    clases: 'sand',
    calendar: 'navy',
    gradebook: 'green',
    journal: 'green',
    exams: 'green',
    meetings: 'teal',
    criteria: 'teal',
    competences: 'teal',
    'key-competences': 'teal',
    descriptors: 'teal',
    'ai-tools': 'sand',
};

// ==========================================================
// Tokens semánticos — la otra mitad del sistema de color
// ==========================================================
//
// PALETTE/SECTION_ACCENT de arriba son acentos DE SECCIÓN (cabeceras,
// franjas de página): cada pantalla tiene el suyo. Estos son acentos DE
// ACCIÓN (guardar, eliminar, confirmar...): los mismos en toda la app,
// vengan de la pantalla que vengan, porque un botón "Guardar" debe
// reconocerse igual venga de donde venga. `primary` reutiliza el tono navy
// (el más intenso del hero) para que la marca de la app y el color de
// acción principal sean el mismo azul, en vez de un azul de Tailwind sin
// relación con el resto de la paleta. Cualquier componente con color
// dinámico (Button, Badge, Alert, Input en estado de error...) lee de
// aquí — cambiar un tono es un solo sitio, no un find-and-replace.
export interface SemanticColor {
    base: string;     // fondo/borde en reposo
    hover: string;     // fondo al pasar el ratón (para botones sólidos)
    soft: string;      // fondo muy suave (badges, alerts, franjas)
    text: string;      // texto/icono legible sobre `base`
    softText: string;  // texto/icono legible sobre `soft`
}

export type SemanticKey = 'primary' | 'danger' | 'success' | 'warning' | 'neutral';

export const SEMANTIC: Record<SemanticKey, SemanticColor> = {
    primary: { base: PALETTE.navy.header, hover: '#264d80', soft: PALETTE.navy.soft, text: '#ffffff', softText: PALETTE.navy.header },
    danger: { base: '#dc2626', hover: '#b91c1c', soft: '#fee2e2', text: '#ffffff', softText: '#991b1b' },
    success: { base: '#16a34a', hover: '#15803d', soft: '#dcfce7', text: '#ffffff', softText: '#166534' },
    warning: { base: PALETTE.sand.header, hover: '#b27d34', soft: PALETTE.sand.soft, text: '#ffffff', softText: '#86612d' },
    neutral: { base: '#475569', hover: '#334155', soft: '#f1f5f9', text: '#ffffff', softText: '#334155' },
};
