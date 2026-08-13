import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ClassData, Course, Student } from '../../types';
import { formatClassLabel, getNombreCompleto, buildDefaultCategories } from '../../utils';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon, UserCircleIcon } from '../Icons';
import ClassModal from '../ClassModal';
import BulkAddStudentModal from '../BulkAddStudentModal';
import StudentPersonalDataModal from '../StudentPersonalDataModal';
import ExistingStudentPicker from '../ExistingStudentPicker';
import ImportSauceStudentsModal from '../ImportSauceStudentsModal';
import IconButton from '../IconButton';
import Button from '../Button';
import Select from '../Select';
import { tableBaseClassName, tableHeadCellClassName, tableHeadRowClassName, tableRowClassName, tableWrapperClassName } from '../../theme/components/Table';
import { useCurrentAcademicYear, useEvaluationPeriods } from '../../hooks/useAcademicYears';
import { useApiClasses, useCreateClass, useUpdateClass, useDeleteClass } from '../../hooks/useApiClasses';
import { useApiStudents, useUpdateStudent, useDeleteStudent } from '../../hooks/useApiStudents';
import { useEnrollments, useCreateEnrollment, useUpdateEnrollment, useDeleteEnrollment } from '../../hooks/useEnrollments';
import { useCreateCategory } from '../../hooks/useCategories';
import { apiClassToLocal, joinStudentEnrollment, splitStudentPatch, syncStudentPhoto } from '../../services/apiAdapters';
import { ApiError } from '../../services/api';


interface StudentRowProps {
    student: Student;
    onDelete: (id: string) => void;
    onReorder?: (id: string, direction: 'up' | 'down') => void;
    onOpenFicha: (student: Student) => void;
    index: number;
    totalStudents: number;
}

const StudentRow: React.FC<StudentRowProps> = ({ student, onDelete, onReorder, onOpenFicha, index, totalStudents }) => {
    return (
        <tr className={tableRowClassName}>
            <td className="p-3 text-center text-slate-500">{index + 1}</td>
            <td className="p-3 text-sm text-slate-800">{getNombreCompleto(student)}</td>
            <td className="p-3">
                <div className="flex flex-wrap gap-1">
                    {student.acneae.length > 0
                        ? student.acneae.map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-600 rounded">{tag}</span>
                          ))
                        : <span className="text-slate-400 text-xs">—</span>
                    }
                </div>
            </td>
             <td className="p-3 text-right">
                <div className="inline-flex items-center gap-1">
                    <IconButton label="Ficha personal" tone="primary" size="sm" onClick={() => onOpenFicha(student)}>
                        <UserCircleIcon className="w-4 h-4"/>
                    </IconButton>
                    {onReorder && (
                        <>
                            <IconButton label="Subir en la lista" size="sm" onClick={() => onReorder(student.id, 'up')} disabled={index === 0}>
                                <ArrowUpIcon className="w-4 h-4"/>
                            </IconButton>
                            <IconButton label="Bajar en la lista" size="sm" onClick={() => onReorder(student.id, 'down')} disabled={index === totalStudents - 1}>
                                <ArrowDownIcon className="w-4 h-4"/>
                            </IconButton>
                        </>
                    )}
                    <IconButton label="Eliminar alumn@" tone="danger" size="sm" onClick={() => onDelete(student.id)}>
                        <TrashIcon className="w-4 h-4"/>
                    </IconButton>
                </div>
            </td>
        </tr>
    );
};

