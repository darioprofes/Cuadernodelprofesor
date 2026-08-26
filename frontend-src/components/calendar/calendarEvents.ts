import type { ProgrammingUnit, Course, AcademicConfiguration, ClassData, JournalEntry, Assignment, AgendaNote, Meeting } from '../../types';
import { buildClassName, sessionDisplayText } from '../../utils';
import { PALETTE } from '../../theme/palette';

export interface CalendarEvent {
    id: string;
    date: Date;
    unitId?: string;
    unitName?: string; // Made optional as assignments might not have it directly if standalone
    sessionNumber?: number;
    totalSessions?: number;
    description?: string; // Planned description
    journalNote?: string; // Actual journal entry note
    courseId: string;
    classId: string;
    className: string; // materia (course.subject), no el grupo
    classGrupo?: string; // p.ej. "S4BD", separado de className
    color?: string;
    courseColor: { backgroundColor: string, textColor: string, borderColor: string };
    eventType: 'session' | 'assignment' | 'otherActivity' | 'note' | 'meeting';
    assignmentId?: string; // For standalone assignments
    assignments?: Assignment[]; // For assignments merged into a session
    periodIndex?: number;
    periodName?: string;
    isGapSession?: boolean;
    noteId?: string; // For 'note' events: id of the underlying AgendaNote
    meetingId?: string; // For 'meeting' events: id of the underlying Meeting
}

// Color neutro para las notas libres de la agenda: distinto del azul de las
// tareas calificables y de los colores por materia de las sesiones.
export const NOTE_COLOR = { backgroundColor: '#fef9c3', textColor: '#854d0e', borderColor: '#fde68a' };

// Reuniones: mismo tono (clave "teal", hoy magenta) que su propia página
// (Reuniones/Informes) -- fondo/borde leídos de PALETTE en vez de fijados a
// mano, para no desincronizarse la próxima vez que cambie la paleta.
export const MEETING_COLOR = { backgroundColor: PALETTE.teal.soft, textColor: PALETTE.teal.header, borderColor: PALETTE.teal.base };
export const MEETING_TIPO_LABEL: Record<Meeting['tipo'], string> = {
    tutoria: 'Tutoría',
    r_tutores: 'R. Tutores',
    departamento: 'Departamento',
    familia: 'Familia',
};

// --- Date Helpers (UTC) ---
export const addMonthsUTC = (date: Date, months: number) => {
    const d = new Date(date);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d;
};

export const addDaysUTC = (date: Date, days: number) => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
};

export const startOfMonthUTC = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
export const endOfMonthUTC = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

export const startOfWeekUTC = (date: Date) => {
    const d = new Date(date);
    const day = d.getUTCDay(); // getUTCDay() returns 0 for Sunday, 1 for Monday, etc.
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
};

export const toYYYYMMDD_UTC = (date: Date): string => {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};


