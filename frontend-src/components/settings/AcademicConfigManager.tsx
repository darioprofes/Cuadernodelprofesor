import React, { useEffect, useRef, useState } from 'react';
import type { AcademicConfiguration, Holiday, EvaluationPeriod, GradeScaleRule } from '../../types';
import { TrashIcon, ChevronDownIcon, CalendarDaysIcon, ChartBarIcon, ArrowUpTrayIcon } from '../Icons';
import Input from '../Input';
import Select from '../Select';
import BufferedInput from '../BufferedInput';
import { linkClassName } from '../../theme/components/Link';
import { useCurrentAcademicYear, useUpdateAcademicYear, useEvaluationPeriods, useCreateEvaluationPeriod, useUpdateEvaluationPeriod, useDeleteEvaluationPeriod } from '../../hooks/useAcademicYears';

// Swatch sólido para cada color del semáforo -- mismo listado de colores que
// ya usa getGradeColorClass (services/gradeCalculations/shared.ts) para
// pintar las notas, pero en su tono -500 (más saturado que el bg-*-100 de
// las celdas del cuaderno) para que se distinga bien como círculo pequeño.
// Clases literales a propósito (nada de `bg-${color}-500`): Tailwind solo
// incluye en el build las clases que puede ver escritas tal cual.
const SEMAFORO_SWATCH_CLASS: Record<GradeScaleRule['color'], string> = {
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    yellow: 'bg-yellow-500',
    lime: 'bg-lime-500',
    green: 'bg-green-500',
    emerald: 'bg-emerald-500',
    teal: 'bg-teal-500',
    blue: 'bg-blue-500',
    indigo: 'bg-indigo-500',
    violet: 'bg-violet-500',
    gray: 'bg-gray-400',
};

const SEMAFORO_COLOR_LABEL: Record<GradeScaleRule['color'], string> = {
    emerald: 'Esmeralda (Verde oscuro)',
    green: 'Verde',
    lime: 'Lima',
    yellow: 'Amarillo',
    orange: 'Naranja',
    red: 'Rojo',
    teal: 'Turquesa',
    blue: 'Azul',
    indigo: 'Índigo',
    violet: 'Violeta',
    gray: 'Gris',
};

const SEMAFORO_COLOR_OPTIONS = Object.keys(SEMAFORO_SWATCH_CLASS) as GradeScaleRule['color'][];

// Solo 3 categorías con nombre -- un <select> nativo encaja mejor aquí que
// el popover de ColorSwatchPicker (pensado para elegir COLOR libre entre 11
// opciones, no para clasificar por tipo). "no_lectivo"/"vacaciones" se
// pueden importar del PDF oficial del calendario escolar (ver
// StartOfYearWizardModal/SyncAcademicYearModal); "festivo" (nacional,
// autonómico o LOCAL -- cada municipio el suyo, esos no vienen en ningún
// PDF) siempre se añade a mano, por eso es el valor por defecto.
const TIPO_FESTIVO_LABEL: Record<NonNullable<Holiday['type']>, string> = {
    festivo: 'Festivo',
    no_lectivo: 'No lectivo',
    vacaciones: 'Vacaciones',
};

