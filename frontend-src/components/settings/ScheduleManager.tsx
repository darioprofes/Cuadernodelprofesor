import React, { useState, useEffect, useMemo } from 'react';
import type { ClassData, Course, AcademicConfiguration } from '../../types';
import { formatClassLabel } from '../../utils';
import Modal from '../Modal';
import Button from '../Button';
import Input from '../Input';
import Select from '../Select';
import ClassLabel from '../ClassLabel';
import ImportScheduleModal from '../ImportScheduleModal';
import { tableBaseClassName, tableHeadCellClassName, tableHeadRowClassName, tableRowClassName, tableWrapperClassName } from '../../theme/components/Table';
import { isTauri } from '@tauri-apps/api/core';
import { useCurrentAcademicYear } from '../../hooks/useAcademicYears';
import { useApiClasses, useUpdateClass } from '../../hooks/useApiClasses';

// La importación de horario en PDF depende del backend Python (pdfplumber,
// ver api/app/services/horario_pdf.py) — no existe en la versión de
// escritorio, que no tiene servidor. El horario se sigue pudiendo editar a
// mano en la rejilla de abajo.
const IS_DESKTOP = isTauri();

// classes (Postgres) todavía no tiene alumnado/categorías/tareas/notas
// embebidos (bloques 5/6) — se rellenan vacíos aquí porque nada de este
// fichero los lee ni los escribe, solo hace que el objeto cumpla el tipo
// ClassData completo que ya usan ClassLabel/formatClassLabel.
const apiClassToLocal = (cls: { id: string; courseId: string; grupo?: string; schedule?: unknown[]; skippedDays?: unknown[]; icono?: string; colorAcento?: number; mesaProfesorX?: number; mesaProfesorY?: number }): ClassData => ({
    id: cls.id,
    grupo: cls.grupo,
    courseId: cls.courseId,
    students: [],
    categories: [],
    assignments: [],
    grades: [],
    schedule: (cls.schedule ?? []) as ClassData['schedule'],
    skippedDays: (cls.skippedDays ?? []) as ClassData['skippedDays'],
    icono: cls.icono,
    colorAcento: cls.colorAcento,
    mesaProfesorX: cls.mesaProfesorX,
    mesaProfesorY: cls.mesaProfesorY,
});

interface ScheduleSlotInfo {
    classId: string;
    aula?: string;
    nota?: string;
}

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
    classes: ClassData[];
    setClasses: (updater: React.SetStateAction<ClassData[]>) => void;
    courses: Course[];
    academicConfiguration: AcademicConfiguration;
    setAcademicConfiguration: (updater: React.SetStateAction<AcademicConfiguration>) => void;
}> = ({ classes, setClasses, courses, academicConfiguration, setAcademicConfiguration }) => {
    const daysOfWeek = [{label: 'Lunes', value: 1}, {label: 'Martes', value: 2}, {label: 'Miércoles', value: 3}, {label: 'Jueves', value: 4}, {label: 'Viernes', value: 5}];
    const periods = academicConfiguration.periods || [];
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [editingSlot, setEditingSlot] = useState<{ day: number; periodIndex: number } | null>(null);

    const currentYear = useCurrentAcademicYear({ enabled: !IS_DESKTOP });
    const yearId = currentYear.data?.id ?? '';
    const remoteClasses = useApiClasses(yearId, { enabled: !IS_DESKTOP && !!yearId });
    const updateClassMutation = useUpdateClass();

    const effectiveClasses: ClassData[] = useMemo(() => {
        if (IS_DESKTOP) return classes;
        return (remoteClasses.data ?? []).map(apiClassToLocal);
    }, [classes, remoteClasses.data]);

    const handleSaveSlot = async (day: number, periodIndex: number, newClassId: string, aula: string, nota: string) => {
        if (IS_DESKTOP) {
            setClasses(prevClasses => {
                return prevClasses.map(c => {
                    const oldSchedule = c.schedule || [];
                    const hasSlot = oldSchedule.some(slot => slot.day === day && slot.periodIndex === periodIndex);

                    if (c.id === newClassId) {
                        const newSlot: { day: number; periodIndex: number; aula?: string; nota?: string } = { day, periodIndex };
                        if (aula.trim()) newSlot.aula = aula.trim();
                        if (nota.trim()) newSlot.nota = nota.trim();
                        const withoutSlot = oldSchedule.filter(slot => !(slot.day === day && slot.periodIndex === periodIndex));
                        return { ...c, schedule: [...withoutSlot, newSlot] };
                    }

                    if (hasSlot) {
                        return { ...c, schedule: oldSchedule.filter(slot => !(slot.day === day && slot.periodIndex === periodIndex)) };
                    }

                    return c;
                });
            });
            return;
        }

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

    return (
        <div>
            <div className="flex items-start justify-between gap-4 mb-2">
                <h3 className="text-xl font-bold text-slate-800">Horario Semanal de Clases</h3>
                {!IS_DESKTOP && (
                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="flex-shrink-0 bg-white border border-slate-300 text-slate-700 text-sm font-medium py-1.5 px-3 rounded-lg hover:bg-slate-50 shadow-sm"
                    >
                        📥 Importar horario (PDF oficial)
                    </button>
                )}
            </div>
            <p className="text-sm text-slate-600 mb-4">
                Asigna cada clase a su franja horaria correspondiente. Pulsa una celda para elegir clase, aula y una nota libre (p.ej. "Laboratorio").
                {IS_DESKTOP && ' La importación desde PDF oficial no está disponible en la versión de escritorio.'}
            </p>
            {!IS_DESKTOP && (
                <ImportScheduleModal
                    isOpen={isImportModalOpen}
                    onClose={() => setIsImportModalOpen(false)}
                    courses={courses}
                    classes={effectiveClasses}
                    yearId={yearId}
                    academicConfiguration={academicConfiguration}
                    setAcademicConfiguration={setAcademicConfiguration}
                />
            )}
            <div className={tableWrapperClassName}>
                <table className={tableBaseClassName}>
                    <thead>
                        <tr className={tableHeadRowClassName}>
                            <th className={`${tableHeadCellClassName} text-left border-r`}>Franja Horaria</th>
                            {daysOfWeek.map(day => (
                                <th key={day.value} className={`${tableHeadCellClassName} text-center border-r`}>{day.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {periods.map((periodName, periodIndex) => (
                            <tr key={periodIndex} className={tableRowClassName}>
                                <td className="p-2 font-medium text-slate-600 border-r">{periodName}</td>
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
                        ))}
                    </tbody>
                </table>
            </div>
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
