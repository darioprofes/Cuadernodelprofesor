import { describe, it, expect } from 'vitest';
import type { ClassData, Category, Assignment, Grade, EvaluationCriterion, Checklist, Rubric } from '../types';
import {
    getImportanceFactor,
    calculateCriterionScoresFromTool,
    calculateSingleAssignmentScore,
    calculateCategoryAverageForStudent,
    getCriterionWeight,
    getMobilizedCriteriaForPeriod,
    calculatePeriodGradeCriterial,
    calculateFinalGradeCriterial,
    calculateStudentCriterionGrades,
    calculateStudentCompetenceGrades,
    countGradesAffectedByTool,
    recalculateGradesForTool,
} from './gradeCalculations';

const criterion = (id: string, weight?: number): EvaluationCriterion => ({
    id, code: id, description: id, competenceId: 'sc1', courseId: 'course1', weight,
});

const directAssignment = (over: Partial<Assignment> = {}): Assignment => ({
    id: 'a1',
    name: 'Tarea',
    categoryId: 'cat1',
    evaluationPeriodId: 'p1',
    evaluationMethod: 'direct_grade',
    linkedCriteria: [],
    ...over,
});

const baseClass = (over: Partial<ClassData> = {}): ClassData => ({
    id: 'class1',
    courseId: 'course1',
    students: [{ id: 's1', name: 'Alumno Uno', acneae: [] }],
    categories: [],
    assignments: [],
    grades: [],
    ...over,
});

describe('getImportanceFactor', () => {
    it('defaults to 1 (normal) when unset', () => {
        expect(getImportanceFactor(directAssignment())).toBe(1);
    });
    it('uses the preset factor for a given level', () => {
        expect(getImportanceFactor(directAssignment({ importancia: 'muy_alta' }))).toBe(2);
        expect(getImportanceFactor(directAssignment({ importancia: 'muy_baja' }))).toBe(0.5);
    });
    it('lets importanciaPersonalizada override the preset', () => {
        expect(getImportanceFactor(directAssignment({ importancia: 'muy_alta', importanciaPersonalizada: 1.1 }))).toBe(1.1);
    });
});

describe('calculateCriterionScoresFromTool', () => {
    it('scores a checklist item as 10/0 weighted by item weight', () => {
        const tool: Checklist = {
            id: 't1', type: 'checklist', name: 'Lista',
            items: [
                { id: 'i1', description: 'i1', weight: 1, linkedCriteriaIds: ['c1'] },
                { id: 'i2', description: 'i2', weight: 1, linkedCriteriaIds: ['c1'] },
            ],
        };
        // one checked (10), one unchecked (0), equal weight -> average 5
        const scores = calculateCriterionScoresFromTool(tool, { i1: true, i2: false });
        expect(scores.c1).toBe(5);
    });

    it('normalizes rubric level points to a 0-10 scale', () => {
        const tool: Rubric = {
            id: 't2', type: 'rubric', name: 'Rúbrica',
            levels: [{ id: 'l1', name: 'Bajo', points: 1 }, { id: 'l2', name: 'Alto', points: 4 }],
            items: [{ id: 'i1', description: 'i1', weight: 1, linkedCriteriaIds: ['c1'], levelDescriptions: {} }],
        };
        const scores = calculateCriterionScoresFromTool(tool, { i1: 'l2' });
        expect(scores.c1).toBe(10); // 4/4 max points -> 10
    });
});

describe('calculateSingleAssignmentScore', () => {
    it('returns null when there is no grade', () => {
        expect(calculateSingleAssignmentScore(directAssignment(), undefined)).toBeNull();
    });

    it('honors an explicit recovery_grade override', () => {
        const grade: Grade = { studentId: 's1', assignmentId: 'a1', criterionScores: { recovery_grade: 9 } };
        expect(calculateSingleAssignmentScore(directAssignment(), grade)).toBe(9);
    });

    it('reads direct_score for a direct_grade assignment with no linked criteria', () => {
        const grade: Grade = { studentId: 's1', assignmentId: 'a1', criterionScores: { direct_score: 7 } };
        expect(calculateSingleAssignmentScore(directAssignment(), grade)).toBe(7);
    });

    it('weights linked criteria by their ratio for a direct_grade assignment', () => {
        const assignment = directAssignment({
            linkedCriteria: [
                { criterionId: 'c1', ratio: 1, selectedDescriptorIds: [] },
                { criterionId: 'c2', ratio: 3, selectedDescriptorIds: [] },
            ],
        });
        const grade: Grade = { studentId: 's1', assignmentId: 'a1', criterionScores: { c1: 4, c2: 8 } };
        // (4*1 + 8*3) / 4 = 7
        expect(calculateSingleAssignmentScore(assignment, grade)).toBe(7);
    });
});

