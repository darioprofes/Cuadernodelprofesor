import React, { useMemo } from 'react';
import type { AcademicConfiguration } from '../types';
import { TableCellsIcon } from './Icons';
import { SEMANTIC, SIDEBAR_BG } from '../theme/palette';
import { pageHeaderMinHeight } from '../theme/components/PageHeader';
import { headerPatternStyle } from '../theme/headerPattern';
import EmptyState from './EmptyState';
import {
    addDaysUTC, addMonthsUTC, createIsHoliday, endOfMonthUTC,
    startOfMonthUTC, startOfWeekUTC, toYYYYMMDD_UTC,
} from './calendar/calendarEvents';

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Colores exactos pedidos por el usuario (no derivados de PALETTE) --
// inicio y fin de curso llevan cada uno el suyo, a diferencia del primer
// intento que los pintaba igual.
const COLOR_CABECERA_DIA = '#6F6F6F';
const COLOR_FIN_DE_SEMANA = '#E1E1E1';
const COLOR_FESTIVO = '#FF3399';
const COLOR_INICIO_CURSO = '#FF6600';
const COLOR_FIN_CURSO = '#00AFEF';

const LegendItem: React.FC<{ color?: string; ring?: boolean; label: string }> = ({ color, ring, label }) => (
    <div className="flex items-center gap-1.5">
        <span
            className="w-3.5 h-3.5 rounded flex-shrink-0"
            style={ring
                ? { border: `2px solid ${SEMANTIC.primary.base}`, backgroundColor: '#fff' }
                : { backgroundColor: color }}
        />
        {label}
    </div>
);

// Vista de "año completo" al estilo del calendario escolar oficial que
// publica la Consejería de Educación (rejilla de 12 meses con festivos/
// vacaciones/inicio-fin de curso coloreados) -- pedido explícito del
// usuario, mostrando la imagen de ese calendario como referencia. Los tipos
// de festivo (nacional/autonómico/vacaciones/no lectivo) que sí distingue
// el original quedan fuera por ahora: Holiday es una lista plana sin campo
// de tipo (ver types.ts) y ampliarla es una decisión aparte, todavía sin
// resolver con el usuario -- aquí todo festivo se pinta con un único color.
const AnnualCalendarView: React.FC<{
    academicConfiguration: AcademicConfiguration;
    onOpenDay: (dateStr: string) => void;
}> = ({ academicConfiguration, onOpenDay }) => {
    const { academicYearStart, academicYearEnd, holidays } = academicConfiguration;

    const months = useMemo(() => {
        if (!academicYearStart || !academicYearEnd) return [];
        const start = startOfMonthUTC(new Date(academicYearStart + 'T00:00:00Z'));
        const end = startOfMonthUTC(new Date(academicYearEnd + 'T00:00:00Z'));
        const result: Date[] = [];
        let cursor = start;
        // Tope de seguridad: un curso normal son 10-12 meses, esto solo evita
        // un bucle infinito si algún día llegaran fechas mal formadas.
        for (let i = 0; cursor <= end && i < 24; i++) {
            result.push(cursor);
            cursor = addMonthsUTC(cursor, 1);
        }
        return result;
    }, [academicYearStart, academicYearEnd]);

    const isHoliday = useMemo(() => createIsHoliday(holidays), [holidays]);

    const getHolidayName = useMemo(() => {
        const ranges = (holidays ?? []).filter(h => h.startDate && h.endDate);
        return (dateStr: string): string | undefined =>
            ranges.find(h => h.startDate <= dateStr && dateStr <= h.endDate)?.name;
    }, [holidays]);

    const todayStr = toYYYYMMDD_UTC(new Date());

    if (months.length === 0) {
        return (
            <EmptyState
                icon={<TableCellsIcon className="w-10 h-10" />}
                title="Todavía no hay un curso académico configurado."
                message="Ve a Ajustes → Cursos Académicos para fijar sus fechas de inicio y fin."
            />
        );
    }

    return (
        <div className="space-y-4">
            <div
                className={`rounded-xl p-4 sm:p-5 ${pageHeaderMinHeight} flex items-center justify-between flex-wrap gap-3`}
                style={{ backgroundColor: SIDEBAR_BG, ...headerPatternStyle }}
            >
                <div className="flex items-center gap-3">
                    <TableCellsIcon className="w-6 h-6 flex-shrink-0 text-white/90" />
                    <div>
                        <h2 className="text-xl font-bold text-white">Calendario del curso</h2>
                        <p className="text-sm text-white/80">Vista de año completo — pincha un día para abrir su agenda.</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/90">
                    <LegendItem color={COLOR_INICIO_CURSO} label="Inicio de curso" />
                    <LegendItem color={COLOR_FIN_CURSO} label="Fin de curso" />
                    <LegendItem color={COLOR_FESTIVO} label="Festivos y vacaciones" />
                    <LegendItem color={COLOR_FIN_DE_SEMANA} label="Fin de semana" />
                    <LegendItem ring label="Hoy" />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {months.map(monthStart => (
                    <MiniMonth
                        key={toYYYYMMDD_UTC(monthStart)}
                        monthStart={monthStart}
                        isHoliday={isHoliday}
                        getHolidayName={getHolidayName}
                        academicYearStart={academicYearStart}
                        academicYearEnd={academicYearEnd}
                        todayStr={todayStr}
                        onOpenDay={onOpenDay}
                    />
                ))}
            </div>
        </div>
    );
};

