
import React, { useState, useEffect, useMemo } from 'react';
import type { Assignment, EvaluationCriterion, LinkedCriterion, Category, SpecificCompetence, KeyCompetence, ProgrammingUnit, AcademicConfiguration, EvaluationPeriod, EvaluationTool, ImportanciaActividad } from '../types';

const IMPORTANCIA_LABEL: Record<ImportanciaActividad, string> = {
  muy_baja: 'Muy baja',
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  muy_alta: 'Muy alta',
};
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { checkboxClassName } from '../theme/components/Input';
import { linkClassName } from '../theme/components/Link';
import LinkedCriteriaSelector from './LinkedCriteriaSelector';

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (assignment: Omit<Assignment, 'id' | 'categoryId'> & { id?: string; categoryId?: string }) => Promise<void> | void;
  assignmentToEdit: Assignment | null;
  category: Category;
  criteria: EvaluationCriterion[];
  specificCompetences: SpecificCompetence[];
  keyCompetences: KeyCompetence[];
  programmingUnits: ProgrammingUnit[];
  evaluationPeriods: EvaluationPeriod[];
  academicConfiguration: AcademicConfiguration;
  evaluationTools: EvaluationTool[];
  allAssignments: Assignment[];
  allCategories: Category[];
}

const AssignmentModal: React.FC<AssignmentModalProps> = (props) => {
  const { isOpen, onClose, onSave, assignmentToEdit, category, criteria, specificCompetences, keyCompetences, evaluationPeriods, academicConfiguration, evaluationTools, allAssignments, allCategories } = props;
  
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [date, setDate] = useState<string>('');
  const [evaluationPeriodId, setEvaluationPeriodId] = useState<string>(category.evaluationPeriodId);
  const [linkedCriteria, setLinkedCriteria] = useState<LinkedCriterion[]>([]);
  const [programmingUnitId, setProgrammingUnitId] = useState<string | undefined>(undefined);
  const [evaluationMethod, setEvaluationMethod] = useState<Assignment['evaluationMethod']>('direct_grade');
  const [evaluationToolId, setEvaluationToolId] = useState<string | undefined>(undefined);
  const [recoversAssignmentIds, setRecoversAssignmentIds] = useState<string[]>([]);
  const [pesoEnCategoria, setPesoEnCategoria] = useState<string>('');
  const [importancia, setImportancia] = useState<ImportanciaActividad>('normal');
  const [importanciaAvanzada, setImportanciaAvanzada] = useState(false);
  const [importanciaPersonalizada, setImportanciaPersonalizada] = useState<string>('');
  const [puntuacionMaxima, setPuntuacionMaxima] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(category.id);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [useGlobalToolCriteria, setUseGlobalToolCriteria] = useState(false);

  useEffect(() => {
    setError(null);
    if (assignmentToEdit) {
      setSelectedCategoryId(assignmentToEdit.categoryId);
      setName(assignmentToEdit.name);
      setShortName(assignmentToEdit.shortName || '');
      setDate(assignmentToEdit.date || '');
      setEvaluationPeriodId(assignmentToEdit.evaluationPeriodId);
      setProgrammingUnitId(assignmentToEdit.programmingUnitId);
      setEvaluationMethod(assignmentToEdit.evaluationMethod || 'direct_grade');
      setEvaluationToolId(assignmentToEdit.evaluationToolId);
      setRecoversAssignmentIds(assignmentToEdit.recoversAssignmentIds || []);
      setPesoEnCategoria(assignmentToEdit.pesoEnCategoria != null ? String(assignmentToEdit.pesoEnCategoria) : '');
      setImportancia(assignmentToEdit.importancia || 'normal');
      setImportanciaAvanzada(assignmentToEdit.importanciaPersonalizada != null);
      setImportanciaPersonalizada(assignmentToEdit.importanciaPersonalizada != null ? String(assignmentToEdit.importanciaPersonalizada) : '');
      setPuntuacionMaxima(assignmentToEdit.puntuacionMaxima != null ? String(assignmentToEdit.puntuacionMaxima) : '');
      const sanitizedLinkedCriteria = (assignmentToEdit.linkedCriteria || []).map(lc => ({
        ...lc,
        selectedDescriptorIds: lc.selectedDescriptorIds || [],
      }));
      setLinkedCriteria(sanitizedLinkedCriteria);

      // Determine if global tool criteria mode should be active
      if (assignmentToEdit.evaluationMethod !== 'direct_grade' && sanitizedLinkedCriteria.length > 0) {
          setUseGlobalToolCriteria(true);
      } else {
          setUseGlobalToolCriteria(false);
      }

    } else {
      setSelectedCategoryId(category.id);
      setName('');
      setShortName('');
      setDate('');
      setEvaluationPeriodId(category.evaluationPeriodId);
      setProgrammingUnitId(undefined);
      setLinkedCriteria([]);
      setEvaluationMethod('direct_grade');
      setEvaluationToolId(undefined);
      setRecoversAssignmentIds([]);
      setPesoEnCategoria('');
      setImportancia('normal');
      setImportanciaAvanzada(false);
      setImportanciaPersonalizada('');
      setPuntuacionMaxima('');
      setUseGlobalToolCriteria(false);
    }
  }, [assignmentToEdit, isOpen, category]);
  
  useEffect(() => {
    if (date) {
        const period = academicConfiguration.evaluationPeriods.find(p => date >= p.startDate && date <= p.endDate);
        if (period) {
            setEvaluationPeriodId(period.id);
        }
    }
  }, [date, academicConfiguration.evaluationPeriods]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name) {
      // Logic to ensure consistency: if tool is selected but "useGlobal" is unchecked, clear criteria
      let finalLinkedCriteria = linkedCriteria;
      if (evaluationMethod !== 'direct_grade' && !useGlobalToolCriteria) {
          finalLinkedCriteria = [];
      }

      const assignmentData = {
        name,
        shortName: shortName.trim() || undefined,
        // "" (sin fecha) rompe la validación del backend (espera null o una
        // fecha válida, nunca cadena vacía) -- bug real encontrado al probar
        // el alias: el 422 resultante tumbaba TODO el guardado, no solo la
        // fecha, así que name/shortName tampoco se aplicaban.
        date: date || undefined,
        evaluationPeriodId,
        programmingUnitId,
        evaluationMethod,
        evaluationToolId: evaluationMethod !== 'direct_grade' ? evaluationToolId : undefined,
        linkedCriteria: finalLinkedCriteria,
        recoversAssignmentIds: category.type === 'recovery' ? recoversAssignmentIds : [],
        pesoEnCategoria: pesoEnCategoria.trim() ? Number(pesoEnCategoria) : undefined,
        importancia,
        importanciaPersonalizada: importanciaAvanzada && importanciaPersonalizada.trim() ? Number(importanciaPersonalizada) : undefined,
        puntuacionMaxima: evaluationMethod === 'direct_grade' && finalLinkedCriteria.length === 0 && puntuacionMaxima.trim()
          ? Number(puntuacionMaxima) : undefined,
      };
      setError(null);
      setGuardando(true);
      try {
        if (assignmentToEdit) {
          await onSave({ ...assignmentData, id: assignmentToEdit.id, categoryId: selectedCategoryId });
        } else {
          await onSave(assignmentData);
        }
        onClose();
      } catch (err) {
        // No se cierra el modal en caso de error -- antes sí se cerraba
        // incondicionalmente, así que un fallo de guardado (p.ej. un 422 del
        // backend) parecía "no hacer nada" porque el modal desaparecía sin
        // avisar y los cambios se perdían.
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setGuardando(false);
      }
    }
  };

  const availableToolsForMethod = useMemo(() => {
      return evaluationTools.filter(tool => tool.type === evaluationMethod);
  }, [evaluationTools, evaluationMethod]);
  
  const modalTitle = assignmentToEdit 
    ? `Editar Tarea en '${category.name}'` 
    : `Nueva Tarea en '${category.name}'`;
    
  const showCriteriaSection = category.type !== 'recovery' || recoversAssignmentIds.length === 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="3xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">Nombre de la Tarea</label>
            <Input
              type="text" id="name" value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1" required
            />
            <label htmlFor="short-name" className="block text-xs font-medium text-slate-500 mt-2">
              Alias corto (opcional, para la columna del cuaderno)
            </label>
            <Input
              type="text" id="short-name" value={shortName} onChange={(e) => setShortName(e.target.value)}
              className="mt-1" placeholder={name || 'Se usará el nombre completo'}
            />
          </div>
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-slate-700">Fecha</label>
            <Input
              type="date" id="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="lg:col-span-1">
            <label htmlFor="evaluation-period" className="block text-sm font-medium text-slate-700">Periodo</label>
            <Select
              id="evaluation-period" value={evaluationPeriodId} onChange={(e) => setEvaluationPeriodId(e.target.value)}
              className="mt-1"
            >
              {evaluationPeriods.map(period => <option key={period.id} value={period.id}>{period.name}</option>)}
            </Select>
          </div>
        </div>
        {assignmentToEdit && (
          <div>
            <label htmlFor="category-select" className="block text-sm font-medium text-slate-700">Categoría</label>
            <Select
              id="category-select" value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="mt-1"
            >
              {allCategories
                .filter(c => c.evaluationPeriodId === evaluationPeriodId)
                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div>
            <label htmlFor="peso-categoria" className="block text-sm font-medium text-slate-700">
              Peso en la categoría (%)
            </label>
            <Input
              type="number" id="peso-categoria" min="0" max="100" step="1"
              value={pesoEnCategoria} onChange={(e) => setPesoEnCategoria(e.target.value)}
              placeholder="Reparto igual"
              className="mt-1"
            />
            <p className="text-xs text-slate-400 mt-1">Vacío = se reparte a partes iguales con el resto de tareas de "{category.name}".</p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="importancia" className="block text-sm font-medium text-slate-700">
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
                id="importancia" value={importancia} onChange={(e) => setImportancia(e.target.value as ImportanciaActividad)}
                className="mt-1"
              >
                {(Object.keys(IMPORTANCIA_LABEL) as ImportanciaActividad[]).map(key => (
                  <option key={key} value={key}>{IMPORTANCIA_LABEL[key]}</option>
                ))}
              </Select>
            )}
            <p className="text-xs text-slate-400 mt-1">Cuánto cuenta esta tarea como evidencia de sus criterios frente a otras tareas del curso.</p>
          </div>
        </div>
        
        {category.type === 'recovery' && (
          <RecoverySettings
            allAssignments={allAssignments}
            allCategories={allCategories}
            currentAssignmentId={assignmentToEdit?.id}
            evaluationPeriodId={evaluationPeriodId}
            selectedIds={recoversAssignmentIds}
            setSelectedIds={setRecoversAssignmentIds}
          />
        )}

        <div>
            <label htmlFor="evaluation-method" className="block text-sm font-medium text-slate-700">Método de Evaluación</label>
            <Select
              id="evaluation-method" value={evaluationMethod} onChange={(e) => setEvaluationMethod(e.target.value as Assignment['evaluationMethod'])}
              className="mt-1"
            >
              <option value="direct_grade">Nota numérica</option>
              <option value="checklist">Lista de Cotejo</option>
              <option value="rating_scale">Escala de Valoración</option>
              <option value="rubric">Rúbrica</option>
              <option value="criterial_exam">Examen criterial</option>
            </Select>
        </div>

        {evaluationMethod === 'direct_grade' && linkedCriteria.length === 0 && (
            <div>
                <label htmlFor="puntuacion-maxima" className="block text-sm font-medium text-slate-700">
                    Puntuación máxima (opcional)
                </label>
                <div className="w-32 mt-1">
                    <Input
                        type="number" id="puntuacion-maxima" min="0" step="0.5"
                        value={puntuacionMaxima} onChange={(e) => setPuntuacionMaxima(e.target.value)}
                        placeholder="10"
                    />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                    Si esta tarea se puntúa sobre un valor distinto de 10 (p.ej. un examen sobre 8), indícalo aquí:
                    al calificar podrás escribir la nota tal cual sale, y se convertirá a base 10 automáticamente
                    para los cálculos de medias.
                </p>
            </div>
        )}

        {/* Instrument Selection Logic */}
        {evaluationMethod !== 'direct_grade' && (
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="mb-4">
                    <label htmlFor="evaluation-tool" className="block text-sm font-medium text-slate-700">Instrumento de Evaluación</label>
                    <Select
                      id="evaluation-tool" value={evaluationToolId || ''} onChange={(e) => setEvaluationToolId(e.target.value)}
                      className="mt-1"
                      required
                    >
                      <option value="" disabled>Selecciona un instrumento...</option>
                      {availableToolsForMethod.map(tool => (
                        <option key={tool.id} value={tool.id}>{tool.name}</option>
                      ))}
                    </Select>
                     <p className="text-xs text-slate-500 mt-1">
                        El instrumento asigna las calificaciones. Puedes editarlo en Ajustes.
                    </p>
                </div>

                {showCriteriaSection && (
                    <div className="mt-4 border-t pt-4">
                        <label className="flex items-start space-x-3 cursor-pointer">
                            <input 
                                type="checkbox" 
                                className={`mt-1 ${checkboxClassName}`}
                                checked={useGlobalToolCriteria}
                                onChange={e => setUseGlobalToolCriteria(e.target.checked)}
                            />
                            <div>
                                <span className="block text-sm font-medium text-slate-900">Vincular nota global a Criterios LOMLOE</span>
                                <span className="block text-xs text-slate-500">
                                    Si activas esto, la nota global calculada por el instrumento (0-10) se aplicará directamente a los criterios que selecciones abajo, con la ponderación que definas. Esto ignorará las vinculaciones internas de los ítems del instrumento.
                                </span>
                            </div>
                        </label>
                    </div>
                )}
            </div>
        )}

        {/* Criteria Selector Logic: Shown if Direct Grade OR (Tool + Global Mode Enabled) */}
        {(evaluationMethod === 'direct_grade' || useGlobalToolCriteria) && showCriteriaSection && (
        <div className="space-y-4 mt-4">
            {evaluationMethod !== 'direct_grade' && <h4 className="text-sm font-bold text-slate-700">Selección de Criterios Globales</h4>}
            <LinkedCriteriaSelector
                key={assignmentToEdit?.id ?? 'new'}
                linkedCriteria={linkedCriteria}
                onChange={setLinkedCriteria}
                criteria={criteria}
                specificCompetences={specificCompetences}
                keyCompetences={keyCompetences}
                initialVista={(assignmentToEdit?.linkedCriteria?.length ?? 0) > 0 ? 'ponderar' : 'seleccionar'}
            />
        </div>
        )}

        {evaluationMethod === 'direct_grade' && !showCriteriaSection && (
            <div className="text-sm text-center italic py-4 bg-blue-50 text-blue-800 rounded-lg">
                La nota de esta tarea se aplicará a todos los criterios de las tareas recuperadas.
            </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
        )}

        <div className="flex justify-end pt-4 space-x-2 border-t mt-6">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar Tarea'}</Button>
        </div>
      </form>
    </Modal>
  );
};


