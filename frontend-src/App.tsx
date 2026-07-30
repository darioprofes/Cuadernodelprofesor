
// FIX: Corrected the React import statement.
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import initSqlJs, { type Database } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { isTauri } from '@tauri-apps/api/core';
import { dbAdapter, VersionConflictError } from './services/dbAdapter';
import { useShortcuts, useCreateShortcut, useUpdateShortcut, useDeleteShortcut } from './hooks/useShortcuts';
import { useEvaluationTools, useCreateEvaluationTool, useUpdateEvaluationTool, useDeleteEvaluationTool } from './hooks/useEvaluationTools';
import {
    useKeyCompetences, useCreateKeyCompetence, useUpdateKeyCompetence, useDeleteKeyCompetence,
    useCreateDescriptor, useUpdateDescriptor, useDeleteDescriptor,
} from './hooks/useKeyCompetences';
import { useCourses, useUpdateCourse } from './hooks/useCourses';
import { INITIAL_CLASS_DATA, INITIAL_COMPETENCES, INITIAL_CRITERIA, INITIAL_KEY_COMPETENCES, INITIAL_JOURNAL_ENTRIES, INITIAL_COURSES, INITIAL_PROGRAMMING_UNITS, INITIAL_BASIC_KNOWLEDGE, INITIAL_ACADEMIC_CONFIGURATION, INITIAL_EVALUATION_TOOLS, INITIAL_TASKS, INITIAL_MEETINGS, INITIAL_AGENDA_NOTES, getInitialShortcuts } from './constants';
import type { ClassData, EvaluationCriterion, SpecificCompetence, KeyCompetence, OperationalDescriptor, JournalEntry, Course, ProgrammingUnit, BasicKnowledge, AcademicConfiguration, EvaluationTool, Assignment, Task, Meeting, AgendaNote, Shortcut, View, AppState } from './types';
import { runMigrations, CURRENT_SCHEMA_VERSION } from './services/migrations';
import ShortcutsBar from './components/ShortcutsBar';
import Select from './components/Select';
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
import ClasesView from './components/ClasesView';
import ReunionesView from './components/ReunionesView';
import ExamenesView from './components/ExamenesView';
import ClassLabel from './components/ClassLabel';
import { formatClassLabel, getClassName, compararCodigo } from './utils';
import { backgroundPatternStyle } from './theme/backgroundPattern';