const MiniMonth: React.FC<{
    monthStart: Date;
    isHoliday: (date: Date) => boolean;
    getHolidayName: (dateStr: string) => string | undefined;
    academicYearStart: string;
    academicYearEnd: string;
    todayStr: string;
    onOpenDay: (dateStr: string) => void;
}> = ({ monthStart, isHoliday, getHolidayName, academicYearStart, academicYearEnd, todayStr, onOpenDay }) => {
    const monthEnd = endOfMonthUTC(monthStart);
    const gridStart = startOfWeekUTC(monthStart);
    const gridEnd = addDaysUTC(startOfWeekUTC(monthEnd), 6);
    const cells: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDaysUTC(d, 1)) {
        cells.push(d);
    }
    const weeks: Date[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
        weeks.push(cells.slice(i, i + 7));
    }

    return (
        <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-700 mb-1.5">
                {(() => {
                    const mes = monthStart.toLocaleString('es-ES', { month: 'long', timeZone: 'UTC' });
                    return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${monthStart.getUTCFullYear()}`;
                })()}
            </h3>
            {/* Tabla de verdad, no botones sueltos con huecos entre sí --
                pedido explícito tras ver el aspecto de "chips" aislados.
                border-spacing (el "cellspacing" clásico de una <table>) en
                vez de border-collapse: cada celda es un bloque de color
                plano separado por 1px del fondo blanco del contenedor, como
                en el calendario de Educastur, en vez de compartir un borde
                gris con la vecina. */}
            <table className="w-full text-[9px]" style={{ borderCollapse: 'separate', borderSpacing: '1px' }}>
                <thead>
                    <tr>
                        {DIAS_SEMANA.map(d => (
                            <th key={d} style={{ backgroundColor: COLOR_CABECERA_DIA }} className="text-white font-semibold py-0.5">{d}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {weeks.map((week, wi) => (
                        <tr key={wi}>
                            {week.map(d => {
                                if (d.getUTCMonth() !== monthStart.getUTCMonth()) {
                                    return <td key={d.toISOString()} className="h-5" />;
                                }
                                const dateStr = toYYYYMMDD_UTC(d);
                                const dow = d.getUTCDay();
                                const isWeekend = dow === 0 || dow === 6;
                                const isHol = isHoliday(d);
                                const isStart = dateStr === academicYearStart;
                                const isEnd = dateStr === academicYearEnd;
                                const isToday = dateStr === todayStr;

                                // Bloques de color sólido (no pastel), más fiel al
                                // aspecto del calendario de Educastur que el tono
                                // suave usado en el primer intento.
                                let backgroundColor = '#ffffff';
                                let color = '#334155';
                                if (isWeekend) { backgroundColor = COLOR_FIN_DE_SEMANA; color = '#4b5563'; }
                                if (isHol) { backgroundColor = COLOR_FESTIVO; color = '#ffffff'; }
                                if (isStart) { backgroundColor = COLOR_INICIO_CURSO; color = '#ffffff'; }
                                if (isEnd) { backgroundColor = COLOR_FIN_CURSO; color = '#ffffff'; }

                                const titleParts = [
                                    isStart && 'Inicio de curso',
                                    isEnd && 'Fin de curso',
                                    getHolidayName(dateStr),
                                ].filter(Boolean) as string[];

                                return (
                                    <td key={dateStr} className="p-0">
                                        <button
                                            type="button"
                                            onClick={() => onOpenDay(dateStr)}
                                            title={titleParts.length > 0 ? titleParts.join(' · ') : undefined}
                                            className="w-full h-5 hover:brightness-95 transition-[filter]"
                                            style={{
                                                backgroundColor,
                                                color,
                                                fontWeight: isHol || isStart || isEnd ? 700 : 400,
                                                boxShadow: isToday ? `inset 0 0 0 2px ${SEMANTIC.primary.base}` : undefined,
                                            }}
                                        >
                                            {d.getUTCDate()}
                                        </button>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default AnnualCalendarView;
