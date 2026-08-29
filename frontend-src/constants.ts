
import type { AcademicConfiguration, EvaluationTool, Shortcut } from './types';
import { isTauri } from '@tauri-apps/api/core';

// Constants for ACNEAE tags and their priority order
export const ACNEAE_TAGS = ['RE ACA', 'RE EC', 'RE', 'PRE ES1', 'PRE ES2', 'PRE ES3', 'PRE ES4', 'PAC', 'PAC EP1', 'PAC EP2', 'PAC EP3', 'PAC EP4', 'PAC EP5', 'PAC EP6', 'ACS', 'FPEX', 'NN', 'ABS'];
export const ACNEAE_ORDER = { 'PAC': 1, 'PRE': 1, 'ABS': 1, 'RE ACA': 2, 'RE EC': 2, 'RE': 3, 'ACS': 1 };

// Semilla: los mismos accesos directos que ya había en la sección "Trabajo"
// del panel (La Marejada), para no empezar desde cero. El usuario puede
// añadir/editar/borrar libremente desde aquí en adelante.
export const INITIAL_SHORTCUTS: Shortcut[] = [
    { id: 'sc-teams', label: 'Teams', url: 'https://teams.microsoft.com', icon: '/shortcut-icons/teams.svg' },
    { id: 'sc-onedrive', label: 'OneDrive', url: 'https://educastur-my.sharepoint.com/my', icon: '/shortcut-icons/onedrive.svg' },
    { id: 'sc-outlook', label: 'Outlook', url: 'https://outlook.office.com', icon: '/shortcut-icons/outlook.svg' },
    { id: 'sc-nube', label: 'Mi nube', url: 'https://nube.lamarejada.es/', icon: '/shortcut-icons/nextcloud.svg' },
    { id: 'sc-notas', label: 'Notas', url: 'https://nube.lamarejada.es/apps/notes/welcome', icon: '/shortcut-icons/notas.svg' },
    { id: 'sc-faltas', label: 'Faltas', url: 'https://profesorado.asturias.es', icon: '/shortcut-icons/faltas.svg' },
    { id: 'sc-sauce', label: 'SAUCE', url: 'https://sauce.asturias.es', icon: '/shortcut-icons/sauce.svg' },
    { id: 'sc-educastur', label: 'Educastur', url: 'https://www.educastur.es', icon: '/shortcut-icons/educastur.svg' },
    { id: 'sc-copilot', label: 'Copilot', url: 'https://copilot.microsoft.com/', icon: '/shortcut-icons/copilot.svg' },
];

// La versión de escritorio es una copia local independiente, sin ningún
// vínculo con la infraestructura propia (nube.lamarejada.es) — no tiene
// sentido sembrarla con accesos directos a esa infraestructura personal.
export const getInitialShortcuts = (): Shortcut[] =>
    isTauri() ? INITIAL_SHORTCUTS.filter(s => !s.url.includes('lamarejada.es')) : INITIAL_SHORTCUTS;

// 4 niveles de valoración compartidos por las rúbricas y escalas de
// valoración genéricas de abajo -- mismo naming ya usado en otros textos
// generados de la app.
const NIVELES_GENERICOS = [
    { id: 'lvl-1', name: 'No conseguido', points: 1 },
    { id: 'lvl-2', name: 'En proceso', points: 2 },
    { id: 'lvl-3', name: 'Conseguido', points: 3 },
    { id: 'lvl-4', name: 'Superado', points: 4 },
];