// --- Color Helper ---
export const getContrastingTextColor = (hexcolor: string): string => {
    if (!hexcolor) return '#000000';
    if (hexcolor.startsWith('#')) {
        hexcolor = hexcolor.slice(1);
    }
    if (hexcolor.length === 3) {
        hexcolor = hexcolor.split('').map(char => char + char).join('');
    }
    const r = parseInt(hexcolor.substring(0, 2), 16);
    const g = parseInt(hexcolor.substring(2, 4), 16);
    const b = parseInt(hexcolor.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
};

const getClassColor = (courseLevel: string, className: string): { backgroundColor: string, textColor: string, borderColor: string } => {
    let hue: number;

    if (/1º\s*ESO/i.test(courseLevel)) hue = 210;        // Blue tones
    else if (/2º\s*ESO/i.test(courseLevel)) hue = 30;   // Orange tones
    else if (/3º\s*ESO/i.test(courseLevel)) hue = 140;  // Green tones
    else if (/4º\s*ESO/i.test(courseLevel)) hue = 270;  // Violet tones
    else if (/1º\s*Bach/i.test(courseLevel)) hue = 55;  // Yellow tones
    else if (/2º\s*Bach/i.test(courseLevel)) hue = 0;    // Red tones
    else { // Fallback for other courses
        let hash = 0;
        for (let i = 0; i < (courseLevel || '').length; i++) {
            hash = courseLevel.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash;
        }
        hue = Math.abs(hash % 360);
    }

    // Variation from class name for saturation and lightness
    let classHash = 0;
    for (let i = 0; i < className.length; i++) {
        classHash = className.charCodeAt(i) + ((classHash << 5) - classHash);
    }
    // Make variation more pronounced
    const saturationOffset = Math.abs(classHash % 20); // 0-19
    const lightnessOffset = Math.abs(Math.floor(classHash / 20) % 15); // 0-14

    const saturation = 65 + saturationOffset; // e.g., 65-84%
    const lightness = 88 - lightnessOffset;   // e.g., 88-74%

    return {
        backgroundColor: `hsla(${hue}, ${saturation}%, ${lightness}%, 1)`,
        textColor: `hsla(${hue}, 60%, 30%, 1)`, // slightly darker text for better contrast
        borderColor: `hsla(${hue}, ${saturation-10}%, ${lightness-10}%, 1)`,
    };
};

interface BuildCalendarEventsArgs {
    classes: ClassData[];
    courses: Course[];
    units: ProgrammingUnit[];
    academicConfiguration: AcademicConfiguration;
    isHoliday: (date: Date) => boolean;
    journalEntries: JournalEntry[];
    agendaNotes: AgendaNote[];
    meetings: Meeting[];
}

// Genera todos los eventos del calendario (sesiones de clase a partir del
// horario semanal + unidades de programación, tareas evaluables con fecha,
// notas libres de agenda y reuniones), fusionando tareas en la sesión de su
// mismo día/clase cuando existe una. Lógica pura, sin JSX, para poder
// probarla/leerla aparte de las 3 vistas (mes/semana/día) que consumen su
// resultado.
export const buildCalendarEvents = ({
    classes, courses, units, academicConfiguration, isHoliday, journalEntries, agendaNotes, meetings,
}: BuildCalendarEventsArgs): CalendarEvent[] => {
    if (!academicConfiguration?.academicYearStart || !academicConfiguration.academicYearEnd) {
        return [];
    }

    const generatedEvents: CalendarEvent[] = [];
    const sessionEventMap = new Map<string, CalendarEvent>(); // Map Key: classId-YYYY-MM-DD (to merge assignments)

    const { academicYearStart, academicYearEnd, periods = [] } = academicConfiguration;
    const startDate = new Date(academicYearStart + 'T00:00:00Z');
    const endDate = new Date(academicYearEnd + 'T00:00:00Z');

    const schoolDays: Date[] = [];
    let currentDateIterator = new Date(startDate);
    while (currentDateIterator <= endDate) {
        const dayOfWeek = currentDateIterator.getUTCDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday(currentDateIterator)) {
            schoolDays.push(new Date(currentDateIterator));
        }
        currentDateIterator = addDaysUTC(currentDateIterator, 1);
    }

    // 1. Generate Sessions (Classes and Other Activities)
    classes.forEach(classData => {
        const course = courses.find(c => c.id === classData.courseId);
        if (!course || !classData.schedule || classData.schedule.length === 0) return;

        const courseColor = getClassColor(course.level, buildClassName(classData.grupo, course.subject));
        const skippedDaysSet = new Set(classData.skippedDays || []);

        // Filter sessions for this specific class from the global school days
        const classSessionSlots: { date: Date, periodIndex: number }[] = [];
        schoolDays.forEach(day => {
            if (skippedDaysSet.has(toYYYYMMDD_UTC(day))) return;

            const slotsForDay = classData.schedule!.filter(s => s.day === day.getUTCDay());
            slotsForDay.sort((a, b) => a.periodIndex - b.periodIndex);

            slotsForDay.forEach(slot => {
                classSessionSlots.push({ date: day, periodIndex: slot.periodIndex });
            });
        });

        if (course.type === 'other') {
            classSessionSlots.forEach(slot => {
                const event: CalendarEvent = {
                    id: `${classData.id}-${toYYYYMMDD_UTC(slot.date)}-${slot.periodIndex}`,
                    date: slot.date,
                    eventType: 'otherActivity',
                    unitName: course.subject,
                    description: course.subject,
                    courseId: classData.courseId,
                    classId: classData.id,
                    className: course.subject,
                    classGrupo: classData.grupo,
                    courseColor: { backgroundColor: '#f1f5f9', textColor: '#475569', borderColor: '#cbd5e1' },
                    periodIndex: slot.periodIndex,
                    periodName: periods[slot.periodIndex] || `Periodo ${slot.periodIndex + 1}`,
                };
                generatedEvents.push(event);
            });
        } else {
            const unitsForClass = units.filter(u => u.courseId === classData.courseId);
            let unitIndex = 0;
            let sessionInUnit = 0;

            for (let i = 0; i < classSessionSlots.length; i++) {
                const slot = classSessionSlots[i];
                const slotDateStr = toYYYYMMDD_UTC(slot.date);

                // Find if there is a journal entry for this class/date/period
                const journalEntry = journalEntries.find(e => e.classId === classData.id && e.date === slotDateStr && e.periodIndex === slot.periodIndex);

                // Anchor check
                const anchorUnitIndex = unitsForClass.findIndex(u => u.startDate === slotDateStr);

                if (anchorUnitIndex !== -1) {
                    unitIndex = anchorUnitIndex;
                    sessionInUnit = 0;
                }

                if (unitIndex >= unitsForClass.length) break;

                const unit = unitsForClass[unitIndex];
                const nextUnitAnchor = unitIndex < unitsForClass.length - 1 ? unitsForClass[unitIndex + 1].startDate : null;
                const isOverflow = sessionInUnit >= unit.sessions;

                if (sessionInUnit >= unit.sessions) {
                    if (!nextUnitAnchor) {
                        unitIndex++;
                        sessionInUnit = 0;
                        if (unitIndex < unitsForClass.length) {
                            i--;
                            continue;
                        } else {
                            break;
                        }
                    }
                }

                const currentUnitObj = unitsForClass[unitIndex];
                const details = currentUnitObj.sessionDetails || [];
                const detail = details[sessionInUnit];

                const sessionEvent: CalendarEvent = {
                    id: `${classData.id}-${currentUnitObj.id}-s${sessionInUnit + 1}-${i}`,
                    date: slot.date,
                    eventType: 'session',
                    unitId: currentUnitObj.id,
                    unitName: currentUnitObj.name,
                    sessionNumber: sessionInUnit + 1,
                    totalSessions: Math.max(currentUnitObj.sessions, sessionInUnit + 1),
                    description: sessionDisplayText(detail) || (isOverflow ? '(Sesión extra)' : ''),
                    journalNote: journalEntry?.notes, // Bind Journal Entry
                    courseId: currentUnitObj.courseId,
                    classId: classData.id,
                    className: course.subject,
                    classGrupo: classData.grupo,
                    color: detail?.color,
                    courseColor: courseColor,
                    periodIndex: slot.periodIndex,
                    periodName: periods[slot.periodIndex] || `Periodo ${slot.periodIndex + 1}`,
                    isGapSession: isOverflow,
                    assignments: [] // Initialize assignments array
                };

                generatedEvents.push(sessionEvent);
                // Store in map for assignment merging.
                const key = `${classData.id}-${slotDateStr}`;
                if (!sessionEventMap.has(key)) {
                    sessionEventMap.set(key, sessionEvent);
                }

                sessionInUnit++;
            }
        }
    });

    // 2. Process Assignments (Merge into Sessions or Create Standalone)
    classes.forEach(classData => {
        if (!classData.assignments) return;

        const course = courses.find(c => c.id === classData.courseId);
        const courseColor = course ? getClassColor(course.level, buildClassName(classData.grupo, course.subject)) : { backgroundColor: '#ddd', textColor: '#333', borderColor: '#ccc' };

        classData.assignments.forEach(assignment => {
            if (assignment.date) {
                const key = `${classData.id}-${assignment.date}`;
                const existingSession = sessionEventMap.get(key);

                if (existingSession) {
                    // MERGE: Add to existing session
                    if (!existingSession.assignments) existingSession.assignments = [];
                    existingSession.assignments.push(assignment);
                } else {
                    // STANDALONE
                    const assignmentDate = new Date(assignment.date + 'T00:00:00Z');
                    generatedEvents.push({
                        id: `${classData.id}-${assignment.id}`,
                        date: assignmentDate,
                        eventType: 'assignment',
                        assignmentId: assignment.id,
                        unitName: assignment.name,
                        description: `Tarea: ${assignment.name}`,
                        courseId: classData.courseId,
                        classId: classData.id,
                        className: course ? course.subject : (classData.grupo || ''),
                        classGrupo: classData.grupo,
                        courseColor: courseColor,
                        periodIndex: undefined,
                        periodName: undefined
                    });
                }
            }
        });
    });

    // 3. Notas libres de la Agenda: no evaluables, sin clase asociada, y
    // distintas de las tareas personales de Hoy (antes compartían el
    // mismo almacenamiento por error).
    agendaNotes.forEach(note => {
        generatedEvents.push({
            id: `note-${note.id}`,
            date: new Date(note.fecha + 'T00:00:00Z'),
            eventType: 'note',
            noteId: note.id,
            description: note.texto,
            courseId: '',
            classId: '',
            className: '',
            courseColor: NOTE_COLOR,
        });
    });

    // 4. Reuniones programadas.
    meetings.forEach(meeting => {
        generatedEvents.push({
            id: `meeting-${meeting.id}`,
            date: new Date(meeting.fecha + 'T00:00:00Z'),
            eventType: 'meeting',
            meetingId: meeting.id,
            description: [meeting.hora, MEETING_TIPO_LABEL[meeting.tipo], meeting.conQuien].filter(Boolean).join(' · '),
            courseId: '',
            classId: '',
            className: '',
            courseColor: MEETING_COLOR,
        });
    });

    return generatedEvents.sort((a, b) => {
        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) return dateDiff;
        return (a.periodIndex ?? 99) - (b.periodIndex ?? 99);
    });
};
