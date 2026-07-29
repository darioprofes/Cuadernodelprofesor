
import React, { useState } from 'react';
import Modal from './Modal';
import { UserGroupIcon, AcademicCapIcon, ArrowDownTrayIcon, BookOpenIcon, ClockIcon, CalendarDaysIcon, ListBulletIcon, BeakerIcon } from './Icons';
import type { ClassData, Course, KeyCompetence, SpecificCompetence, EvaluationCriterion, JournalEntry, AcademicConfiguration, BasicKnowledge, ProgrammingUnit, EvaluationTool } from '../types';
import CurriculumManager from './CurriculumManager';
import ProgrammingManager from './ProgrammingManager';
import EvaluationToolManager from './EvaluationToolManager';
import ClassManager from './settings/ClassManager';
import ScheduleManager from './settings/ScheduleManager';
import CourseManager from './settings/CourseManager';
import AcademicConfigManager from './settings/AcademicConfigManager';
import BackupManager from './settings/BackupManager';
import { SEMANTIC } from '../theme/palette';

export interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenExportModal: () => void;
    courses: Course[];
    setCourses: (updater: React.SetStateAction<Course[]>) => void;
    classes: ClassData[];
    setClasses: (updater: React.SetStateAction<ClassData[]>) => void;
    keyCompetences: KeyCompetence[];
    setKeyCompetences: (updater: React.SetStateAction<KeyCompetence[]>) => void;
    specificCompetences: SpecificCompetence[];
    setSpecificCompetences: (updater: React.SetStateAction<SpecificCompetence[]>) => void;
    evaluationCriteria: EvaluationCriterion[];
    setEvaluationCriteria: (updater: React.SetStateAction<EvaluationCriterion[]>) => void;
    journalEntries: JournalEntry[];
    setJournalEntries: (updater: React.SetStateAction<JournalEntry[]>) => void;
    importDatabase: (buffer: ArrayBuffer) => Promise<void>;
    exportDatabase: () => Promise<Uint8Array | null>;
    resetDatabase: () => Promise<void>;
    basicKnowledge: BasicKnowledge[];
    setBasicKnowledge: (updater: React.SetStateAction<BasicKnowledge[]>) => void;
    academicConfiguration: AcademicConfiguration;
    setAcademicConfiguration: (updater: React.SetStateAction<AcademicConfiguration>) => void;
    programmingUnits: ProgrammingUnit[];
    setProgrammingUnits: (updater: (prev: ProgrammingUnit[]) => ProgrammingUnit[]) => void;
    evaluationTools: EvaluationTool[];
    setEvaluationTools: (updater: React.SetStateAction<EvaluationTool[]>) => void;
}

type SettingsView = 'classes' | 'schedule' | 'courses' | 'academicConfig' | 'curriculum' | 'planner' | 'evaluationTools' | 'backup';

const SettingsModal: React.FC<SettingsModalProps> = (props) => {
    const { isOpen, onClose, classes, setClasses, courses, setCourses, onOpenExportModal, academicConfiguration, setAcademicConfiguration, programmingUnits, setProgrammingUnits, evaluationTools, setEvaluationTools, evaluationCriteria } = props;
    const [activeView, setActiveView] = useState<SettingsView>('academicConfig');

    const renderView = () => {
        switch (activeView) {
            case 'classes':
                return <ClassManager classes={classes} setClasses={setClasses} courses={courses} academicConfiguration={academicConfiguration} />;
            case 'schedule':
                return <ScheduleManager classes={classes} setClasses={setClasses} courses={courses} setCourses={setCourses} academicConfiguration={academicConfiguration} setAcademicConfiguration={setAcademicConfiguration} />;
            case 'courses':
                return <CourseManager courses={courses} setCourses={setCourses} classes={classes} setClasses={setClasses} />;
             case 'academicConfig':
                return <AcademicConfigManager academicConfiguration={academicConfiguration} setAcademicConfiguration={setAcademicConfiguration} />;
            case 'curriculum':
                return <CurriculumManager {...props} />;
            case 'planner':
                return <ProgrammingManager
                    courses={courses}
                    units={programmingUnits}
                    setUnits={setProgrammingUnits}
                    criteria={props.evaluationCriteria}
                    basicKnowledge={props.basicKnowledge}
                    classes={classes}
                    academicConfiguration={academicConfiguration}
                />;
            case 'evaluationTools':
                return <EvaluationToolManager
                    evaluationTools={evaluationTools}
                    setEvaluationTools={setEvaluationTools}
                    criteria={evaluationCriteria}
                    courses={courses}
                    classes={classes}
                    setClasses={setClasses}
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
                        <SettingsNavItem icon={<CalendarDaysIcon />} label="Configuración del Curso" view="academicConfig" activeView={activeView} setActiveView={setActiveView} />
                        <SettingsNavItem icon={<BookOpenIcon />} label="Cursos y Materias" view="courses" activeView={activeView} setActiveView={setActiveView} />
                        <SettingsNavItem icon={<UserGroupIcon />} label="Clases y Alumnado" view="classes" activeView={activeView} setActiveView={setActiveView} />
                        <SettingsNavItem icon={<ClockIcon />} label="Horario Semanal" view="schedule" activeView={activeView} setActiveView={setActiveView} />
                        <SettingsNavItem icon={<AcademicCapIcon />} label="Gestionar Currículo" view="curriculum" activeView={activeView} setActiveView={setActiveView} />
                        <SettingsNavItem icon={<ListBulletIcon />} label="Planificación UD" view="planner" activeView={activeView} setActiveView={setActiveView} />
                        <SettingsNavItem icon={<BeakerIcon />} label="Instrumentos Evaluación" view="evaluationTools" activeView={activeView} setActiveView={setActiveView} />
                    </ul>
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
