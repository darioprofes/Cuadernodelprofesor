import { TYPOGRAPHY } from '../typography';

// Estilo de campo de formulario (input/select/textarea) — la auditoría
// visual encontró la misma intención ("campo de texto estándar") resuelta
// con media docena de variantes sueltas: rounded-md vs rounded-lg, p-1 vs
// p-2 vs px-3 py-2, con/sin sombra, con/sin foco visible, y cuando había
// foco casi siempre en un azul de Tailwind (focus:ring-blue-500) sin
// relación con el resto de la paleta. Este es el patrón más completo que
// ya existía en la app (usado en ~7 selects y varios inputs), tomado como
// canónico, con el foco llevado al tono `primary` de SEMANTIC (el mismo
// azul que ya usan Button/Badge) en vez de un azul suelto.
export const inputBaseClassName =
    'block w-full px-3 py-2 bg-white border rounded-lg shadow-sm text-sm placeholder-slate-400 ' +
    'focus:outline-none focus:ring-2 transition-colors ' +
    'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';

export const inputDefaultClassName = `${inputBaseClassName} border-slate-300 focus:ring-[#2f5c99]/30 focus:border-[#2f5c99]`;

export const inputErrorClassName = `${inputBaseClassName} border-red-300 focus:ring-red-500/30 focus:border-red-500`;

export const inputClassName = (hasError?: boolean): string => (hasError ? inputErrorClassName : inputDefaultClassName);

export const checkboxClassName = 'h-4 w-4 rounded border-slate-300 text-[#2f5c99] focus:ring-[#2f5c99]/30';

export const labelClassName = TYPOGRAPHY.label;
