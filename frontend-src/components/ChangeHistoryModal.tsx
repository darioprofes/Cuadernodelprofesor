import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from './Modal';
import Button from './Button';
import { api } from '../services/api';
import type { ClassData, EvaluationCriterion } from '../types';
import { getNombreCompleto } from '../utils';

interface Entry { id: string; createdAt: string; undoneAt: string | null; changeCount: number; label: string }
interface Change { table: string; label: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
interface Preview { id: string; canRestore: boolean; reason: string | null; changes: Change[] }
const names: Record<string, string> = { assignments: 'Tarea / grupo', grades: 'Nota', categories: 'Categoría', evaluation_tools: 'Instrumento', evaluation_criteria: 'Criterio', courses: 'Materia', linked_criteria: 'Criterios vinculados', tool_results: 'Notas por criterio / respuestas', direct_score: 'Nota directa', direct_score_raw: 'Puntos originales', recovery_score: 'Recuperación', name: 'Nombre', weight: 'Peso', importancia: 'Importancia', importancia_personalizada: 'Peso personalizado', assignment_group: 'Tareas del grupo', exclude_from_weighting: 'Excluido de ponderación', peso_criterios_manual: 'Pesos manuales', items: 'Preguntas / ítems', levels: 'Niveles', peso_en_categoria: 'Peso en categoría' };
const hidden = new Set(['id', 'created_at', 'updated_at', 'enrollment_id', 'assignment_id', 'class_id', 'course_id']);

export default function ChangeHistoryModal({ classData, criteria, onClose }: { classData: ClassData; criteria: EvaluationCriterion[]; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [restored, setRestored] = useState(false);
  const client = useQueryClient();
  const list = useQuery({ queryKey: ['changeHistory', classData.id, page], queryFn: () => api.get<Entry[]>(`/classes/${classData.id}/history?page=${page}`), staleTime: 0 });
  const preview = useQuery({ queryKey: ['changeHistoryPreview', selected], queryFn: () => api.get<Preview>(`/history/${selected}`), enabled: !!selected, staleTime: 0 });
  const restore = useMutation({ mutationFn: () => api.post(`/history/${selected}/restore`, {}), onSuccess: async () => { setRestored(true); setSelected(null); await client.invalidateQueries(); } });
  const describe = (value: unknown): string => {
    if (value == null) return 'Sin valor';
    if (typeof value === 'string') {
      const criterion = criteria.find(c => c.id === value);
      if (criterion) return `Criterio ${criterion.code}`;
      if (value.startsWith('{') || value.startsWith('[')) { try { return describe(JSON.parse(value)); } catch { /* Plain text. */ } }
      return value;
    }
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (Array.isArray(value)) return value.map(describe).join('\n');
    if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${criteria.find(c => c.id === k)?.code ?? names[k] ?? k}: ${describe(v)}`).join('\n');
    return String(value);
  };
  const error = list.error ?? preview.error ?? restore.error;
  return <Modal isOpen onClose={onClose} title="Historial y papelera del cuaderno" size="4xl">
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Recupera notas, tareas borradas y cambios de criterios, instrumentos o pesos. El historial empieza al instalar esta función. Solo se restaura el cambio seleccionado y sus datos asociados.</p>
      {error && <p role="alert" className="text-red-700">{error.message}</p>}
      {restored && <p role="status" className="text-emerald-700">Cambio restaurado. El cuaderno se ha actualizado.</p>}
      {selected ? <>
        <Button variant="secondary" disabled={restore.isPending} onClick={() => { setSelected(null); restore.reset(); }}>Volver al historial</Button>
        {preview.isPending && <p>Cargando vista previa…</p>}
        {preview.data && <>
          <h4 className="font-semibold">Vista previa: estado que se recuperará</h4>
          {preview.data.changes.some(c => ['courses', 'evaluation_criteria', 'evaluation_tools'].includes(c.table)) && <p className="text-sm text-amber-800">La configuración de una materia o instrumento compartido puede afectar también a otras clases que lo utilicen.</p>}
          {!preview.data.canRestore && <p className="text-amber-800">{preview.data.reason}</p>}
          {preview.data.changes.map((change, i) => {
            const student = classData.students.find(s => s.enrollmentId === (change.before ?? change.after)?.enrollment_id);
            const fields = [...new Set([...Object.keys(change.before ?? {}), ...Object.keys(change.after ?? {})])].filter(k => !hidden.has(k) && JSON.stringify(change.before?.[k]) !== JSON.stringify(change.after?.[k]));
            return <section key={i} className="border rounded-lg p-3 space-y-2">
              <h5 className="font-semibold">{names[change.table] ?? change.table}: {change.label}{student ? ` · ${getNombreCompleto(student)}` : ''}</h5>
              <p className="text-xs text-slate-500">{!change.after ? 'Se recuperará el elemento eliminado.' : !change.before ? 'Se eliminará esta nota introducida.' : 'Se recuperarán los valores anteriores.'}</p>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left p-2">Dato</th><th className="text-left p-2">Ahora</th><th className="text-left p-2">Después de restaurar</th></tr></thead><tbody>{fields.map(k => <tr key={k} className="border-t"><td className="p-2 align-top">{names[k] ?? k}</td><td className="p-2 align-top whitespace-pre-wrap break-words max-w-72">{describe(change.after?.[k])}</td><td className="p-2 align-top whitespace-pre-wrap break-words max-w-72">{describe(change.before?.[k])}</td></tr>)}</tbody></table></div>
            </section>;
          })}
          <Button disabled={!preview.data.canRestore || restore.isPending} onClick={() => restore.mutate()}>{restore.isPending ? 'Restaurando…' : 'Restaurar este cambio'}</Button>
        </>}
      </> : <>
        {list.isPending && <p>Cargando historial…</p>}
        {list.data?.length === 0 && <p>No hay cambios registrados en esta página.</p>}
        <ul className="divide-y">{list.data?.map(entry => <li key={entry.id}><button className="w-full text-left p-3 hover:bg-slate-50 disabled:opacity-60" disabled={!!entry.undoneAt} onClick={() => { setSelected(entry.id); setRestored(false); restore.reset(); }}><span className="block font-medium">{entry.label}</span><span className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString('es')} · {entry.changeCount} registros{entry.undoneAt ? ' · Deshecho' : ' · Ver y restaurar'}</span></button></li>)}</ul>
        <div className="flex gap-2"><Button variant="secondary" disabled={page === 0 || list.isFetching} onClick={() => setPage(p => p - 1)}>Más recientes</Button><Button variant="secondary" disabled={(list.data?.length ?? 0) < 200 || list.isFetching} onClick={() => setPage(p => p + 1)}>Más antiguos</Button></div>
      </>}
    </div>
  </Modal>;
}
