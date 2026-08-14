import React, { useEffect } from 'react';
import type { AcademicConfiguration, Holiday, EvaluationPeriod, GradeScaleRule } from '../../types';
import { TrashIcon } from '../Icons';
import Input from '../Input';
import Select from '../Select';
import BufferedInput from '../BufferedInput';
import { linkClassName } from '../../theme/components/Link';
import { useCurrentAcademicYear, useUpdateAcademicYear, useEvaluationPeriods, useCreateEvaluationPeriod, useUpdateEvaluationPeriod, useDeleteEvaluationPeriod } from '../../hooks/useAcademicYears';

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
                            !Array.isArray(academicConfiguration.gradeScale);

        if (needsUpdate) {
            setAcademicConfiguration(prev => ({
                ...prev,
                holidays: Array.isArray(prev?.holidays) ? prev.holidays : [],
                evaluationPeriods: Array.isArray(prev?.evaluationPeriods) ? prev.evaluationPeriods : [],
                evaluationPeriodWeights: (typeof prev?.evaluationPeriodWeights === 'object' && prev.evaluationPeriodWeights !== null) ? prev.evaluationPeriodWeights : {},
                periods: Array.isArray(prev?.periods) ? prev.periods : [],
                defaultStartView: prev?.defaultStartView || 'calendar',
                defaultCalendarView: prev?.defaultCalendarView || 'month',
                // Initialize defaults if missing
                gradeScale: Array.isArray(prev?.gradeScale) && prev.gradeScale.length > 0 ? prev.gradeScale : [
                    { min: 9, color: 'emerald', label: 'Sobresaliente' },
                    { min: 7, color: 'lime', label: 'Notable' },
                    { min: 6, color: 'yellow', label: 'Bien' },
                    { min: 5, color: 'orange', label: 'Suficiente' },
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


    const handleConfigChange = <K extends keyof AcademicConfiguration>(field: K, value: AcademicConfiguration[K]) => {
        setAcademicConfiguration(prev => ({ ...prev, [field]: value }));
    };

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
            const newItem = { id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, name: 'Nuevo', startDate: '', endDate: '' };
            return { ...prev, [type]: [...currentList, newItem] };
        });
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
        <div className="space-y-8 pb-8">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Configuración del Curso Académico</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h4 className="font-semibold text-slate-700 mb-2">Fechas del Curso</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs text-slate-500">Inicio</label>
                            <BufferedInput type="date" value={effectiveYearStart} onCommit={v => handleYearDateChange('startDate', v)} className="w-full"/>
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">Fin</label>
                            <BufferedInput type="date" value={effectiveYearEnd} onCommit={v => handleYearDateChange('endDate', v)} className="w-full"/>
                        </div>
                    </div>
                </div>
                <div>
                    <h4 className="font-semibold text-slate-700 mb-2">Periodos de Evaluación</h4>
                    <div className="space-y-2">
                        {effectivePeriods.map((period, index) => (
                            <div key={period.id} className="flex gap-2 items-center">
                                <BufferedInput type="text" value={period.name} onCommit={v => handlePeriodFieldChange(index, 'name', v)} className="w-1/3 text-sm" placeholder="Nombre"/>
                                <BufferedInput type="date" value={period.startDate} onCommit={v => handlePeriodFieldChange(index, 'startDate', v)} className="w-1/3 text-sm"/>
                                <BufferedInput type="date" value={period.endDate} onCommit={v => handlePeriodFieldChange(index, 'endDate', v)} className="w-1/3 text-sm"/>
                                <button onClick={() => handleRemovePeriod(period.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><TrashIcon className="w-4 h-4"/></button>
                            </div>
                        ))}
                        <button onClick={handleAddPeriod} className={`text-sm ${linkClassName}`}>+ Añadir Periodo</button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <h4 className="font-semibold text-slate-700 mb-2">Ponderación de Evaluaciones</h4>
                    <p className="text-xs text-slate-500 mb-2">Asigna un peso proporcional a cada evaluación. El porcentaje se calcula automáticamente.</p>
                    <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        {effectivePeriods.map((period) => {
                            const weight = effectiveWeights[period.id] ?? 1;
                            const percentage = totalWeight > 0 ? ((weight / totalWeight) * 100).toFixed(1) : '0.0';
                            return (
                                <div key={period.id} className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-slate-700">{period.name}</span>
                                    <div className="flex items-center gap-2">
                                        <BufferedInput
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={String(weight)}
                                            onCommit={v => handlePeriodWeightChange(period.id, v)}
                                            className="w-16 text-right text-sm"
                                        />
                                        <span className="text-xs text-slate-500 w-12 text-right">{percentage}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <h4 className="font-semibold text-slate-700 mb-2">Vacaciones y Festivos</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {academicConfiguration.holidays.map((holiday, index) => (
                            <div key={holiday.id} className="flex gap-2 items-center">
                                <Input type="text" value={holiday.name} onChange={e => handleListItemChange('holidays', index, 'name', e.target.value)} className="flex-grow text-xs" placeholder="Nombre festivo"/>
                                <Input type="date" value={holiday.startDate} onChange={e => handleListItemChange('holidays', index, 'startDate', e.target.value)} className="w-24 text-xs"/>
                                <Input type="date" value={holiday.endDate} onChange={e => handleListItemChange('holidays', index, 'endDate', e.target.value)} className="w-24 text-xs"/>
                                <button onClick={() => handleRemoveListItem('holidays', holiday.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><TrashIcon className="w-3 h-3"/></button>
                            </div>
                        ))}
                        <button onClick={() => handleAddListItem('holidays')} className={`text-xs ${linkClassName}`}>+ Añadir Festivo</button>
                    </div>
                </div>

                <div>
                    <h4 className="font-semibold text-slate-700 mb-2">Escala de Calificaciones (Semáforo)</h4>
                    <p className="text-xs text-slate-500 mb-2">
                        Define la nota mínima (&gt;=) a partir de la cual se aplica el color. El sistema prioriza el valor más alto alcanzado (ej. si tienes &gt;=5 y &gt;=7, un 8 usará el color de 7, no el de 5).
                    </p>
                    <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200 max-h-60 overflow-y-auto">
                        {gradeScale.map((rule, index) => (
                            <div key={index} className="flex gap-2 items-center">
                                <div className="flex items-center gap-1">
                                    <span className="text-xs text-slate-500">≥</span>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="10"
                                        step="0.1"
                                        value={rule.min}
                                        onChange={e => handleGradeScaleChange(index, 'min', parseFloat(e.target.value))}
                                        className="w-14 text-sm text-center"
                                    />
                                </div>
                                <Select
                                    value={rule.color}
                                    onChange={e => handleGradeScaleChange(index, 'color', e.target.value as GradeScaleRule['color'])}
                                    className="text-sm"
                                >
                                    <option value="emerald">Esmeralda (Verde oscuro)</option>
                                    <option value="green">Verde</option>
                                    <option value="lime">Lima</option>
                                    <option value="yellow">Amarillo</option>
                                    <option value="orange">Naranja</option>
                                    <option value="red">Rojo</option>
                                    <option value="teal">Turquesa</option>
                                    <option value="blue">Azul</option>
                                    <option value="indigo">Índigo</option>
                                    <option value="violet">Violeta</option>
                                    <option value="gray">Gris</option>
                                </Select>
                                <Input
                                    type="text"
                                    value={rule.label || ''}
                                    onChange={e => handleGradeScaleChange(index, 'label', e.target.value)}
                                    placeholder="Etiqueta (opcional)"
                                    className="flex-grow text-sm"
                                />
                                <button onClick={() => handleRemoveGradeRule(index)} className="p-1 text-red-500 hover:bg-red-50 rounded"><TrashIcon className="w-4 h-4"/></button>
                            </div>
                        ))}
                        <button onClick={handleAddGradeRule} className={`text-sm ${linkClassName}`}>+ Añadir Regla</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AcademicConfigManager;
