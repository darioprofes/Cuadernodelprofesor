import type { ClassData, Assignment, Grade, AcademicConfiguration, GradeScaleRule, Category } from '../../types';
import { getGradeColorClass } from './shared';

// Helper to calculate a single assignment score based on its grade data and configuration
export const calculateSingleAssignmentScore = (assignment: Assignment, grade: Grade | undefined): number | null => {
    if (!grade || !grade.criterionScores) return null;

    // 1. Recovery Override (Direct)
    // If this is a recovery task itself and has a specific recovery grade
    if (grade.criterionScores['recovery_grade'] != null) {
        return grade.criterionScores['recovery_grade'];
    }

    // 1.5 Direct grade without linked criteria: nota única sin pasar por
    // criterios LOMLOE (p.ej. exámenes puntuales que no se quieren desglosar).
    if (assignment.evaluationMethod === 'direct_grade' && (!assignment.linkedCriteria || assignment.linkedCriteria.length === 0)) {
        return grade.criterionScores['direct_score'] ?? null;
    }

    // 2. Global Tool Mode (Linked Criteria present + Tool used)
    if (assignment.evaluationMethod !== 'direct_grade' && assignment.evaluationToolId && assignment.linkedCriteria && assignment.linkedCriteria.length > 0) {
         // Just take the first one, as they are all uniform in this mode
         const firstLinked = assignment.linkedCriteria[0].criterionId;
         return grade.criterionScores[firstLinked] ?? null;
    }

    // 3. Internal Tool Mode (No linked criteria, score derived from tool items)
    if (assignment.evaluationMethod !== 'direct_grade' && assignment.evaluationToolId) {
        const criterionScores = Object.values(grade.criterionScores).filter((s): s is number => s !== null);
        if (criterionScores.length === 0) return null;
        return criterionScores.reduce((a, b) => a + b, 0) / criterionScores.length;
    }

    // 4. Direct Grade (Weighted average of criteria)
    let totalRatio = 0;
    let weightedSum = 0;
    let hasValidScore = false;

    assignment.linkedCriteria.forEach(lc => {
        const score = grade.criterionScores[lc.criterionId];
        if (score != null) {
            weightedSum += score * lc.ratio;
            totalRatio += lc.ratio;
            hasValidScore = true;
        }
    });

    if (!hasValidScore || totalRatio === 0) return null;
    return weightedSum / totalRatio;
};

export const calculateAssignmentScoresForStudent = (studentId: string, assignments: Assignment[], grades: Grade[]): Map<string, number | null> => {
    const scores = new Map<string, number | null>();
    const gradesMap = new Map<string, Grade>();

    grades.filter(g => g.studentId === studentId).forEach(grade => {
      gradesMap.set(grade.assignmentId, grade);
    });

    for (const assignment of assignments) {
        const grade = gradesMap.get(assignment.id);
        const score = calculateSingleAssignmentScore(assignment, grade);
        scores.set(assignment.id, score);
    }
    return scores;
};

