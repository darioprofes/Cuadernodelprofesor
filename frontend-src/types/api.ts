// Tipos de respuesta/petición del backend granular nuevo (ver
// fase-0-ddl-y-api.md), regla mecánica snake_case→camelCase. Deliberadamente
// separados de ../types.ts: ese fichero sigue siendo la forma del blob
// antiguo (todavía en uso, tanto en escritorio como en las partes de la web
// aún no migradas — ver plan, "Fase 5 fusionada"), y varias de estas
// entidades tienen forma distinta a su equivalente viejo (p.ej. Student aquí
// es la persona global, no un registro embebido en una clase). Donde un
// fichero necesite ambas versiones a la vez durante la transición, importar
// con alias (`import type { Course as ApiCourse } from '../types/api'`).

// ---- Referencia / currículo ----

export interface Course {
    id: string;
    level: string;
    subject: string;
    type: 'academic' | 'other';
    pesoCriteriosManual: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface CourseInput {
    level: string;
    subject: string;
    type?: 'academic' | 'other';
    pesoCriteriosManual?: boolean;
}

export interface CoursePatch extends Partial<CourseInput> {
    expectedUpdatedAt?: string;
}

export interface OperationalDescriptor {
    id: string;
    keyCompetenceId: string;
    code: string;
    description: string;
    // null = descriptor genérico, sin variante por etapa.
    stage?: 'eso' | 'bachillerato' | null;
}

export interface OperationalDescriptorInput {
    code: string;
    description: string;
    stage?: 'eso' | 'bachillerato' | null;
}

export interface KeyCompetence {
    id: string;
    code: string;
    description: string;
    descriptors: OperationalDescriptor[];
}

export interface KeyCompetenceInput {
    code: string;
    description: string;
}

export interface SpecificCompetence {
    id: string;
    courseId: string;
    code: string;
    description: string;
    keyCompetenceDescriptorIds: string[];
}

export interface SpecificCompetenceInput {
    code: string;
    description: string;
}

export interface EvaluationCriterion {
    id: string;
    courseId: string;
    competenceId: string;
    code: string;
    description: string;
    weight?: number;
    excludeFromWeighting: boolean;
}

export interface EvaluationCriterionInput {
    competenceId: string;
    code: string;
    description: string;
    weight?: number;
    excludeFromWeighting?: boolean;
}

export interface BasicKnowledge {
    id: string;
    courseId: string;
    code: string;
    description: string;
}

export interface BasicKnowledgeInput {
    code: string;
    description: string;
}

export interface ProgrammingUnit {
    id: string;
    courseId: string;
    name: string;
    sessions: number;
    startDate?: string;
    sessionDetails: unknown[];
    linkedCriteriaIds: string[];
    linkedBasicKnowledgeIds: string[];
    createdAt: string;
    updatedAt: string;
}

export interface ProgrammingUnitInput {
    name: string;
    sessions?: number;
    startDate?: string;
    sessionDetails?: unknown[];
    linkedCriteriaIds?: string[];
    linkedBasicKnowledgeIds?: string[];
}

// ---- Instancia por curso académico ----

export interface EvaluationPeriod {
    id: string;
    academicYearId: string;
    name: string;
    startDate: string;
    endDate: string;
    weight: number;
}

export interface EvaluationPeriodInput {
    name: string;
    startDate: string;
    endDate: string;
    weight?: number;
}

export interface EvaluationPeriodPatch extends Partial<EvaluationPeriodInput> {}

export interface AcademicYear {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    holidays: unknown[];
    periods: unknown[];
}

export interface AcademicYearInput {
    label: string;
    startDate: string;
    endDate: string;
}

export interface AcademicYearPatch {
    label?: string;
    startDate?: string;
    endDate?: string;
    holidays?: unknown[];
    periods?: unknown[];
}

// Declara "imparto esta materia (course) este curso académico" — ver Fase 8
// del plan. Sin contenido propio más allá de la relación: nombre/currículo
// de la materia siguen en Course, fechas/holidays en AcademicYear.
export interface AcademicYearCourse {
    id: string;
    academicYearId: string;
    courseId: string;
    createdAt: string;
}

export interface AcademicYearCourseInput {
    courseId: string;
}

export interface ClassData {
    id: string;
    academicYearId: string;
    courseId: string;
    grupo?: string;
    schedule: unknown[];
    skippedDays: unknown[];
    icono?: string;
    colorAcento?: number;
    mesaProfesorX?: number;
    mesaProfesorY?: number;
    createdAt: string;
    updatedAt: string;
}

export interface ClassInput {
    courseId: string;
    grupo?: string;
    schedule?: unknown[];
    skippedDays?: unknown[];
    icono?: string;
    colorAcento?: number;
    mesaProfesorX?: number;
    mesaProfesorY?: number;
}

export interface ClassPatch extends Partial<ClassInput> {
    expectedUpdatedAt?: string;
}

export interface Tutor {
    nombre?: string;
    relacion?: string;
    telefono?: string;
    email?: string;
}

// Persona global — a diferencia de ../types.ts::Student (embebido por
// clase), esta existe con independencia de cualquier matrícula.
export interface Student {
    id: string;
    nombre?: string;
    primerApellido?: string;
    segundoApellido?: string;
    fechaNacimiento?: string;
    dni?: string;
    telefonoUrgencias?: string;
    tutor1?: Tutor;
    tutor2?: Tutor;
    domicilioDireccion?: string;
    domicilioLocalidad?: string;
    domicilioCodigoPostal?: string;
    domicilioTelefono?: string;
    alergias?: string;
    enfermedadesRelevantes?: string;
    medicacionHabitual?: string;
    intoleranciasAlimentarias?: string;
    observacionesSanitarias?: string;
    autorizacionImagen?: boolean;
    autorizacionSalidas?: boolean;
    createdAt: string;
    updatedAt: string;
}

export type StudentInput = Omit<Student, 'id' | 'createdAt' | 'updatedAt'>;

export interface StudentPatch extends Partial<StudentInput> {
    expectedUpdatedAt?: string;
}

export interface Enrollment {
    id: string;
    studentId: string;
    classId: string;
    acneae: string[];
    centroProcedencia?: string;
    haRepetidoCurso?: boolean;
    materiasPendientes?: string;
    programaEspecifico?: string;
    neae?: boolean;
    neaeDetalle?: string;
    medidasEducativas?: string;
    observacionesTutor?: string;
    planoX?: number;
    planoY?: number;
    planoColor?: string;
    createdAt: string;
    updatedAt: string;
}

// Exactamente uno de studentId (matricula a alguien ya existente) o
// newStudent (da de alta la persona y la matrícula en un solo paso) — el
// backend rechaza con 400 si se mandan ambos o ninguno.
export type EnrollmentInput =
    | ({ studentId: string; newStudent?: undefined } & EnrollmentFields)
    | ({ studentId?: undefined; newStudent: StudentInput } & EnrollmentFields);

interface EnrollmentFields {
    acneae?: string[];
    centroProcedencia?: string;
    haRepetidoCurso?: boolean;
    materiasPendientes?: string;
    programaEspecifico?: string;
    neae?: boolean;
    neaeDetalle?: string;
    medidasEducativas?: string;
    observacionesTutor?: string;
    planoX?: number;
    planoY?: number;
    planoColor?: string;
}

export interface EnrollmentPatch extends Partial<EnrollmentFields> {
    expectedUpdatedAt?: string;
}

export interface Category {
    id: string;
    classId: string;
    evaluationPeriodId: string;
    name: string;
    weight: number;
    type: 'normal' | 'recovery';
}

export interface CategoryInput {
    evaluationPeriodId: string;
    name: string;
    weight: number;
    type?: 'normal' | 'recovery';
}

export interface CategoryPatch extends Partial<CategoryInput> {}

export interface LinkedCriterion {
    criterionId: string;
    ratio: number;
    selectedDescriptorIds: string[];
}

export interface Assignment {
    id: string;
    classId: string;
    categoryId: string;
    evaluationPeriodId: string;
    evaluationToolId?: string;
    programmingUnitId?: string;
    name: string;
    date?: string;
    evaluationMethod: 'direct_grade' | 'checklist' | 'rating_scale' | 'rubric';
    linkedCriteria: LinkedCriterion[];
    recoversAssignmentIds: string[];
    pesoEnCategoria?: number;
    importancia?: string;
    importanciaPersonalizada?: number;
    createdAt: string;
    updatedAt: string;
}

export interface AssignmentInput {
    categoryId: string;
    evaluationPeriodId: string;
    evaluationToolId?: string;
    programmingUnitId?: string;
    name: string;
    date?: string;
    evaluationMethod: 'direct_grade' | 'checklist' | 'rating_scale' | 'rubric';
    linkedCriteria?: LinkedCriterion[];
    recoversAssignmentIds?: string[];
    pesoEnCategoria?: number;
    importancia?: string;
    importanciaPersonalizada?: number;
}

export interface AssignmentPatch extends Partial<AssignmentInput> {
    expectedUpdatedAt?: string;
}

export interface Grade {
    enrollmentId: string;
    assignmentId: string;
    directScore?: number;
    recoveryScore?: number;
    toolResults?: Record<string, unknown>;
    updatedAt: string;
}

export interface GradeInput {
    directScore?: number;
    recoveryScore?: number;
    toolResults?: Record<string, unknown>;
}