describe('calculateCategoryAverageForStudent (motor Categorías)', () => {
    it('splits equally when no assignment has an explicit pesoEnCategoria', () => {
        const category: Category = { id: 'cat1', name: 'Exámenes', weight: 100, evaluationPeriodId: 'p1' };
        const a1 = directAssignment({ id: 'a1' });
        const a2 = directAssignment({ id: 'a2' });
        const classData = baseClass({
            categories: [category],
            assignments: [a1, a2],
            grades: [
                { studentId: 's1', assignmentId: 'a1', criterionScores: { direct_score: 4 } },
                { studentId: 's1', assignmentId: 'a2', criterionScores: { direct_score: 8 } },
            ],
        });
        expect(calculateCategoryAverageForStudent('s1', classData, category)).toBe(6);
    });

    it('does not zero out unweighted assignments when another has an explicit weight — splits the remainder', () => {
        const category: Category = { id: 'cat1', name: 'Exámenes', weight: 100, evaluationPeriodId: 'p1' };
        // a1 explicitly weighted 80%, a2 and a3 unweighted split the remaining 20% (10% each)
        const a1 = directAssignment({ id: 'a1', pesoEnCategoria: 80 });
        const a2 = directAssignment({ id: 'a2' });
        const a3 = directAssignment({ id: 'a3' });
        const classData = baseClass({
            categories: [category],
            assignments: [a1, a2, a3],
            grades: [
                { studentId: 's1', assignmentId: 'a1', criterionScores: { direct_score: 10 } },
                { studentId: 's1', assignmentId: 'a2', criterionScores: { direct_score: 0 } },
                { studentId: 's1', assignmentId: 'a3', criterionScores: { direct_score: 0 } },
            ],
        });
        // 10*0.8 + 0*0.1 + 0*0.1 = 8
        expect(calculateCategoryAverageForStudent('s1', classData, category)).toBe(8);
    });
});

describe('getCriterionWeight (motor Criterios)', () => {
    const criteria = [criterion('c1', 30), criterion('c2', undefined)];

    it('splits equally among all criteria when repartoIgual is true, ignoring any stored weight', () => {
        expect(getCriterionWeight(criteria[0], criteria, true)).toBe(50);
        expect(getCriterionWeight(criteria[1], criteria, true)).toBe(50);
    });

    it('uses the explicit weight (0 if unset) when repartoIgual is false', () => {
        expect(getCriterionWeight(criteria[0], criteria, false)).toBe(30);
        expect(getCriterionWeight(criteria[1], criteria, false)).toBe(0);
    });
});

describe('getMobilizedCriteriaForPeriod', () => {
    it('only includes criteria with real evidence (a grade) in that period', () => {
        const criteria = [criterion('c1'), criterion('c2')];
        const assignments = [directAssignment({ id: 'a1', evaluationPeriodId: 'p1' })];
        const grades: Grade[] = [{ studentId: 's1', assignmentId: 'a1', criterionScores: { c1: 7 } }];
        const mobilized = getMobilizedCriteriaForPeriod(criteria, assignments, grades, 'p1');
        expect(mobilized.map(c => c.id)).toEqual(['c1']);
    });
});

describe('motor Criterios end-to-end (calculatePeriodGradeCriterial / calculateFinalGradeCriterial)', () => {
    it('weights mobilized criteria by their annual weight, renormalized to just those worked in the period', () => {
        const criteria = [criterion('c1', 75), criterion('c2', 25)];
        const a1 = directAssignment({ id: 'a1', linkedCriteria: [{ criterionId: 'c1', ratio: 1, selectedDescriptorIds: [] }] });
        const classData = baseClass({
            categories: [{ id: 'cat1', name: 'Exámenes', weight: 100, evaluationPeriodId: 'p1' }],
            assignments: [a1],
            grades: [{ studentId: 's1', assignmentId: 'a1', criterionScores: { c1: 8 } }],
        });
        // Only c1 has evidence in p1, so it's the only mobilized criterion -> grade is just c1's grade.
        const result = calculatePeriodGradeCriterial('s1', classData, criteria, 'p1', false);
        expect(result.grade).toBe(8);
    });

    it('returns null for a period with no evidence at all', () => {
        const criteria = [criterion('c1', 100)];
        const classData = baseClass();
        const result = calculatePeriodGradeCriterial('s1', classData, criteria, 'p1', false);
        expect(result.grade).toBeNull();
    });

    it('final grade averages across the whole course, weighting all criteria (not renormalized)', () => {
        const criteria = [criterion('c1'), criterion('c2')]; // reparto igual -> 50/50
        const a1 = directAssignment({ id: 'a1', linkedCriteria: [{ criterionId: 'c1', ratio: 1, selectedDescriptorIds: [] }] });
        const a2 = directAssignment({ id: 'a2', linkedCriteria: [{ criterionId: 'c2', ratio: 1, selectedDescriptorIds: [] }] });
        const classData = baseClass({
            categories: [{ id: 'cat1', name: 'Exámenes', weight: 100, evaluationPeriodId: 'p1' }],
            assignments: [a1, a2],
            grades: [
                { studentId: 's1', assignmentId: 'a1', criterionScores: { c1: 4 } },
                { studentId: 's1', assignmentId: 'a2', criterionScores: { c2: 10 } },
            ],
        });
        const result = calculateFinalGradeCriterial('s1', classData, criteria, true);
        expect(result.grade).toBe(7); // (4+10)/2
    });
});

