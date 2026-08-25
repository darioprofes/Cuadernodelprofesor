
export interface OperationalDescriptor {
  id: string;
  code: string;
  description: string;
  // 'eso'|'bachillerato'|null (genérico); solo presente en el backend
  // nuevo (web) — ausente en el blob de escritorio. Ver services/api.ts.
  stage?: 'eso' | 'bachillerato' | null;
}

export interface KeyCompetence {
  id: string;
  code: string;
  description: string;
  descriptors: OperationalDescriptor[];
}

export interface EvaluationCriterion {
  id: string;
  code: string;
  description: string;
  competenceId: string; // Links to SpecificCompetence id
  courseId: string; // Links to Course id
  weight?: number; // % de peso anual dentro de la materia (motor de evaluación por
                    // criterios); si ningún criterio del curso lo tiene definido, se
                    // reparte a partes iguales automáticamente.
  excludeFromWeighting?: boolean; // Con reparto manual activo, un criterio sin peso
                    // cuenta como 0% de forma indistinguible de uno simplemente sin
                    // rellenar todavía — este campo hace explícito que de verdad no debe
                    // contar (en vez de que sea un olvido), y es la única alternativa
                    // válida a rellenar el peso.
}

export interface SpecificCompetence {
  id: string;
  code: string;
  description: string;
  keyCompetenceDescriptorIds: string[]; // Links to OperationalDescriptor ids
  courseId: string; // Links to Course id
}

export interface Tutor {
  nombre?: string;
  relacion?: string; // p.ej. "Madre", "Padre", "Tutor legal"
  telefono?: string;
  email?: string;
}

// Ficha de datos personales del alumno/a. Curso/Grupo no se guardan aquí:
// ya viven en ClassData/Course y se muestran calculados para no duplicar
// datos que puedan quedar desactualizados. Edad se calcula de
// fechaNacimiento, tampoco se guarda.
export interface Student {
  id: string;
  // Id de la matrícula (ENROLLMENT) de esta persona en la clase actual —
  // solo presente en el backend nuevo (web, bloque 5); ausente en el blob
  // de escritorio, donde `id` ya identifica tanto a la persona como a su
  // presencia en la clase (no hay ENROLLMENT separado ahí). Necesario para
  // saber qué matrícula tocar al borrar/mover en el plano/editar campos
  // propios de ENROLLMENT — ver services/apiAdapters.ts.
  enrollmentId?: string;
  nombre?: string;
  primerApellido?: string;
  segundoApellido?: string;
  acneae: string[]; // For educational needs tags: ['RE', 'ACS']
  foto?: string; // data URL (base64), embebida en el propio blob SQLite
  fechaNacimiento?: string; // YYYY-MM-DD
  dni?: string;
  // NIE = Número de Identificación Escolar (SAUCE), NO el NIE de
  // extranjería (ese vive en `dni`, etiquetado "DNI/NIE" en la ficha). Es
  // la clave real para no duplicar alumnado al reimportar el listado de
  // SAUCE — ver services/sauceImport.ts.
  nie?: string;
  nacionalidad?: string;
  telefonoUrgencias?: string;

  tutor1?: Tutor;
  tutor2?: Tutor;

  domicilioDireccion?: string;
  domicilioLocalidad?: string;
  domicilioCodigoPostal?: string;
  domicilioTelefono?: string;

  centroProcedencia?: string;
  haRepetidoCurso?: boolean;
  materiasPendientes?: string;
  programaEspecifico?: string; // p.ej. "Diversificación"

  alergias?: string;
  enfermedadesRelevantes?: string;
  medicacionHabitual?: string;
  intoleranciasAlimentarias?: string;
  observacionesSanitarias?: string;

  neae?: boolean; // Necesidades Específicas de Apoyo Educativo
  neaeDetalle?: string;
  medidasEducativas?: string;

  autorizacionImagen?: boolean;
  autorizacionSalidas?: boolean;

  observacionesTutor?: string; // notas libres del profesor/a-tutor/a

