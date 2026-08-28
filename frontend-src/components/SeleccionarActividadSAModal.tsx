
import React, { useMemo, useState } from 'react';
import type { Course, ProgrammingUnit } from '../types';
import Modal from './Modal';
import Button from './Button';
import Select from './Select';
import { listarItemsImportablesSA, type ItemSA } from '../services/programmingUnitShare';

interface SeleccionarActividadSAModalProps {
    isOpen: boolean;
    onClose: () => void;
    programmingUnits: ProgrammingUnit[];
    courses: Course[];
    onSeleccionar: (seleccion: { unit: ProgrammingUnit; item: ItemSA }) => void;
}

// Mismo esqueleto en dos pasos que ImportarDesdeSAModal.tsx (elegir una SA,
// luego un elemento suyo), pero selección única -- un clic entrega el ítem
// directamente, sin checkboxes ni edición de nombre/categoría/peso (eso es
// propio de crear una columna del cuaderno, no de generar un instrumento).
// Lista TODAS las SA de TODAS las materias (a diferencia de
// ImportarDesdeSAModal, que ya vive dentro de una clase/materia concreta) --
// Instrumentos de Evaluación no tiene una materia activa.
const SeleccionarActividadSAModal: React.FC<SeleccionarActividadSAModalProps> = ({
    isOpen, onClose, programmingUnits, courses, onSeleccionar,
}) => {
    const [unitId, setUnitId] = useState('');

    const unit = programmingUnits.find(u => u.id === unitId);
    const items = useMemo(() => (unit ? listarItemsImportablesSA(unit) : []), [unit]);

    const handleClose = () => {
        setUnitId('');
        onClose();
    };

    const handleElegir = (item: ItemSA) => {
        if (!unit) return;
        onSeleccionar({ unit, item });
        setUnitId('');
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Elegir una actividad de una Situación de Aprendizaje" size="2xl">
            <div className="flex flex-col gap-4">
                <div>
                    <label className="text-xs font-medium text-slate-600">Situación de Aprendizaje</label>
                    <Select value={unitId} onChange={e => setUnitId(e.target.value)} className="max-w-md">
                        <option value="">Elige una SA...</option>
                        {programmingUnits.map(u => {
                            const curso = courses.find(c => c.id === u.courseId);
                            return (
                                <option key={u.id} value={u.id}>
                                    {curso ? `${curso.level} - ${curso.subject}: ` : ''}{u.name}
                                </option>
                            );
                        })}
                    </Select>
                </div>

                {unit && items.length === 0 && (
                    <p className="text-sm text-slate-500">
                        Esta SA no tiene actividades, producto ni examen del que generar un instrumento.
                    </p>
                )}

                {unit && items.length > 0 && (
                    <div className="flex flex-col gap-1.5 max-h-[26rem] overflow-y-auto pr-1">
                        {items.map(item => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => handleElegir(item)}
                                className="text-left p-2.5 border rounded-lg bg-white hover:bg-blue-50 hover:border-blue-300 transition-colors"
                            >
                                <span className="text-sm font-medium text-slate-700">{item.label}</span>
                                <span className="block text-xs text-slate-400">
                                    {item.linkedCriteriaIds.length} criterio(s) vinculado(s)
                                    {item.evaluationToolId ? ' -- ya tiene un instrumento enlazado (se sustituirá)' : ''}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
                </div>
            </div>
        </Modal>
    );
};

export default SeleccionarActividadSAModal;
