import React from 'react';
import type { Course, EvaluationTool } from '../types';
import Modal from './Modal';
import Button from './Button';

interface SeleccionarInstrumentoModalProps {
    isOpen: boolean;
    onClose: () => void;
    evaluationTools: EvaluationTool[];
    courses: Course[];
    onSeleccionar: (tool: EvaluationTool) => void;
}

const ETIQUETA_TIPO: Record<EvaluationTool['type'], string> = {
    checklist: 'Lista de cotejo',
    rating_scale: 'Escala de valoración',
    rubric: 'Rúbrica',
    criterial_exam: 'Examen criterial',
};

// Selector mínimo (lista + un clic), a diferencia de SeleccionarActividadSAModal
// (dos pasos: elegir SA y luego un elemento suyo) -- un instrumento ya es la
// unidad completa, no hace falta elegir "qué parte" de él.
const SeleccionarInstrumentoModal: React.FC<SeleccionarInstrumentoModalProps> = ({
    isOpen, onClose, evaluationTools, courses, onSeleccionar,
}) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Elegir un instrumento de evaluación" size="lg">
        <div className="flex flex-col gap-4">
            {evaluationTools.length === 0 ? (
                <p className="text-sm text-slate-500">Todavía no hay ningún instrumento de evaluación creado.</p>
            ) : (
                <div className="flex flex-col gap-1.5 max-h-[26rem] overflow-y-auto pr-1">
                    {evaluationTools.map(tool => {
                        const curso = courses.find(c => c.id === tool.courseId);
                        return (
                            <button
                                key={tool.id}
                                type="button"
                                onClick={() => onSeleccionar(tool)}
                                className="text-left p-2.5 border rounded-lg bg-white hover:bg-blue-50 hover:border-blue-300 transition-colors"
                            >
                                <span className="text-sm font-medium text-slate-700">{tool.name}</span>
                                <span className="block text-xs text-slate-400">
                                    {ETIQUETA_TIPO[tool.type]}{curso ? ` · ${curso.level} - ${curso.subject}` : ''}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            </div>
        </div>
    </Modal>
);

export default SeleccionarInstrumentoModal;
