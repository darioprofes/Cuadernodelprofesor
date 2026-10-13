import React from 'react';
import Modal from './Modal';
import Button from './Button';
import type { EvidenceExplanation, GradeExplanation } from '../services/gradeExplanation';

const number = (value: number) => value.toLocaleString('es', { maximumFractionDigits: 4 });
const percent = (value: number) => `${(value * 100).toLocaleString('es', { maximumFractionDigits: 2 })} %`;

function Evidence({ items }: { items: EvidenceExplanation[] }) {
  return <ul className="space-y-2">{items.map((item, index) => <li key={index} className="border-l-2 border-slate-200 pl-3 py-1">
    <div className="font-medium text-slate-800">{item.name}</div>
    <div className="text-xs text-slate-500">{item.instrument}</div>
    <p className="text-sm">Nota: <strong>{number(item.score)}</strong> · Peso: {number(item.weight)} · Dentro del cálculo superior: {percent(item.share)} · Peso en esta nota: <strong>{percent(item.finalShare)}</strong></p>
    {!!item.children.length && <details className="mt-1"><summary className="text-sm text-blue-700 cursor-pointer">Ver tareas o ítems ({item.children.length})</summary><Evidence items={item.children} /></details>}
  </li>)}</ul>;
}

export default function GradeExplanationModal({ data, studentName, title, onClose, onEdit }: { data: GradeExplanation; studentName: string; title: string; onClose: () => void; onEdit?: () => void }) {
  return <Modal isOpen onClose={onClose} title="Cómo se calcula esta nota" size="3xl">
    <div className="space-y-4">
      <div className="flex justify-between gap-3"><div><p className="font-semibold">{studentName}</p><p className="text-sm text-slate-600">{title}</p></div><div className="text-3xl font-bold text-blue-800">{data.grade == null ? 'Sin nota' : data.grade.toFixed(2).replace('.', ',')}</div></div>
      <p className="text-sm text-slate-600">{data.note}</p>
      {!!data.criteria.length && <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="text-left font-semibold mb-2">Peso de los criterios en esta nota</caption><thead><tr className="bg-slate-100"><th className="p-2 text-left">Criterio</th><th>Nota</th><th>Peso configurado</th><th>Peso efectivo</th><th>Aporta puntos</th></tr></thead><tbody>{data.criteria.map(c => <tr key={c.id} className="border-b"><td className="p-2">{c.code}</td><td className="text-center">{number(c.score)}</td><td className="text-center">{number(c.weight)}</td><td className="text-center">{percent(c.share)}</td><td className="text-center">{number(c.contribution)}</td></tr>)}</tbody></table></div>}
      {data.criteria.map(c => <section key={c.id} className="rounded-lg border p-3 space-y-2">
        <h3 className="font-semibold">Criterio {c.code} · {number(c.score)} · {percent(c.share)} de la nota</h3>
        <p className="text-xs text-slate-500">{c.description}</p>
        {c.recovery && <p className="text-sm text-emerald-700">La recuperación «{c.recovery}» mejora y sustituye la media anterior.</p>}
        <Evidence items={c.evidence} />
        {!!c.evidence.length && <p className="text-xs text-slate-600">{c.evidence.map(e => `${number(e.score)} × ${percent(e.share)}`).join(' + ')} = {number(c.score)}</p>}
      </section>)}
      {!!data.criteria.length && <p className="font-medium">{data.criteria.map(c => `${number(c.score)} × ${percent(c.share)}`).join(' + ')} = {data.grade == null ? 'Sin nota' : number(data.grade)}</p>}
      {!!data.omitted.length && <p className="text-xs text-slate-500">Sin nota, no participan: {data.omitted.join(', ')}.</p>}
      {!data.criteria.length && <p className="text-sm text-slate-600">Esta nota no tiene un desglose por criterios disponible.</p>}
      <div className="flex justify-end gap-2">{onEdit && <Button onClick={onEdit}>Editar nota</Button>}<Button variant="secondary" onClick={onClose}>Cerrar</Button></div>
    </div>
  </Modal>;
}
