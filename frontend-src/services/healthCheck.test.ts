import { describe, it, expect } from 'vitest';
import type { ClassData, Course, EvaluationCriterion } from '../types';
import { runHealthCheck, type HealthCheckInput } from './healthCheck';

const emptyConfig: HealthCheckInput['academicConfiguration'] = {
    academicYearStart: '2026-09-01',
    academicYearEnd: '2027-06-21',
    holidays: [],
    evaluationPeriods: [{ id: 'p1', name: '1ª Ev.', startDate: '2026-09-01', endDate: '2027-01-01' }],
};

const baseInput = (over: Partial<HealthCheckInput> = {}): HealthCheckInput => ({
    classes: [],
    courses: [],
    criteria: [],
    competences: [],
    keyCompetences: [],
    basicKnowledge: [],
    programmingUnits: [],
    academicConfiguration: emptyConfig,
    evaluationTools: [],
    ...over,
});

describe('runHealthCheck', () => {
    it('reports no issues for a coherent, minimal model', () => {
        const course: Course = { id: 'course1', level: '1º ESO', subject: 'Mates' };
        const classData: ClassData = { id: 'class1', courseId: 'course1', students: [], categories: [], assignments: [], grades: [] };
        const issues = runHealthCheck(baseInput({ classes: [classData], courses: [course] }));
        expect(issues).toEqual([]);
    });

    it('flags a class pointing at a course that no longer exists', () => {
        const classData: ClassData = { id: 'class1', courseId: 'missing-course', students: [], categories: [], assignments: [], grades: [] };
        const issues = runHealthCheck(baseInput({ classes: [classData] }));
        expect(issues.some(i => i.message.includes('curso'))).toBe(true);
    });

    it('flags an orphaned grade (assignment deleted but grade left behind)', () => {
        const classData: ClassData = {
            id: 'class1', courseId: 'course1',
            students: [{ id: 's1', nombre: 'Alumno', acneae: [] }],
            categories: [], assignments: [],
            grades: [{ studentId: 's1', assignmentId: 'gone', criterionScores: {} }],
        };
        const course: Course = { id: 'course1', level: '1º ESO', subject: 'Mates' };
        const issues = runHealthCheck(baseInput({ classes: [classData], courses: [course] }));
        expect(issues.some(i => i.message.includes('huérfana') && i.message.includes('tarea'))).toBe(true);
    });

    it('flags duplicate criterion ids', () => {
        const dupe: EvaluationCriterion = { id: 'c1', code: '1.1', description: 'x', competenceId: 'sc1', courseId: 'course1' };
        const issues = runHealthCheck(baseInput({ criteria: [dupe, { ...dupe }] }));
        expect(issues.some(i => i.severity === 'error' && i.message.includes('duplicado'))).toBe(true);
    });

    it('warns when reparto manual is on but weights do not sum to 100', () => {
        const course: Course = { id: 'course1', level: '1º ESO', subject: 'Mates', pesoCriteriosManual: true };
        const criteria: EvaluationCriterion[] = [
            { id: 'c1', code: '1.1', description: 'x', competenceId: 'sc1', courseId: 'course1', weight: 40 },
            { id: 'c2', code: '1.2', description: 'y', competenceId: 'sc1', courseId: 'course1', weight: 40 },
        ];
        const issues = runHealthCheck(baseInput({ courses: [course], criteria }));
        expect(issues.some(i => i.message.includes('no suma 100%') || i.message.includes('suman 80'))).toBe(true);
    });
});
