import type { ClassData, Course, EvaluationPeriod, View } from '../types';
import type { Absence } from '../types/api';
import { addDays, getMateria, getNombreCompleto, periodoActivoEn, toYYYYMMDD } from '../utils';

// Avisos de la franja "Hoy" que van más allá de "próximos eventos": algo
// excepcional que necesita atención, no estado normal (ver plan). Cada
// detector es una función pura y testeable; HoyView decide el icono real
// (aquí solo se referencia por si el llamante quiere renderizarlo, pero los
// detectores de esta fase no fijan icono — HoyView lo elige según `kind`).
export type DashboardNoticeKind = 'ungraded' | 'periodClosing' | 'educasturBacklog' | 'absenceStreak';

export interface DashboardNotice {
    id: string;
    kind: DashboardNoticeKind;
    label: string;
    tone: 'warn' | 'alert';
    target?: { view: View; classId?: string };
}

const DEFAULT_MIN_DAYS_OVERDUE = 3;
const DEFAULT_DAYS_BEFORE_CLOSE = 5;

// Un alumno cuenta como "sin calificar" en una tarea si no tiene NINGUNA
// fila de Grade para ese assignmentId — igual que ya asume el resto de la
// app (hydrateGrades en apiAdapters.ts solo crea filas para notas que
// existen de verdad, nunca un marcador de "pendiente").
const countMissingGrades = (classData: ClassData, assignmentId: string): number => {
    const gradedStudentIds = new Set(
        classData.grades.filter(g => g.assignmentId === assignmentId).map(g => g.studentId)
    );
    return classData.students.filter(s => !gradedStudentIds.has(s.id)).length;
};

// Un aviso por CLASE (no uno por tarea, para no inundar la franja; tampoco
// uno global único, porque el aviso tiene que poder llevar al Cuaderno de
// la clase concreta afectada).
export const detectUngradedOverdueAssignments = (
    classes: ClassData[],
    courses: Course[],
    today: Date,
    minDaysOverdue: number = DEFAULT_MIN_DAYS_OVERDUE,
): DashboardNotice[] => {
    const cutoff = toYYYYMMDD(addDays(today, -minDaysOverdue));
    const notices: DashboardNotice[] = [];

    classes.forEach(classData => {
        if (classData.students.length === 0) return;
        const overdueCount = classData.assignments.filter(a =>
            a.date && a.date < cutoff && countMissingGrades(classData, a.id) > 0
        ).length;
        if (overdueCount === 0) return;

        const materia = getMateria(classData, courses);
        notices.push({
            id: `ungraded-${classData.id}`,
            kind: 'ungraded',
            label: `${overdueCount} sin calificar en ${materia}`,
            tone: 'warn',
            target: { view: 'gradebook', classId: classData.id },
        });
    });

    return notices;
};

// Un aviso por periodo que esté a punto de cerrar (no por clase): agrega la
// completitud de todas las clases para las tareas de ese periodo.
export const detectPeriodClosingSoon = (
    classes: ClassData[],
    evaluationPeriods: EvaluationPeriod[],
    today: Date,
    daysBeforeClose: number = DEFAULT_DAYS_BEFORE_CLOSE,
): DashboardNotice[] => {
    const todayStr = toYYYYMMDD(today);
    const activePeriodId = periodoActivoEn(evaluationPeriods, todayStr);
    const notices: DashboardNotice[] = [];

    evaluationPeriods.forEach(period => {
        if (period.id !== activePeriodId) return;
        if (todayStr > period.endDate) return; // ya cerrado
        const limite = toYYYYMMDD(addDays(today, daysBeforeClose));
        if (period.endDate > limite) return; // todavía no está "a punto de cerrar"

        let pendingAssignments = 0;
        classes.forEach(classData => {
            if (classData.students.length === 0) return;
            classData.assignments.forEach(a => {
                if (a.evaluationPeriodId === period.id && countMissingGrades(classData, a.id) > 0) {
                    pendingAssignments++;
                }
            });
        });
        if (pendingAssignments === 0) return;

        notices.push({
            id: `period-closing-${period.id}`,
            kind: 'periodClosing',
            label: `${period.name} cierra pronto, ${pendingAssignments} tareas sin calificar`,
            tone: 'warn',
        });
    });

    return notices;
};

