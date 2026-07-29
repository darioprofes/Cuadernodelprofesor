import { SEMANTIC, type SemanticKey } from '../palette';
import { RADIUS } from '../radius';
import { SHADOW } from '../shadows';

// Receta de estilo del botón: separada del componente React (Button.tsx)
// para que "cómo se ve un botón" viva junto al resto del sistema de diseño,
// no repartido dentro de cada componente. Button.tsx solo consume esto.
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'warning';

export const buttonBaseClassName =
    `inline-flex justify-center items-center gap-1.5 py-2 px-4 ${RADIUS.control} ${SHADOW.sm} text-sm font-medium transition-[filter,background-color] focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100`;

export const buttonSecondaryClassName =
    'border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 focus:ring-slate-400';

export const buttonSolidClassName =
    'border border-transparent hover:brightness-110 focus:ring-slate-400';

// El color de las variantes sólidas (todo salvo "secondary") sale de
// SEMANTIC — mismo tono en cualquier pantalla, no un azul de Tailwind
// elegido aparte para cada botón.
export const buttonSolidColor = (variant: Exclude<ButtonVariant, 'secondary'>) => SEMANTIC[variant as SemanticKey];
