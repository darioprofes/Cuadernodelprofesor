// Estado vacío de pantalla completa (sin clases, sin franjas de horario,
// sin tareas próximas...) — ya existía este mismo patrón, repetido a mano,
// en 4 pantallas distintas con clases idénticas. Un solo sitio para que el
// aspecto de "aquí no hay nada todavía" sea siempre el mismo, y para poder
// añadir icono o acción sin tocar las 4 pantallas una a una.
export const emptyStateWrapperClassName = 'p-12 text-center bg-white rounded-xl border border-dashed border-slate-300';

export const emptyStateIconWrapperClassName = 'flex justify-center mb-3 text-slate-300';

export const emptyStateTitleClassName = 'text-slate-500';

export const emptyStateMessageClassName = 'text-slate-400 text-sm mt-1';

export const emptyStateActionWrapperClassName = 'mt-4';
