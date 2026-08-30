import React, { useMemo, useRef, useState } from 'react';
import type { ClassData, Course, EvaluationTool, ProgrammingUnit, Student } from '../types';
import PageHeader from './PageHeader';
import Button from './Button';
import Select from './Select';
import Textarea from './Textarea';
import SeleccionarActividadSAModal from './SeleccionarActividadSAModal';
import SeleccionarInstrumentoModal from './SeleccionarInstrumentoModal';
import MarkdownResult from './MarkdownResult';
import DownloadDocxButton from './DownloadDocxButton';
import TextoResaltado from './TextoResaltado';
import {
    AcademicCapIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, CheckCircleIcon, ArrowUpTrayIcon,
} from './Icons';
import { PAGE_ACCENT } from '../theme/palette';
import { formatClassLabel } from '../utils';
import { useAnonimizar } from '../hooks/useAnonimizar';
import { useIaLocalDisponible } from '../hooks/useIaLocalDisponible';
import { useGroqDisponible } from '../hooks/useGroqDisponible';
import { useProgrammingUnitsForCourses } from '../hooks/useProgrammingUnits';
import { programmingUnitFromApi } from '../services/apiAdapters';
import { instrumentoATexto } from '../services/instrumentoATexto';
import { generarAdaptacionConGroq, generarAdaptacionConIA, generarPromptAdaptacion } from '../services/generarAdaptacionMaterial';

type OrigenTipo = 'libre' | 'sa' | 'instrumento';
type Via = 'groq' | 'local' | 'online';
type PasoAlumno = 'revisar' | 'via' | 'resultado';

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

const nombreCompleto = (s: Student): string =>
    [s.nombre, s.primerApellido, s.segundoApellido].filter(Boolean).join(' ') || 'Alumno/a sin nombre';

// Solo el nombre y los campos de TEXTO LIBRE pasan por el Anonimizador --
// texto libre porque un profesor puede escribir ahí cualquier cosa,
// incluido sin querer un nombre propio o un dato identificativo. Las
// etiquetas ACNEAE/programa específico/repetición van aparte (ver
// notasCategoricas): son códigos de una lista cerrada, no texto libre, y no
// identifican a nadie por sí solos (hace falta el nombre, que ya se
// anonimiza) -- meterlas en la anonimización solo hacía que spaCy las
// confundiera con nombres propios y las sustituyera por un código opaco,
// perdiendo la información sin ganar nada de privacidad real.
const construirNotasParaAnonimizar = (s: Student): string => {
    const lineas = [`Alumno: ${nombreCompleto(s)}`];
    // Sin paréntesis a propósito: "Necesidades (NEAE): X" (con el ")" justo
    // antes del contenido) confundía al detector de nombres del
    // Anonimizador, que se comía la propia etiqueta como si fuera parte de
    // un nombre propio (verificado con el servicio real: "Necesidades
    // NEAE:" sin paréntesis deja la etiqueta intacta).
    if (s.neaeDetalle) lineas.push(`Necesidades NEAE: ${s.neaeDetalle}`);
    if (s.medidasEducativas) lineas.push(`Medidas educativas aplicadas: ${s.medidasEducativas}`);
    if (s.indicacionesPti) lineas.push(`Indicaciones del PTI: ${s.indicacionesPti}`);
    return lineas.join('\n');
};

const notasCategoricas = (s: Student): string => {
    const lineas: string[] = [];
    if (s.acneae.length > 0) lineas.push(`Etiquetas ACNEAE: ${s.acneae.join(', ')}`);
    if (s.programaEspecifico) lineas.push(`Programa específico: ${s.programaEspecifico}`);
    if (s.haRepetidoCurso) lineas.push('Repite curso.');
    return lineas.join('\n');
};

const reintegrar = (texto: string, mapa: Record<string, string>): string => {
    let out = texto;
    for (const [codigo, real] of Object.entries(mapa)) out = out.split(codigo).join(real);
    return out;
};

interface AdaptarMaterialViewProps {
    courses: Course[];
    academicClasses: ClassData[];
    evaluationTools: EvaluationTool[];
}

