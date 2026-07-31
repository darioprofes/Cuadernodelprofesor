import React, { useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { ClassData, Course } from '../../types';
import { PencilIcon, TrashIcon, XMarkIcon } from '../Icons';
import Input from '../Input';
import Select from '../Select';
import IconButton from '../IconButton';
import { HUE_PRESETS, ACCENT_WHITE, ACCENT_BLACK } from '../../utils';
import { useCreateCourse, useUpdateCourse, useDeleteCourse } from '../../hooks/useCourses';
import { useCurrentAcademicYear, useAcademicYearCourses, useAddAcademicYearCourse, useRemoveAcademicYearCourse } from '../../hooks/useAcademicYears';
import { useApiClasses, useCreateClass, useUpdateClass, useDeleteClass } from '../../hooks/useApiClasses';

// Solo se usan los campos "cáscara" de una clase (id/courseId/colorAcento/
// schedule) — nunca alumnado/categorías/tareas/notas, así que no hace falta
// el tipo ClassData completo (types.ts) para la lista resuelta por
// plataforma; students/categories/assignments/grades siguen en el blob
// hasta los bloques 5/6, sin tocarlos aquí.
type ClassShell = { id: string; courseId: string; colorAcento?: number; schedule?: unknown[] };

const CourseManager: React.FC<{
    courses: Course[];
    setCourses: (updater: React.SetStateAction<Course[]>) => void;
    classes: ClassData[];
    setClasses: (updater: React.SetStateAction<ClassData[]>) => void;
}> = ({ courses, setCourses, classes, setClasses }) => {
    const isDesktop = isTauri();
    const currentYear = useCurrentAcademicYear({ enabled: !isDesktop });
    const yearId = currentYear.data?.id ?? '';
    const remoteClasses = useApiClasses(yearId, { enabled: !isDesktop && !!yearId });
    const createCourseMutation = useCreateCourse();
    const updateCourseMutation = useUpdateCourse();
    const deleteCourseMutation = useDeleteCourse();
    const createClassMutation = useCreateClass();
    const updateClassMutation = useUpdateClass();
    const deleteClassMutation = useDeleteClass();
    // Materias "de este curso académico" (Fase 8): en escritorio no existe
    // el concepto (blob sin academic_years), se sigue mostrando la lista
    // global de materias tal cual, sin filtrar.
    const yearCoursesQuery = useAcademicYearCourses(yearId, { enabled: !isDesktop && !!yearId });
    const addYearCourseMutation = useAddAcademicYearCourse();
    const removeYearCourseMutation = useRemoveAcademicYearCourse();
    const linkedCourseIds = new Set((yearCoursesQuery.data ?? []).map(yc => yc.courseId));

    const effectiveClasses: ClassShell[] = isDesktop ? classes : (remoteClasses.data ?? []);

    const [newLevel, setNewLevel] = useState('1º ESO');
    const [newSubject, setNewSubject] = useState('');
    const [newOtherName, setNewOtherName] = useState('');
    const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
    const [editLevel, setEditLevel] = useState('');
    const [editSubject, setEditSubject] = useState('');
    const [editColorAcento, setEditColorAcento] = useState<number | undefined>(undefined);

    const [existingToLink, setExistingToLink] = useState('');

    const allAcademicCourses = courses.filter(c => c.type !== 'other');
    const academicCourses = isDesktop ? allAcademicCourses : allAcademicCourses.filter(c => linkedCourseIds.has(c.id));
    const unlinkedCourses = isDesktop ? [] : allAcademicCourses.filter(c => !linkedCourseIds.has(c.id));
    const otherOccupations = courses.filter(c => c.type === 'other');

    const handleStartEdit = (course: Course) => {
        setEditingCourseId(course.id);
        setEditLevel(course.level);
        setEditSubject(course.subject);
        setEditColorAcento(effectiveClasses.find(cl => cl.courseId === course.id)?.colorAcento);
    };

    const handleCancelEdit = () => {
        setEditingCourseId(null);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editSubject.trim() === '' || !editingCourseId) return;

        const editingCourse = courses.find(c => c.id === editingCourseId);
        const newLevelValue = editingCourse?.type === 'other' ? editingCourse.level : editLevel;

        if (isDesktop) {
            setCourses(prev => prev.map(c => c.id === editingCourseId
                ? { ...c, subject: editSubject.trim(), level: newLevelValue }
                : c
            ));

            // El color de acento vive en la clase, no en el curso — solo se toca
            // aquí para "Otras Ocupaciones", que siempre tienen una única clase
            // asociada (a diferencia de un curso académico, que puede tener
            // varios grupos con colores distintos gestionados desde Clases).
            if (editingCourse?.type === 'other') {
                setClasses(prev => prev.map(cl => cl.courseId === editingCourseId
                    ? { ...cl, colorAcento: editColorAcento }
                    : cl
                ));
            }
        } else {
            await updateCourseMutation.mutateAsync({ id: editingCourseId, data: { subject: editSubject.trim(), level: newLevelValue } });
            if (editingCourse?.type === 'other') {
                const cls = effectiveClasses.find(cl => cl.courseId === editingCourseId);
                if (cls) {
                    await updateClassMutation.mutateAsync({ id: cls.id, yearId, data: { colorAcento: editColorAcento } });
                }
            }
        }

        setEditingCourseId(null);
    };

    const handleAddCourse = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newSubject.trim() === '') return;
        if (isDesktop) {
            const newCourse: Course = {
                id: `course-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                level: newLevel,
                subject: newSubject.trim(),
                type: 'academic',
            };
            setCourses(prev => [...prev, newCourse]);
        } else {
            const newCourse = await createCourseMutation.mutateAsync({ level: newLevel, subject: newSubject.trim(), type: 'academic' });
            // Crear una materia nueva desde aquí significa "la voy a impartir
            // este curso académico" — se enlaza en el mismo paso, si no
            // quedaría creada pero invisible en la lista (filtrada por año).
            await addYearCourseMutation.mutateAsync({ yearId, data: { courseId: newCourse.id } });
        }
        setNewSubject('');
    };

    // Enlazar una materia que ya existe globalmente (de otro curso académico,
    // o creada de antemano) sin volver a definir su currículo.
    const handleLinkExisting = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!existingToLink) return;
        await addYearCourseMutation.mutateAsync({ yearId, data: { courseId: existingToLink } });
        setExistingToLink('');
    };

    // Distinto de "Eliminar materia" (handleDeleteCourse, más abajo): esto
    // NO borra la materia ni su currículo, solo deja de declararla como
    // impartida este curso académico — puede seguir usándose otros años.
    const handleUnlinkCourse = async (courseId: string, subject: string) => {
        if (!window.confirm(`¿Quitar '${subject}' de este curso académico? La materia y su currículo no se borran — solo dejará de aparecer como impartida este año.`)) return;
        await removeYearCourseMutation.mutateAsync({ yearId, courseId }, {
            onError: () => alert('No se puede quitar: hay grupos (clases) de esta materia en este curso académico. Bórralos o reasígnalos primero.'),
        });
    };

    const handleAddOtherOccupation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newOtherName.trim() === '') return;

        if (isDesktop) {
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
        } else {
            const newCourse = await createCourseMutation.mutateAsync({ level: 'Otro', subject: newOtherName.trim(), type: 'other' });
            await createClassMutation.mutateAsync({ yearId, data: { courseId: newCourse.id, schedule: [] } });
        }
        setNewOtherName('');
    };

    const handleDeleteCourse = async (courseId: string) => {
        const courseToDelete = courses.find(c => c.id === courseId);
        if (!courseToDelete) return;

        const isAcademic = courseToDelete.type !== 'other';
        const associatedClasses = effectiveClasses.filter(c => c.courseId === courseId);

        let confirmationMessage = isAcademic
            ? `¿Seguro que quieres eliminar el curso '${courseToDelete.subject}'?`
            : `¿Seguro que quieres eliminar la ocupación '${courseToDelete.subject}'?`;

        if (isAcademic && associatedClasses.length > 0) {
            confirmationMessage += `\n\nADVERTENCIA: ${associatedClasses.length} clase(s) está(n) asociada(s) a este curso y también serán eliminadas.`;
        } else if (!isAcademic) {
            confirmationMessage += `\n\nEsto también eliminará la entrada correspondiente de tu horario semanal.`;
        }

        if (!window.confirm(confirmationMessage)) return;

        if (isDesktop) {
            setCourses(prev => prev.filter(c => c.id !== courseId));
            setClasses(prev => prev.filter(c => c.courseId !== courseId));
        } else {
            for (const cls of associatedClasses) {
                await deleteClassMutation.mutateAsync({ id: cls.id, yearId });
            }
            // course_id es RESTRICT en academic_year_courses (Fase 8) — si la
            // materia sigue declarada como impartida este año, borrarla
            // directamente daría 409. Solo cubre el año actual, igual que
            // associatedClasses de arriba: limitación ya existente (una
            // materia con clases/enlaces en OTROS años seguiría bloqueando
            // el borrado, sin cambios respecto al comportamiento previo).
            if (isAcademic && linkedCourseIds.has(courseId)) {
                await removeYearCourseMutation.mutateAsync({ yearId, courseId });
            }
            await deleteCourseMutation.mutateAsync(courseId);
        }
    };

    return (
        <div>
            <h3 className="text-xl font-bold text-slate-800 mb-4">Materias</h3>
            <div className="space-y-6">
                <div>
                    <h4 className="text-lg font-semibold text-slate-700 mb-2">{isDesktop ? 'Materias' : 'Materias de este curso académico'}</h4>
                    <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-2 border rounded-lg p-2 bg-slate-50/50">
                        {academicCourses.length > 0 ? academicCourses.map(course => (
                            editingCourseId === course.id ? (
                                <form key={course.id} onSubmit={handleSaveEdit} className="flex flex-col sm:flex-row items-end gap-2 bg-white p-2 rounded-md border">
                                    <div className="w-full sm:w-auto flex-grow">
                                        <Select value={editLevel} onChange={e => setEditLevel(e.target.value)} className="w-full">
                                            <option>1º ESO</option> <option>2º ESO</option> <option>3º ESO</option> <option>4º ESO</option>
                                            <option>3º ESO (PDC)</option> <option>4º ESO (PDC)</option>
                                            <option>1º Bachillerato</option> <option>2º Bachillerato</option>
                                        </Select>
                                    </div>
                                    <div className="w-full sm:w-auto flex-grow">
                                        <Input type="text" value={editSubject} onChange={e => setEditSubject(e.target.value)} className="w-full" autoFocus/>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button type="submit" className="bg-blue-600 text-white text-sm font-semibold py-1.5 px-3 rounded-lg hover:bg-blue-700">Guardar</button>
                                        <button type="button" onClick={handleCancelEdit} className="text-slate-500 text-sm font-medium py-1.5 px-3 rounded-lg hover:bg-slate-100">Cancelar</button>
                                    </div>
                                </form>
                            ) : (
                                <div key={course.id} className="flex items-center justify-between bg-white p-2 rounded-md border">
                                    <p><span className="font-semibold text-slate-700">{course.level}</span> - {course.subject}</p>
                                    <div className="flex items-center gap-1">
                                        {!isDesktop && <IconButton label="Quitar de este curso académico" onClick={() => handleUnlinkCourse(course.id, course.subject)}><XMarkIcon className="w-4 h-4"/></IconButton>}
                                        <IconButton label="Editar materia" onClick={() => handleStartEdit(course)}><PencilIcon className="w-4 h-4"/></IconButton>
                                        <IconButton label="Eliminar materia" tone="danger" onClick={() => handleDeleteCourse(course.id)}><TrashIcon className="w-4 h-4"/></IconButton>
                                    </div>
                                </div>
                            )
                        )) : <p className="text-slate-500 text-center py-4">{isDesktop ? 'No hay materias definidas.' : 'No impartes ninguna materia este curso académico todavía.'}</p>}
                    </div>

                    {!isDesktop && unlinkedCourses.length > 0 && (
                        <form onSubmit={handleLinkExisting} className="flex flex-col sm:flex-row items-end gap-2 p-3 border rounded-lg mb-2 bg-slate-50/50">
                            <div className="w-full sm:w-auto flex-grow">
                                <label className="text-xs font-medium text-slate-600">Añadir materia ya existente (de otro curso académico)</label>
                                <Select value={existingToLink} onChange={e => setExistingToLink(e.target.value)} className="w-full mt-1">
                                    <option value="">Selecciona una materia…</option>
                                    {unlinkedCourses.map(c => <option key={c.id} value={c.id}>{c.level} - {c.subject}</option>)}
                                </Select>
                            </div>
                            <button type="submit" disabled={!existingToLink} className="w-full sm:w-auto bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-slate-700 disabled:opacity-50">Añadir a este curso</button>
                        </form>
                    )}

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
                            <label className="text-xs font-medium text-slate-600">Nombre de la Materia (nueva)</label>
                            <Input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Ej: Física y Química" className="w-full mt-1"/>
                        </div>
                        <button type="submit" className="w-full sm:w-auto bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Añadir Materia</button>
                    </form>
                </div>
                <div>
                    <h4 className="text-lg font-semibold text-slate-700 mb-2">Otras Ocupaciones (Guardias, Reuniones, etc.)</h4>
                    <p className="text-xs text-slate-500 mb-2">
                        Estas ocupaciones aparecerán en tu horario y calendario, pero no se considerarán clases a evaluar.
                    </p>
                     <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-2 border rounded-lg p-2 bg-slate-50/50">
                        {otherOccupations.length > 0 ? otherOccupations.map(course => (
                            editingCourseId === course.id ? (
                                <form key={course.id} onSubmit={handleSaveEdit} className="flex flex-col gap-2 bg-white p-2 rounded-md border">
                                    <div className="flex items-end gap-2">
                                        <div className="w-full flex-grow">
                                            <Input type="text" value={editSubject} onChange={e => setEditSubject(e.target.value)} className="w-full" autoFocus/>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button type="submit" className="bg-green-600 text-white text-sm font-semibold py-1.5 px-3 rounded-lg hover:bg-green-700">Guardar</button>
                                            <button type="button" onClick={handleCancelEdit} className="text-slate-500 text-sm font-medium py-1.5 px-3 rounded-lg hover:bg-slate-100">Cancelar</button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-xs font-medium text-slate-600 mr-1">Color:</span>
                                        <button
                                            type="button"
                                            onClick={() => setEditColorAcento(undefined)}
                                            title="Automático (según el nombre)"
                                            className={`w-6 h-6 rounded-full border-2 border-dashed flex items-center justify-center text-[8px] font-bold text-slate-400 bg-white ${editColorAcento == null ? 'ring-2 ring-offset-1 ring-blue-500 border-blue-400' : 'border-slate-300'}`}
                                        >
                                            A
                                        </button>
                                        {HUE_PRESETS.map(hue => (
                                            <button
                                                key={hue}
                                                type="button"
                                                onClick={() => setEditColorAcento(hue)}
                                                title={`Tono ${hue}°`}
                                                className={`w-6 h-6 rounded-full ${editColorAcento === hue ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
                                                style={{ backgroundColor: `hsl(${hue}, 45%, 42%)` }}
                                            />
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setEditColorAcento(ACCENT_WHITE)}
                                            title="Blanco"
                                            className={`w-6 h-6 rounded-full border border-slate-300 bg-white ${editColorAcento === ACCENT_WHITE ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setEditColorAcento(ACCENT_BLACK)}
                                            title="Negro"
                                            className={`w-6 h-6 rounded-full bg-slate-900 ${editColorAcento === ACCENT_BLACK ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
                                        />
                                    </div>
                                </form>
                            ) : (
                                <div key={course.id} className="flex items-center justify-between bg-white p-2 rounded-md border">
                                    <p>{course.subject}</p>
                                    <div className="flex items-center gap-1">
                                        <IconButton label="Editar ocupación" onClick={() => handleStartEdit(course)}><PencilIcon className="w-4 h-4"/></IconButton>
                                        <IconButton label="Eliminar ocupación" tone="danger" onClick={() => handleDeleteCourse(course.id)}><TrashIcon className="w-4 h-4"/></IconButton>
                                    </div>
                                </div>
                            )
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
