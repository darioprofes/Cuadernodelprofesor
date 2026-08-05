
import React, { useState, useMemo, useEffect } from 'react';
import type { ProgrammingUnit, Course, AcademicConfiguration, ClassData, JournalEntry, EvaluationPeriod, Assignment, EvaluationCriterion, SpecificCompetence, KeyCompetence, SessionDetail, AgendaNote, Meeting, View } from '../types';
import { useCreateAssignment } from '../hooks/useAssignments';
import { useUpdateClass } from '../hooks/useApiClasses';
import { useCurrentAcademicYear } from '../hooks/useAcademicYears';
import { useUpdateProgrammingUnit } from '../hooks/useProgrammingUnits';
import SessionActionModal from './SessionActionModal';
import CalendarTaskModal from './CalendarTaskModal';
import CalendarNoteModal from './CalendarNoteModal';
import CalendarMeetingModal from './CalendarMeetingModal';
import CalendarHeader from './calendar/CalendarHeader';
import MonthView from './calendar/MonthView';
import WeekView from './calendar/WeekView';
import DayView from './calendar/DayView';
import { CalendarEvent, buildCalendarEvents, addMonthsUTC, addDaysUTC, toYYYYMMDD_UTC } from './calendar/calendarEvents';

export type { CalendarEvent };

