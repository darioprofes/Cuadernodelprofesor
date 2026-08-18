
import React, { useMemo, useState, useEffect } from 'react';
import type { Assignment, Category, EvaluationCriterion, EvaluationTool, LinkedCriterion, ProgrammingUnit, SpecificCompetence } from '../types';
import Modal from './Modal';
import Button from './Button';
import Select from './Select';
import Input from './Input';
import { useCreateAssignment } from '../hooks/useAssignments';

interface ImportarDesdeSAModalProps {
    isOpen: boolean;
    onClose: () => void;
    classId: string;
    courseId: string;
    evaluationPeriodId: string;
    programmingUnits: ProgrammingUnit[];
    categories: Category[];
    criteria: EvaluationCriterion[];
    specificCompetences: SpecificCompetence[];
    evaluationTools: EvaluationTool[];
}

// Un ítem importable = una actividad de sesión, el producto final, o el
// examen final (como una única columna -- ver más abajo). Fase 7 del plan
// de la SA: reutiliza assignments.programmingUnitId (ya existente en el
// esquema) y hereda linkedCriteria de la SA en vez de tener que volverlos
// a elegir a mano por cada columna.
interface ItemImportable {
    key: string;
    nombrePorDefecto: string;
    linkedCriteriaIds: string[];
    evaluationToolId?: string;
}

const construirItems = (unit: ProgrammingUnit): ItemImportable[] => {
    const items: ItemImportable[] = [];

    (unit.sessionDetails || []).forEach((sesion, sIndex) => {
        (sesion.actividades || []).forEach((act, aIndex) => {
            items.push({
                key: `s${sIndex}-a${aIndex}`,
                nombrePorDefecto: `${sesion.titulo || `Sesión ${sIndex + 1}`} · ${act.titulo || 'Actividad'}`,
                linkedCriteriaIds: act.linkedCriteriaIds || [],
                evaluationToolId: act.evaluationToolId,
            });
        });
    });

    if (unit.finalProduct?.incluido) {
        items.push({
            key: 'producto',
            nombrePorDefecto: `Producto final${unit.finalProduct.tipo ? `: ${unit.finalProduct.tipo}` : ''}`,
            linkedCriteriaIds: unit.finalProduct.linkedCriteriaIds || [],
            evaluationToolId: unit.finalProduct.evaluationToolId,
        });
    }

    // El examen entero es UNA columna, no una por bloque -- los criterios de
    // todos sus bloques se combinan en linkedCriteria (ratio 1 cada uno). No
    // se pierde el desglose por criterio: una tarea de calificación directa
    // con más de un criterio vinculado ya pide una nota POR criterio en
    // GradeEntryModal, no una nota única -- eso es justo lo que hace falta
    // aquí, sin inventar un mecanismo nuevo.
    if (unit.finalExam?.incluido) {
        const criteriosExamen = Array.from(new Set((unit.finalExam.bloques || []).flatMap(b => b.linkedCriteriaIds || [])));
        items.push({
            key: 'examen',
            nombrePorDefecto: `Examen final${unit.finalExam.formato ? `: ${unit.finalExam.formato}` : ''}`,
            linkedCriteriaIds: criteriosExamen,
            evaluationToolId: unit.finalExam.evaluationToolId,
        });
    }

    return items;
};

