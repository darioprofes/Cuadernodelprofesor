import type { ClassData, EvaluationCriterion, SpecificCompetence, KeyCompetence, Assignment, Grade, GradeScaleRule, ImportanciaActividad } from '../../types';
import { getGradeColorClass } from './shared';

// Motor de evaluación por criterios: factor multiplicador de la importancia
// de una actividad como evidencia (no es un reparto que deba sumar nada, ya
// que las evidencias de un criterio se acumulan durante todo el curso).
const IMPORTANCE_FACTORS: Record<ImportanciaActividad, number> = {
    muy_baja: 0.5,
    baja: 0.75,
    normal: 1,
    alta: 1.5,
    muy_alta: 2,
};

export const getImportanceFactor = (assignment: Assignment): number => {
    if (assignment.importanciaPersonalizada != null) return assignment.importanciaPersonalizada;
    return IMPORTANCE_FACTORS[assignment.importancia ?? 'normal'];
};

// Ratio de esa actividad concreta para este criterio (LinkedCriterion, ya
// existente para repartir la nota de una tarea entre sus propios criterios
// vinculados); 1 si no aplica (modos de herramienta sin reparto explícito).
const getRatioForCriterion = (assignment: Assignment, criterionId: string): number =>
    assignment.linkedCriteria?.find(lc => lc.criterionId === criterionId)?.ratio ?? 1;

export const calculateStudentCriterionGrades = (
    studentId: string,
    classData: ClassData,
    criteria: EvaluationCriterion[],
    evaluationPeriodId?: string,
): Map<string, number | null> => {
    const { assignments, grades, categories } = classData;

    // 1. Filter assignments and grades for the relevant period and student.
    const relevantAssignments = evaluationPeriodId
        ? assignments.filter(a => a.evaluationPeriodId === evaluationPeriodId)
        : assignments;

    const studentGrades = grades.filter(g => g.studentId === studentId);
    const studentGradesMap = new Map(studentGrades.map(g => [g.assignmentId, g]));

    // 2. Separate assignments into normal and recovery types.
    const normalAssignments = relevantAssignments.filter(a => {
        const category = categories.find(c => c.id === a.categoryId);
        return !category || category.type !== 'recovery';
    });

    const recoveryAssignments = relevantAssignments.filter(a => {
        const category = categories.find(c => c.id === a.categoryId);
        return category?.type === 'recovery' && studentGradesMap.has(a.id);
    });

    const finalCriterionGrades = new Map<string, number | null>();

    // 3. Calculate base grades for each criterion from *normal* assignments:
    // media ponderada de las evidencias (importancia de la actividad × ratio
    // de ese criterio dentro de ella), no una media simple — así una tarea
    // marcada como "Muy alta" cuenta más que una "Baja" a la hora de fijar
    // la valoración del criterio.
    for (const crit of criteria) {
        let weightedSum = 0;
        let totalWeight = 0;
        for (const assignment of normalAssignments) {
            const grade = studentGradesMap.get(assignment.id);
            const score = grade?.criterionScores?.[crit.id];
            if (score != null) {
                const weight = getImportanceFactor(assignment) * getRatioForCriterion(assignment, crit.id);
                weightedSum += score * weight;
                totalWeight += weight;
            }
        }

        if (totalWeight > 0) {
            finalCriterionGrades.set(crit.id, weightedSum / totalWeight);
        } else {
            finalCriterionGrades.set(crit.id, null);
        }
    }

    // 4. Apply recovery grades. A single recovery assignment can improve multiple criteria.
    for (const recoveryAssignment of recoveryAssignments) {
        const recoveryGradeData = studentGradesMap.get(recoveryAssignment.id);
        const recoveryScore = recoveryGradeData?.criterionScores?.['recovery_grade'];

        if (recoveryScore !== null && recoveryScore !== undefined) {
            const recoveredAssignmentIds = new Set(recoveryAssignment.recoversAssignmentIds || []);

            const assignmentsBeingRecovered = assignments.filter(a => recoveredAssignmentIds.has(a.id));

            const criteriaToRecover = new Set<string>();
            assignmentsBeingRecovered.forEach(a => {
                const gradeOfRecoveredAssignment = studentGradesMap.get(a.id);
                if (gradeOfRecoveredAssignment?.criterionScores) {
                    Object.keys(gradeOfRecoveredAssignment.criterionScores).forEach(critId => {
                        if(critId !== 'recovery_grade') criteriaToRecover.add(critId);
                    });
                }
                // Also include criteria linked to the recovered assignment if it was tool-based-global or direct
                if (a.linkedCriteria) {
                    a.linkedCriteria.forEach(lc => criteriaToRecover.add(lc.criterionId));
                }
            });

            criteriaToRecover.forEach(critId => {
                const currentGrade = finalCriterionGrades.get(critId);
                if (currentGrade === null || currentGrade === undefined || recoveryScore > currentGrade) {
                    finalCriterionGrades.set(critId, recoveryScore);
                }
            });
        }
    }

    return finalCriterionGrades;
};

