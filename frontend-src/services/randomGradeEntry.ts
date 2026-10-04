import type { Grade, Student } from '../types';

// Un cero y un "no" de una lista de cotejo son resultados válidos.
// Un mapa de criterios con valores null no significa que haya nota.
export const hasRecordedGrade = (grade: Grade): boolean =>
  Object.values(grade.criterionScores).some(value => typeof value === 'number' && Number.isFinite(value)) ||
  Object.entries(grade.toolResults ?? {}).some(([key, value]) =>
    key === 'questionRoundEntries'
      ? Array.isArray(value) && value.length > 0
      : typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.trim() !== '')
  );

export const getRandomGradeCandidates = (students: Student[], grades: Grade[], assignmentId: string) => {
  const gradedStudentIds = new Set(grades
    .filter(grade => grade.assignmentId === assignmentId && hasRecordedGrade(grade))
    .map(grade => grade.studentId));
  const pendingStudents = students.filter(student => !gradedStudentIds.has(student.id));
  return { gradedStudentIds, pendingStudents, candidates: pendingStudents.length ? pendingStudents : students };
};
