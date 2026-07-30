import React, { useState } from 'react';
import { useAcademicYears, useCreateAcademicYear, useActivateAcademicYear } from '../../hooks/useAcademicYears';
import { useCourses, useCreateCourse, useUpdateCourse, useDeleteCourse } from '../../hooks/useCourses';
import { CheckCircleIcon, PencilIcon, TrashIcon } from '../Icons';
import Input from '../Input';
import Select from '../Select';
import Button from '../Button';
import IconButton from '../IconButton';

// Primera pieza de UI del backend granular nuevo (ver plan, "Fase 5
// fusionada", bloque 2): gestiona academic_years en Postgres, en paralelo
// a "Configuración del Curso" (que sigue gobernando el academicConfiguration
// del blob viejo hasta que classes migre — bloque 4). Deliberadamente
// mínimo por ahora: listar/crear/activar, sin editar ni borrar todavía.
const AcademicYearManager: React.FC = () => {
    const { data: years = [], isLoading } = useAcademicYears();
    const createYear = useCreateAcademicYear();
    const activateYear = useActivateAcademicYear();

    const [label, setLabel] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!label.trim() || !startDate || !endDate) return;
        createYear.mutate(
            { label: label.trim(), startDate, endDate },
            { onSuccess: () => { setLabel(''); setStartDate(''); setEndDate(''); } }
        );
    };

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-xl font-bold text-slate-800 mb-4">Cursos Académicos</h3>
                <p className="text-sm text-slate-600 mb-4">
                    Cada curso académico archiva sus propias clases, matrículas y notas por separado. Solo uno puede estar activo a la vez.
                </p>

                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto pr-2 border rounded-lg p-2 bg-slate-50/50">
                    {isLoading && <p className="text-slate-500 text-center py-4">Cargando…</p>}
                    {!isLoading && years.length === 0 && (
                        <p className="text-slate-500 text-center py-4">No hay cursos académicos creados todavía.</p>
                    )}
                    {years.map(year => (
                        <div key={year.id} className="flex items-center justify-between bg-white p-2 rounded-md border">
                            <div>
                                <p className="font-semibold text-slate-700">{year.label}</p>
                                <p className="text-xs text-slate-500">{year.startDate} — {year.endDate}</p>
                            </div>
                            {year.isCurrent ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 text-sm font-medium">
                                    <CheckCircleIcon className="w-4 h-4" /> Actual
                                </span>
                            ) : (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => activateYear.mutate(year.id)}
                                    disabled={activateYear.isPending}
                                >
                                    Marcar como actual
                                </Button>
                            )}
                        </div>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-end gap-2 p-3 border rounded-lg">
                    <div className="w-full sm:w-auto flex-grow">
                        <label className="text-xs font-medium text-slate-600">Nombre</label>
                        <Input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="Ej: 2026-2027" className="w-full mt-1" />
                    </div>
                    <div className="w-full sm:w-auto">
                        <label className="text-xs font-medium text-slate-600">Inicio</label>
                        <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full mt-1" />
                    </div>
                    <div className="w-full sm:w-auto">
                        <label className="text-xs font-medium text-slate-600">Fin</label>
                        <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full mt-1" />
                    </div>
                    <Button type="submit" disabled={createYear.isPending}>Añadir curso académico</Button>
                </form>
            </div>

            <CourseSubjectManager />
        </div>
    );
};

