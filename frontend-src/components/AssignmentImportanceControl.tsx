import React from 'react';
import type { ImportanciaActividad } from '../types';
import Input from './Input';
import Select from './Select';
import { IMPORTANCE_FACTORS } from '../services/gradeCalculations';
import { linkClassName } from '../theme/components/Link';

const LABELS: Record<ImportanciaActividad, string> = { muy_baja: 'Muy baja', baja: 'Baja', normal: 'Normal', alta: 'Alta', muy_alta: 'Muy alta' };
interface Props {
  id: string;
  label?: string;
  importance: ImportanciaActividad;
  advanced: boolean;
  custom: string;
  onImportanceChange: (value: ImportanciaActividad) => void;
  onAdvancedChange: (value: boolean) => void;
  onCustomChange: (value: string) => void;
}
export default function AssignmentImportanceControl({ id, label = 'Importancia (evaluación por criterios)', importance, advanced, custom, onImportanceChange, onAdvancedChange, onCustomChange }: Props) {
  return <div>
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      <button type="button" className={`text-xs font-semibold ${linkClassName}`} onClick={() => {
        if (!advanced) onCustomChange(String(IMPORTANCE_FACTORS[importance]));
        onAdvancedChange(!advanced);
      }}>{advanced ? 'Usar niveles' : 'Modo avanzado'}</button>
    </div>
    {advanced ? <Input id={id} type="number" step="0.1" min="0" value={custom} onChange={e => onCustomChange(e.target.value)} placeholder="Factor (ej. 1.25)" className="mt-1" /> :
      <Select id={id} value={importance} onChange={e => onImportanceChange(e.target.value as ImportanciaActividad)} className="mt-1">
        {(Object.keys(LABELS) as ImportanciaActividad[]).map(key => <option key={key} value={key}>{LABELS[key]}</option>)}
      </Select>}
    <p className="mt-1 text-xs text-slate-400">Cuánto cuenta como evidencia de sus criterios frente a otras tareas o grupos.</p>
  </div>;
}
