
import React, { useState } from 'react';
import Modal from './Modal';
import { UserGroupIcon, ArrowDownTrayIcon, BookOpenIcon, ClockIcon, CalendarDaysIcon, BeakerIcon, AcademicCapIcon, ListBulletIcon, InformationCircleIcon } from './Icons';
import type { ClassData, Course, KeyCompetence, OperationalDescriptor, SpecificCompetence, EvaluationCriterion, AcademicConfiguration, BasicKnowledge, ProgrammingUnit, EvaluationTool } from '../types';
import EvaluationToolManager from './EvaluationToolManager';
import CurriculumManager from './CurriculumManager';
import ProgrammingManager from './ProgrammingManager';
import ClassManager from './settings/ClassManager';
import ScheduleManager from './settings/ScheduleManager';
import CourseManager from './settings/CourseManager';
import AcademicConfigManager from './settings/AcademicConfigManager';
import AcademicYearManager from './settings/AcademicYearManager';
import BackupManager from './settings/BackupManager';
import Select from './Select';
import { SEMANTIC } from '../theme/palette';

export interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenExportModal: () => void;
    // courses: solo lectura, para el chequeo de integridad de BackupManager
    // (healthCheck) — CurriculumManager/ProgrammingManager/etc. ya hablan
    // directo con el backend granular y no necesitan un setter aquí.
    courses: Course[];
    curriculumCourses: Course[];
    onUpdateCourse: (id: string, data: Partial<{ level: string; subject: string; type: 'academic' | 'other'; pesoCriteriosManual: boolean }>) => Promise<void>;
    classes: ClassData[];
    keyCompetences: KeyCompetence[];
    onCreateKeyCompetence: (data: { code: string; description: string }) => Promise<KeyCompetence>;
    onUpdateKeyCompetence: (id: string, data: Partial<{ code: string; description: string }>) => Promise<void>;
    onDeleteKeyCompetence: (id: string) => Promise<void>;
    onCreateDescriptor: (keyCompetenceId: string, data: { code: string; description: string; stage?: 'eso' | 'bachillerato' }) => Promise<OperationalDescriptor>;
    onUpdateDescriptor: (id: string, data: Partial<{ code: string; description: string; stage: 'eso' | 'bachillerato' }>) => Promise<void>;
    onDeleteDescriptor: (id: string) => Promise<void>;
    specificCompetences: SpecificCompetence[];
    evaluationCriteria: EvaluationCriterion[];
    importDatabase: (buffer: ArrayBuffer) => Promise<void>;
    exportDatabase: () => Promise<Uint8Array>;
    resetDatabase: () => Promise<void>;
    basicKnowledge: BasicKnowledge[];
    academicConfiguration: AcademicConfiguration;
    setAcademicConfiguration: (updater: React.SetStateAction<AcademicConfiguration>) => void;
    programmingUnits: ProgrammingUnit[];
    evaluationTools: EvaluationTool[];
    onCreateEvaluationTool: (data: Omit<EvaluationTool, 'id'>) => void;
    onUpdateEvaluationTool: (id: string, data: Omit<EvaluationTool, 'id'>) => void;
    onDeleteEvaluationTool: (id: string) => void;
}

type SettingsView = 'schedule' | 'courses' | 'academicConfig' | 'curriculum' | 'planner' | 'evaluationTools' | 'evaluationInfo' | 'backup';