// Custom hook for SQLite database management
function useDatabase() {
    const dbRef = useRef<Database | null>(null);
    const [appState, setAppState] = useState<AppState | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Versión del blob que sabemos vigente en el servidor; null en escritorio
    // (sin control de versión, ver services/dbAdapter.ts) y hasta que exista
    // al menos una fila en web (primer PUT). Se manda de vuelta en cada
    // autoguardado para detectar sobrescrituras concurrentes.
    const versionRef = useRef<number | null>(null);

    const loadDataFromDb = (db: Database) => {
        try {
            const res = db.exec("SELECT data FROM app_data WHERE key = 'main'");
            if (res.length > 0 && res[0].values.length > 0) {
                // data es TEXT en el esquema de app_data (siempre JSON.stringify
                // al guardar), sql.js solo lo tipa como SqlValue en general.
                const loadedState = JSON.parse(res[0].values[0][0] as string);
                return runMigrations(loadedState);
            }
        } catch (e) {
            console.error("Could not read from DB, maybe it's new?", e);
        }
        return null;
    };
    
    useEffect(() => {
        const initialize = async () => {
            try {
                const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
                const savedDb = await dbAdapter.get();
                let db;
                if (savedDb) {
                    db = new SQL.Database(savedDb.data);
                    versionRef.current = savedDb.version;
                } else {
                    db = new SQL.Database();
                    db.exec("CREATE TABLE app_data (key TEXT PRIMARY KEY, data TEXT)");
                    const initialState: AppState = {
                        schemaVersion: CURRENT_SCHEMA_VERSION,
                        classes: INITIAL_CLASS_DATA,
                        keyCompetences: INITIAL_KEY_COMPETENCES,
                        competences: INITIAL_COMPETENCES,
                        criteria: INITIAL_CRITERIA,
                        journalEntries: INITIAL_JOURNAL_ENTRIES,
                        courses: INITIAL_COURSES,
                        programmingUnits: INITIAL_PROGRAMMING_UNITS,
                        basicKnowledge: INITIAL_BASIC_KNOWLEDGE,
                        academicConfiguration: INITIAL_ACADEMIC_CONFIGURATION,
                        evaluationTools: INITIAL_EVALUATION_TOOLS,
                        tasks: INITIAL_TASKS,
                        meetings: INITIAL_MEETINGS,
                        agendaNotes: INITIAL_AGENDA_NOTES,
                        shortcuts: getInitialShortcuts(),
                    };
                    const stateToStore = { ...initialState, classes: dbAdapter.stripPhotosForStorage(initialState.classes) };
                    db.exec("INSERT OR REPLACE INTO app_data (key, data) VALUES ('main', ?)", [JSON.stringify(stateToStore)]);
                    const binaryDb = db.export();
                    versionRef.current = await dbAdapter.set(binaryDb, null);
                }
                dbRef.current = db;
                const data = loadDataFromDb(db);
                if (data) {
                    data.classes = await dbAdapter.hydratePhotosOnLoad(data.classes);
                }
                setAppState(data);
            } catch (err) {
                console.error("Database initialization failed:", err);
                setError("No se pudo cargar la base de datos.");
            } finally {
                setLoading(false);
            }
        };
        initialize();
    }, []);
    
    // FIX: Implemented debounced autosaving to prevent performance issues and data loss.
    // The app state is now persisted to the server 1.5 seconds after the last change.
    useEffect(() => {
        // Do not save while loading or if state is not yet initialized.
        if (loading || !appState) {
            return;
        }

        const handler = setTimeout(() => {
            const persistState = async () => {
                if (!dbRef.current) return;
                try {
                    const db = dbRef.current;
                    const stateToStore = { ...appState, classes: dbAdapter.stripPhotosForStorage(appState.classes) };
                    db.exec("INSERT OR REPLACE INTO app_data (key, data) VALUES ('main', ?)", [JSON.stringify(stateToStore)]);
                    const binaryDb = db.export();
                    versionRef.current = await dbAdapter.set(binaryDb, versionRef.current);
                    await dbAdapter.syncPhotosAfterSave(appState.classes);
                } catch (e) {
                    console.error("Failed to autosave database:", e);
                    if (e instanceof VersionConflictError) {
                        // No reintentar con la misma versión desfasada: volvería a
                        // fallar y podría machacar lo que se guardó desde el otro
                        // sitio en cuanto el conflicto se resuelva sin darse cuenta.
                        setError(e.message);
                    } else {
                        setError("Error al guardar los datos automáticamente.");
                    }
                }
            };
            persistState();
        }, 1500); // 1.5-second debounce timer

        return () => {
            clearTimeout(handler);
        };
    }, [appState, loading]); // This effect triggers on every state change.

    // Renamed from updateStateAndPersist. This now only updates React's state.
    const updateState = useCallback((updater: (prevState: AppState) => AppState) => {
        setAppState(prevState => {
            if (!prevState) return null;
            return updater(prevState);
        });
    }, []);

    const importDatabase = useCallback(async (buffer: ArrayBuffer) => {
        setLoading(true);
        try {
            const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
            const db = new SQL.Database(new Uint8Array(buffer));
            dbRef.current = db;
            const data = loadDataFromDb(db);
            if (data) {
                // El .db importado puede traer fotos embebidas (si viene de
                // exportDatabase, que las incluye para que la copia sea
                // autocontenida) — se tratan como la verdad definitiva de la
                // restauración.
                await dbAdapter.syncPhotosForImport(data.classes);
                setAppState(data);
                const stateToStore = { ...data, classes: dbAdapter.stripPhotosForStorage(data.classes) };
                dbRef.current.exec("INSERT OR REPLACE INTO app_data (key, data) VALUES ('main', ?)", [JSON.stringify(stateToStore)]);
                const binaryDb = db.export(); // Get binary data from the new DB
                // Importar es una restauración explícita y deliberada: se
                // acepta pase lo que pase en el almacén (expectedVersion null),
                // no tiene sentido bloquearla por un conflicto de versión.
                versionRef.current = await dbAdapter.set(binaryDb, null);
                alert("Base de datos importada con éxito.");
            } else {
                throw new Error("El archivo de base de datos no es válido o está vacío.");
            }
        } catch (e) {
            console.error(e);
            alert(`Error al importar la base de datos: ${e instanceof Error ? e.message : String(e)}`);
            // Optionally, reload the old state if import fails
        } finally {
            setLoading(false);
        }
    }, []);

    // Async porque la copia de seguridad manual debe ser autocontenida: se
    // embeben las fotos actuales del servidor en la fila 'main' del propio
    // fichero .db exportado (que normalmente se guarda sin ellas, ver el
    // autoguardado más arriba), para poder restaurar sin depender de que
    // sigan existiendo en Postgres más adelante.
    const exportDatabase = useCallback(async (): Promise<Uint8Array | null> => {
        if (!dbRef.current) return null;
        const db = dbRef.current;
        await dbAdapter.embedPhotosForExport(db);
        return db.export();
    }, []);

    const resetDatabase = useCallback(async () => {
        const confirmed = window.confirm(
            "¡ADVERTENCIA MÁXIMA! Esta acción es irreversible y eliminará ABSOLUTAMENTE TODOS los datos de la aplicación: clases, alumnos, calificaciones, currículo, planificaciones, TODO. La aplicación quedará completamente en blanco, lista para que introduzcas tus propios datos desde cero. ¿Estás COMPLETAMENTE seguro de que quieres borrar todo?"
        );

        if (!dbRef.current || !confirmed) {
            return;
        }

        setLoading(true);
        try {
            // Reutiliza la misma configuración académica (evaluaciones, festivos,
            // franjas horarias) que se usa al crear la base de datos por primera
            // vez, para no dejar el curso sin evaluaciones tras un restablecimiento.
            const blankState: AppState = {
                schemaVersion: CURRENT_SCHEMA_VERSION,
                classes: [],
                keyCompetences: [],
                competences: [],
                criteria: [],
                journalEntries: [],
                courses: [],
                programmingUnits: [],
                basicKnowledge: [],
                academicConfiguration: INITIAL_ACADEMIC_CONFIGURATION,
                evaluationTools: [],
                tasks: [],
                meetings: [],
                agendaNotes: [],
                shortcuts: getInitialShortcuts(),
            };
            dbRef.current.exec("INSERT OR REPLACE INTO app_data (key, data) VALUES ('main', ?)", [JSON.stringify(blankState)]);
            const binaryDb = dbRef.current.export();
            versionRef.current = await dbAdapter.set(binaryDb, null);
            await dbAdapter.resetPhotos();
            setAppState(blankState);
            alert("Todos los datos han sido borrados. La aplicación se recargará.");
            window.location.reload();
        } catch (e) {
            console.error("Failed to reset database:", e);
            setError("Error al restablecer la base de datos.");
        } finally {
            setLoading(false);
        }
    }, []);

    return { appState, loading, error, updateState, importDatabase, exportDatabase, resetDatabase };
}

