import type { CSSProperties } from 'react';
import { SEMANTIC } from '../palette';

// Fila de pestañas tipo "segmented control" (usada en la Ficha del alumno)
// — antes tres sitios distintos de la app marcaban "esto está activo" con
// tres combinaciones de azul ligeramente distintas (aquí, la barra lateral
// de Ajustes y las pestañas de periodo del Cuaderno). Este archivo fija el
// tono por defecto (SEMANTIC.primary, el mismo azul-marino de Button/
// Badge); SettingsModal y GradebookTable no usan este componente (tienen
// su propio contexto: lista vertical y cabecera de color de clase), pero
// si tocas ese color por defecto hazlo leer de aquí también.
export const tabsRowClassName = 'flex space-x-1 bg-slate-100 p-1 rounded-lg';

export const tabItemBaseClassName = 'flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all text-center';

export const tabItemInactiveClassName = 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50';

export const tabItemActiveClassName = 'shadow-sm';

// Estilo de la pestaña activa -- parametrizado (en vez de una constante
// fija) para que una pantalla con su propio PAGE_ACCENT (p.ej. Reuniones)
// pueda usar ESE tono en vez del azul-marino genérico y quedar en línea
// con la cabecera de color que tiene justo encima, sin que eso afecte a
// los demás usos de <Tabs> (StudentSummaryModal sigue con fondo blanco +
// texto azul si no pasa accentColor). Con accentColor, la pestaña activa
// se rellena de ese color (no solo el texto) -- mismo tratamiento sólido
// que ya usa la cabecera de la página.
export const tabItemActiveStyle = (accentColor?: string): CSSProperties =>
    accentColor
        ? { backgroundColor: accentColor, color: '#ffffff' }
        : { backgroundColor: '#ffffff', color: SEMANTIC.primary.base };
