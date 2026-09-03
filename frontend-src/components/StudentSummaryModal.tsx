
import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import Badge from './Badge';
import Tabs from './Tabs';
import type { Student, ClassData, EvaluationPeriod, EvaluationCriterion, SpecificCompetence, KeyCompetence, AcademicConfiguration, Course, Tutor } from '../types';
import { getMateria, formatFechaEs, getNombreCompleto } from '../utils';
import AcneaeTag from './AcneaeTag';
import {
    calculateOverallFinalGradeForStudent,
    calculateEvaluationPeriodGradeForStudent,
    calculateAssignmentScoresForStudent,
    calculateStudentKeyCompetenceGrades,
    calculateStudentCompetenceGrades,
    calculateStudentCriterionGrades,
    calculateFinalGradeCriterial,
    calculatePeriodGradeCriterial,
    getGradeColorClass
} from '../services/gradeCalculations';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardDocumentIcon } from './Icons';
import { TYPOGRAPHY } from '../theme/typography';
import { linkClassName } from '../theme/components/Link';
import StudentPhotoAvatar from './StudentPhotoAvatar';

interface StudentSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    // Abre directamente en la ficha completa de solo lectura en vez del
    // resumen de calificaciones/evolución — usado por el "Ver ficha" del
    // menú contextual, que debe llevar al mismo contenido que "Editar
    // ficha" (StudentPersonalDataModal) pero sin poder modificarlo.
    initialShowFullFicha?: boolean;
    student: Student;
    classData: ClassData;
    courses: Course[];
    academicConfiguration: AcademicConfiguration;
    criteria: EvaluationCriterion[];
    specificCompetences: SpecificCompetence[];
    keyCompetences: KeyCompetence[];
    repartoIgualCriterios: boolean;
    // Anterior/Siguiente en la ficha completa de solo lectura (visor rápido
    // "como la edición rápida, pero de solo lectura") -- solo ahí, no en las
    // pestañas de calificaciones/evolución, que no se pidieron navegables.
    // `students` es el mismo roster que ya usa StudentFlagsModal.
    students: Student[];
    onChangeStudent: (student: Student) => void;
}

