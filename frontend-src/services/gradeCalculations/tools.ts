import type { ClassData, EvaluationTool } from '../../types';

export const calculateToolGlobalScore = (
    tool: EvaluationTool,
    toolResults: Record<string, boolean | string | number>
): number => {
    let totalPoints = 0;
    let maxPoints = 0;

    for (const item of tool.items) {
        const result = toolResults[item.id];

        if (tool.type === 'checklist') {
            // Weight represents relative importance.
            // If result is true, add weight to totalPoints. Max points increases by weight regardless.
            maxPoints += item.weight;
            if (result === true) {
                totalPoints += item.weight;
            }
        } else if (tool.type === 'criterial_exam') {
            // Weight = puntos máximos de la pregunta (no una importancia
            // abstracta). result = puntos obtenidos, acotados a [0, weight]
            // por si se escribe algo fuera de rango.
            maxPoints += item.weight;
            const puntos = typeof result === 'number' ? result : Number(result);
            if (!isNaN(puntos)) {
                totalPoints += Math.max(0, Math.min(puntos, item.weight));
            }
        } else if (tool.type === 'rating_scale' || tool.type === 'rubric') {
            const levelPoints = tool.levels.map(l => l.points);
            const maxLevelPoints = Math.max(...levelPoints, 0);

            // Max possible points for this item is maxLevelPoints * item.weight
            maxPoints += maxLevelPoints * item.weight;

            const levelId = result as string;
            const selectedLevel = tool.levels.find(l => l.id === levelId);
            if (selectedLevel) {
                totalPoints += selectedLevel.points * item.weight;
            }
        }
    }

    if (maxPoints === 0) return 0;

    // Normalize to 0-10 scale
    return (totalPoints / maxPoints) * 10;
};

export const calculateCriterionScoresFromTool = (
    tool: EvaluationTool,
    toolResults: Record<string, boolean | string | number>
): Record<string, number | null> => {
    const criterionTotals: Record<string, { weightedSum: number; totalWeight: number }> = {};

    for (const item of tool.items) {
        const result = toolResults[item.id];
        let itemScore: number | null = null;

        if (tool.type === 'checklist') {
            // Checked = 10, Unchecked = 0
            itemScore = result === true ? 10 : 0;
        } else if (tool.type === 'criterial_exam') {
            const puntos = typeof result === 'number' ? result : Number(result);
            if (!isNaN(puntos) && item.weight > 0) {
                itemScore = (Math.max(0, Math.min(puntos, item.weight)) / item.weight) * 10;
            }
        } else if (tool.type === 'rating_scale' || tool.type === 'rubric') {
            const levelId = result as string;
            const level = tool.levels.find(l => l.id === levelId);
            if (level) {
                const maxPoints = Math.max(...tool.levels.map(l => l.points), 0);
                if (maxPoints > 0) {
                    itemScore = (level.points / maxPoints) * 10;
                } else {
                    itemScore = 0;
                }
            }
        }

        if (itemScore !== null) {
            for (const criterionId of item.linkedCriteriaIds) {
                if (!criterionTotals[criterionId]) {
                    criterionTotals[criterionId] = { weightedSum: 0, totalWeight: 0 };
                }
                criterionTotals[criterionId].weightedSum += itemScore * item.weight;
                criterionTotals[criterionId].totalWeight += item.weight;
            }
        }
    }

    const finalScores: Record<string, number | null> = {};
    for (const criterionId in criterionTotals) {
        const totals = criterionTotals[criterionId];
        if (totals.totalWeight > 0) {
            finalScores[criterionId] = totals.weightedSum / totals.totalWeight;
        }
    }

    return finalScores;
};

// Al editar una EvaluationTool (pesos de ítems, criterios enlazados...) las
// Grade ya guardadas que la usan quedan con un `criterionScores` calculado
// con la definición ANTERIOR del instrumento — es una caché derivada, no un
// dato crudo (el dato crudo es `toolResults`). Se recalcula aquí de forma
// explícita justo después de guardar el instrumento editado, en vez de
// dejar que las notas históricas queden silenciosamente desincronizadas.
export const countGradesAffectedByTool = (classes: ClassData[], toolId: string): number => {
    let count = 0;
    classes.forEach(cls => {
        const assignmentIds = new Set(
            cls.assignments.filter(a => a.evaluationToolId === toolId).map(a => a.id)
        );
        cls.grades.forEach(g => {
            if (assignmentIds.has(g.assignmentId) && g.toolResults) count++;
        });
    });
    return count;
};

export const recalculateGradesForTool = (classes: ClassData[], tool: EvaluationTool): ClassData[] => {
    return classes.map(cls => {
        const assignmentIds = new Set(
            cls.assignments.filter(a => a.evaluationToolId === tool.id).map(a => a.id)
        );
        if (assignmentIds.size === 0) return cls;

        let changed = false;
        const updatedGrades = cls.grades.map(g => {
            if (!assignmentIds.has(g.assignmentId) || !g.toolResults) return g;
            changed = true;
            return { ...g, criterionScores: calculateCriterionScoresFromTool(tool, g.toolResults) };
        });

        return changed ? { ...cls, grades: updatedGrades } : cls;
    });
};
