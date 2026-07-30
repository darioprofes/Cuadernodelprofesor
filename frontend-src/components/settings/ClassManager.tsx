import React, { useState, useEffect, useMemo } from 'react';
import type { AcademicConfiguration, ClassData, Course, Student } from '../../types';
import { formatClassLabel, getNombreCompleto, buildDefaultCategories } from '../../utils';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon, UserCircleIcon } from '../Icons';
import ClassModal from '../ClassModal';
import BulkAddStudentModal from '../BulkAddStudentModal';
import StudentPersonalDataModal from '../StudentPersonalDataModal';
import IconButton from '../IconButton';
import Button from '../Button';
import Select from '../Select';
import { tableBaseClassName, tableHeadCellClassName, tableHeadRowClassName, tableRowClassName, tableWrapperClassName } from '../../theme/components/Table';


interface StudentRowProps {
    student: Student;
    onDelete: (id: string) => void;
    onReorder: (id: string, direction: 'up' | 'down') => void;
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
                    <IconButton label="Subir en la lista" size="sm" onClick={() => onReorder(student.id, 'up')} disabled={index === 0}>
                        <ArrowUpIcon className="w-4 h-4"/>
                    </IconButton>
                    <IconButton label="Bajar en la lista" size="sm" onClick={() => onReorder(student.id, 'down')} disabled={index === totalStudents - 1}>
                        <ArrowDownIcon className="w-4 h-4"/>
                    </IconButton>
                    <IconButton label="Eliminar alumn@" tone="danger" size="sm" onClick={() => onDelete(student.id)}>
                        <TrashIcon className="w-4 h-4"/>
                    </IconButton>
                </div>
            </td>
        </tr>
    );
};