const DEFAULT_EDUCASTUR_BACKLOG_DAYS = 7;
const DEFAULT_MIN_STREAK = 3;

// Mismo criterio que `pendingSyncCount` en GradebookTable.tsx:321 (faltas
// con `syncedAt` vacío), agregado entre todas las clases y filtrado por
// antigüedad — no hace falta ningún "última sincronización" nuevo. En
// escritorio nunca hay sincronización con Educastur (ver absences.rs), así
// que el aviso se desactiva ahí para no dar un falso positivo permanente.
export const detectAbsenceSyncBacklog = (
    absencesByClass: Record<string, Absence[]>,
    today: Date,
    isDesktop: boolean,
    minDaysOld: number = DEFAULT_EDUCASTUR_BACKLOG_DAYS,
): DashboardNotice[] => {
    if (isDesktop) return [];
    const cutoff = toYYYYMMDD(addDays(today, -minDaysOld));
    let count = 0;
    Object.values(absencesByClass).forEach(absences => {
        absences.forEach(a => {
            if (!a.syncedAt && a.date < cutoff) count++;
        });
    });
    if (count === 0) return [];

    return [{
        id: 'educastur-backlog',
        kind: 'educasturBacklog',
        label: `${count} faltas sin subir a Educastur`,
        tone: 'alert',
    }];
};

// Racha de faltas injustificadas seguidas de un alumno, POR MATERIA (no
// cruzando sus otras clases — decisión explícita, más simple). Una falta =
// una fila que existe (no hay fila para "presente"), así que la racha son
// las N filas más recientes de esa matrícula con tipoFalta === 'I'.
export const detectUnjustifiedAbsenceStreaks = (
    classes: ClassData[],
    absencesByClass: Record<string, Absence[]>,
    minStreak: number = DEFAULT_MIN_STREAK,
): DashboardNotice[] => {
    const notices: DashboardNotice[] = [];

    classes.forEach(classData => {
        const absences = (absencesByClass[classData.id] ?? []).filter(a => a.tipoFalta !== '');
        if (absences.length === 0) return;

        const enrollmentToStudent = new Map(
            classData.students.filter(s => s.enrollmentId).map(s => [s.enrollmentId!, s])
        );
        const byEnrollment = new Map<string, Absence[]>();
        absences.forEach(a => {
            if (!byEnrollment.has(a.enrollmentId)) byEnrollment.set(a.enrollmentId, []);
            byEnrollment.get(a.enrollmentId)!.push(a);
        });

        byEnrollment.forEach((rows, enrollmentId) => {
            const sorted = [...rows].sort((a, b) =>
                a.date === b.date ? a.periodIndex - b.periodIndex : a.date.localeCompare(b.date)
            );
            let streak = 0;
            for (let i = sorted.length - 1; i >= 0 && sorted[i].tipoFalta === 'I'; i--) streak++;
            if (streak < minStreak) return;

            const student = enrollmentToStudent.get(enrollmentId);
            const nombre = student ? getNombreCompleto(student) : 'Un alumno';
            notices.push({
                id: `absence-streak-${classData.id}-${enrollmentId}`,
                kind: 'absenceStreak',
                label: `${nombre}: ${streak} faltas injustificadas seguidas`,
                tone: 'alert',
                target: { view: 'gradebook', classId: classData.id },
            });
        });
    });

    return notices;
};

export const computeDashboardNotices = (
    classes: ClassData[],
    courses: Course[],
    evaluationPeriods: EvaluationPeriod[],
    today: Date,
): DashboardNotice[] => [
    ...detectUngradedOverdueAssignments(classes, courses, today),
    ...detectPeriodClosingSoon(classes, evaluationPeriods, today),
];