// El peso de cada criterio dentro de su competencia es el mismo peso anual
// del motor oficial (getCriterionWeight), renormalizado solo entre los
// criterios de esa competencia — igual que calculatePeriodGradeCriterial
// renormaliza entre los criterios movilizados. Antes esto era una media
// simple, lo que podía mostrar una valoración de la competencia distinta a
// la que implica la Nota Final oficial del mismo alumno para esos mismos
// criterios.
export const calculateStudentCompetenceGrades = (
    studentId: string,
    classData: ClassData,
    criteria: EvaluationCriterion[],
    competences: SpecificCompetence[],
    repartoIgual: boolean,
    evaluationPeriodId?: string,
): Map<string, number | null> => {
    const studentCriterionGrades = calculateStudentCriterionGrades(studentId, classData, criteria, evaluationPeriodId);
    const competenceGrades = new Map<string, number | null>();

    for (const competence of competences) {
        const criteriaForCompetence = criteria.filter(c => c.competenceId === competence.id);
        if (criteriaForCompetence.length === 0) {
            competenceGrades.set(competence.id, null); continue;
        }

        let weightedSum = 0;
        let totalWeight = 0;
        criteriaForCompetence.forEach(crit => {
            const grade = studentCriterionGrades.get(crit.id);
            if (grade != null) {
                const weight = getCriterionWeight(crit, criteria, repartoIgual);
                weightedSum += grade * weight;
                totalWeight += weight;
            }
        });
        competenceGrades.set(competence.id, totalWeight > 0 ? weightedSum / totalWeight : null);
    }
    return competenceGrades;
};

export const calculateStudentKeyCompetenceGrades = (
    studentId: string,
    classData: ClassData,
    criteria: EvaluationCriterion[],
    competences: SpecificCompetence[],
    keyCompetences: KeyCompetence[],
    repartoIgual: boolean,
    evaluationPeriodId?: string
): Map<string, number | null> => {
    const studentCompetenceGrades = calculateStudentCompetenceGrades(studentId, classData, criteria, competences, repartoIgual, evaluationPeriodId);
    const keyCompetenceGrades = new Map<string, number | null>();

    for (const keyCompetence of keyCompetences) {
        const linkedSpecificCompetences = competences.filter(sc =>
            (sc.keyCompetenceDescriptorIds || []).some(descId =>
                (keyCompetence.descriptors || []).some(desc => desc.id === descId)
            )
        );
        if (linkedSpecificCompetences.length === 0) {
            keyCompetenceGrades.set(keyCompetence.id, null);
            continue;
        }

        const gradesForCompetences = linkedSpecificCompetences
            .map(sc => studentCompetenceGrades.get(sc.id))
            .filter((g): g is number => g !== null && g !== undefined);

        if (gradesForCompetences.length === 0) {
            keyCompetenceGrades.set(keyCompetence.id, null);
            continue;
        }

        const sum = gradesForCompetences.reduce((acc, grade) => acc + grade, 0);
        const average = sum / gradesForCompetences.length;
        keyCompetenceGrades.set(keyCompetence.id, average);
    }
    return keyCompetenceGrades;
};

// ============================================================
// Motor de evaluación por criterios (oficial): la nota de una evaluación y
// del curso se calculan SIEMPRE a partir de los criterios de evaluación,
// nunca directamente de las categorías/actividades. Convive con el motor de
// Categorías (categoryEngine.ts, que se mantiene como comparación/vista
// tradicional).
// ============================================================

