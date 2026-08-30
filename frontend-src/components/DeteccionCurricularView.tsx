import React, { useMemo, useRef, useState } from 'react';
import type { ClassData, Course, EvaluationCriterion, LinkedCriterion, SpecificCompetence } from '../types';
import PageHeader from './PageHeader';
import Button from './Button';
import Select from './Select';
import Textarea from './Textarea';
import TextoResaltado, { PATRON_ANOTACION } from './TextoResaltado';
import { MagnifyingGlassIcon, ArrowUpTrayIcon, ExclamationTriangleIcon, CheckCircleIcon, ClipboardDocumentIcon } from './Icons';
import { PAGE_ACCENT } from '../theme/palette';
import { formatClassLabel } from '../utils';
import { useIaLocalDisponible } from '../hooks/useIaLocalDisponible';
import { useGroqDisponible } from '../hooks/useGroqDisponible';
import { useAssignments, useUpdateAssignment } from '../hooks/useAssignments';
import {
    detectarElementosConGroq, detectarElementosConIA, generarPromptDeteccion, validarRespuestaDeteccion,
    type ResultadoDeteccion, type ElementoDetectado,
} from '../services/generarDeteccionCurricular';

type Via = 'groq' | 'local' | 'online';

const TIPOS_DISPONIBLES: { value: string; label: string }[] = [
    { value: 'criterios', label: 'Criterios de evaluación' },
    { value: 'saberes', label: 'Saberes básicos' },
    { value: 'competencias_especificas', label: 'Competencias específicas' },
    { value: 'competencias_clave', label: 'Competencias clave / descriptores' },
];

const extraerCodigoAnotacion = (coincidencia: string) => coincidencia.slice(2, -2);

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

interface DeteccionCurricularViewProps {
    courses: Course[];
    academicClasses: ClassData[];
    criteria: EvaluationCriterion[];
    specificCompetences: SpecificCompetence[];
}

