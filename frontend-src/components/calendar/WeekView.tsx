import React from 'react';
import type { EvaluationPeriod, Holiday } from '../../types';
import { PencilIcon, ClipboardDocumentIcon, ListBulletIcon, TrashIcon, BookOpenIcon, UsersIcon, PlusIcon } from '../Icons';
import { CalendarEvent, NOTE_COLOR, startOfWeekUTC, addDaysUTC, toYYYYMMDD_UTC, getContrastingTextColor } from './calendarEvents';
import { SEMANTIC } from '../../theme/palette';
import {
    COLOR_INICIO_CURSO, COLOR_FIN_CURSO, COLOR_POR_TIPO_FESTIVO, ETIQUETA_POR_TIPO_FESTIVO, COLORES_EVALUACION,
} from './calendarColors';

const DayColumn: React.FC<{
    date: Date;
    events: CalendarEvent[];
    isHoliday: (date: Date) => boolean;
    getHoliday: (dateStr: string) => Holiday | undefined;
    getPeriodStart: (dateStr: string) => { index: number; name: string } | null;
    academicYearStart?: string;
    academicYearEnd?: string;
    onEventClick: (event: CalendarEvent) => void;
    onDeleteNote: (noteId: string) => void;
    getCategoryName: (classId: string, categoryId: string) => string | undefined;
    getAssignmentCategoryName: (classId: string, assignmentId: string) => string | undefined;
}> = ({ date: d, events, isHoliday, getHoliday, getPeriodStart, academicYearStart, academicYearEnd, onEventClick, onDeleteNote, getCategoryName, getAssignmentCategoryName }) => {
    const dayStr = toYYYYMMDD_UTC(d);
    const eventsForDay = events.filter(e => toYYYYMMDD_UTC(e.date) === dayStr);
    const isDayHoliday = isHoliday(d);
    const holiday = isDayHoliday ? getHoliday(dayStr) : undefined;
    const isStart = dayStr === academicYearStart;
    const isEnd = dayStr === academicYearEnd;
    const periodStart = getPeriodStart(dayStr);
    // Las columnas semanales son altas: igual que en Mes, el festivo se
    // reconoce por la línea lateral y el chip de la cabecera, no por un
    // fondo saturado que ocuparía toda la jornada.
    let backgroundColor = '#ffffff';
    const holidayColor = isDayHoliday ? COLOR_POR_TIPO_FESTIVO[holiday?.type ?? 'festivo'] : undefined;
    const courseBoundary = isStart ? COLOR_INICIO_CURSO : (isEnd ? COLOR_FIN_CURSO : undefined);
    const evaluationColor = periodStart ? COLORES_EVALUACION[periodStart.index % COLORES_EVALUACION.length] : undefined;
    const accentColor = holidayColor ?? courseBoundary ?? evaluationColor;

    return (
        <div className="border-r border-b border-slate-300 p-1.5 overflow-y-auto" style={{ backgroundColor, boxShadow: accentColor ? `inset 4px 0 0 ${accentColor}` : undefined }}>
            <div className="space-y-1 mt-1">
            {eventsForDay.map(event => {
                let style: React.CSSProperties;
                if (event.eventType === 'session' && event.color) {
                    style = { backgroundColor: event.color, color: getContrastingTextColor(event.color), borderColor: event.color, borderLeftWidth: '4px' };
                } else {
                    style = { backgroundColor: event.courseColor.backgroundColor, color: event.courseColor.textColor, borderColor: event.courseColor.borderColor, borderLeftWidth: '4px' };
                }

                if (event.isGapSession) {
                    style.backgroundColor = 'transparent';
                    style.color = '#64748b';
                    style.borderColor = '#cbd5e1';
                }

                // Render embedded assignments for sessions
                const renderAssignments = () => {
                    if (!event.assignments || event.assignments.length === 0) return null;
                    return (
                        <div className="mt-2 pt-2 border-t border-black/10 space-y-1">
                            <p className="text-[10px] font-bold opacity-70 uppercase tracking-wider">Tareas:</p>
                            {event.assignments.map(a => {
                                const categoryName = getCategoryName(event.classId, a.categoryId);
                                return (
                                    <div key={a.id} className="flex items-center gap-1.5 text-xs font-medium bg-white/40 p-1 rounded">
                                        <ClipboardDocumentIcon className="w-3.5 h-3.5 flex-shrink-0"/>
                                        <span className="truncate">{a.name}{categoryName && <span className="opacity-70 font-normal"> ({categoryName})</span>}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )
                }

                if (event.eventType === 'session') {
                    return (
                        <div key={event.id} className={`p-1.5 text-xs rounded relative group ${event.isGapSession ? 'border border-dashed' : ''}`} style={style}>
                            <p className="font-semibold flex items-center">
                                {event.periodName ? <span className="mr-1 opacity-75">[{event.periodName}]</span> : null}
                                {event.classGrupo && <span className="inline-block px-1 py-0.5 mr-1 rounded bg-black/10 text-[10px] font-mono">{event.classGrupo}</span>}
                                {event.classShortName || event.className}
                                {event.journalNote && <BookOpenIcon className="w-3 h-3 ml-1 flex-shrink-0"/>}
                            </p>
                            <p>{event.unitName} {event.eventType === 'session' && `(S${event.sessionNumber})`}</p>

                            {event.journalNote ? (
                                <p className="text-xs font-semibold mt-1 truncate">📝 {event.journalNote}</p>
                            ) : (
                                <p className="text-xs opacity-80 mt-1 truncate">{event.description}</p>
                            )}

                            {renderAssignments()}
                            <button onClick={() => onEventClick(event)} className="absolute top-1 right-1 p-0.5 rounded-full bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity"><PencilIcon className="w-4 h-4"/></button>
                        </div>
                    )
                } else if (event.eventType === 'note') {
                    return (
                        <div key={event.id} onClick={() => onEventClick(event)} className="px-2 py-1 text-xs rounded-full border flex items-center gap-1.5 group cursor-pointer hover:brightness-95" style={{ backgroundColor: NOTE_COLOR.backgroundColor, color: NOTE_COLOR.textColor, borderColor: NOTE_COLOR.borderColor }}>
                            <ListBulletIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-80" />
                            <p className="flex-grow truncate" title={event.description}>{event.description}</p>
                            <button onClick={(e) => { e.stopPropagation(); event.noteId && onDeleteNote(event.noteId); }} className="flex-shrink-0 opacity-0 group-hover:opacity-70 hover:!opacity-100">
                                <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )
                } else if (event.eventType === 'meeting') {
                    return (
                        <div key={event.id} onClick={() => onEventClick(event)} className="px-2 py-1 text-xs rounded-full border flex items-center gap-1.5 cursor-pointer hover:brightness-95" style={{ ...style, borderLeftWidth: undefined }}>
                            <UsersIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-80"/>
                            <p className="truncate">{event.description}</p>
                        </div>
                    )
                } else {
                    // Standalone assignment
                    const categoryName = event.assignmentId ? getAssignmentCategoryName(event.classId, event.assignmentId) : undefined;
                     return (
                        <div key={event.id} onClick={() => onEventClick(event)} className="px-2 py-1 text-xs rounded-full border flex items-center gap-1.5 cursor-pointer hover:brightness-95" style={{ ...style, borderLeftWidth: undefined }}>
                           <ClipboardDocumentIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-80"/>
                           <p className="font-semibold truncate" title={`${event.className} · ${event.unitName}`}>{event.classGrupo && `${event.classGrupo} · `}{event.classShortName || event.className} · {event.unitName}{categoryName && ` (${categoryName})`}</p>
                        </div>
                    )
                }
            })}
            </div>
        </div>
    )
};

const WeekView: React.FC<{
    currentDate: Date;
    events: CalendarEvent[];
    isHoliday: (date: Date) => boolean;
    getHoliday: (dateStr: string) => Holiday | undefined;
    getPeriodForDate: (date: Date) => { period: EvaluationPeriod, index: number } | null;
    getPeriodStart: (dateStr: string) => { index: number; name: string } | null;
    academicYearStart?: string;
    academicYearEnd?: string;
    onOpenTaskModal: (date: Date) => void;
    onOpenNoteModal: (date: Date) => void;
    onOpenMeetingModal: (date: Date) => void;
    onEventClick: (event: CalendarEvent) => void;
    onDeleteNote: (noteId: string) => void;
    getCategoryName: (classId: string, categoryId: string) => string | undefined;
    getAssignmentCategoryName: (classId: string, assignmentId: string) => string | undefined;
}> = ({ currentDate, events, isHoliday, getHoliday, getPeriodForDate, getPeriodStart, academicYearStart, academicYearEnd, onOpenTaskModal, onOpenNoteModal, onOpenMeetingModal, onEventClick, onDeleteNote, getCategoryName, getAssignmentCategoryName }) => {
    const weekStart = startOfWeekUTC(currentDate);
    // Only 5 days (Mon-Fri)
    const days = Array.from({ length: 5 }).map((_, i) => addDaysUTC(weekStart, i));

    return (
        <div>
            {/* Modified to 5 cols */}
            <div className="grid grid-cols-5 text-center font-semibold text-sm text-slate-700 border-x border-t border-slate-400 bg-white">
                {days.map(d => {
                    const today = new Date();
                    const isToday = d.getUTCFullYear() === today.getUTCFullYear() && d.getUTCMonth() === today.getUTCMonth() && d.getUTCDate() === today.getUTCDate();
                    const dayStr = toYYYYMMDD_UTC(d);
                    const isDayHoliday = isHoliday(d);
                    const holiday = isDayHoliday ? getHoliday(dayStr) : undefined;
                    const holidayColor = isDayHoliday ? COLOR_POR_TIPO_FESTIVO[holiday?.type ?? 'festivo'] : undefined;
                    // La evaluación sigue coloreando el día; el festivo se
                    // identifica con un chip, no invirtiendo el texto.
                    const periodInfo = getPeriodForDate(d);
                    const periodStart = getPeriodStart(dayStr);
                    const isStart = dayStr === academicYearStart;
                    const isEnd = dayStr === academicYearEnd;
                    const courseBoundary = isStart
                        ? { color: COLOR_INICIO_CURSO, label: 'Inicio de curso' }
                        : isEnd ? { color: COLOR_FIN_CURSO, label: 'Fin de curso' } : undefined;
                    const dayNumberColor = periodInfo ? COLORES_EVALUACION[periodInfo.index % COLORES_EVALUACION.length] : undefined;
                    const ringColor = !isToday && periodStart ? COLORES_EVALUACION[periodStart.index % COLORES_EVALUACION.length] : undefined;
                    return (
                        <div key={d.toISOString()} className="relative border-r border-slate-400 last:border-r-0 group/day">
                            <div className="py-2 text-sm font-semibold border-b border-slate-400 bg-slate-200">{d.toLocaleString('es-ES', { weekday: 'long', timeZone: 'UTC' })}</div>
                            {/* Antes el número del día iba suelto y los botones en
                                absolute top-1 right-1, superpuestos -- en una columna
                                estrecha (5 columnas, sobre todo en móvil) podían
                                solaparse con el número o con el nombre del día de la
                                semana de arriba. Ahora los 4 (número + 3 botones) son
                                hijos sueltos de una misma fila flex-wrap: caben todos en
                                una línea cuando hay sitio y los que no caben saltan solos
                                a la línea siguiente cuando no, sin overlap a ningún
                                ancho. */}
                            <div className="flex items-center flex-wrap gap-1 px-2 py-2">
                                <div
                                    className="flex-shrink-0 text-xl font-extrabold inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100"
                                    style={isToday
                                        ? { backgroundColor: SEMANTIC.primary.base, color: SEMANTIC.primary.text }
                                        : { color: dayNumberColor, boxShadow: ringColor ? `inset 0 0 0 2px ${ringColor}` : undefined }}
                                    title={periodStart ? `Empieza: ${periodStart.name}` : undefined}
                                >
                                    {d.getUTCDate()}
                                </div>
                                {holidayColor && (
                                    <span
                                        className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-white"
                                        style={{ backgroundColor: holidayColor }}
                                        title={holiday?.name}
                                    >
                                        {ETIQUETA_POR_TIPO_FESTIVO[holiday?.type ?? 'festivo']}
                                    </span>
                                )}
                                {courseBoundary && (
                                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: courseBoundary.color }}>
                                        {courseBoundary.label}
                                    </span>
                                )}
                                {periodStart && (
                                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: COLORES_EVALUACION[periodStart.index % COLORES_EVALUACION.length] }}>
                                        {periodStart.name}
                                    </span>
                                )}
                                {/* Mismos 3 botones que MonthView.tsx (tarea/nota/reunión),
                                    pedido explícito del usuario -- antes solo estaban en la
                                    vista Mes. Tarea/reunión no tienen sentido en un día no
                                    lectivo, una nota libre sí. Siempre visibles (no solo
                                    opacity-0 + hover): en tablet/táctil no hay ratón que
                                    dispare :hover, quedaban invisibles del todo (bug real
                                    reportado, 2026-09-09). Mismos colores que los botones
                                    de la vista Día (petición explícita). */}
                                {!isDayHoliday && (
                                    <button
                                        onClick={() => onOpenTaskModal(d)}
                                        className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center hover:bg-blue-200 opacity-70 group-hover/day:opacity-100 transition-opacity"
                                        title="Añadir tarea calificable"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    onClick={() => onOpenNoteModal(d)}
                                    className="flex-shrink-0 w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center hover:bg-amber-200 opacity-70 group-hover/day:opacity-100 transition-opacity"
                                    title="Añadir nota libre (no evaluable)"
                                >
                                    <ListBulletIcon className="w-4 h-4" />
                                </button>
                                {!isDayHoliday && (
                                    <button
                                        onClick={() => onOpenMeetingModal(d)}
                                        className="flex-shrink-0 w-6 h-6 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center hover:bg-teal-200 opacity-70 group-hover/day:opacity-100 transition-opacity"
                                        title="Apuntar una reunión"
                                    >
                                        <UsersIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
            {/* Modified to 5 cols */}
            <div className="grid grid-cols-5 h-[70vh]">
                 {days.map(d => (
                    <DayColumn
                        key={d.toISOString()}
                        date={d}
                        events={events}
                        isHoliday={isHoliday}
                        getHoliday={getHoliday}
                        getPeriodStart={getPeriodStart}
                        academicYearStart={academicYearStart}
                        academicYearEnd={academicYearEnd}
                        onEventClick={onEventClick}
                        onDeleteNote={onDeleteNote}
                        getCategoryName={getCategoryName}
                        getAssignmentCategoryName={getAssignmentCategoryName}
                    />
                 ))}
            </div>
        </div>
    );
};

export default WeekView;
