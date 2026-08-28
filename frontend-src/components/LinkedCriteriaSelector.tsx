
import React, { useMemo, useState } from 'react';
import type { LinkedCriterion, EvaluationCriterion, SpecificCompetence, KeyCompetence, OperationalDescriptor } from '../types';
import Input from './Input';
import Badge from './Badge';
import { checkboxClassName } from '../theme/components/Input';
import { linkClassName } from '../theme/components/Link';
import { TrashIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon } from './Icons';
import { compararCodigo } from '../utils';

interface LinkedCriteriaSelectorProps {
    linkedCriteria: LinkedCriterion[];
    onChange: (next: LinkedCriterion[]) => void;
    // Ya filtrados a la materia correspondiente -- este componente no sabe
    // de cursos/materias, solo agrupa por competencia lo que se le pasa.
    criteria: EvaluationCriterion[];
    specificCompetences: SpecificCompetence[];
    keyCompetences: KeyCompetence[];
    // 'ponderar' cuando ya hay criterios elegidos y lo más probable es
    // querer revisar/ajustar pesos, no volver a elegir criterios.
    initialVista?: 'seleccionar' | 'ponderar';
}

// Compartido por AssignmentModal.tsx y CalendarTaskModal.tsx -- las dos
// tenían exactamente el mismo selector de criterios/descriptores duplicado,
// y ya habían llegado a divergir (el segundo se había quedado con el
// desglose de descriptores por criterio en vez de por competencia). Ver el
// comentario de handleToggleAllCompetenceDescriptors para el porqué de esa
// distinción.
const LinkedCriteriaSelector: React.FC<LinkedCriteriaSelectorProps> = ({
    linkedCriteria, onChange, criteria, specificCompetences, keyCompetences, initialVista = 'seleccionar',
}) => {
    const [vistaCriterios, setVistaCriterios] = useState<'seleccionar' | 'ponderar'>(initialVista);
    const [expandedCompetences, setExpandedCompetences] = useState<Set<string>>(() => {
        const selectedIds = new Set(linkedCriteria.map(lc => lc.criterionId));
        const map = new Map<string, string>();
        criteria.forEach(c => {
            const sc = specificCompetences.find(sc => sc.id === c.competenceId);
            map.set(c.id, sc?.id ?? '__sin_competencia__');
        });
        return new Set(criteria.filter(c => selectedIds.has(c.id)).map(c => map.get(c.id)!));
    });
    // Cerrado por defecto -- los descriptores ya se marcan todos al
    // vincular un criterio (ver handleAddCriterion), así que la mayoría de
    // las veces no hace falta tocar nada aquí.
    const [expandedCompetenceDescriptors, setExpandedCompetenceDescriptors] = useState<Set<string>>(new Set());

    const descriptorMap = useMemo(() => {
        const map = new Map<string, OperationalDescriptor>();
        keyCompetences.forEach(kc => (kc.descriptors || []).forEach(d => map.set(d.id, d)));
        return map;
    }, [keyCompetences]);

    const criterionToCompetenceMap = useMemo(() => {
        const map = new Map<string, SpecificCompetence>();
        criteria.forEach(c => {
            const sc = specificCompetences.find(sc => sc.id === c.competenceId);
            if (sc) map.set(c.id, sc);
        });
        return map;
    }, [criteria, specificCompetences]);

    const criteriaByCompetence = useMemo(() => {
        const groups = new Map<string, { competence: SpecificCompetence | null; criteria: EvaluationCriterion[] }>();
        [...criteria].sort((a, b) => compararCodigo(a.code, b.code)).forEach(c => {
            const sc = criterionToCompetenceMap.get(c.id);
            const key = sc?.id ?? '__sin_competencia__';
            if (!groups.has(key)) groups.set(key, { competence: sc ?? null, criteria: [] });
            groups.get(key)!.criteria.push(c);
        });
        return Array.from(groups.values());
    }, [criteria, criterionToCompetenceMap]);

    const totalRatio = linkedCriteria.reduce((sum, lc) => sum + lc.ratio, 0);

    // Por código de criterio, no por el orden en que se fueron marcando.
    const linkedCriteriaOrdenados = useMemo(() => [...linkedCriteria].sort((a, b) => {
        const codeA = criteria.find(c => c.id === a.criterionId)?.code || '';
        const codeB = criteria.find(c => c.id === b.criterionId)?.code || '';
        return compararCodigo(codeA, codeB);
    }), [linkedCriteria, criteria]);

    const handleAddCriterion = (criterionId: string) => {
        // Todos marcados por defecto: la relación competencia específica →
        // descriptores operativos la fija el currículo oficial
        // (keyCompetenceDescriptorIds), no es una elección tarea a tarea del
        // profesor -- un criterio vinculado implica, por norma, todos sus
        // descriptores. "Desmarcar todos" sigue disponible para las (pocas)
        // tareas que de verdad se centren solo en parte de la competencia.
        const specificComp = criterionToCompetenceMap.get(criterionId);
        const allDescriptorIds = specificComp?.keyCompetenceDescriptorIds || [];
        onChange([...linkedCriteria, { criterionId, ratio: 1, selectedDescriptorIds: allDescriptorIds }]);
    };

    const handleRemoveCriterion = (criterionId: string) => {
        onChange(linkedCriteria.filter(lc => lc.criterionId !== criterionId));
    };

    const handleToggleCriterion = (criterionId: string) => {
        const isSelected = linkedCriteria.some(lc => lc.criterionId === criterionId);
        if (isSelected) handleRemoveCriterion(criterionId); else handleAddCriterion(criterionId);
    };

    const handleCriterionRatioChange = (criterionId: string, newRatio: number) => {
        onChange(linkedCriteria.map(lc => lc.criterionId === criterionId ? { ...lc, ratio: newRatio >= 0 ? newRatio : 0 } : lc));
    };

    // Los descriptores operativos son propiedad de la COMPETENCIA, nunca del
    // criterio -- la norma no establece esa relación a nivel de criterio.
    // Por eso se marcan/desmarcan una sola vez por competencia, y el cambio
    // se aplica a la vez a TODOS los criterios ya vinculados de esa
    // competencia, para que selectedDescriptorIds (que sigue viviendo por
    // criterio en el modelo de datos, sin tocarlo) se mantenga siempre
    // igual entre ellos.
    const handleToggleAllCompetenceDescriptors = (competenceId: string, allDescriptorIds: string[], selectAll: boolean) => {
        onChange(linkedCriteria.map(lc => {
            const sc = criterionToCompetenceMap.get(lc.criterionId);
            if (sc?.id !== competenceId) return lc;
            return { ...lc, selectedDescriptorIds: selectAll ? allDescriptorIds : [] };
        }));
    };

    const handleCompetenceDescriptorChange = (competenceId: string, descriptorId: string, isSelected: boolean) => {
        onChange(linkedCriteria.map(lc => {
            const sc = criterionToCompetenceMap.get(lc.criterionId);
            if (sc?.id !== competenceId) return lc;
            const newSelectedIds = new Set(lc.selectedDescriptorIds);
            if (isSelected) newSelectedIds.add(descriptorId); else newSelectedIds.delete(descriptorId);
            return { ...lc, selectedDescriptorIds: Array.from(newSelectedIds) };
        }));
    };

    return (
        <div className="space-y-4">
            {/* Toggle -- solo una de las dos vistas a la vez, para no liar */}
            <div className="flex gap-1.5">
                <button
                    type="button"
                    onClick={() => setVistaCriterios('seleccionar')}
                    className={`flex-1 flex items-center justify-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${vistaCriterios === 'seleccionar' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                >
                    <PlusIcon className="w-4 h-4" />
                    Seleccionar Criterios
                    <Badge variant="primary">{linkedCriteria.length}</Badge>
                </button>
                <button
                    type="button"
                    onClick={() => setVistaCriterios('ponderar')}
                    className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${vistaCriterios === 'ponderar' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                >
                    Ponderar Criterios
                </button>
            </div>

            {vistaCriterios === 'seleccionar' && (
                <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
                    <div className="max-h-72 overflow-y-auto bg-white">
                        {criteria.length === 0 ? (
                            <p className="p-3 text-sm text-slate-500 italic">No hay criterios definidos para este curso.</p>
                        ) : (
                            criteriaByCompetence.map(({ competence, criteria: groupCriteria }) => {
                                const groupKey = competence?.id ?? '__sin_competencia__';
                                const isExpanded = expandedCompetences.has(groupKey);
                                const selectedInGroup = groupCriteria.filter(c => linkedCriteria.some(lc => lc.criterionId === c.id)).length;
                                const descriptorsGrupo = competence
                                    ? (competence.keyCompetenceDescriptorIds || []).map(id => descriptorMap.get(id)).filter(Boolean) as OperationalDescriptor[]
                                    : [];
                                const linkedEnGrupo = competence
                                    ? linkedCriteria.filter(lc => criterionToCompetenceMap.get(lc.criterionId)?.id === competence.id)
                                    : [];
                                const selectedDescIds = linkedEnGrupo[0]?.selectedDescriptorIds ?? [];
                                const descriptoresExpanded = expandedCompetenceDescriptors.has(groupKey);
                                return (
                                    <div key={groupKey} className="border-b border-slate-100 last:border-b-0">
                                        <button
                                            type="button"
                                            onClick={() => setExpandedCompetences(prev => {
                                                const next = new Set(prev);
                                                next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey);
                                                return next;
                                            })}
                                            className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 hover:bg-slate-200 text-left"
                                        >
                                            <span className="flex items-start gap-2 text-sm font-medium text-slate-700 min-w-0">
                                                {isExpanded ? <ChevronDownIcon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5"/> : <ChevronRightIcon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5"/>}
                                                <span className="font-semibold text-slate-500 whitespace-nowrap flex-shrink-0">{competence?.code ?? '—'}</span>
                                                <span className="break-words min-w-0">{competence?.description ?? 'Sin competencia'}</span>
                                            </span>
                                            {selectedInGroup > 0 && (
                                                <Badge variant="primary" className="ml-2 flex-shrink-0">{selectedInGroup}</Badge>
                                            )}
                                        </button>
                                        {isExpanded && (
                                            <div className="pb-2">
                                                {competence && descriptorsGrupo.length > 0 && (
                                                    <div className="bg-slate-200">
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedCompetenceDescriptors(prev => {
                                                                const next = new Set(prev);
                                                                next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey);
                                                                return next;
                                                            })}
                                                            className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-slate-300/60"
                                                        >
                                                            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                                                                {descriptoresExpanded ? <ChevronDownIcon className="w-3.5 h-3.5 text-slate-500"/> : <ChevronRightIcon className="w-3.5 h-3.5 text-slate-500"/>}
                                                                Descriptores operativos ({competence.code})
                                                            </span>
                                                            {linkedEnGrupo.length === 0 && (
                                                                <span className="text-xs text-slate-500 font-normal">selecciona algún criterio primero</span>
                                                            )}
                                                        </button>
                                                        {descriptoresExpanded && (
                                                            <div className="px-3 pb-2">
                                                                {linkedEnGrupo.length > 0 && (
                                                                    <div className="flex justify-end mb-1">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleToggleAllCompetenceDescriptors(competence.id, descriptorsGrupo.map(d => d.id), selectedDescIds.length < descriptorsGrupo.length)}
                                                                            className={`text-xs font-semibold ${linkClassName}`}
                                                                        >
                                                                            {selectedDescIds.length < descriptorsGrupo.length ? 'Marcar todos' : 'Desmarcar todos'}
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                                                    {descriptorsGrupo.map(desc => (
                                                                        <label key={desc.id} className={`flex items-start space-x-2 p-1 rounded-md ${linkedEnGrupo.length > 0 ? 'cursor-pointer hover:bg-slate-300/50' : 'opacity-60 cursor-not-allowed'}`}>
                                                                            <input
                                                                                type="checkbox"
                                                                                className={`mt-0.5 ${checkboxClassName}`}
                                                                                checked={selectedDescIds.includes(desc.id)}
                                                                                disabled={linkedEnGrupo.length === 0}
                                                                                onChange={(e) => handleCompetenceDescriptorChange(competence.id, desc.id, e.target.checked)}
                                                                            />
                                                                            <span className="text-xs text-slate-700"><span className="font-bold">{desc.code}:</span> {desc.description}</span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="px-3 pt-2 space-y-1">
                                                    {groupCriteria.map(c => {
                                                        const isSelected = linkedCriteria.some(lc => lc.criterionId === c.id);
                                                        return (
                                                            <label key={c.id} className={`flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'}`}>
                                                                <input type="checkbox" checked={isSelected} onChange={() => handleToggleCriterion(c.id)} className={`mt-1 ${checkboxClassName}`} />
                                                                <div className="flex-1">
                                                                    <span className="block text-sm font-semibold text-slate-800">{c.code}</span>
                                                                    <span className="block text-xs text-slate-600">{c.description}</span>
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {vistaCriterios === 'ponderar' && linkedCriteria.length > 0 && (
                <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden p-3">
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
                        {linkedCriteriaOrdenados.map(lc => {
                            const criterion = criteria.find(c => c.id === lc.criterionId);
                            const percentage = totalRatio > 0 ? ((lc.ratio / totalRatio) * 100).toFixed(1) : '0.0';
                            return (
                                <div key={lc.criterionId} className="p-3 border border-slate-200 rounded-lg bg-slate-50/50">
                                    <div className="flex items-center space-x-2">
                                        <div className="flex-grow">
                                            <p className="font-semibold text-slate-800">{criterion?.code}: <span className="font-normal text-slate-600">{criterion?.description}</span></p>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Input
                                                type="number" min="0" step="any" value={lc.ratio}
                                                onChange={(e) => handleCriterionRatioChange(lc.criterionId, Number(e.target.value))}
                                                className="!w-16 text-center"
                                                title="Ratio de ponderación"
                                            />
                                            <span className="text-sm font-semibold text-slate-500 w-16 text-center">{percentage}%</span>
                                            <button type="button" onClick={() => handleRemoveCriterion(lc.criterionId)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><TrashIcon className="w-5 h-5" /></button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {vistaCriterios === 'ponderar' && linkedCriteria.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-4 bg-slate-50 rounded-lg">
                    Sin criterios seleccionados. Cambia a "Seleccionar Criterios" arriba para añadir alguno.
                </p>
            )}
        </div>
    );
};

export default LinkedCriteriaSelector;
