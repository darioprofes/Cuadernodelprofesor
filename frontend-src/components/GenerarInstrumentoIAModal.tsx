
import React, { useEffect, useRef, useState } from 'react';
import type { EvaluationTool } from '../types';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Textarea from './Textarea';
import { ArrowUpTrayIcon, ClipboardDocumentIcon, ExclamationTriangleIcon } from './Icons';
import { useIaLocalDisponible } from '../hooks/useIaLocalDisponible';
import { useGroqDisponible } from '../hooks/useGroqDisponible';
import { generarInstrumentoConGroq, generarInstrumentoConIA, generarPromptInstrumento, validarRespuestaInstrumento } from '../services/generarInstrumentoIA';
import { isTauri } from '@tauri-apps/api/core';

interface GenerarInstrumentoIAModalProps {
    isOpen: boolean;
    onClose: () => void;
    courseId: string;
    // Criterios del elemento concreto que se está evaluando (producto,
    // examen o actividad) -- no todos los de la SA, mismo criterio ya
    // usado en la importación al cuaderno de notas (Fase 7).
    linkedCriteriaIds: string[];
    contexto?: string;
    // Prellena "Contenido visto en clase" cuando ya se conoce (p.ej. el
    // wizard de Situación de Aprendizaje ya tiene el documento/descripción
    // de esa SA) -- evita pedirlo dos veces. Editable igualmente.
    documentoClaseInicial?: string;
    onDraftReady: (draft: EvaluationTool) => void;
}

type ToolType = 'checklist' | 'rating_scale' | 'rubric' | 'criterial_exam';
type Via = 'local' | 'groq' | 'online';

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