const ImportarDesdeSAModal: React.FC<ImportarDesdeSAModalProps> = ({
    isOpen, onClose, classId, courseId, evaluationPeriodId, programmingUnits, categories, criteria, specificCompetences, evaluationTools,
}) => {
    const [unitId, setUnitId] = useState('');
    const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
    const [nombres, setNombres] = useState<Record<string, string>>({});
    const [categoriaPorItem, setCategoriaPorItem] = useState<Record<string, string>>({});
    const [pesoPorItem, setPesoPorItem] = useState<Record<string, string>>({});
    const [importando, setImportando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const createAssignmentMutation = useCreateAssignment();

    const unidadesDelCurso = programmingUnits.filter(u => u.courseId === courseId);
    const unit = unidadesDelCurso.find(u => u.id === unitId);
    const items = useMemo(() => (unit ? construirItems(unit) : []), [unit]);

    useEffect(() => {
        // Al cambiar de SA, arranca de cero -- selección/nombres/categorías
        // de la anterior no tienen sentido para esta.
        setSeleccionados(new Set());
        const nombresIniciales: Record<string, string> = {};
        const categoriasIniciales: Record<string, string> = {};
        items.forEach(item => {
            nombresIniciales[item.key] = item.nombrePorDefecto;
            categoriasIniciales[item.key] = categories[0]?.id || '';
        });
        setNombres(nombresIniciales);
        setCategoriaPorItem(categoriasIniciales);
        setPesoPorItem({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unitId]);

    const toggleItem = (key: string) => {
        setSeleccionados(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const reset = () => {
        setUnitId('');
        setSeleccionados(new Set());
        setNombres({});
        setCategoriaPorItem({});
        setPesoPorItem({});
        setError(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const criterioACompetencia = (criterioId: string) => {
        const crit = criteria.find(c => c.id === criterioId);
        if (!crit) return [];
        return specificCompetences.find(sc => sc.id === crit.competenceId)?.keyCompetenceDescriptorIds || [];
    };

    const handleImportar = async () => {
        if (!unit || seleccionados.size === 0) return;
        setImportando(true);
        setError(null);
        try {
            for (const key of seleccionados) {
                const item = items.find(i => i.key === key);
                if (!item) continue;
                const categoryId = categoriaPorItem[key];
                if (!categoryId) continue;

                const tool = item.evaluationToolId ? evaluationTools.find(t => t.id === item.evaluationToolId) : undefined;
                const evaluationMethod: Assignment['evaluationMethod'] = tool ? tool.type : 'direct_grade';
                const linkedCriteria: LinkedCriterion[] = evaluationMethod === 'direct_grade'
                    ? item.linkedCriteriaIds.map(id => ({ criterionId: id, ratio: 1, selectedDescriptorIds: criterioACompetencia(id) }))
                    : [];

                await createAssignmentMutation.mutateAsync({
                    classId,
                    data: {
                        categoryId,
                        evaluationPeriodId,
                        evaluationToolId: tool?.id,
                        programmingUnitId: unit.id,
                        name: nombres[key] || item.nombrePorDefecto,
                        evaluationMethod,
                        linkedCriteria,
                        pesoEnCategoria: pesoPorItem[key]?.trim() ? Number(pesoPorItem[key]) : undefined,
                    },
                });
            }
            handleClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setImportando(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Importar desde una Situación de Aprendizaje" size="3xl">
            <div className="flex flex-col gap-4">
                <div>
                    <label className="text-xs font-medium text-slate-600">Situación de Aprendizaje</label>
                    <Select value={unitId} onChange={e => setUnitId(e.target.value)} className="max-w-md">
                        <option value="">Elige una SA...</option>
                        {unidadesDelCurso.map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.sessions} sesiones)</option>
                        ))}
                    </Select>
                </div>

                {unit && items.length === 0 && (
                    <p className="text-sm text-slate-500">Esta SA no tiene actividades, producto ni examen que importar.</p>
                )}

                {unit && categories.length === 0 && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        Esta clase todavía no tiene categorías en esta evaluación -- crea al menos una antes de importar.
                    </p>
                )}

                {unit && items.length > 0 && categories.length > 0 && (
                    <div className="flex flex-col gap-2 max-h-[26rem] overflow-y-auto pr-1">
                        {items.map(item => (
                            <div key={item.key} className={`p-2.5 border rounded-lg flex items-start gap-2 ${seleccionados.has(item.key) ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}>
                                <input
                                    type="checkbox"
                                    checked={seleccionados.has(item.key)}
                                    onChange={() => toggleItem(item.key)}
                                    className="mt-2"
                                />
                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
                                    <Input
                                        type="text"
                                        value={nombres[item.key] ?? item.nombrePorDefecto}
                                        onChange={e => setNombres(prev => ({ ...prev, [item.key]: e.target.value }))}
                                        disabled={!seleccionados.has(item.key)}
                                    />
                                    <Select
                                        value={categoriaPorItem[item.key] || ''}
                                        onChange={e => setCategoriaPorItem(prev => ({ ...prev, [item.key]: e.target.value }))}
                                        disabled={!seleccionados.has(item.key)}
                                        className="w-40"
                                    >
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </Select>
                                    <div className="w-24">
                                        <Input
                                            type="number" min="0" max="100"
                                            value={pesoPorItem[item.key] || ''}
                                            onChange={e => setPesoPorItem(prev => ({ ...prev, [item.key]: e.target.value }))}
                                            disabled={!seleccionados.has(item.key)}
                                            placeholder="Reparto igual"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
                    <Button
                        type="button"
                        onClick={handleImportar}
                        disabled={seleccionados.size === 0 || importando || categories.length === 0}
                    >
                        {importando ? 'Importando...' : `Importar ${seleccionados.size || ''}`.trim()}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default ImportarDesdeSAModal;