// Media de una categoría para un alumno (motor Categorías): media ponderada
// por `pesoEnCategoria` de sus tareas (las sin peso explícito se reparten a
// partes iguales lo que falte hasta 100%), teniendo en cuenta recuperaciones
// de esa misma evaluación. Se expone aparte de
// calculateEvaluationPeriodGradeForStudent para poder mostrarla como columna
// propia en el Cuaderno, no solo usarla internamente para la nota de la
// evaluación.
export const calculateCategoryAverageForStudent = (studentId: string, classData: ClassData, category: Category): number | null => {
    const { assignments, categories, grades } = classData;

    // Recuperaciones de esa misma evaluación (pueden afectar a tareas de
    // cualquier categoría normal del periodo, no solo de esta).
    const recoveryAssignments = assignments.filter(a => {
        const cat = categories.find(c => c.id === a.categoryId);
        return cat?.type === 'recovery' && a.evaluationPeriodId === category.evaluationPeriodId;
    });
    const recoveryMap = new Map<string, number>();
    recoveryAssignments.forEach(recAssignment => {
        const grade = grades.find(g => g.studentId === studentId && g.assignmentId === recAssignment.id);
        const score = calculateSingleAssignmentScore(recAssignment, grade);
        if (score !== null) {
            (recAssignment.recoversAssignmentIds || []).forEach(recoveredId => {
                const currentRec = recoveryMap.get(recoveredId);
                if (currentRec === undefined || score > currentRec) {
                    recoveryMap.set(recoveredId, score);
                }
            });
        }
    });

    const assignmentsInCategory = assignments.filter(a => a.categoryId === category.id);
    if (assignmentsInCategory.length === 0) return null;

    const scoredAssignments: { assignment: Assignment; score: number }[] = [];
    assignmentsInCategory.forEach(assignment => {
        const grade = grades.find(g => g.studentId === studentId && g.assignmentId === assignment.id);
        let score = calculateSingleAssignmentScore(assignment, grade);
        if (recoveryMap.has(assignment.id)) {
            const recoveryScore = recoveryMap.get(assignment.id)!;
            score = score !== null ? Math.max(score, recoveryScore) : recoveryScore;
        }
        if (score !== null) {
            scoredAssignments.push({ assignment, score });
        }
    });

    if (scoredAssignments.length === 0) return null;

    const explicit = scoredAssignments.filter(s => s.assignment.pesoEnCategoria != null);
    const implicit = scoredAssignments.filter(s => s.assignment.pesoEnCategoria == null);
    const explicitSum = explicit.reduce((sum, s) => sum + (s.assignment.pesoEnCategoria || 0), 0);
    const implicitWeight = implicit.length > 0 ? Math.max(0, 100 - explicitSum) / implicit.length : 0;

    let weightedTaskSum = 0;
    let totalTaskWeight = 0;
    scoredAssignments.forEach(({ assignment, score }) => {
        const weight = assignment.pesoEnCategoria ?? implicitWeight;
        weightedTaskSum += score * weight;
        totalTaskWeight += weight;
    });
    return totalTaskWeight > 0
        ? weightedTaskSum / totalTaskWeight
        : scoredAssignments.reduce((sum, s) => sum + s.score, 0) / scoredAssignments.length;
};

export const calculateEvaluationPeriodGradeForStudent = (studentId: string, classData: ClassData, evaluationPeriodId: string, gradeScale?: GradeScaleRule[]): { grade: number | null; styleClasses: string } => {
    const { categories } = classData;

    const categoriesForPeriod = categories.filter(c => c.evaluationPeriodId === evaluationPeriodId && c.type !== 'recovery');

    let totalCategoryWeight = 0;
    let weightedCategorySum = 0;

    categoriesForPeriod.forEach(category => {
        const categoryAverage = calculateCategoryAverageForStudent(studentId, classData, category);
        if (categoryAverage !== null) {
            weightedCategorySum += categoryAverage * category.weight;
            totalCategoryWeight += category.weight;
        }
    });

    if (totalCategoryWeight === 0) return { grade: null, styleClasses: getGradeColorClass(null, gradeScale) };

    // Normalize result if weights don't add up to 100 (e.g. if one category is empty)
    // weightedCategorySum / totalCategoryWeight gives the weighted average relative to the existing categories
    const finalGrade = weightedCategorySum / totalCategoryWeight;

    return { grade: finalGrade, styleClasses: getGradeColorClass(finalGrade, gradeScale) };
};


export const calculateOverallFinalGradeForStudent = (studentId: string, classData: ClassData, academicConfiguration: AcademicConfiguration): { grade: string; styleClasses: string } => {
    const { evaluationPeriods, evaluationPeriodWeights = {}, gradeScale } = academicConfiguration;

    let totalWeightUsed = 0;
    let weightedSum = 0;

    evaluationPeriods.forEach(period => {
        const periodGradeResult = calculateEvaluationPeriodGradeForStudent(studentId, classData, period.id); // Internal call uses standard or no scale, doesn't matter for numbers
        const periodWeight = evaluationPeriodWeights[period.id];

        if (periodGradeResult.grade !== null && periodWeight !== undefined && periodWeight !== null) {
            weightedSum += periodGradeResult.grade * periodWeight;
            totalWeightUsed += periodWeight;
        }
    });

    if (totalWeightUsed === 0) return { grade: 'N/A', styleClasses: getGradeColorClass(null, gradeScale) };

    const finalGrade = weightedSum / totalWeightUsed;

    return { grade: finalGrade.toFixed(2), styleClasses: getGradeColorClass(finalGrade, gradeScale) };
};
