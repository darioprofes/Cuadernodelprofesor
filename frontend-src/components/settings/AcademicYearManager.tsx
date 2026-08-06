import React, { useState } from 'react';
import { useAcademicYears, useCreateAcademicYear, useActivateAcademicYear, useDeleteAcademicYear } from '../../hooks/useAcademicYears';
import { CheckCircleIcon, TrashIcon, ExclamationTriangleIcon } from '../Icons';
import Input from '../Input';
import Button from '../Button';
import IconButton from '../IconButton';
import StartOfYearWizardModal from '../StartOfYearWizardModal';

// Primera pieza de UI del backend granular nuevo (ver plan, "Fase 5
// fusionada", bloque 2): gestiona academic_years en Postgres, en paralelo
// a "Configuración del Curso" (que sigue gobernando el academicConfiguration
// del blob viejo hasta que classes migre — bloque 4). Listar/crear/activar/
// borrar; sin editar todavía.
const AcademicYearManager: React.FC = () => {
    const { data: years = [], isLoading } = useAcademicYears();
    const createYear = useCreateAcademicYear();
    const activateYear = useActivateAcademicYear();
    const deleteYear = useDeleteAcademicYear();

    const [label, setLabel] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    // Un único curso con confirmación abierta a la vez — pedir "sí, de
    // verdad" con una tarjeta de aviso propia (no el confirm() nativo del
    // navegador, que no se puede destacar visualmente) antes de un borrado
    // en cascada e irreversible (clases, matrículas, notas... de ese curso).
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
                <div className="flex items-start justify-between gap-4 mb-4">
                    <h3 className="text-xl font-bold text-slate-800">Cursos Académicos</h3>
                    <button
                        onClick={() => setIsWizardOpen(true)}
                        className="flex-shrink-0 bg-white border border-slate-300 text-slate-700 text-sm font-medium py-1.5 px-3 rounded-lg hover:bg-slate-50 shadow-sm"
                    >
                        🚀 Iniciar nuevo curso académico (Excel)
                    </button>
                </div>
                <StartOfYearWizardModal isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} />
                <p className="text-sm text-slate-600 mb-4">
                    Cada curso académico archiva sus propias clases, matrículas y notas por separado. Solo uno puede estar activo a la vez.
                </p>

                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto pr-2 border rounded-lg p-2 bg-slate-50/50">
                    {isLoading && <p className="text-slate-500 text-center py-4">Cargando…</p>}
                    {!isLoading && years.length === 0 && (
                        <p className="text-slate-500 text-center py-4">No hay cursos académicos creados todavía.</p>
                    )}
                    {years.map(year => (
                        confirmDeleteId === year.id ? (
                            <div key={year.id} className="bg-red-50 border border-red-300 rounded-md p-3 space-y-2">
                                <div className="flex items-start gap-2">
                                    <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-red-800">
                                        <p className="font-semibold">¿Eliminar «{year.label}»? Esta acción no se puede deshacer.</p>
                                        <p className="mt-1">Se borrarán también sus clases, el alumnado matriculado en ellas, sus calificaciones, y el diario, las tareas, reuniones y agenda de este curso. Las materias y el alumnado (como personas) no se borran.</p>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                    <Button type="button" variant="secondary" onClick={() => setConfirmDeleteId(null)} disabled={deleteYear.isPending}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="danger"
                                        onClick={() => deleteYear.mutate(year.id, { onSuccess: () => setConfirmDeleteId(null) })}
                                        disabled={deleteYear.isPending}
                                    >
                                        {deleteYear.isPending ? 'Eliminando…' : 'Sí, eliminar definitivamente'}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div key={year.id} className="flex items-center justify-between bg-white p-2 rounded-md border">
                                <div>
                                    <p className="font-semibold text-slate-700">{year.label}</p>
                                    <p className="text-xs text-slate-500">{year.startDate} — {year.endDate}</p>
                                </div>
                                <div className="flex items-center gap-2">
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
                                    <IconButton
                                        label={year.isCurrent ? 'Activa otro curso primero para poder eliminar este' : 'Eliminar curso académico'}
                                        tone="danger"
                                        disabled={year.isCurrent}
                                        onClick={() => setConfirmDeleteId(year.id)}
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </IconButton>
                                </div>
                            </div>
                        )
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
        </div>
    );
};

export default AcademicYearManager;
