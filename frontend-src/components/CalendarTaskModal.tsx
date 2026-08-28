

import React, { useState, useEffect, useMemo } from 'react';
import type { Assignment, EvaluationCriterion, LinkedCriterion, Category, SpecificCompetence, KeyCompetence, ClassData, Course, AcademicConfiguration, EvaluationPeriod, ImportanciaActividad } from '../types';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { linkClassName } from '../theme/components/Link';
import { formatClassLabel } from '../utils';
import LinkedCriteriaSelector from './LinkedCriteriaSelector';

const IMPORTANCIA_LABEL: Record<ImportanciaActividad, string> = {
    muy_baja: 'Muy baja',
    baja: 'Baja',
    normal: 'Normal',
    alta: 'Alta',
    muy_alta: 'Muy alta',
};

interface CalendarTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (assignment: Omit<Assignment, 'id'>, classId: string) => void;
    selectedDate: Date;
    classes: ClassData[];
    courses: Course[];
    criteria: EvaluationCriterion[];
    specificCompetences: SpecificCompetence[];
    keyCompetences: KeyCompetence[];
    academicConfiguration: AcademicConfiguration;
}

const toYYYYMMDD = (date: Date): string => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const CalendarTaskModal: React.FC<CalendarTaskModalProps> = (props) => {
    const { isOpen, onClose, onSave, selectedDate, classes: allClasses, courses, criteria, specificCompetences, keyCompetences, academicConfiguration } = props;

    // Solo clases académicas: "otras ocupaciones" (Guardia, Recreo...) no
    // tienen alumnado que evaluar, no tiene sentido crearles una tarea.
    const classes = useMemo(
        () => allClasses.filter(c => courses.find(course => course.id === c.courseId)?.type !== 'other'),
        [allClasses, courses]
    );

    const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
    const [taskDate, setTaskDate] = useState<string>(() => toYYYYMMDD(selectedDate));
    const [evaluationPeriodId, setEvaluationPeriodId] = useState<string>('');
    const [name, setName] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [linkedCriteria, setLinkedCriteria] = useState<LinkedCriterion[]>([]);
    const [pesoEnCategoria, setPesoEnCategoria] = useState<string>('');
    const [importancia, setImportancia] = useState<ImportanciaActividad>('normal');
    const [importanciaAvanzada, setImportanciaAvanzada] = useState(false);
    const [importanciaPersonalizada, setImportanciaPersonalizada] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            const initialDate = toYYYYMMDD(selectedDate);
            setTaskDate(initialDate);
            const matchingPeriod = academicConfiguration.evaluationPeriods.find(p => initialDate >= p.startDate && initialDate <= p.endDate);
            setEvaluationPeriodId(matchingPeriod?.id || academicConfiguration.evaluationPeriods[0]?.id || '');
            setName('');
            setSelectedCategoryId('');
            setLinkedCriteria([]);
            setPesoEnCategoria('');
            setImportancia('normal');
            setImportanciaAvanzada(false);
            setImportanciaPersonalizada('');
            if (!classes.find(c => c.id === selectedClassId)) {
                setSelectedClassId(classes[0]?.id || '');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Sugiere el periodo según la fecha al cambiarla, pero sin forzarlo: si
    // la fecha no cae dentro de ningún periodo definido (huecos entre
    // evaluaciones, fechas mal ajustadas...) se deja el periodo elegido tal
    // cual en vez de vaciarlo — antes el periodo se derivaba solo de la
    // fecha sin ningún control manual, y una fecha fuera de rango dejaba la
    // categoría sin poder rellenarse nunca, sin forma de arreglarlo desde
    // aquí.
    useEffect(() => {
        const matchingPeriod = academicConfiguration.evaluationPeriods.find(p => taskDate >= p.startDate && taskDate <= p.endDate);
        if (matchingPeriod) {
            setEvaluationPeriodId(matchingPeriod.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskDate]);

    const evaluationPeriod = useMemo<EvaluationPeriod | null>(() => {
        return academicConfiguration.evaluationPeriods.find(p => p.id === evaluationPeriodId) || null;
    }, [evaluationPeriodId, academicConfiguration.evaluationPeriods]);

    const selectedClass = useMemo(() => classes.find(c => c.id === selectedClassId), [classes, selectedClassId]);
    
    const availableCategories = useMemo<Category[]>(() => {
        if (!selectedClass || !evaluationPeriod) return [];
        return selectedClass.categories.filter(c => c.evaluationPeriodId === evaluationPeriod.id);
    }, [selectedClass, evaluationPeriod]);

    // Todos los de la materia, sin excluir los ya vinculados -- a diferencia
    // del antiguo desplegable "Añadir criterio" (que sí los excluía),
    // LinkedCriteriaSelector necesita la lista completa para poder marcar/
    // desmarcar con checkboxes.
    const criteriaDelCurso = useMemo<EvaluationCriterion[]>(() => {
        if (!selectedClass) return [];
        return criteria.filter(c => c.courseId === selectedClass.courseId);
    }, [selectedClass, criteria]);

    useEffect(() => {
        if (!availableCategories.find(c => c.id === selectedCategoryId)) {
            setSelectedCategoryId('');
        }
    }, [availableCategories, selectedCategoryId]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name && selectedClassId && selectedCategoryId && evaluationPeriod) {
            // FIX: Added missing 'evaluationMethod' property.
            const assignmentData: Omit<Assignment, 'id'> = {
                name,
                categoryId: selectedCategoryId,
                evaluationPeriodId: evaluationPeriod.id,
                date: taskDate,
                evaluationMethod: 'direct_grade',
                linkedCriteria,
                pesoEnCategoria: pesoEnCategoria.trim() ? Number(pesoEnCategoria) : undefined,
                importancia,
                importanciaPersonalizada: importanciaAvanzada && importanciaPersonalizada.trim() ? Number(importanciaPersonalizada) : undefined,
            };
            onSave(assignmentData, selectedClassId);
            onClose();
        } else {
            alert("Por favor, completa todos los campos: clase, nombre y categoría.");
        }
    };
      
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nueva Tarea Evaluable" size="3xl">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-4 bg-slate-50 rounded-lg border">
                    <div>
                        <label htmlFor="date-task" className="block text-sm font-medium text-slate-700">Fecha</label>
                        <Input
                            type="date" id="date-task" value={taskDate} onChange={e => setTaskDate(e.target.value)}
                            className="mt-1"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="class-task" className="block text-sm font-medium text-slate-700">Clase</label>
                        <Select
                            id="class-task" value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
                            className="mt-1"
                            required
                        >
                            {classes.map(c => <option key={c.id} value={c.id}>{formatClassLabel(c, courses)}</option>)}
                        </Select>
                    </div>
                    <div>
                        <label htmlFor="period-task" className="block text-sm font-medium text-slate-700">Periodo</label>
                        <Select
                            id="period-task" value={evaluationPeriodId} onChange={e => setEvaluationPeriodId(e.target.value)}
                            className="mt-1"
                            required
                        >
                            {academicConfiguration.evaluationPeriods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Select>
                    </div>
                    <div>
                        <label htmlFor="category-task" className="block text-sm font-medium text-slate-700">Categoría</label>
                        <Select
                            id="category-task" value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)}
                            className="mt-1"
                            required disabled={availableCategories.length === 0}
                        >
                            <option value="" disabled>{availableCategories.length === 0 ? `No hay categorías en la ${evaluationPeriod?.name || ''}` : 'Selecciona una categoría...'}</option>
                            {availableCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </Select>
                    </div>
                    <div>
                         <label htmlFor="name-task" className="block text-sm font-medium text-slate-700">Nombre</label>
                        <Input
                            type="text" id="name-task" value={name} onChange={e => setName(e.target.value)}
                            className="mt-1"
                            required
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    {selectedCategoryId && (
                        <div>
                            <label htmlFor="peso-categoria-task" className="block text-sm font-medium text-slate-700">
                                Peso en la categoría (%)
                            </label>
                            <Input
                                type="number" id="peso-categoria-task" min="0" max="100" step="1"
                                value={pesoEnCategoria} onChange={(e) => setPesoEnCategoria(e.target.value)}
                                placeholder="Reparto igual"
                                className="mt-1"
                            />
                        </div>
                    )}
                    <div>
                        <div className="flex items-center justify-between">
                            <label htmlFor="importancia-task" className="block text-sm font-medium text-slate-700">
                                Importancia (evaluación por criterios)
                            </label>
                            <button
                                type="button"
                                onClick={() => setImportanciaAvanzada(v => !v)}
                                className={`text-xs font-semibold ${linkClassName}`}
                            >
                                {importanciaAvanzada ? 'Usar niveles' : 'Modo avanzado'}
                            </button>
                        </div>
                        {importanciaAvanzada ? (
                            <Input
                                type="number" step="0.1" min="0"
                                value={importanciaPersonalizada} onChange={(e) => setImportanciaPersonalizada(e.target.value)}
                                placeholder="Factor (ej. 1.25)"
                                className="mt-1"
                            />
                        ) : (
                            <Select
                                id="importancia-task" value={importancia} onChange={(e) => setImportancia(e.target.value as ImportanciaActividad)}
                                className="mt-1"
                            >
                                {(Object.keys(IMPORTANCIA_LABEL) as ImportanciaActividad[]).map(key => (
                                    <option key={key} value={key}>{IMPORTANCIA_LABEL[key]}</option>
                                ))}
                            </Select>
                        )}
                    </div>
                </div>

                <div>
                    <h4 className="text-sm font-medium text-slate-700 mb-2">Criterios de Evaluación</h4>
                    {!selectedClassId ? (
                        <p className="text-sm text-slate-400 italic text-center py-4 bg-slate-50 rounded-lg">
                            Elige una clase primero.
                        </p>
                    ) : (
                        <LinkedCriteriaSelector
                            key={selectedClassId}
                            linkedCriteria={linkedCriteria}
                            onChange={setLinkedCriteria}
                            criteria={criteriaDelCurso}
                            specificCompetences={specificCompetences}
                            keyCompetences={keyCompetences}
                        />
                    )}
                </div>
                <div className="flex justify-end pt-4 space-x-2 border-t mt-6">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" variant="primary">Guardar Tarea</Button>
                </div>
            </form>
        </Modal>
    );
};

export default CalendarTaskModal;