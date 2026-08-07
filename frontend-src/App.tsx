
// FIX: Corrected the React import statement.
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { api } from './services/api';
import { useShortcuts, useCreateShortcut, useUpdateShortcut, useDeleteShortcut } from './hooks/useShortcuts';
import { useEvaluationTools, useCreateEvaluationTool, useUpdateEvaluationTool, useDeleteEvaluationTool } from './hooks/useEvaluationTools';
import {
    useKeyCompetences, useCreateKeyCompetence, useUpdateKeyCompetence, useDeleteKeyCompetence,
    useCreateDescriptor, useUpdateDescriptor, useDeleteDescriptor,
} from './hooks/useKeyCompetences';
import { useCourses, useUpdateCourse } from './hooks/useCourses';
import { useAcademicYears, useCurrentAcademicYear, useActivateAcademicYear, useEvaluationPeriods, useAcademicYearCourses, useUpdateAcademicYear } from './hooks/useAcademicYears';
import { useApiClasses } from './hooks/useApiClasses';
import { useApiStudents } from './hooks/useApiStudents';
import { useEnrollmentsForClasses } from './hooks/useEnrollments';
import { useCategoriesForClasses } from './hooks/useCategories';
import { useAssignmentsForClasses, useCreateAssignment } from './hooks/useAssignments';
import { useGradesForClasses } from './hooks/useGrades';
import { useEvaluationCriteria, useEvaluationCriteriaForCourses } from './hooks/useEvaluationCriteria';
import { useSpecificCompetences, useSpecificCompetencesForCourses } from './hooks/useSpecificCompetences';
import { useBasicKnowledgeForCourses } from './hooks/useBasicKnowledge';
import { useProgrammingUnitsForCourses } from './hooks/useProgrammingUnits';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from './hooks/useTasks';
import { useMeetings, useCreateMeeting, useUpdateMeeting, useDeleteMeeting } from './hooks/useMeetings';
import { useJournalEntries, useSaveJournalEntry } from './hooks/useJournalEntries';
import { useAgendaNotes, useCreateAgendaNote, useUpdateAgendaNote, useDeleteAgendaNote } from './hooks/useAgendaNotes';
import { usePreferences, useUpdatePreferences } from './hooks/usePreferences';
import { hydrateClassData, diffAndSyncList } from './services/apiAdapters';
import { INITIAL_ACADEMIC_CONFIGURATION, getInitialShortcuts } from './constants';
import type { ClassData, EvaluationCriterion, SpecificCompetence, KeyCompetence, OperationalDescriptor, JournalEntry, ProgrammingUnit, BasicKnowledge, AcademicConfiguration, EvaluationTool, Assignment, Task, Meeting, AgendaNote, Shortcut, View } from './types';
import ShortcutsBar from './components/ShortcutsBar';
import Select from './components/Select';
import IconButton from './components/IconButton';
import GradebookTable from './components/GradebookTable';
// Los 4 informes y Ajustes se cargan bajo demanda (React.lazy): se visitan
// mucho menos que las vistas del día a día (Hoy, Horario, Clases, Cuaderno),
// y Ajustes en concreto arrastra CurriculumManager/ProgrammingManager/
// EvaluationToolManager (>2000 líneas entre los tres) que así ni siquiera
// se descargan hasta que el profesor abre Ajustes por primera vez.
const CriteriaAchievement = React.lazy(() => import('./components/CriteriaAchievement'));
const SpecificCompetenceAchievement = React.lazy(() => import('./components/SpecificCompetenceAchievement'));
const KeyCompetenceAchievement = React.lazy(() => import('./components/KeyCompetenceAchievement'));
const DescriptorAchievement = React.lazy(() => import('./components/DescriptorAchievement'));
// Vista de Materia (Fase 8) — antes solo se cargaban dentro de Ajustes.
const CurriculumManager = React.lazy(() => import('./components/CurriculumManager'));
const ProgrammingManager = React.lazy(() => import('./components/ProgrammingManager'));
import ClassJournal from './components/ClassJournal';
import { Cog8ToothIcon, BookOpenIcon, UsersIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon, ChartBarIcon, CalendarDaysIcon } from './components/Icons';
import PageHeader from './components/PageHeader';
const SettingsModal = React.lazy(() => import('./components/SettingsModal'));
import ExportModal from './components/ExportModal';
import Modal from './components/Modal';
import CalendarTaskModal from './components/CalendarTaskModal';
import CalendarMeetingModal from './components/CalendarMeetingModal';
import QuickJournalModal from './components/QuickJournalModal';
import CalendarView from './components/CalendarView';
import Sidebar from './components/Sidebar';
import HoyView from './components/HoyView';
import HorarioView from './components/HorarioView';
import ReunionesView from './components/ReunionesView';
import ExamenesView from './components/ExamenesView';
import ClassLabel from './components/ClassLabel';
import { formatClassLabel, getClassName, compararCodigo, getSiglas, getMateria } from './utils';
import { backgroundPatternStyle } from './theme/backgroundPattern';