// Círculo de color + flecha que abre una paleta de swatches clicables --
// pedido explícito del usuario en vez del <select> de texto anterior (los
// nombres largos como "Esmeralda (Verde oscuro)" se cortaban en columnas
// estrechas). Popover en vez de grid siempre visible para no deshacer lo
// compacto de la rejilla de 3 columnas de la Escala de Calificaciones.
const ColorSwatchPicker: React.FC<{ value: GradeScaleRule['color']; onChange: (color: GradeScaleRule['color']) => void }> = ({ value, onChange }) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    return (
        <div className="relative flex-shrink-0" ref={containerRef}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                title={SEMAFORO_COLOR_LABEL[value]}
                className="flex items-center gap-1 px-1.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
            >
                <span className={`w-4 h-4 rounded-full border border-black/10 flex-shrink-0 ${SEMAFORO_SWATCH_CLASS[value]}`} />
                <ChevronDownIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />
            </button>
            {open && (
                <div className="absolute z-10 top-full left-0 mt-1 p-2 bg-white border border-slate-200 rounded-lg shadow-lg grid grid-cols-4 gap-1.5 w-max">
                    {SEMAFORO_COLOR_OPTIONS.map(color => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => { onChange(color); setOpen(false); }}
                            title={SEMAFORO_COLOR_LABEL[color]}
                            className={`w-6 h-6 rounded-full flex-shrink-0 ${SEMAFORO_SWATCH_CLASS[color]} ${value === color ? 'ring-2 ring-offset-1 ring-slate-500' : 'border border-black/10'}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const AcademicConfigManager: React.FC<{
    academicConfiguration: AcademicConfiguration;
    setAcademicConfiguration: (updater: React.SetStateAction<AcademicConfiguration>) => void;
}> = ({ academicConfiguration, setAcademicConfiguration }) => {
    const currentYear = useCurrentAcademicYear();
    const yearId = currentYear.data?.id ?? '';
    const updateYearMutation = useUpdateAcademicYear();
    const remotePeriods = useEvaluationPeriods(yearId, { enabled: !!yearId });
    const createPeriodMutation = useCreateEvaluationPeriod();
    const updatePeriodMutation = useUpdateEvaluationPeriod();
    const deletePeriodMutation = useDeleteEvaluationPeriod();

    // Importar no lectivo/vacaciones del PDF oficial directamente aquí,
    // además de en los dos asistentes de Excel (StartOfYearWizardModal/
    // SyncAcademicYearModal) -- mismo endpoint, pero sin pasar por ningún
    // Excel intermedio: se añaden directo a la lista de festivos de este
    // curso. Festivos (nacional/autonómico/local) no vienen en el PDF, se
    // siguen añadiendo con "+ Añadir Festivo".
    const calendarioFileInputRef = useRef<HTMLInputElement>(null);
    const [importandoCalendario, setImportandoCalendario] = useState(false);
    const [avisoImportacion, setAvisoImportacion] = useState<string | null>(null);

    // Fechas del curso (Fase 8 en web, Fase 7 bloque 4 en escritorio): antes
    // escribían solo en el blob (academicConfiguration.academicYearStart/
    // End), un campo huérfano y desincronizado de academic_years.startDate/
    // endDate (lo real, fijado al crear el año en la píldora de la
    // cabecera). Ahora ambas plataformas leen/escriben directamente sobre
    // el año activo.
    const effectiveYearStart = currentYear.data?.startDate ?? '';
    const effectiveYearEnd = currentYear.data?.endDate ?? '';
    const handleYearDateChange = async (field: 'startDate' | 'endDate', value: string) => {
        if (!yearId) return;
        await updateYearMutation.mutateAsync({ id: yearId, data: { [field]: value } });
    };

    // Periodos de evaluación reales (Postgres/SQLite): categories/
    // assignments los referencian con una FK (evaluation_period_id).
    // `weight` vive en la propia fila del período en el backend nuevo, no
    // en un mapa aparte como en el blob viejo (evaluationPeriodWeights) —
    // se reconstruye ese mapa aquí solo para que el resto de la app
    // (gradeCalculations, sin tocar) siga encontrándolo donde ya lo espera.
    const effectivePeriods: EvaluationPeriod[] = (remotePeriods.data ?? []).map(p => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate }));
    const effectiveWeights: Record<string, number> = Object.fromEntries((remotePeriods.data ?? []).map(p => [p.id, p.weight]));

    const handlePeriodFieldChange = async (index: number, field: 'name' | 'startDate' | 'endDate', value: string) => {
        const period = effectivePeriods[index];
        if (!period) return;
        const apiField = field === 'startDate' ? 'startDate' : field === 'endDate' ? 'endDate' : 'name';
        await updatePeriodMutation.mutateAsync({ id: period.id, yearId, data: { [apiField]: value } });
    };

    const handleAddPeriod = async () => {
        await createPeriodMutation.mutateAsync({ yearId, data: { name: `Nueva Evaluación ${effectivePeriods.length + 1}`, startDate: effectiveYearStart || '', endDate: effectiveYearEnd || '', weight: 1 } });
    };

    const handleRemovePeriod = async (periodId: string) => {
        await deletePeriodMutation.mutateAsync({ id: periodId, yearId });
    };

    const handlePeriodWeightChange = async (periodId: string, weight: string) => {
        const numWeight = parseFloat(weight);
        await updatePeriodMutation.mutateAsync({ id: periodId, yearId, data: { weight: isNaN(numWeight) ? 0 : numWeight } });
    };

    useEffect(() => {
        // Self-healing for corrupted data.
        const needsUpdate = !academicConfiguration ||
                            !Array.isArray(academicConfiguration.holidays) ||
                            !Array.isArray(academicConfiguration.evaluationPeriods) ||
                            typeof academicConfiguration.evaluationPeriodWeights !== 'object' ||
                            academicConfiguration.evaluationPeriodWeights === null ||
                            !Array.isArray(academicConfiguration.gradeScale) ||
                            !Array.isArray(academicConfiguration.teacherProfile);

        if (needsUpdate) {
            setAcademicConfiguration(prev => ({
                ...prev,
                holidays: Array.isArray(prev?.holidays) ? prev.holidays : [],
                evaluationPeriods: Array.isArray(prev?.evaluationPeriods) ? prev.evaluationPeriods : [],
                evaluationPeriodWeights: (typeof prev?.evaluationPeriodWeights === 'object' && prev.evaluationPeriodWeights !== null) ? prev.evaluationPeriodWeights : {},
                periods: Array.isArray(prev?.periods) ? prev.periods : [],
                defaultStartView: prev?.defaultStartView || 'calendar',
                defaultCalendarView: prev?.defaultCalendarView || 'month',
                teacherProfile: Array.isArray(prev?.teacherProfile) ? prev.teacherProfile : [],
                // Initialize defaults if missing
                gradeScale: Array.isArray(prev?.gradeScale) && prev.gradeScale.length > 0 ? prev.gradeScale : [
                    { min: 8.5, color: 'blue', label: 'Sobresaliente' },
                    { min: 7, color: 'teal', label: 'Notable' },
                    { min: 6, color: 'lime', label: 'Bien' },
                    { min: 5, color: 'yellow', label: 'Suficiente' },
                    { min: 0, color: 'red', label: 'Insuficiente' },
                ]
            }));
        }
    }, [academicConfiguration, setAcademicConfiguration]);

    if (!academicConfiguration || !Array.isArray(academicConfiguration.holidays) || !Array.isArray(academicConfiguration.evaluationPeriods) || typeof academicConfiguration.evaluationPeriodWeights !== 'object' || academicConfiguration.evaluationPeriodWeights === null) {
        return <div className="text-center p-4">Cargando configuración...</div>;
    }

    const { gradeScale = [] } = academicConfiguration;

    // Calculate total weight for display
    let totalWeight = 0;
    for (const w of Object.values(effectiveWeights)) {
        if (typeof w === 'number') totalWeight += w;
    }

    // Solo 'holidays' — 'periods' (franjas horarias) se gestiona ahora en
    // Horario Semanal (ScheduleManager.tsx), 'evaluationPeriods' ya se
    // gestionaba aparte (handlePeriodFieldChange/handleAddPeriod/
    // handleRemovePeriod, contra el backend real).
    const handleListItemChange = (type: 'holidays', index: number, field: string, value: string) => {
        setAcademicConfiguration(prev => {
            const newList = [...(prev[type] || [])] as Holiday[];
            newList[index] = { ...newList[index], [field]: value };
            return { ...prev, [type]: newList };
        });
    };

    const handleAddListItem = (type: 'holidays') => {
        setAcademicConfiguration(prev => {
            const currentList = prev[type] || [];
            const newItem = { id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, name: 'Nuevo', startDate: '', endDate: '', type: 'festivo' as const };
            return { ...prev, [type]: [...currentList, newItem] };
        });
    };

    const handleImportarFestivosPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Sin esto, importar antes de que el curso activo haya cargado del
        // servidor fusiona los festivos nuevos con un `prev.holidays`
        // todavía vacío (el valor por defecto antes de que llegue la
        // respuesta real) -- lo que en la práctica BORRA los festivos ya
        // guardados en cuanto se envía el PATCH. Bug real, encontrado
        // 2026-08-29 al probar este mismo botón: se perdieron 9 festivos
        // reales de producción hasta restaurarlos a mano.
        if (!currentYear.data) {
            setAvisoImportacion('Espera a que termine de cargar la configuración del curso antes de importar.');
            return;
        }

        setImportandoCalendario(true);
        setAvisoImportacion(null);

        try {
            const formData = new FormData();
            formData.append('archivo', file);
            const response = await fetch('/api/calendario/importar-pdf', { method: 'POST', body: formData });

            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.detail || `El servidor respondió con un error (HTTP ${response.status}).`);
            }

            const data: {
                noLectivo: { nombre: string; fechaInicio: string; fechaFin: string }[];
                vacaciones: { nombre: string; fechaInicio: string; fechaFin: string | null }[];
                festivos: { nombre: string; fechaInicio: string; fechaFin: string }[];
                errores: string[];
            } = await response.json();

            const noLectivo: Holiday[] = data.noLectivo.map(h => ({ id: crypto.randomUUID(), name: h.nombre, startDate: h.fechaInicio, endDate: h.fechaFin, type: 'no_lectivo' }));
            // Excluye entradas sin fecha de fin exacta (p.ej. vacaciones de
            // verano hasta el inicio del curso siguiente, ver
            // calendario_pdf.py) -- el aviso ya viene en `data.errores`.
            const vacaciones: Holiday[] = data.vacaciones
                .filter((h): h is { nombre: string; fechaInicio: string; fechaFin: string } => !!h.fechaFin)
                .map(h => ({ id: crypto.randomUUID(), name: h.nombre, startDate: h.fechaInicio, endDate: h.fechaFin, type: 'vacaciones' }));
            // Festivo nacional/autonómico: leído del color de cada día en el
            // dibujo del calendario (ver calendario_pdf.py), no de texto --
            // festivos locales (cada municipio el suyo) siguen sin venir del
            // PDF, se añaden a mano.
            const festivos: Holiday[] = data.festivos.map(h => ({ id: crypto.randomUUID(), name: h.nombre, startDate: h.fechaInicio, endDate: h.fechaFin, type: 'festivo' }));
            const nuevos = [...festivos, ...noLectivo, ...vacaciones];

            setAcademicConfiguration(prev => ({ ...prev, holidays: [...(prev.holidays ?? []), ...nuevos] }));
            setAvisoImportacion([
                `${nuevos.length} festivo(s) importado(s) del PDF.`,
                ...data.errores,
            ].join(' '));
        } catch (err) {
            setAvisoImportacion(`Error al importar el PDF: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setImportandoCalendario(false);
            if (calendarioFileInputRef.current) calendarioFileInputRef.current.value = '';
        }
    };

    const handleRemoveListItem = (type: 'holidays', idOrIndex: string) => {
        setAcademicConfiguration(prev => {
            const currentList = prev[type] || [];
            const newList = (currentList as Holiday[]).filter(item => item.id !== idOrIndex);
            return { ...prev, [type]: newList };
        });
    };

    const handleGradeScaleChange = <K extends keyof GradeScaleRule>(index: number, field: K, value: GradeScaleRule[K]) => {
        setAcademicConfiguration(prev => {
            const newScale = [...(prev.gradeScale || [])];
            newScale[index] = { ...newScale[index], [field]: value };
            return { ...prev, gradeScale: newScale };
        });
    };

    const handleAddGradeRule = () => {
        setAcademicConfiguration(prev => ({
            ...prev,
            gradeScale: [...(prev.gradeScale || []), { min: 0, color: 'gray', label: 'Nueva Regla' }]
        }));
    };

    const handleRemoveGradeRule = (index: number) => {
        setAcademicConfiguration(prev => ({
            ...prev,
            gradeScale: (prev.gradeScale || []).filter((_, i) => i !== index)
        }));
    };

    return (
        <div className="space-y-4 pb-8">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Configuración del Curso Académico</h3>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 items-start">
                <div className="min-w-0 p-3 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                        <CalendarDaysIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                        <h4 className="font-semibold text-slate-700">🎉 Vacaciones y Festivos</h4>
                    </div>

                    <div className="space-y-2">
                        {/* Agrupado por tipo (festivo/no_lectivo/vacaciones), no en
                            una única lista larga -- pedido explícito, sobre todo
                            porque "Importar del PDF" puede meter de golpe una
                            docena de festivos. Cada grupo se abre solo si tiene
                            pocas entradas (<=4); con muchas arranca plegado. El
                            índice que necesitan handleListItemChange/
                            handleRemoveListItem es el de `holidays` completo, no
                            el de dentro del grupo -- se guarda junto al festivo
                            al agrupar. */}
                        {(Object.keys(TIPO_FESTIVO_LABEL) as (keyof typeof TIPO_FESTIVO_LABEL)[]).map(tipo => {
                            const items = academicConfiguration.holidays
                                .map((holiday, index) => ({ holiday, index }))
                                .filter(({ holiday }) => (holiday.type ?? 'festivo') === tipo);

                            if (items.length === 0) return null;

                            return (
                                <details key={tipo} open={items.length <= 4} className="group">
                                    <summary className="text-xs font-semibold text-slate-600 cursor-pointer select-none list-none flex items-center gap-1 py-0.5">
                                        <ChevronDownIcon className="w-3 h-3 flex-shrink-0 transition-transform group-open:rotate-0 -rotate-90" />
                                        {TIPO_FESTIVO_LABEL[tipo]} ({items.length})
                                    </summary>
                                    <div className="space-y-1.5 mt-1">
                                        {items.map(({ holiday, index }) => (
                                            <div key={holiday.id} className="px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                                                <div className="flex gap-2 items-center">
                                                    <Input type="text" value={holiday.name} onChange={e => handleListItemChange('holidays', index, 'name', e.target.value)} className="!py-1 flex-1 min-w-0 text-xs !text-amber-700 font-semibold" placeholder="Nombre festivo" title={holiday.name}/>
                                                    <button onClick={() => handleRemoveListItem('holidays', holiday.id)} className="p-1 text-red-500 hover:bg-red-50 rounded flex-shrink-0"><TrashIcon className="w-3 h-3"/></button>
                                                </div>
                                                <div className="flex gap-2 items-center">
                                                    <Input type="date" value={holiday.startDate} onChange={e => handleListItemChange('holidays', index, 'startDate', e.target.value)} className="!py-1 flex-1 min-w-0 text-xs"/>
                                                    <Input type="date" value={holiday.endDate} onChange={e => handleListItemChange('holidays', index, 'endDate', e.target.value)} className="!py-1 flex-1 min-w-0 text-xs"/>
                                                </div>
                                                <Select value={holiday.type ?? 'festivo'} onChange={e => handleListItemChange('holidays', index, 'type', e.target.value)} className="!w-auto !py-1 text-xs">
                                                    {(Object.keys(TIPO_FESTIVO_LABEL) as (keyof typeof TIPO_FESTIVO_LABEL)[]).map(t => (
                                                        <option key={t} value={t}>{TIPO_FESTIVO_LABEL[t]}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            );
                        })}
                        <div className="flex items-center gap-3 flex-wrap">
                            <button onClick={() => handleAddListItem('holidays')} className={`text-xs ${linkClassName}`}>+ Añadir Festivo</button>
                            <input type="file" ref={calendarioFileInputRef} onChange={handleImportarFestivosPdf} accept=".pdf" className="hidden" />
                            <button
                                onClick={() => calendarioFileInputRef.current?.click()}
                                disabled={importandoCalendario}
                                title="Usa la versión APAISADA (horizontal) del calendario oficial de Educastur -- la vertical no se reconoce bien"
                                className={`text-xs ${linkClassName} inline-flex items-center gap-1 disabled:opacity-50`}
                            >
                                <ArrowUpTrayIcon className="w-3 h-3" />
                                {importandoCalendario ? 'Leyendo el PDF…' : 'Importar del PDF'}
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">Usa la versión apaisada (horizontal) del calendario oficial, no la vertical.</p>
                        {avisoImportacion && (
                            <p className="text-xs text-slate-500 mt-1">{avisoImportacion}</p>
                        )}
                    </div>
                </div>

                <div className="min-w-0 space-y-4">
                    <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-1.5">
                            <CalendarDaysIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                            <h4 className="font-semibold text-slate-700">🎓 Fechas del curso</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-slate-500">Inicio</label>
                                <BufferedInput type="date" value={effectiveYearStart} onCommit={v => handleYearDateChange('startDate', v)} className="!py-1 w-full text-xs"/>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500">Fin</label>
                                <BufferedInput type="date" value={effectiveYearEnd} onCommit={v => handleYearDateChange('endDate', v)} className="!py-1 w-full text-xs"/>
                            </div>
                        </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                        <ChartBarIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                        <h4 className="font-semibold text-slate-700">Evaluación y Calificaciones</h4>
                    </div>

                    <div>
                        <h5 className="text-sm font-medium text-slate-600">📊 Periodos de evaluación</h5>
                        <p className="text-xs text-slate-500 mb-1.5">El peso determina cuánto cuenta cada periodo en la nota final (pasa el ratón por encima para ver el %).</p>
                        <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                                        <th className="py-1.5 pl-1.5 pr-0.5 font-medium">Periodo</th>
                                        <th className="py-1.5 px-0.5 font-medium">Inicio</th>
                                        <th className="py-1.5 px-0.5 font-medium">Fin</th>
                                        <th className="py-1.5 px-0.5 font-medium text-right">Peso</th>
                                        <th className="py-1.5 pr-1.5"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {effectivePeriods.map((period, index) => {
                                        const weight = effectiveWeights[period.id] ?? 1;
                                        const percentage = totalWeight > 0 ? ((weight / totalWeight) * 100).toFixed(1) : '0.0';
                                        return (
                                            <tr key={period.id}>
                                                <td className="py-1.5 pl-1.5 pr-0.5">
                                                    <BufferedInput type="text" value={period.name} onCommit={v => handlePeriodFieldChange(index, 'name', v)} className="!py-1 !w-28 text-xs" placeholder="Nombre" title={period.name}/>
                                                </td>
                                                <td className="py-1.5 px-0.5">
                                                    <BufferedInput type="date" value={period.startDate} onCommit={v => handlePeriodFieldChange(index, 'startDate', v)} className="!py-1 !w-[7.5rem] text-xs"/>
                                                </td>
                                                <td className="py-1.5 px-0.5">
                                                    <BufferedInput type="date" value={period.endDate} onCommit={v => handlePeriodFieldChange(index, 'endDate', v)} className="!py-1 !w-[7.5rem] text-xs"/>
                                                </td>
                                                <td className="py-1.5 px-0.5">
                                                    <BufferedInput
                                                        type="number"
                                                        min="0"
                                                        step="0.1"
                                                        value={String(weight)}
                                                        onCommit={v => handlePeriodWeightChange(period.id, v)}
                                                        className="!py-1 !w-11 text-right text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        title={`${percentage}%`}
                                                    />
                                                </td>
                                                <td className="py-1.5 pr-1.5">
                                                    <button onClick={() => handleRemovePeriod(period.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><TrashIcon className="w-4 h-4"/></button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <button onClick={handleAddPeriod} className={`text-xs ${linkClassName} block p-2`}>+ Añadir Periodo</button>
                        </div>
                    </div>

                    <div>
                        <h5 className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                            <span aria-hidden="true">🚦</span> Escala de Calificaciones (Semáforo)
                        </h5>
                        <p className="text-xs text-slate-500 mb-1.5">
                            Define la nota mínima (&gt;=) a partir de la cual se aplica el color. El sistema prioriza el valor más alto alcanzado.
                        </p>
                        <div className="bg-slate-50 rounded-lg border border-slate-200">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                                        <th className="py-1.5 pl-2 pr-1 font-medium">Nota mín. (&gt;=)</th>
                                        <th className="py-1.5 px-1 font-medium">Color</th>
                                        <th className="py-1.5 px-1 font-medium">Etiqueta</th>
                                        <th className="py-1.5 pr-2"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {gradeScale.map((rule, index) => (
                                        <tr key={index}>
                                            <td className="py-1.5 pl-2 pr-1">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max="10"
                                                    step="0.1"
                                                    value={rule.min}
                                                    onChange={e => handleGradeScaleChange(index, 'min', parseFloat(e.target.value))}
                                                    className="!py-1 !w-16 text-xs text-center"
                                                />
                                            </td>
                                            <td className="py-1.5 px-1">
                                                <ColorSwatchPicker
                                                    value={rule.color}
                                                    onChange={color => handleGradeScaleChange(index, 'color', color)}
                                                />
                                            </td>
                                            <td className="py-1.5 px-1">
                                                <Input
                                                    type="text"
                                                    value={rule.label || ''}
                                                    onChange={e => handleGradeScaleChange(index, 'label', e.target.value)}
                                                    placeholder="Opcional"
                                                    className="!py-1 w-full text-xs"
                                                />
                                            </td>
                                            <td className="py-1.5 pr-2">
                                                <button onClick={() => handleRemoveGradeRule(index)} className="p-1 text-red-500 hover:bg-red-50 rounded"><TrashIcon className="w-4 h-4"/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={handleAddGradeRule} className={`text-xs ${linkClassName} block p-2`}>+ Añadir Regla</button>
                        </div>
                    </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AcademicConfigManager;
