import React from 'react';
import type { EvaluationPeriod, Holiday } from '../../types';
import { PencilIcon, ClipboardDocumentIcon, ListBulletIcon, TrashIcon, BookOpenIcon, UsersIcon, PlusIcon } from '../Icons';
import { CalendarEvent, NOTE_COLOR, startOfWeekUTC, addDaysUTC, toYYYYMMDD_UTC, getContrastingTextColor } from './calendarEvents';
import { SEMANTIC } from '../../theme/palette';
import {
    COLOR_INICIO_CURSO, COLOR_FIN_CURSO, COLOR_POR_TIPO_FESTIVO, COLORES_EVALUACION,
} from './calendarColors';

const DayColumn: React.FC<{
    date: Date;
    events: CalendarEvent[];
    isHoliday: (date: Date) => boolean;
    getHoliday: (dateStr: string) => Holiday | undefined;
    academicYearStart?: string;
    academicYearEnd?: string;
    onEventClick: (event: CalendarEvent) => void;
    onDeleteNote: (noteId: string) => void;
    getCategoryName: (classId: string, categoryId: string) => string | undefined;
    getAssignmentCategoryName: (classId: string, assignmentId: string) => string | undefined;
}> = ({ date: d, events, isHoliday, getHoliday, academicYearStart, academicYearEnd, onEventClick, onDeleteNote, getCategoryName, getAssignmentCategoryName }) => {
    const dayStr = toYYYYMMDD_UTC(d);
    const eventsForDay = events.filter(e => toYYYYMMDD_UTC(e.date) === dayStr);
    const isDayHoliday = isHoliday(d);
    const holiday = isDayHoliday ? getHoliday(dayStr) : undefined;
    const isStart = dayStr === academicYearStart;
    const isEnd = dayStr === academicYearEnd;
    // Mismo esquema que AnnualCalendarView.tsx (Calendario) -- pedido
    // explícito del usuario: el fondo de la Agenda debe ser igual que el
    // del Calendario.
    let backgroundColor = '#ffffff';
    if (isDayHoliday) backgroundColor = COLOR_POR_TIPO_FESTIVO[holiday?.type ?? 'festivo'];
    if (isStart) backgroundColor = COLOR_INICIO_CURSO;
    if (isEnd) backgroundColor = COLOR_FIN_CURSO;

    return (
        <div className="border-r p-1.5 overflow-y-auto" style={{ backgroundColor }}>
            <div className="space-y-1 mt-1">
            {eventsForDay.map(event => {
                let style: React.CSSProperties;
                if (event.eventType === 'otherActivity') {
                    style = { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#e2e8f0', borderLeftWidth: '4px' };
                } else if (event.eventType === 'session' && event.color) {
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
                                {event.className}
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
                        <div key={event.id} className="p-1.5 text-xs rounded border flex items-start gap-1.5 group" style={{ backgroundColor: NOTE_COLOR.backgroundColor, color: NOTE_COLOR.textColor, borderColor: NOTE_COLOR.borderColor }}>
                            <ListBulletIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-80" />
                            <p className="flex-grow" title={event.description}>{event.description}</p>
                            <button onClick={() => event.noteId && onDeleteNote(event.noteId)} className="flex-shrink-0 opacity-0 group-hover:opacity-70 hover:!opacity-100">
                                <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )
                } else if (event.eventType === 'meeting') {
                    return (
                        <div key={event.id} onClick={() => onEventClick(event)} className="p-1.5 text-xs rounded border border-l-4 flex items-start gap-1.5 cursor-pointer hover:brightness-95" style={style}>
                            <UsersIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-80"/>
                            <p>{event.description}</p>
                        </div>
                    )
                } else {
                    // Standalone assignment
                    const categoryName = event.assignmentId ? getAssignmentCategoryName(event.classId, event.assignmentId) : undefined;
                     return (
                        <div key={event.id} onClick={() => onEventClick(event)} className="p-1.5 text-xs rounded border border-l-4 flex items-start gap-1.5 cursor-pointer hover:brightness-95" style={style}>
                           <ClipboardDocumentIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-80"/>
                           <div>
                                <p className="font-semibold">
                                    {event.classGrupo && <span className="inline-block px-1 py-0.5 mr-1 rounded bg-black/10 text-[10px] font-mono">{event.classGrupo}</span>}
                                    {event.className}
                                </p>
                                <p>{event.unitName}{categoryName && <span className="opacity-70"> ({categoryName})</span>}</p>
                            </div>
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
            <div className="grid grid-cols-5 text-center font-semibold text-sm text-slate-600 border-b">
                {days.map(d => {
                    const today = new Date();
                    const isToday = d.getUTCFullYear() === today.getUTCFullYear() && d.getUTCMonth() === today.getUTCMonth() && d.getUTCDate() === today.getUTCDate();
                    const dayStr = toYYYYMMDD_UTC(d);
                    const isDayHoliday = isHoliday(d);
                    // Mismo criterio de color que MonthView.tsx: por
                    // evaluación, blanco si es festivo (el fondo de la
                    // columna ya avisa de eso).
                    const periodInfo = getPeriodForDate(d);
                    const periodStart = getPeriodStart(dayStr);
                    const dayNumberColor = isDayHoliday
                        ? '#ffffff'
                        : periodInfo ? COLORES_EVALUACION[periodInfo.index % COLORES_EVALUACION.length] : undefined;
                    const ringColor = !isToday && periodStart ? COLORES_EVALUACION[periodStart.index % COLORES_EVALUACION.length] : undefined;
                    return (
                        <div key={d.toISOString()} className="relative py-2 border-r group/day">
                            <div className="text-xs">{d.toLocaleString('es-ES', { weekday: 'short', timeZone: 'UTC' })}</div>
                            <div
                                className="text-xl mt-1 font-bold inline-flex items-center justify-center w-8 h-8 rounded-full"
                                style={isToday
                                    ? { backgroundColor: SEMANTIC.primary.base, color: SEMANTIC.primary.text }
                                    : { color: dayNumberColor, boxShadow: ringColor ? `inset 0 0 0 2px ${ringColor}` : undefined }}
                                title={periodStart ? `Empieza: ${periodStart.name}` : undefined}
                            >
                                {d.getUTCDate()}
                            </div>
                            {/* Mismos 3 botones que MonthView.tsx (tarea/nota/reunión),
                                pedido explícito del usuario -- antes solo estaban en la
                                vista Mes. Tarea/reunión no tienen sentido en un día no
                                lectivo, una nota libre sí. */}
                            <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/day:opacity-100 transition-opacity z-10">
                                {!isDayHoliday && (
                                    <button
                                        onClick={() => onOpenTaskModal(d)}
                                        className="w-6 h-6 bg-slate-200/50 text-slate-500 rounded-full flex items-center justify-center hover:bg-blue-200 hover:text-blue-600"
                                        title="Añadir tarea calificable"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    onClick={() => onOpenNoteModal(d)}
                                    className="w-6 h-6 bg-slate-200/50 text-slate-500 rounded-full flex items-center justify-center hover:bg-amber-200 hover:text-amber-700"
                                    title="Añadir nota libre (no evaluable)"
                                >
                                    <ListBulletIcon className="w-4 h-4" />
                                </button>
                                {!isDayHoliday && (
                                    <button
                                        onClick={() => onOpenMeetingModal(d)}
                                        className="w-6 h-6 bg-slate-200/50 text-slate-500 rounded-full flex items-center justify-center hover:bg-teal-200 hover:text-teal-700"
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