// Copia de seguridad genérica sobre las tablas relacionales (ver
// services/backup.py en web y services/backup.rs en escritorio) — api.ts
// enruta '/backup/export'|'/backup/import' al comando Rust dedicado en
// escritorio y al endpoint REST real en web, así que este código no
// necesita saber en qué plataforma corre.
async function importDatabase(buffer: ArrayBuffer): Promise<void> {
    try {
        const dump = JSON.parse(new TextDecoder().decode(buffer));
        await api.post('/backup/import', dump);
        alert("Copia de seguridad restaurada con éxito. La aplicación se recargará.");
        window.location.reload();
    } catch (e) {
        console.error(e);
        alert(`Error al importar la copia de seguridad: ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function exportDatabase(): Promise<Uint8Array> {
    const dump = await api.get('/backup/export');
    return new TextEncoder().encode(JSON.stringify(dump, null, 2));
}

async function resetDatabase(): Promise<void> {
    const confirmed = window.confirm(
        "¡ADVERTENCIA MÁXIMA! Esta acción es irreversible y eliminará ABSOLUTAMENTE TODOS los datos de la aplicación: clases, alumnos, calificaciones, currículo, planificaciones, TODO. La aplicación quedará completamente en blanco, lista para que introduzcas tus propios datos desde cero. ¿Estás COMPLETAMENTE seguro de que quieres borrar todo?"
    );
    if (!confirmed) {
        return;
    }

    try {
        // Orden: academic_years primero (su DELETE ya borra classes
        // explícitamente antes que el propio año — ver delete_academic_year —
        // así que al llegar aquí no quedan classes/enrollments/categories/
        // assignments/grades/journalEntries/tasks/meetings/agendaNotes
        // colgando); luego courses (cascada su currículo) y keyCompetences
        // (cascada sus descriptores) en cualquier orden entre sí; students al
        // final, ya sin matrículas que los bloqueen (RESTRICT).
        const [years, courses, keyComps, students, tools, oldShortcuts] = await Promise.all([
            api.get<{ id: string }[]>('/academic-years'),
            api.get<{ id: string }[]>('/courses'),
            api.get<{ id: string }[]>('/key-competences'),
            api.get<{ id: string }[]>('/students'),
            api.get<{ id: string }[]>('/evaluation-tools'),
            api.get<{ id: string }[]>('/shortcuts'),
        ]);
        for (const y of years) await api.delete(`/academic-years/${y.id}`);
        await Promise.all(courses.map(c => api.delete(`/courses/${c.id}`)));
        await Promise.all(keyComps.map(k => api.delete(`/key-competences/${k.id}`)));
        await Promise.all(students.map(s => api.delete(`/students/${s.id}`)));
        await Promise.all(tools.map(t => api.delete(`/evaluation-tools/${t.id}`)));
        await Promise.all(oldShortcuts.map(s => api.delete(`/shortcuts/${s.id}`)));
        await Promise.all(getInitialShortcuts().map(({ id: _id, ...s }) => api.post('/shortcuts', s)));
        alert("Todos los datos han sido borrados. La aplicación se recargará.");
        window.location.reload();
    } catch (e) {
        console.error("Failed to reset database:", e);
        alert("Error al restablecer la base de datos.");
    }
}

// Únicas vistas que de verdad usan la clase seleccionada globalmente (el
// selector de la cabecera): el resto de vistas nuevas (Hoy, Horario, Clases,
// Tareas, Reuniones, Exámenes) no dependen de ella, así que no tiene sentido
// mostrarlo ahí.
const REPORT_VIEWS: View[] = ['criteria', 'competences', 'key-competences', 'descriptors'];
// Vista de Materia (Fase 8): currículo y planificación UD, alcanzable desde
// la píldora de Materia de la cabecera en vez de enterrados en Ajustes —
// usan activeCourseId, no la clase seleccionada.
const MATERIA_VIEWS: View[] = ['curriculum', 'planner'];

// Placeholder mientras se descarga el chunk de una vista cargada bajo
// demanda (React.lazy) — los informes y Ajustes, ver los imports de arriba.
const ViewLoadingFallback: React.FC = () => (
    <div className="flex items-center justify-center p-12 text-slate-400 text-sm">
        Cargando…
    </div>
);

const App = () => {
    // Todos los hooks de más abajo (shortcuts, currículo, curso académico,
    // clases/alumnado, cuaderno de notas, diario/tareas/reuniones/agenda)
    // hablan siempre con el backend granular, sin ningún enabled
    // condicional ni rama isDesktop propia aquí: services/api.ts (único
    // sitio que conoce isTauri()) ya sabe despachar al comando Rust
    // api_request en escritorio o a fetch() en web. Ver plan, Fase 7,
    // bloques 2-6.
    const remoteShortcuts = useShortcuts();
    const createShortcut = useCreateShortcut();
    const updateShortcut = useUpdateShortcut();
    const deleteShortcut = useDeleteShortcut();
    const remoteEvaluationTools = useEvaluationTools();
    const createEvaluationTool = useCreateEvaluationTool();
    const updateEvaluationTool = useUpdateEvaluationTool();
    const deleteEvaluationTool = useDeleteEvaluationTool();
    const remoteKeyCompetences = useKeyCompetences();
    const createKeyCompetence = useCreateKeyCompetence();
    const updateKeyCompetence = useUpdateKeyCompetence();
    const deleteKeyCompetence = useDeleteKeyCompetence();
    const createDescriptor = useCreateDescriptor();
    const updateDescriptor = useUpdateDescriptor();
    const deleteDescriptor = useDeleteDescriptor();
    // "Materias" (nivel+asignatura) del backend nuevo — usadas SOLO por
    // CurriculumManager/ProgrammingManager (bloque 3), no por el resto de la
    // app: `courses`/`setCoursesCallback` (ver más abajo) siguen siendo el
    // curso del blob viejo que usan ClassManager/CourseManager/GradebookTable
    // etc. hasta que classes migre (bloque 4) — dos listas de cursos
    // conviven a propósito durante la transición, ver plan.
    const remoteCourses = useCourses();
    const updateCourseMutation = useUpdateCourse();
    // Currículo/planificación de TODAS las materias a la vez (bloque 7):
    // varios consumidores (ExportModal, BackupManager, EvaluationToolManager,
    // ClasesView→StudentSummaryModal, GradebookTable/CalendarView/ClassJournal
    // para programmingUnits) necesitan el conjunto completo, no acotado a
    // activeCourseId como effectiveCriteria/effectiveCompetences — antes
    // recibían la lista congelada del blob por error (bug real, ver bloque 7).
    const remoteCourseIds = useMemo(() => (remoteCourses.data ?? []).map(c => c.id), [remoteCourses.data]);
    const allCriteriaQueries = useEvaluationCriteriaForCourses(remoteCourseIds);
    const allCompetencesQueries = useSpecificCompetencesForCourses(remoteCourseIds);
    const allBasicKnowledgeQueries = useBasicKnowledgeForCourses(remoteCourseIds);
    const allProgrammingUnitsQueries = useProgrammingUnitsForCourses(remoteCourseIds);

    // Hidratación completa de TODAS las clases del curso actual: GradebookTable/
    // CalendarView/los 4 informes de clase siguen esperando una ClassData
    // completa (misma forma que el blob viejo, con alumnado+categorías+
    // tareas+notas embebidos) — se reconstruye aquí una vez, centralizada, en
    // vez de que cada consumidor la pida por separado (ver
    // services/apiAdapters.ts para el porqué de cada pieza, sobre todo
    // grades/criterionScores).
    const currentYear = useCurrentAcademicYear();
    const yearId = currentYear.data?.id ?? '';
    // Cabecera de 3 contextos (Fase 8): lista completa de años para el
    // desplegable (currentYear solo trae el activo) + "materias de este año"
    // para el desplegable de Materia.
    const allYears = useAcademicYears();
    const activateYearMutation = useActivateAcademicYear();
    const yearCoursesQuery = useAcademicYearCourses(yearId, { enabled: !!yearId });
    const remoteClasses = useApiClasses(yearId, { enabled: !!yearId });
    const remoteStudents = useApiStudents();
    const remoteClassIds = useMemo(() => (remoteClasses.data ?? []).map(c => c.id), [remoteClasses.data]);
    const enrollmentQueries = useEnrollmentsForClasses(remoteClassIds);
    // categories/assignments/grades: bloque 5, ya con comando Rust real --
    // el cuaderno de notas funciona de verdad en escritorio desde aquí.
    const categoryQueries = useCategoriesForClasses(remoteClassIds);
    const assignmentQueries = useAssignmentsForClasses(remoteClassIds);
    const gradeQueries = useGradesForClasses(remoteClassIds);
    const remoteEvaluationPeriods = useEvaluationPeriods(yearId, { enabled: !!yearId });
    const updateAcademicYearMutation = useUpdateAcademicYear();
    // journalEntries/tasks/meetings/agendaNotes: bloque 6, ya con comando
    // Rust real -- con esto queda cerrada toda la Fase 7 salvo fotos
    // (bloque 7) y la baja del blob viejo (bloque 8).
    const remoteTasks = useTasks(yearId, { enabled: !!yearId });
    const createTaskMutation = useCreateTask();
    const updateTaskMutation = useUpdateTask();
    const deleteTaskMutation = useDeleteTask();
    const remoteMeetings = useMeetings(yearId, { enabled: !!yearId });
    const createMeetingMutation = useCreateMeeting();
    const updateMeetingMutation = useUpdateMeeting();
    const deleteMeetingMutation = useDeleteMeeting();
    const remoteJournalEntries = useJournalEntries(yearId, { enabled: !!yearId });
    const saveJournalEntryMutation = useSaveJournalEntry();
    const remoteAgendaNotes = useAgendaNotes(yearId, { enabled: !!yearId });
    const createAgendaNoteMutation = useCreateAgendaNote();
    const updateAgendaNoteMutation = useUpdateAgendaNote();
    const deleteAgendaNoteMutation = useDeleteAgendaNote();
    // preferences: el bloque 4 ya tiene academic_years real en escritorio,
    // así que effectiveAcademicConfiguration (más abajo) puede resolverse
    // entera de una vez -- ya no hay mezcla a medias entre blob y remoto.
    const remotePreferences = usePreferences();
    const updatePreferencesMutation = useUpdatePreferences();
    const createAssignmentMutation = useCreateAssignment();
    // Memoizado a propósito (bug real encontrado 2026-08-04): sin esto,
    // hydratedClasses era un array nuevo en CADA render de App.tsx, sin
    // relación con si los datos habían cambiado de verdad. Como se pasa como
    // prop `classes` a componentes que reinicializan estado local por
    // useEffect cuando esa prop cambia de identidad (p.ej. ClassJournal
    // reseteaba notesMap/isDirtyMap al recibir un `classes` "nuevo"), un
    // re-render de App.tsx por CUALQUIER motivo ajeno (como marcar
    // isJournalDirty al escribir la primera letra en el Diario) desataba una
    // cascada que borraba lo que el usuario acababa de teclear. Las claves
    // *_UpdatedKey usan dataUpdatedAt (no las propias queries, cuyo array
    // envolvente de useQueries es en sí mismo nuevo en cada render) para que
    // la memoización solo se invalide cuando el dato subyacente cambia de verdad.
    const enrollmentsUpdatedKey = enrollmentQueries.map(q => q.dataUpdatedAt).join(',');
    const categoriesUpdatedKey = categoryQueries.map(q => q.dataUpdatedAt).join(',');
    const assignmentsUpdatedKey = assignmentQueries.map(q => q.dataUpdatedAt).join(',');
    const gradesUpdatedKey = gradeQueries.map(q => q.dataUpdatedAt).join(',');
    const hydratedClasses: ClassData[] = useMemo(() => (
        (remoteClasses.data ?? []).map((cls, i) => hydrateClassData(
            cls,
            enrollmentQueries[i]?.data ?? [],
            remoteStudents.data ?? [],
            categoryQueries[i]?.data ?? [],
            assignmentQueries[i]?.data ?? [],
            gradeQueries[i]?.data ?? [],
            remoteEvaluationTools.data ?? [],
        ))
    ), [
        remoteClasses.data, remoteStudents.data, remoteEvaluationTools.data,
        enrollmentsUpdatedKey, categoriesUpdatedKey, assignmentsUpdatedKey, gradesUpdatedKey,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ]);

    // Mismo motivo que hydratedClasses arriba: sin esto, cada uno era un
    // array nuevo en cada render de App.tsx, y al pasarse como prop a vistas
    // que los usan en dependencias de
    // useMemo/useCallback (p.ej. ClassJournal: units→getPlannedContent→
    // scheduledClasses) desataba la misma cascada de reseteo de estado local
    // ante cualquier re-render ajeno — causa raíz del bug real "no puedo
    // añadir nada en el Diario" (2026-08-04).
    const allCriteriaUpdatedKey = allCriteriaQueries.map(q => q.dataUpdatedAt).join(',');
    const allCompetencesUpdatedKey = allCompetencesQueries.map(q => q.dataUpdatedAt).join(',');
    const allBasicKnowledgeUpdatedKey = allBasicKnowledgeQueries.map(q => q.dataUpdatedAt).join(',');
    const allProgrammingUnitsUpdatedKey = allProgrammingUnitsQueries.map(q => q.dataUpdatedAt).join(',');
    const allCriteria: EvaluationCriterion[] = useMemo(() => (
        allCriteriaQueries.flatMap(q => q.data ?? [])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [allCriteriaUpdatedKey]);
    const allCompetences: SpecificCompetence[] = useMemo(() => (
        allCompetencesQueries.flatMap(q => q.data ?? [])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [allCompetencesUpdatedKey]);
    const allBasicKnowledge: BasicKnowledge[] = useMemo(() => (
        allBasicKnowledgeQueries.flatMap(q => q.data ?? [])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [allBasicKnowledgeUpdatedKey]);
    const allProgrammingUnits: ProgrammingUnit[] = useMemo(() => (
        allProgrammingUnitsQueries.flatMap(q => q.data ?? []) as unknown as ProgrammingUnit[]
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [allProgrammingUnitsUpdatedKey]);
    // Mismo motivo — encontrado por auditoría tras el bug del Diario
    // (2026-08-04): AssignmentModal.tsx reinicializa el desplegable de
    // "Evaluación" en un useEffect con esta prop en las dependencias; sin
    // memoizar, cualquier re-render ajeno mientras el modal está abierto
    // pisaba silenciosamente la evaluación elegida a mano por el usuario.
    // evaluationPeriods/evaluationPeriodWeights reales desde academic_years;
    // holidays/periods (franjas horarias) reales desde academic_years
    // (columnas JSONB reservadas para esto, ver plan) y gradeScale/
    // defaultCalendarView reales desde /preferences — ningún campo depende ya
    // del blob. INITIAL_ACADEMIC_CONFIGURATION solo aporta layoutMode/
    // defaultStartView (código muerto, nada los lee — ver App.tsx:529 antes
    // de esta fase) como base del spread.
    const effectiveAcademicConfiguration: AcademicConfiguration = useMemo(() => ({
        ...INITIAL_ACADEMIC_CONFIGURATION,
        academicYearStart: currentYear.data?.startDate ?? '',
        academicYearEnd: currentYear.data?.endDate ?? '',
        holidays: currentYear.data?.holidays ?? [],
        periods: currentYear.data?.periods ?? [],
        evaluationPeriods: (remoteEvaluationPeriods.data ?? []).map(p => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate })),
        evaluationPeriodWeights: Object.fromEntries((remoteEvaluationPeriods.data ?? []).map(p => [p.id, p.weight])),
        gradeScale: remotePreferences.data?.gradeScale,
        defaultCalendarView: remotePreferences.data?.defaultCalendarView,
    }), [currentYear.data, remoteEvaluationPeriods.data, remotePreferences.data]);
    const effectiveTasks: Task[] = useMemo(() => (
        remoteTasks.data ?? []
    ), [remoteTasks.data]);
    const effectiveMeetings: Meeting[] = useMemo(() => (
        remoteMeetings.data ?? []
    ), [remoteMeetings.data]);
    const effectiveJournalEntries: JournalEntry[] = useMemo(() => (
        (remoteJournalEntries.data ?? []).map(e => ({ ...e, notes: e.notes ?? '' }))
    ), [remoteJournalEntries.data]);
    const effectiveAgendaNotes: AgendaNote[] = useMemo(() => (
        remoteAgendaNotes.data ?? []
    ), [remoteAgendaNotes.data]);

    // --- UI State ---
    const [activeClassId, setActiveClassId] = useState<string>('');
    // Materia seleccionada en la cabecera (Fase 8) — antes se derivaba solo
    // de activeClass.courseId; ahora es contexto propio para poder elegirla
    // sin haber elegido clase todavía. El efecto de más abajo mantiene la
    // sincronización clase→materia para todo el código que ya cambia
    // activeClassId directamente (selectores de GradebookTable, informes...).
    const [activeCourseId, setActiveCourseId] = useState<string>('');
    const [activeView, setActiveViewRaw] = useState<View>('hoy');
    // El Diario de Clase avisa aquí cuando tiene anotaciones sin guardar
    // (es fácil escribir y olvidarse de pulsar "Guardar"): mientras esté a
    // true, cualquier cambio de vista pide confirmación antes de descartarlas.
    const [isJournalDirty, setIsJournalDirty] = useState(false);
    const setActiveView = useCallback((view: View) => {
        if (activeView === 'journal' && isJournalDirty) {
            if (!window.confirm('Hay anotaciones sin guardar en el Diario de Clase. ¿Salir sin guardar?')) return;
        }
        setActiveViewRaw(view);
    }, [activeView, isJournalDirty]);
    // El contenedor <main> es el que hace scroll (overflow-y-auto), no la
    // ventana: cambiar de vista sin esto deja el scroll donde estaba (p.ej.
    // entrar al cuaderno desde un acceso rápido y aparecer a mitad de página).
    const mainRef = useRef<HTMLElement>(null);
    useEffect(() => {
        mainRef.current?.scrollTo(0, 0);
    }, [activeView]);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isFavoritosOpen, setIsFavoritosOpen] = useState(false);
    // Favoritos: accesos directos a FUNCIONES (crear algo sin navegar), no a
    // páginas — cada uno reutiliza el mismo popup que ya existe en su
    // pantalla original (Agenda/Diario), abierto aquí para HOY.
    const [isFavoritoAssignmentOpen, setIsFavoritoAssignmentOpen] = useState(false);
    const [isFavoritoMeetingOpen, setIsFavoritoMeetingOpen] = useState(false);
    const [isFavoritoJournalOpen, setIsFavoritoJournalOpen] = useState(false);
    const [initialized, setInitialized] = useState(false);
    // Al pinchar una reunión en la Agenda: navega a Reuniones y le dice qué
    // reunión concreta abrir en el formulario (ReunionesView limpia esto
    // sola tras abrirla, vía onOpened).
    const [meetingToOpenId, setMeetingToOpenId] = useState<string | null>(null);

    // --- Derived State & Callbacks ---
    useEffect(() => {
        // Espera a que año y clases hayan asentado (éxito o error) antes de
        // decidir la clase inicial — de lo contrario, en la primera pasada
        // hydratedClasses todavía está vacío por carga en curso, no porque
        // no haya clases de verdad.
        if (initialized || currentYear.isLoading || remoteClasses.isLoading) return;

        // La app siempre arranca en "Hoy" (no hay ajuste en la UI para
        // cambiarlo; ignora academicConfiguration.defaultStartView, que
        // en bases de datos ya existentes puede seguir siendo 'calendar').
        setActiveView('hoy');

        if (hydratedClasses.length > 0) {
            const academicCourseIds = new Set((remoteCourses.data ?? []).filter(c => c.type !== 'other').map(c => c.id));
            const firstAcademicClass = hydratedClasses.find(c => academicCourseIds.has(c.courseId));
            setActiveClassId(firstAcademicClass?.id ?? hydratedClasses[0].id);
        }
        setInitialized(true);
        // setActiveView is intentionally excluded: this effect must run exactly
        // once (guarded by !initialized), and at that point activeView/isJournalDirty
        // (its own deps) are still their initial values, so there's no stale closure.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized, currentYear.isLoading, remoteClasses.isLoading, hydratedClasses, remoteCourses.data]);

    const activeClass = useMemo(() => (
        hydratedClasses.find(c => c.id === activeClassId)
    ), [activeClassId, hydratedClasses]);

    // Clase→Materia: cualquier cambio de activeClassId (los sitios que ya
    // llaman a setActiveClassId directamente, sin pasar por los handlers
    // nuevos de más abajo) resincroniza activeCourseId automáticamente.
    useEffect(() => {
        if (activeClass && activeClass.courseId !== activeCourseId) {
            setActiveCourseId(activeClass.courseId);
        }
        // activeCourseId excluido a propósito: este efecto solo reacciona a
        // cambios de activeClass, no debe re-ejecutarse cuando el propio
        // activeCourseId cambia por otra vía.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeClass]);

    // Cambiar de año (Fase 8): si la materia/clase activas no pertenecen al
    // año recién activado, se limpian — evita arrastrar contexto de un año
    // que ya no es el actual. Se apoya en los datos crudos ya pedidos más
    // arriba (yearCoursesQuery/remoteClasses), no en las listas derivadas de
    // más abajo, porque esas viven después del `if (!appState) return` y
    // este efecto tiene que declararse aquí sin condicionales (Rules of
    // Hooks).
    useEffect(() => {
        if (!yearId) return;
        const yearCourseIds = new Set((yearCoursesQuery.data ?? []).map(yc => yc.courseId));
        if (activeCourseId && !yearCourseIds.has(activeCourseId)) {
            setActiveCourseId('');
            setActiveClassId('');
            return;
        }
        if (activeClassId && !(remoteClasses.data ?? []).some(c => c.id === activeClassId)) {
            setActiveClassId('');
        }
        // activeCourseId/activeClassId excluidos: este efecto reacciona a
        // cambios de AÑO (y a que lleguen los datos de ese año), no debe
        // dispararse de nuevo cuando limpia esos dos estados él mismo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [yearId, yearCoursesQuery.data, remoteClasses.data]);

    // criteria/competences (bloque 3b en web, bloque 4 en escritorio) —
    // para que GradebookTable/los informes de la clase activa vean los
    // criterios/competencias reales de su materia (no los del blob,
    // congelados), se piden aquí, ya acotados al curso de `activeClass`.
    const remoteActiveCriteria = useEvaluationCriteria(activeCourseId, { enabled: !!activeCourseId });
    const remoteActiveCompetences = useSpecificCompetences(activeCourseId, { enabled: !!activeCourseId });

    // Guarda la tarea evaluable creada desde Favoritos (mismo mecanismo que
    // usa CalendarView para el "+" de un día en la Agenda).
    const handleSaveFavoritoAssignment = async (newAssignment: Omit<Assignment, 'id'>, classId: string) => {
        await createAssignmentMutation.mutateAsync({ classId, data: newAssignment });
        setIsFavoritoAssignmentOpen(false);
    };

    // Reunión desde Favoritos: mismo mecanismo que usa CalendarView para el
    // "+" de un día en la Agenda, con fecha = hoy.
    const handleSaveFavoritoMeeting = (data: Omit<Meeting, 'id'>) => {
        const newMeeting: Meeting = {
            id: `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            ...data,
        };
        setMeetingsCallback(prev => [...prev, newMeeting]);
        setIsFavoritoMeetingOpen(false);
    };

    const handleCopyAssignment = useCallback(async (sourceAssignment: Assignment, targetClassId: string, targetPeriodId: string, targetCategoryId: string) => {
        const { id: _unusedId, ...rest } = sourceAssignment;
        await createAssignmentMutation.mutateAsync({
            classId: targetClassId,
            data: { ...rest, categoryId: targetCategoryId, evaluationPeriodId: targetPeriodId, recoversAssignmentIds: [] },
        });
        alert("Tarea copiada con éxito.");
    }, [createAssignmentMutation]);

    const handleUpdateJournalEntry = useCallback((entry: JournalEntry) => {
        // POST hace upsert por (classId, date, periodIndex) en el propio
        // backend — no hace falta distinguir "es nueva" de "ya existía".
        if (!yearId) return;
        saveJournalEntryMutation.mutate({ yearId, data: { classId: entry.classId, date: entry.date, periodIndex: entry.periodIndex, notes: entry.notes } });
    }, [yearId, saveJournalEntryMutation]);

    // Fase 6: en web, compara el resultado del updater contra el valor
    // efectivo actual y manda solo los campos que de verdad cambiaron —
    // academicYearStart/End quedan fuera (ver comentario junto a
    // effectiveAcademicConfiguration: AcademicConfigManager.tsx los escribe
    // aparte, directo contra academic_years, sin pasar por aquí).
    const setAcademicConfigurationCallback = useCallback((updater: React.SetStateAction<AcademicConfiguration>) => {
        const next = typeof updater === 'function' ? updater(effectiveAcademicConfiguration) : updater;
        if (yearId && (next.holidays !== effectiveAcademicConfiguration.holidays || next.periods !== effectiveAcademicConfiguration.periods)) {
            updateAcademicYearMutation.mutate({ id: yearId, data: { holidays: next.holidays, periods: next.periods } });
        }
        if (next.gradeScale !== effectiveAcademicConfiguration.gradeScale || next.defaultCalendarView !== effectiveAcademicConfiguration.defaultCalendarView) {
            updatePreferencesMutation.mutate({ gradeScale: next.gradeScale, defaultCalendarView: next.defaultCalendarView });
        }
    }, [effectiveAcademicConfiguration, yearId, updateAcademicYearMutation, updatePreferencesMutation]);
    // setTasks/setMeetings/setAgendaNotes: diffAndSyncList traduce el
    // resultado del updater (mismo patrón prev => [...prev, nuevo] que ya
    // usan HoyView/ReunionesView/CalendarView) a las llamadas granulares que
    // hacen falta — ver el comentario largo junto a diffAndSyncList en
    // services/apiAdapters.ts para el porqué de este envoltorio en vez de
    // reescribir cada consumidor.
    const setTasksCallback = useCallback((updater: React.SetStateAction<Task[]>) => {
        if (!yearId) return;
        const next = typeof updater === 'function' ? updater(effectiveTasks) : updater;
        diffAndSyncList(effectiveTasks, next, {
            create: data => createTaskMutation.mutateAsync({ yearId, data }),
            update: (id, data) => updateTaskMutation.mutateAsync({ id, yearId, data }),
            remove: id => deleteTaskMutation.mutateAsync({ id, yearId }),
        });
    }, [yearId, effectiveTasks, createTaskMutation, updateTaskMutation, deleteTaskMutation]);
    const setMeetingsCallback = useCallback((updater: React.SetStateAction<Meeting[]>) => {
        if (!yearId) return;
        const next = typeof updater === 'function' ? updater(effectiveMeetings) : updater;
        diffAndSyncList(effectiveMeetings, next, {
            create: data => createMeetingMutation.mutateAsync({ yearId, data }),
            update: (id, data) => updateMeetingMutation.mutateAsync({ id, yearId, data }),
            remove: id => deleteMeetingMutation.mutateAsync({ id, yearId }),
        });
    }, [yearId, effectiveMeetings, createMeetingMutation, updateMeetingMutation, deleteMeetingMutation]);
    const setAgendaNotesCallback = useCallback((updater: React.SetStateAction<AgendaNote[]>) => {
        if (!yearId) return;
        const next = typeof updater === 'function' ? updater(effectiveAgendaNotes) : updater;
        diffAndSyncList(effectiveAgendaNotes, next, {
            create: data => createAgendaNoteMutation.mutateAsync({ yearId, data }),
            update: (id, data) => updateAgendaNoteMutation.mutateAsync({ id, yearId, data }),
            remove: id => deleteAgendaNoteMutation.mutateAsync({ id, yearId }),
        });
    }, [yearId, effectiveAgendaNotes, createAgendaNoteMutation, updateAgendaNoteMutation, deleteAgendaNoteMutation]);
    // shortcuts/evaluationTools: sin relaciones con ninguna otra entidad (ver
    // plan, Fase 7 bloque 2) — desde ahí, ambas plataformas hablan siempre
    // con el backend granular (FastAPI en web, api_request en escritorio),
    // nunca con el blob local.
    const handleCreateShortcut = useCallback((data: Omit<Shortcut, 'id'>) => {
        createShortcut.mutate(data);
    }, [createShortcut]);

    const handleUpdateShortcut = useCallback((id: string, data: Omit<Shortcut, 'id'>) => {
        updateShortcut.mutate({ id, data });
    }, [updateShortcut]);

    const handleDeleteShortcut = useCallback((id: string) => {
        deleteShortcut.mutate(id);
    }, [deleteShortcut]);

    const handleCreateEvaluationTool = useCallback((data: Omit<EvaluationTool, 'id'>) => {
        createEvaluationTool.mutate(data);
    }, [createEvaluationTool]);

    const handleUpdateEvaluationTool = useCallback((id: string, data: Omit<EvaluationTool, 'id'>) => {
        updateEvaluationTool.mutate({ id, data });
    }, [updateEvaluationTool]);

    const handleDeleteEvaluationTool = useCallback((id: string) => {
        deleteEvaluationTool.mutate(id);
    }, [deleteEvaluationTool]);

    // keyCompetences/descriptors: a diferencia de shortcuts/evaluationTools
    // (Fase 4), CurriculumManager necesita poder encadenar estas llamadas
    // (crear una competencia clave y, con su id real, crear sus descriptores)
    // — de ahí que devuelvan Promise<...> en vez de ser "dispara y olvida".
    const handleCreateKeyCompetence = useCallback(async (data: { code: string; description: string }): Promise<KeyCompetence> => {
        return createKeyCompetence.mutateAsync(data);
    }, [createKeyCompetence]);

    const handleUpdateKeyCompetence = useCallback(async (id: string, data: Partial<{ code: string; description: string }>): Promise<void> => {
        await updateKeyCompetence.mutateAsync({ id, data });
    }, [updateKeyCompetence]);

    // Sin uso desde la UI normal (borrar KC/OD está bloqueado a propósito,
    // ver EditableItem) — solo lo usa el borrado de una etapa curricular
    // completa, que sí necesita poder quitar una competencia clave que se
    // quede sin descriptores.
    const handleDeleteKeyCompetence = useCallback(async (id: string): Promise<void> => {
        await deleteKeyCompetence.mutateAsync(id);
    }, [deleteKeyCompetence]);

    const handleCreateDescriptor = useCallback(async (keyCompetenceId: string, data: { code: string; description: string; stage?: 'eso' | 'bachillerato' }): Promise<OperationalDescriptor> => {
        return createDescriptor.mutateAsync({ keyCompetenceId, data });
    }, [createDescriptor]);

    const handleUpdateDescriptor = useCallback(async (id: string, data: Partial<{ code: string; description: string; stage: 'eso' | 'bachillerato' }>): Promise<void> => {
        await updateDescriptor.mutateAsync({ id, data });
    }, [updateDescriptor]);

    // Igual que handleDeleteKeyCompetence: solo lo usa el borrado de etapa.
    const handleDeleteDescriptor = useCallback(async (id: string): Promise<void> => {
        await deleteDescriptor.mutateAsync(id);
    }, [deleteDescriptor]);

    // Único punto de escritura que CurriculumManager necesita sobre
    // "materias" (el toggle de reparto manual de pesos) — alta/edición/
    // borrado de materias vive en AcademicYearManager.tsx, no aquí.
    const handleUpdateCourse = useCallback(async (id: string, data: Partial<{ level: string; subject: string; type: 'academic' | 'other'; pesoCriteriosManual: boolean }>): Promise<void> => {
        await updateCourseMutation.mutateAsync({ id, data });
    }, [updateCourseMutation]);

    // --- Render Logic ---
    if (currentYear.isLoading) {
        return <div className="flex items-center justify-center min-h-screen bg-slate-100 text-slate-600">Cargando base de datos...</div>;
    }

    if (currentYear.isError) {
        return <div className="flex items-center justify-center min-h-screen bg-red-50 text-red-700">Error: no se pudo conectar con el servidor.</div>;
    }

    const shortcuts = remoteShortcuts.data ?? [];
    const evaluationTools = remoteEvaluationTools.data ?? [];
    const keyCompetences = remoteKeyCompetences.data ?? [];
    // Ver comentario junto a useCourses() más arriba: lista de materias,
    // usada por CurriculumManager/ProgrammingManager y por el resto de la
    // app para resolver nombres/tipo de materia de cada clase.
    const curriculumCourses = remoteCourses.data ?? [];
    // Currículo/planificación de TODAS las materias (bloque 7) — a
    // diferencia de effectiveCriteria/effectiveCompetences (acotadas a
    // activeCourseId), estas alimentan vistas que no tienen "una" materia
    // activa concreta (exportar CSV, comprobar integridad, vincular
    // criterios a un instrumento, ficha de alumno de cualquier clase...).
    const academicClasses = hydratedClasses.filter(c => curriculumCourses.find(course => course.id === c.courseId)?.type !== 'other');
    const handleSelectYear = (id: string) => {
        if (!id || activateYearMutation.isPending) return;
        activateYearMutation.mutate(id);
    };

    // Criterios/competencias reales del curso de `activeClass`, pedidos más arriba.
    const effectiveCriteria = remoteActiveCriteria.data ?? [];
    const effectiveCompetences = remoteActiveCompetences.data ?? [];

    const renderContent = () => {
        // Vistas que no requieren una clase activa
        if (activeView === 'journal') {
            return <ClassJournal
                classes={hydratedClasses}
                entries={effectiveJournalEntries}
                onSave={handleUpdateJournalEntry}
                academicConfiguration={effectiveAcademicConfiguration}
                units={allProgrammingUnits}
                courses={curriculumCourses}
                onDirtyChange={setIsJournalDirty}
            />;
        }

        if (activeView === 'hoy') {
            return <HoyView
                classes={hydratedClasses}
                courses={curriculumCourses}
                academicConfiguration={effectiveAcademicConfiguration}
                tasks={effectiveTasks}
                setTasks={setTasksCallback}
                meetings={effectiveMeetings}
                setActiveView={setActiveView}
                setActiveClassId={setActiveClassId}
            />;
        }

        if (activeView === 'horario') {
            return <HorarioView
                classes={hydratedClasses}
                courses={curriculumCourses}
                academicConfiguration={effectiveAcademicConfiguration}
                setActiveView={setActiveView}
                setActiveClassId={setActiveClassId}
            />;
        }

        if (activeView === 'meetings') {
            return <ReunionesView
                meetings={effectiveMeetings}
                setMeetings={setMeetingsCallback}
                openMeetingId={meetingToOpenId}
                onOpened={() => setMeetingToOpenId(null)}
            />;
        }

        if (activeView === 'exams') {
            return <ExamenesView
                classes={hydratedClasses}
                courses={curriculumCourses}
                setActiveView={setActiveView}
                setActiveClassId={setActiveClassId}
                onOpenAddTask={() => setIsFavoritoAssignmentOpen(true)}
            />;
        }

        if (!activeClass && activeView !== 'calendar') {
            return (
                <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border overflow-hidden">
                    {/* Render class selector tabs even in empty state if we are in Gradebook view and have classes */}
                    {activeView === 'gradebook' && academicClasses.length > 0 && (
                        <div className="flex overflow-x-auto no-scrollbar max-w-full px-2 pt-2 border-b bg-slate-50/50">
                            {academicClasses.sort((a, b) => getClassName(a, curriculumCourses).localeCompare(getClassName(b, curriculumCourses))).map(cls => (
                                <button
                                    key={cls.id}
                                    onClick={() => setActiveClassId(cls.id)}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300`}
                                >
                                    <ClassLabel classData={cls} courses={curriculumCourses} />
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="p-12 text-center flex flex-col items-center justify-center flex-grow">
                        <div className="bg-slate-50 p-4 rounded-full mb-4">
                            <BookOpenIcon className="w-8 h-8 text-slate-400"/>
                        </div>
                        <p className="text-lg font-medium text-slate-700 mb-2">Ninguna clase seleccionada</p>
                        <p className="text-sm text-slate-500 max-w-sm">
                            {academicClasses.length > 0 
                                ? "Selecciona una clase de la barra superior para ver sus calificaciones." 
                                : "No tienes clases creadas. Ve a Ajustes para crear tu primera clase."}
                        </p>
                    </div>
                </div>
            );
        }

        if (MATERIA_VIEWS.includes(activeView)) {
            if (!activeCourseId) {
                return (
                    <div className="p-12 text-center flex flex-col items-center justify-center flex-grow">
                        <p className="text-lg font-medium text-slate-700 mb-2">Ninguna materia seleccionada</p>
                        <p className="text-sm text-slate-500 max-w-sm">Selecciona una materia de la barra superior para gestionar su currículo y planificación.</p>
                    </div>
                );
            }
            return (
                <>
                    <PageHeader title="Materia" subtitle="Currículo y planificación didáctica de la materia seleccionada." accent="navy" icon={<BookOpenIcon className="w-6 h-6" />} />
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit my-6">
                        <button onClick={() => setActiveView('curriculum')} className={`px-3 py-1.5 text-sm font-semibold rounded-md ${activeView === 'curriculum' ? 'bg-white shadow-sm' : 'hover:bg-slate-200'}`}>Currículo</button>
                        <button onClick={() => setActiveView('planner')} className={`px-3 py-1.5 text-sm font-semibold rounded-md ${activeView === 'planner' ? 'bg-white shadow-sm' : 'hover:bg-slate-200'}`}>Planificación UD</button>
                    </div>
                    <React.Suspense fallback={<ViewLoadingFallback />}>
                        {activeView === 'curriculum' && (
                            <CurriculumManager
                                courseId={activeCourseId}
                                courses={curriculumCourses}
                                onUpdateCourse={handleUpdateCourse}
                                keyCompetences={keyCompetences}
                                onCreateKeyCompetence={handleCreateKeyCompetence}
                                onUpdateKeyCompetence={handleUpdateKeyCompetence}
                                onDeleteKeyCompetence={handleDeleteKeyCompetence}
                                onCreateDescriptor={handleCreateDescriptor}
                                onUpdateDescriptor={handleUpdateDescriptor}
                                onDeleteDescriptor={handleDeleteDescriptor}
                            />
                        )}
                        {activeView === 'planner' && (
                            <ProgrammingManager
                                courseId={activeCourseId}
                                courses={curriculumCourses}
                                classes={hydratedClasses}
                                academicConfiguration={effectiveAcademicConfiguration}
                            />
                        )}
                    </React.Suspense>
                </>
            );
        }

        if (REPORT_VIEWS.includes(activeView)) {
            const activeClassCriteria = effectiveCriteria.filter(c => c.courseId === activeClass?.courseId).sort((a, b) => compararCodigo(a.code, b.code));
            const activeClassCompetences = effectiveCompetences.filter(sc => sc.courseId === activeClass?.courseId).sort((a, b) => compararCodigo(a.code, b.code));
            return (
                <>
                    <PageHeader title="Informes" subtitle="Grado de consecución de criterios, competencias y descriptores." accent="teal" icon={<ChartBarIcon className="w-6 h-6" />} />
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 my-6">
                        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                            <button onClick={() => setActiveView('criteria')} className={`px-3 py-1.5 text-sm font-semibold rounded-md ${activeView === 'criteria' ? 'bg-white shadow-sm' : 'hover:bg-slate-200'}`}>Inf. Criterios</button>
                            <button onClick={() => setActiveView('competences')} className={`px-3 py-1.5 text-sm font-semibold rounded-md ${activeView === 'competences' ? 'bg-white shadow-sm' : 'hover:bg-slate-200'}`}>Inf. Competencias</button>
                            <button onClick={() => setActiveView('key-competences')} className={`px-3 py-1.5 text-sm font-semibold rounded-md ${activeView === 'key-competences' ? 'bg-white shadow-sm' : 'hover:bg-slate-200'}`}>Inf. Comp. Clave</button>
                            <button onClick={() => setActiveView('descriptors')} className={`px-3 py-1.5 text-sm font-semibold rounded-md ${activeView === 'descriptors' ? 'bg-white shadow-sm' : 'hover:bg-slate-200'}`}>Inf. Descriptores</button>
                        </div>
                        {academicClasses.length > 0 && (
                            <Select
                                value={activeClassId}
                                onChange={(e) => setActiveClassId(e.target.value)}
                                className="sm:w-auto"
                            >
                                {academicClasses.map(c => <option key={c.id} value={c.id}>{formatClassLabel(c, curriculumCourses)}</option>)}
                            </Select>
                        )}
                    </div>

                    <React.Suspense fallback={<ViewLoadingFallback />}>
                        {activeView === 'criteria' && activeClass && <CriteriaAchievement classData={activeClass} criteria={activeClassCriteria} competences={activeClassCompetences} academicConfiguration={effectiveAcademicConfiguration} />}
                        {activeView === 'competences' && activeClass && <SpecificCompetenceAchievement classData={activeClass} courses={curriculumCourses} competences={activeClassCompetences} keyCompetences={keyCompetences} criteria={activeClassCriteria} academicConfiguration={effectiveAcademicConfiguration} />}
                        {activeView === 'key-competences' && activeClass && <KeyCompetenceAchievement classData={activeClass} courses={curriculumCourses} competences={activeClassCompetences} keyCompetences={keyCompetences} criteria={activeClassCriteria} academicConfiguration={effectiveAcademicConfiguration} />}
                        {activeView === 'descriptors' && activeClass && <DescriptorAchievement classData={activeClass} keyCompetences={keyCompetences} courses={curriculumCourses} />}
                    </React.Suspense>
                </>
            );
        }

        switch (activeView) {
            case 'gradebook':
                return activeClass && <GradebookTable
                    classData={activeClass}
                    allClasses={hydratedClasses}
                    allCourses={curriculumCourses}
                    criteria={effectiveCriteria.filter(c => c.courseId === activeClass.courseId).sort((a, b) => compararCodigo(a.code, b.code))}
                    specificCompetences={effectiveCompetences.filter(sc => sc.courseId === activeClass.courseId).sort((a, b) => compararCodigo(a.code, b.code))}
                    keyCompetences={keyCompetences}
                    programmingUnits={allProgrammingUnits}
                    academicConfiguration={effectiveAcademicConfiguration}
                    setAcademicConfiguration={setAcademicConfigurationCallback}
                    evaluationTools={evaluationTools}
                    setActiveClassId={setActiveClassId} // Pass setter for internal tab navigation
                    onCopyAssignment={handleCopyAssignment}
                />;
            case 'calendar':
                return <CalendarView
                    units={allProgrammingUnits}
                    courses={curriculumCourses}
                    academicConfiguration={effectiveAcademicConfiguration}
                    classes={hydratedClasses}
                    journalEntries={effectiveJournalEntries}
                    criteria={effectiveCriteria}
                    specificCompetences={effectiveCompetences}
                    keyCompetences={keyCompetences}
                    onSaveJournalEntry={handleUpdateJournalEntry}
                    agendaNotes={effectiveAgendaNotes}
                    setAgendaNotes={setAgendaNotesCallback}
                    meetings={effectiveMeetings}
                    setMeetings={setMeetingsCallback}
                    setActiveView={setActiveView}
                    setActiveClassId={setActiveClassId}
                    onOpenMeeting={setMeetingToOpenId}
                />;
            default:
                return null;
        }
    };

    return (
        <div className="app-container font-sans text-slate-800 bg-slate-100 min-h-screen flex">
            <Sidebar activeView={activeView} setActiveView={setActiveView} onOpenFavoritos={() => setIsFavoritosOpen(true)} />

            <div className="flex-1 flex flex-col min-w-0 pt-14 md:pt-0">
                <header className="bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 py-2 flex items-center justify-between sticky top-0 z-30">
                    <ShortcutsBar shortcuts={shortcuts} onCreate={handleCreateShortcut} onUpdate={handleUpdateShortcut} onDelete={handleDeleteShortcut} />
                    <div className="flex items-center gap-2">
                        {/* Informes, Cuaderno y la vista de Materia usan el contexto
                            seleccionado aquí — igual en ambas plataformas desde que
                            escritorio tiene academic_years real (Fase 7 bloque 4). */}
                        {(REPORT_VIEWS.includes(activeView) || activeView === 'gradebook' || MATERIA_VIEWS.includes(activeView)) && (allYears.data?.length ?? 0) > 0 && (
                            <>
                                {/* !w-auto: sin esto, width:100% (del Select compartido,
                                    pensado para formularios) les da una base de flex enorme,
                                    y bajo presión de espacio en la cabecera (accesos directos
                                    a la izquierda) el algoritmo de flexbox las encogía por
                                    debajo de su propio contenido. */}
                                <Select value={yearId} onChange={(e) => handleSelectYear(e.target.value)} className="font-semibold !w-auto">
                                    {(allYears.data ?? []).map(y => <option key={y.id} value={y.id}>{y.label}</option>)}
                                </Select>
                                {/* Un único selector Clase-Materia (no dos): elegir una clase
                                    ya fija su materia (efecto de sincronización más arriba),
                                    así que un desplegable de Materia aparte era redundante.
                                    Las materias sin clases todavía (recién declaradas en
                                    "Materias" de Ajustes) no aparecen aquí — para esas, entrar
                                    a Ajustes → Materias. */}
                                {academicClasses.length > 0 && (
                                    <Select value={activeClassId} onChange={(e) => setActiveClassId(e.target.value)} className="font-semibold !w-auto">
                                        <option value="">Clase…</option>
                                        {academicClasses.map(c => {
                                            const materia = getMateria(c, curriculumCourses);
                                            return <option key={c.id} value={c.id} title={materia}>{c.grupo || 'Sin nombre'} - {getSiglas(materia)}</option>;
                                        })}
                                    </Select>
                                )}
                                {/* Currículo/Planificación de la materia de la clase activa
                                    (activeCourseId se deriva de activeClassId, no es
                                    seleccionable por separado). */}
                                {activeCourseId && (
                                    <IconButton
                                        label="Gestionar esta materia (currículo y planificación)"
                                        onClick={() => setActiveView('curriculum')}
                                    >
                                        <BookOpenIcon className="w-5 h-5" />
                                    </IconButton>
                                )}
                            </>
                        )}
                        <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 rounded-full hover:bg-slate-100">
                            <Cog8ToothIcon className="w-6 h-6 text-slate-600" />
                        </button>
                    </div>
                </header>

                <main ref={mainRef} className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto" style={backgroundPatternStyle}>
                    {renderContent()}
                </main>
            </div>

            {isSettingsModalOpen && (
                <React.Suspense fallback={<ViewLoadingFallback />}>
                    <SettingsModal
                        isOpen={isSettingsModalOpen}
                        onClose={() => setIsSettingsModalOpen(false)}
                        onOpenExportModal={() => { setIsSettingsModalOpen(false); setIsExportModalOpen(true); }}
                        classes={hydratedClasses}
                        courses={curriculumCourses}
                        curriculumCourses={curriculumCourses}
                        onUpdateCourse={handleUpdateCourse}
                        keyCompetences={keyCompetences}
                        onCreateKeyCompetence={handleCreateKeyCompetence}
                        onUpdateKeyCompetence={handleUpdateKeyCompetence}
                        onDeleteKeyCompetence={handleDeleteKeyCompetence}
                        onCreateDescriptor={handleCreateDescriptor}
                        onUpdateDescriptor={handleUpdateDescriptor}
                        onDeleteDescriptor={handleDeleteDescriptor}
                        specificCompetences={allCompetences}
                        evaluationCriteria={allCriteria}
                        basicKnowledge={allBasicKnowledge}
                        academicConfiguration={effectiveAcademicConfiguration} setAcademicConfiguration={setAcademicConfigurationCallback}
                        programmingUnits={allProgrammingUnits}
                        evaluationTools={evaluationTools}
                        onCreateEvaluationTool={handleCreateEvaluationTool}
                        onUpdateEvaluationTool={handleUpdateEvaluationTool}
                        onDeleteEvaluationTool={handleDeleteEvaluationTool}
                        importDatabase={importDatabase}
                        exportDatabase={exportDatabase}
                        resetDatabase={resetDatabase}
                    />
                </React.Suspense>
            )}

            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                classes={hydratedClasses}
                courses={curriculumCourses}
                keyCompetences={keyCompetences}
                specificCompetences={allCompetences}
                evaluationCriteria={allCriteria}
                programmingUnits={allProgrammingUnits}
                basicKnowledge={allBasicKnowledge}
                academicConfiguration={effectiveAcademicConfiguration}
            />

            <Modal isOpen={isFavoritosOpen} onClose={() => setIsFavoritosOpen(false)} title="Favoritos" size="md" accent="sand">
                <p className="text-sm text-slate-500 mb-4">Accesos directos a las funciones del día a día, sin tener que navegar.</p>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => { setIsFavoritosOpen(false); setIsFavoritoAssignmentOpen(true); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700"
                    >
                        <ClipboardDocumentCheckIcon className="w-6 h-6 text-blue-600" /> + Tarea evaluable
                    </button>
                    <button
                        onClick={() => { setIsFavoritosOpen(false); setIsFavoritoMeetingOpen(true); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700"
                    >
                        <UsersIcon className="w-6 h-6 text-blue-600" /> + Reunión
                    </button>
                    <button
                        onClick={() => { setIsFavoritosOpen(false); setIsFavoritoJournalOpen(true); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700"
                    >
                        <ClipboardDocumentIcon className="w-6 h-6 text-blue-600" /> Anotar en el Diario
                    </button>
                    <button
                        onClick={() => { setActiveView('calendar'); setIsFavoritosOpen(false); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700"
                    >
                        <CalendarDaysIcon className="w-6 h-6 text-blue-600" /> Ir a la Agenda
                    </button>
                </div>
            </Modal>

            {isFavoritoAssignmentOpen && (
                <CalendarTaskModal
                    isOpen={true}
                    onClose={() => setIsFavoritoAssignmentOpen(false)}
                    onSave={handleSaveFavoritoAssignment}
                    selectedDate={new Date()}
                    classes={hydratedClasses}
                    courses={curriculumCourses}
                    criteria={effectiveCriteria}
                    specificCompetences={effectiveCompetences}
                    keyCompetences={keyCompetences}
                    academicConfiguration={effectiveAcademicConfiguration}
                />
            )}

            {isFavoritoMeetingOpen && (
                <CalendarMeetingModal
                    isOpen={true}
                    onClose={() => setIsFavoritoMeetingOpen(false)}
                    onSave={handleSaveFavoritoMeeting}
                    selectedDate={new Date()}
                />
            )}

            {isFavoritoJournalOpen && (
                <QuickJournalModal
                    isOpen={true}
                    onClose={() => setIsFavoritoJournalOpen(false)}
                    classes={hydratedClasses}
                    courses={curriculumCourses}
                    academicConfiguration={effectiveAcademicConfiguration}
                    entries={effectiveJournalEntries}
                    onSave={handleUpdateJournalEntry}
                />
            )}
        </div>
    );
};

export default App;
