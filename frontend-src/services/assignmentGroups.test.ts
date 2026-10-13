import { describe, expect, it } from 'vitest';
import type { Assignment, ClassData, EvaluationCriterion, Grade } from '../types';
import { assignmentColumnBlocks, countedAssignments, deriveGroupGrades, effectiveGroupClass, groupGlobalScore, sortAssignmentColumns } from './assignmentGroups';
import { calculateAssignmentScoresForStudent, calculateCategoryAverageForStudent, calculateStudentCriterionGrades, calculatePeriodGradeCriterial } from './gradeCalculations';

const task = (id: string, extra: Partial<Assignment> = {}): Assignment => ({ id, name: id, categoryId: 'cat', evaluationPeriodId: 'p', evaluationMethod: 'direct_grade', linkedCriteria: [], ...extra });
const group = (ids: string[], extra: Partial<Assignment> = {}) => task('group', { assignmentGroup: { memberIds: ids, color: 'violet' }, ...extra });
const grade = (id: string, scores: Grade['criterionScores'], studentId = 's'): Grade => ({ studentId, assignmentId: id, criterionScores: scores });
const criteria: EvaluationCriterion[] = [{ id: 'c1', code: 'C1', description: '', courseId: 'course', competenceId: 'ce', weight: 80 }, { id: 'c2', code: 'C2', description: '', courseId: 'course', competenceId: 'ce', weight: 20 }];
const cls = (assignments: Assignment[], grades: Grade[]): ClassData => ({ id: 'class', courseId: 'course', students: [], categories: [{ id: 'cat', name: 'Trabajo', weight: 100, evaluationPeriodId: 'p', type: 'normal' }], assignments, grades });

