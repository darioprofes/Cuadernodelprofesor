import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ClassData, Course, AcademicConfiguration } from '../../types';
import { formatClassLabel } from '../../utils';
import Modal from '../Modal';
import Button from '../Button';
import Input from '../Input';
import Select from '../Select';
import ClassLabel from '../ClassLabel';
import ImportScheduleModal from '../ImportScheduleModal';
import { ChevronDownIcon } from '../Icons';
import { tableBaseClassName, tableHeadCellClassName, tableHeadRowClassName, tableRowClassName, tableWrapperClassName } from '../../theme/components/Table';
import { linkClassName } from '../../theme/components/Link';
import { useCurrentAcademicYear } from '../../hooks/useAcademicYears';
import { useApiClasses, useUpdateClass } from '../../hooks/useApiClasses';
import { apiClassToLocal } from '../../services/apiAdapters';

interface ScheduleSlotInfo {
    classId: string;
    aula?: string;
    nota?: string;
}

const PeriodModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    initialLabel?: string;
    initialIsBreak?: boolean;
    onSave: (label: string, isBreak: boolean) => void;
}> = ({ isOpen, onClose, initialLabel = '', initialIsBreak = false, onSave }) => {
    const [label, setLabel] = useState(initialLabel);
    const [isBreak, setIsBreak] = useState(initialIsBreak);

    useEffect(() => {
        if (isOpen) {
            setLabel(initialLabel);
            setIsBreak(initialIsBreak);
        }
    }, [isOpen, initialLabel, initialIsBreak]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const nextLabel = label.trim();
        if (!nextLabel) return;
        onSave(nextLabel, isBreak);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initialLabel ? 'Editar franja horaria' : 'Añadir franja horaria'} size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="text-xs font-medium text-slate-600">Intervalo de horas</label>
                    <Input
                        type="text"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder="Ej.: 11:00-11:30"
                        className="w-full mt-1"
                        autoFocus
                        required
                    />
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                    <input type="checkbox" checked={isBreak} onChange={e => setIsBreak(e.target.checked)} className="rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                    Es una franja de recreo
                </label>
                <p className="text-xs text-slate-500">Una franja de recreo puede tener asignada una guardia u otra ocupación.</p>
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" variant="primary">Guardar</Button>
                </div>
            </form>
        </Modal>
    );
};

const ScheduleSlotModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    dayLabel: string;
    periodLabel: string;
    classes: ClassData[];
    courses: Course[];
    initialSlot: ScheduleSlotInfo | undefined;
    onSave: (classId: string, aula: string, nota: string) => void;
}> = ({ isOpen, onClose, dayLabel, periodLabel, classes, courses, initialSlot, onSave }) => {
    const [classId, setClassId] = useState(initialSlot?.classId || '');
    const [aula, setAula] = useState(initialSlot?.aula || '');
    const [nota, setNota] = useState(initialSlot?.nota || '');

    useEffect(() => {
        if (isOpen) {
            setClassId(initialSlot?.classId || '');
            setAula(initialSlot?.aula || '');
            setNota(initialSlot?.nota || '');
        }
    }, [isOpen, initialSlot]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(classId, aula, nota);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`${dayLabel} · ${periodLabel}`} size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="text-xs font-medium text-slate-600">Clase</label>
                    <Select value={classId} onChange={e => setClassId(e.target.value)} className="w-full mt-1">
                        <option value="">-- Ninguna --</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{formatClassLabel(c, courses)}</option>)}
                    </Select>
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-600">Aula</label>
                    <Input type="text" value={aula} onChange={e => setAula(e.target.value)} placeholder="Ej: AB17" className="w-full mt-1" />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-600">Nota (opcional)</label>
                    <Input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: Laboratorio" className="w-full mt-1" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" variant="primary">Guardar</Button>
                </div>
            </form>
        </Modal>
    );
};

