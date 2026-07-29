import type { ClassData, Course, EvaluationCriterion, SpecificCompetence, KeyCompetence, BasicKnowledge, ProgrammingUnit, AcademicConfiguration, EvaluationTool } from '../types';

// Comprobador de integridad del modelo: recorre las colecciones principales
// del estado en busca de referencias colgantes (ids que ya no existen), ids
// duplicados y desajustes conocidos (p.ej. pesos de criterios que no suman
// 100% con el reparto manual activado). Es puramente de lectura — no
// corrige nada, solo informa — pensado para detectar deriva del modelo
// (datos importados de un backup antiguo, restos de una migración
// incompleta...) antes de que se note como un número raro en el Cuaderno.
export interface HealthCheckIssue {
    severity: 'error' | 'warning';
    area: string;
    message: string;
}

// Solo las colecciones que de verdad hacen falta para comprobar
// integridad referencial — no el AppState completo (tasks/meetings/
// agendaNotes/shortcuts no participan de ninguna relación aquí).
export interface HealthCheckInput {
    classes: ClassData[];
    courses: Course[];
    criteria: EvaluationCriterion[];
    competences: SpecificCompetence[];
    keyCompetences: KeyCompetence[];
    basicKnowledge: BasicKnowledge[];
    programmingUnits: ProgrammingUnit[];
    academicConfiguration: AcademicConfiguration;
    evaluationTools: EvaluationTool[];
}

const findDuplicates = (issues: HealthCheckIssue[], area: string, label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
        if (seen.has(id)) {
            issues.push({ severity: 'error', area, message: `Id duplicado entre ${label}: "${id}".` });
        }
        seen.add(id);
    }
};

