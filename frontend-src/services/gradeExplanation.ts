import type { Assignment, ClassData, EvaluationCriterion, EvaluationTool, Grade } from '../types';
import { assignmentGroupOwners, effectiveGroupClass, groupMembers, groupGlobalScore } from './assignmentGroups';
import { calculateStudentCriterionGrades, getCriterionWeight, getMobilizedCriteriaForPeriod } from './gradeCalculations/criterialEngine';
import { calculateSingleAssignmentScore } from './gradeCalculations/categoryEngine';
import { getImportanceFactor } from './gradeCalculations/shared';
import { calculateCriterionScoresFromTool, calculateToolGlobalScore } from './gradeCalculations/tools';

export interface EvidenceExplanation {
  name: string;
  instrument: string;
  score: number;
  weight: number;
  share: number;
  finalShare: number;
  children: EvidenceExplanation[];
}
export interface GradeExplanation {
  grade: number | null;
  criteria: { id: string; code: string; description: string; score: number; weight: number; share: number; contribution: number; evidence: EvidenceExplanation[]; recovery?: string }[];
  omitted: string[];
  note?: string;
}
const ratio = (a: Assignment, id: string) => a.linkedCriteria.find(c => c.criterionId === id)?.ratio ?? 1;

/** Read-only trace of the same decoded grades used by the official engine. */
export function explainGrade(studentId: string, data: ClassData, criteria: EvaluationCriterion[], equal: boolean, tools: EvaluationTool[], periodId?: string, assignmentId?: string): GradeExplanation {
  const effective = effectiveGroupClass(data);
  const target = data.assignments.find(a => a.id === assignmentId);
  const studentGrades = effective.grades.filter(g => g.studentId === studentId);
  const gradeFor = (id: string): Grade | undefined => studentGrades.find(g => g.assignmentId === id);
  const originalGrade = (id: string) => data.grades.find(g => g.studentId === studentId && g.assignmentId === id);
  const owners = assignmentGroupOwners(data.assignments);
  const isRecovery = (a: Assignment) => data.categories.find(c => c.id === a.categoryId)?.type === 'recovery';
  const relevant = effective.assignments.filter(a => !periodId || a.evaluationPeriodId === periodId);
  const available = target ? criteria.filter(c => gradeFor(target.id)?.criterionScores[c.id] != null)
    : periodId ? getMobilizedCriteriaForPeriod(criteria, data.assignments, data.grades, periodId) : criteria;
  const calculated = target ? new Map(Object.entries(gradeFor(target.id)?.criterionScores ?? {})) : calculateStudentCriterionGrades(studentId, data, available, periodId);
  const criterionWeight = (c: EvaluationCriterion) => target
    ? target.assignmentGroup ? getCriterionWeight(c, criteria, equal)
      : target.evaluationMethod !== 'direct_grade' && target.evaluationToolId ? 1 : ratio(target, c.id)
    : getCriterionWeight(c, criteria, equal);
  const active = available.filter(c => calculated.get(c.id) != null);
  const total = active.reduce((sum, c) => sum + criterionWeight(c), 0);

  function evidence(a: Assignment, id: string, share: number, finalShare: number, weight: number): EvidenceExplanation {
    const score = gradeFor(a.id)?.criterionScores[id] ?? 0;
    const tool = tools.find(t => t.id === a.evaluationToolId);
    const node: EvidenceExplanation = { name: a.name, instrument: a.assignmentGroup ? 'Grupo de tareas' : tool?.name ?? 'Calificación directa', score, weight, share, finalShare, children: [] };
    if (a.assignmentGroup) {
      const members = groupMembers(a, data.assignments).filter(m => owners.get(m.id)?.id === a.id && originalGrade(m.id)?.criterionScores[id] != null);
      const sum = members.reduce((s, m) => s + getImportanceFactor(m) * ratio(m, id), 0);
      node.children = members.filter(m => getImportanceFactor(m) * ratio(m, id) > 0).map(m => {
        const w = getImportanceFactor(m) * ratio(m, id);
        return evidence(m, id, w / sum, finalShare * w / sum, w);
      });
    } else if (tool) {
      const results = Object.fromEntries(Object.entries(originalGrade(a.id)?.toolResults ?? {})
        .filter((entry): entry is [string, string | number | boolean] => ['string', 'number', 'boolean'].includes(typeof entry[1])));
      const global = a.linkedCriteria.length > 0;
      const items = tool.items.filter(item => global || item.linkedCriteriaIds.includes(id)).flatMap(item => {
        const single = { ...tool, items: [item] } as EvaluationTool;
        const value = global ? calculateToolGlobalScore(single, results) : calculateCriterionScoresFromTool(single, results)[id];
        return value != null && item.weight > 0 ? [{ item, value }] : [];
      });
      const sum = items.reduce((s, x) => s + x.item.weight, 0);
      node.children = items.map(({ item, value }) => ({ name: item.description, instrument: 'Ítem del instrumento', score: value, weight: item.weight, share: item.weight / sum, finalShare: finalShare * item.weight / sum, children: [] }));
    }
    return node;
  }

  const rows = active.map(c => {
    const score = calculated.get(c.id)!;
    const weight = criterionWeight(c);
    const share = total > 0 ? weight / total : 0;
    const sources = target ? [target] : relevant.filter(a => !isRecovery(a) && gradeFor(a.id)?.criterionScores[c.id] != null);
    const sum = sources.reduce((s, a) => s + (target ? 1 : getImportanceFactor(a) * ratio(a, c.id)), 0);
    let nodes = sources.map(a => { const w = target ? 1 : getImportanceFactor(a) * ratio(a, c.id); return evidence(a, c.id, sum > 0 ? w / sum : 0, sum > 0 ? share * w / sum : 0, getImportanceFactor(a) * ratio(a, c.id)); });
    let recovery: string | undefined;
    if (!target) {
      let base: number | null = sum > 0 ? nodes.reduce((s, n) => s + n.score * n.share, 0) : null;
      for (const a of relevant.filter(isRecovery)) {
        const recovered = data.assignments.filter(x => a.recoversAssignmentIds?.includes(x.id));
        const affects = recovered.some(x => x.linkedCriteria.some(l => l.criterionId === c.id) || gradeFor(x.id)?.criterionScores[c.id] !== undefined);
        const value = gradeFor(a.id)?.criterionScores.recovery_grade;
        if (affects && value != null && (base == null || value > base)) {
          base = value;
          recovery = a.name;
          nodes = [{ name: a.name, instrument: 'Recuperación: sustituye la media anterior', score: value, weight: 1, share: 1, finalShare: share, children: [] }];
        }
      }
    }
    return { id: c.id, code: c.code, description: c.description, score, weight, share, contribution: score * share, evidence: nodes, recovery };
  });
  const grade = target ? target.assignmentGroup ? groupGlobalScore(gradeFor(target.id), criteria, equal) : calculateSingleAssignmentScore(target, gradeFor(target.id))
    : total > 0 ? rows.reduce((s, r) => s + r.contribution, 0) : null;
  const owner = target ? owners.get(target.id) : undefined;
  return { grade, criteria: rows, omitted: available.filter(c => calculated.get(c.id) == null).map(c => c.code), note: target ? target.assignmentGroup ? `Las tareas interiores aportan al grupo. El grupo cuenta una sola vez en la evaluación, con importancia ${getImportanceFactor(target)}.` : `Importancia de la tarea: ${getImportanceFactor(target)}. ${owner ? `Aporta al grupo «${owner.name}», que cuenta una sola vez en la evaluación.` : 'Esta importancia se aplica al combinarla con otras evidencias de cada criterio.'}` : 'Los pesos se normalizan entre los criterios con nota de este alumno. Una evidencia única aporta el 100 % de su criterio, aunque su importancia sea baja.' };
}