const StudentSummaryModal: React.FC<StudentSummaryModalProps> = ({
    isOpen, onClose, initialShowFullFicha = false, student, classData, courses, academicConfiguration, criteria, specificCompetences, keyCompetences, repartoIgualCriterios, students, onChangeStudent
}) => {
    const [activeTab, setActiveTab] = useState<'personal' | 'evolution' | 'competences' | 'criteria'>('personal');
    const [showFullFicha, setShowFullFicha] = useState(initialShowFullFicha);

    // Nota oficial (motor de criterios); la de categorías se mantiene como
    // comparación con el sistema tradicional.
    const finalGradeCriterial = useMemo(() =>
        calculateFinalGradeCriterial(student.id, classData, criteria, repartoIgualCriterios, academicConfiguration.gradeScale),
    [student.id, classData, criteria, repartoIgualCriterios, academicConfiguration.gradeScale]);

    const finalGradeCategorias = useMemo(() =>
        calculateOverallFinalGradeForStudent(student.id, classData, academicConfiguration),
    [student.id, classData, academicConfiguration]);

    const renderTabContent = () => {
        switch (activeTab) {
            case 'personal':
                return <PersonalDataTab student={student} classData={classData} courses={courses} onOpenFullFicha={() => setShowFullFicha(true)} />;
            case 'evolution':
                return <EvolutionTab student={student} classData={classData} academicConfiguration={academicConfiguration} criteria={criteria} repartoIgualCriterios={repartoIgualCriterios} />;
            case 'competences':
                return <CompetencesTab
                    student={student}
                    classData={classData}
                    criteria={criteria}
                    specificCompetences={specificCompetences}
                    keyCompetences={keyCompetences}
                    academicConfiguration={academicConfiguration}
                    repartoIgualCriterios={repartoIgualCriterios}
                />;
            case 'criteria':
                return <CriteriaTab student={student} classData={classData} criteria={criteria} specificCompetences={specificCompetences} academicConfiguration={academicConfiguration} />;
            default:
                return null;
        }
    };

    // Anterior/Siguiente sobre el mismo roster que ya usa StudentFlagsModal
    // -- vale para las 4 pestañas (Datos Personales incluida la ficha
    // completa, Evolución, Competencial, Criterios): todas dependen de
    // `student`/`student.id` vía props, así que cambiarlo aquí arriba ya
    // recalcula el resto sin más cambios.
    const studentIndex = students.findIndex(s => s.id === student.id);
    const goToStudent = (newIndex: number) => onChangeStudent(students[newIndex]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Seguimiento" size="4xl">
            <div className="flex flex-col h-full max-h-[80vh]">
                {students.length > 1 && (
                    <div className="flex items-center justify-end gap-1 mb-2 flex-shrink-0">
                        <button
                            type="button"
                            onClick={() => goToStudent(studentIndex - 1)}
                            disabled={studentIndex <= 0}
                            className="p-1 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Alumno/a anterior"
                        >
                            <ChevronLeftIcon className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-slate-400 px-1">{studentIndex + 1} de {students.length}</span>
                        <button
                            type="button"
                            onClick={() => goToStudent(studentIndex + 1)}
                            disabled={studentIndex < 0 || studentIndex >= students.length - 1}
                            className="p-1 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Siguiente alumno/a"
                        >
                            <ChevronRightIcon className="w-4 h-4" />
                        </button>
                    </div>
                )}
                {showFullFicha ? (
                    <div className="flex-1 overflow-y-auto min-h-0 pr-2">
                        <FullFichaScreen student={student} classData={classData} courses={courses} onBack={() => setShowFullFicha(false)} />
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6 pb-4 border-b">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <h2 className="text-2xl font-bold text-slate-800">{getNombreCompleto(student)}</h2>
                                    <AcneaeTag tags={student.acneae} />
                                </div>
                                <div className="flex gap-2 text-sm text-slate-500">
                                    {student.acneae.length > 0 && <span>Medidas: {student.acneae.join(', ')}</span>}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-slate-500 uppercase tracking-wide font-semibold">Nota Final Curso</p>
                                <div className={`text-3xl font-extrabold px-3 py-1 rounded-lg inline-block mt-1 ${finalGradeCriterial.styleClasses}`}>
                                    {finalGradeCriterial.grade?.toFixed(2) ?? '-'}
                                </div>
                                <p className="text-xs text-slate-400 mt-1" title="Nota de comparación por categorías (tradicional)">cat: {finalGradeCategorias.grade}</p>
                            </div>
                        </div>

                        {/* Tabs */}
                        <Tabs
                            className="mb-6 flex-shrink-0"
                            activeId={activeTab}
                            onChange={setActiveTab}
                            items={[
                                { id: 'personal', label: 'Datos Personales' },
                                { id: 'evolution', label: 'Evolución y Calificaciones' },
                                { id: 'competences', label: 'Perfil Competencial' },
                                { id: 'criteria', label: 'Semáforo de Criterios' },
                            ]}
                        />

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto min-h-0 pr-2">
                            {renderTabContent()}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};

// --- Personal Data Tab (solo lectura; se edita con StudentPersonalDataModal
// desde Ajustes → Clases y Alumnado). Solo se muestran los campos/secciones
// que de verdad tienen algo, para no llenar la ficha de etiquetas vacías.

const DataRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => value ? (
    <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-slate-700">{value}</p>
    </div>
) : null;

const DataSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 pb-1 border-b border-slate-100">{title}</p>
        {children}
    </div>
);

const TutorSummary: React.FC<{ label: string; tutor?: Tutor }> = ({ label, tutor }) => {
    if (!tutor || !(tutor.nombre || tutor.relacion || tutor.telefono || tutor.email)) return null;
    return (
        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <div className="grid grid-cols-2 gap-x-4 mt-1">
                <DataRow label="Nombre" value={tutor.nombre} />
                <DataRow label="Relación" value={tutor.relacion} />
                <DataRow label="Teléfono" value={tutor.telefono} />
                <DataRow label="Email" value={tutor.email} />
            </div>
        </div>
    );
};

const SiNoText = (v?: boolean | null) => v === true ? 'Sí' : v === false ? 'No' : undefined;

const tieneMasDatos = (student: Student): boolean => {
    const hayFamilia = !!((student.tutor1?.nombre || student.tutor1?.telefono || student.tutor1?.email || student.tutor1?.relacion)
        || (student.tutor2?.nombre || student.tutor2?.telefono || student.tutor2?.email || student.tutor2?.relacion));
    const hayDomicilio = !!(student.domicilioDireccion || student.domicilioLocalidad || student.domicilioCodigoPostal || student.domicilioTelefono);
    const hayAcademica = !!(student.centroProcedencia || student.haRepetidoCurso != null || student.materiasPendientes || student.programaEspecifico);
    const haySanitaria = !!(student.alergias || student.enfermedadesRelevantes || student.medicacionHabitual || student.intoleranciasAlimentarias || student.observacionesSanitarias);
    const hayAtencion = !!(student.neae != null || student.neaeDetalle || student.medidasEducativas || student.indicacionesPti);
    const hayAutorizaciones = student.autorizacionImagen != null || student.autorizacionSalidas != null;
    const hayObservaciones = !!student.observacionesTutor;
    return hayFamilia || hayDomicilio || hayAcademica || haySanitaria || hayAtencion || hayAutorizaciones || hayObservaciones;
};

const PersonalDataTab: React.FC<{ student: Student; classData: ClassData; courses: Course[]; onOpenFullFicha: () => void }> = ({ student, classData, courses, onOpenFullFicha }) => {
    const materia = getMateria(classData, courses);
    const course = courses.find(c => c.id === classData.courseId);
    const edad = student.fechaNacimiento ? Math.floor((Date.now() - new Date(student.fechaNacimiento + 'T00:00:00').getTime()) / (365.25 * 24 * 3600 * 1000)) : undefined;

    const hayMasDatos = tieneMasDatos(student);
    const hayDatos = student.fechaNacimiento || student.dni || student.nie || student.nacionalidad || student.telefonoUrgencias || hayMasDatos;

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-4">
                <StudentPhotoAvatar foto={student.foto} size="w-24 h-24" />
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    <DataRow label="Curso" value={course ? `${course.level} - ${materia}` : undefined} />
                    <DataRow label="Grupo" value={classData.grupo} />
                    <DataRow label="Fecha de nacimiento" value={student.fechaNacimiento ? formatFechaEs(student.fechaNacimiento) : undefined} />
                    <DataRow label="Edad" value={edad != null ? `${edad} años` : undefined} />
                    <DataRow label="DNI/NIE (documento de identidad)" value={student.dni} />
                    <DataRow label="NIE — Nº Identificación Escolar (SAUCE)" value={student.nie} />
                    <DataRow label="Nacionalidad" value={student.nacionalidad} />
                    <DataRow label="Teléfono de urgencias" value={student.telefonoUrgencias} />
                </div>
            </div>

            {hayMasDatos && (
                <button
                    onClick={onOpenFullFicha}
                    className={`text-sm font-semibold flex items-center gap-1 ${linkClassName}`}
                >
                    Datos personales completos
                    <ChevronRightIcon className="w-4 h-4" />
                </button>
            )}

            {!hayDatos && (
                <p className="text-slate-400 italic text-sm text-center py-4">
                    Todavía no hay datos personales. Se añaden desde Ajustes → Clases y Alumnado, con el icono de ficha junto al nombre.
                </p>
            )}
        </div>
    );
};

// Pantalla separada (no una pestaña más) con TODOS los datos personales —
// incluidos los básicos (antes solo vivían en PersonalDataTab, la pestaña
// resumen): si se entra aquí directamente desde "Ver ficha" del menú
// contextual, sin pasar por esa pestaña, hace falta que esta pantalla sea
// autosuficiente y no dependa de lo que ya se haya visto antes — si no, un
// alumno sin datos "extra" (familia/domicilio/sanitaria...) mostraba una
// pantalla en blanco pese a tener foto, curso, DNI, etc. Familia, domicilio,
// académica, sanitaria, atención educativa, autorizaciones y observaciones
// siguen sin mostrarse si están vacías, para no llenar la ficha de
// etiquetas sin contenido. Con botón de volver solo cuando se llega aquí
// desde dentro del resumen ("Datos personales completos"); si se entra
// directamente no hay a dónde volver, así que se omite.
const FullFichaScreen: React.FC<{ student: Student; classData: ClassData; courses: Course[]; onBack: () => void }> = ({ student, classData, courses, onBack }) => {
    const materia = getMateria(classData, courses);
    const course = courses.find(c => c.id === classData.courseId);
    const edad = student.fechaNacimiento ? Math.floor((Date.now() - new Date(student.fechaNacimiento + 'T00:00:00').getTime()) / (365.25 * 24 * 3600 * 1000)) : undefined;

    const hayFamilia = (student.tutor1?.nombre || student.tutor1?.telefono || student.tutor1?.email || student.tutor1?.relacion)
        || (student.tutor2?.nombre || student.tutor2?.telefono || student.tutor2?.email || student.tutor2?.relacion);
    const hayDomicilio = student.domicilioDireccion || student.domicilioLocalidad || student.domicilioCodigoPostal || student.domicilioTelefono;
    const hayAcademica = student.centroProcedencia || student.haRepetidoCurso != null || student.materiasPendientes || student.programaEspecifico;
    const haySanitaria = student.alergias || student.enfermedadesRelevantes || student.medicacionHabitual || student.intoleranciasAlimentarias || student.observacionesSanitarias;
    const hayAtencion = student.neae != null || student.neaeDetalle || student.medidasEducativas || student.indicacionesPti;
    const hayAutorizaciones = student.autorizacionImagen != null || student.autorizacionSalidas != null;
    const hayObservaciones = student.observacionesTutor;

    return (
        <div className="space-y-5">
            <button onClick={onBack} className={`text-sm font-semibold flex items-center gap-1 mb-2 ${linkClassName}`}>
                <ChevronRightIcon className="w-4 h-4 rotate-180" /> Volver a la ficha
            </button>

            <div className="flex items-center gap-4">
                <StudentPhotoAvatar foto={student.foto} size="w-24 h-24" />
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-xl font-bold text-slate-800">{getNombreCompleto(student)}</h2>
                        <AcneaeTag tags={student.acneae} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        <DataRow label="Curso" value={course ? `${course.level} - ${materia}` : undefined} />
                        <DataRow label="Grupo" value={classData.grupo} />
                        <DataRow label="Fecha de nacimiento" value={student.fechaNacimiento ? formatFechaEs(student.fechaNacimiento) : undefined} />
                        <DataRow label="Edad" value={edad != null ? `${edad} años` : undefined} />
                        <DataRow label="DNI/NIE (documento de identidad)" value={student.dni} />
                        <DataRow label="NIE — Nº Identificación Escolar (SAUCE)" value={student.nie} />
                        <DataRow label="Nacionalidad" value={student.nacionalidad} />
                        <DataRow label="Teléfono de urgencias" value={student.telefonoUrgencias} />
                    </div>
                </div>
            </div>

            {hayFamilia && (
                <DataSection title="Datos familiares">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <TutorSummary label="Progenitor/a o tutor/a legal 1" tutor={student.tutor1} />
                        <TutorSummary label="Progenitor/a o tutor/a legal 2" tutor={student.tutor2} />
                    </div>
                </DataSection>
            )}

            {hayDomicilio && (
                <DataSection title="Domicilio">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        <DataRow label="Dirección" value={student.domicilioDireccion} />
                        <DataRow label="Localidad" value={student.domicilioLocalidad} />
                        <DataRow label="Código Postal" value={student.domicilioCodigoPostal} />
                        <DataRow label="Teléfono" value={student.domicilioTelefono} />
                    </div>
                </DataSection>
            )}

            {hayAcademica && (
                <DataSection title="Información académica">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        <DataRow label="Centro de procedencia" value={student.centroProcedencia} />
                        <DataRow label="Programa específico" value={student.programaEspecifico} />
                        <DataRow label="¿Ha repetido curso?" value={SiNoText(student.haRepetidoCurso)} />
                        <DataRow label="Materias pendientes" value={student.materiasPendientes} />
                    </div>
                </DataSection>
            )}

            {haySanitaria && (
                <DataSection title="Información sanitaria">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        <DataRow label="Alergias" value={student.alergias} />
                        <DataRow label="Enfermedades relevantes" value={student.enfermedadesRelevantes} />
                        <DataRow label="Medicación habitual" value={student.medicacionHabitual} />
                        <DataRow label="Intolerancias alimentarias" value={student.intoleranciasAlimentarias} />
                    </div>
                    {student.observacionesSanitarias && (
                        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-100 mt-2">{student.observacionesSanitarias}</p>
                    )}
                </DataSection>
            )}

            {hayAtencion && (
                <DataSection title="Atención educativa">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        <DataRow label="¿NEAE?" value={SiNoText(student.neae)} />
                        <DataRow label="Detalle" value={student.neaeDetalle} />
                    </div>
                    {student.medidasEducativas && (
                        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-100 mt-2">{student.medidasEducativas}</p>
                    )}
                    {student.indicacionesPti && (
                        <div className="mt-2">
                            <p className="text-xs font-medium text-slate-500 mb-1">Indicaciones PTI</p>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-100">{student.indicacionesPti}</p>
                        </div>
                    )}
                </DataSection>
            )}

            {hayAutorizaciones && (
                <DataSection title="Autorizaciones">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        <DataRow label="Uso de imagen" value={SiNoText(student.autorizacionImagen)} />
                        <DataRow label="Salidas escolares" value={SiNoText(student.autorizacionSalidas)} />
                    </div>
                </DataSection>
            )}

            {hayObservaciones && (
                <DataSection title="Observaciones del tutor/a">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-100">{student.observacionesTutor}</p>
                </DataSection>
            )}
        </div>
    );
};

// --- Evolution Tab ---

interface EvolutionTabProps {
    student: Student;
    classData: ClassData;
    academicConfiguration: AcademicConfiguration;
    criteria: EvaluationCriterion[];
    repartoIgualCriterios: boolean;
}

const EvolutionTab: React.FC<EvolutionTabProps> = ({ student, classData, academicConfiguration, criteria, repartoIgualCriterios }) => {
    const { evaluationPeriods } = academicConfiguration;

    return (
        <div className="space-y-4">
            {evaluationPeriods.map(period => (
                <PeriodCard key={period.id} period={period} student={student} classData={classData} academicConfiguration={academicConfiguration} criteria={criteria} repartoIgualCriterios={repartoIgualCriterios} />
            ))}
        </div>
    );
};

interface PeriodCardProps {
    period: EvaluationPeriod;
    student: Student;
    classData: ClassData;
    academicConfiguration: AcademicConfiguration;
    criteria: EvaluationCriterion[];
    repartoIgualCriterios: boolean;
}

const PeriodCard: React.FC<PeriodCardProps> = ({ period, student, classData, academicConfiguration, criteria, repartoIgualCriterios }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Oficial (criterios) + comparación (categorías, sistema tradicional).
    const periodGradeCriterial = useMemo(() =>
        calculatePeriodGradeCriterial(student.id, classData, criteria, period.id, repartoIgualCriterios, academicConfiguration.gradeScale),
    [student.id, classData, criteria, period.id, repartoIgualCriterios, academicConfiguration.gradeScale]);

    const periodGrade = useMemo(() =>
        calculateEvaluationPeriodGradeForStudent(student.id, classData, period.id, academicConfiguration.gradeScale),
    [student.id, classData, period.id, academicConfiguration.gradeScale]);

    const categoriesInPeriod = useMemo(() => 
        classData.categories.filter(c => c.evaluationPeriodId === period.id),
    [classData.categories, period.id]);

    const assignments = useMemo(() => 
        classData.assignments.filter(a => a.evaluationPeriodId === period.id),
    [classData.assignments, period.id]);

    const assignmentScores = useMemo(() => 
        calculateAssignmentScoresForStudent(student.id, assignments, classData.grades),
    [student.id, assignments, classData.grades]);

    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
            <div 
                className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-full bg-slate-100 text-slate-500`}>
                        {isExpanded ? <ChevronDownIcon className="w-5 h-5" /> : <ChevronRightIcon className="w-5 h-5" />}
                    </div>
                    <h3 className={TYPOGRAPHY.sectionTitle}>{period.name}</h3>
                </div>
                <div className="text-right">
                    <div className={`font-bold text-xl px-3 py-1 rounded-md ${periodGradeCriterial.styleClasses}`}>
                        {periodGradeCriterial.grade?.toFixed(2) ?? '-'}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5" title="Nota de comparación por categorías (tradicional)">cat: {periodGrade.grade?.toFixed(2) ?? '-'}</p>
                </div>
            </div>
            
            {isExpanded && (
                <div className="bg-slate-50 border-t border-slate-100 p-4">
                    {categoriesInPeriod.length === 0 ? (
                        <p className="text-slate-500 italic text-sm">No hay categorías en este periodo.</p>
                    ) : (
                        <div className="space-y-4">
                            {categoriesInPeriod.map(category => {
                                const catAssignments = assignments.filter(a => a.categoryId === category.id);
                                if (catAssignments.length === 0) return null;

                                return (
                                    <div key={category.id} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
                                        <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
                                            <span className="font-semibold text-sm text-slate-700">{category.name} <span className="text-slate-500 text-xs font-normal">({category.weight}%)</span></span>
                                            {category.type === 'recovery' && <Badge variant="primary">RECUPERACIÓN</Badge>}
                                        </div>
                                        <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {catAssignments.map(assignment => {
                                                const score = assignmentScores.get(assignment.id);
                                                return (
                                                    <div key={assignment.id} className="flex justify-between items-center p-2 rounded hover:bg-slate-50 border border-slate-100">
                                                        <div className="flex-1 min-w-0 pr-2">
                                                            <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-1.5">
                                                                <ClipboardDocumentIcon className="w-3 h-3 text-slate-400"/>
                                                                {assignment.name}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500 ml-4">
                                                                {assignment.date ? formatFechaEs(assignment.date) : 'Sin fecha'}
                                                            </p>
                                                        </div>
                                                        <span className={`text-sm font-bold px-2 py-0.5 rounded ${getGradeColorClass(score ?? null, academicConfiguration.gradeScale)}`}>
                                                            {score?.toFixed(2) ?? '-'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Competences Tab ---

interface CompetencesTabProps {
    student: Student;
    classData: ClassData;
    criteria: EvaluationCriterion[];
    specificCompetences: SpecificCompetence[];
    keyCompetences: KeyCompetence[];
    academicConfiguration: AcademicConfiguration;
    repartoIgualCriterios: boolean;
}

const CompetencesTab: React.FC<CompetencesTabProps> = ({ student, classData, criteria, specificCompetences, keyCompetences, academicConfiguration, repartoIgualCriterios }) => {

    const kcGrades = useMemo(() =>
        calculateStudentKeyCompetenceGrades(student.id, classData, criteria, specificCompetences, keyCompetences, repartoIgualCriterios),
    [student.id, classData, criteria, specificCompetences, keyCompetences, repartoIgualCriterios]);

    const scGrades = useMemo(() =>
        calculateStudentCompetenceGrades(student.id, classData, criteria, specificCompetences, repartoIgualCriterios),
    [student.id, classData, criteria, specificCompetences, repartoIgualCriterios]);

    return (
        <div className="space-y-8">
            {/* Key Competences */}
            <div>
                <h3 className={`${TYPOGRAPHY.sectionTitle} mb-3 flex items-center gap-2`}>
                    <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
                    Competencias Clave
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {keyCompetences.map(kc => {
                        const grade = kcGrades.get(kc.id);
                        const colorClass = getGradeColorClass(grade ?? null, academicConfiguration.gradeScale);
                        return (
                            <div key={kc.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-bold text-slate-700 text-lg">{kc.code}</span>
                                    <span className={`font-bold text-lg px-2 py-0.5 rounded ${colorClass}`}>
                                        {grade?.toFixed(2) ?? '-'}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 line-clamp-2" title={kc.description}>{kc.description}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Specific Competences */}
            <div>
                <h3 className={`${TYPOGRAPHY.sectionTitle} mb-3 flex items-center gap-2`}>
                    <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
                    Competencias Específicas
                </h3>
                <div className="space-y-3">
                    {specificCompetences.map(sc => {
                        const grade = scGrades.get(sc.id);
                        const colorClass = getGradeColorClass(grade ?? null, academicConfiguration.gradeScale);
                        return (
                            <div key={sc.id} className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-700">{sc.code}</span>
                                    </div>
                                    <p className="text-sm text-slate-600 mt-1">{sc.description}</p>
                                </div>
                                <div className="flex-shrink-0 w-16 text-right">
                                    <span className={`font-bold text-lg px-2 py-1 rounded ${colorClass}`}>
                                        {grade?.toFixed(2) ?? '-'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// --- Criteria Tab ---

interface CriteriaTabProps {
    student: Student;
    classData: ClassData;
    criteria: EvaluationCriterion[];
    specificCompetences: SpecificCompetence[];
    academicConfiguration: AcademicConfiguration;
}

const CriteriaTab: React.FC<CriteriaTabProps> = ({ student, classData, criteria, specificCompetences, academicConfiguration }) => {
    const grades = useMemo(() => 
        calculateStudentCriterionGrades(student.id, classData, criteria),
    [student.id, classData, criteria]);

    // Group criteria by Specific Competence for better organization
    const groupedCriteria = useMemo(() => {
        const groups = new Map<string, EvaluationCriterion[]>();
        criteria.forEach(c => {
            if (!groups.has(c.competenceId)) groups.set(c.competenceId, []);
            groups.get(c.competenceId)!.push(c);
        });
        return groups;
    }, [criteria]);

    return (
        <div className="space-y-6">
            {specificCompetences.map(sc => {
                const scCriteria = groupedCriteria.get(sc.id) || [];
                if (scCriteria.length === 0) return null;

                return (
                    <div key={sc.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 p-3 border-b border-slate-200">
                            <h4 className="font-bold text-slate-700">{sc.code} <span className="font-normal text-slate-500 text-sm ml-2">- {sc.description}</span></h4>
                        </div>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {scCriteria.map(criterion => {
                                const grade = grades.get(criterion.id);
                                const colorClass = getGradeColorClass(grade ?? null, academicConfiguration.gradeScale);
                                return (
                                    <div key={criterion.id} className="flex items-start justify-between p-2 rounded border border-slate-100 hover:border-slate-300 transition-colors">
                                        <div className="flex-1 pr-2">
                                            <span className="font-bold text-xs text-slate-500 block mb-1">{criterion.code}</span>
                                            <p className="text-sm text-slate-700 leading-tight" title={criterion.description}>
                                                {criterion.description}
                                            </p>
                                        </div>
                                        <span className={`font-bold text-sm px-2 py-1 rounded-full flex-shrink-0 ${colorClass}`}>
                                            {grade?.toFixed(1) ?? '-'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default StudentSummaryModal;
