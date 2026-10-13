import React, { useState } from 'react';
import type { Assignment, AssignmentGroup, Category } from '../types';
import Modal from './Modal';
import Input from './Input';
import Button from './Button';
import { assignmentGroupOwners, GROUP_COLORS } from '../services/assignmentGroups';
import { getImportanceFactor } from '../services/gradeCalculations';
import { toYYYYMMDD } from '../utils';

export interface GroupSaveData {
  assignment: Omit<Assignment, 'id'> & { id?: string };
  memberWeights: Record<string, number>;
}

interface Props {
  group: Assignment | null;
  category: Category;
  categories: Category[];
  assignments: Assignment[];
  onClose: () => void;
  onSave: (data: GroupSaveData) => Promise<void>;
}

export default function AssignmentGroupModal({ group, category, categories, assignments, onClose, onSave }: Props) {
  const [name, setName] = useState(group?.name ?? '');
  const [categoryId, setCategoryId] = useState(group?.categoryId ?? category.id);
  const [color, setColor] = useState<AssignmentGroup['color']>(group?.assignmentGroup?.color ?? 'violet');
  const [members, setMembers] = useState(new Set(group?.assignmentGroup?.memberIds ?? []));
  const [weights, setWeights] = useState<Record<string, string>>(Object.fromEntries(assignments.map(a => [a.id, String(getImportanceFactor(a))])));
  const [importance, setImportance] = useState(String(group ? getImportanceFactor(group) : 1));
  const [categoryWeight, setCategoryWeight] = useState(group?.pesoEnCategoria == null ? '' : String(group.pesoEnCategoria));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const owners = assignmentGroupOwners(assignments);
  const eligible = assignments.filter(a => !a.assignmentGroup && a.evaluationPeriodId === category.evaluationPeriodId &&
    categories.find(c => c.id === a.categoryId)?.type !== 'recovery' &&
    (!owners.has(a.id) || owners.get(a.id)?.id === group?.id));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!(Number(importance) > 0) || !Number.isFinite(Number(importance)) ||
        [...members].some(id => !(Number(weights[id]) > 0) || !Number.isFinite(Number(weights[id])))) {
      setError('Los pesos y la importancia deben ser números mayores que cero.'); return;
    }
    if (categoryWeight && (!Number.isFinite(Number(categoryWeight)) || Number(categoryWeight) < 0 || Number(categoryWeight) > 100)) {
      setError('El peso en la categoría debe estar entre 0 y 100.'); return;
    }
    setSaving(true); setError('');
    try {
      await onSave({ assignment: {
        ...group, name: name.trim(), categoryId, evaluationPeriodId: category.evaluationPeriodId,
        date: group?.date ?? toYYYYMMDD(new Date()), evaluationMethod: 'direct_grade', linkedCriteria: [],
        importancia: 'normal', importanciaPersonalizada: Number(importance),
        pesoEnCategoria: categoryWeight ? Number(categoryWeight) : undefined,
        assignmentGroup: { memberIds: [...members], color },
      }, memberWeights: Object.fromEntries([...members].map(id => [id, Number(weights[id])])) });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el grupo.'); }
    finally { setSaving(false); }
  };
  return <Modal isOpen onClose={() => { if (!saving) onClose(); }} title={group ? 'Editar grupo de tareas' : 'Añadir grupo de tareas'} size="2xl">
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm">Nombre<Input required value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Categoría<select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="mt-1 w-full rounded border p-2">
          {categories.filter(c => c.evaluationPeriodId === category.evaluationPeriodId && c.type !== 'recovery').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label className="text-sm">Color<select value={color} onChange={e => setColor(e.target.value as AssignmentGroup['color'])} className="mt-1 w-full rounded border p-2">
          {Object.keys(GROUP_COLORS).map(c => <option key={c} value={c}>{{ blue: 'Azul', violet: 'Violeta', emerald: 'Verde', amber: 'Ámbar' }[c]}</option>)}
        </select></label>
        <label className="text-sm">Importancia del grupo<Input type="number" min="0.01" step="any" required value={importance} onChange={e => setImportance(e.target.value)} /></label>
        <label className="text-sm">Peso en categoría (%)<Input type="number" min="0" max="100" step="any" value={categoryWeight} placeholder="Automático" onChange={e => setCategoryWeight(e.target.value)} /></label>
      </div>
      <p className="text-sm text-slate-600">Los criterios se deducen de las tareas. Sus notas se ponderan con el peso interno y el ratio de cada criterio. Solo el grupo cuenta en la evaluación; las notas pendientes no cuentan como cero.</p>
      <div className="max-h-72 overflow-y-auto rounded border divide-y">
        {eligible.map(a => <div key={a.id} className="flex items-center gap-3 p-3">
          <label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={members.has(a.id)} disabled={saving} onChange={e => setMembers(prev => {
            const next = new Set(prev); if (e.target.checked) next.add(a.id); else next.delete(a.id); return next;
          })} />{a.name}</label>
          <label className="flex items-center gap-2 text-xs">Peso interno<Input aria-label={`Peso interno de ${a.name}`} className="w-20" type="number" min="0.01" step="any" disabled={!members.has(a.id) || saving} value={weights[a.id] ?? '1'} onChange={e => setWeights(prev => ({ ...prev, [a.id]: e.target.value }))} /></label>
        </div>)}
        {!eligible.length && <p className="p-3 text-sm text-slate-500">No hay tareas disponibles en esta evaluación. Puedes guardar un grupo vacío y añadirlas después.</p>}
      </div>
      <p className="text-xs text-slate-500">Al incluir tareas de otra categoría se trasladan a la del grupo. Quitar una tarea la devuelve al cómputo individual. El peso interno modifica la importancia habitual de esa tarea.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Guardando…' : 'Guardar grupo'}</Button></div>
    </form>
  </Modal>;
}
