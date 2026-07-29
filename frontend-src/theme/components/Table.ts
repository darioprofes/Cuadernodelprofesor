import { RADIUS } from '../radius';
import { SHADOW } from '../shadows';

// Estilo de tabla "simple": listados estáticos de una sola pantalla
// (horario semanal, lista de alumnado en Ajustes, franjas horarias) —
// distinto de las tablas-cuadrícula densas (Cuaderno de notas, matrices de
// logro de competencias) que llevan cabecera/columna fijas con `sticky` y
// se quedan con su propio estilo a medida por ahora, ya que forzarlas a
// este mismo molde cambiaría comportamiento de scroll, no solo apariencia.
export const tableWrapperClassName = `bg-white ${RADIUS.container} ${SHADOW.sm} border border-slate-200 overflow-x-auto`;

export const tableBaseClassName = 'w-full text-sm text-left border-collapse';

export const tableHeadRowClassName = 'bg-slate-50';

export const tableHeadCellClassName = 'p-3 font-semibold text-slate-500 border-b border-slate-200';

export const tableRowClassName = 'border-t border-slate-100';

export const tableCellClassName = 'p-3 align-top';
