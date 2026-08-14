import type { ClassData, Course, EvaluationPeriod, View } from '../types';
import { addDays, getMateria, periodoActivoEn, toYYYYMMDD } from '../utils';

// Avisos de la franja "Hoy" que van más allá de "próximos eventos": algo
// excepcional que necesita atención, no estado normal (ver plan). Cada
// detector es una función pura y testeable; HoyView decide el icono real
// (aquí solo se referencia por si el llamante quiere renderizarlo, pero los
// detectores de esta fase no fijan icono — HoyView lo elige según `kind`).
export type DashboardNoticeKind = 'ungraded' | 'periodClosing';

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

export const computeDashboardNotices = (
    classes: ClassData[],
    courses: Course[],
    evaluationPeriods: EvaluationPeriod[],
    today: Date,
): DashboardNotice[] => [
    ...detectUngradedOverdueAssignments(classes, courses, today),
    ...detectPeriodClosingSoon(classes, evaluationPeriods, today),
];