// Semilla: banco de instrumentos de evaluación genéricos (sin materia ni
// criterios de currículo asignados -- courseId ausente y linkedCriteriaIds
// vacío en todos los ítems), para que el profesor tenga siempre algo
// razonable donde partir aunque no haya generado nada con IA todavía. Igual
// que INITIAL_SHORTCUTS: el usuario puede borrarlos libremente, y
// resetDatabase() los vuelve a sembrar junto con el resto de datos de fábrica.
export const INITIAL_EVALUATION_TOOLS: EvaluationTool[] = [
    {
        id: 'et-rubrica-exposicion-oral',
        type: 'rubric',
        name: 'Rúbrica: Exposición oral',
        levels: NIVELES_GENERICOS,
        items: [
            {
                id: 'item-1', description: 'Contenido y organización de las ideas', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'El contenido es incompleto o confuso, sin una estructura reconocible.',
                    'lvl-2': 'El contenido es correcto pero la estructura (introducción, desarrollo, cierre) es poco clara.',
                    'lvl-3': 'El contenido es completo y está bien organizado, con una estructura clara.',
                    'lvl-4': 'El contenido es completo, bien organizado y aporta ideas propias o ejemplos que enriquecen la exposición.',
                },
            },
            {
                id: 'item-2', description: 'Expresión oral y ritmo', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'Habla en voz muy baja o demasiado rápido/lento, dificultando la comprensión.',
                    'lvl-2': 'Se expresa con claridad en general, aunque con dudas o muletillas frecuentes.',
                    'lvl-3': 'Se expresa con claridad, buen volumen y un ritmo adecuado.',
                    'lvl-4': 'Se expresa con fluidez y seguridad, con un ritmo que mantiene la atención del público.',
                },
            },
            {
                id: 'item-3', description: 'Apoyo visual y material de la exposición', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'No usa apoyo visual, o el que usa no tiene relación con lo expuesto.',
                    'lvl-2': 'Usa apoyo visual, pero con exceso de texto o poco cuidado en el diseño.',
                    'lvl-3': 'El apoyo visual es claro, ordenado y refuerza lo que se explica.',
                    'lvl-4': 'El apoyo visual es claro, original y facilita de verdad la comprensión del público.',
                },
            },
            {
                id: 'item-4', description: 'Interacción con el público y respuesta a preguntas', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'No mira al público ni responde a las preguntas que se le hacen.',
                    'lvl-2': 'Mantiene poco contacto visual y responde con dificultad a las preguntas.',
                    'lvl-3': 'Mantiene contacto visual con el público y responde correctamente a las preguntas.',
                    'lvl-4': 'Implica al público, mantiene contacto visual constante y responde con seguridad y precisión.',
                },
            },
        ],
    },
    {
        id: 'et-rubrica-trabajo-escrito',
        type: 'rubric',
        name: 'Rúbrica: Trabajo escrito / informe',
        levels: NIVELES_GENERICOS,
        items: [
            {
                id: 'item-1', description: 'Contenido y rigor', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'El contenido es incompleto, con errores conceptuales importantes.',
                    'lvl-2': 'El contenido es correcto pero superficial, sin profundizar en las ideas.',
                    'lvl-3': 'El contenido es completo, correcto y desarrollado con rigor.',
                    'lvl-4': 'El contenido es completo, riguroso y va más allá de lo pedido con ideas propias.',
                },
            },
            {
                id: 'item-2', description: 'Organización y estructura', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'No sigue una estructura reconocible (introducción, desarrollo, conclusión).',
                    'lvl-2': 'Sigue una estructura básica, pero con apartados desordenados o incompletos.',
                    'lvl-3': 'Sigue una estructura clara y bien organizada.',
                    'lvl-4': 'La estructura es clara, bien organizada y facilita mucho la lectura.',
                },
            },
            {
                id: 'item-3', description: 'Ortografía y expresión escrita', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'Numerosos errores ortográficos o de expresión que dificultan la comprensión.',
                    'lvl-2': 'Algunos errores ortográficos o de expresión, sin que impidan entender el texto.',
                    'lvl-3': 'Apenas hay errores ortográficos y la expresión es clara.',
                    'lvl-4': 'Sin errores ortográficos, con una expresión escrita clara y cuidada.',
                },
            },
            {
                id: 'item-4', description: 'Uso de fuentes y referencias', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'No usa fuentes, o las usa sin citarlas.',
                    'lvl-2': 'Usa fuentes, pero las cita de forma incompleta o poco clara.',
                    'lvl-3': 'Usa fuentes variadas y las cita correctamente.',
                    'lvl-4': 'Usa fuentes variadas y fiables, citadas correctamente y bien integradas en el texto.',
                },
            },
        ],
    },
    {
        id: 'et-rubrica-trabajo-cooperativo',
        type: 'rubric',
        name: 'Rúbrica: Trabajo cooperativo / en grupo',
        levels: NIVELES_GENERICOS,
        items: [
            {
                id: 'item-1', description: 'Reparto de tareas y organización del grupo', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'No hay un reparto de tareas claro, o no se respeta.',
                    'lvl-2': 'Hay un reparto de tareas, pero desequilibrado o poco definido.',
                    'lvl-3': 'El grupo reparte las tareas de forma clara y equilibrada.',
                    'lvl-4': 'El grupo se organiza de forma clara, equilibrada y se ajusta si surgen problemas.',
                },
            },
            {
                id: 'item-2', description: 'Participación individual', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'No participa en las tareas del grupo o depende por completo de sus compañeros.',
                    'lvl-2': 'Participa de forma irregular, con una implicación baja.',
                    'lvl-3': 'Participa activamente y cumple con la parte que le corresponde.',
                    'lvl-4': 'Participa activamente, cumple su parte y ayuda a que el grupo avance.',
                },
            },
            {
                id: 'item-3', description: 'Comunicación y resolución de conflictos', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'No hay comunicación entre los miembros, o surgen conflictos que no se resuelven.',
                    'lvl-2': 'Hay comunicación básica, con dificultades para resolver los desacuerdos.',
                    'lvl-3': 'Se comunican con claridad y resuelven los desacuerdos que surgen.',
                    'lvl-4': 'Se comunican con claridad, resuelven los desacuerdos y llegan a acuerdos que mejoran el trabajo.',
                },
            },
            {
                id: 'item-4', description: 'Resultado final del trabajo en grupo', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: {
                    'lvl-1': 'El resultado final no cumple lo pedido o está muy incompleto.',
                    'lvl-2': 'El resultado final cumple lo pedido, aunque de forma básica.',
                    'lvl-3': 'El resultado final cumple lo pedido con un buen nivel de calidad.',
                    'lvl-4': 'El resultado final supera lo pedido, con un nivel de calidad notable.',
                },
            },
        ],
    },
    {
        id: 'et-checklist-entrega-tareas',
        type: 'checklist',
        name: 'Lista de cotejo: Entrega y presentación de tareas',
        items: [
            { id: 'item-1', description: 'Entregada dentro del plazo establecido', weight: 1, linkedCriteriaIds: [] },
            { id: 'item-2', description: 'Sigue el formato o las instrucciones pedidas', weight: 1, linkedCriteriaIds: [] },
            { id: 'item-3', description: 'Incluye nombre y datos de identificación', weight: 1, linkedCriteriaIds: [] },
            { id: 'item-4', description: 'Presentación limpia y ordenada', weight: 1, linkedCriteriaIds: [] },
        ],
    },
    {
        id: 'et-checklist-comportamiento',
        type: 'checklist',
        name: 'Lista de cotejo: Comportamiento y participación en clase',
        items: [
            { id: 'item-1', description: 'Trae el material necesario para la clase', weight: 1, linkedCriteriaIds: [] },
            { id: 'item-2', description: 'Respeta el turno de palabra', weight: 1, linkedCriteriaIds: [] },
            { id: 'item-3', description: 'Participa activamente en las actividades propuestas', weight: 1, linkedCriteriaIds: [] },
            { id: 'item-4', description: 'Mantiene una actitud de respeto hacia compañeros y profesorado', weight: 1, linkedCriteriaIds: [] },
        ],
    },
    {
        id: 'et-escala-participacion',
        type: 'rating_scale',
        name: 'Escala de valoración: Participación en clase',
        levels: NIVELES_GENERICOS,
        items: [
            { id: 'item-1', description: 'Interviene de forma espontánea en clase', weight: 1, linkedCriteriaIds: [] },
            { id: 'item-2', description: 'Responde con propiedad cuando se le pregunta directamente', weight: 1, linkedCriteriaIds: [] },
            { id: 'item-3', description: 'Colabora con sus compañeros en las actividades de clase', weight: 1, linkedCriteriaIds: [] },
        ],
    },
    {
        id: 'et-escala-cuaderno',
        type: 'rating_scale',
        name: 'Escala de valoración: Cuaderno o portfolio',
        levels: NIVELES_GENERICOS,
        items: [
            { id: 'item-1', description: 'El cuaderno/portfolio está completo y actualizado', weight: 1, linkedCriteriaIds: [] },
            { id: 'item-2', description: 'Presenta orden y limpieza', weight: 1, linkedCriteriaIds: [] },
            { id: 'item-3', description: 'Incorpora las correcciones indicadas por el profesorado', weight: 1, linkedCriteriaIds: [] },
        ],
    },
];

