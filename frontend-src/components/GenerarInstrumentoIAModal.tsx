
import React, { useState } from 'react';
import type { EvaluationTool } from '../types';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { useIaLocalDisponible } from '../hooks/useIaLocalDisponible';

interface GenerarInstrumentoIAModalProps {
    isOpen: boolean;
    onClose: () => void;
    courseId: string;
    // Criterios del elemento concreto que se está evaluando (producto,
    // examen o actividad) -- no todos los de la SA, mismo criterio ya
    // usado en la importación al cuaderno de notas (Fase 7).
    linkedCriteriaIds: string[];
    contexto?: string;
    onDraftReady: (draft: EvaluationTool) => void;
}

type ToolType = 'checklist' | 'rating_scale' | 'rubric' | 'criterial_exam';

const TIPOS: { value: ToolType; label: string; necesitaNiveles: boolean }[] = [
    { value: 'rubric', label: 'Rúbrica', necesitaNiveles: true },
    { value: 'rating_scale', label: 'Escala de valoración', necesitaNiveles: true },
    { value: 'checklist', label: 'Lista de cotejo', necesitaNiveles: false },
    { value: 'criterial_exam', label: 'Examen criterial', necesitaNiveles: false },
];

// A diferencia del resto de generadores, este llama directo al ia-server
// (sin paso de copiar/pegar en una IA online) -- los criterios de
// evaluación no son un dato personal que proteger. El resultado se
// entrega como borrador para revisar en el mismo formulario de edición de
// instrumentos que ya existe, nunca se guarda a ciegas.
const GenerarInstrumentoIAModal: React.FC<GenerarInstrumentoIAModalProps> = ({
    isOpen, onClose, courseId, linkedCriteriaIds, contexto, onDraftReady,
}) => {
    const [tipo, setTipo] = useState<ToolType>('rubric');
    const [numNiveles, setNumNiveles] = useState(4);
    const [generando, setGenerando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const iaLocalDisponible = useIaLocalDisponible();

    const tipoInfo = TIPOS.find(t => t.value === tipo)!;
    const sinCriterios = linkedCriteriaIds.length === 0;

    const reset = () => {
        setTipo('rubric');
        setNumNiveles(4);
        setError(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleGenerar = async () => {
        setGenerando(true);
        setError(null);
        try {
            const response = await fetch('/api/prompts/instrumento-evaluacion/generar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    course_id: courseId,
                    criterion_ids: linkedCriteriaIds,
                    tool_type: tipo,
                    contexto,
                    num_niveles: tipoInfo.necesitaNiveles ? numNiveles : undefined,
                }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const data: { instrumento: Omit<EvaluationTool, 'id'>; codigosDescartados: string[] } = await response.json();

            if (data.codigosDescartados.length > 0) {
                window.alert(
                    `La IA usó ${data.codigosDescartados.length} código(s) de criterio que no existen en este curso ` +
                    `y se han descartado: ${data.codigosDescartados.join(', ')}. Revisa el instrumento antes de guardar.`
                );
            }

            // "draft" -- id de mentira, lo sustituye el backend real al guardar
            // (EvaluationToolEditorModal ya descarta el id del borrador).
            onDraftReady({ ...data.instrumento, id: 'draft' } as EvaluationTool);
            handleClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerando(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Generar instrumento con IA local" size="lg">
            <div className="flex flex-col gap-4">
                {!iaLocalDisponible ? (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        El servidor de IA local no está disponible ahora mismo -- inténtalo de nuevo en unos minutos.
                    </p>
                ) : sinCriterios ? (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        Este elemento todavía no tiene criterios de evaluación vinculados -- vincula al menos uno
                        antes de generar el instrumento.
                    </p>
                ) : (
                    <>
                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Tipo de instrumento</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {TIPOS.map(t => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setTipo(t.value)}
                                        className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${tipo === t.value ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {tipoInfo.necesitaNiveles && (
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-1.5">Número de niveles</p>
                                <div className="w-24"><Input type="number" min={2} max={6} value={numNiveles} onChange={e => setNumNiveles(parseInt(e.target.value, 10) || 2)} /></div>
                            </div>
                        )}

                        <p className="text-xs text-slate-500">
                            Se generará a partir de {linkedCriteriaIds.length} criterio(s) de evaluación vinculado(s)
                            a este elemento. El resultado se abre para revisar y editar antes de guardar. Puede
                            tardar cerca de un minuto.
                        </p>
                    </>
                )}

                {error && (
                    <p className="text-sm text-red-600">{error}</p>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
                    <Button type="button" onClick={handleGenerar} disabled={!iaLocalDisponible || sinCriterios || generando}>
                        {generando ? 'Generando... (puede tardar un poco)' : 'Generar'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default GenerarInstrumentoIAModal;