const ClassManager: React.FC<{
    classes: ClassData[];
    setClasses: (updater: React.SetStateAction<ClassData[]>) => void;
    courses: Course[];
    academicConfiguration: AcademicConfiguration;
}> = ({ classes, setClasses, courses, academicConfiguration }) => {

    const academicClasses = useMemo(() => {
        const academicCourseIds = new Set(courses.filter(c => c.type !== 'other').map(c => c.id));
        return classes.filter(c => academicCourseIds.has(c.courseId));
    }, [classes, courses]);

    const [activeClassId, setActiveClassId] = useState(academicClasses[0]?.id || '');
    const [isClassModalOpen, setIsClassModalOpen] = useState(false);
    const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
    const [classToEdit, setClassToEdit] = useState<ClassData | null>(null);
    const [studentForFicha, setStudentForFicha] = useState<Student | null>(null);

    useEffect(() => {
        if (academicClasses.length > 0 && !academicClasses.find(c => c.id === activeClassId)) {
            setActiveClassId(academicClasses[0].id);
        } else if (academicClasses.length === 0) {
            setActiveClassId('');
        }
    }, [academicClasses, activeClassId]);

    const activeClass = classes.find((c: ClassData) => c.id === activeClassId);

    const handleStudentUpdate = (studentId: string, updatedStudent: Partial<Student>) => {
        setClasses((prevClasses: ClassData[]) => prevClasses.map(c =>
            c.id === activeClassId
                ? { ...c, students: c.students.map(s => s.id === studentId ? { ...s, ...updatedStudent } : s) }
                : c
        ));
    };

    const handleReorderStudent = (studentId: string, direction: 'up' | 'down') => {
        setClasses(prevClasses => prevClasses.map(c => {
            if (c.id !== activeClassId) return c;

            const students = c.students;
            const currentIndex = students.findIndex(s => s.id === studentId);
            if (currentIndex === -1) return c;

            const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (newIndex < 0 || newIndex >= students.length) return c;

            const newStudents = [...students];
            const [movedStudent] = newStudents.splice(currentIndex, 1);
            newStudents.splice(newIndex, 0, movedStudent);

            return { ...c, students: newStudents };
        }));
    };

    const handleDeleteStudent = (studentId: string) => {
        if (!window.confirm('¿Seguro que quieres eliminar a este/a alumn@? Se perderán todas sus calificaciones.')) {
            return;
        }
        setClasses(prevClasses => prevClasses.map(c => {
            if (c.id === activeClassId) {
                const updatedStudents = c.students.filter(s => s.id !== studentId);
                const updatedGrades = c.grades.filter(g => g.studentId !== studentId);
                return { ...c, students: updatedStudents, grades: updatedGrades };
            }
            return c;
        }));
    };

    const handleSaveClass = (classData: Omit<ClassData, 'students' | 'categories' | 'assignments' | 'grades'>) => {
        if (classToEdit) {
            setClasses(prev => prev.map(c => c.id === classToEdit.id ? { ...c, ...classData } : c));
        } else {
            const newClass: ClassData = {
                ...classData,
                students: [],
                categories: buildDefaultCategories(academicConfiguration.evaluationPeriods ?? []),
                assignments: [],
                grades: [],
                schedule: [],
            };
            setClasses(prev => [...prev, newClass]);
            setActiveClassId(newClass.id);
        }
    };

    const handleDeleteClass = (classId: string) => {
        if (window.confirm('¿Seguro que quieres eliminar esta clase? Se perderá TODA la información asociada (alumnado, tareas, calificaciones).')) {
            setClasses(prev => {
                const newClasses = prev.filter(c => c.id !== classId);
                if (activeClassId === classId) {
                    setActiveClassId(newClasses[0]?.id || '');
                }
                return newClasses;
            });
        }
    };

    const handleBulkAddStudents = (newStudentData: { nombre?: string; primerApellido?: string; segundoApellido?: string; acneae: string[] }[]) => {
        if (!activeClassId) return;

        const newStudents: Student[] = newStudentData.map((data, index) => ({
            id: `s-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
            nombre: data.nombre,
            primerApellido: data.primerApellido,
            segundoApellido: data.segundoApellido,
            acneae: data.acneae,
        }));

        if (newStudents.length > 0) {
            setClasses(prevClasses => prevClasses.map(c =>
                c.id === activeClassId
                    ? { ...c, students: [...c.students, ...newStudents] }
                    : c
            ));
            alert(`${newStudents.length} alumn@s importados con éxito a la clase "${activeClass ? formatClassLabel(activeClass, courses) : ''}".`);
        }
        setIsBulkAddModalOpen(false);
    };


    return (
        <div>
            <h3 className="text-xl font-bold text-slate-800 mb-4">Gestión de Clases y Alumnado</h3>
            <div className="flex items-center gap-2 mb-4">
                <label htmlFor="class-select" className="text-sm font-medium">Clase:</label>
                <Select id="class-select" value={activeClassId} onChange={e => setActiveClassId(e.target.value)}>
                    {academicClasses.map((c: ClassData) => <option key={c.id} value={c.id}>{formatClassLabel(c, courses)}</option>)}
                </Select>
                {activeClass && (
                    <div className="flex items-center gap-1">
                        <IconButton label="Editar clase" onClick={() => { setClassToEdit(activeClass); setIsClassModalOpen(true); }}><PencilIcon className="w-4 h-4"/></IconButton>
                        <IconButton label="Eliminar clase" tone="danger" onClick={() => handleDeleteClass(activeClass.id)}><TrashIcon className="w-4 h-4"/></IconButton>
                    </div>
                )}
                <Button variant="primary" onClick={() => { setClassToEdit(null); setIsClassModalOpen(true); }} className="ml-auto">
                    <PlusIcon className="w-4 h-4"/>
                    Añadir Clase
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
                                    onReorder={handleReorderStudent}
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
                <p className="text-slate-500 text-center py-8 bg-slate-50 rounded-lg">No hay clases académicas. ¡Añade una para empezar!</p>
            )}
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
        </div>
    );
};

export default ClassManager;