// Detecta qué elementos curriculares (criterios, saberes, competencias
// específicas, competencias clave/descriptores) moviliza un documento ya
// escrito por el profesor (apuntes, descripción de actividades...) --
// anota el propio documento con los códigos reales del curso, mismo
// principio de "nunca inventar códigos" que sugerir_criterios_groq en
// instrumento_evaluacion.py, ampliado a los 4 tipos. Sin datos personales
// de por medio -- no pasa por el Anonimizador, a diferencia de Adaptar
// material.
const DeteccionCurricularView: React.FC<DeteccionCurricularViewProps> = ({
    courses, academicClasses, criteria, specificCompetences,
}) => {
    const [courseId, setCourseId] = useState('');
    const [tipos, setTipos] = useState<Set<string>>(new Set(['criterios']));
    const [materialTexto, setMaterialTexto] = useState('');
    const [subiendoDocumento, setSubiendoDocumento] = useState(false);
    const [avisoExtraccion, setAvisoExtraccion] = useState<string | null>(null);
    const [errorExtraccion, setErrorExtraccion] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [via, setVia] = useState<Via>('groq');
    const [generando, setGenerando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [promptOnline, setPromptOnline] = useState<string | null>(null);
    const [respuestaPegada, setRespuestaPegada] = useState('');
    const [resultado, setResultado] = useState<ResultadoDeteccion | null>(null);

    const iaLocalDisponible = useIaLocalDisponible();
    const groqDisponible = useGroqDisponible();

    // --- Aplicar criterios detectados a una tarea del cuaderno ---
    const [showAplicar, setShowAplicar] = useState(false);
    const [classIdAplicar, setClassIdAplicar] = useState('');
    const [assignmentIdAplicar, setAssignmentIdAplicar] = useState('');
    const [aplicando, setAplicando] = useState(false);
    const [errorAplicar, setErrorAplicar] = useState<string | null>(null);
    const [aplicadoOk, setAplicadoOk] = useState(false);

    const clasesDelCurso = useMemo(() => academicClasses.filter(c => c.courseId === courseId), [academicClasses, courseId]);
    const assignmentsQuery = useAssignments(classIdAplicar, { enabled: !!classIdAplicar });
    const updateAssignmentMutation = useUpdateAssignment();

    const handleSubirDocumento = async (file: File) => {
        setSubiendoDocumento(true);
        setAvisoExtraccion(null);
        setErrorExtraccion(null);
        try {
            const formData = new FormData();
            formData.append('archivo', file);
            const response = await fetch('/api/prompts/extraer-documento', { method: 'POST', body: formData });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const data: { texto: string; aviso: string | null } = await response.json();
            setMaterialTexto(data.texto);
            setAvisoExtraccion(data.aviso);
        } catch (err) {
            setErrorExtraccion(err instanceof Error ? err.message : String(err));
        } finally {
            setSubiendoDocumento(false);
        }
    };

    const toggleTipo = (tipo: string) => {
        setTipos(prev => {
            const next = new Set(prev);
            if (next.has(tipo)) next.delete(tipo); else next.add(tipo);
            return next;
        });
    };

    const resetResultado = () => {
        setResultado(null);
        setPromptOnline(null);
        setRespuestaPegada('');
        setError(null);
        setShowAplicar(false);
        setClassIdAplicar('');
        setAssignmentIdAplicar('');
        setAplicadoOk(false);
        setErrorAplicar(null);
    };

    const handleGenerar = async () => {
        if (!courseId || tipos.size === 0 || !materialTexto.trim()) return;
        resetResultado();
        setGenerando(true);
        try {
            const params = { courseId, documento: materialTexto, tipos: Array.from(tipos) };
            if (via === 'groq') {
                setResultado(await detectarElementosConGroq(params));
            } else if (via === 'local') {
                setResultado(await detectarElementosConIA(params));
            } else {
                setPromptOnline(await generarPromptDeteccion(params));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerando(false);
        }
    };

    const handleProcesarRespuestaOnline = async () => {
        setGenerando(true);
        setError(null);
        try {
            setResultado(await validarRespuestaDeteccion(courseId, Array.from(tipos), respuestaPegada));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerando(false);
        }
    };

    // Mismo cálculo que handleAddCriterion en LinkedCriteriaSelector.tsx --
    // todos los descriptores de la competencia específica del criterio,
    // marcados por defecto (la relación la fija el currículo oficial, no
    // es una elección del profesor tarea a tarea).
    const construirLinkedCriteria = (elementos: ElementoDetectado[]): LinkedCriterion[] =>
        elementos.map(el => {
            const criterio = criteria.find(c => c.id === el.id);
            const competencia = criterio ? specificCompetences.find(sc => sc.id === criterio.competenceId) : undefined;
            return { criterionId: el.id, ratio: 1, selectedDescriptorIds: competencia?.keyCompetenceDescriptorIds ?? [] };
        });

    const handleAplicar = async () => {
        if (!assignmentIdAplicar || !resultado) return;
        setAplicando(true);
        setErrorAplicar(null);
        try {
            const linkedCriteria = construirLinkedCriteria(resultado.elementos.criterios ?? []);
            await updateAssignmentMutation.mutateAsync({ id: assignmentIdAplicar, classId: classIdAplicar, data: { linkedCriteria } });
            setAplicadoOk(true);
        } catch (err) {
            setErrorAplicar(err instanceof Error ? err.message : String(err));
        } finally {
            setAplicando(false);
        }
    };

    const mapaDescripciones = useMemo(() => {
        const mapa: Record<string, string> = {};
        if (!resultado) return mapa;
        for (const lista of Object.values(resultado.elementos)) {
            for (const el of lista) mapa[el.code] = `${el.code}: ${el.description}`;
        }
        return mapa;
    }, [resultado]);

    const totalDetectado = resultado ? Object.values(resultado.elementos).reduce((n, l) => n + l.length, 0) : 0;
    const hayCriteriosDetectados = (resultado?.elementos.criterios?.length ?? 0) > 0;

    return (
        <div className="flex flex-col gap-4 h-full">
            <PageHeader
                title="Detección de elementos curriculares"
                subtitle="Qué criterios, saberes o competencias moviliza un documento o una descripción de tareas"
                accent={PAGE_ACCENT.herramientasIA}
                icon={<MagnifyingGlassIcon className="w-6 h-6" />}
            />

            <p className="text-sm text-slate-600 bg-white rounded-xl shadow-sm border p-4">
                Sube unos apuntes o una descripción de actividades ya escritos, y la IA anota el propio documento con
                los elementos curriculares reales del curso que moviliza cada pasaje -- nunca inventa códigos fuera de
                los que ya tiene cargados el curso. Sin datos personales de por medio, no pasa por el Anonimizador.
            </p>

            <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col gap-5 flex-1 overflow-y-auto">
                <div>
                    <label className="text-xs font-medium text-slate-600">Curso</label>
                    <Select value={courseId} onChange={e => { setCourseId(e.target.value); resetResultado(); }} className="max-w-md">
                        <option value="">Elige un curso...</option>
                        {courses.map(c => <option key={c.id} value={c.id}>{c.level} - {c.subject}</option>)}
                    </Select>
                </div>

                <div>
                    <p className="text-sm font-semibold text-slate-700 mb-1.5">¿Qué tipos de elemento analizar?</p>
                    <div className="flex gap-3 flex-wrap">
                        {TIPOS_DISPONIBLES.map(t => (
                            <label key={t.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <input type="checkbox" checked={tipos.has(t.value)} onChange={() => toggleTipo(t.value)} />
                                {t.label}
                            </label>
                        ))}
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-semibold text-slate-700">Documento</p>
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
                    </div>
                    {avisoExtraccion && (
                        <p className="text-sm text-amber-700 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-1.5">
                            <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            {avisoExtraccion}
                        </p>
                    )}
                    {errorExtraccion && (
                        <p className="text-sm text-red-600 flex items-center gap-1.5 mb-1.5">
                            <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                            {errorExtraccion}
                        </p>
                    )}
                    <Textarea
                        value={materialTexto}
                        onChange={e => setMaterialTexto(e.target.value)}
                        rows={10}
                        placeholder="...o pega aquí los apuntes/actividades a analizar"
                        className="font-mono text-sm"
                    />
                </div>

                <div className="flex gap-1.5">
                    {([
                        { value: 'groq', label: 'Groq (rápido)' },
                        { value: 'local', label: 'IA local' },
                        { value: 'online', label: 'IA online (última opción)' },
                    ] as { value: Via; label: string }[]).map(v => (
                        <button
                            key={v.value}
                            type="button"
                            onClick={() => { setVia(v.value); setPromptOnline(null); }}
                            className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${via === v.value ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>

                {via === 'local' && !iaLocalDisponible && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        El servidor de IA local no está disponible ahora mismo -- usa Groq o la IA online.
                    </p>
                )}
                {via === 'groq' && !groqDisponible && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        Groq no está configurado en el servidor todavía -- usa la IA local o la IA online.
                    </p>
                )}

                {via === 'online' && promptOnline !== null ? (
                    <>
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <p className="text-sm font-semibold text-slate-700">1. Copia el prompt y pégalo en tu IA online</p>
                                <CopyButton texto={promptOnline} />
                            </div>
                            <Textarea value={promptOnline} readOnly rows={8} className="text-xs font-mono bg-slate-50" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">2. Pega aquí el documento anotado que te haya devuelto la IA</p>
                            <Textarea
                                value={respuestaPegada}
                                onChange={e => setRespuestaPegada(e.target.value)}
                                rows={8}
                                placeholder="Pega aquí la respuesta de la IA..."
                                className="text-xs font-mono"
                            />
                        </div>
                    </>
                ) : null}

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex justify-end">
                    {via === 'online' && promptOnline !== null ? (
                        <Button type="button" onClick={handleProcesarRespuestaOnline} disabled={!respuestaPegada.trim() || generando}>
                            {generando ? 'Procesando...' : 'Procesar respuesta'}
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            onClick={handleGenerar}
                            disabled={
                                generando || !courseId || tipos.size === 0 || !materialTexto.trim()
                                || (via === 'local' && !iaLocalDisponible) || (via === 'groq' && !groqDisponible)
                            }
                        >
                            {generando ? 'Generando...' : via === 'online' ? 'Generar prompt' : 'Detectar elementos'}
                        </Button>
                    )}
                </div>

                {resultado && (
                    <div className="flex flex-col gap-3 pt-3 border-t">
                        {resultado.codigosDescartados.length > 0 && (
                            <p className="text-sm text-amber-700 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                La IA mencionó {resultado.codigosDescartados.length} código(s) que no existen en este
                                curso y se han descartado: {resultado.codigosDescartados.join(', ')}.
                            </p>
                        )}
                        <p className="text-sm text-emerald-700 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                            <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                            {totalDetectado} elemento(s) curricular(es) detectado(s) (pasa el ratón por encima de un código en el
                            documento para ver su descripción completa).
                        </p>

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Resumen</p>
                            <div className="flex flex-col gap-2">
                                {TIPOS_DISPONIBLES.map(t => {
                                    const lista = resultado.elementos[t.value] ?? [];
                                    if (lista.length === 0) return null;
                                    return (
                                        <div key={t.value} className="text-sm">
                                            <span className="font-medium text-slate-700">{t.label} ({lista.length}): </span>
                                            <span className="text-slate-600">
                                                {lista.map(el => `${el.code} — ${el.description}`).join('; ')}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Documento anotado</p>
                            <TextoResaltado
                                texto={resultado.documentoAnotado}
                                mapa={mapaDescripciones}
                                patron={PATRON_ANOTACION}
                                extraerCodigo={extraerCodigoAnotacion}
                                className="max-h-[28rem] overflow-auto bg-slate-50 border rounded-lg p-4"
                            />
                        </div>

                        <div className="flex justify-between items-start flex-wrap gap-3">
                            <CopyButton texto={resultado.documentoAnotado} />
                            {hayCriteriosDetectados && (
                                <div className="flex flex-col items-end gap-2">
                                    {!showAplicar ? (
                                        <Button type="button" variant="secondary" onClick={() => setShowAplicar(true)}>
                                            Aplicar criterios a una tarea del cuaderno
                                        </Button>
                                    ) : aplicadoOk ? (
                                        <p className="text-sm text-emerald-700 flex items-center gap-1.5">
                                            <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                                            Criterios aplicados a la tarea.
                                        </p>
                                    ) : (
                                        <div className="flex flex-col gap-2 items-end bg-slate-50 border rounded-lg p-3">
                                            <div className="flex gap-2">
                                                <Select value={classIdAplicar} onChange={e => { setClassIdAplicar(e.target.value); setAssignmentIdAplicar(''); }}>
                                                    <option value="">Elige una clase...</option>
                                                    {clasesDelCurso.map(c => <option key={c.id} value={c.id}>{formatClassLabel(c, courses)}</option>)}
                                                </Select>
                                                <Select value={assignmentIdAplicar} onChange={e => setAssignmentIdAplicar(e.target.value)} disabled={!classIdAplicar}>
                                                    <option value="">Elige una tarea...</option>
                                                    {(assignmentsQuery.data ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                </Select>
                                            </div>
                                            {errorAplicar && <p className="text-sm text-red-600">{errorAplicar}</p>}
                                            <p className="text-xs text-slate-400 text-right max-w-sm">
                                                Solo tiene efecto en la nota si la tarea es de nota directa, o tiene activado
                                                "vincular nota global a criterios".
                                            </p>
                                            <Button type="button" onClick={handleAplicar} disabled={!assignmentIdAplicar || aplicando}>
                                                {aplicando ? 'Aplicando...' : 'Aplicar'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DeteccionCurricularView;
