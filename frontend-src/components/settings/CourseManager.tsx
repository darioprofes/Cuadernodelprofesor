import React, { useState } from 'react';
import type { ClassData, Course } from '../../types';
import { TrashIcon } from '../Icons';
import Input from '../Input';
import Select from '../Select';

const CourseManager: React.FC<{
    courses: Course[];
    setCourses: (updater: React.SetStateAction<Course[]>) => void;
    classes: ClassData[];
    setClasses: (updater: React.SetStateAction<ClassData[]>) => void;
}> = ({ courses, setCourses, classes, setClasses }) => {
    const [newLevel, setNewLevel] = useState('1º ESO');
    const [newSubject, setNewSubject] = useState('');
    const [newOtherName, setNewOtherName] = useState('');

    const academicCourses = courses.filter(c => c.type !== 'other');
    const otherOccupations = courses.filter(c => c.type === 'other');

    const handleAddCourse = (e: React.FormEvent) => {
        e.preventDefault();
        if (newSubject.trim() === '') return;
        const newCourse: Course = {
            id: `course-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            level: newLevel,
            subject: newSubject.trim(),
            type: 'academic',
        };
        setCourses(prev => [...prev, newCourse]);
        setNewSubject('');
    };

    const handleAddOtherOccupation = (e: React.FormEvent) => {
        e.preventDefault();
        if (newOtherName.trim() === '') return;

        const newCourse: Course = {
            id: `course-other-${Date.now()}`,
            level: 'Otro',
            subject: newOtherName.trim(),
            type: 'other'
        };

        const newClass: ClassData = {
            id: `class-other-${Date.now()}`,
            courseId: newCourse.id,
            students: [],
            categories: [],
            assignments: [],
            grades: [],
            schedule: [],
        };

        setCourses(prev => [...prev, newCourse]);
        setClasses(prev => [...prev, newClass]);
        setNewOtherName('');
    };

    const handleDeleteCourse = (courseId: string) => {
        const courseToDelete = courses.find(c => c.id === courseId);
        if (!courseToDelete) return;

        const isAcademic = courseToDelete.type !== 'other';
        const associatedClasses = classes.filter(c => c.courseId === courseId);

        let confirmationMessage = isAcademic
            ? `¿Seguro que quieres eliminar el curso '${courseToDelete.subject}'?`
            : `¿Seguro que quieres eliminar la ocupación '${courseToDelete.subject}'?`;

        if (isAcademic && associatedClasses.length > 0) {
            confirmationMessage += `\n\nADVERTENCIA: ${associatedClasses.length} clase(s) está(n) asociada(s) a este curso y también serán eliminadas.`;
        } else if (!isAcademic) {
            confirmationMessage += `\n\nEsto también eliminará la entrada correspondiente de tu horario semanal.`;
        }

        if (window.confirm(confirmationMessage)) {
            setCourses(prev => prev.filter(c => c.id !== courseId));
            setClasses(prev => prev.filter(c => c.courseId !== courseId));
        }
    };

    return (
        <div>
            <h3 className="text-xl font-bold text-slate-800 mb-4">Gestión de Cursos y Materias</h3>
            <div className="space-y-6">
                <div>
                    <h4 className="text-lg font-semibold text-slate-700 mb-2">Cursos Académicos</h4>
                    <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-2 border rounded-lg p-2 bg-slate-50/50">
                        {academicCourses.length > 0 ? academicCourses.map(course => (
                            <div key={course.id} className="flex items-center justify-between bg-white p-2 rounded-md border">
                                <p><span className="font-semibold text-slate-700">{course.level}</span> - {course.subject}</p>
                                <button onClick={() => handleDeleteCourse(course.id)} className="p-1 text-slate-400 hover:text-red-500 rounded-full" title="Eliminar curso"><TrashIcon className="w-4 h-4"/></button>
                            </div>
                        )) : <p className="text-slate-500 text-center py-4">No hay cursos académicos definidos.</p>}
                    </div>
                    <form onSubmit={handleAddCourse} className="flex flex-col sm:flex-row items-end gap-2 p-3 border rounded-lg">
                        <div className="w-full sm:w-auto flex-grow">
                            <label className="text-xs font-medium text-slate-600">Nivel Educativo</label>
                            <Select value={newLevel} onChange={e => setNewLevel(e.target.value)} className="w-full mt-1">
                                <option>1º ESO</option> <option>2º ESO</option> <option>3º ESO</option> <option>4º ESO</option>
                                <option>3º ESO (PDC)</option> <option>4º ESO (PDC)</option>
                                <option>1º Bachillerato</option> <option>2º Bachillerato</option>
                            </Select>
                        </div>
                        <div className="w-full sm:w-auto flex-grow">
                            <label className="text-xs font-medium text-slate-600">Nombre de la Materia</label>
                            <Input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Ej: Física y Química" className="w-full mt-1"/>
                        </div>
                        <button type="submit" className="w-full sm:w-auto bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Añadir Curso</button>
                    </form>
                </div>
                <div>
                    <h4 className="text-lg font-semibold text-slate-700 mb-2">Otras Ocupaciones (Guardias, Reuniones, etc.)</h4>
                    <p className="text-xs text-slate-500 mb-2">
                        Estas ocupaciones aparecerán en tu horario y calendario, pero no se considerarán clases a evaluar.
                    </p>
                     <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-2 border rounded-lg p-2 bg-slate-50/50">
                        {otherOccupations.length > 0 ? otherOccupations.map(course => (
                            <div key={course.id} className="flex items-center justify-between bg-white p-2 rounded-md border">
                                <p>{course.subject}</p>
                                <button onClick={() => handleDeleteCourse(course.id)} className="p-1 text-slate-400 hover:text-red-500 rounded-full" title="Eliminar ocupación"><TrashIcon className="w-4 h-4"/></button>
                            </div>
                        )) : <p className="text-slate-500 text-center py-4">No hay otras ocupaciones definidas.</p>}
                    </div>
                    <form onSubmit={handleAddOtherOccupation} className="flex items-end gap-2 p-3 border rounded-lg">
                        <div className="w-full flex-grow">
                            <label className="text-xs font-medium text-slate-600">Nombre de la Ocupación</label>
                            <Input type="text" value={newOtherName} onChange={e => setNewOtherName(e.target.value)} placeholder="Ej: Guardia, Reunión Dpto." className="w-full mt-1"/>
                        </div>
                        <button type="submit" className="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700">Añadir Ocupación</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CourseManager;
