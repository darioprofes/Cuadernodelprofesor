
import React, { useState } from 'react';
import Modal from './Modal';
import { UserGroupIcon, ArrowDownTrayIcon, BookOpenIcon, ClockIcon, CalendarDaysIcon, BeakerIcon, AcademicCapIcon, ListBulletIcon } from './Icons';
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

type SettingsView = 'classes' | 'schedule' | 'courses' | 'academicConfig' | 'curriculum' | 'planner' | 'evaluationTools' | 'backup';

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
            case 'classes':
                return <ClassManager courses={curriculumCourses} />;
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
            case 'backup':
                return <BackupManager {...props} onOpenExportModal={onOpenExportModal} />;
            default:
                return null;
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Ajustes de la Aplicación" size="5xl">
            <div className="flex flex-col md:flex-row gap-8 min-h-[60vh]">
                <nav className="flex-shrink-0 md:w-56 flex flex-col">
                    <ul className="space-y-2">
                        <SettingsNavItem icon={<CalendarDaysIcon />} label="Curso Académico" view="academicConfig" activeView={activeView} setActiveView={setActiveView} />
                        <SettingsNavItem icon={<BookOpenIcon />} label="Materias" view="courses" activeView={activeView} setActiveView={setActiveView} />
                        <SettingsNavItem icon={<AcademicCapIcon />} label="Gestionar Currículo" view="curriculum" activeView={activeView} setActiveView={setActiveView} />
                        <SettingsNavItem icon={<ListBulletIcon />} label="Planificación UD" view="planner" activeView={activeView} setActiveView={setActiveView} />
                    </ul>
                    <div className="mt-4 pt-4 border-t">
                        <ul className="space-y-2">
                            <SettingsNavItem icon={<UserGroupIcon />} label="Clases y Alumnado" view="classes" activeView={activeView} setActiveView={setActiveView} />
                            <SettingsNavItem icon={<ClockIcon />} label="Horario Semanal" view="schedule" activeView={activeView} setActiveView={setActiveView} />
                        </ul>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                        <ul className="space-y-2">
                            <SettingsNavItem icon={<BeakerIcon />} label="Instrumentos Evaluación" view="evaluationTools" activeView={activeView} setActiveView={setActiveView} />
                        </ul>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                         <SettingsNavItem icon={<ArrowDownTrayIcon />} label="Copia de Seguridad" view="backup" activeView={activeView} setActiveView={setActiveView} />
                    </div>
                </nav>
                <main className="flex-grow min-w-0 pr-2">
                    {renderView()}
                </main>
            </div>
        </Modal>
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

export default SettingsModal;
