import React, { useRef, useState } from 'react';
import type { ProgrammingUnit } from '../types';
import Modal from './Modal';
import Button from './Button';
import Textarea from './Textarea';
import { ArrowUpTrayIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, SparklesIcon } from './Icons';

type Paso = 1 | 2 | 3;

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

interface GenerarUnidadIAModalProps {
    isOpen: boolean;
    courseId: string;
    onClose: () => void;
    // Al terminar, este modal se cierra y entrega el borrador para que el
    // llamador lo abra en el propio UnitEditor de ProgrammingManager.tsx --
    // no hay formulario de revisión propio aquí, se reutiliza el que ya
    // existe para crear/editar unidades a mano.
    onDraftReady: (draft: ProgrammingUnit) => void;
}

// Genera el prompt (documento de teoría + currículo real del curso) para
// pegar en una IA online, y procesa la respuesta -- pero NO guarda nada
// directamente: entrega un borrador para que se revise en el mismo
// formulario que ya usa la creación manual de unidades.
const GenerarUnidadIAModal: React.FC<GenerarUnidadIAModalProps> = ({ isOpen, courseId, onClose, onDraftReady }) => {
    const [paso, setPaso] = useState<Paso>(1);
    const [documento, setDocumento] = useState('');
    const [subiendoDocumento, setSubiendoDocumento] = useState(false);
    const [avisoExtraccion, setAvisoExtraccion] = useState<string | null>(null);
    const [errorPaso1, setErrorPaso1] = useState<string | null>(null);
    const [generando, setGenerando] = useState(false);
    const [resultado, setResultado] = useState<{ anonimizado: string; mapa: Record<string, string> } | null>(null);
    const [respuestaIA, setRespuestaIA] = useState('');
    const [procesando, setProcesando] = useState(false);
    const [errorPaso3, setErrorPaso3] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setPaso(1);
        setDocumento('');
        setAvisoExtraccion(null);
        setErrorPaso1(null);
        setResultado(null);
        setRespuestaIA('');
        setErrorPaso3(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleSubirDocumento = async (file: File) => {
        setSubiendoDocumento(true);
        setAvisoExtraccion(null);
        setErrorPaso1(null);
        try {
            const formData = new FormData();
            formData.append('archivo', file);
            const response = await fetch('/api/prompts/extraer-documento', { method: 'POST', body: formData });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const data: { texto: string; aviso: string | null } = await response.json();
            setDocumento(data.texto);
            setAvisoExtraccion(data.aviso);
        } catch (err) {
            setErrorPaso1(err instanceof Error ? err.message : String(err));
        } finally {
            setSubiendoDocumento(false);
        }
    };

    const handleGenerarPrompt = async () => {
        setGenerando(true);
        setErrorPaso1(null);
        try {
            const response = await fetch('/api/prompts/unidad-programacion/generar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ course_id: courseId, documento }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const data: { anonimizado: string; mapa: Record<string, string> } = await response.json();
            setResultado(data);
            setPaso(2);
        } catch (err) {
            setErrorPaso1(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerando(false);
        }
    };

    const handleProcesarRespuesta = async () => {
        if (!resultado) return;
        setProcesando(true);
        setErrorPaso3(null);
        try {
            const response = await fetch('/api/prompts/unidad-programacion/validar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ course_id: courseId, respuesta: respuestaIA, mapa: resultado.mapa }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const data: {
                unidad: {
                    name: string;
                    sessions: number;
                    sessionDetails: { description: string }[];
                    linkedBasicKnowledgeIds: string[];
                    linkedCriteriaIds: string[];
                };
                codigosDescartados: string[];
            } = await response.json();

            if (data.codigosDescartados.length > 0) {
                // El profesor revisa el borrador de todas formas en el
                // formulario de siempre -- este aviso es solo para que sepa
                // POR QUÉ algún criterio/saber que esperaba no aparece
                // marcado, no bloquea nada.
                window.alert(
                    `La IA usó ${data.codigosDescartados.length} código(s) que no existen en este curso ` +
                    `y se han descartado: ${data.codigosDescartados.join(', ')}. Revisa la unidad antes de guardar.`
                );
            }

            const draft: ProgrammingUnit = {
                id: 'new',
                courseId,
                name: data.unidad.name,
                sessions: data.unidad.sessions,
                sessionDetails: data.unidad.sessionDetails,
                linkedCriteriaIds: data.unidad.linkedCriteriaIds,
                linkedBasicKnowledgeIds: data.unidad.linkedBasicKnowledgeIds,
                startDate: '',
            };

            handleClose();
            onDraftReady(draft);
        } catch (err) {
            setErrorPaso3(err instanceof Error ? err.message : String(err));
        } finally {
            setProcesando(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Generar unidad con IA" size="3xl" accent="sand">
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <SparklesIcon className="w-4 h-4" />
                    Paso {paso} de 3
                </div>

                {paso === 1 && (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-slate-600">
                            Pega tu material de teoría o sube un .docx, .pptx o .pdf. Se generará un prompt con
                            el documento y el currículo real de este curso, para pegar en una IA online (Claude,
                            ChatGPT...).
                        </p>
                        <div className="flex items-center gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".docx,.pptx,.pdf"
                                className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleSubirDocumento(file);
                                    e.target.value = '';
                                }}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={subiendoDocumento}
                            >
                                <ArrowUpTrayIcon className="w-4 h-4" />
                                {subiendoDocumento ? 'Extrayendo...' : 'Subir documento'}
                            </Button>
                        </div>
                        {avisoExtraccion && (
                            <p className="text-sm text-amber-700 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                {avisoExtraccion}
                            </p>
                        )}
                        <Textarea
                            value={documento}
                            onChange={e => setDocumento(e.target.value)}
                            rows={12}
                            placeholder="...o pega aquí el texto del material de teoría"
                            className="font-mono text-sm"
                        />
                        {errorPaso1 && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {errorPaso1}
                            </p>
                        )}
                        <div className="flex justify-end">
                            <Button type="button" onClick={handleGenerarPrompt} disabled={!documento.trim() || generando}>
                                {generando ? 'Generando...' : 'Generar prompt'}
                            </Button>
                        </div>
                    </div>
                )}

                {paso === 2 && resultado && (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-slate-600">
                            Copia este prompt y pégalo en tu IA online de confianza.
                            {Object.keys(resultado.mapa).length > 0 && (
                                <> Se han anonimizado {Object.keys(resultado.mapa).length} dato(s) personal(es) detectado(s) en el documento.</>
                            )}
                        </p>
                        <Textarea value={resultado.anonimizado} readOnly rows={14} className="font-mono text-sm bg-slate-50" />
                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(1)}>Atrás</Button>
                            <div className="flex gap-2">
                                <CopyButton texto={resultado.anonimizado} />
                                <Button type="button" onClick={() => setPaso(3)}>Siguiente</Button>
                            </div>
                        </div>
                    </div>
                )}

                {paso === 3 && (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-slate-600">
                            Pega aquí la respuesta (JSON) de la IA.
                        </p>
                        <Textarea
                            value={respuestaIA}
                            onChange={e => setRespuestaIA(e.target.value)}
                            rows={14}
                            placeholder="Pega aquí la respuesta de la IA..."
                            className="font-mono text-sm"
                        />
                        {errorPaso3 && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {errorPaso3}
                            </p>
                        )}
                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(2)}>Atrás</Button>
                            <Button type="button" onClick={handleProcesarRespuesta} disabled={!respuestaIA.trim() || procesando}>
                                {procesando ? 'Procesando...' : 'Continuar a revisión'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default GenerarUnidadIAModal;