// Peso anual de un criterio dentro de la materia: si ningún criterio del
// curso tiene un peso explícito definido, se reparte a partes iguales.
// `repartoIgual` es una opción global por materia (Course.pesoCriteriosManual
// invertido, se configura en Ajustes → Currículo): con reparto igual activo
// (el valor por defecto) todos los criterios de la materia pesan lo mismo,
// ignorando cualquier peso suelto que pudiera haber quedado guardado; con
// reparto manual, cada criterio usa el peso que el profesor haya introducido
// explícitamente, salvo que esté marcado como excluido (`excludeFromWeighting`,
// la única alternativa válida a rellenar un peso — Currículo ya no permite
// guardar un criterio sin peso ni exclusión explícita).
export const getCriterionWeight = (criterion: EvaluationCriterion, allCriteriaOfCourse: EvaluationCriterion[], repartoIgual: boolean): number => {
    if (repartoIgual || allCriteriaOfCourse.length === 0) {
        return allCriteriaOfCourse.length > 0 ? 100 / allCriteriaOfCourse.length : 0;
    }
    if (criterion.excludeFromWeighting) return 0;
    return criterion.weight ?? 0;
};

// Criterios "movilizados" en una evaluación: los que tienen alguna evidencia
// real (una calificación ya introducida) proveniente de una actividad de ese
// periodo, para cualquier alumno de la clase. Se infiere de los datos ya
// existentes — no requiere configurar a mano qué criterios toca cada periodo.
export const getMobilizedCriteriaForPeriod = (
    criteria: EvaluationCriterion[],
    assignments: Assignment[],
    grades: Grade[],
    evaluationPeriodId: string,
): EvaluationCriterion[] => {
    const periodAssignmentIds = new Set(
        assignments.filter(a => a.evaluationPeriodId === evaluationPeriodId).map(a => a.id)
    );
    const mobilizedIds = new Set<string>();
    grades.forEach(g => {
        if (!periodAssignmentIds.has(g.assignmentId)) return;
        Object.entries(g.criterionScores || {}).forEach(([critId, score]) => {
            if (score != null && critId !== 'recovery_grade' && critId !== 'direct_score') {
                mobilizedIds.add(critId);
            }
        });
    });
    return criteria.filter(c => mobilizedIds.has(c.id));
};

// Nota de una evaluación (motor Criterios): media ponderada de los criterios
// movilizados en ese periodo, usando su peso anual re-normalizado solo entre
// esos criterios (los que aún no se han trabajado no restan puntuación).
export const calculatePeriodGradeCriterial = (
    studentId: string,
    classData: ClassData,
    criteria: EvaluationCriterion[], // todos los criterios de la materia
    evaluationPeriodId: string,
    repartoIgual: boolean,
    gradeScale?: GradeScaleRule[],
): { grade: number | null; styleClasses: string } => {
    const mobilized = getMobilizedCriteriaForPeriod(criteria, classData.assignments, classData.grades, evaluationPeriodId);
    if (mobilized.length === 0) {
        return { grade: null, styleClasses: getGradeColorClass(null, gradeScale) };
    }

    const periodCriterionGrades = calculateStudentCriterionGrades(studentId, classData, mobilized, evaluationPeriodId);

    let weightedSum = 0;
    let totalWeight = 0;
    mobilized.forEach(crit => {
        const grade = periodCriterionGrades.get(crit.id);
        if (grade != null) {
            const weight = getCriterionWeight(crit, criteria, repartoIgual);
            weightedSum += grade * weight;
            totalWeight += weight;
        }
    });

    if (totalWeight === 0) {
        return { grade: null, styleClasses: getGradeColorClass(null, gradeScale) };
    }
    const finalGrade = weightedSum / totalWeight;
    return { grade: finalGrade, styleClasses: getGradeColorClass(finalGrade, gradeScale) };
};

// Nota final de curso (motor Criterios): media ponderada de TODOS los
// criterios de la materia, con su peso anual, sin re-normalizar (participan
// todos, a diferencia de una evaluación concreta).
export const calculateFinalGradeCriterial = (
    studentId: string,
    classData: ClassData,
    criteria: EvaluationCriterion[],
    repartoIgual: boolean,
    gradeScale?: GradeScaleRule[],
): { grade: number | null; styleClasses: string } => {
    const criterionGrades = calculateStudentCriterionGrades(studentId, classData, criteria);

    let weightedSum = 0;
    let totalWeight = 0;
    criteria.forEach(crit => {
        const grade = criterionGrades.get(crit.id);
        if (grade != null) {
            const weight = getCriterionWeight(crit, criteria, repartoIgual);
            weightedSum += grade * weight;
            totalWeight += weight;
        }
    });

    if (totalWeight === 0) {
        return { grade: null, styleClasses: getGradeColorClass(null, gradeScale) };
    }
    const finalGrade = weightedSum / totalWeight;
    return { grade: finalGrade, styleClasses: getGradeColorClass(finalGrade, gradeScale) };
};
