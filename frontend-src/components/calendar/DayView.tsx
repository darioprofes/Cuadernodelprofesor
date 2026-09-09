import React from 'react';
import type { Holiday } from '../../types';
import { PencilIcon, ClipboardDocumentIcon, ListBulletIcon, TrashIcon, BookOpenIcon, UsersIcon, PlusIcon } from '../Icons';
import { CalendarEvent, NOTE_COLOR, toYYYYMMDD_UTC, getContrastingTextColor } from './calendarEvents';
import { TYPOGRAPHY } from '../../theme/typography';
import { COLOR_INICIO_CURSO, COLOR_FIN_CURSO, COLOR_POR_TIPO_FESTIVO } from './calendarColors';

const DayView: React.FC<{
    currentDate: Date;
    events: CalendarEvent[];
    isHoliday: (date: Date) => boolean;
    getHoliday: (dateStr: string) => Holiday | undefined;
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
}> = ({ currentDate, events, isHoliday, getHoliday, getPeriodStart, academicYearStart, academicYearEnd, onOpenTaskModal, onOpenNoteModal, onOpenMeetingModal, onEventClick, onDeleteNote, getCategoryName, getAssignmentCategoryName }) => {
    const currentDateStr = toYYYYMMDD_UTC(currentDate);
    const eventsForDay = events.filter(e => toYYYYMMDD_UTC(e.date) === currentDateStr);
    const isDayHoliday = isHoliday(currentDate);
    const holiday = isDayHoliday ? getHoliday(currentDateStr) : undefined;
    const dayOfWeek = currentDate.getUTCDay();
    const isWeekend = dayOfWeek === 6 || dayOfWeek === 0;
    const isStart = currentDateStr === academicYearStart;
    const isEnd = currentDateStr === academicYearEnd;
    const periodStart = getPeriodStart(currentDateStr);

    // Mismo esquema que AnnualCalendarView.tsx (Calendario) -- pedido
    // explícito del usuario: el fondo de la Agenda debe ser igual que el
    // del Calendario. Los fines de semana sin festivo asociado se quedan
    // en blanco (el aviso "Día no lectivo" de abajo ya avisa de esos).
    let backgroundColor = '#ffffff';
    if (isDayHoliday) backgroundColor = COLOR_POR_TIPO_FESTIVO[holiday?.type ?? 'festivo'];
    if (isStart) backgroundColor = COLOR_INICIO_CURSO;
    if (isEnd) backgroundColor = COLOR_FIN_CURSO;

    return (
        <div className="p-4 h-[70vh] overflow-y-auto" style={{ backgroundColor }}>
             <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                 <h3 className={TYPOGRAPHY.sectionTitle}>{currentDate.toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</h3>
                 {/* Mismos 3 botones que Mes/Semana, pedido explícito del
                     usuario -- antes esta vista solo tenía "Añadir nota".
                     Tarea/reunión no tienen sentido en un día no lectivo,
                     una nota libre sí. */}
                 <div className="flex items-center gap-2">
                     {!isDayHoliday && (
                         <button
                            onClick={() => onOpenTaskModal(currentDate)}
                            className="flex items-center gap-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 py-1.5 px-3 rounded-lg"
                         >
                            <PlusIcon className="w-4 h-4" /> Añadir tarea
                         </button>
                     )}
                     <button
                        onClick={() => onOpenNoteModal(currentDate)}
                        className="flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 py-1.5 px-3 rounded-lg"
                     >
                        <ListBulletIcon className="w-4 h-4" /> Añadir nota
                     </button>
                     {!isDayHoliday && (
                         <button
                            onClick={() => onOpenMeetingModal(currentDate)}
                            className="flex items-center gap-1.5 text-sm font-medium text-teal-700 bg-teal-100 hover:bg-teal-200 py-1.5 px-3 rounded-lg"
                         >
                            <UsersIcon className="w-4 h-4" /> Apuntar reunión
                         </button>
                     )}
                 </div>
             </div>
             {(isDayHoliday || isWeekend) && <p className="text-center font-semibold text-rose-700 mb-4">Día no lectivo{holiday?.name ? ` — ${holiday.name}` : ''}</p>}
             {isStart && <p className="text-center font-semibold text-white mb-4">Inicio de curso</p>}
             {isEnd && <p className="text-center font-semibold text-white mb-4">Fin de curso</p>}
             {periodStart && <p className={`text-center font-semibold mb-4 ${isDayHoliday || isStart || isEnd ? 'text-white' : 'text-slate-700'}`}>Empieza: {periodStart.name}</p>}
             {eventsForDay.length > 0 ? (
                <div className="space-y-3">
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

                    // Render embedded assignments
                    const renderAssignments = () => {
                        if (!event.assignments || event.assignments.length === 0) return null;
                        return (
                            <div className="mt-3 pt-3 border-t border-black/10">
                                <p className="text-xs font-bold opacity-70 uppercase tracking-wider mb-2">Tareas para hoy:</p>
                                <div className="space-y-2">
                                    {event.assignments.map(a => {
                                        const categoryName = getCategoryName(event.classId, a.categoryId);
                                        return (
                                            <div key={a.id} className="flex items-center gap-2 p-2 bg-white/50 rounded border border-black/5">
                                                <ClipboardDocumentIcon className="w-4 h-4 text-slate-600 flex-shrink-0"/>
                                                <span className="font-semibold">{a.name}</span>
                                                {categoryName && <span className="text-sm opacity-70">({categoryName})</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    }

                    if (event.eventType === 'session') {
                        return (
                            <div key={event.id} className={`p-3 rounded-lg relative group ${event.isGapSession ? 'border border-dashed' : ''}`} style={style}>
                                <p className="font-bold flex items-center text-lg">
                                    {event.periodName ? <span className="mr-2 opacity-75">[{event.periodName}]</span> : null}
                                    {event.classGrupo && <span className="inline-block px-2 py-0.5 mr-2 rounded bg-black/10 text-sm font-mono">{event.classGrupo}</span>}
                                    {event.className} - {event.unitName}
                                    {event.journalNote && <BookOpenIcon className="w-5 h-5 ml-2 flex-shrink-0"/>}
                                </p>
                                {event.eventType === 'session' && <p className="text-sm font-medium mt-1">Sesión {event.sessionNumber}</p>}

                                {event.description && (
                                    <div className="mt-2 p-2 bg-white/40 rounded text-sm">
                                         <span className="font-bold text-xs uppercase tracking-wide opacity-70 block mb-1">Planificado:</span>
                                         {event.description}
                                    </div>
                                )}

                                {event.journalNote && (
                                     <div className="mt-2 p-2 bg-white/70 rounded text-base font-medium border-l-2 border-indigo-500">
                                         <span className="font-bold text-xs uppercase tracking-wide text-indigo-700 block mb-1">Diario:</span>
                                         {event.journalNote}
                                    </div>
                                )}

                                {renderAssignments()}
                                <button onClick={() => onEventClick(event)} className="absolute top-2 right-2 p-1 rounded-full bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity"><PencilIcon className="w-5 h-5"/></button>
                            </div>
                        );
                    } else if (event.eventType === 'note') {
                        return (
                            <div key={event.id} className="p-3 rounded-lg border-l-4 flex items-center gap-3 group" style={{ backgroundColor: NOTE_COLOR.backgroundColor, color: NOTE_COLOR.textColor, borderColor: NOTE_COLOR.borderColor }}>
                                <ListBulletIcon className="w-6 h-6 opacity-80" />
                                <p className="text-base flex-grow">{event.description}</p>
                                <button onClick={() => event.noteId && onDeleteNote(event.noteId)} className="flex-shrink-0 opacity-0 group-hover:opacity-70 hover:!opacity-100">
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        );
                    } else if (event.eventType === 'meeting') {
                        return (
                            <div key={event.id} onClick={() => onEventClick(event)} className="p-3 rounded-lg border-l-4 flex items-center gap-3 cursor-pointer hover:brightness-95" style={style}>
                                <UsersIcon className="w-6 h-6 opacity-80"/>
                                <p className="text-base">{event.description}</p>
                            </div>
                        )
                    } else {
                        const categoryName = event.assignmentId ? getAssignmentCategoryName(event.classId, event.assignmentId) : undefined;
                         return (
                            <div key={event.id} onClick={() => onEventClick(event)} className="p-3 rounded-lg border-l-4 flex items-center gap-3 cursor-pointer hover:brightness-95" style={style}>
                                <ClipboardDocumentIcon className="w-6 h-6 opacity-80"/>
                                <div>
                                    <p className="font-bold text-lg">
                                        {event.classGrupo && <span className="inline-block px-2 py-0.5 mr-2 rounded bg-black/10 text-sm font-mono">{event.classGrupo}</span>}
                                        {event.className}
                                    </p>
                                    <p className="text-base">{event.unitName}{categoryName && <span className="opacity-70"> ({categoryName})</span>}</p>
                                </div>
                            </div>
                        )
                    }
                })}
                </div>
            ) : (
                !(isDayHoliday || isWeekend) &&
                <div className="flex items-center justify-center h-full text-slate-500">
                    <p>No hay sesiones programadas para este día.</p>
                </div>
            )}
        </div>
    )
};

export default DayView;