const ScheduleManager: React.FC<{
    courses: Course[];
    academicConfiguration: AcademicConfiguration;
    setAcademicConfiguration: (updater: React.SetStateAction<AcademicConfiguration>) => void;
}> = ({ courses, academicConfiguration, setAcademicConfiguration }) => {
    const daysOfWeek = [{label: 'Lunes', value: 1}, {label: 'Martes', value: 2}, {label: 'Miércoles', value: 3}, {label: 'Jueves', value: 4}, {label: 'Viernes', value: 5}];
    const periods = academicConfiguration.periods || [];
    const breakPeriodIndexes = academicConfiguration.breakPeriodIndexes || [];
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [editingSlot, setEditingSlot] = useState<{ day: number; periodIndex: number } | null>(null);
    const [editingPeriodIndex, setEditingPeriodIndex] = useState<number | null>(null);
    const [isAddingPeriod, setIsAddingPeriod] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ index: number; x: number; y: number } | null>(null);

    useEffect(() => {
        if (!contextMenu) return;
        const dismiss = () => setContextMenu(null);
        window.addEventListener('click', dismiss);
        window.addEventListener('scroll', dismiss, true);
        return () => {
            window.removeEventListener('click', dismiss);
            window.removeEventListener('scroll', dismiss, true);
        };
    }, [contextMenu]);

    const currentYear = useCurrentAcademicYear();
    const yearId = currentYear.data?.id ?? '';
    const remoteClasses = useApiClasses(yearId, { enabled: !!yearId });
    const updateClassMutation = useUpdateClass();

    const effectiveClasses: ClassData[] = useMemo(() => (
        (remoteClasses.data ?? []).map(apiClassToLocal)
    ), [remoteClasses.data]);

    const handleSaveSlot = async (day: number, periodIndex: number, newClassId: string, aula: string, nota: string) => {
        const oldHolder = effectiveClasses.find(c => (c.schedule || []).some(slot => slot.day === day && slot.periodIndex === periodIndex));
        if (oldHolder && oldHolder.id !== newClassId) {
            const newSchedule = (oldHolder.schedule || []).filter(slot => !(slot.day === day && slot.periodIndex === periodIndex));
            await updateClassMutation.mutateAsync({ id: oldHolder.id, yearId, data: { schedule: newSchedule } });
        }
        if (newClassId) {
            const target = effectiveClasses.find(c => c.id === newClassId);
            if (target) {
                const newSlot: { day: number; periodIndex: number; aula?: string; nota?: string } = { day, periodIndex };
                if (aula.trim()) newSlot.aula = aula.trim();
                if (nota.trim()) newSlot.nota = nota.trim();
                const withoutSlot = (target.schedule || []).filter(slot => !(slot.day === day && slot.periodIndex === periodIndex));
                await updateClassMutation.mutateAsync({ id: newClassId, yearId, data: { schedule: [...withoutSlot, newSlot] } });
            }
        }
    };

    const scheduleGrid = useMemo(() => {
        const grid = new Map<string, ScheduleSlotInfo>(); // key: "day-period"
        effectiveClasses.forEach(c => {
            (c.schedule || []).forEach(slot => {
                grid.set(`${slot.day}-${slot.periodIndex}`, { classId: c.id, aula: slot.aula, nota: slot.nota });
            });
        });
        return grid;
    }, [effectiveClasses]);

    // Gestión de franjas horarias directamente en la tabla (antes vivía en
    // Configuración del Curso Académico, separada de dónde se usa — petición
    // explícita del profesor de tenerlo aquí, "mucho más intuitivo"). Cada
    // clase referencia su franja por ÍNDICE (ClassData.schedule[].periodIndex),
    // así que borrar o mover una franja tiene que recalcular ese índice en
    // TODAS las clases afectadas — sin esto, borrar la franja 3 dejaría
    // cualquier clase de la franja 4 en adelante apuntando a la hora
    // equivocada (mismo tipo de desincronización que el bug real ya
    // encontrado y arreglado en la sincronización desde Excel).
    const handleSavePeriod = (index: number, value: string, isBreak: boolean) => {
        setAcademicConfiguration(prev => {
            const next = [...(prev.periods || [])];
            next[index] = value;
            const marked = new Set(prev.breakPeriodIndexes || []);
            if (isBreak) marked.add(index);
            else marked.delete(index);
            return { ...prev, periods: next, breakPeriodIndexes: [...marked].sort((a, b) => a - b) };
        });
    };

    const handleAddFranja = (value: string, isBreak: boolean) => {
        setAcademicConfiguration(prev => ({
            ...prev,
            periods: [...(prev.periods || []), value],
            breakPeriodIndexes: isBreak
                ? [...(prev.breakPeriodIndexes || []), prev.periods?.length ?? 0]
                : prev.breakPeriodIndexes,
        }));
    };

    const handleDeleteFranja = async (index: number) => {
        const enUso = effectiveClasses.some(c => (c.schedule || []).some(slot => slot.periodIndex === index));
        if (enUso && !window.confirm('Esta franja tiene clases asignadas — se les quitará esa hora del horario. ¿Borrar de todas formas?')) return;
        for (const cls of effectiveClasses) {
            const schedule = cls.schedule || [];
            if (!schedule.some(slot => slot.periodIndex >= index)) continue;
            const newSchedule = schedule
                .filter(slot => slot.periodIndex !== index)
                .map(slot => (slot.periodIndex > index ? { ...slot, periodIndex: slot.periodIndex - 1 } : slot));
            await updateClassMutation.mutateAsync({ id: cls.id, yearId, data: { schedule: newSchedule } });
        }
        setAcademicConfiguration(prev => ({
            ...prev,
            periods: (prev.periods || []).filter((_, i) => i !== index),
            breakPeriodIndexes: (prev.breakPeriodIndexes || [])
                .filter(i => i !== index)
                .map(i => i > index ? i - 1 : i),
        }));
    };

    const handleMoveFranja = async (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= periods.length) return;
        for (const cls of effectiveClasses) {
            const schedule = cls.schedule || [];
            if (!schedule.some(slot => slot.periodIndex === index || slot.periodIndex === target)) continue;
            const newSchedule = schedule.map(slot => {
                if (slot.periodIndex === index) return { ...slot, periodIndex: target };
                if (slot.periodIndex === target) return { ...slot, periodIndex: index };
                return slot;
            });
            await updateClassMutation.mutateAsync({ id: cls.id, yearId, data: { schedule: newSchedule } });
        }
        setAcademicConfiguration(prev => {
            const next = [...(prev.periods || [])];
            [next[index], next[target]] = [next[target], next[index]];
            const marked = new Set(prev.breakPeriodIndexes || []);
            const sourceWasBreak = marked.has(index);
            const targetWasBreak = marked.has(target);
            marked.delete(index);
            marked.delete(target);
            if (sourceWasBreak) marked.add(target);
            if (targetWasBreak) marked.add(index);
            return { ...prev, periods: next, breakPeriodIndexes: [...marked].sort((a, b) => a - b) };
        });
    };

    return (
        <div>
            <div className="flex items-start justify-between gap-4 mb-2">
                <h3 className="text-xl font-bold text-slate-800">Horario Semanal de Clases</h3>
                <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex-shrink-0 bg-white border border-slate-300 text-slate-700 text-sm font-medium py-1.5 px-3 rounded-lg hover:bg-slate-50 shadow-sm"
                >
                    📥 Importar horario
                </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
                Asigna cada clase a su franja horaria correspondiente. Pulsa una celda para elegir clase, aula y una nota libre (p.ej. "Laboratorio").
            </p>
            <ImportScheduleModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                courses={courses}
                classes={effectiveClasses}
                yearId={yearId}
                academicConfiguration={academicConfiguration}
                setAcademicConfiguration={setAcademicConfiguration}
            />
            <div className={tableWrapperClassName}>
                <table className={tableBaseClassName}>
                    <thead>
                        <tr className={tableHeadRowClassName}>
                            <th className={`${tableHeadCellClassName} text-left border-r w-40 min-w-[10rem]`}>Franja Horaria</th>
                            {daysOfWeek.map(day => (
                                <th key={day.value} className={`${tableHeadCellClassName} text-center border-r`}>{day.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {periods.map((periodName, periodIndex) => {
                            const isBreak = breakPeriodIndexes.includes(periodIndex);
                            return (
                            <tr key={periodIndex} className={`${tableRowClassName} ${isBreak ? 'bg-amber-50/70' : ''}`}>
                                <td
                                    className={`relative overflow-visible px-3 py-2 border-r text-sm font-medium ${isBreak ? 'text-amber-800' : 'text-slate-600'}`}
                                    onContextMenu={event => {
                                        event.preventDefault();
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        setContextMenu({
                                            index: periodIndex,
                                            x: Math.min(rect.left, window.innerWidth - 180),
                                            y: Math.min(rect.bottom + 4, window.innerHeight - 96),
                                        });
                                    }}
                                    title="Clic derecho para editar o borrar"
                                >
                                    <div className="flex items-center justify-between gap-1">
                                        <span>{periodName}</span>
                                        <div className="flex flex-col flex-shrink-0">
                                            <button type="button" onClick={() => void handleMoveFranja(periodIndex, -1)} disabled={periodIndex === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:hover:text-slate-400" title="Mover arriba">
                                                <ChevronDownIcon className="w-3 h-3 rotate-180" />
                                            </button>
                                            <button type="button" onClick={() => void handleMoveFranja(periodIndex, 1)} disabled={periodIndex === periods.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:hover:text-slate-400" title="Mover abajo">
                                                <ChevronDownIcon className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </td>
                                {daysOfWeek.map(day => {
                                    const slotInfo = scheduleGrid.get(`${day.value}-${periodIndex}`);
                                    const classInSlot = slotInfo ? effectiveClasses.find(c => c.id === slotInfo.classId) : undefined;
                                    const detalle = [slotInfo?.aula, slotInfo?.nota].filter(Boolean).join(' · ');
                                    return (
                                        <td key={`${day.value}-${periodIndex}`} className="p-1 border-r">
                                            <button
                                                type="button"
                                                onClick={() => setEditingSlot({ day: day.value, periodIndex })}
                                                className="w-full min-h-[2.5rem] p-2 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-left"
                                            >
                                                {classInSlot ? (
                                                    <>
                                                        <ClassLabel classData={classInSlot} courses={courses} className="font-medium text-slate-700 leading-tight truncate block" useSiglas />
                                                        {detalle && <div className="text-xs text-slate-400 leading-tight truncate">{detalle}</div>}
                                                    </>
                                                ) : (
                                                    <span className="text-slate-400">-- Ninguna --</span>
                                                )}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                            );
                        })}
                        <tr>
                            <td colSpan={daysOfWeek.length + 1} className="p-2">
                                <button type="button" onClick={() => setIsAddingPeriod(true)} className={`text-sm ${linkClassName}`}>
                                    + Añadir franja horaria
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">Haz clic derecho sobre una franja para editarla o borrarla. El recreo se marca al crear o editar la franja.</p>
            {contextMenu && createPortal(
                <div className="fixed z-50 min-w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg" style={{ left: contextMenu.x, top: contextMenu.y }}>
                    <button type="button" className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setEditingPeriodIndex(contextMenu.index); setContextMenu(null); }}>Editar franja</button>
                    <button type="button" className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => { void handleDeleteFranja(contextMenu.index); setContextMenu(null); }}>Borrar franja</button>
                </div>,
                document.body,
            )}
            <PeriodModal
                isOpen={isAddingPeriod}
                onClose={() => setIsAddingPeriod(false)}
                onSave={handleAddFranja}
            />
            {editingPeriodIndex !== null && (
                <PeriodModal
                    isOpen={true}
                    onClose={() => setEditingPeriodIndex(null)}
                    initialLabel={periods[editingPeriodIndex] || ''}
                    initialIsBreak={breakPeriodIndexes.includes(editingPeriodIndex)}
                    onSave={(label, isBreak) => handleSavePeriod(editingPeriodIndex, label, isBreak)}
                />
            )}
            {editingSlot && (
                <ScheduleSlotModal
                    isOpen={true}
                    onClose={() => setEditingSlot(null)}
                    dayLabel={daysOfWeek.find(d => d.value === editingSlot.day)?.label || ''}
                    periodLabel={periods[editingSlot.periodIndex] || ''}
                    classes={effectiveClasses}
                    courses={courses}
                    initialSlot={scheduleGrid.get(`${editingSlot.day}-${editingSlot.periodIndex}`)}
                    onSave={(classId, aula, nota) => handleSaveSlot(editingSlot.day, editingSlot.periodIndex, classId, aula, nota)}
                />
            )}
        </div>
    );
};

export default ScheduleManager;
