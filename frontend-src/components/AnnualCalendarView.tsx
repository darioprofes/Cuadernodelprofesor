import React, { useMemo } from 'react';
import type { AcademicConfiguration, AgendaNote, ClassData, Course, Holiday, Meeting } from '../types';
import { TableCellsIcon } from './Icons';
import { SEMANTIC, SIDEBAR_BG, PALETTE } from '../theme/palette';
import { pageHeaderMinHeight } from '../theme/components/PageHeader';
import { headerPatternStyle } from '../theme/headerPattern';
import { formatClassLabel, TIPO_REUNION_LABEL } from '../utils';
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
// Elegidos a partir de la imagen de referencia de Educastur (petición
// explícita: "elígelos tú de la imagen") -- vacaciones reutiliza el mismo
// dorado ya medido de Educastur que usa PALETTE.sand.base en el resto de
// la app.
const COLOR_NO_LECTIVO = '#00A99D';
const COLOR_VACACIONES = '#FFCC00';
// Puntitos de "hay algo anotado ese día en la agenda" -- son 3 tipos
// distintos de anotación (nota libre, reunión, tarea calificable, ver
// MonthView.tsx en components/calendar/), cada uno con su propio color
// (reutilizando los mismos ya asociados a cada tipo en el resto de la
// app) y su propio puntito, en vez de uno solo genérico. Con halo blanco
// (ver el span de cada puntito) para que se lean igual de bien sobre
// fondos claros y sobre los de color sólido.
const COLOR_NOTA = '#d97706';               // mismo ámbar que "Añadir nota libre" en MonthView.tsx
const COLOR_REUNION = PALETTE.teal.header;  // mismo morado/magenta que "Apuntar una reunión" en MonthView.tsx
const COLOR_TAREA = PALETTE.blue.base;      // mismo azul que "Añadir tarea calificable" en MonthView.tsx

