
import React, { useState } from 'react';
import type { EvaluationTool } from '../types';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Textarea from './Textarea';
import { ClipboardDocumentIcon } from './Icons';
import { useIaLocalDisponible } from '../hooks/useIaLocalDisponible';
import { generarInstrumentoConIA, generarPromptInstrumento, validarRespuestaInstrumento } from '../services/generarInstrumentoIA';

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
type Via = 'local' | 'online';

const TIPOS: { value: ToolType; label: string; necesitaNiveles: boolean }[] = [
    { value: 'rubric', label: 'Rúbrica', necesitaNiveles: true },
    { value: 'rating_scale', label: 'Escala de valoración', necesitaNiveles: true },
    { value: 'checklist', label: 'Lista de cotejo', necesitaNiveles: false },
    { value: 'criterial_exam', label: 'Examen criterial', necesitaNiveles: false },
];

const CopyButton: React.FC<{ texto: string }> = ({ texto }) => {
    const [copiado, setCopiado] = useState(false);
    const copiar = async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
    };
    return (
        <Button type="button" variant="secondary" onClick={copiar}>
            <ClipboardDocumentIcon className="w-4 h-4" />
            {copiado ? 'Copiado' : 'Copiar'}
        </Button>
    );
};

// Dos vías para lo mismo: IA local (llama directo al ia-server, sin
// copiar/pegar -- los criterios de evaluación no son un dato personal que
// proteger) o IA online (mismo prompt, pero para copiar y pegar en
// cualquier IA online, por si la local va lenta o no está disponible --
// mismo patrón ya usado en el generador de Situación de Aprendizaje). En
// ambas, el resultado se entrega como borrador para revisar en el mismo
// formulario de edición de instrumentos que ya existe, nunca se guarda a
// ciegas.
const GenerarInstrumentoIAModal: React.FC<GenerarInstrumentoIAModalProps> = ({
    isOpen, onClose, courseId, linkedCriteriaIds, contexto, onDraftReady,
}) => {
    const [via, setVia] = useState<Via>('local');
    const [tipo, setTipo] = useState<ToolType>('rubric');
    const [numNiveles, setNumNiveles] = useState(4);
    const [generando, setGenerando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [promptGenerado, setPromptGenerado] = useState<string | null>(null);
    const [respuestaPegada, setRespuestaPegada] = useState('');
    const [procesandoRespuesta, setProcesandoRespuesta] = useState(false);
    const iaLocalDisponible = useIaLocalDisponible();

    const tipoInfo = TIPOS.find(t => t.value === tipo)!;
    const sinCriterios = linkedCriteriaIds.length === 0;

    const reset = () => {
        setVia('local');
        setTipo('rubric');
        setNumNiveles(4);
        setError(null);
        setPromptGenerado(null);
        setRespuestaPegada('');
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const entregarResultado = (data: { instrumento: Omit<EvaluationTool, 'id'>; codigosDescartados: string[] }) => {
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
    };

    const handleGenerarLocal = async () => {
        setGenerando(true);
        setError(null);
        try {
            const data = await generarInstrumentoConIA({
                courseId,
                criterionIds: linkedCriteriaIds,
                toolType: tipo,
                contexto,
                numNiveles: tipoInfo.necesitaNiveles ? numNiveles : undefined,
            });
            entregarResultado(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerando(false);
        }
    };

    const handleGenerarPromptOnline = async () => {
        setGenerando(true);
        setError(null);
        try {
            const prompt = await generarPromptInstrumento({
                courseId,
                criterionIds: linkedCriteriaIds,
                toolType: tipo,
                contexto,
                numNiveles: tipoInfo.necesitaNiveles ? numNiveles : undefined,
            });
            setPromptGenerado(prompt);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerando(false);
        }
    };

    const handleProcesarRespuestaOnline = async () => {
        setProcesandoRespuesta(true);
        setError(null);
        try {
            const data = await validarRespuestaInstrumento(courseId, tipo, respuestaPegada);
            entregarResultado(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setProcesandoRespuesta(false);
        }
    };

    const bloqueado = sinCriterios || (via === 'local' && !iaLocalDisponible);

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Generar instrumento con IA" size="lg">
            <div className="flex flex-col gap-4">
                {sinCriterios ? (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        Este elemento todavía no tiene criterios de evaluación vinculados -- vincula al menos uno
                        antes de generar el instrumento.
                    </p>
                ) : (
                    <>
                        <div className="flex gap-1.5">
                            <button
                                type="button"
                                onClick={() => { setVia('local'); setPromptGenerado(null); }}
                                className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${via === 'local' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                            >
                                IA local
                            </button>
                            <button
                                type="button"
                                onClick={() => { setVia('online'); setPromptGenerado(null); }}
                                className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${via === 'online' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                            >
                                IA online (copiar/pegar)
                            </button>
                        </div>

                        {via === 'local' && !iaLocalDisponible && (
                            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                El servidor de IA local no está disponible ahora mismo -- usa la IA online o
                                inténtalo de nuevo en unos minutos.
                            </p>
                        )}

                        {promptGenerado === null && (
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
                                    a este elemento. El resultado se abre para revisar y editar antes de guardar.
                                    {via === 'local' && ' Puede tardar cerca de un minuto.'}
                                </p>
                            </>
                        )}

                        {via === 'online' && promptGenerado !== null && (
                            <>
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-sm font-semibold text-slate-700">1. Copia el prompt y pégalo en tu IA online</p>
                                        <CopyButton texto={promptGenerado} />
                                    </div>
                                    <Textarea value={promptGenerado} readOnly rows={8} className="text-xs font-mono bg-slate-50" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-700 mb-1.5">2. Pega aquí la respuesta (JSON) de la IA</p>
                                    <Textarea
                                        value={respuestaPegada}
                                        onChange={e => setRespuestaPegada(e.target.value)}
                                        rows={8}
                                        placeholder="Pega aquí la respuesta de la IA..."
                                        className="text-xs font-mono"
                                    />
                                </div>
                            </>
                        )}
                    </>
                )}

                {error && (
                    <p className="text-sm text-red-600">{error}</p>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
                    {via === 'local' && (
                        <Button type="button" onClick={handleGenerarLocal} disabled={bloqueado || generando}>
                            {generando ? 'Generando... (puede tardar un poco)' : 'Generar'}
                        </Button>
                    )}
                    {via === 'online' && promptGenerado === null && (
                        <Button type="button" onClick={handleGenerarPromptOnline} disabled={sinCriterios || generando}>
                            {generando ? 'Generando prompt...' : 'Generar prompt'}
                        </Button>
                    )}
                    {via === 'online' && promptGenerado !== null && (
                        <Button type="button" onClick={handleProcesarRespuestaOnline} disabled={!respuestaPegada.trim() || procesandoRespuesta}>
                            {procesandoRespuesta ? 'Procesando...' : 'Procesar respuesta'}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default GenerarInstrumentoIAModal;