  // Posición en el Plano de la Clase (% del lienzo, 0-100). Ausente = todavía
  // sin colocar, se muestra en una posición de rejilla por defecto hasta que
  // se arrastra por primera vez.
  planoX?: number;
  planoY?: number;
  planoColor?: 'azul' | 'rosa' | 'verde';
}

export interface LinkedCriterion {
    criterionId: string;
    ratio: number;
    selectedDescriptorIds: string[];
}

export interface Category {
  id: string;
  name: string;
  weight: number;
  evaluationPeriodId: string;
  type?: 'normal' | 'recovery';
}

// --- Tipos de Instrumentos de Evaluación ---

export interface EvaluationLevel {
  id: string;
  name: string; // e.g., 'Iniciado', 'En Proceso', 'Conseguido'
  points: number; // e.g., 1, 2, 3
}

export interface BaseEvaluationItem {
  id: string;
  description: string;
  weight: number;
  linkedCriteriaIds: string[];
}

export interface Checklist {
  id: string;
  type: 'checklist';
  name: string;
  // Opcional a propósito -- los instrumentos ya existentes no la tienen
  // (ver migración 0017 web / 0006 escritorio) y agrupar/filtrar por
  // materia no debe exigirla retroactivamente.
  courseId?: string;
  items: BaseEvaluationItem[];
}

export interface RatingScale {
  id: string;
  type: 'rating_scale';
  name: string;
  courseId?: string;
  levels: EvaluationLevel[];
  items: BaseEvaluationItem[];
}

export interface RubricItem extends BaseEvaluationItem {
  levelDescriptions: Record<string, string>; // { levelId: 'Description for this specific level' }
}

export interface Rubric {
  id: string;
  type: 'rubric';
  name: string;
  courseId?: string;
  levels: EvaluationLevel[];
  items: RubricItem[];
}

// Examen criterial: cada ítem es una pregunta, `weight` se reutiliza como
// sus puntos máximos (en vez de una importancia abstracta como en
// checklist/escala) -- el profesor introduce los puntos obtenidos por
// pregunta (no un check ni un nivel) y el motor de cálculo ya existente
// (calculateToolGlobalScore/calculateCriterionScoresFromTool) deriva solo
// la nota global Y la nota por criterio, con la misma media ponderada por
// `weight` que ya usan los demás instrumentos -- sin `levels`, no hace
// falta ninguno.
export interface CriterialExam {
  id: string;
  type: 'criterial_exam';
  name: string;
  courseId?: string;
  items: BaseEvaluationItem[];
}

export type EvaluationTool = Checklist | RatingScale | Rubric | CriterialExam;

// --- Fin de Tipos de Instrumentos ---

// 5 niveles de importancia de una actividad como evidencia de un criterio
// (motor de evaluación por criterios): factor multiplicador, no un reparto
// que deba sumar nada, porque las evidencias de un criterio se acumulan
// durante todo el curso sin un total fijo de antemano.
export type ImportanciaActividad = 'muy_baja' | 'baja' | 'normal' | 'alta' | 'muy_alta';

export interface Assignment {
  id: string;
  name: string;
  // Alias corto opcional para la columna del cuaderno de notas -- si no
  // se pone, la columna muestra `name` (truncado); el nombre real
  // siempre se ve al pasar el ratón por encima.
  shortName?: string;
  categoryId: string;
  evaluationPeriodId: string;
  date?: string; // YYYY-MM-DD

  evaluationMethod: 'direct_grade' | 'checklist' | 'rating_scale' | 'rubric' | 'criterial_exam';
  evaluationToolId?: string; // Links to an EvaluationTool's id

  linkedCriteria: LinkedCriterion[]; // Usado solo para 'direct_grade'
  programmingUnitId?: string; // Links to ProgrammingUnit id
  recoversAssignmentIds?: string[];

  // % de peso de esta tarea frente a las demás de su misma categoría (motor
  // Categorías); ausente = reparto igual entre las que tampoco lo tengan.
  pesoEnCategoria?: number;
  // Importancia como evidencia (motor Criterios); ausente = 'normal' (×1).
  importancia?: ImportanciaActividad;
  // Modo avanzado: sustituye al factor preestablecido de `importancia`.
  importanciaPersonalizada?: number;
}