// Únicas vistas que de verdad usan la clase seleccionada globalmente (el
// selector de la cabecera): el resto de vistas nuevas (Hoy, Horario, Clases,
// Tareas, Reuniones, Exámenes) no dependen de ella, así que no tiene sentido
// mostrarlo ahí.
const REPORT_VIEWS: View[] = ['criteria', 'competences', 'key-competences', 'descriptors'];

// Placeholder mientras se descarga el chunk de una vista cargada bajo
// demanda (React.lazy) — los informes y Ajustes, ver los imports de arriba.
const ViewLoadingFallback: React.FC = () => (
    <div className="flex items-center justify-center p-12 text-slate-400 text-sm">
        Cargando…
    </div>
);

const App = () => {
    const { appState, loading, error, updateState, importDatabase, exportDatabase, resetDatabase } = useDatabase();

    // shortcuts/evaluationTools: migrados al backend granular nuevo (Fase 4),
    // pero solo en web — en escritorio (Tauri) no hay comandos granulares
    // todavía (Fase 8), así que siguen viviendo en el blob local de
    // useDatabase() de arriba hasta entonces. Los hooks de react-query están
    // desactivados en escritorio (enabled: !isDesktop) para no intentar
    // llamadas de red que no tienen destino.
    const isDesktop = isTauri();
    const remoteShortcuts = useShortcuts({ enabled: !isDesktop });
    const createShortcut = useCreateShortcut();
    const updateShortcut = useUpdateShortcut();
    const deleteShortcut = useDeleteShortcut();
    const remoteEvaluationTools = useEvaluationTools({ enabled: !isDesktop });
    const createEvaluationTool = useCreateEvaluationTool();
    const updateEvaluationTool = useUpdateEvaluationTool();
    const deleteEvaluationTool = useDeleteEvaluationTool();
    const remoteKeyCompetences = useKeyCompetences({ enabled: !isDesktop });
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
    const remoteCourses = useCourses({ enabled: !isDesktop });
    const updateCourseMutation = useUpdateCourse();

    // --- UI State ---
    const [activeClassId, setActiveClassId] = useState<string>('');
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
        if (appState && !initialized) {
            // La app siempre arranca en "Hoy" (no hay ajuste en la UI para
            // cambiarlo; ignora academicConfiguration.defaultStartView, que
            // en bases de datos ya existentes puede seguir siendo 'calendar').
            setActiveView('hoy');

            if (appState.classes.length > 0) {
                const academicCourses = new Set((appState.courses || []).filter(c => c.type !== 'other').map(c => c.id));
                const firstAcademicClass = appState.classes.find(c => academicCourses.has(c.courseId));
                setActiveClassId(firstAcademicClass?.id || appState.classes[0].id);
            }
            setInitialized(true);
        }
        // setActiveView is intentionally excluded: this effect must run exactly
        // once (guarded by !initialized), and at that point activeView/isJournalDirty
        // (its own deps) are still their initial values, so there's no stale closure.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appState, initialized]);

    const activeClass = useMemo(() => {
        if (!appState) return null;
        return appState.classes.find(c => c.id === activeClassId);
    }, [appState, activeClassId]);

    const handleUpdateClass = useCallback((updatedClass: ClassData) => {
        updateState(prev => ({
            ...prev,
            classes: prev.classes.map(c => c.id === updatedClass.id ? updatedClass : c),
        }));
    }, [updateState]);

    // Guarda la tarea evaluable creada desde Favoritos (mismo mecanismo que
    // usa CalendarView para el "+" de un día en la Agenda).
    const handleSaveFavoritoAssignment = (newAssignment: Omit<Assignment, 'id'>, classId: string) => {
        const classToUpdate = classes.find(c => c.id === classId);
        if (!classToUpdate) return;
        const fullAssignment: Assignment = {
            ...newAssignment,
            id: `a-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        };
        handleUpdateClass({
            ...classToUpdate,
            assignments: [...classToUpdate.assignments, fullAssignment],
        });
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

    const handleCopyAssignment = useCallback((sourceAssignment: Assignment, targetClassId: string, targetPeriodId: string, targetCategoryId: string) => {
        updateState(prev => {
            const targetClassIndex = prev.classes.findIndex(c => c.id === targetClassId);
            if (targetClassIndex === -1) return prev;

            const newAssignment: Assignment = {
                ...sourceAssignment,
                id: `a-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                categoryId: targetCategoryId,
                evaluationPeriodId: targetPeriodId,
                // Keep name, criteria, method, etc.
                // Ensure 'recoversAssignmentIds' is cleared as it's specific to the old class context
                recoversAssignmentIds: [] 
            };

            const updatedClasses = [...prev.classes];
            updatedClasses[targetClassIndex] = {
                ...updatedClasses[targetClassIndex],
                assignments: [...updatedClasses[targetClassIndex].assignments, newAssignment]
            };

            return { ...prev, classes: updatedClasses };
        });
        alert("Tarea copiada con éxito.");
    }, [updateState]);

    const handleUpdateJournalEntry = useCallback((entry: JournalEntry) => {
        updateState(prev => {
            const existing = prev.journalEntries.find(e => e.id === entry.id);
            if (existing) {
                return { ...prev, journalEntries: prev.journalEntries.map(e => e.id === entry.id ? entry : e) };
            }
            return { ...prev, journalEntries: [...prev.journalEntries, entry] };
        });
    }, [updateState]);

    const setClassesCallback = useCallback((updater: React.SetStateAction<ClassData[]>) => updateState(prev => ({ ...prev, classes: typeof updater === 'function' ? updater(prev.classes) : updater })), [updateState]);
    const setCoursesCallback = useCallback((updater: React.SetStateAction<Course[]>) => updateState(prev => ({ ...prev, courses: typeof updater === 'function' ? updater(prev.courses) : updater })), [updateState]);
    const setKeyCompetencesCallback = useCallback((updater: React.SetStateAction<KeyCompetence[]>) => updateState(prev => ({ ...prev, keyCompetences: typeof updater === 'function' ? updater(prev.keyCompetences) : updater })), [updateState]);
    const setSpecificCompetencesCallback = useCallback((updater: React.SetStateAction<SpecificCompetence[]>) => updateState(prev => ({ ...prev, competences: typeof updater === 'function' ? updater(prev.competences) : updater })), [updateState]);
    const setEvaluationCriteriaCallback = useCallback((updater: React.SetStateAction<EvaluationCriterion[]>) => updateState(prev => ({ ...prev, criteria: typeof updater === 'function' ? updater(prev.criteria) : updater })), [updateState]);
    const setJournalEntriesCallback = useCallback((updater: React.SetStateAction<JournalEntry[]>) => updateState(prev => ({ ...prev, journalEntries: typeof updater === 'function' ? updater(prev.journalEntries) : updater })), [updateState]);
    const setBasicKnowledgeCallback = useCallback((updater: React.SetStateAction<BasicKnowledge[]>) => updateState(prev => ({ ...prev, basicKnowledge: typeof updater === 'function' ? updater(prev.basicKnowledge) : updater })), [updateState]);
    const setAcademicConfigurationCallback = useCallback((updater: React.SetStateAction<AcademicConfiguration>) => updateState(prev => ({ ...prev, academicConfiguration: typeof updater === 'function' ? updater(prev.academicConfiguration) : updater })), [updateState]);
    const setProgrammingUnitsCallback = useCallback((updater: (prev: ProgrammingUnit[]) => ProgrammingUnit[]) => updateState(prev => ({ ...prev, programmingUnits: updater(prev.programmingUnits) })), [updateState]);
    const setEvaluationToolsCallback = useCallback((updater: React.SetStateAction<EvaluationTool[]>) => updateState(prev => ({ ...prev, evaluationTools: typeof updater === 'function' ? updater(prev.evaluationTools) : updater })), [updateState]);
    const setTasksCallback = useCallback((updater: React.SetStateAction<Task[]>) => updateState(prev => ({ ...prev, tasks: typeof updater === 'function' ? updater(prev.tasks) : updater })), [updateState]);
    const setMeetingsCallback = useCallback((updater: React.SetStateAction<Meeting[]>) => updateState(prev => ({ ...prev, meetings: typeof updater === 'function' ? updater(prev.meetings) : updater })), [updateState]);
    const setAgendaNotesCallback = useCallback((updater: React.SetStateAction<AgendaNote[]>) => updateState(prev => ({ ...prev, agendaNotes: typeof updater === 'function' ? updater(prev.agendaNotes) : updater })), [updateState]);
    // Compat de escritorio para shortcuts: idéntico patrón de updater que el
    // resto de callbacks de arriba (setEvaluationToolsCallback, justo encima,
    // cumple el mismo papel para evaluationTools), pero solo se usa mientras
    // isDesktop — en web este campo del blob queda sin tocar (ver handlers
    // granulares más abajo).
    const setShortcutsCallback = useCallback((updater: React.SetStateAction<Shortcut[]>) => updateState(prev => ({ ...prev, shortcuts: typeof updater === 'function' ? updater(prev.shortcuts) : updater })), [updateState]);

    const handleCreateShortcut = useCallback((data: Omit<Shortcut, 'id'>) => {
        if (isDesktop) {
            setShortcutsCallback(prev => [...prev, { id: `sc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, ...data }]);
        } else {
            createShortcut.mutate(data);
        }
    }, [isDesktop, setShortcutsCallback, createShortcut]);

    const handleUpdateShortcut = useCallback((id: string, data: Omit<Shortcut, 'id'>) => {
        if (isDesktop) {
            setShortcutsCallback(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
        } else {
            updateShortcut.mutate({ id, data });
        }
    }, [isDesktop, setShortcutsCallback, updateShortcut]);

    const handleDeleteShortcut = useCallback((id: string) => {
        if (isDesktop) {
            setShortcutsCallback(prev => prev.filter(s => s.id !== id));
        } else {
            deleteShortcut.mutate(id);
        }
    }, [isDesktop, setShortcutsCallback, deleteShortcut]);

    const handleCreateEvaluationTool = useCallback((data: Omit<EvaluationTool, 'id'>) => {
        if (isDesktop) {
            setEvaluationToolsCallback(prev => [...prev, { ...data, id: `tool-${Date.now()}` } as EvaluationTool]);
        } else {
            createEvaluationTool.mutate(data);
        }
    }, [isDesktop, setEvaluationToolsCallback, createEvaluationTool]);

    const handleUpdateEvaluationTool = useCallback((id: string, data: Omit<EvaluationTool, 'id'>) => {
        if (isDesktop) {
            setEvaluationToolsCallback(prev => prev.map(t => t.id === id ? ({ ...t, ...data } as EvaluationTool) : t));
        } else {
            updateEvaluationTool.mutate({ id, data });
        }
    }, [isDesktop, setEvaluationToolsCallback, updateEvaluationTool]);

    const handleDeleteEvaluationTool = useCallback((id: string) => {
        if (isDesktop) {
            setEvaluationToolsCallback(prev => prev.filter(t => t.id !== id));
        } else {
            deleteEvaluationTool.mutate(id);
        }
    }, [isDesktop, setEvaluationToolsCallback, deleteEvaluationTool]);

    // keyCompetences/descriptors: a diferencia de shortcuts/evaluationTools
    // (Fase 4), CurriculumManager necesita poder encadenar estas llamadas
    // (crear una competencia clave y, con su id real, crear sus descriptores)
    // — de ahí que devuelvan Promise<...> en vez de ser "dispara y olvida".
    const handleCreateKeyCompetence = useCallback(async (data: { code: string; description: string }): Promise<KeyCompetence> => {
        if (isDesktop) {
            const newKc: KeyCompetence = { id: `kc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, ...data, descriptors: [] };
            setKeyCompetencesCallback(prev => [...prev, newKc]);
            return newKc;
        }
        return createKeyCompetence.mutateAsync(data);
    }, [isDesktop, setKeyCompetencesCallback, createKeyCompetence]);

    const handleUpdateKeyCompetence = useCallback(async (id: string, data: Partial<{ code: string; description: string }>): Promise<void> => {
        if (isDesktop) {
            setKeyCompetencesCallback(prev => prev.map(kc => kc.id === id ? { ...kc, ...data } : kc));
            return;
        }
        await updateKeyCompetence.mutateAsync({ id, data });
    }, [isDesktop, setKeyCompetencesCallback, updateKeyCompetence]);

    // Sin uso desde la UI normal (borrar KC/OD está bloqueado a propósito,
    // ver EditableItem) — solo lo usa el borrado de una etapa curricular
    // completa, que sí necesita poder quitar una competencia clave que se
    // quede sin descriptores.
    const handleDeleteKeyCompetence = useCallback(async (id: string): Promise<void> => {
        if (isDesktop) {
            setKeyCompetencesCallback(prev => prev.filter(kc => kc.id !== id));
            return;
        }
        await deleteKeyCompetence.mutateAsync(id);
    }, [isDesktop, setKeyCompetencesCallback, deleteKeyCompetence]);

    const handleCreateDescriptor = useCallback(async (keyCompetenceId: string, data: { code: string; description: string; stage?: 'eso' | 'bachillerato' }): Promise<OperationalDescriptor> => {
        if (isDesktop) {
            const newDescriptor: OperationalDescriptor = { id: `od-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, ...data };
            setKeyCompetencesCallback(prev => prev.map(kc => kc.id === keyCompetenceId ? { ...kc, descriptors: [...(kc.descriptors || []), newDescriptor] } : kc));
            return newDescriptor;
        }
        return createDescriptor.mutateAsync({ keyCompetenceId, data });
    }, [isDesktop, setKeyCompetencesCallback, createDescriptor]);

    const handleUpdateDescriptor = useCallback(async (id: string, data: Partial<{ code: string; description: string; stage: 'eso' | 'bachillerato' }>): Promise<void> => {
        if (isDesktop) {
            setKeyCompetencesCallback(prev => prev.map(kc => ({
                ...kc,
                descriptors: (kc.descriptors || []).map(d => d.id === id ? { ...d, ...data } : d),
            })));
            return;
        }
        await updateDescriptor.mutateAsync({ id, data });
    }, [isDesktop, setKeyCompetencesCallback, updateDescriptor]);

    // Igual que handleDeleteKeyCompetence: solo lo usa el borrado de etapa.
    const handleDeleteDescriptor = useCallback(async (id: string): Promise<void> => {
        if (isDesktop) {
            setKeyCompetencesCallback(prev => prev.map(kc => ({
                ...kc,
                descriptors: (kc.descriptors || []).filter(d => d.id !== id),
            })));
            return;
        }
        await deleteDescriptor.mutateAsync(id);
    }, [isDesktop, setKeyCompetencesCallback, deleteDescriptor]);

    // Único punto de escritura que CurriculumManager necesita sobre
    // "materias" (el toggle de reparto manual de pesos) — alta/edición/
    // borrado de materias vive en AcademicYearManager.tsx, no aquí.
    const handleUpdateCourse = useCallback(async (id: string, data: Partial<{ level: string; subject: string; type: 'academic' | 'other'; pesoCriteriosManual: boolean }>): Promise<void> => {
        if (isDesktop) {
            setCoursesCallback(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
            return;
        }
        await updateCourseMutation.mutateAsync({ id, data });
    }, [isDesktop, setCoursesCallback, updateCourseMutation]);

    // --- Render Logic ---
    if (loading) {
        return <div className="flex items-center justify-center min-h-screen bg-slate-100 text-slate-600">Cargando base de datos...</div>;
    }

    if (error) {
        return <div className="flex items-center justify-center min-h-screen bg-red-50 text-red-700">Error: {error}</div>;
    }

    if (!appState) {
        return <div className="flex items-center justify-center min-h-screen bg-slate-100 text-slate-600">Inicializando...</div>;
    }

    const { classes, criteria, competences, journalEntries, courses, programmingUnits, basicKnowledge, academicConfiguration, tasks, meetings, agendaNotes } = appState;
    // Fuente resuelta según plataforma (ver handlers granulares más arriba):
    // blob local en escritorio, backend nuevo en web.
    const shortcuts = isDesktop ? appState.shortcuts : (remoteShortcuts.data ?? []);
    const evaluationTools = isDesktop ? appState.evaluationTools : (remoteEvaluationTools.data ?? []);
    const keyCompetences = isDesktop ? appState.keyCompetences : (remoteKeyCompetences.data ?? []);
    // Ver comentario junto a useCourses() más arriba: lista de materias
    // separada de `courses` (el curso del blob viejo), solo para
    // CurriculumManager/ProgrammingManager.
    const curriculumCourses = isDesktop ? courses : (remoteCourses.data ?? []);
    const academicClasses = classes.filter(c => courses.find(course => course.id === c.courseId)?.type !== 'other');

    const renderContent = () => {
        // Vistas que no requieren una clase activa
        if (activeView === 'journal') {
            return <ClassJournal
                classes={classes}
                entries={journalEntries}
                onSave={handleUpdateJournalEntry}
                academicConfiguration={academicConfiguration}
                units={programmingUnits}
                courses={courses}
                onDirtyChange={setIsJournalDirty}
            />;
        }

        if (activeView === 'hoy') {
            return <HoyView
                classes={classes}
                courses={courses}
                academicConfiguration={academicConfiguration}
                tasks={tasks}
                setTasks={setTasksCallback}
                meetings={meetings}
                setActiveView={setActiveView}
                setActiveClassId={setActiveClassId}
            />;
        }

        if (activeView === 'horario') {
            return <HorarioView
                classes={classes}
                courses={courses}
                academicConfiguration={academicConfiguration}
                setActiveView={setActiveView}
                setActiveClassId={setActiveClassId}
            />;
        }

        if (activeView === 'clases') {
            return <ClasesView
                classes={classes}
                courses={courses}
                academicConfiguration={academicConfiguration}
                criteria={criteria}
                specificCompetences={competences}
                keyCompetences={keyCompetences}
                onUpdateClass={handleUpdateClass}
                setActiveView={setActiveView}
                setActiveClassId={setActiveClassId}
            />;
        }

        if (activeView === 'meetings') {
            return <ReunionesView
                meetings={meetings}
                setMeetings={setMeetingsCallback}
                openMeetingId={meetingToOpenId}
                onOpened={() => setMeetingToOpenId(null)}
            />;
        }

        if (activeView === 'exams') {
            return <ExamenesView
                classes={classes}
                courses={courses}
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
                            {academicClasses.sort((a, b) => getClassName(a, courses).localeCompare(getClassName(b, courses))).map(cls => (
                                <button
                                    key={cls.id}
                                    onClick={() => setActiveClassId(cls.id)}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300`}
                                >
                                    <ClassLabel classData={cls} courses={courses} />
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

        if (REPORT_VIEWS.includes(activeView)) {
            const activeClassCriteria = criteria.filter(c => c.courseId === activeClass?.courseId).sort((a, b) => compararCodigo(a.code, b.code));
            const activeClassCompetences = competences.filter(sc => sc.courseId === activeClass?.courseId).sort((a, b) => compararCodigo(a.code, b.code));
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
                                {academicClasses.map(c => <option key={c.id} value={c.id}>{formatClassLabel(c, courses)}</option>)}
                            </Select>
                        )}
                    </div>

                    <React.Suspense fallback={<ViewLoadingFallback />}>
                        {activeView === 'criteria' && activeClass && <CriteriaAchievement classData={activeClass} criteria={activeClassCriteria} competences={activeClassCompetences} academicConfiguration={academicConfiguration} />}
                        {activeView === 'competences' && activeClass && <SpecificCompetenceAchievement classData={activeClass} courses={courses} competences={activeClassCompetences} keyCompetences={keyCompetences} criteria={activeClassCriteria} academicConfiguration={academicConfiguration} />}
                        {activeView === 'key-competences' && activeClass && <KeyCompetenceAchievement classData={activeClass} courses={courses} competences={activeClassCompetences} keyCompetences={keyCompetences} criteria={activeClassCriteria} academicConfiguration={academicConfiguration} />}
                        {activeView === 'descriptors' && activeClass && <DescriptorAchievement classData={activeClass} keyCompetences={keyCompetences} courses={courses} />}
                    </React.Suspense>
                </>
            );
        }

        switch (activeView) {
            case 'gradebook':
                return activeClass && <GradebookTable 
                    classData={activeClass} 
                    allClasses={classes} 
                    allCourses={courses}
                    criteria={criteria.filter(c => c.courseId === activeClass.courseId).sort((a, b) => compararCodigo(a.code, b.code))}
                    specificCompetences={competences.filter(sc => sc.courseId === activeClass.courseId).sort((a, b) => compararCodigo(a.code, b.code))}
                    keyCompetences={keyCompetences} 
                    programmingUnits={programmingUnits} 
                    academicConfiguration={academicConfiguration} 
                    setAcademicConfiguration={setAcademicConfigurationCallback} 
                    onUpdateClass={handleUpdateClass} 
                    evaluationTools={evaluationTools}
                    setActiveClassId={setActiveClassId} // Pass setter for internal tab navigation
                    onCopyAssignment={handleCopyAssignment}
                />;
            case 'calendar':
                return <CalendarView 
                    units={programmingUnits} 
                    setUnits={setProgrammingUnitsCallback} 
                    courses={courses} 
                    academicConfiguration={academicConfiguration} 
                    classes={classes} 
                    journalEntries={journalEntries} 
                    onUpdateClass={handleUpdateClass} 
                    criteria={criteria}
                    specificCompetences={competences}
                    keyCompetences={keyCompetences}
                    onSaveJournalEntry={handleUpdateJournalEntry}
                    agendaNotes={agendaNotes}
                    setAgendaNotes={setAgendaNotesCallback}
                    meetings={meetings}
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
                        {/* Informes y Cuaderno usan la clase seleccionada aquí */}
                        {(REPORT_VIEWS.includes(activeView) || activeView === 'gradebook') && academicClasses.length > 0 && (
                            <Select
                                value={activeClassId}
                                onChange={(e) => setActiveClassId(e.target.value)}
                                className="font-semibold"
                            >
                                {academicClasses.map(c => <option key={c.id} value={c.id}>{formatClassLabel(c, courses)}</option>)}
                            </Select>
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
                        classes={classes} setClasses={setClassesCallback}
                        courses={courses} setCourses={setCoursesCallback}
                        curriculumCourses={curriculumCourses}
                        onUpdateCourse={handleUpdateCourse}
                        keyCompetences={keyCompetences}
                        onCreateKeyCompetence={handleCreateKeyCompetence}
                        onUpdateKeyCompetence={handleUpdateKeyCompetence}
                        onDeleteKeyCompetence={handleDeleteKeyCompetence}
                        onCreateDescriptor={handleCreateDescriptor}
                        onUpdateDescriptor={handleUpdateDescriptor}
                        onDeleteDescriptor={handleDeleteDescriptor}
                        specificCompetences={competences} setSpecificCompetences={setSpecificCompetencesCallback}
                        evaluationCriteria={criteria} setEvaluationCriteria={setEvaluationCriteriaCallback}
                        journalEntries={journalEntries} setJournalEntries={setJournalEntriesCallback}
                        basicKnowledge={basicKnowledge} setBasicKnowledge={setBasicKnowledgeCallback}
                        academicConfiguration={academicConfiguration} setAcademicConfiguration={setAcademicConfigurationCallback}
                        programmingUnits={programmingUnits} setProgrammingUnits={setProgrammingUnitsCallback}
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
                classes={classes}
                courses={courses}
                keyCompetences={keyCompetences}
                specificCompetences={competences}
                evaluationCriteria={criteria}
                programmingUnits={programmingUnits}
                basicKnowledge={basicKnowledge}
                academicConfiguration={academicConfiguration}
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
                    classes={classes}
                    courses={courses}
                    criteria={criteria}
                    specificCompetences={competences}
                    keyCompetences={keyCompetences}
                    academicConfiguration={academicConfiguration}
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
                    classes={classes}
                    courses={courses}
                    academicConfiguration={academicConfiguration}
                    entries={journalEntries}
                    onSave={handleUpdateJournalEntry}
                />
            )}
        </div>
    );
};

export default App;
