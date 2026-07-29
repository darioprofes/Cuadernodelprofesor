// Escala tipográfica semántica. La auditoría visual encontró la misma
// jerarquía (título de página / título de sección / etiqueta / texto
// secundario) resuelta con combinaciones ligeramente distintas según la
// pantalla (algunos títulos de sección en `font-bold`, otros en
// `font-semibold`, al mismo tamaño) — un resto de pantallas hechas en
// momentos distintos sin una regla escrita. Esta es esa regla: `font-bold`
// se reserva para el título de página (el nivel más alto); todo lo demás
// usa como mucho `font-semibold`, para que el peso tipográfico también
// comunique jerarquía de forma consistente.
export const TYPOGRAPHY = {
    pageTitle: 'text-xl font-bold text-slate-800',
    sectionTitle: 'text-lg font-semibold text-slate-800',
    cardTitle: 'text-base font-semibold text-slate-800',
    label: 'text-sm font-medium text-slate-700',
    body: 'text-sm text-slate-700',
    caption: 'text-xs text-slate-500',
    captionStrong: 'text-xs font-semibold text-slate-600',
} as const;

export type TypographyKey = keyof typeof TYPOGRAPHY;