// Adaptar un material/actividad/instrumento para alumnado NEAE, repetidor o
// con programa específico -- retoma el §11 ("perfiles de adaptación NEAE")
// del diseño original de IA, aparcado en su día. A diferencia del generador
// de SA (que solo usa recuentos AGREGADOS de etiquetas ACNEAE, nunca texto de
// un alumno concreto, ver resumir_adaptaciones_neae en situacion_aprendizaje.py),
// esta función SÍ necesita el detalle de un alumno concreto -- así que,
// decisión explícita del usuario, el material + esas notas pasan primero por
// el Anonimizador (mismo servicio que ya usa AiToolsView.tsx) y el profesor
// revisa el resultado antes de que siga camino a Groq/IA local/online. Nada
// se persiste en ningún punto: el material adaptado se ve/copia, igual que
// el Anonimizador.
const AdaptarMaterialView: React.FC<AdaptarMaterialViewProps> = ({ courses, academicClasses, evaluationTools }) => {
    // --- Paso 1: origen del material ---
    const [origenTipo, setOrigenTipo] = useState<OrigenTipo>('libre');
    const [materialTexto, setMaterialTexto] = useState('');
    const [showSeleccionarActividadSA, setShowSeleccionarActividadSA] = useState(false);
    const [showSeleccionarInstrumento, setShowSeleccionarInstrumento] = useState(false);
    const [subiendoDocumento, setSubiendoDocumento] = useState(false);
    const [avisoExtraccion, setAvisoExtraccion] = useState<string | null>(null);
    const [errorExtraccion, setErrorExtraccion] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Mismo endpoint que ya usa GenerarInstrumentoIAModal.tsx/el wizard de SA
    // (extrae texto de .docx/.pptx/.pdf, con fallback a IA de visión para
    // páginas/diapositivas escaneadas) -- se reutiliza tal cual, sin
    // duplicar lógica de extracción.
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

    const programmingUnitsQueries = useProgrammingUnitsForCourses(courses.map(c => c.id));
    const programmingUnits: ProgrammingUnit[] = useMemo(
        () => programmingUnitsQueries.flatMap(q => (q.data ?? []).map(programmingUnitFromApi)),
        [programmingUnitsQueries]
    );

    // --- Paso 2: clase + alumnado ---
    const [fase, setFase] = useState<'origen' | 'alumnos' | 'proceso'>('origen');
    const [classId, setClassId] = useState('');
    const activeClass = academicClasses.find(c => c.id === classId);
    const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

    const toggleSeleccionado = (studentId: string) => {
        setSeleccionados(prev => {
            const next = new Set(prev);
            if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
            return next;
        });
    };
    const toggleSeleccionarTodos = () => {
        if (!activeClass) return;
        setSeleccionados(prev =>
            prev.size === activeClass.students.length ? new Set() : new Set(activeClass.students.map(s => s.id))
        );
    };

    // --- Paso 3: proceso por alumno ---
    const [indice, setIndice] = useState(0);
    const [pasoAlumno, setPasoAlumno] = useState<PasoAlumno>('revisar');
    const [textoAnonimizado, setTextoAnonimizado] = useState('');
    const [mapaActivo, setMapaActivo] = useState<Record<string, string> | null>(null);
    // Vista de solo lectura con los códigos resaltados (pasa el ratón por
    // encima para ver el dato real) por defecto; "Editar manualmente" pasa
    // al textarea de siempre solo cuando de verdad hace falta corregir algo
    // (petición explícita: con el resaltado ya no hace falta ver el
    // original y el anonimizado a la vez).
    const [editandoManualmente, setEditandoManualmente] = useState(false);
    const [via, setVia] = useState<Via>('groq');
    const [generando, setGenerando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [promptOnline, setPromptOnline] = useState<string | null>(null);
    const [respuestaPegada, setRespuestaPegada] = useState('');
    const [resultadoFinal, setResultadoFinal] = useState<string | null>(null);
    // Vía online: si la IA devuelve la respuesta como .docx (para conservar
    // el formato/imágenes que ella misma haya puesto), se sube aquí y se
    // reintegra igual que en AiToolsView.tsx -- mismo endpoint, sin cambios.
    const [docxFinal, setDocxFinal] = useState<{ blob: Blob; sobrantes: string[] } | null>(null);
    const [restituyendoDocx, setRestituyendoDocx] = useState(false);
    const [errorRestitucionDocx, setErrorRestitucionDocx] = useState<string | null>(null);
    const docxRespuestaInputRef = useRef<HTMLInputElement>(null);

    const anonimizarMutation = useAnonimizar();
    const iaLocalDisponible = useIaLocalDisponible();
    const groqDisponible = useGroqDisponible();

    const alumnosAProcesar = useMemo(
        () => (activeClass?.students ?? []).filter(s => seleccionados.has(s.id)),
        [activeClass, seleccionados]
    );
    const alumnoActual = alumnosAProcesar[indice];

    const handleEmpezarProceso = async () => {
        setFase('proceso');
        setIndice(0);
        await anonimizarAlumno(alumnosAProcesar[0]);
    };

    // Solo se anonimiza la información del alumno -- el material (paso 1)
    // nunca pasa por el Anonimizador: se asume que no contiene datos
    // personales de ningún alumno (ver el aviso junto al campo Material),
    // así que se manda tal cual a la IA, sin código de por medio.
    const anonimizarAlumno = async (alumno: Student) => {
        setPasoAlumno('revisar');
        setError(null);
        setResultadoFinal(null);
        setPromptOnline(null);
        setRespuestaPegada('');
        setDocxFinal(null);
        setErrorRestitucionDocx(null);
        setEditandoManualmente(false);
        const notasLibres = construirNotasParaAnonimizar(alumno);
        // Las categóricas (ACNEAE/programa/repetición) se añaden en claro
        // DESPUÉS de anonimizar -- nunca pasan por el Anonimizador, ver el
        // comentario de notasCategoricas().
        const categoricas = notasCategoricas(alumno);
        try {
            const data = await anonimizarMutation.mutateAsync(notasLibres);
            setTextoAnonimizado(categoricas ? `${data.anonimizado}\n${categoricas}` : data.anonimizado);
            setMapaActivo(data.mapa);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    const handleGenerar = async () => {
        if (!mapaActivo) return;
        setGenerando(true);
        setError(null);
        try {
            const params = { material: materialTexto, notasAlumno: textoAnonimizado };
            const resultadoAnon =
                via === 'groq' ? await generarAdaptacionConGroq(params) :
                via === 'local' ? await generarAdaptacionConIA(params) :
                null;
            if (resultadoAnon !== null) {
                setResultadoFinal(reintegrar(resultadoAnon, mapaActivo));
                setPasoAlumno('resultado');
            } else {
                const prompt = await generarPromptAdaptacion(params);
                setPromptOnline(prompt);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerando(false);
        }
    };

    const handleProcesarRespuestaOnline = () => {
        if (!mapaActivo) return;
        setResultadoFinal(reintegrar(respuestaPegada, mapaActivo));
        setPasoAlumno('resultado');
    };

    // Mismo mecanismo que AiToolsView.tsx (paso 3→4): si la IA online ha
    // devuelto la respuesta como .docx (para conservar el formato/imágenes
    // que ella misma haya generado), se sustituyen los códigos PERS_/GRUPO_
    // por los datos reales dentro del propio .docx, run por run, sin tocar
    // el resto del documento -- mismo endpoint, reutilizado tal cual.
    const handleSubirRespuestaDocx = async (file: File) => {
        if (!mapaActivo) return;
        setRestituyendoDocx(true);
        setErrorRestitucionDocx(null);
        try {
            const formData = new FormData();
            formData.append('archivo', file);
            formData.append('mapa', JSON.stringify(mapaActivo));
            const response = await fetch('/api/ai-tools/reintegrar-docx', { method: 'POST', body: formData });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const sobrantesHeader = response.headers.get('X-Codigos-Sin-Resolver') ?? '';
            const blob = await response.blob();
            setDocxFinal({ blob, sobrantes: sobrantesHeader ? sobrantesHeader.split(',') : [] });
            setResultadoFinal(null);
            setPasoAlumno('resultado');
        } catch (err) {
            setErrorRestitucionDocx(err instanceof Error ? err.message : String(err));
        } finally {
            setRestituyendoDocx(false);
        }
    };

    const handleSiguienteAlumno = async () => {
        const siguiente = indice + 1;
        if (siguiente >= alumnosAProcesar.length) return;
        setIndice(siguiente);
        await anonimizarAlumno(alumnosAProcesar[siguiente]);
    };

    const empezarDeNuevo = () => {
        setFase('origen');
        setOrigenTipo('libre');
        setMaterialTexto('');
        setAvisoExtraccion(null);
        setErrorExtraccion(null);
        setClassId('');
        setSeleccionados(new Set());
        setIndice(0);
        setPasoAlumno('revisar');
        setTextoAnonimizado('');
        setMapaActivo(null);
        setEditandoManualmente(false);
        setVia('groq');
        setError(null);
        setPromptOnline(null);
        setRespuestaPegada('');
        setResultadoFinal(null);
        setDocxFinal(null);
        setErrorRestitucionDocx(null);
        anonimizarMutation.reset();
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <PageHeader
                title="Adaptar material NEAE"
                subtitle="Genera una versión adaptada de un material para alumnado NEAE, repetidor o con programa específico"
                accent={PAGE_ACCENT.herramientasIA}
                icon={<AcademicCapIcon className="w-6 h-6" />}
            />

            <p className="text-sm text-slate-600 bg-white rounded-xl shadow-sm border p-4">
                Elige un material, quién lo necesita adaptado, y sus características (NEAE, PTI, programa
                específico...) pasan primero por el <strong>Anonimizador</strong> para que revises qué se manda antes
                de generar nada -- igual que el resto de Herramientas IA, nada se guarda: se ve/copia en el momento.
            </p>

            <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col gap-5 flex-1 overflow-y-auto">
                {fase === 'origen' && (
                    <div className="flex flex-col gap-4">
                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">¿De dónde sale el material?</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {([
                                    { value: 'libre', label: 'Material libre' },
                                    { value: 'sa', label: 'Actividad de una SA' },
                                    { value: 'instrumento', label: 'Instrumento de evaluación' },
                                ] as { value: OrigenTipo; label: string }[]).map(o => (
                                    <button
                                        key={o.value}
                                        type="button"
                                        onClick={() => { setOrigenTipo(o.value); if (o.value !== 'libre') setMaterialTexto(''); }}
                                        className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${origenTipo === o.value ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                    >
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {origenTipo === 'sa' && (
                            <Button type="button" variant="secondary" onClick={() => setShowSeleccionarActividadSA(true)} className="self-start">
                                Elegir actividad de una SA...
                            </Button>
                        )}
                        {origenTipo === 'instrumento' && (
                            <Button type="button" variant="secondary" onClick={() => setShowSeleccionarInstrumento(true)} className="self-start">
                                Elegir instrumento...
                            </Button>
                        )}
                        {origenTipo === 'libre' && (
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
                                    {subiendoDocumento ? 'Extrayendo...' : 'Subir documento (.docx/.pptx/.pdf)'}
                                </Button>
                            </div>
                        )}

                        {avisoExtraccion && (
                            <p className="text-sm text-amber-700 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                {avisoExtraccion}
                            </p>
                        )}
                        {errorExtraccion && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {errorExtraccion}
                            </p>
                        )}

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">
                                Material {origenTipo !== 'libre' && <span className="text-slate-400 font-normal">(precargado, editable)</span>}
                            </p>
                            <p className="text-xs text-slate-400 mb-1.5">
                                Este material no debe contener información personal de ningún alumno -- solo se anonimizan las
                                características del alumno seleccionado (paso siguiente), el material se manda tal cual.
                            </p>
                            <Textarea
                                value={materialTexto}
                                onChange={e => setMaterialTexto(e.target.value)}
                                rows={10}
                                placeholder="...o pega aquí el material/actividad/enunciado a adaptar"
                                className="font-mono text-sm"
                            />
                        </div>

                        <div className="flex justify-end">
                            <Button type="button" onClick={() => setFase('alumnos')} disabled={!materialTexto.trim()}>
                                Siguiente
                            </Button>
                        </div>
                    </div>
                )}

                {fase === 'alumnos' && (
                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="text-xs font-medium text-slate-600">Clase</label>
                            <Select value={classId} onChange={e => { setClassId(e.target.value); setSeleccionados(new Set()); }} className="max-w-md">
                                <option value="">Elige una clase...</option>
                                {academicClasses.map(c => (
                                    <option key={c.id} value={c.id}>{formatClassLabel(c, courses)}</option>
                                ))}
                            </Select>
                        </div>

                        {activeClass && (
                            <div className="border rounded-lg overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b text-xs font-medium text-slate-600">
                                    <input
                                        type="checkbox"
                                        checked={activeClass.students.length > 0 && seleccionados.size === activeClass.students.length}
                                        onChange={toggleSeleccionarTodos}
                                        aria-label="Seleccionar todo el alumnado"
                                    />
                                    Seleccionar todo el alumnado
                                </div>
                                <div className="max-h-80 overflow-y-auto divide-y">
                                    {activeClass.students.map(s => (
                                        <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                                            <input type="checkbox" checked={seleccionados.has(s.id)} onChange={() => toggleSeleccionado(s.id)} />
                                            <span className="flex-1">{nombreCompleto(s)}</span>
                                            <span className="text-xs text-slate-400">
                                                {[...s.acneae, s.programaEspecifico, s.haRepetidoCurso ? 'Repite' : null].filter(Boolean).join(', ')}
                                            </span>
                                        </label>
                                    ))}
                                    {activeClass.students.length === 0 && (
                                        <p className="text-sm text-slate-400 px-3 py-4 text-center">Esta clase no tiene alumnado.</p>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setFase('origen')}>Atrás</Button>
                            <Button type="button" onClick={handleEmpezarProceso} disabled={seleccionados.size === 0}>
                                Generar adaptaciones ({seleccionados.size} alumno{seleccionados.size === 1 ? '' : 's'})
                            </Button>
                        </div>
                    </div>
                )}

                {fase === 'proceso' && alumnoActual && (
                    <div className="flex flex-col gap-4">
                        <p className="text-sm font-semibold text-slate-700">
                            Alumno {indice + 1} de {alumnosAProcesar.length}: {nombreCompleto(alumnoActual)}
                        </p>

                        {pasoAlumno === 'revisar' && (
                            <div className="flex flex-col gap-3">
                                {anonimizarMutation.isPending && <p className="text-sm text-slate-500">Anonimizando...</p>}
                                {!anonimizarMutation.isPending && mapaActivo && (
                                    <>
                                        <p className="text-sm text-slate-600">
                                            Se han sustituido <strong>{Object.keys(mapaActivo).length}</strong> dato(s) del alumno por
                                            códigos (pasa el ratón por encima de uno para ver el dato real). Revisa antes de continuar --
                                            esto es lo único que sale
                                            {via === 'online' ? ' hacia la IA online' : via === 'groq' ? ' hacia Groq' : ' hacia la IA local'}
                                            {' '}junto con el material (que no pasa por el Anonimizador, ver el paso anterior).
                                        </p>
                                        {editandoManualmente ? (
                                            <Textarea
                                                value={textoAnonimizado}
                                                onChange={e => setTextoAnonimizado(e.target.value)}
                                                rows={14}
                                                className="font-mono text-sm"
                                            />
                                        ) : (
                                            <TextoResaltado
                                                texto={textoAnonimizado}
                                                mapa={mapaActivo}
                                                className="bg-slate-50 border rounded-lg p-3 max-h-[20rem] overflow-auto"
                                            />
                                        )}
                                        <div className="flex justify-between">
                                            <Button type="button" variant="secondary" onClick={() => setEditandoManualmente(v => !v)}>
                                                {editandoManualmente ? 'Ver con códigos resaltados' : 'Editar manualmente'}
                                            </Button>
                                            <Button type="button" onClick={() => setPasoAlumno('via')}>Siguiente</Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {pasoAlumno === 'via' && (
                            <div className="flex flex-col gap-3">
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
                                            <div className="flex items-center justify-between mb-1.5">
                                                <p className="text-sm font-semibold text-slate-700">2. Pega aquí la respuesta de la IA</p>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        ref={docxRespuestaInputRef}
                                                        type="file"
                                                        accept=".docx"
                                                        className="hidden"
                                                        onChange={e => {
                                                            const file = e.target.files?.[0];
                                                            if (file) handleSubirRespuestaDocx(file);
                                                            e.target.value = '';
                                                        }}
                                                    />
                                                    <Button type="button" variant="secondary" onClick={() => docxRespuestaInputRef.current?.click()} disabled={restituyendoDocx}>
                                                        <ArrowUpTrayIcon className="w-4 h-4" />
                                                        {restituyendoDocx ? 'Procesando .docx...' : 'Subir .docx de la respuesta'}
                                                    </Button>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 mb-1.5">
                                                Si la IA te ha dado la respuesta como archivo .docx (para conservar formato/imágenes),
                                                súbelo aquí en vez de pegar el texto -- los códigos PERS_/GRUPO_ deben quedar intactos.
                                            </p>
                                            {errorRestitucionDocx && (
                                                <p className="text-sm text-red-600 flex items-center gap-1.5 mb-1.5">
                                                    <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                                    {errorRestitucionDocx}
                                                </p>
                                            )}
                                            <Textarea
                                                value={respuestaPegada}
                                                onChange={e => setRespuestaPegada(e.target.value)}
                                                rows={8}
                                                placeholder="...o pega aquí el material adaptado que te haya devuelto la IA en texto"
                                                className="text-xs font-mono"
                                            />
                                        </div>
                                    </>
                                ) : null}

                                {error && <p className="text-sm text-red-600">{error}</p>}

                                <div className="flex justify-between pt-2 border-t">
                                    <Button type="button" variant="secondary" onClick={() => setPasoAlumno('revisar')}>Atrás</Button>
                                    {via === 'online' && promptOnline !== null ? (
                                        <Button type="button" onClick={handleProcesarRespuestaOnline} disabled={!respuestaPegada.trim()}>
                                            Restituir datos reales
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            onClick={handleGenerar}
                                            disabled={generando || (via === 'local' && !iaLocalDisponible) || (via === 'groq' && !groqDisponible)}
                                        >
                                            {generando ? 'Generando...' : via === 'online' ? 'Generar prompt' : 'Generar'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}

                        {pasoAlumno === 'resultado' && (resultadoFinal !== null || docxFinal !== null) && (
                            <div className="flex flex-col gap-3">
                                {docxFinal && docxFinal.sobrantes.length > 0 ? (
                                    <p className="text-sm text-amber-700 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                        <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                        Material adaptado para {nombreCompleto(alumnoActual)}, pero quedan códigos sin resolver
                                        ({docxFinal.sobrantes.join(', ')}) -- puede que la IA los haya alterado, o hayan quedado
                                        partidos entre dos estilos distintos dentro del .docx. Revisa el documento antes de usarlo.
                                    </p>
                                ) : (
                                    <p className="text-sm text-emerald-700 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                        <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                                        Material adaptado para {nombreCompleto(alumnoActual)}.
                                    </p>
                                )}
                                {docxFinal ? (
                                    <div className="flex flex-col items-center justify-center gap-3 text-sm text-slate-500 border rounded-lg p-8 bg-slate-50">
                                        <ArrowUpTrayIcon className="w-8 h-8 text-slate-400 rotate-180" />
                                        Documento .docx listo, con el formato de la IA conservado.
                                    </div>
                                ) : (
                                    <MarkdownResult texto={resultadoFinal!} className="max-h-[28rem] overflow-auto text-sm border rounded-lg p-4 bg-slate-50" />
                                )}
                                <div className="flex justify-between">
                                    {docxFinal ? <DownloadDocxButton blob={docxFinal.blob} filename={`material-adaptado-${nombreCompleto(alumnoActual)}.docx`} /> : <CopyButton texto={resultadoFinal!} />}
                                    {indice + 1 < alumnosAProcesar.length ? (
                                        <Button type="button" onClick={handleSiguienteAlumno}>Siguiente alumno</Button>
                                    ) : (
                                        <Button type="button" onClick={empezarDeNuevo}>Terminado -- empezar de nuevo</Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {fase === 'proceso' && !alumnoActual && (
                    <p className="text-sm text-amber-700 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                        No hay alumnado seleccionado.
                    </p>
                )}
            </div>

            {showSeleccionarActividadSA && (
                <SeleccionarActividadSAModal
                    isOpen={showSeleccionarActividadSA}
                    onClose={() => setShowSeleccionarActividadSA(false)}
                    programmingUnits={programmingUnits}
                    courses={courses}
                    onSeleccionar={({ item }) => {
                        setMaterialTexto(item.contexto);
                        setShowSeleccionarActividadSA(false);
                    }}
                />
            )}
            {showSeleccionarInstrumento && (
                <SeleccionarInstrumentoModal
                    isOpen={showSeleccionarInstrumento}
                    onClose={() => setShowSeleccionarInstrumento(false)}
                    evaluationTools={evaluationTools}
                    courses={courses}
                    onSeleccionar={tool => {
                        setMaterialTexto(instrumentoATexto(tool));
                        setShowSeleccionarInstrumento(false);
                    }}
                />
            )}
        </div>
    );
};

export default AdaptarMaterialView;