export const runHealthCheck = (state: HealthCheckInput): HealthCheckIssue[] => {
    const issues: HealthCheckIssue[] = [];

    const courseIds = new Set(state.courses.map(c => c.id));
    const criteriaIds = new Set(state.criteria.map(c => c.id));
    const competenceIds = new Set(state.competences.map(c => c.id));
    const descriptorIds = new Set(state.keyCompetences.flatMap(kc => (kc.descriptors || []).map(d => d.id)));
    const evaluationToolIds = new Set(state.evaluationTools.map(t => t.id));
    const evaluationPeriodIds = new Set(state.academicConfiguration.evaluationPeriods.map(p => p.id));
    const programmingUnitIds = new Set(state.programmingUnits.map(u => u.id));
    const basicKnowledgeIds = new Set(state.basicKnowledge.map(bk => bk.id));

    findDuplicates(issues, 'General', 'clases', state.classes.map(c => c.id));
    findDuplicates(issues, 'General', 'cursos', state.courses.map(c => c.id));
    findDuplicates(issues, 'Currículo', 'criterios', state.criteria.map(c => c.id));
    findDuplicates(issues, 'Currículo', 'competencias específicas', state.competences.map(c => c.id));

    state.classes.forEach(cls => {
        if (!courseIds.has(cls.courseId)) {
            issues.push({ severity: 'error', area: `Clase ${cls.grupo || cls.id}`, message: `El curso (courseId) al que pertenece ya no existe.` });
        }
    });

    state.criteria.forEach(c => {
        if (!courseIds.has(c.courseId)) issues.push({ severity: 'error', area: 'Currículo', message: `Criterio "${c.code}": el curso al que pertenece ya no existe.` });
        if (!competenceIds.has(c.competenceId)) issues.push({ severity: 'error', area: 'Currículo', message: `Criterio "${c.code}": la competencia específica a la que pertenece ya no existe.` });
    });

    state.competences.forEach(sc => {
        if (!courseIds.has(sc.courseId)) issues.push({ severity: 'error', area: 'Currículo', message: `Competencia específica "${sc.code}": el curso al que pertenece ya no existe.` });
        (sc.keyCompetenceDescriptorIds || []).forEach(id => {
            if (!descriptorIds.has(id)) issues.push({ severity: 'warning', area: 'Currículo', message: `Competencia específica "${sc.code}" enlaza a un descriptor operativo que ya no existe.` });
        });
    });

    state.basicKnowledge.forEach(bk => {
        if (!courseIds.has(bk.courseId)) issues.push({ severity: 'error', area: 'Currículo', message: `Saber básico "${bk.code}": el curso al que pertenece ya no existe.` });
    });

    state.programmingUnits.forEach(u => {
        if (!courseIds.has(u.courseId)) issues.push({ severity: 'error', area: `Programación "${u.name}"`, message: `El curso al que pertenece ya no existe.` });
        (u.linkedCriteriaIds || []).forEach(id => {
            if (!criteriaIds.has(id)) issues.push({ severity: 'warning', area: `Programación "${u.name}"`, message: `Enlaza a un criterio que ya no existe.` });
        });
        (u.linkedBasicKnowledgeIds || []).forEach(id => {
            if (!basicKnowledgeIds.has(id)) issues.push({ severity: 'warning', area: `Programación "${u.name}"`, message: `Enlaza a un saber básico que ya no existe.` });
        });
    });

    state.classes.forEach(cls => {
        const area = `Clase ${cls.grupo || cls.id}`;
        const studentIds = new Set(cls.students.map(s => s.id));
        const categoryIds = new Set(cls.categories.map(c => c.id));
        const assignmentIds = new Set(cls.assignments.map(a => a.id));

        findDuplicates(issues, area, 'alumnado', cls.students.map(s => s.id));
        findDuplicates(issues, area, 'tareas evaluables', cls.assignments.map(a => a.id));

        cls.categories.forEach(cat => {
            if (!evaluationPeriodIds.has(cat.evaluationPeriodId)) {
                issues.push({ severity: 'error', area, message: `Categoría "${cat.name}" apunta a una evaluación que ya no existe.` });
            }
        });

        cls.assignments.forEach(a => {
            if (!categoryIds.has(a.categoryId)) issues.push({ severity: 'error', area, message: `Tarea "${a.name}" apunta a una categoría que ya no existe.` });
            if (!evaluationPeriodIds.has(a.evaluationPeriodId)) issues.push({ severity: 'error', area, message: `Tarea "${a.name}" apunta a una evaluación que ya no existe.` });
            if (a.evaluationToolId && !evaluationToolIds.has(a.evaluationToolId)) issues.push({ severity: 'error', area, message: `Tarea "${a.name}" usa un instrumento de evaluación que ya no existe.` });
            if (a.programmingUnitId && !programmingUnitIds.has(a.programmingUnitId)) issues.push({ severity: 'warning', area, message: `Tarea "${a.name}" apunta a una unidad de programación que ya no existe.` });
            (a.linkedCriteria || []).forEach(lc => {
                if (!criteriaIds.has(lc.criterionId)) issues.push({ severity: 'error', area, message: `Tarea "${a.name}" enlaza a un criterio que ya no existe.` });
            });
            (a.recoversAssignmentIds || []).forEach(id => {
                if (!assignmentIds.has(id)) issues.push({ severity: 'warning', area, message: `Tarea "${a.name}" recupera una tarea que ya no existe.` });
            });
        });

        cls.grades.forEach(g => {
            if (!studentIds.has(g.studentId)) issues.push({ severity: 'error', area, message: `Calificación huérfana: el alumno "${g.studentId}" ya no está en esta clase.` });
            if (!assignmentIds.has(g.assignmentId)) issues.push({ severity: 'error', area, message: `Calificación huérfana: la tarea "${g.assignmentId}" ya no existe en esta clase.` });
        });
    });

    state.courses.forEach(course => {
        if (course.pesoCriteriosManual) {
            const courseCriteria = state.criteria.filter(c => c.courseId === course.id);
            if (courseCriteria.length > 0) {
                const sum = courseCriteria.reduce((s, c) => s + (c.weight ?? 0), 0);
                if (Math.abs(sum - 100) > 0.5) {
                    issues.push({
                        severity: 'warning',
                        area: `Curso ${course.level} - ${course.subject}`,
                        message: `Reparto manual de criterios activado, pero los pesos suman ${sum.toFixed(1)}% en vez de 100%.`,
                    });
                }
            }
        }
    });

    return issues;
};
