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
    // Nombre del bloque oficial (p.ej. "Proyecto científico") al que
    // pertenece este saber básico según su letra de código -- null si no
    // se conoce (currículos propios del profesor, saberes sueltos).
    blockName: string | null;
}

export interface BasicKnowledgeInput {
    code: string;
    description: string;
    blockName?: string | null;
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

export interface AcademicYearHoliday {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
}

export interface AcademicYear {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    holidays: AcademicYearHoliday[];
    // Franjas horarias (p.ej. "8:00-8:55"), no tienen id propio — el índice
    // en el array ES el periodIndex que usa todo lo demás (horario, notas
    // del diario...), igual que en el AcademicConfiguration.periods viejo.
    periods: string[];
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
    holidays?: AcademicYearHoliday[];
    periods?: string[];
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
    // NIE = Número de Identificación Escolar (SAUCE), NO el NIE de
    // extranjería (ese vive en `dni`, etiquetado "DNI/NIE" en la ficha).
    // Es la clave real para no duplicar alumnado al reimportar el listado
    // de SAUCE — ver services/sauceImport.ts.
    nie?: string;
    nacionalidad?: string;
    // Rastro de la última importación de SAUCE — ver migración 0011 y
    // ExistingStudentPicker.tsx (filtro por defecto al matricular).
    importedAcademicYearId?: string;
    ultimoCursoSauce?: string;
    ultimaUnidadSauce?: string;
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
    // Solo indica si hay foto (los bytes viajan aparte, ver /photos/{id}).
    fotoContentType?: string;
    createdAt: string;
    updatedAt: string;
}

export type StudentInput = Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'fotoContentType'>;

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

export type TipoFalta = 'R' | 'J' | 'I';

export interface Absence {
    id: string;
    enrollmentId: string;
    date: string;
    periodIndex: number;
    // '' es la marca interna de "se borró en local, pendiente de subir el
    // borrado a Educastur" (ver services/absences.py::delete_absence en el
    // backend) — nunca se manda a mano vía PUT, solo la produce un borrado.
    tipoFalta: TipoFalta | '';
    educasturFaltaId?: number;
    syncedAt?: string;
    syncError?: string;
    updatedAt: string;
}

export interface AbsenceInput {
    date: string;
    periodIndex: number;
    tipoFalta: TipoFalta;
}

export interface SincronizarEducasturInput {
    usuario: string;
    contrasena: string;
    idEmpleado?: number;
    idCentro?: number;
    idPerfil?: number;
}

export interface SincronizarEducasturError {
    absenceId: string;
    alumno: string;
    motivo: string;
}

export interface SincronizarEducasturResult {
    sincronizadas: number;
    errores: SincronizarEducasturError[];
    idEmpleado?: number;
    idCentro?: number;
    idPerfil?: number;
    nombreProfesor?: string;
}

// Fase 6: journalEntries/tasks/meetings/agendaNotes eran las últimas
// entidades que en web seguían gobernadas por el blob (autoguardado vía
// PUT /db) — backend ya las tenía completas desde antes, solo faltaban
// estos hooks.
export interface JournalEntry {
    id: string;
    academicYearId: string;
    classId: string;
    date: string;
    periodIndex: number;
    notes?: string;
}

export interface JournalEntryInput {
    classId: string;
    date: string;
    periodIndex: number;
    notes?: string;
}

// Sin PATCH de classId/date/periodIndex a propósito: cambiar cualquiera de
// los tres es conceptualmente "otra anotación" (esa es la clave de upsert
// del backend, ver services/journal_entries.py), no una edición de esta.
export interface JournalEntryPatch {
    notes?: string;
}

export interface Task {
    id: string;
    academicYearId: string;
    texto: string;
    hecho: boolean;
    fechaInicio?: string;
    fechaFin?: string;
}

export interface TaskInput {
    texto: string;
    hecho?: boolean;
    fechaInicio?: string;
    fechaFin?: string;
}

export interface TaskPatch extends Partial<TaskInput> {}

export interface Meeting {
    id: string;
    academicYearId: string;
    fecha: string;
    hora?: string;
    tipo: 'tutoria' | 'departamento' | 'familia' | 'r_tutores';
    conQuien?: string;
    motivo?: string;
    acuerdos?: string;
    seguimiento?: string;
}

export interface MeetingInput {
    fecha: string;
    hora?: string;
    tipo: Meeting['tipo'];
    conQuien?: string;
    motivo?: string;
    acuerdos?: string;
    seguimiento?: string;
}

export interface MeetingPatch extends Partial<MeetingInput> {}

export interface AgendaNote {
    id: string;
    academicYearId: string;
    fecha: string;
    texto: string;
}

export interface AgendaNoteInput {
    fecha: string;
    texto: string;
}

export interface AgendaNotePatch extends Partial<AgendaNoteInput> {}

// layoutMode/defaultStartView del blob viejo no tienen equivalente aquí a
// propósito — están muertos en el frontend (nada los lee, ver
// App.tsx:529 "ignora academicConfiguration.defaultStartView"), no hacía
// falta darles un hueco nuevo solo por existir en el tipo antiguo.
// GradeScaleRule reutilizado de ../types (no redefinido aquí): mismo campo,
// y así el union literal de "color" no se desincroniza entre los dos sitios.
import type { GradeScaleRule } from '../types';

export interface Preferences {
    defaultCalendarView?: 'month' | 'week' | 'day';
    gradeScale: GradeScaleRule[];
}

export interface PreferencesInput {
    defaultCalendarView?: 'month' | 'week' | 'day';
    gradeScale?: GradeScaleRule[];
}