// "Materias" (nivel + asignatura, p.ej. "1º ESO - Biología y Geología"):
// no confundir con los "Cursos Académicos" de arriba (2026-2027, etc.) —
// mismo problema de nombres que ya tenía "Cursos y Materias" en el blob
// viejo. Solo cubre materias académicas normales; "Otras Ocupaciones"
// (que crea materia+clase juntas) se queda en el blob viejo hasta que
// classes migre (bloque 4) — aquí no hay clases todavía a las que
// asociarlas.
const CourseSubjectManager: React.FC = () => {
    const { data: courses = [], isLoading } = useCourses();
    const createCourse = useCreateCourse();
    const updateCourse = useUpdateCourse();
    const deleteCourse = useDeleteCourse();

    const [newLevel, setNewLevel] = useState('1º ESO');
    const [newSubject, setNewSubject] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLevel, setEditLevel] = useState('');
    const [editSubject, setEditSubject] = useState('');

    const academicCourses = courses.filter(c => c.type !== 'other');

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSubject.trim()) return;
        createCourse.mutate(
            { level: newLevel, subject: newSubject.trim(), type: 'academic' },
            { onSuccess: () => setNewSubject('') }
        );
    };

    const handleStartEdit = (id: string, level: string, subject: string) => {
        setEditingId(id);
        setEditLevel(level);
        setEditSubject(subject);
    };

    const handleSaveEdit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingId || !editSubject.trim()) return;
        updateCourse.mutate(
            { id: editingId, data: { level: editLevel, subject: editSubject.trim() } },
            { onSuccess: () => setEditingId(null) }
        );
    };

    const handleDelete = (id: string, subject: string) => {
        if (window.confirm(`¿Seguro que quieres eliminar la materia '${subject}'?`)) {
            deleteCourse.mutate(id, {
                onError: () => alert('No se puede borrar: hay clases u otros elementos del currículo que la usan.'),
            });
        }
    };

    return (
        <div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Materias</h3>
            <p className="text-sm text-slate-600 mb-4">
                Nivel y asignatura (p.ej. "1º ESO - Biología y Geología") — son las materias sobre las que se define el currículo (competencias, criterios, saberes, unidades de programación).
            </p>

            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto pr-2 border rounded-lg p-2 bg-slate-50/50">
                {isLoading && <p className="text-slate-500 text-center py-4">Cargando…</p>}
                {!isLoading && academicCourses.length === 0 && (
                    <p className="text-slate-500 text-center py-4">No hay materias definidas.</p>
                )}
                {academicCourses.map(course => (
                    editingId === course.id ? (
                        <form key={course.id} onSubmit={handleSaveEdit} className="flex flex-col sm:flex-row items-end gap-2 bg-white p-2 rounded-md border">
                            <div className="w-full sm:w-auto flex-grow">
                                <Select value={editLevel} onChange={e => setEditLevel(e.target.value)} className="w-full">
                                    <option>1º ESO</option> <option>2º ESO</option> <option>3º ESO</option> <option>4º ESO</option>
                                    <option>3º ESO (PDC)</option> <option>4º ESO (PDC)</option>
                                    <option>1º Bachillerato</option> <option>2º Bachillerato</option>
                                </Select>
                            </div>
                            <div className="w-full sm:w-auto flex-grow">
                                <Input type="text" value={editSubject} onChange={e => setEditSubject(e.target.value)} className="w-full" autoFocus />
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button type="submit" className="bg-blue-600 text-white text-sm font-semibold py-1.5 px-3 rounded-lg hover:bg-blue-700">Guardar</button>
                                <button type="button" onClick={() => setEditingId(null)} className="text-slate-500 text-sm font-medium py-1.5 px-3 rounded-lg hover:bg-slate-100">Cancelar</button>
                            </div>
                        </form>
                    ) : (
                        <div key={course.id} className="flex items-center justify-between bg-white p-2 rounded-md border">
                            <p><span className="font-semibold text-slate-700">{course.level}</span> - {course.subject}</p>
                            <div className="flex items-center gap-1">
                                <IconButton label="Editar materia" onClick={() => handleStartEdit(course.id, course.level, course.subject)}><PencilIcon className="w-4 h-4" /></IconButton>
                                <IconButton label="Eliminar materia" tone="danger" onClick={() => handleDelete(course.id, course.subject)}><TrashIcon className="w-4 h-4" /></IconButton>
                            </div>
                        </div>
                    )
                ))}
            </div>

            <form onSubmit={handleAdd} className="flex flex-col sm:flex-row items-end gap-2 p-3 border rounded-lg">
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
                    <Input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Ej: Física y Química" className="w-full mt-1" />
                </div>
                <Button type="submit" disabled={createCourse.isPending}>Añadir Materia</Button>
            </form>
        </div>
    );
};

export default AcademicYearManager;
