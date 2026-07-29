// Escala de radios de borde: un criterio por tipo de elemento, no imitación
// visual caso a caso. Botones/inputs/badges pequeños redondeados pero
// rectangulares; contenedores grandes (tarjetas, modales) con esquina más
// suave; píldoras/avatares completamente redondos.
export const RADIUS = {
    control: 'rounded-lg',   // botones, inputs, badges
    container: 'rounded-xl', // tarjetas, modales, paneles
    pill: 'rounded-full',    // píldoras, avatares, chips
} as const;

export type RadiusKey = keyof typeof RADIUS;
