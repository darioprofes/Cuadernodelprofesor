import { describe, it, expect } from 'vitest';
import type { ClassData, Course, EvaluationPeriod, Student, Assignment, Grade } from '../types';
import { detectUngradedOverdueAssignments, detectPeriodClosingSoon } from './dashboardNotices';

const today = new Date('2026-11-20');

const course: Course = { id: 'course1', level: '1º ESO', subject: 'Biología' };

const student = (id: string): Student => ({ id, acneae: [] });

const assignment = (over: Partial<Assignment> = {}): Assignment => ({
    id: 'a1',
    name: 'Control',
    categoryId: 'cat1',
    evaluationPeriodId: 'p1',
    evaluationMethod: 'direct_grade',
    linkedCriteria: [],
    ...over,
});

const grade = (over: Partial<Grade>): Grade => ({
    studentId: 'st1',
    assignmentId: 'a1',
    criterionScores: {},
    ...over,
});

const classData = (over: Partial<ClassData> = {}): ClassData => ({
    id: 'class1',
    courseId: 'course1',
    students: [student('st1'), student('st2')],
    categories: [],
    assignments: [],
    grades: [],
    ...over,
});

describe('detectUngradedOverdueAssignments', () => {
    it('flags an assignment past its date with a student missing a grade', () => {
        const cls = classData({
            assignments: [assignment({ date: '2026-11-10' })], // 10 días atrás
            grades: [grade({ studentId: 'st1' })], // st2 sin nota
        });
        const notices = detectUngradedOverdueAssignments([cls], [course], today);
        expect(notices).toHaveLength(1);
        expect(notices[0].label).toContain('Biología');
        expect(notices[0].target).toEqual({ view: 'gradebook', classId: 'class1' });
    });

    it('does not flag an assignment that is fully graded', () => {
        const cls = classData({
            assignments: [assignment({ date: '2026-11-10' })],
            grades: [grade({ studentId: 'st1' }), grade({ studentId: 'st2' })],
        });
        expect(detectUngradedOverdueAssignments([cls], [course], today)).toEqual([]);
    });

    it('does not flag an assignment that is not overdue yet (within the grace window)', () => {
        const cls = classData({
            assignments: [assignment({ date: '2026-11-19' })], // ayer, dentro de los 3 días de gracia
            grades: [],
        });
        expect(detectUngradedOverdueAssignments([cls], [course], today)).toEqual([]);
    });

    it('does not flag an assignment with no date set', () => {
        const cls = classData({ assignments: [assignment({ date: undefined })], grades: [] });
        expect(detectUngradedOverdueAssignments([cls], [course], today)).toEqual([]);
    });

    it('aggregates several overdue ungraded assignments of the same class into one notice', () => {
        const cls = classData({
            assignments: [
                assignment({ id: 'a1', date: '2026-11-10' }),
                assignment({ id: 'a2', date: '2026-11-05' }),
            ],
            grades: [],
        });
        const notices = detectUngradedOverdueAssignments([cls], [course], today);
        expect(notices).toHaveLength(1);
        expect(notices[0].label).toContain('2 sin calificar');
    });
});

describe('detectPeriodClosingSoon', () => {
    const periods: EvaluationPeriod[] = [
        { id: 'p1', name: '1ª Evaluación', startDate: '2026-09-01', endDate: '2026-11-24' }, // cierra en 4 días
        { id: 'p2', name: '2ª Evaluación', startDate: '2026-11-25', endDate: '2027-03-01' },
    ];

    it('flags the active period closing within the window with pending grades', () => {
        const cls = classData({
            assignments: [assignment({ id: 'a1', evaluationPeriodId: 'p1' })],
            grades: [],
        });
        const notices = detectPeriodClosingSoon([cls], periods, today);
        expect(notices).toHaveLength(1);
        expect(notices[0].label).toContain('1ª Evaluación');
    });

    it('does not flag when the active period is fully graded', () => {
        const cls = classData({
            assignments: [assignment({ id: 'a1', evaluationPeriodId: 'p1' })],
            grades: [grade({ studentId: 'st1', assignmentId: 'a1' }), grade({ studentId: 'st2', assignmentId: 'a1' })],
        });
        expect(detectPeriodClosingSoon([cls], periods, today)).toEqual([]);
    });

    it('does not flag a period that is not closing soon', () => {
        const farPeriods: EvaluationPeriod[] = [
            { id: 'p1', name: '1ª Evaluación', startDate: '2026-09-01', endDate: '2027-01-01' },
        ];
        const cls = classData({ assignments: [assignment({ evaluationPeriodId: 'p1' })], grades: [] });
        expect(detectPeriodClosingSoon([cls], farPeriods, today)).toEqual([]);
    });
});
