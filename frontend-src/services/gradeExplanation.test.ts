import { describe, expect, it } from 'vitest';
import type { Assignment, ClassData, EvaluationCriterion, Grade, EvaluationTool } from '../types';
import { explainGrade } from './gradeExplanation';
import { calculateFinalGradeCriterial, calculatePeriodGradeCriterial } from './gradeCalculations/criterialEngine';

const task = (id: string, extra: Partial<Assignment> = {}): Assignment => ({ id, name: id, categoryId: 'cat', evaluationPeriodId: 'p', evaluationMethod: 'direct_grade', linkedCriteria: [], ...extra });
const grade = (id: string, scores: Grade['criterionScores'], extra: Partial<Grade> = {}): Grade => ({ studentId: 's', assignmentId: id, criterionScores: scores, ...extra });
const criteria: EvaluationCriterion[] = [{ id: 'c1', code: '1.1', description: '', courseId: 'course', competenceId: 'ce', weight: 80 }, { id: 'c2', code: '2.1', description: '', courseId: 'course', competenceId: 'ce', weight: 20 }];
const cls = (assignments: Assignment[], grades: Grade[]): ClassData => ({ id: 'class', courseId: 'course', students: [], categories: [{ id: 'cat', name: 'Trabajo', weight: 100, evaluationPeriodId: 'p', type: 'normal' }], assignments, grades });

describe('explicación de notas', () => {
  it('reconstruye la nota y los pesos finales sin contar miembros dos veces', () => {
    const data = cls([task('a'), task('b', { importanciaPersonalizada: 2 }), task('group', { importancia: 'baja', assignmentGroup: { memberIds: ['a', 'b'], color: 'violet' } }), task('exam', { importanciaPersonalizada: 7 })], [grade('a', { c1: 0, c2: 8 }), grade('b', { c1: 9 }), grade('exam', { c1: 6 })]);
    const trace = explainGrade('s', data, criteria, true, []);
    expect(trace.grade).toBeCloseTo(calculateFinalGradeCriterial('s', data, criteria, true).grade!);
    expect(trace.criteria[0].evidence.map(e => e.name)).toEqual(['group', 'exam']);
    const group = trace.criteria[0].evidence[0];
    expect(group.score).toBe(6);
    expect(group.share).toBeCloseTo(0.75 / 7.75);
    expect(group.children[1].finalShare).toBeCloseTo(0.5 * 0.75 / 7.75 * 2 / 3);
    expect(trace.criteria[1].evidence[0].share).toBe(1);
    expect(trace.criteria.reduce((s, c) => s + c.contribution, 0)).toBeCloseTo(trace.grade!);
  });
  it('normaliza pesos manuales y omite notas ausentes, conservando ceros', () => {
    const data = cls([task('a'), task('other', { evaluationPeriodId: 'q' })], [grade('a', { c1: 0 }), grade('other', { c2: 10 })]);
    const trace = explainGrade('s', data, criteria, false, [], 'p');
    expect(trace.grade).toBe(calculatePeriodGradeCriterial('s', data, criteria, 'p', false).grade);
    expect(trace.criteria[0].share).toBe(1);
    expect(trace.grade).toBe(0);
    expect(explainGrade('s', data, criteria, false, []).grade).toBeCloseTo(2);
  });
  it('muestra las preguntas del examen con su porcentaje en la nota', () => {
    const tool: EvaluationTool = { id: 't', name: 'Examen', type: 'criterial_exam', items: [{ id: 'i1', description: 'Pregunta 1', weight: 1, linkedCriteriaIds: ['c1'] }, { id: 'i2', description: 'Pregunta 2', weight: 3, linkedCriteriaIds: ['c1'] }] };
    const data = cls([task('exam', { evaluationMethod: 'criterial_exam', evaluationToolId: 't' })], [grade('exam', { c1: 5 }, { toolResults: { i1: 0.5, i2: 1.5 } })]);
    const items = explainGrade('s', data, criteria, true, [tool]).criteria[0].evidence[0].children;
    expect(items.map(i => i.finalShare)).toEqual([0.25, 0.75]);
    expect(items.reduce((s, i) => s + i.score * i.share, 0)).toBe(5);
  });
  it('explica la recuperación que sustituye la media y respeta el motor', () => {
    const data = cls([task('a', { linkedCriteria: [{ criterionId: 'c1', ratio: 1, selectedDescriptorIds: [] }] }), task('r', { categoryId: 'recovery', recoversAssignmentIds: ['a'] })], [grade('a', { c1: 3 }), grade('r', { recovery_grade: 7 })]);
    data.categories.push({ id: 'recovery', name: 'Recuperación', weight: 0, evaluationPeriodId: 'p', type: 'recovery' });
    const trace = explainGrade('s', data, criteria, true, []);
    expect(trace.grade).toBe(calculateFinalGradeCriterial('s', data, criteria, true).grade);
    expect(trace.criteria[0].recovery).toBe('r');
    expect(trace.criteria[0].evidence[0].finalShare).toBe(1);
  });
});