export interface Grade {
  studentId: string;
  assignmentId: string;
  criterionScores: Record<string, number | null>; // { criterionId: score }. Siempre se calcula y se guarda.
  toolResults?: Record<string, boolean | string | number>; // { itemId: checked } for checklist, { itemId: levelId } for scale/rubric, { itemId: puntosObtenidos } for examen criterial
}

export interface Course {
    id: string;
    level: string; // e.g., '3º ESO', '1º Bachillerato'
    subject: string;
    type?: 'academic' | 'other';
    // Peso anual de los criterios de evaluación (motor de evaluación por
    // criterios): ausente/false = reparto igual automático entre todos los
    // criterios de la materia; true = reparto manual (el profesor introduce
    // el peso de cada criterio, deben sumar 100%).
    pesoCriteriosManual?: boolean;
}

// Una actividad concreta dentro de una sesión de la SA. Todos los campos
// salvo descripcion son opcionales -- una actividad creada a mano rápida no
// tiene por qué rellenar tipo/agrupamiento/duración/recursos.
export interface SessionActivity {
    titulo?: string;
    tipo?: string;
    agrupamiento?: string;
    duracionMin?: number;
    recursos?: string[];
    descripcion: string;
    linkedCriteriaIds?: string[];
    // Opcional -- no toda actividad se califica (una explicación docente no
    // necesita instrumento). Referencia a un EvaluationTool real.
    evaluationToolId?: string;
    // Opcional -- variante o ajuste de esta actividad para atender a la
    // diversidad del grupo (p.ej. apoyo visual, tiempo extra). Vacío si esa
    // actividad no necesita adaptación.
    adaptacion?: string;
}

export interface SessionDetail {
    titulo?: string;
    actividades: SessionActivity[];
    color?: string;
}

export interface FinalProduct {
    incluido: boolean;
    tipo?: string;
    descripcion?: string;
    linkedCriteriaIds?: string[];
    // Referencia a un EvaluationTool real (checklist/escala/rúbrica) de
    // Instrumentos de Evaluación -- no se modela una rúbrica aparte aquí
    // dentro, para no duplicar ese sistema (niveles + ítems) con una
    // versión más pobre.
    evaluationToolId?: string;
}

export interface FinalExamBlock {
    descripcion: string;
    linkedCriteriaIds?: string[];
}

export interface FinalExam {
    incluido: boolean;
    formato?: string;
    bloques?: FinalExamBlock[];
    evaluationToolId?: string;
}

export interface ProgrammingUnit {
    id: string;
    courseId: string;
    name: string;
    sessions: number;
    startDate?: string; // YYYY-MM-DD. Optional fixed start date.
    context?: string; // Situación/contexto de partida de la SA.
    sessionDetails: SessionDetail[];
    linkedCriteriaIds: string[];
    linkedBasicKnowledgeIds: string[];
    linkedSpecificCompetenceIds: string[];
    finalProduct?: FinalProduct;
    finalExam?: FinalExam;
}

export interface ClassData {
  id: string;
  grupo?: string; // p.ej. "S4BD" — separado de la materia, que vive en Course.subject
  courseId: string;
  students: Student[];
  categories: Category[];
  assignments: Assignment[];
  grades: Grade[];
  schedule?: { day: number; periodIndex: number; aula?: string; nota?: string }[]; // 1 for Mon, 2 for Tue, ..., 5 for Fri
  skippedDays?: string[]; // YYYY-MM-DD
  // Icono de la tarjeta de la clase: clave de un icono empaquetado (ver
  // classIcons.ts) o, si empieza por "data:", una imagen propia subida.
  icono?: string;
  // Tono de color (0-360) fijado a mano; ausente = se deriva del hash de la
  // materia (ver getClassAccentColor en utils.ts).
  colorAcento?: number;
  // Posición de la mesa del profesor en el Plano de la Clase (% del lienzo).
  mesaProfesorX?: number;
  mesaProfesorY?: number;
  // Rasgos del grupo (p.ej. "Grupo numeroso", "Alta diversidad de ritmos")
  // -- se cargan automáticamente al generar una SA para esta clase, no se
  // repreguntan cada vez. Editable desde la gestión de la clase.
  caracteristicasGrupo?: string[];
}