const ClassManager: React.FC<{
    courses: Course[];
}> = ({ courses }) => {
    const queryClient = useQueryClient();
    const currentYear = useCurrentAcademicYear();
    const yearId = currentYear.data?.id ?? '';
    const remoteClasses = useApiClasses(yearId, { enabled: !!yearId });
    const remoteStudents = useApiStudents();
    const createClassMutation = useCreateClass();
    const updateClassMutation = useUpdateClass();
    const deleteClassMutation = useDeleteClass();
    const createEnrollmentMutation = useCreateEnrollment();
    const updateEnrollmentMutation = useUpdateEnrollment();
    const deleteEnrollmentMutation = useDeleteEnrollment();
    const deleteStudentMutation = useDeleteStudent();
    const updateStudentMutation = useUpdateStudent();
    // Bug real (2026-08-04): igual que en ImportScheduleModal.tsx —
    // createClassMutation solo manda los campos "cáscara", así que una
    // clase creada a mano se quedaba sin categorías de calificación por
    // defecto si no se sembraban aparte.
    const remotePeriods = useEvaluationPeriods(yearId, { enabled: !!yearId });
    const realEvaluationPeriods = (remotePeriods.data ?? []).map(p => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate }));
    const createCategoryMutation = useCreateCategory();

    const effectiveClasses: ClassData[] = useMemo(() => (
        (remoteClasses.data ?? []).map(apiClassToLocal)
    ), [remoteClasses.data]);

    const academicClasses = useMemo(() => {
        const academicCourseIds = new Set(courses.filter(c => c.type !== 'other').map(c => c.id));
        return effectiveClasses.filter(c => academicCourseIds.has(c.courseId));
    }, [effectiveClasses, courses]);

    const [activeClassId, setActiveClassId] = useState(academicClasses[0]?.id || '');
    const [isClassModalOpen, setIsClassModalOpen] = useState(false);
    const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
    const [isSauceImportOpen, setIsSauceImportOpen] = useState(false);
    const [classToEdit, setClassToEdit] = useState<ClassData | null>(null);
    const [studentForFicha, setStudentForFicha] = useState<Student | null>(null);

    useEffect(() => {
        if (academicClasses.length > 0 && !academicClasses.find(c => c.id === activeClassId)) {
            setActiveClassId(academicClasses[0].id);
        } else if (academicClasses.length === 0) {
            setActiveClassId('');
        }
    }, [academicClasses, activeClassId]);

    const remoteEnrollments = useEnrollments(activeClassId, { enabled: !!activeClassId });

    const activeClassStudents: Student[] = useMemo(() => {
        const studentsById = new Map((remoteStudents.data ?? []).map(s => [s.id, s]));
        return (remoteEnrollments.data ?? [])
            .map(e => {
                const student = studentsById.get(e.studentId);
                return student ? joinStudentEnrollment(student, e) : null;
            })
            .filter((s): s is Student => !!s);
    }, [remoteStudents.data, remoteEnrollments.data]);

    const activeClassShell = effectiveClasses.find((c: ClassData) => c.id === activeClassId);
    const activeClass: ClassData | undefined = activeClassShell
        ? { ...activeClassShell, students: activeClassStudents }
        : undefined;

    const handleStudentUpdate = async (studentId: string, updatedStudent: Partial<Student>) => {
        const enrollment = activeClassStudents.find(s => s.id === studentId);
        const { studentPatch, enrollmentPatch } = splitStudentPatch(updatedStudent);
        if (Object.keys(studentPatch).length > 0) {
            await updateStudentMutation.mutateAsync({ id: studentId, data: studentPatch });
        }
        if (enrollment?.enrollmentId && Object.keys(enrollmentPatch).length > 0) {
            await updateEnrollmentMutation.mutateAsync({ id: enrollment.enrollmentId, classId: activeClassId, data: enrollmentPatch });
        }
        if ('foto' in updatedStudent) {
            await syncStudentPhoto(studentId, updatedStudent.foto);
            queryClient.invalidateQueries({ queryKey: ['students'] });
        }
    };

    const handleDeleteStudent = async (studentId: string) => {
        if (!window.confirm('¿Seguro que quieres eliminar a este/a alumn@? Se perderán todas sus calificaciones.')) {
            return;
        }
        const enrollment = activeClassStudents.find(s => s.id === studentId);
        if (!enrollment?.enrollmentId) return;
        await deleteEnrollmentMutation.mutateAsync({ id: enrollment.enrollmentId, classId: activeClassId });
    };

    // Borrado definitivo de la ficha (persona), no solo desmatricular —
    // para alumnado dado de alta por error o que ya no tiene matrícula en
    // ningún curso académico. El backend rechaza con un mensaje claro
    // (409) si todavía tiene matrículas en algún sitio, así que aquí no
    // hace falta comprobarlo antes: se intenta y se muestra ese mensaje
    // si falla.
    const handleDeleteStudentPermanently = async (studentId: string) => {
        if (!window.confirm('¿Borrar definitivamente la ficha de este/a alumn@? Solo es posible si no tiene matrículas en ningún curso académico. Esta acción no se puede deshacer.')) {
            return;
        }
        try {
            await deleteStudentMutation.mutateAsync(studentId);
        } catch (err) {
            alert(err instanceof ApiError ? err.detail : 'No se pudo borrar el alumno/a.');
        }
    };

    const handleSaveClass = async (classData: Omit<ClassData, 'students' | 'categories' | 'assignments' | 'grades'>) => {
        if (classToEdit) {
            await updateClassMutation.mutateAsync({
                id: classData.id,
                yearId,
                data: { courseId: classData.courseId, grupo: classData.grupo, icono: classData.icono, colorAcento: classData.colorAcento },
            });
        } else {
            const created = await createClassMutation.mutateAsync({
                yearId,
                data: { courseId: classData.courseId, grupo: classData.grupo, icono: classData.icono, colorAcento: classData.colorAcento, schedule: [] },
            });
            for (const cat of buildDefaultCategories(realEvaluationPeriods)) {
                await createCategoryMutation.mutateAsync({
                    classId: created.id,
                    data: { evaluationPeriodId: cat.evaluationPeriodId, name: cat.name, weight: cat.weight },
                });
            }
            setActiveClassId(created.id);
        }
    };

    const handleDeleteClass = async (classId: string) => {
        if (!window.confirm('¿Seguro que quieres eliminar esta clase? Se perderá TODA la información asociada (alumnado, tareas, calificaciones).')) {
            return;
        }
        await deleteClassMutation.mutateAsync({ id: classId, yearId });
    };

    const handleBulkAddStudents = async (newStudentData: { nombre?: string; primerApellido?: string; segundoApellido?: string; nie?: string; acneae: string[] }[]) => {
        if (!activeClassId) return;

        for (const data of newStudentData) {
            await createEnrollmentMutation.mutateAsync({
                classId: activeClassId,
                data: { newStudent: { nombre: data.nombre, primerApellido: data.primerApellido, segundoApellido: data.segundoApellido, nie: data.nie }, acneae: data.acneae },
            });
        }
        if (newStudentData.length > 0) {
            alert(`${newStudentData.length} alumn@s importados con éxito a la clase "${activeClass ? formatClassLabel(activeClass, courses) : ''}".`);
        }
        setIsBulkAddModalOpen(false);
    };

    const handleEnrollExisting = async (studentId: string) => {
        if (!activeClassId) return;
        await createEnrollmentMutation.mutateAsync({ classId: activeClassId, data: { studentId } });
    };


    return (
        <div>
            {/* Dos columnas: izquierda = alumnado disponible (importado de SAUCE
                o suelto, sin matricular en ESTA clase), derecha = la clase activa
                y quién ya está en ella. Seleccionar en la izquierda y matricular
                lo mueve a la derecha; cambiar de clase activa cambia qué se ve a
                la derecha y recalcula qué sigue disponible a la izquierda — un
                mismo alumno puede acabar matriculado en varias clases a la vez
                (p.ej. dos materias distintas), así que "disponible" es siempre
                relativo a la clase activa, no un estado global de la persona. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg bg-slate-50/50 flex flex-col">
                    <div className="p-3 border-b border-slate-200 bg-white rounded-t-lg flex items-center justify-between gap-2">
                        <h4 className="font-semibold text-slate-700 text-sm">Alumnado disponible</h4>
                        <Button variant="secondary" onClick={() => setIsSauceImportOpen(true)}>
                            Importar de SAUCE
                        </Button>
                    </div>
                    <div className="p-3">
                        <ExistingStudentPicker
                            allStudents={remoteStudents.data ?? []}
                            currentYearId={yearId}
                            alreadyEnrolledIds={new Set(activeClassStudents.map(s => s.id))}
                            onEnroll={handleEnrollExisting}
                            onDeleteStudent={handleDeleteStudentPermanently}
                        />
                    </div>
                </div>

                <div className="border border-slate-200 rounded-lg flex flex-col">
                    <div className="p-3 border-b border-slate-200 bg-white rounded-t-lg space-y-2">
                        <div className="flex items-center gap-2">
                            <label htmlFor="class-select" className="text-sm font-medium">Clase:</label>
                            <Select id="class-select" value={activeClassId} onChange={e => setActiveClassId(e.target.value)} className="flex-1">
                                {academicClasses.map((c: ClassData) => <option key={c.id} value={c.id}>{formatClassLabel(c, courses)}</option>)}
                            </Select>
                            {activeClass && (
                                <div className="flex items-center gap-1">
                                    <IconButton label="Editar clase" onClick={() => { setClassToEdit(activeClass); setIsClassModalOpen(true); }}><PencilIcon className="w-4 h-4"/></IconButton>
                                    <IconButton label="Eliminar clase" tone="danger" onClick={() => handleDeleteClass(activeClass.id)}><TrashIcon className="w-4 h-4"/></IconButton>
                                </div>
                            )}
                        </div>
                        <Button variant="primary" onClick={() => { setClassToEdit(null); setIsClassModalOpen(true); }} className="w-full">
                            <PlusIcon className="w-4 h-4"/>
                            Añadir Clase Nueva
                        </Button>
                    </div>
                    {activeClass ? (
                        <div className={tableWrapperClassName}>
                            <table className={tableBaseClassName}>
                                <thead>
                                    <tr className={tableHeadRowClassName}>
                                        <th className={`${tableHeadCellClassName} text-left w-8`}>#</th>
                                        <th className={`${tableHeadCellClassName} text-left`}>Nombre del/la Alumn@</th>
                                        <th className={`${tableHeadCellClassName} text-left`}>Anotaciones ACNEAE</th>
                                        <th className={`${tableHeadCellClassName} text-right`}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeClass.students.map((student: Student, index: number) => (
                                        <StudentRow
                                            key={student.id}
                                            student={student}
                                            onDelete={handleDeleteStudent}
                                            onOpenFicha={setStudentForFicha}
                                            index={index}
                                            totalStudents={activeClass.students.length}
                                        />
                                    ))}
                                </tbody>
                            </table>
                            <div className="p-3 border-t bg-slate-50/50">
                                <button onClick={() => setIsBulkAddModalOpen(true)} className="w-full text-center py-2 text-sm font-semibold text-green-600 hover:bg-green-100 bg-white rounded-md border border-slate-200 shadow-sm">
                                   Añadir Alumnado en Lote
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-slate-500 text-center py-8 bg-slate-50 rounded-b-lg">No hay clases académicas. ¡Añade una para empezar!</p>
                    )}
                </div>
            </div>
            <ClassModal
                isOpen={isClassModalOpen}
                onClose={() => setIsClassModalOpen(false)}
                onSave={handleSaveClass}
                classToEdit={classToEdit}
                courses={courses.filter(c => c.type !== 'other')}
            />
            <BulkAddStudentModal
                isOpen={isBulkAddModalOpen}
                onClose={() => setIsBulkAddModalOpen(false)}
                onSave={handleBulkAddStudents}
            />
            <StudentPersonalDataModal
                isOpen={!!studentForFicha}
                onClose={() => setStudentForFicha(null)}
                student={studentForFicha}
                onSave={handleStudentUpdate}
            />
            <ImportSauceStudentsModal
                isOpen={isSauceImportOpen}
                onClose={() => setIsSauceImportOpen(false)}
            />
        </div>
    );
};

export default ClassManager;
