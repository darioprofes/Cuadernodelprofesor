import { describe, expect, it } from 'vitest';
import type { Grade, Student } from '../types';
import { getRandomGradeCandidates, hasRecordedGrade } from './randomGradeEntry';

const grade = (criterionScores: Grade['criterionScores'], toolResults?: Grade['toolResults']): Grade =>
  ({ studentId: 'a', assignmentId: 'activity', criterionScores, toolResults });
const students = [{ id: 'a' }, { id: 'b' }] as Student[];

describe('selección aleatoria para calificar', () => {
  it('considera pendiente una nota vacía, null o no finita', () => {
    expect(hasRecordedGrade(grade({ c: null }))).toBe(false);
    expect(hasRecordedGrade(grade({ c: NaN }, { item: '' }))).toBe(false);
  });
  it('reconoce ceros, casillas negativas y niveles de rúbrica sin criterios vinculados', () => {
    expect(hasRecordedGrade(grade({ direct_score: 0 }))).toBe(true);
    expect(hasRecordedGrade(grade({}, { item: false }))).toBe(true);
    expect(hasRecordedGrade(grade({}, { item: 0 }))).toBe(true);
    expect(hasRecordedGrade(grade({}, { item: 'nivel1' }))).toBe(true);
  });
  it('prioriza alumnado pendiente solo de la actividad elegida', () => {
    const result = getRandomGradeCandidates(students, [grade({}, { item: false }),
      { ...grade({ direct_score: 8 }), studentId: 'b', assignmentId: 'other' }], 'activity');
    expect(result.candidates.map(student => student.id)).toEqual(['b']);
  });
  it('permite repetir entre todos cuando están calificados y maneja grupos vacíos', () => {
    const grades = students.map(student => ({ ...grade({ direct_score: 0 }), studentId: student.id }));
    expect(getRandomGradeCandidates(students, grades, 'activity').candidates).toEqual(students);
    expect(getRandomGradeCandidates([], grades, 'activity').candidates).toEqual([]);
  });
});