describe('recalculateGradesForTool (fix: notas obsoletas al editar un instrumento)', () => {
    it('recomputes criterionScores for grades using the edited tool, leaving other grades untouched', () => {
        const tool: Checklist = {
            id: 'tool1', type: 'checklist', name: 'Lista',
            items: [{ id: 'i1', description: 'i1', weight: 1, linkedCriteriaIds: ['c1'] }],
        };
        const toolAssignment = directAssignment({ id: 'a1', evaluationMethod: 'checklist', evaluationToolId: 'tool1' });
        const otherAssignment = directAssignment({ id: 'a2' });
        const classes = [baseClass({
            assignments: [toolAssignment, otherAssignment],
            grades: [
                { studentId: 's1', assignmentId: 'a1', criterionScores: { c1: 0 }, toolResults: { i1: true } },
                { studentId: 's1', assignmentId: 'a2', criterionScores: { direct_score: 5 } }, // no toolResults: untouched
            ],
        })];

        expect(countGradesAffectedByTool(classes, 'tool1')).toBe(1);

        const updated = recalculateGradesForTool(classes, tool);
        const gradeA1 = updated[0].grades.find(g => g.assignmentId === 'a1')!;
        const gradeA2 = updated[0].grades.find(g => g.assignmentId === 'a2')!;

        expect(gradeA1.criterionScores.c1).toBe(10); // checked item recalculated from current tool definition
        expect(gradeA2.criterionScores.direct_score).toBe(5); // untouched, no toolResults
    });

    it('is a no-op for classes with no assignments using that tool', () => {
        const tool: Checklist = { id: 'tool1', type: 'checklist', name: 'Lista', items: [] };
        const classes = [baseClass({ assignments: [directAssignment({ id: 'a1' })], grades: [] })];
        const updated = recalculateGradesForTool(classes, tool);
        expect(updated[0]).toBe(classes[0]); // unchanged reference, no needless copy
    });
});

describe('calculateStudentCompetenceGrades (consistencia con el motor oficial)', () => {
    it('weights criteria within a competence by their annual weight, not a simple average', () => {
        const criteria = [
            { id: 'c1', code: 'c1', description: 'c1', competenceId: 'sc1', courseId: 'course1', weight: 90 },
            { id: 'c2', code: 'c2', description: 'c2', competenceId: 'sc1', courseId: 'course1', weight: 10 },
        ];
        const a1 = directAssignment({ id: 'a1', linkedCriteria: [{ criterionId: 'c1', ratio: 1, selectedDescriptorIds: [] }] });
        const a2 = directAssignment({ id: 'a2', linkedCriteria: [{ criterionId: 'c2', ratio: 1, selectedDescriptorIds: [] }] });
        const classData = baseClass({
            assignments: [a1, a2],
            grades: [
                { studentId: 's1', assignmentId: 'a1', criterionScores: { c1: 10 } },
                { studentId: 's1', assignmentId: 'a2', criterionScores: { c2: 0 } },
            ],
        });
        const grades = calculateStudentCompetenceGrades('s1', classData, criteria, [{ id: 'sc1', code: 'sc1', description: 'sc1', courseId: 'course1', keyCompetenceDescriptorIds: [] }], false);
        // 90%/10% weighted -> (10*90 + 0*10)/100 = 9, not the simple average of 5
        expect(grades.get('sc1')).toBe(9);
    });
});

describe('calculateStudentCriterionGrades', () => {
    it('weights evidence by importancia × ratio, not a simple average', () => {
        const criteria = [criterion('c1')];
        const lowImportance = directAssignment({ id: 'a1', importancia: 'muy_baja', linkedCriteria: [{ criterionId: 'c1', ratio: 1, selectedDescriptorIds: [] }] });
        const highImportance = directAssignment({ id: 'a2', importancia: 'muy_alta', linkedCriteria: [{ criterionId: 'c1', ratio: 1, selectedDescriptorIds: [] }] });
        const classData = baseClass({
            assignments: [lowImportance, highImportance],
            grades: [
                { studentId: 's1', assignmentId: 'a1', criterionScores: { c1: 0 } },
                { studentId: 's1', assignmentId: 'a2', criterionScores: { c1: 10 } },
            ],
        });
        // weights 0.5 and 2 -> (0*0.5 + 10*2) / 2.5 = 8, not the simple average of 5
        const grades = calculateStudentCriterionGrades('s1', classData, criteria);
        expect(grades.get('c1')).toBe(8);
    });
});