interface RecoverySettingsProps {
    allAssignments: Assignment[];
    allCategories: Category[];
    currentAssignmentId?: string;
    evaluationPeriodId: string;
    selectedIds: string[];
    setSelectedIds: (ids: string[]) => void;
}

const RecoverySettings: React.FC<RecoverySettingsProps> = ({ allAssignments, allCategories, currentAssignmentId, evaluationPeriodId, selectedIds, setSelectedIds }) => {
    
    const assignmentsToRecover = useMemo(() => {
        const recoveryCategoryIds = new Set(allCategories.filter(c => c.type === 'recovery').map(c => c.id));
        return allAssignments.filter(a =>
            a.evaluationPeriodId === evaluationPeriodId &&
            !recoveryCategoryIds.has(a.categoryId) &&
            a.id !== currentAssignmentId
        );
    }, [allAssignments, allCategories, currentAssignmentId, evaluationPeriodId]);

    // FIX: Explicitly typed the return value of useMemo to resolve type inference issues.
    const assignmentsGroupedByCategory = useMemo<Record<string, Assignment[]>>(() => {
        const groups: Record<string, Assignment[]> = {};
        for (const assignment of assignmentsToRecover) {
            if (!groups[assignment.categoryId]) {
                groups[assignment.categoryId] = [];
            }
            groups[assignment.categoryId].push(assignment);
        }
        return groups;
    }, [assignmentsToRecover]);

    const handleToggle = (assignmentId: string, checked: boolean) => {
        const newSet = new Set(selectedIds);
        if (checked) newSet.add(assignmentId);
        else newSet.delete(assignmentId);
        setSelectedIds(Array.from(newSet));
    };

    const handleSelectCategory = (categoryId: string, checked: boolean) => {
        const newSet = new Set(selectedIds);
        const assignmentIdsInCategory = assignmentsGroupedByCategory[categoryId]?.map(a => a.id) || [];
        if (checked) {
            assignmentIdsInCategory.forEach(id => newSet.add(id));
        } else {
            assignmentIdsInCategory.forEach(id => newSet.delete(id));
        }
        setSelectedIds(Array.from(newSet));
    };

    return (
        <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
            <h4 className="text-sm font-bold text-blue-800 mb-2">Opciones de Recuperación</h4>
            <p className="text-xs text-blue-700 mb-3">Selecciona las tareas que se recuperan con esta actividad. Las notas de los criterios de las tareas seleccionadas serán reemplazadas por las obtenidas aquí.</p>

            <div className="max-h-48 overflow-y-auto space-y-3 pr-2">
                {Object.keys(assignmentsGroupedByCategory).map((categoryId) => {
                    const assignments = assignmentsGroupedByCategory[categoryId];
                    const category = allCategories.find(c => c.id === categoryId);
                    if (!category) return null;
                    
                    const allInCategorySelected = assignments.every(a => selectedIds.includes(a.id));

                    return (
                        <div key={categoryId}>
                            <label className="flex items-center space-x-2 p-2 bg-blue-100 rounded-t-md border-b border-blue-200">
                                <input
                                    type="checkbox"
                                    checked={allInCategorySelected}
                                    onChange={e => handleSelectCategory(categoryId, e.target.checked)}
                                    className={checkboxClassName}
                                />
                                <span className="font-semibold text-sm text-blue-900">Recuperar toda la categoría: {category.name}</span>
                            </label>
                            <div className="bg-white p-2 rounded-b-md">
                                {assignments.map(a => (
                                    <label key={a.id} className="flex items-center space-x-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(a.id)}
                                            onChange={e => handleToggle(a.id, e.target.checked)}
                                            className={checkboxClassName}
                                        />
                                        <span className="text-sm text-slate-700">{a.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


export default AssignmentModal;