const SettingsModal: React.FC<SettingsModalProps> = (props) => {
    const {
        isOpen, onClose, classes, courses, curriculumCourses, onUpdateCourse,
        onOpenExportModal, academicConfiguration, setAcademicConfiguration, evaluationTools,
        onCreateEvaluationTool, onUpdateEvaluationTool, onDeleteEvaluationTool, evaluationCriteria,
        keyCompetences, onCreateKeyCompetence, onUpdateKeyCompetence, onDeleteKeyCompetence,
        onCreateDescriptor, onUpdateDescriptor, onDeleteDescriptor,
        basicKnowledge, programmingUnits,
    } = props;
    const [activeView, setActiveView] = useState<SettingsView>('academicConfig');
    // "Clases y Alumnado" abre en su propia ventana en vez de compartir el
    // panel de contenido de Ajustes: es la pantalla con más información de
    // toda la app (doble columna alumnado/clase) y el nav de 224px de ancho
    // le restaba demasiado sitio — ver petición explícita del usuario.
    const [isClassManagerOpen, setIsClassManagerOpen] = useState(false);
    // Currículo/Planificación UD se gestionan por materia, pero a diferencia
    // de la vista de Materia de la cabecera (que exige elegir Año→Materia
    // primero), aquí se accede directamente desde Ajustes — de ahí un
    // selector propio, independiente del contexto activo de la cabecera.
    const materiasDisponibles = curriculumCourses.filter(c => c.type !== 'other');
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const effectiveCourseId = selectedCourseId && materiasDisponibles.some(c => c.id === selectedCourseId)
        ? selectedCourseId
        : (materiasDisponibles[0]?.id ?? '');

    const materiaSelector = (
        <div className="mb-4">
            <label className="text-xs text-slate-500">Materia</label>
            <Select value={effectiveCourseId} onChange={e => setSelectedCourseId(e.target.value)} className="w-full max-w-sm">
                {materiasDisponibles.length === 0 && <option value="">Sin materias todavía</option>}
                {materiasDisponibles.map(c => (
                    <option key={c.id} value={c.id}>{c.level} - {c.subject}</option>
                ))}
            </Select>
        </div>
    );

    const renderView = () => {
        switch (activeView) {
            case 'schedule':
                return <ScheduleManager courses={curriculumCourses} academicConfiguration={academicConfiguration} setAcademicConfiguration={setAcademicConfiguration} />;
            case 'courses':
                return <CourseManager courses={curriculumCourses} />;
             case 'academicConfig':
                // Fusionado en Fase 8 (bloque 5): antes "Cursos Académicos"
                // (gestión de años) y "Configuración del Curso" (fechas/
                // festivos/franjas/periodos) eran dos pestañas distintas con
                // nombres casi idénticos — mismo solape que ya se arregló
                // con "Cursos y Materias" en el bloque 2.
                return (
                    <div className="space-y-8">
                        <AcademicYearManager />
                        <hr />
                        <AcademicConfigManager academicConfiguration={academicConfiguration} setAcademicConfiguration={setAcademicConfiguration} />
                    </div>
                );
            case 'curriculum':
                return (
                    <div>
                        {materiaSelector}
                        {effectiveCourseId ? (
                            <CurriculumManager
                                courseId={effectiveCourseId}
                                courses={curriculumCourses}
                                onUpdateCourse={onUpdateCourse}
                                keyCompetences={keyCompetences}
                                onCreateKeyCompetence={onCreateKeyCompetence}
                                onUpdateKeyCompetence={onUpdateKeyCompetence}
                                onDeleteKeyCompetence={onDeleteKeyCompetence}
                                onCreateDescriptor={onCreateDescriptor}
                                onUpdateDescriptor={onUpdateDescriptor}
                                onDeleteDescriptor={onDeleteDescriptor}
                            />
                        ) : (
                            <p className="text-sm text-slate-500">Da de alta una materia en "Materias" antes de gestionar su currículo.</p>
                        )}
                    </div>
                );
            case 'planner':
                return (
                    <div>
                        {materiaSelector}
                        {effectiveCourseId ? (
                            <ProgrammingManager
                                courseId={effectiveCourseId}
                                courses={curriculumCourses}
                                classes={classes}
                                academicConfiguration={academicConfiguration}
                            />
                        ) : (
                            <p className="text-sm text-slate-500">Da de alta una materia en "Materias" antes de planificar sus unidades didácticas.</p>
                        )}
                    </div>
                );
            case 'evaluationTools':
                return <EvaluationToolManager
                    evaluationTools={evaluationTools}
                    onCreate={onCreateEvaluationTool}
                    onUpdate={onUpdateEvaluationTool}
                    onDelete={onDeleteEvaluationTool}
                    criteria={evaluationCriteria}
                    courses={courses}
                />;
            case 'evaluationInfo':
                return <EvaluationInfoPanel />;
            case 'backup':
                return <BackupManager {...props} onOpenExportModal={onOpenExportModal} />;
            default:
                return null;
        }
    };

    return (
        <>
        <Modal isOpen={isOpen} onClose={onClose} title="Ajustes de la Aplicación" size="5xl">
            <div className="flex flex-col md:flex-row gap-8 min-h-[60vh]">
                <nav className="flex-shrink-0 md:w-56 flex flex-col">
                    {/* Grupo 1: qué se imparte y a quién — curso académico,
                        materias, alumnado matriculado y cuándo/dónde se da
                        cada clase. */}
                    <ul className="space-y-2">
                        <SettingsNavItem icon={<CalendarDaysIcon />} label="Curso Académico" view="academicConfig" activeView={activeView} setActiveView={setActiveView} />
                        <SettingsNavItem icon={<BookOpenIcon />} label="Materias" view="courses" activeView={activeView} setActiveView={setActiveView} />
                        <li>
                            <button
                                onClick={() => setIsClassManagerOpen(true)}
                                className="w-full flex items-center p-2 rounded-lg text-left text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100"
                            >
                                <UserGroupIcon className="w-5 h-5 mr-3" />
                                Clases y Alumnado
                            </button>
                        </li>
                        <SettingsNavItem icon={<ClockIcon />} label="Horario Semanal" view="schedule" activeView={activeView} setActiveView={setActiveView} />
                    </ul>
                    {/* Grupo 2: cómo se evalúa — currículo, programación de
                        unidades e instrumentos son las tres piezas que
                        alimentan el cuaderno de notas. */}
                    <div className="mt-4 pt-4 border-t">
                        <ul className="space-y-2">
                            <SettingsNavItem icon={<AcademicCapIcon />} label="Gestionar Currículo" view="curriculum" activeView={activeView} setActiveView={setActiveView} />
                            <SettingsNavItem icon={<ListBulletIcon />} label="Planificación UD" view="planner" activeView={activeView} setActiveView={setActiveView} />
                            <SettingsNavItem icon={<BeakerIcon />} label="Instrumentos Evaluación" view="evaluationTools" activeView={activeView} setActiveView={setActiveView} />
                            <SettingsNavItem icon={<InformationCircleIcon />} label="Ajustes de Evaluación" view="evaluationInfo" activeView={activeView} setActiveView={setActiveView} />
                        </ul>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                         <SettingsNavItem icon={<ArrowDownTrayIcon />} label="Restablecer y Copia de Seguridad" view="backup" activeView={activeView} setActiveView={setActiveView} />
                    </div>
                </nav>
                <main className="flex-grow min-w-0 pr-2">
                    {renderView()}
                </main>
            </div>
        </Modal>
        <Modal isOpen={isClassManagerOpen} onClose={() => setIsClassManagerOpen(false)} title="Clases y Alumnado" size="6xl">
            <ClassManager courses={curriculumCourses} />
        </Modal>
        </>
    );
};

