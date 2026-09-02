import React from 'react';
import type { EvaluationPeriod, Holiday } from '../../types';
import { PlusIcon, ListBulletIcon, UsersIcon, TrashIcon, PencilIcon, BookOpenIcon, ClipboardDocumentIcon } from '../Icons';
import { CalendarEvent, NOTE_COLOR, MEETING_COLOR, startOfMonthUTC, endOfMonthUTC, startOfWeekUTC, addDaysUTC, toYYYYMMDD_UTC, getContrastingTextColor } from './calendarEvents';
import { SEMANTIC } from '../../theme/palette';
import {
    COLOR_INICIO_CURSO, COLOR_FIN_CURSO, COLOR_POR_TIPO_FESTIVO, COLORES_EVALUACION, COLOR_DIA_NORMAL,
} from './calendarColors';

const MonthView: React.FC<{
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
    onDeleteNote: (noteId: string) => void;
    onDeleteMeeting: (meetingId: string) => void;
    onEventClick: (event: CalendarEvent) => void;
    getCategoryName: (classId: string, categoryId: string) => string | undefined;
    getAssignmentCategoryName: (classId: string, assignmentId: string) => string | undefined;
}> = ({ currentDate, events, isHoliday, getHoliday, getPeriodForDate, getPeriodStart, academicYearStart, academicYearEnd, onOpenTaskModal, onOpenNoteModal, onOpenMeetingModal, onDeleteNote, onDeleteMeeting, onEventClick, getCategoryName, getAssignmentCategoryName }) => {
    const monthStart = startOfMonthUTC(currentDate);
    const monthEnd = endOfMonthUTC(currentDate);
    const startDate = startOfWeekUTC(monthStart);
    const endDate = addDaysUTC(startOfWeekUTC(monthEnd), 6);
    const days: Date[] = [];
    let day = startDate;

    while (day <= endDate) {
        days.push(day);
        day = addDaysUTC(day, 1);
    }

    return (
        <div>
            {/* Fixed: Sticky Header for days of week */}
            <div className="grid grid-cols-5 text-center font-semibold text-sm text-slate-600 border-b sticky top-0 bg-white z-10 shadow-sm">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map(d => <div key={d} className="py-2">{d}</div>)}
            </div>
            {/* Fixed: Auto rows and removed fixed height to allow full scrolling */}
            <div className="grid grid-cols-5 auto-rows-fr">
                {days.map(d => {
                     const dayOfWeek = d.getUTCDay();
                     // Skip Saturday (6) and Sunday (0)
                     if (dayOfWeek === 6 || dayOfWeek === 0) return null;

                     const dayStr = toYYYYMMDD_UTC(d);
                     const eventsForDay = events.filter(e => toYYYYMMDD_UTC(e.date) === dayStr);
                     const isCurrentMonth = d.getUTCMonth() === currentDate.getUTCMonth();
                     const today = new Date();
                     const isToday = d.getUTCFullYear() === today.getUTCFullYear() && d.getUTCMonth() === today.getUTCMonth() && d.getUTCDate() === today.getUTCDate();
                     const isDayHoliday = isHoliday(d);
                     const holiday = isDayHoliday ? getHoliday(dayStr) : undefined;
                     const isStart = dayStr === academicYearStart;
                     const isEnd = dayStr === academicYearEnd;

                     const periodInfo = getPeriodForDate(d);
                     const periodStart = getPeriodStart(dayStr);

                     // Mismo esquema que AnnualCalendarView.tsx (Calendario) --
                     // pedido explícito del usuario: el fondo de la Agenda debe
                     // ser igual que el del Calendario.
                     let cellBackgroundColor = isCurrentMonth ? '#ffffff' : '#f8fafc';
                     let dayNumberColor = periodInfo ? COLORES_EVALUACION[periodInfo.index % COLORES_EVALUACION.length] : COLOR_DIA_NORMAL;
                     if (isDayHoliday) { cellBackgroundColor = COLOR_POR_TIPO_FESTIVO[holiday?.type ?? 'festivo']; dayNumberColor = '#ffffff'; }
                     if (isStart) { cellBackgroundColor = COLOR_INICIO_CURSO; dayNumberColor = '#ffffff'; }
                     if (isEnd) { cellBackgroundColor = COLOR_FIN_CURSO; dayNumberColor = '#ffffff'; }

                     // Aviso de cambio de evaluación: un anillo en el color de
                     // la evaluación que empieza ese día.
                     const ringColor = periodStart ? COLORES_EVALUACION[periodStart.index % COLORES_EVALUACION.length] : undefined;

                    return (
                         // Fixed: Increased minimum height and removed overflow-y-auto to allow full month scrolling
                         <div key={d.toISOString()} className="relative border-r border-b p-2 min-h-[7rem] group/day" style={{ backgroundColor: cellBackgroundColor }}>
                            <div
                                className="flex items-center justify-center w-6 h-6 text-xs rounded-full font-bold"
                                style={isToday
                                    ? { backgroundColor: SEMANTIC.primary.base, color: SEMANTIC.primary.text, fontWeight: 700 }
                                    : { color: dayNumberColor, boxShadow: ringColor ? `inset 0 0 0 2px ${ringColor}` : undefined }}
                                title={periodStart ? `Empieza: ${periodStart.name}` : undefined}
                            >
                              {d.getUTCDate()}
                            </div>
                            {/* Tarea/reunión no tienen sentido en un día no lectivo
                                (no hay clase, no se califica), pero una nota libre
                                sí -- p.ej. "reunión con la familia" puede caer en
                                festivo. Antes las 3 estaban juntas tras el mismo
                                !isDayHoliday y una nota tampoco se podía añadir en
                                festivo -- bug real reportado por el usuario. */}
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
                            <div className="space-y-1 mt-1">
                                {eventsForDay.map(event => {
                                    if (event.eventType === 'otherActivity') {
                                        return null;
                                    }
                                    if (event.eventType === 'note') {
                                        return (
                                            <div key={event.id} className="p-1 text-xs rounded border flex items-start gap-1 group/note" style={{ backgroundColor: NOTE_COLOR.backgroundColor, color: NOTE_COLOR.textColor, borderColor: NOTE_COLOR.borderColor }}>
                                                <ListBulletIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-80" />
                                                <p className="truncate flex-grow" title={event.description}>{event.description}</p>
                                                <button onClick={() => event.noteId && onDeleteNote(event.noteId)} className="flex-shrink-0 opacity-0 group-hover/note:opacity-70 hover:!opacity-100">
                                                    <TrashIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        );
                                    }
                                    if (event.eventType === 'meeting') {
                                        return (
                                            <div
                                                key={event.id}
                                                onClick={() => onEventClick(event)}
                                                className="p-1 text-xs rounded border flex items-start gap-1 group/note cursor-pointer hover:brightness-95"
                                                style={{ backgroundColor: MEETING_COLOR.backgroundColor, color: MEETING_COLOR.textColor, borderColor: MEETING_COLOR.borderColor }}
                                            >
                                                <UsersIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-80" />
                                                <p className="truncate flex-grow" title={event.description}>{event.description}</p>
                                                <button onClick={(e) => { e.stopPropagation(); event.meetingId && onDeleteMeeting(event.meetingId); }} className="flex-shrink-0 opacity-0 group-hover/note:opacity-70 hover:!opacity-100">
                                                    <TrashIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        );
                                    }
                                    if (event.eventType === 'session') {
                                        const style: React.CSSProperties = event.color
                                            ? { backgroundColor: event.color, color: getContrastingTextColor(event.color), borderColor: event.color }
                                            : { backgroundColor: event.courseColor.backgroundColor, color: event.courseColor.textColor, borderColor: event.courseColor.borderColor };

                                        if (event.isGapSession) {
                                            style.backgroundColor = 'transparent';
                                            style.color = '#64748b';
                                            style.borderColor = '#cbd5e1';
                                        }

                                        return (
                                            <div key={event.id} className={`p-1 text-xs rounded border flex flex-col justify-start items-start ${event.isGapSession ? 'border-dashed' : ''}`} style={style}>
                                                <div className="flex justify-between w-full items-start">
                                                    <div className="flex-grow truncate pr-1" title={`${event.classGrupo ? event.classGrupo + ' - ' : ''}${event.className} - ${event.unitName}`}>
                                                        <p className="font-semibold truncate flex items-center">
                                                            {event.classGrupo && <span className="font-mono text-[11px] opacity-80 mr-1">{event.classGrupo}</span>}
                                                            {event.className}
                                                            {event.journalNote && <BookOpenIcon className="w-3 h-3 ml-1 flex-shrink-0" />}
                                                        </p>
                                                        <p className="truncate text-[10px]">{event.unitName} (S{event.sessionNumber})</p>
                                                    </div>
                                                    <button onClick={() => onEventClick(event)} className="flex-shrink-0 opacity-50 hover:opacity-100"><PencilIcon className="w-4 h-4"/></button>
                                                </div>
                                                {/* Display Content: Prioritize Journal Note */}
                                                <div className="w-full mt-0.5 truncate">
                                                    {event.journalNote ? (
                                                        <p className="font-medium truncate italic">📝 {event.journalNote}</p>
                                                    ) : (
                                                        <p className="opacity-80 truncate">{event.description}</p>
                                                    )}
                                                </div>

                                                {event.assignments && event.assignments.length > 0 && (
                                                    <div className="w-full mt-1 pt-1 border-t border-black/10">
                                                        {event.assignments.map(a => (
                                                            <div key={a.id} className="flex items-center gap-1 text-[10px] opacity-90 font-medium truncate">
                                                                <ClipboardDocumentIcon className="w-3 h-3 flex-shrink-0"/> {a.name}
                                                                {getCategoryName(event.classId, a.categoryId) && (
                                                                    <span className="opacity-70 font-normal truncate">({getCategoryName(event.classId, a.categoryId)})</span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    } else { // Standalone Assignment
                                        const style = { backgroundColor: event.courseColor.backgroundColor, color: event.courseColor.textColor, borderColor: event.courseColor.borderColor };
                                        const categoryName = event.assignmentId ? getAssignmentCategoryName(event.classId, event.assignmentId) : undefined;
                                        return (
                                            <div
                                                key={event.id}
                                                onClick={() => onEventClick(event)}
                                                className="p-1 text-xs rounded border flex items-start gap-1.5 cursor-pointer hover:brightness-95"
                                                style={style}
                                                title={`${event.classGrupo ? event.classGrupo + ' - ' : ''}${event.className} - ${event.unitName}${categoryName ? ' (' + categoryName + ')' : ''}`}
                                            >
                                               <ClipboardDocumentIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-80"/>
                                               <div className="truncate">
                                                    <p className="font-semibold truncate">
                                                        {event.classGrupo && <span className="font-mono text-[11px] opacity-80 mr-1">{event.classGrupo}</span>}
                                                        {event.className}
                                                    </p>
                                                    <p className="truncate">{event.unitName}{categoryName && <span className="opacity-70"> ({categoryName})</span>}</p>
                                                </div>
                                            </div>
                                        );
                                    }
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
};

export default MonthView;