describe('grupos de tareas', () => {
  it('calcula cada criterio con pesos internos y no cuenta las tareas dos veces', () => {
    const assignments = [task('a'), task('b', { importanciaPersonalizada: 2 }), task('exam'), group(['a', 'b'])];
    const grades = [grade('a', { c1: 6 }), grade('b', { c1: 9 }), grade('exam', { c1: 2 })];
    expect(deriveGroupGrades(assignments, grades).find(g => g.assignmentId === 'group')?.criterionScores.c1).toBe(8);
    expect(calculateStudentCriterionGrades('s', cls(assignments, grades), criteria).get('c1')).toBe(5);
    expect(countedAssignments(assignments).map(a => a.id)).toEqual(['exam', 'group']);
  });
  it('la importancia del grupo es independiente del peso de sus tareas', () => {
    const data = cls([task('a', { importanciaPersonalizada: 20 }), task('b', { importanciaPersonalizada: 20 }), group(['a', 'b'], { importanciaPersonalizada: 2 }), task('exam')], [grade('a', { c1: 8 }), grade('b', { c1: 8 }), grade('exam', { c1: 2 })]);
    expect(calculateStudentCriterionGrades('s', data, criteria).get('c1')).toBe(6);
  });
  it('añadir preguntas iguales no aumenta el peso del grupo frente al examen', () => {
    for (const count of [1, 20]) {
      const ids = Array.from({ length: count }, (_, i) => String(i));
      const data = cls([...ids.map(id => task(id)), group(ids), task('exam')], [...ids.map(id => grade(id, { c1: 8 })), grade('exam', { c1: 2 })]);
      expect(calculateStudentCriterionGrades('s', data, criteria).get('c1')).toBe(5);
    }
  });
  it('deduce criterios distintos y normaliza solo las notas disponibles', () => {
    const result = deriveGroupGrades([task('a'), task('b'), group(['a', 'b'])], [grade('a', { c1: 0, c2: null }), grade('b', { c1: null, c2: 9 })]);
    expect(result.find(g => g.assignmentId === 'group')?.criterionScores).toEqual({ c1: 0, c2: 9 });
  });
  it('utiliza también el ratio propio de cada criterio', () => {
    const result = deriveGroupGrades([task('a', { linkedCriteria: [{ criterionId: 'c1', ratio: 3, selectedDescriptorIds: [] }] }), task('b'), group(['a', 'b'])], [grade('a', { c1: 0 }), grade('b', { c1: 8 })]);
    expect(result.find(g => g.assignmentId === 'group')?.criterionScores.c1).toBe(2);
  });
  it('los resultados se recalculan al editar una nota sin reutilizar la nota derivada anterior', () => {
    const assignments = [task('a'), group(['a'])];
    const first = deriveGroupGrades(assignments, [grade('a', { c1: 4 })]);
    const changed = first.map(g => g.assignmentId === 'a' ? grade('a', { c1: 9 }) : g);
    expect(deriveGroupGrades(assignments, changed).find(g => g.assignmentId === 'group')?.criterionScores.c1).toBe(9);
    expect(deriveGroupGrades(assignments, first).filter(g => g.assignmentId === 'group')).toHaveLength(1);
  });
  it('no mezcla alumnos ni evaluaciones y mantiene un grupo sin notas sin calificar', () => {
    const assignments = [task('a'), task('other', { evaluationPeriodId: 'q' }), group(['a', 'other'])];
    const grades = [grade('a', { c1: 4 }), grade('a', { c1: 8 }, 's2'), grade('other', { c1: 10 })];
    const result = deriveGroupGrades(assignments, grades);
    expect(result.find(g => g.assignmentId === 'group' && g.studentId === 's')?.criterionScores.c1).toBe(4);
    expect(result.find(g => g.assignmentId === 'group' && g.studentId === 's2')?.criterionScores.c1).toBe(8);
    expect(deriveGroupGrades([group([])], []).length).toBe(0);
  });
  it('el cómputo por categorías también excluye las tareas internas', () => {
    const data = cls([task('a', { linkedCriteria: [{ criterionId: 'c1', ratio: 1, selectedDescriptorIds: [] }] }), task('b', { linkedCriteria: [{ criterionId: 'c1', ratio: 1, selectedDescriptorIds: [] }] }), group(['a', 'b']), task('exam', { linkedCriteria: [{ criterionId: 'c1', ratio: 1, selectedDescriptorIds: [] }] })], [grade('a', { c1: 6 }), grade('b', { c1: 10 }), grade('exam', { c1: 2 })]);
    expect(calculateCategoryAverageForStudent('s', data, data.categories[0])).toBe(5);
  });
  it('la nota global usa los pesos de criterios de la materia', () => {
    expect(groupGlobalScore(grade('group', { c1: 10, c2: 0 }), criteria, false)).toBe(8);
    expect(groupGlobalScore(grade('group', { c1: 10, c2: 0 }), criteria, true)).toBe(5);
    expect(groupGlobalScore(grade('group', { c1: 10 }), criteria, false)).toBe(10);
  });
  it('los criterios movilizados y la nota de evaluación incluyen resultados derivados', () => {
    const data = cls([task('a'), group(['a'])], [grade('a', { c1: 8, c2: 3 })]);
    expect(calculatePeriodGradeCriterial('s', data, criteria, 'p', false).grade).toBe(7);
  });
  it('disolver el grupo conserva las tareas y devuelve su cómputo individual', () => {
    const data = cls([task('a'), task('b'), group(['a', 'b']), task('exam')], [grade('a', { c1: 6 }), grade('b', { c1: 10 }), grade('exam', { c1: 2 })]);
    expect(calculateStudentCriterionGrades('s', data, criteria).get('c1')).toBe(5);
    expect(calculateStudentCriterionGrades('s', { ...data, assignments: data.assignments.filter(a => a.id !== 'group') }, criteria).get('c1')).toBe(6);
    expect(data.grades).toHaveLength(3);
  });
  it('ordena bloques y subcolumnas sin modificar tareas ni notas', () => {
    const assignments = [task('a', { columnOrder: 1 }), task('b', { columnOrder: 0 }), group(['a', 'b'], { columnOrder: 1 }), task('exam', { columnOrder: 0 })];
    expect(assignmentColumnBlocks(assignments, 'cat').map(block => block.map(a => a.id))).toEqual([['exam'], ['group', 'b', 'a']]);
    expect(assignments[0].columnOrder).toBe(1);
    expect(sortAssignmentColumns([task('a'), task('b')]).map(a => a.id)).toEqual(['a', 'b']);
  });
  it('no duplica notas de grupo al hidratar o calcular de nuevo', () => {
    const data = cls([task('a'), group(['a'])], [grade('a', { c1: 8 })]);
    expect(effectiveGroupClass(data).grades.filter(g => g.assignmentId === 'group')).toHaveLength(1);
    expect(calculateAssignmentScoresForStudent('s', data.assignments, data.grades, criteria).get('group')).toBe(8);
  });
});