const SettingsNavItem = ({ icon, label, view, activeView, setActiveView }: {
    icon: React.ReactElement<{ className?: string }>;
    label: string;
    view: SettingsView;
    activeView: SettingsView;
    setActiveView: (view: SettingsView) => void;
}) => (
    <li>
        <button
            onClick={() => setActiveView(view)}
            className={`w-full flex items-center p-2 rounded-lg text-left text-sm font-medium transition-colors ${
                activeView === view ? '' : 'text-slate-600 hover:bg-slate-100'
            }`}
            style={activeView === view ? { backgroundColor: SEMANTIC.primary.soft, color: SEMANTIC.primary.softText } : undefined}
        >
            {React.cloneElement(icon, { className: 'w-5 h-5 mr-3' })}
            {label}
        </button>
    </li>
);

// Explica dónde se configura cada pieza de la evaluación — pedido por el
// usuario porque el reparto real está partido entre "Gestionar Currículo"
// (que define los criterios y su peso) y el propio cuaderno de notas (que
// define categorías/tareas), sin que ninguna pantalla lo deje claro por sí
// sola. No lee ni escribe ningún dato: es solo texto de referencia.
const EvaluationInfoPanel: React.FC = () => (
    <div className="space-y-5 text-sm text-slate-700 max-w-2xl">
        <h3 className="text-xl font-bold text-slate-800">Ajustes de Evaluación</h3>
        <p className="text-slate-500">
            El cuaderno calcula dos notas en paralelo, con configuraciones independientes. La mayoría de clases solo usan una de las dos — no hace falta rellenar ambas.
        </p>

        <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
            <h4 className="font-semibold text-slate-800">1. Evaluación por Categorías (tradicional, % sobre 10)</h4>
            <p>Nota de un periodo = media ponderada de sus <strong>Categorías</strong> (p.ej. "Exámenes 60%, Trabajos 40%"), y la nota de cada categoría sale de sus <strong>Tareas evaluables</strong>.</p>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li>Categorías y tareas se crean dentro del <strong>Cuaderno de notas</strong> de cada clase, no aquí en Ajustes.</li>
                <li>Cada tarea puede llevar un "peso en categoría" propio; sin él, se reparte a partes iguales entre las tareas de esa categoría.</li>
                <li>Una tarea se califica con nota directa o con un <strong>Instrumento de Evaluación</strong> (checklist/escala/rúbrica) — esos instrumentos se crean en "Instrumentos Evaluación".</li>
                <li>Los <strong>Periodos de Evaluación</strong> que agrupan las categorías se definen en "Curso Académico".</li>
            </ul>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
            <h4 className="font-semibold text-slate-800">2. Evaluación por Criterios (competencial)</h4>
            <p>Nota de un <strong>Criterio de Evaluación</strong> = combinación de todas las tareas del curso marcadas como evidencia suya, cada una con su "importancia" (peso). No hay total fijo de antemano: se va acumulando durante todo el año.</p>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li>Los criterios (y las competencias específicas/saberes básicos que agrupan) se dan de alta por materia en <strong>Gestionar Currículo</strong>.</li>
                <li>Ahí mismo se decide el peso de cada criterio dentro de la materia: reparto automático a partes iguales, o manual (los pesos deben sumar 100%).</li>
                <li>Qué criterios evidencia una tarea, y con qué importancia, se marca al crear esa tarea en el Cuaderno de notas.</li>
                <li>Las Unidades Didácticas de <strong>Planificación UD</strong> pueden vincularse a criterios/saberes, pero eso es solo planificación — no afecta a la nota, que siempre sale de las tareas evaluables reales.</li>
            </ul>
        </div>

        <p className="text-xs text-slate-400">
            En resumen: "Curso Académico" fija los periodos, "Gestionar Currículo" fija los criterios y sus pesos, "Instrumentos Evaluación" prepara las plantillas de calificación reutilizables, y el Cuaderno de notas de cada clase es donde se decide, tarea a tarea, qué categoría y qué criterios evidencia.
        </p>
    </div>
);

export default SettingsModal;
