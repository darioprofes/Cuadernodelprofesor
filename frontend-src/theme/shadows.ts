// Escala de sombra: reposo/elevado/flotante. La mayoría de la UI usa `sm`;
// `md` para lo que se superpone (modales, dropdowns); `lg` solo para
// elementos flotantes de verdad (FAB del Diario).
export const SHADOW = {
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
} as const;

export type ShadowKey = keyof typeof SHADOW;
