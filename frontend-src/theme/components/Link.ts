// Acción de texto tipo enlace ("Volver", "+ Añadir nivel", "Ver ejemplo de
// formato"...) — antes cada sitio repetía `text-blue-600 hover:underline` a
// mano (19 apariciones en 8 archivos). Mismo tono que Button/Badge
// (SEMANTIC.primary), para que un cambio de color de marca no deje estos
// enlaces desincronizados del resto de acciones. El tamaño/peso de texto
// sigue siendo cosa de cada sitio (varía entre xs/sm y con/sin
// font-semibold según el contexto) — esto solo fija el color y el subrayado.
// Vía la variable CSS --color-primary (ver index.css, mirror de
// SEMANTIC.primary.base) porque una clase "arbitrary value" de Tailwind no
// puede leer una constante de TypeScript en compilación.
export const linkClassName = 'text-[var(--color-primary)] hover:underline';

// Variante para texto que normalmente hereda el color del contexto y solo
// se pone en tono "enlace" al pasar el ratón (p.ej. el nombre de un alumno
// clicable dentro de una fila de tabla).
export const linkHoverClassName = 'hover:text-[var(--color-primary)]';