export const getInitialEvaluationTools = (): EvaluationTool[] => INITIAL_EVALUATION_TOOLS;

// ACADEMIC CONFIGURATION
// Calcula el año de inicio del curso académico en el momento de cargar la app:
// julio-diciembre → el curso arranca ESE año; enero-junio → arrancó el año anterior.
const _ahora = new Date();
const _añoInicio = _ahora.getMonth() >= 6 ? _ahora.getFullYear() : _ahora.getFullYear() - 1;
const _y = String(_añoInicio);
const _ny = String(_añoInicio + 1);

export const INITIAL_ACADEMIC_CONFIGURATION: AcademicConfiguration = {
    academicYearStart: `${_y}-09-09`,
    academicYearEnd: `${_ny}-06-20`,
    holidays: [
        { id: 'h-1', name: 'Vacaciones de Navidad', startDate: `${_y}-12-23`, endDate: `${_ny}-01-07` },
        { id: 'h-2', name: 'Semana Santa', startDate: `${_ny}-04-14`, endDate: `${_ny}-04-21` },
    ],
    evaluationPeriods: [
        { id: 'ep-1', name: '1ª Evaluación', startDate: `${_y}-09-09`, endDate: `${_y}-12-20` },
        { id: 'ep-2', name: '2ª Evaluación', startDate: `${_ny}-01-08`, endDate: `${_ny}-03-28` },
        { id: 'ep-3', name: '3ª Evaluación', startDate: `${_ny}-03-31`, endDate: `${_ny}-06-20` },
    ],
    evaluationPeriodWeights: {
        'ep-1': 1,
        'ep-2': 1,
        'ep-3': 1,
    },
    layoutMode: 'tablet',
    periods: [
        '1ª Hora (8:00-8:55)',
        '2ª Hora (8:55-9:50)',
        'Recreo (9:50-10:20)',
        '3ª Hora (10:20-11:15)',
        '4ª Hora (11:15-12:10)',
        'Recreo (12:10-12:40)',
        '5ª Hora (12:40-13:35)',
        '6ª Hora (13:35-14:30)',
    ],
    defaultStartView: 'hoy',
    defaultCalendarView: 'month',
    gradeScale: [
        { min: 8.5, color: 'blue', label: 'Sobresaliente' },
        { min: 7, color: 'teal', label: 'Notable' },
        { min: 6, color: 'lime', label: 'Bien' },
        { min: 5, color: 'yellow', label: 'Suficiente' },
        { min: 0, color: 'red', label: 'Insuficiente' },
    ],
};