interface CalendarViewProps {
    units: ProgrammingUnit[];
    courses: Course[];
    academicConfiguration: AcademicConfiguration;
    classes: ClassData[];
    journalEntries: JournalEntry[];
    criteria: EvaluationCriterion[];
    specificCompetences: SpecificCompetence[];
    keyCompetences: KeyCompetence[];
    onSaveJournalEntry: (entry: JournalEntry) => void;
    agendaNotes: AgendaNote[];
    setAgendaNotes: (updater: React.SetStateAction<AgendaNote[]>) => void;
    meetings: Meeting[];
    setMeetings: (updater: React.SetStateAction<Meeting[]>) => void;
    setActiveView: (view: View) => void;
    setActiveClassId: (id: string) => void;
    onOpenMeeting: (meetingId: string) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ units, courses, academicConfiguration, classes, journalEntries, criteria, specificCompetences, keyCompetences, onSaveJournalEntry, agendaNotes, setAgendaNotes, meetings, setMeetings, setActiveView, setActiveClassId, onOpenMeeting }) => {
    const createAssignmentMutation = useCreateAssignment();
    const updateClassMutation = useUpdateClass();
    const updateProgrammingUnitMutation = useUpdateProgrammingUnit();
    const currentYear = useCurrentAcademicYear();
    const yearId = currentYear.data?.id ?? '';
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<'month' | 'week' | 'day'>('month');
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [selectedDateForTask, setSelectedDateForTask] = useState<Date | null>(null);
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [selectedDateForNote, setSelectedDateForNote] = useState<Date | null>(null);
    const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
    const [selectedDateForMeeting, setSelectedDateForMeeting] = useState<Date | null>(null);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        if (!initialized && academicConfiguration) {
            const defaultView = academicConfiguration.defaultCalendarView || 'month';
            setView(defaultView);
            setInitialized(true);
        }
    }, [academicConfiguration, initialized]);

    const isHoliday = useMemo(() => {
        if (!academicConfiguration || !Array.isArray(academicConfiguration.holidays)) {
            return () => false;
        }
        const holidayRanges = academicConfiguration.holidays
            .filter(h => h.startDate && h.endDate)
            .map(h => ({
                start: new Date(h.startDate + 'T00:00:00Z'),
                end: new Date(h.endDate + 'T00:00:00Z')
            }));

        return (date: Date): boolean => {
            const dateOnly = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
            return holidayRanges.some(range => dateOnly >= range.start && dateOnly <= range.end);
        };
        // Narrowed on purpose to .holidays: nothing else in academicConfiguration
        // affects this calculation, and depending on the whole object would
        // rebuild isHoliday (and therefore the events memo below) on every
        // unrelated settings change (grading periods, gradeScale, etc).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [academicConfiguration.holidays]);

    const events = useMemo<CalendarEvent[]>(() => buildCalendarEvents({
        classes, courses, units, academicConfiguration, isHoliday, journalEntries, agendaNotes, meetings,
    }), [classes, courses, units, academicConfiguration, isHoliday, journalEntries, agendaNotes, meetings]);

    // Categoría de una tarea evaluable (ej. "Exámenes", "Trabajos"), para
    // mostrarla junto al nombre en la Agenda igual que en Tareas evaluables.
    const getCategoryName = (classId: string, categoryId: string): string | undefined => {
        const cls = classes.find(c => c.id === classId);
        return cls?.categories.find(cat => cat.id === categoryId)?.name;
    };

    const getAssignmentCategoryName = (classId: string, assignmentId: string): string | undefined => {
        const cls = classes.find(c => c.id === classId);
        const assignment = cls?.assignments.find(a => a.id === assignmentId);
        return assignment ? getCategoryName(classId, assignment.categoryId) : undefined;
    };

    const handleEventClick = (event: CalendarEvent) => {
        if (event.eventType === 'session') {
            setSelectedEvent(event);
            setIsActionModalOpen(true);
        } else if (event.eventType === 'assignment') {
            // Lleva directo a la página de la tarea en el Cuaderno de esa clase.
            setActiveClassId(event.classId);
            setActiveView('gradebook');
        } else if (event.eventType === 'meeting' && event.meetingId) {
            // Lleva a Reuniones con esa reunión concreta abierta para editar.
            onOpenMeeting(event.meetingId);
            setActiveView('meetings');
        }
    };

    const handleOpenTaskModal = (date: Date) => {
        setSelectedDateForTask(date);
        setIsTaskModalOpen(true);
    };

    const handleOpenNoteModal = (date: Date) => {
        setSelectedDateForNote(date);
        setIsNoteModalOpen(true);
    };

    const handleSaveNote = (texto: string) => {
        if (!selectedDateForNote) return;
        const newNote: AgendaNote = {
            id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            texto,
            fecha: toYYYYMMDD_UTC(selectedDateForNote),
        };
        setAgendaNotes(prev => [...prev, newNote]);
        setIsNoteModalOpen(false);
    };

    const handleDeleteNote = (noteId: string) => {
        if (!window.confirm('¿Eliminar esta nota de la agenda?')) return;
        setAgendaNotes(prev => prev.filter(n => n.id !== noteId));
    };

    const handleOpenMeetingModal = (date: Date) => {
        setSelectedDateForMeeting(date);
        setIsMeetingModalOpen(true);
    };

    const handleSaveMeeting = (data: Omit<Meeting, 'id'>) => {
        if (!selectedDateForMeeting) return;
        const newMeeting: Meeting = {
            id: `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            ...data,
        };
        setMeetings(prev => [...prev, newMeeting]);
        setIsMeetingModalOpen(false);
    };

    const handleDeleteMeeting = (meetingId: string) => {
        if (!window.confirm('¿Eliminar esta reunión?')) return;
        setMeetings(prev => prev.filter(m => m.id !== meetingId));
    };

    const handleSaveTask = async (newAssignment: Omit<Assignment, 'id'>, classId: string) => {
        const classToUpdate = classes.find(c => c.id === classId);
        if (!classToUpdate) return;
        await createAssignmentMutation.mutateAsync({ classId, data: newAssignment });
        setIsTaskModalOpen(false);
    };

    const handleCancelSession = async (classId: string, date: Date) => {
        const classToUpdate = classes.find(c => c.id === classId);
        if (!classToUpdate) return;
        const dateString = toYYYYMMDD_UTC(date);
        const updatedSkippedDays = Array.from(new Set([...(classToUpdate.skippedDays || []), dateString]));
        await updateClassMutation.mutateAsync({ id: classId, yearId, data: { skippedDays: updatedSkippedDays } });
    };

    const handleUpdateSessionDescription = (unitId: string, sessionNumber: number, newDescription: string) => {
        // Changed behavior: Editing a session in Calendar now creates/updates a Journal Entry,
        // it does NOT overwrite the original plan (ProgrammingUnit).
        if (selectedEvent) {
            const dateStr = toYYYYMMDD_UTC(selectedEvent.date);
            // Los eventos de sesión (los únicos que pasan por aquí) siempre traen
            // periodIndex; el fallback a 0 es solo para que el tipo cuadre.
            const periodIndex = selectedEvent.periodIndex ?? 0;
            const existingEntry = journalEntries.find(e => e.classId === selectedEvent.classId && e.date === dateStr && e.periodIndex === periodIndex);

            const newEntry: JournalEntry = {
                id: existingEntry ? existingEntry.id : `j-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                classId: selectedEvent.classId,
                date: dateStr,
                periodIndex,
                notes: newDescription
            };

            onSaveJournalEntry(newEntry);
        }
    };

    const handleInsertAndDisplaceSession = (unitId: string, sessionNumber: number, newDescription: string) => {
        const unit = units.find(u => u.id === unitId);
        if (!unit) return;

        const newSessionDetail: SessionDetail = { description: newDescription };
        const sessionIndexToInsertAfter = sessionNumber - 1;
        const updatedSessionDetails = [...unit.sessionDetails];
        updatedSessionDetails.splice(sessionIndexToInsertAfter + 1, 0, newSessionDetail);

        updateProgrammingUnitMutation.mutate({
            id: unit.id,
            courseId: unit.courseId,
            data: { sessions: unit.sessions + 1, sessionDetails: updatedSessionDetails },
        });
        setIsActionModalOpen(false);
    };

    const handlePrev = () => {
        if (view === 'month') setCurrentDate(addMonthsUTC(currentDate, -1));
        if (view === 'week') setCurrentDate(addDaysUTC(currentDate, -7));
        if (view === 'day') setCurrentDate(addDaysUTC(currentDate, -1));
    };

    const handleNext = () => {
        if (view === 'month') setCurrentDate(addMonthsUTC(currentDate, 1));
        if (view === 'week') setCurrentDate(addDaysUTC(currentDate, 7));
        if (view === 'day') setCurrentDate(addDaysUTC(currentDate, 1));
    };

    const handleJumpToDate = (dateStr: string) => {
        setCurrentDate(new Date(dateStr + 'T00:00:00Z'));
    };

    const getPeriodForDate = useMemo(() => {
        const periods = academicConfiguration.evaluationPeriods;
        if (!periods || periods.length === 0) return () => null;

        const periodRanges = periods.map((p, index) => ({
            ...p,
            start: new Date(p.startDate + 'T00:00:00Z'),
            end: new Date(p.endDate + 'T00:00:00Z'),
            index: index
        }));

        return (date: Date): { period: EvaluationPeriod, index: number } | null => {
            const dateOnly = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
            for (const range of periodRanges) {
                if (dateOnly >= range.start && dateOnly <= range.end) {
                    return { period: range, index: range.index };
                }
            }
            return null;
        }
    }, [academicConfiguration.evaluationPeriods]);

    return (
        <>
            <div className="bg-white rounded-xl shadow-sm">
                <CalendarHeader
                    currentDate={currentDate}
                    view={view}
                    setView={setView}
                    onPrev={handlePrev}
                    onNext={handleNext}
                    onJumpToDate={handleJumpToDate}
                />
                {view === 'month' && (
                    <MonthView
                        currentDate={currentDate}
                        events={events}
                        isHoliday={isHoliday}
                        getPeriodForDate={getPeriodForDate}
                        onOpenTaskModal={handleOpenTaskModal}
                        onOpenNoteModal={handleOpenNoteModal}
                        onOpenMeetingModal={handleOpenMeetingModal}
                        onDeleteNote={handleDeleteNote}
                        onDeleteMeeting={handleDeleteMeeting}
                        onEventClick={handleEventClick}
                        getCategoryName={getCategoryName}
                        getAssignmentCategoryName={getAssignmentCategoryName}
                    />
                )}
                {view === 'week' && (
                    <WeekView
                        currentDate={currentDate}
                        events={events}
                        isHoliday={isHoliday}
                        onEventClick={handleEventClick}
                        onDeleteNote={handleDeleteNote}
                        getCategoryName={getCategoryName}
                        getAssignmentCategoryName={getAssignmentCategoryName}
                    />
                )}
                {view === 'day' && (
                    <DayView
                        currentDate={currentDate}
                        events={events}
                        isHoliday={isHoliday}
                        onOpenNoteModal={handleOpenNoteModal}
                        onEventClick={handleEventClick}
                        onDeleteNote={handleDeleteNote}
                        getCategoryName={getCategoryName}
                        getAssignmentCategoryName={getAssignmentCategoryName}
                    />
                )}
            </div>
            <SessionActionModal
                isOpen={isActionModalOpen}
                onClose={() => setIsActionModalOpen(false)}
                event={selectedEvent}
                onCancelSession={handleCancelSession}
                onUpdateSession={handleUpdateSessionDescription}
                onInsertAndDisplaceSession={handleInsertAndDisplaceSession}
            />
            {isTaskModalOpen && selectedDateForTask && (
                <CalendarTaskModal
                    isOpen={isTaskModalOpen}
                    onClose={() => setIsTaskModalOpen(false)}
                    onSave={handleSaveTask}
                    selectedDate={selectedDateForTask}
                    classes={classes}
                    courses={courses}
                    criteria={criteria}
                    specificCompetences={specificCompetences}
                    keyCompetences={keyCompetences}
                    academicConfiguration={academicConfiguration}
                />
            )}
            {isNoteModalOpen && selectedDateForNote && (
                <CalendarNoteModal
                    isOpen={isNoteModalOpen}
                    onClose={() => setIsNoteModalOpen(false)}
                    onSave={handleSaveNote}
                    selectedDate={selectedDateForNote}
                />
            )}
            {isMeetingModalOpen && selectedDateForMeeting && (
                <CalendarMeetingModal
                    isOpen={isMeetingModalOpen}
                    onClose={() => setIsMeetingModalOpen(false)}
                    onSave={handleSaveMeeting}
                    selectedDate={selectedDateForMeeting}
                />
            )}
        </>
    );
};

export default CalendarView;