const COLOR_POR_TIPO_FESTIVO: Record<NonNullable<Holiday['type']>, string> = {
    festivo: COLOR_FESTIVO,
    no_lectivo: COLOR_NO_LECTIVO,
    vacaciones: COLOR_VACACIONES,
};

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
// usuario, mostrando la imagen de ese calendario como referencia. Holiday.type
// distingue festivo/no_lectivo/vacaciones (ver types.ts); no_lectivo y
// vacaciones se pueden importar del PDF oficial (StartOfYearWizardModal/
// SyncAcademicYearModal), festivo (nacional/autonómico/LOCAL) siempre a
// mano -- esas fechas no vienen como texto en ningún PDF.
const AnnualCalendarView: React.FC<{
    academicConfiguration: AcademicConfiguration;
    agendaNotes?: AgendaNote[];
    meetings?: Meeting[];
    classes?: ClassData[];
    courses?: Course[];
    onOpenDay: (dateStr: string) => void;
}> = ({ academicConfiguration, agendaNotes, meetings, classes, courses, onOpenDay }) => {
    const { academicYearStart, academicYearEnd, holidays } = academicConfiguration;

    // Las 3 formas de anotar algo en la Agenda para un día (ver MonthView.tsx:
    // nota libre, reunión, tarea calificable), cada una agrupada por fecha
    // para que cada celda resuelva sus puntitos en O(1) -- las 3 fuentes ya
    // vienen completas para todo el curso (sin scoping por clase activa), sin
    // necesidad de pedirlas día a día.
    const notasPorFecha = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const nota of agendaNotes ?? []) {
            const lista = map.get(nota.fecha);
            if (lista) lista.push(nota.texto); else map.set(nota.fecha, [nota.texto]);
        }
        return map;
    }, [agendaNotes]);

    const reunionesPorFecha = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const m of meetings ?? []) {
            const texto = [TIPO_REUNION_LABEL[m.tipo], m.conQuien, m.hora].filter(Boolean).join(' · ');
            const lista = map.get(m.fecha);
            if (lista) lista.push(texto); else map.set(m.fecha, [texto]);
        }
        return map;
    }, [meetings]);

    const tareasPorFecha = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const c of classes ?? []) {
            for (const a of c.assignments) {
                if (!a.date) continue;
                const texto = `${a.name} — ${formatClassLabel(c, courses ?? [])}`;
                const lista = map.get(a.date);
                if (lista) lista.push(texto); else map.set(a.date, [texto]);
            }
        }
        return map;
    }, [classes, courses]);

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

    const getHoliday = useMemo(() => {
        const ranges = (holidays ?? []).filter(h => h.startDate && h.endDate);
        return (dateStr: string): Holiday | undefined =>
            ranges.find(h => h.startDate <= dateStr && dateStr <= h.endDate);
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
            </div>

            {/* Grid de 4 columnas: un curso normal (sep-jun, 10 meses) deja 2
                huecos libres en la última fila -- la leyenda vive ahí en vez
                de en la cabecera azul oscura, donde los colores claros
                (dorado, blanco del anillo de "Hoy"...) se leían mal contra
                ese fondo. `xl:col-span-2` la hace ocupar justo ese hueco en
                escritorio; en pantallas más estrechas simplemente cae como
                una tarjeta más. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {months.map(monthStart => (
                    <MiniMonth
                        key={toYYYYMMDD_UTC(monthStart)}
                        monthStart={monthStart}
                        isHoliday={isHoliday}
                        getHoliday={getHoliday}
                        notasPorFecha={notasPorFecha}
                        reunionesPorFecha={reunionesPorFecha}
                        tareasPorFecha={tareasPorFecha}
                        academicYearStart={academicYearStart}
                        academicYearEnd={academicYearEnd}
                        todayStr={todayStr}
                        onOpenDay={onOpenDay}
                    />
                ))}
                <div className="xl:col-span-2 p-3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center gap-1.5 text-xs text-slate-600">
                    <LegendItem color={COLOR_INICIO_CURSO} label="Inicio de curso" />
                    <LegendItem color={COLOR_FIN_CURSO} label="Fin de curso" />
                    <LegendItem color={COLOR_FESTIVO} label="Festivos" />
                    <LegendItem color={COLOR_NO_LECTIVO} label="No lectivo" />
                    <LegendItem color={COLOR_VACACIONES} label="Vacaciones" />
                    <LegendItem color={COLOR_FIN_DE_SEMANA} label="Fin de semana" />
                    <LegendItem color={COLOR_NOTA} label="Nota en la agenda" />
                    <LegendItem color={COLOR_REUNION} label="Reunión" />
                    <LegendItem color={COLOR_TAREA} label="Tarea calificable" />
                    <LegendItem ring label="Hoy" />
                </div>
            </div>
        </div>
    );
};

const MiniMonth: React.FC<{
    monthStart: Date;
    isHoliday: (date: Date) => boolean;
    getHoliday: (dateStr: string) => Holiday | undefined;
    notasPorFecha: Map<string, string[]>;
    reunionesPorFecha: Map<string, string[]>;
    tareasPorFecha: Map<string, string[]>;
    academicYearStart: string;
    academicYearEnd: string;
    todayStr: string;
    onOpenDay: (dateStr: string) => void;
}> = ({ monthStart, isHoliday, getHoliday, notasPorFecha, reunionesPorFecha, tareasPorFecha, academicYearStart, academicYearEnd, todayStr, onOpenDay }) => {
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
                                const holiday = isHol ? getHoliday(dateStr) : undefined;
                                const isStart = dateStr === academicYearStart;
                                const isEnd = dateStr === academicYearEnd;
                                const isToday = dateStr === todayStr;
                                const notas = notasPorFecha.get(dateStr);
                                const reuniones = reunionesPorFecha.get(dateStr);
                                const tareas = tareasPorFecha.get(dateStr);

                                // Bloques de color sólido (no pastel), más fiel al
                                // aspecto del calendario de Educastur que el tono
                                // suave usado en el primer intento.
                                let backgroundColor = '#ffffff';
                                let color = '#334155';
                                if (isWeekend) { backgroundColor = COLOR_FIN_DE_SEMANA; color = '#4b5563'; }
                                if (isHol) { backgroundColor = COLOR_POR_TIPO_FESTIVO[holiday?.type ?? 'festivo']; color = '#ffffff'; }
                                if (isStart) { backgroundColor = COLOR_INICIO_CURSO; color = '#ffffff'; }
                                if (isEnd) { backgroundColor = COLOR_FIN_CURSO; color = '#ffffff'; }

                                const titleParts = [
                                    isStart && 'Inicio de curso',
                                    isEnd && 'Fin de curso',
                                    holiday?.name,
                                ].filter(Boolean) as string[];

                                return (
                                    <td key={dateStr} className="p-0">
                                        <button
                                            type="button"
                                            onClick={() => onOpenDay(dateStr)}
                                            title={titleParts.length > 0 ? titleParts.join(' · ') : undefined}
                                            className="relative w-full h-5 hover:brightness-95 transition-[filter]"
                                            style={{
                                                backgroundColor,
                                                color,
                                                fontWeight: isHol || isStart || isEnd ? 700 : 400,
                                                boxShadow: isToday ? `inset 0 0 0 2px ${SEMANTIC.primary.base}` : undefined,
                                            }}
                                        >
                                            {d.getUTCDate()}
                                            {(notas || reuniones || tareas) && (
                                                <span className="absolute top-0 right-0 flex gap-0.5 p-0.5">
                                                    {notas && (
                                                        <span
                                                            title={notas.join('\n')}
                                                            className="w-1.5 h-1.5 rounded-full"
                                                            style={{ backgroundColor: COLOR_NOTA, boxShadow: '0 0 0 1px white' }}
                                                        />
                                                    )}
                                                    {reuniones && (
                                                        <span
                                                            title={reuniones.join('\n')}
                                                            className="w-1.5 h-1.5 rounded-full"
                                                            style={{ backgroundColor: COLOR_REUNION, boxShadow: '0 0 0 1px white' }}
                                                        />
                                                    )}
                                                    {tareas && (
                                                        <span
                                                            title={tareas.join('\n')}
                                                            className="w-1.5 h-1.5 rounded-full"
                                                            style={{ backgroundColor: COLOR_TAREA, boxShadow: '0 0 0 1px white' }}
                                                        />
                                                    )}
                                                </span>
                                            )}
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
