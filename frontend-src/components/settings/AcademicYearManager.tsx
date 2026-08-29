import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAcademicYears, useCreateAcademicYear, useActivateAcademicYear, useDeleteAcademicYear, useCurrentAcademicYear, useEvaluationPeriods } from '../../hooks/useAcademicYears';
import { useCourses } from '../../hooks/useCourses';
import { useApiClasses } from '../../hooks/useApiClasses';
import { useApiStudents } from '../../hooks/useApiStudents';
import { useEnrollmentsForClasses } from '../../hooks/useEnrollments';
import { apiClassToLocal, joinEnrolledStudents } from '../../services/apiAdapters';
import { CheckCircleIcon, TrashIcon, ExclamationTriangleIcon, CalendarDaysIcon, ChevronDownIcon, MagnifyingGlassIcon, PlusIcon } from '../Icons';
import Input from '../Input';
import Button from '../Button';
import IconButton from '../IconButton';
import StartOfYearWizardModal from '../StartOfYearWizardModal';
import SyncAcademicYearModal from '../SyncAcademicYearModal';
import { SEMANTIC } from '../../theme/palette';

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

    // Datos del curso activo, solo para "Descargar configuración actual" —
    // ver handleDownloadCurrentConfig. Nada de esto se usa para listar/
    // crear/activar/borrar cursos académicos, que sigue funcionando solo
    // con `years` de arriba.
    const currentYear = useCurrentAcademicYear();
    const currentYearId = currentYear.data?.id ?? '';
    const currentEvaluationPeriods = useEvaluationPeriods(currentYearId, { enabled: !!currentYearId });
    const allCourses = useCourses();
    const currentClasses = useApiClasses(currentYearId, { enabled: !!currentYearId });
    const classIds = (currentClasses.data ?? []).map(c => c.id);
    const enrollmentsQueries = useEnrollmentsForClasses(classIds, { enabled: !!currentClasses.data });
    const allStudents = useApiStudents();
    const [isSyncOpen, setIsSyncOpen] = useState(false);

    // Clases reales del curso activo, con alumnado ya hidratado — usado por
    // SyncAcademicYearModal (que necesita comparar contra lo real para
    // decidir qué es nuevo/actualizado/ausente al re-subir un Excel).
    const classesLocal = useMemo(
        () => (currentClasses.data ?? []).map((cls, i) => ({
            ...apiClassToLocal(cls),
            students: joinEnrolledStudents(enrollmentsQueries[i]?.data ?? [], allStudents.data ?? []),
        })),
        [currentClasses.data, enrollmentsQueries, allStudents.data]
    );

    const [label, setLabel] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    // Un único curso con confirmación abierta a la vez — pedir "sí, de
    // verdad" con una tarjeta de aviso propia (no el confirm() nativo del
    // navegador, que no se puede destacar visualmente) antes de un borrado
    // en cascada e irreversible (clases, matrículas, notas... de ese curso).
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Selector compacto: cerrado por defecto (una sola línea con el curso
    // activo) en vez de la lista siempre visible + formulario permanente de
    // antes -- pedido explícito del usuario, que con varios cursos ya
    // archivados ocupaba mucho espacio para poca información útil el día a
    // día. Mismo patrón de "cerrar al pinchar fuera" que ColorSwatchPicker
    // en AcademicConfigManager.tsx (mousedown + ref.contains).
    const [selectorOpen, setSelectorOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [addOpen, setAddOpen] = useState(false);
    const selectorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectorOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
                setSelectorOpen(false);
                setAddOpen(false);
                setConfirmDeleteId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectorOpen]);

    const currentYearData = years.find(y => y.isCurrent);
    const filteredYears = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return years;
        return years.filter(y => y.label.toLowerCase().includes(q));
    }, [years, query]);

    const toggleSelector = () => {
        setSelectorOpen(o => !o);
        setAddOpen(false);
        setConfirmDeleteId(null);
        setQuery('');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!label.trim() || !startDate || !endDate) return;
        createYear.mutate(
            { label: label.trim(), startDate, endDate },
            { onSuccess: () => { setLabel(''); setStartDate(''); setEndDate(''); setAddOpen(false); } }
        );
    };

    return (
        <div className="space-y-8">
            <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                    <h3 className="text-xl font-bold text-slate-800">Cursos Académicos</h3>
                    <div className="flex flex-wrap justify-end gap-2">
                        {currentYear.data && (
                            <button
                                onClick={() => setIsSyncOpen(true)}
                                className="flex-shrink-0 bg-white border border-slate-300 text-slate-700 text-sm font-medium py-1.5 px-3 rounded-lg hover:bg-slate-50 shadow-sm"
                            >
                                🔄 Modificar curso actual con Excel
                            </button>
                        )}
                        <button
                            onClick={() => setIsWizardOpen(true)}
                            className="flex-shrink-0 bg-white border border-slate-300 text-slate-700 text-sm font-medium py-1.5 px-3 rounded-lg hover:bg-slate-50 shadow-sm"
                        >
                            🚀 Crear nuevo curso con Excel
                        </button>
                    </div>
                </div>
                <StartOfYearWizardModal isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} />
                {currentYear.data && (
                    <SyncAcademicYearModal
                        isOpen={isSyncOpen}
                        onClose={() => setIsSyncOpen(false)}
                        yearId={currentYear.data.id}
                        yearLabel={currentYear.data.label}
                        yearStartDate={currentYear.data.startDate}
                        yearEndDate={currentYear.data.endDate}
                        yearHolidays={currentYear.data.holidays}
                        yearPeriods={currentYear.data.periods}
                        evaluationPeriods={currentEvaluationPeriods.data ?? []}
                        courses={allCourses.data ?? []}
                        classes={classesLocal}
                        allStudents={allStudents.data ?? []}
                    />
                )}
                <p className="text-sm text-slate-600 mb-3">
                    Cada curso académico archiva sus propias clases, matrículas y notas por separado. Solo uno puede estar activo a la vez.
                </p>

                <div className="relative" ref={selectorRef}>
                    <button
                        type="button"
                        onClick={toggleSelector}
                        className="w-full flex items-center gap-2.5 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-slate-300 hover:bg-slate-50 text-left"
                    >
                        <span
                            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: SEMANTIC.primary.soft, color: SEMANTIC.primary.base }}
                        >
                            <CalendarDaysIcon className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-slate-800 truncate">
                                {isLoading ? 'Cargando…' : currentYearData ? currentYearData.label : 'Sin curso académico activo'}
                            </span>
                            {currentYearData && (
                                <span className="block text-xs text-slate-500">{currentYearData.startDate} — {currentYearData.endDate}</span>
                            )}
                        </span>
                        {currentYearData && (
                            <span className="flex-shrink-0 inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                                <CheckCircleIcon className="w-3.5 h-3.5" /> Actual
                            </span>
                        )}
                        <ChevronDownIcon className={`w-4 h-4 flex-shrink-0 text-slate-400 transition-transform ${selectorOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {selectorOpen && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 space-y-2">
                            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                                <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Buscar curso académico…"
                                    className="flex-1 min-w-0 bg-transparent border-none text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
                                />
                            </div>
                            <p className="text-xs text-slate-400 px-1">
                                {years.length} {years.length === 1 ? 'curso académico' : 'cursos académicos'}
                            </p>

                            <div className="space-y-0.5 max-h-60 overflow-y-auto">
                                {isLoading && <p className="text-slate-500 text-center py-4 text-sm">Cargando…</p>}
                                {!isLoading && filteredYears.length === 0 && (
                                    <p className="text-slate-400 text-center py-3 text-xs">
                                        {years.length === 0 ? 'No hay cursos académicos creados todavía.' : 'Sin coincidencias.'}
                                    </p>
                                )}
                                {filteredYears.map(year => (
                                    confirmDeleteId === year.id ? (
                                        <div key={year.id} className="bg-red-50 border border-red-300 rounded-lg p-2.5 space-y-2">
                                            <div className="flex items-start gap-2">
                                                <ExclamationTriangleIcon className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                                <div className="text-xs text-red-800">
                                                    <p className="font-semibold">¿Eliminar «{year.label}»? Esta acción no se puede deshacer.</p>
                                                    <p className="mt-1">Se borrarán también sus clases, el alumnado matriculado en ellas, sus calificaciones, y el diario, las tareas, reuniones y agenda de este curso. Las materias y el alumnado (como personas) no se borran.</p>
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-1.5 pt-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmDeleteId(null)}
                                                    disabled={deleteYear.isPending}
                                                    className="text-xs font-medium px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteYear.mutate(year.id, { onSuccess: () => setConfirmDeleteId(null) })}
                                                    disabled={deleteYear.isPending}
                                                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                                                >
                                                    {deleteYear.isPending ? 'Eliminando…' : 'Sí, eliminar'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div key={year.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50">
                                            <div className="flex items-baseline gap-2 min-w-0 flex-1">
                                                <span className="text-sm font-semibold text-slate-700 truncate">{year.label}</span>
                                                <span className="text-xs text-slate-400 flex-shrink-0">{year.startDate} — {year.endDate}</span>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {year.isCurrent ? (
                                                    <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold px-2 py-1">
                                                        <CheckCircleIcon className="w-3.5 h-3.5" /> Actual
                                                    </span>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => activateYear.mutate(year.id, { onSuccess: () => setSelectorOpen(false) })}
                                                            disabled={activateYear.isPending}
                                                            className="text-xs font-semibold px-2 py-1 rounded-md hover:bg-slate-100 disabled:opacity-50"
                                                            style={{ color: SEMANTIC.primary.base }}
                                                        >
                                                            Activar
                                                        </button>
                                                        <IconButton
                                                            label="Eliminar curso académico"
                                                            tone="danger"
                                                            size="sm"
                                                            onClick={() => setConfirmDeleteId(year.id)}
                                                        >
                                                            <TrashIcon className="w-3.5 h-3.5" />
                                                        </IconButton>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )
                                ))}
                            </div>

                            <div className="border-t border-slate-100 pt-2">
                                {!addOpen ? (
                                    <button
                                        type="button"
                                        onClick={() => setAddOpen(true)}
                                        className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-50 hover:border-slate-400"
                                        style={{ color: SEMANTIC.primary.base }}
                                    >
                                        <PlusIcon className="w-3.5 h-3.5" /> Añadir curso académico
                                    </button>
                                ) : (
                                    <form onSubmit={handleSubmit} className="space-y-2 px-0.5">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 mb-0.5">Nombre</label>
                                            <Input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="Ej: 2028-2029" className="w-full text-sm" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 mb-0.5">Inicio</label>
                                                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 mb-0.5">Fin</label>
                                                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full text-sm" />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-1.5 pt-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setAddOpen(false)}
                                                className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                            >
                                                Cancelar
                                            </button>
                                            <Button type="submit" disabled={createYear.isPending}>
                                                {createYear.isPending ? 'Añadiendo…' : 'Añadir'}
                                            </Button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AcademicYearManager;
