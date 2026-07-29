import type { CSSProperties } from 'react';
import { SEMANTIC } from '../palette';

// Fila de pestañas tipo "segmented control" (usada en la Ficha del alumno)
// — antes tres sitios distintos de la app marcaban "esto está activo" con
// tres combinaciones de azul ligeramente distintas (aquí, la barra lateral
// de Ajustes y las pestañas de periodo del Cuaderno). Este archivo fija el
// tono (SEMANTIC.primary, el mismo azul-marino de Button/Badge) como
// referencia; SettingsModal y GradebookTable no usan este componente
// (tienen su propio contexto: lista vertical y cabecera de color de clase),
// pero si tocas su color de "activo" hazlo leer de aquí también.
export const tabsRowClassName = 'flex space-x-1 bg-slate-100 p-1 rounded-lg';

export const tabItemBaseClassName = 'flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all text-center';

export const tabItemInactiveClassName = 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50';

export const tabItemActiveClassName = 'shadow-sm';

export const tabItemActiveStyle: CSSProperties = {
    backgroundColor: '#ffffff',
    color: SEMANTIC.primary.base,
};
