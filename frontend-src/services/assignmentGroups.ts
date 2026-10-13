import type { Assignment, ClassData, EvaluationCriterion, Grade } from '../types';
import { getImportanceFactor } from './gradeCalculations/shared';

export const groupMembers = (group: Assignment, assignments: Assignment[]): Assignment[] =>
  (group.assignmentGroup?.memberIds ?? []).map(id => assignments.find(a => a.id === id))
    .filter((a): a is Assignment => !!a && !a.assignmentGroup && a.id !== group.id && a.evaluationPeriodId === group.evaluationPeriodId);

export const assignmentGroupOwners = (assignments: Assignment[]): Map<string, Assignment> => {
  const owners = new Map<string, Assignment>();
  assignments.filter(a => a.assignmentGroup).forEach(group => groupMembers(group, assignments).forEach(member => {
    if (!owners.has(member.id)) owners.set(member.id, group);
  }));
  return owners;
};

export const countedAssignments = (assignments: Assignment[]): Assignment[] => {
  const owners = assignmentGroupOwners(assignments);
  return assignments.filter(a => !owners.has(a.id));
};

export const deriveGroupGrades = (assignments: Assignment[], grades: Grade[]): Grade[] => {
  const result = grades.filter(g => !assignments.find(a => a.id === g.assignmentId)?.assignmentGroup);
  const students = new Set(result.map(g => g.studentId));
  const map = new Map(result.map(g => [`${g.studentId}:${g.assignmentId}`, g]));
  const owners = assignmentGroupOwners(assignments);
  for (const group of assignments.filter(a => a.assignmentGroup)) {
    const members = groupMembers(group, assignments).filter(a => owners.get(a.id)?.id === group.id);
    for (const studentId of students) {
      const sums = new Map<string, { sum: number; weight: number }>();
      for (const member of members) {
        const scores = map.get(`${studentId}:${member.id}`)?.criterionScores ?? {};
        for (const [criterionId, score] of Object.entries(scores)) {
          if (criterionId === 'recovery_grade' || typeof score !== 'number' || !Number.isFinite(score)) continue;
          const ratio = member.linkedCriteria.find(link => link.criterionId === criterionId)?.ratio ?? 1;
          const weight = getImportanceFactor(member) * ratio;
          if (!(weight > 0)) continue;
          const previous = sums.get(criterionId) ?? { sum: 0, weight: 0 };
          sums.set(criterionId, { sum: previous.sum + score * weight, weight: previous.weight + weight });
        }
      }
      const scores = Object.fromEntries([...sums].map(([id, value]) => [id, value.sum / value.weight]));
      if (Object.keys(scores).length) result.push({ studentId, assignmentId: group.id, criterionScores: scores });
    }
  }
  return result;
};

export const effectiveGroupClass = (classData: ClassData): ClassData => ({
  ...classData,
  assignments: countedAssignments(classData.assignments),
  grades: deriveGroupGrades(classData.assignments, classData.grades),
});

export const groupGlobalScore = (grade: Grade | undefined, criteria: EvaluationCriterion[] = [], equal = true): number | null => {
  const scores = Object.entries(grade?.criterionScores ?? {}).filter(([id, score]) =>
    id !== 'direct_score' && typeof score === 'number' && Number.isFinite(score));
  if (!scores.length) return grade?.criterionScores.direct_score ?? null;
  let sum = 0, total = 0;
  for (const [id, score] of scores) {
    const criterion = criteria.find(c => c.id === id);
    const weight = equal || !criteria.length ? 1 : criterion?.excludeFromWeighting ? 0 : criterion?.weight ?? 0;
    sum += score! * weight; total += weight;
  }
  return total > 0 ? sum / total : null;
};

export const sortAssignmentColumns = (assignments: Assignment[]): Assignment[] => [...assignments].sort((a, b) => {
  // El orden original queda como desempate estable para tareas anteriores.
  if (a.columnOrder == null && b.columnOrder == null) return 0;
  if (a.columnOrder == null) return 1;
  if (b.columnOrder == null) return -1;
  return a.columnOrder - b.columnOrder;
});

export const assignmentColumnBlocks = (assignments: Assignment[], categoryId: string): Assignment[][] =>
  sortAssignmentColumns(countedAssignments(assignments).filter(a => a.categoryId === categoryId))
    .map(a => a.assignmentGroup ? [a, ...sortAssignmentColumns(groupMembers(a, assignments))] : [a]);

export const GROUP_COLORS = {
  blue: { header: '#bfdbfe', result: '#dbeafe', child: '#eff6ff' },
  violet: { header: '#ddd6fe', result: '#ede9fe', child: '#f5f3ff' },
  emerald: { header: '#a7f3d0', result: '#d1fae5', child: '#ecfdf5' },
  amber: { header: '#fde68a', result: '#fef3c7', child: '#fffbeb' },
};