// Tres vías para lo mismo. Groq es la que arranca por defecto -- rápida
// (segundos) y gratuita/casi gratuita, con retención cero activada en el
// panel de Groq. IA local (llama directo al ia-server, sin copiar/pegar)
// queda como alternativa si Groq no está configurado o falla. IA online
// (mismo prompt, pero para copiar y pegar en cualquier IA online -- mismo
// patrón que el generador de Situación de Aprendizaje) es la de última
// instancia, para cuando ni Groq ni el ia-server responden. En las tres,
// el resultado se entrega como borrador para revisar en el mismo
// formulario de edición de instrumentos que ya existe, nunca se guarda a
// ciegas.
const GenerarInstrumentoIAModal: React.FC<GenerarInstrumentoIAModalProps> = ({
    isOpen, onClose, courseId, linkedCriteriaIds, contexto, documentoClaseInicial, onDraftReady,
}) => {
    // En escritorio no hay backend Python al que llamar para Groq/IA local
    // (ver project_tauri_ia_scope.md) -- solo se ofrece la vía "online"
    // (copiar/pegar), sin selector visible ya que no hay entre qué elegir.
    const [via, setVia] = useState<Via>(isTauri() ? 'online' : 'groq');
    const [tipo, setTipo] = useState<ToolType>('rubric');
    const [numNiveles, setNumNiveles] = useState(4);
    // Editable, no solo un valor de solo lectura -- cuando no hay criterios
    // preelegidos (linkedCriteriaIds vacío) este texto es lo ÚNICO de lo que
    // parte la IA para proponerlos ella misma de todo el curso, así que
    // tiene que poder escribirse aquí mismo, no solo heredarse.
    const [contextoEditable, setContextoEditable] = useState(contexto || '');
    const [documentoClase, setDocumentoClase] = useState(documentoClaseInicial || '');
    const [subiendoDocumento, setSubiendoDocumento] = useState(false);
    const [avisoExtraccion, setAvisoExtraccion] = useState<string | null>(null);
    const [generando, setGenerando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [promptGenerado, setPromptGenerado] = useState<string | null>(null);
    const [respuestaPegada, setRespuestaPegada] = useState('');
    const [procesandoRespuesta, setProcesandoRespuesta] = useState(false);
    const iaLocalDisponible = useIaLocalDisponible();
    const groqDisponible = useGroqDisponible();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const tipoInfo = TIPOS.find(t => t.value === tipo)!;
    // Sin criterios preelegidos, la IA los propone ella misma de todo el
    // curso -- pero necesita AL MENOS una descripción de qué evaluar (o el
    // contenido de clase) para partir de algo, ver instrumento_evaluacion.py.
    const sinInsumos = linkedCriteriaIds.length === 0 && !contextoEditable.trim() && !documentoClase.trim();

    const reset = () => {
        setVia(isTauri() ? 'online' : 'groq');
        setTipo('rubric');
        setNumNiveles(4);
        setContextoEditable(contexto || '');
        setDocumentoClase(documentoClaseInicial || '');
        setAvisoExtraccion(null);
        setError(null);
        setPromptGenerado(null);
        setRespuestaPegada('');
    };

    // El elemento <GenerarInstrumentoIAModal> de los componentes que lo abren
    // (EvaluationToolManager.tsx, ProgrammingManager.tsx) NUNCA se desmonta
    // entre dos usos (solo cambia `isOpen`) -- sin este efecto, `contexto`/
    // `documentoClaseInicial` solo se leían una vez, en el useState inicial
    // de arriba, así que la SEGUNDA vez que se abría este modal (para otra
    // actividad/producto/examen) seguía mostrando la aportación de la
    // PRIMERA vez, no la nueva -- confirmado en real (2026-09-04): el
    // profesor describía qué evaluar, generaba un instrumento, y al volver
    // a abrir el modal para otro seguía viendo el texto anterior.
    useEffect(() => {
        if (isOpen) reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleSubirDocumento = async (file: File) => {
        setSubiendoDocumento(true);
        setAvisoExtraccion(null);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('archivo', file);
            const response = await fetch('/api/prompts/extraer-documento', { method: 'POST', body: formData });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const data: { texto: string; aviso: string | null } = await response.json();
            setDocumentoClase(data.texto);
            setAvisoExtraccion(data.aviso);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSubiendoDocumento(false);
        }
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
                contexto: contextoEditable.trim() || undefined,
                numNiveles: tipoInfo.necesitaNiveles ? numNiveles : undefined,
                documento: documentoClase.trim() || undefined,
            });
            entregarResultado(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerando(false);
        }
    };

    const handleGenerarGroq = async () => {
        setGenerando(true);
        setError(null);
        try {
            const data = await generarInstrumentoConGroq({
                courseId,
                criterionIds: linkedCriteriaIds,
                toolType: tipo,
                contexto: contextoEditable.trim() || undefined,
                numNiveles: tipoInfo.necesitaNiveles ? numNiveles : undefined,
                documento: documentoClase.trim() || undefined,
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
                contexto: contextoEditable.trim() || undefined,
                numNiveles: tipoInfo.necesitaNiveles ? numNiveles : undefined,
                documento: documentoClase.trim() || undefined,
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

    const bloqueado = sinInsumos || (via === 'local' && !iaLocalDisponible) || (via === 'groq' && !groqDisponible);

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Generar instrumento con IA" size="lg">
            <div className="flex flex-col gap-4">
                {sinInsumos && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        Este elemento todavía no tiene criterios de evaluación vinculados -- vincula al menos uno,
                        o describe abajo qué quieres evaluar para que la IA los proponga ella misma.
                    </p>
                )}
                <>
                        {!isTauri() && (
                        <div className="flex gap-1.5">
                            <button
                                type="button"
                                onClick={() => { setVia('groq'); setPromptGenerado(null); }}
                                className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${via === 'groq' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                            >
                                Groq (rápido)
                            </button>
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
                                IA online (última opción)
                            </button>
                        </div>
                        )}

                        {via === 'local' && !iaLocalDisponible && (
                            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                El servidor de IA local no está disponible ahora mismo -- usa Groq, la IA online, o
                                inténtalo de nuevo en unos minutos.
                            </p>
                        )}

                        {via === 'groq' && !groqDisponible && (
                            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                Groq no está configurado en el servidor todavía -- usa la IA local o la IA online.
                            </p>
                        )}

                        {promptGenerado === null && (
                            <>
                                <div>
                                    <p className="text-sm font-semibold text-slate-700 mb-1.5">
                                        ¿Qué quieres evaluar?
                                        {linkedCriteriaIds.length === 0 && <span className="text-amber-600"> (obligatorio -- sin criterios vinculados, la IA los propone a partir de esto)</span>}
                                        {linkedCriteriaIds.length > 0 && <span className="text-slate-400 font-normal"> (opcional)</span>}
                                    </p>
                                    <Textarea
                                        value={contextoEditable}
                                        onChange={e => setContextoEditable(e.target.value)}
                                        rows={3}
                                        placeholder="P.ej. un examen con las siguientes preguntas: ..."
                                        className="text-sm"
                                    />
                                </div>

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

                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-sm font-semibold text-slate-700">Contenido visto en clase (opcional)</p>
                                        {!isTauri() && (
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
                                            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={subiendoDocumento}>
                                                <ArrowUpTrayIcon className="w-4 h-4" />
                                                {subiendoDocumento ? 'Extrayendo...' : 'Subir documento'}
                                            </Button>
                                        </div>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 mb-1.5">
                                        Sin esto, la IA solo tiene la descripción abstracta de cada criterio -- con
                                        el contenido real, las preguntas/ítems se ajustan a lo que de verdad se ha
                                        trabajado en clase.
                                    </p>
                                    {avisoExtraccion && (
                                        <p className="text-sm text-amber-700 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-1.5">
                                            <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                            {avisoExtraccion}
                                        </p>
                                    )}
                                    <Textarea
                                        value={documentoClase}
                                        onChange={e => setDocumentoClase(e.target.value)}
                                        rows={5}
                                        placeholder="...o pega aquí el texto de lo visto en clase (apuntes, resumen...)"
                                        className="text-sm"
                                    />
                                </div>

                                <p className="text-xs text-slate-500">
                                    {linkedCriteriaIds.length > 0
                                        ? `Se generará a partir de ${linkedCriteriaIds.length} criterio(s) de evaluación vinculado(s) a este elemento.`
                                        : 'La IA elegirá los criterios de evaluación de todo el curso que encajen con lo descrito arriba.'}
                                    {' '}El resultado se abre para revisar y editar antes de guardar.
                                    {via === 'local' && ' Puede tardar cerca de un minuto.'}
                                    {via === 'groq' && ' Suele tardar solo unos segundos.'}
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
                    {via === 'groq' && (
                        <Button type="button" onClick={handleGenerarGroq} disabled={bloqueado || generando}>
                            {generando ? 'Generando...' : 'Generar'}
                        </Button>
                    )}
                    {via === 'online' && promptGenerado === null && (
                        <Button type="button" onClick={handleGenerarPromptOnline} disabled={sinInsumos || generando}>
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
