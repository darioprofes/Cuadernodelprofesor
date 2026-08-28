// Paleta de la app, repintada 2026-08-26 con los códigos de color reales
// que el usuario midió directamente sobre Educastur (no una aproximación a
// ojo) en vez de los tonos pastel derivados del hero de "Hoy" que tenía
// antes -- petición explícita, "no tan pastel". Colores medidos:
// 092152 (azul oscuro), 3399CC (azul claro), CCCC00 (verde/oliva),
// FFCC00 (amarillo/dorado), 993366 (morado/magenta). Los NOMBRES de las
// claves (green/blue/navy/sand/teal) se mantienen tal cual para no tener
// que tocar los ~20 sitios que ya las referencian por nombre (PageHeader
// accent=, SECTION_ACCENT...) -- son solo identificadores internos, ya no
// describen el matiz real de cada una. `header` es el tono que se pinta de
// fondo con texto BLANCO encima (ver PageHeader.tsx): donde el código
// medido era demasiado claro para ese contraste (verde/amarillo), `header`
// lleva una versión oscurecida del mismo tono y el código medido tal cual
// pasa a `base` (iconos/acentos, sin texto blanco encima que proteger).
export interface AccentColor {
    soft: string;   // fondo muy suave, para sombrear títulos de página / franjas
    base: string;   // tono medio, para iconos y acentos puntuales
    header: string; // tono intenso, para cabeceras de tarjeta con texto blanco
}

export const PALETTE = {
    // CCCC00 (el oliva medido en Educastur) se veía mal en franjas grandes
    // con texto blanco -- sustituido por 0A9335, verde más oscuro elegido
    // directamente por el usuario.
    green: { soft: '#e3f5e8', base: '#0a9335', header: '#0a9335' },
    // Educastur: azul claro 3399CC tal cual en header también -- mismo
    // criterio que el verde, pedido explícitamente para Horario.
    blue: { soft: '#e3f2fa', base: '#3399cc', header: '#3399cc' },
    // Educastur: azul oscuro 092152 tal cual -- color de marca/acción
    // principal de la app entera (ver SEMANTIC.primary). base comparte el
    // azul claro de arriba, mismo criterio que ya usaba esta paleta antes.
    navy: { soft: '#e5e9f0', base: '#3399cc', header: '#092152' },
    // Educastur: amarillo/dorado FFCC00 -- oscurecido para header (blanco encima)
    sand: { soft: '#fdf6d9', base: '#ffcc00', header: '#997a00' },
    // Educastur: morado/magenta 993366 tal cual -- ya tiene contraste de
    // sobra para header, no hace falta oscurecerlo
    teal: { soft: '#f7e6ee', base: '#c26b96', header: '#993366' },
} as const satisfies Record<string, AccentColor>;

export type PaletteKey = keyof typeof PALETTE;

// Acentos de cabecera de página (PageHeader) por sección del Sidebar --
// pedido explícito: cada sección con su propia familia de color (Enseñanza
// en azules, Evaluación en rojos, Comunicación en amarillos, Herramientas
// en morados), con un tono distinto por página dentro de la misma sección.
// Aparte de PALETTE de arriba porque ese sigue sirviendo a botones/badges/
// iconos sueltos en toda la app, sin acoplarse a en qué sección de
// navegación vive cada pantalla. La cabecera del Cuaderno de notas queda
// fuera a propósito -- usa getClassAccentColor (el color que el profesor
// elige por clase), no esta paleta. Diario SÍ entra aquí -- pese al nombre
// parecido, su cabecera nunca usó el color de la clase, siempre fue
// PALETTE.green.header a secas.
export const PAGE_ACCENT = {
    // Enseñanza (azul) -- Cuaderno queda fuera (color de clase)
    materia: '#1c5a8a',            // Planificación SA
    diario: '#2f7ab3',             // Diario de Clase
    // Evaluación (rojo)
    tareasEvaluables: '#8f1d1d',
    instrumentosEvaluacion: '#c0392b',
    // Comunicación (amarillo)
    reuniones: '#9c7209',
    informes: '#8a6d00',
    // Herramientas (morado 993366, el medido en Educastur -- antes tenía
    // uno inventado, #6b3fa0, que no gustó)
    herramientasIA: '#993366',
} as const;

// Fondo del Sidebar/barra superior (rediseño oscuro, pedido explícito con
// una captura de referencia). Mismo azul de marca que SEMANTIC.primary.base
// -- se probó un tono más oscuro para que el libro del logo no se fundiera
// con el fondo, pero el usuario prefería este azul y pidió corregir el
// LOGO en su lugar (public/logo.png: el libro pasó de azul oscuro a un
// azul más claro, ver comentario en ese commit) en vez de oscurecer aquí.
export const SIDEBAR_BG = '#092152';

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
    primary: { base: PALETTE.navy.header, hover: '#061739', soft: PALETTE.navy.soft, text: '#ffffff', softText: PALETTE.navy.header },
    danger: { base: '#dc2626', hover: '#b91c1c', soft: '#fee2e2', text: '#ffffff', softText: '#991b1b' },
    success: { base: '#16a34a', hover: '#15803d', soft: '#dcfce7', text: '#ffffff', softText: '#166534' },
    warning: { base: PALETTE.sand.header, hover: '#96600c', soft: PALETTE.sand.soft, text: '#ffffff', softText: '#86612d' },
    neutral: { base: '#475569', hover: '#334155', soft: '#f1f5f9', text: '#ffffff', softText: '#334155' },
};
