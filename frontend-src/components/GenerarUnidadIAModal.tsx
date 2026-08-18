import React, { useEffect, useRef, useState } from 'react';
import type { ProgrammingUnit } from '../types';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';
import { ArrowUpTrayIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, SparklesIcon } from './Icons';
import { CARACTERISTICAS_HABITUALES } from './ClassModal';
import { useCurrentAcademicYear } from '../hooks/useAcademicYears';
import { useApiClasses, useUpdateClass } from '../hooks/useApiClasses';
import { apiClassToLocal } from '../services/apiAdapters';

type Paso = 1 | 2 | 3 | 4;

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
// Modo A ("documento"): el profesor ya tiene el material, la IA solo lo
// organiza. Modo B ("descripcion"): no hay material escrito todavía, la IA
// redacta el contenido teórico a partir de lo que el profesor describe.
type Modo = 'documento' | 'descripcion';
type SesionesModo = 'fijo' | 'rango' | 'ia';

const GenerarUnidadIAModal: React.FC<GenerarUnidadIAModalProps> = ({ isOpen, courseId, onClose, onDraftReady }) => {
    const [paso, setPaso] = useState<Paso>(1);
    const [modo, setModo] = useState<Modo>('documento');
    const [documento, setDocumento] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [subiendoDocumento, setSubiendoDocumento] = useState(false);
    const [avisoExtraccion, setAvisoExtraccion] = useState<string | null>(null);
    const [errorPaso1, setErrorPaso1] = useState<string | null>(null);
    const [generando, setGenerando] = useState(false);
    const [resultado, setResultado] = useState<{ prompt: string; mapa: Record<string, string> } | null>(null);
    const [respuestaIA, setRespuestaIA] = useState('');
    const [procesando, setProcesando] = useState(false);
    const [errorPaso3, setErrorPaso3] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Bloque 1: Planificación -- número de sesiones y grupo de referencia
    // (para cargar sus características, aunque la SA se guarda a nivel de
    // materia, no de clase).
    const [sesionesModo, setSesionesModo] = useState<SesionesModo>('ia');
    const [sesionesFijo, setSesionesFijo] = useState(6);
    const [sesionesMin, setSesionesMin] = useState(4);
    const [sesionesMax, setSesionesMax] = useState(6);
    const [classId, setClassId] = useState('');
    const [caracteristicasGrupo, setCaracteristicasGrupo] = useState<string[]>([]);

    const currentYear = useCurrentAcademicYear();
    const remoteClasses = useApiClasses(currentYear.data?.id ?? '', { enabled: !!currentYear.data?.id });
    const updateClassMutation = useUpdateClass();
    const clasesDelCurso = (remoteClasses.data ?? []).map(apiClassToLocal).filter(c => c.courseId === courseId);

    useEffect(() => {
        if (!classId && clasesDelCurso.length > 0) setClassId(clasesDelCurso[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clasesDelCurso.length]);

    useEffect(() => {
        const clase = clasesDelCurso.find(c => c.id === classId);
        setCaracteristicasGrupo(clase?.caracteristicasGrupo || []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classId]);

    const toggleCaracteristica = (rasgo: string) => {
        const nuevas = caracteristicasGrupo.includes(rasgo)
            ? caracteristicasGrupo.filter(r => r !== rasgo)
            : [...caracteristicasGrupo, rasgo];
        setCaracteristicasGrupo(nuevas);
        if (classId) updateClassMutation.mutate({ id: classId, yearId: currentYear.data?.id ?? '', data: { caracteristicasGrupo: nuevas } });
    };

    const textoEntrada = modo === 'documento' ? documento : descripcion;

    const reset = () => {
        setPaso(1);
        setModo('documento');
        setDocumento('');
        setDescripcion('');
        setAvisoExtraccion(null);
        setErrorPaso1(null);
        setResultado(null);
        setRespuestaIA('');
        setErrorPaso3(null);
        setSesionesModo('ia');
        setClassId('');
        setCaracteristicasGrupo([]);
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
                body: JSON.stringify({
                    course_id: courseId, documento: textoEntrada, modo,
                    sesiones_modo: sesionesModo,
                    sesiones_fijo: sesionesModo === 'fijo' ? sesionesFijo : undefined,
                    sesiones_min: sesionesModo === 'rango' ? sesionesMin : undefined,
                    sesiones_max: sesionesModo === 'rango' ? sesionesMax : undefined,
                    caracteristicas_grupo: caracteristicasGrupo,
                }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const data: { prompt: string; mapa: Record<string, string> } = await response.json();
            setResultado(data);
            setPaso(3);
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

            // El backend, en esta pasada, sigue devolviendo una descripción
            // plana por sesión -- se envuelve como una única actividad
            // genérica para que encaje en el UnitEditor ya reformado (misma
            // forma que produce la migración 0013 sobre datos antiguos). La
            // reforma del propio generador para pedir actividades
            // estructuradas de verdad es la Fase 3/4 del plan, todavía no
            // hecha.
            const draft: ProgrammingUnit = {
                id: 'new',
                courseId,
                name: data.unidad.name,
                sessions: data.unidad.sessions,
                context: '',
                sessionDetails: data.unidad.sessionDetails.map(s => ({
                    titulo: '',
                    actividades: [{ descripcion: s.description, linkedCriteriaIds: [] }],
                })),
                linkedCriteriaIds: data.unidad.linkedCriteriaIds,
                linkedBasicKnowledgeIds: data.unidad.linkedBasicKnowledgeIds,
                linkedSpecificCompetenceIds: [],
                finalProduct: { incluido: false },
                finalExam: { incluido: false },
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
        <Modal isOpen={isOpen} onClose={handleClose} title="Generar Situación de Aprendizaje con IA" size="3xl" accent="sand">
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <SparklesIcon className="w-4 h-4" />
                    Paso {paso} de 4
                </div>

                {paso === 1 && (
                    <div className="flex flex-col gap-3">
                        <div className="flex gap-1.5">
                            <button
                                type="button"
                                onClick={() => setModo('documento')}
                                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${modo === 'documento' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-100'}`}
                            >
                                Tengo material
                            </button>
                            <button
                                type="button"
                                onClick={() => setModo('descripcion')}
                                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${modo === 'descripcion' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-100'}`}
                            >
                                Quiero que la IA genere los contenidos
                            </button>
                        </div>

                        {modo === 'documento' ? (
                            <>
                                <p className="text-sm text-slate-600">
                                    Pega tu material de teoría o sube un .docx, .pptx o .pdf. Se generará un prompt con
                                    el documento y el currículo real de este curso, para pegar en una IA online (Claude,
                                    ChatGPT...).
                                </p>
                                <p className="text-sm text-amber-700 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    Este documento NO pasa por el Anonimizador (los términos científicos le confundían y
                                    corrompía el propio currículo). Revisa que no mencione a ningún alumno antes de
                                    copiarlo a la IA online.
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
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-slate-600">
                                    Todavía no tienes el material escrito: describe con el mayor detalle posible lo
                                    que quieres trabajar (subapartados, conceptos clave, ejemplos o casos que te
                                    interesen, nivel de profundidad...) y la IA redactará el desarrollo teórico
                                    dentro del currículo real de este curso. Cuanto más detalle des, más se
                                    ajustará el resultado a lo que tenías en mente.
                                </p>
                                <p className="text-sm text-amber-700 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    El contenido teórico lo redacta la IA -- revisa que sea correcto antes de usarlo
                                    en clase, puede cometer errores factuales. (Esto no es un aviso de datos
                                    personales: no describas aquí a ningún alumno concreto de todas formas.)
                                </p>
                                <Textarea
                                    value={descripcion}
                                    onChange={e => setDescripcion(e.target.value)}
                                    rows={12}
                                    placeholder="Describe con el mayor detalle posible lo que quieres trabajar: subapartados, conceptos clave, ejemplos o casos que te interesen, nivel de profundidad..."
                                    className="text-sm"
                                />
                            </>
                        )}

                        {errorPaso1 && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {errorPaso1}
                            </p>
                        )}
                        <div className="flex justify-end">
                            <Button type="button" onClick={() => setPaso(2)} disabled={!textoEntrada.trim()}>
                                Siguiente
                            </Button>
                        </div>
                    </div>
                )}

                {paso === 2 && (
                    <div className="flex flex-col gap-4">
                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Número de sesiones</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {(['fijo', 'rango', 'ia'] as SesionesModo[]).map(opcion => (
                                    <button
                                        key={opcion}
                                        type="button"
                                        onClick={() => setSesionesModo(opcion)}
                                        className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${sesionesModo === opcion ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                    >
                                        {opcion === 'fijo' ? 'Número fijo' : opcion === 'rango' ? 'Rango orientativo' : 'Que decida la IA'}
                                    </button>
                                ))}
                            </div>
                            {sesionesModo === 'fijo' && (
                                <div className="mt-2 w-24">
                                    <Input type="number" min={1} value={sesionesFijo} onChange={e => setSesionesFijo(parseInt(e.target.value, 10) || 1)} />
                                </div>
                            )}
                            {sesionesModo === 'rango' && (
                                <div className="mt-2 flex items-center gap-2">
                                    <div className="w-20"><Input type="number" min={1} value={sesionesMin} onChange={e => setSesionesMin(parseInt(e.target.value, 10) || 1)} /></div>
                                    <span className="text-sm text-slate-500">a</span>
                                    <div className="w-20"><Input type="number" min={1} value={sesionesMax} onChange={e => setSesionesMax(parseInt(e.target.value, 10) || 1)} /></div>
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Grupo</p>
                            {clasesDelCurso.length === 0 ? (
                                <p className="text-sm text-slate-500">Esta materia todavía no tiene clases/grupos dados de alta.</p>
                            ) : (
                                <>
                                    <Select value={classId} onChange={e => setClassId(e.target.value)} className="max-w-xs">
                                        {clasesDelCurso.map(c => (
                                            <option key={c.id} value={c.id}>{c.grupo || 'Sin nombre'}</option>
                                        ))}
                                    </Select>
                                    <p className="text-xs text-slate-500 mt-2">
                                        Características del grupo -- se cargan de la clase y se guardan ahí si las cambias:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                        {CARACTERISTICAS_HABITUALES.map(rasgo => (
                                            <button
                                                key={rasgo}
                                                type="button"
                                                onClick={() => toggleCaracteristica(rasgo)}
                                                className={`text-xs font-medium px-2 py-1 rounded-full border transition-colors ${caracteristicasGrupo.includes(rasgo) ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                            >
                                                {rasgo}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {errorPaso1 && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {errorPaso1}
                            </p>
                        )}
                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(1)}>Atrás</Button>
                            <Button type="button" onClick={handleGenerarPrompt} disabled={generando}>
                                {generando ? 'Generando...' : 'Generar prompt'}
                            </Button>
                        </div>
                    </div>
                )}

                {paso === 3 && resultado && (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-slate-600">
                            Copia este prompt y pégalo en tu IA online de confianza.
                        </p>
                        <Textarea value={resultado.prompt} readOnly rows={14} className="font-mono text-sm bg-slate-50" />
                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(2)}>Atrás</Button>
                            <div className="flex gap-2">
                                <CopyButton texto={resultado.prompt} />
                                <Button type="button" onClick={() => setPaso(4)}>Siguiente</Button>
                            </div>
                        </div>
                    </div>
                )}

                {paso === 4 && (
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
                            <Button type="button" variant="secondary" onClick={() => setPaso(3)}>Atrás</Button>
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
