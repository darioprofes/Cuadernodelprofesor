import { PALETTE } from '../../theme/palette';
import type { Holiday } from '../../types';

// Colores compartidos por el Calendario (AnnualCalendarView.tsx) y la
// Agenda (MonthView/WeekView/DayView.tsx) -- pedido explícito del usuario:
// que el fondo de la Agenda sea igual que el del Calendario. Un único
// sitio para no arriesgarse a que las dos vistas se desincronicen.
export const COLOR_FESTIVO = '#FF3399';
export const COLOR_INICIO_CURSO = '#FF6600';
export const COLOR_FIN_CURSO = '#00AFEF';
// Elegidos a partir de la imagen de referencia de Educastur (petición
// explícita: "elígelos tú de la imagen") -- vacaciones reutiliza el mismo
// dorado ya medido de Educastur que usa PALETTE.sand.base en el resto de
// la app.
export const COLOR_NO_LECTIVO = '#00A99D';
export const COLOR_VACACIONES = '#FFCC00';

export const COLOR_POR_TIPO_FESTIVO: Record<NonNullable<Holiday['type']>, string> = {
    festivo: COLOR_FESTIVO,
    no_lectivo: COLOR_NO_LECTIVO,
    vacaciones: COLOR_VACACIONES,
};

// Un color por evaluación, cíclico si hubiera más evaluaciones que colores
// (lo habitual son 3 -- 1ª/2ª/3ª evaluación -- pero el profesor puede
// tener más o menos). Tiñe el número del día dentro de esa evaluación, y
// un anillo de este mismo color en su primer día avisa de que ahí empieza.
export const COLORES_EVALUACION = [PALETTE.blue.header, PALETTE.green.header, PALETTE.teal.header, PALETTE.sand.header, PALETTE.navy.header];

export const COLOR_DIA_NORMAL = '#334155'; // slate-700