// Forma común de una fila de horario extraída de una fuente externa (PDF
// oficial vía ImportScheduleModal.tsx, o plantilla Excel vía
// scheduleWizard.ts) — ambos parseos producen esto, y buildImportPlan() en
// ImportScheduleModal.tsx es el único que sabe convertirlo en materias/
// clases/horario reales.
export interface FilaHorario {
    dia: number; // 0=Lunes ... 4=Viernes
    hora_inicio: string;
    hora_fin: string;
    grupo: string | null;
    asignatura: string;
    aula: string | null;
    ensenanza: string | null; // nivel educativo (p.ej. "4ESOPDC", "1º ESO - Biología y Geología")
}

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  classId: string;
  periodIndex: number; // franja horaria concreta: una clase con varias sesiones el mismo día tiene una anotación por sesión, no una compartida
  notes: string;
}

export interface Task {
  id: string;
  texto: string;
  hecho: boolean;
  fechaInicio?: string; // YYYY-MM-DD, "avisar desde"
  fechaFin?: string; // YYYY-MM-DD, "vence el"
}

// Anotación libre de la Agenda (no evaluable, sin clase asociada): distinta
// de Task (el checklist personal de Hoy) aunque antes compartían el mismo
// almacenamiento — eran conceptualmente cosas distintas.
export interface AgendaNote {
  id: string;
  fecha: string; // YYYY-MM-DD
  texto: string;
}

// Acceso directo del header (icono + tooltip), inspirado en las secciones
// de enlaces editables del panel ("La Marejada") — aquí solo el icono, sin
// texto visible, y editable (añadir/modificar/borrar) desde la propia app.
export interface Shortcut {
  id: string;
  label: string;
  url: string;
  icon?: string; // ruta a /shortcut-icons/... o data URL si es un icono propio
  sortOrder?: number; // solo en el backend nuevo (web); ausente en el blob de escritorio
}

export interface Meeting {
  id: string;
  fecha: string; // YYYY-MM-DD
  hora?: string; // HH:MM
  tipo: 'tutoria' | 'departamento' | 'familia' | 'r_tutores';
  conQuien?: string;
  motivo?: string;
  acuerdos?: string;
  seguimiento?: string;
}

export interface BasicKnowledge {
  id: string;
  courseId: string;
  code: string;
  description: string;
  blockName: string | null;
}

export interface Holiday {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface EvaluationPeriod {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface GradeScaleRule {
    min: number;
    color: 'red' | 'orange' | 'yellow' | 'lime' | 'green' | 'emerald' | 'teal' | 'blue' | 'indigo' | 'violet' | 'gray';
    label?: string;
}

export interface AcademicConfiguration {
  academicYearStart: string; // YYYY-MM-DD
  academicYearEnd: string; // YYYY-MM-DD
  holidays: Holiday[];
  evaluationPeriods: EvaluationPeriod[];
  evaluationPeriodWeights?: Record<string, number>;
  layoutMode?: 'mobile' | 'tablet' | 'desktop';
  periods?: string[];
  defaultStartView?: 'hoy' | 'calendar' | 'gradebook' | 'journal';
  defaultCalendarView?: 'month' | 'week' | 'day';
  gradeScale?: GradeScaleRule[];
  // Rasgos de estilo docente -- se inyectan en el prompt de cada SA
  // generada con IA (ver services/prompts/situacion_aprendizaje.py).
  teacherProfile?: string[];
}

export type View =
  | 'hoy'
  | 'horario'
  | 'gradebook'
  | 'journal'
  | 'meetings'
  | 'exams'
  | 'calendar'
  | 'criteria'
  | 'competences'
  | 'key-competences'
  | 'descriptors'
  | 'curriculum'
  | 'planner'
  | 'evaluation-tools'
  | 'ai-tools';

