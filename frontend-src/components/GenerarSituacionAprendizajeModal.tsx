import React, { useEffect, useRef, useState } from 'react';
import type { Course, EvaluationTool, ProgrammingUnit, SessionDetail, FinalProduct, FinalExam } from '../types';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';
import { ArrowUpTrayIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, SparklesIcon } from './Icons';
import { CARACTERISTICAS_HABITUALES } from './ClassModal';
import { RASGOS_DOCENTE_HABITUALES } from './settings/AcademicConfigManager';
import { EvaluationToolEditorModal } from './EvaluationToolManager';
import { useCurrentAcademicYear } from '../hooks/useAcademicYears';
import { useApiClasses, useUpdateClass } from '../hooks/useApiClasses';
import { usePreferences, useUpdatePreferences } from '../hooks/usePreferences';
import { useEvaluationCriteria } from '../hooks/useEvaluationCriteria';
import { useCreateEvaluationTool } from '../hooks/useEvaluationTools';
import { apiClassToLocal } from '../services/apiAdapters';
import GenerarInstrumentoIAModal from './GenerarInstrumentoIAModal';

type Paso = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Categorías del documento de diseño original -- selección múltiple + Otro.
const TIPOS_ACTIVIDAD_DISPONIBLES = [
    'Exposición/explicación docente', 'Trabajo individual', 'Trabajo cooperativo/grupal',
    'Debate/coloquio', 'Aprendizaje basado en proyectos (ABP)', 'Gamificación',
    'Uso de TIC/herramientas digitales', 'Aprendizaje-servicio', 'Práctica de laboratorio/taller',
    'Role-play/simulación', 'Rutinas y destrezas de pensamiento', 'Aula invertida (flipped classroom)',
    'Salida de aula o de centro',
];

const ESTRUCTURAS_COOPERATIVAS_DISPONIBLES = [
    'Puzzle de Aronson', 'Folio giratorio', '1-2-4 (o similar estructura Kagan)', 'Grupos de investigación',
];

// Bloque 3 (Evaluación): el tipo de producto final y el formato de examen
// los elige el profesor de sendas listas cerradas antes de generar -- la IA
// ya no los decide libremente, solo redacta su contenido.
const TIPOS_PRODUCTO_DISPONIBLES = [
    'Infografía', 'Vídeo', 'Dossier', 'Exposición oral', 'Presentación digital', 'Maqueta/prototipo', 'Podcast',
];

const FORMATOS_EXAMEN_DISPONIBLES = [
    'Test (opción múltiple)', 'Preguntas cortas', 'Preguntas de desarrollo/abiertas', 'Mixto (test + desarrollo)',
    'Prueba práctica/de aplicación', 'Oral',
];

// Selector de chips con soporte para añadir valores propios (usado para
// tipos de actividad y estructuras cooperativas) -- mismo patrón que
// CARACTERISTICAS_HABITUALES en ClassModal.tsx.
const ChipMultiPicker: React.FC<{
    opciones: string[];
    seleccion: string[];
    onChange: (nueva: string[]) => void;
    placeholderOtro: string;
}> = ({ opciones, seleccion, onChange, placeholderOtro }) => {
    const [nuevoValor, setNuevoValor] = useState('');
    const toggle = (v: string) => onChange(seleccion.includes(v) ? seleccion.filter(s => s !== v) : [...seleccion, v]);
    const anadir = () => {
        const v = nuevoValor.trim();
        if (!v || seleccion.includes(v)) return;
        onChange([...seleccion, v]);
        setNuevoValor('');
    };
    const extras = seleccion.filter(s => !opciones.includes(s));
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5">
                {opciones.map(op => (
                    <button
                        key={op}
                        type="button"
                        onClick={() => toggle(op)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border transition-colors ${seleccion.includes(op) ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                    >
                        {op}
                    </button>
                ))}
                {extras.map(op => (
                    <span key={op} className="text-xs font-medium px-2 py-1 rounded-full bg-slate-700 text-white inline-flex items-center gap-1">
                        {op}
                        <button type="button" onClick={() => toggle(op)} className="hover:text-red-200" title="Quitar">&times;</button>
                    </span>
                ))}
            </div>
            <div className="flex gap-1.5">
                <Input
                    type="text"
                    value={nuevoValor}
                    onChange={e => setNuevoValor(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } }}
                    placeholder={placeholderOtro}
                />
                <Button type="button" variant="secondary" onClick={anadir}>Añadir</Button>
            </div>
        </div>
    );
};

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

interface GenerarSituacionAprendizajeModalProps {
    isOpen: boolean;
    courseId: string;
    courses: Course[];
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
type SesionesModo = 'fijo' | 'rango';

const GenerarSituacionAprendizajeModal: React.FC<GenerarSituacionAprendizajeModalProps> = ({ isOpen, courseId, courses, onClose, onDraftReady }) => {
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
    const [sesionesModo, setSesionesModo] = useState<SesionesModo>('rango');
    const [sesionesFijo, setSesionesFijo] = useState(6);
    const [sesionesMin, setSesionesMin] = useState(4);
    const [sesionesMax, setSesionesMax] = useState(6);
    // No hay minutos reales guardados en el horario (los periodos son solo
    // etiquetas tipo "1ª hora", sin duración) -- lo indica el profesor a
    // mano, 55 min por defecto.
    const [duracionSesionMin, setDuracionSesionMin] = useState(55);
    const [diagnosticoIncluido, setDiagnosticoIncluido] = useState(false);
    const [diagnosticoMinutos, setDiagnosticoMinutos] = useState(15);
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

    // Perfil docente -- a diferencia de las características del grupo, no
    // depende de ninguna selección: es una única fila global en Preferencias
    // (Ajustes > Configuración del curso académico), la misma para todas las
    // SA. Se muestra y edita aquí también para que el profesor la vea
    // aplicarse sin tener que salir del wizard, pero el guardado es
    // exactamente el mismo (useUpdatePreferences) -- no un borrador propio
    // del wizard.
    const remotePreferences = usePreferences();
    const updatePreferencesMutation = useUpdatePreferences();
    const [perfilDocente, setPerfilDocente] = useState<string[]>([]);

    useEffect(() => {
        if (remotePreferences.data) setPerfilDocente(remotePreferences.data.teacherProfile ?? []);
    }, [remotePreferences.data]);

    const handlePerfilDocenteChange = (nuevo: string[]) => {
        setPerfilDocente(nuevo);
        updatePreferencesMutation.mutate({ teacherProfile: nuevo });
    };

    // Bloque 2: Diseño didáctico.
    const [tiposActividad, setTiposActividad] = useState<string[]>([]);
    const [estructurasCooperativas, setEstructurasCooperativas] = useState<string[]>([]);
    const [actividadesObligatorias, setActividadesObligatorias] = useState<{ texto: string; sesion?: number }[]>([]);
    const [nuevaObligatoriaTexto, setNuevaObligatoriaTexto] = useState('');
    const [nuevaObligatoriaSesion, setNuevaObligatoriaSesion] = useState('');
    const [estructuraSesion, setEstructuraSesion] = useState<'inicio_desarrollo_cierre' | 'rutina_propia' | 'ia' | 'otro'>('ia');
    const [estructuraSesionDetalle, setEstructuraSesionDetalle] = useState('');
    const [progresionAutonomia, setProgresionAutonomia] = useState<'creciente' | 'constante' | 'ia'>('ia');
    const [atencionDiversidad, setAtencionDiversidad] = useState<'diferenciadas' | 'unica' | 'otro'>('diferenciadas');
    const [atencionDiversidadDetalle, setAtencionDiversidadDetalle] = useState('');

    // Bloque 3: Evaluación -- producto final y examen son opcionales
    // (toggle); producto nace marcado porque casi siempre tiene sentido,
    // examen no. El tipo/formato ya no los decide la IA libremente, se
    // eligen de lista cerrada.
    const [productoIncluido, setProductoIncluido] = useState(true);
    const [productoTipo, setProductoTipo] = useState<string>(TIPOS_PRODUCTO_DISPONIBLES[0]);
    const [productoTipoDetalle, setProductoTipoDetalle] = useState('');
    const [examenIncluido, setExamenIncluido] = useState(false);
    const [examenFormato, setExamenFormato] = useState<string>(FORMATOS_EXAMEN_DISPONIBLES[0]);
    const [examenFormatoDetalle, setExamenFormatoDetalle] = useState('');

    // Paso 7 (tras procesar la respuesta): el propio prompt de la SA ya pide
    // el desglose de preguntas/puntos del examen como un elemento más de esa
    // misma respuesta (ver instrumentoExamen en situacion_aprendizaje.py), así
    // que lo normal es llegar aquí con el instrumento ya armado, listo para
    // revisar. Si la respuesta no lo trajo (formatos antiguos, o la IA no lo
    // dio), se ofrece generarlo aparte -- con el mismo modal de siempre
    // (IA local o, si va lenta, IA online). Opcional siempre (se puede
    // saltar), y revisable antes de guardar como el resto de instrumentos
    // generados con IA.
    const remoteCriteria = useEvaluationCriteria(courseId);
    const criteria = remoteCriteria.data ?? [];
    const createToolMutation = useCreateEvaluationTool();
    const [draftPendiente, setDraftPendiente] = useState<ProgrammingUnit | null>(null);
    const [instrumentoDraft, setInstrumentoDraft] = useState<EvaluationTool | null>(null);
    const [showGenerarInstrumentoExamen, setShowGenerarInstrumentoExamen] = useState(false);

    const criteriosDelExamen = (unidad: { finalExam?: FinalExam }) =>
        Array.from(new Set((unidad.finalExam?.bloques || []).flatMap(b => b.linkedCriteriaIds || [])));

    const handleGuardarInstrumentoExamen = async (tool: EvaluationTool) => {
        const { id: _unused, ...data } = tool;
        const creado = await createToolMutation.mutateAsync(data);
        if (draftPendiente) {
            const draftFinal: ProgrammingUnit = {
                ...draftPendiente,
                finalExam: { ...(draftPendiente.finalExam as FinalExam), evaluationToolId: creado.id },
            };
            setInstrumentoDraft(null);
            handleClose();
            onDraftReady(draftFinal);
        }
    };

    const handleSaltarInstrumentoExamen = () => {
        if (draftPendiente) {
            handleClose();
            onDraftReady(draftPendiente);
        }
    };

    const anadirActividadObligatoria = () => {
        const texto = nuevaObligatoriaTexto.trim();
        if (!texto) return;
        const sesion = nuevaObligatoriaSesion.trim() ? parseInt(nuevaObligatoriaSesion, 10) : undefined;
        setActividadesObligatorias(prev => [...prev, { texto, sesion }]);
        setNuevaObligatoriaTexto('');
        setNuevaObligatoriaSesion('');
    };

    const quitarActividadObligatoria = (index: number) => {
        setActividadesObligatorias(prev => prev.filter((_, i) => i !== index));
    };

    const textoEntrada = modo === 'documento' ? documento : descripcion;
    const productoTipoResuelto = productoTipo === 'Otro' ? (productoTipoDetalle.trim() || 'Otro') : productoTipo;
    const examenFormatoResuelto = examenFormato === 'Otro' ? (examenFormatoDetalle.trim() || 'Otro') : examenFormato;

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
        setSesionesModo('rango');
        setDuracionSesionMin(55);
        setDiagnosticoIncluido(false);
        setDiagnosticoMinutos(15);
        setClassId('');
        setCaracteristicasGrupo([]);
        setTiposActividad([]);
        setEstructurasCooperativas([]);
        setActividadesObligatorias([]);
        setEstructuraSesion('ia');
        setEstructuraSesionDetalle('');
        setProgresionAutonomia('ia');
        setAtencionDiversidad('diferenciadas');
        setAtencionDiversidadDetalle('');
        setProductoIncluido(true);
        setProductoTipo(TIPOS_PRODUCTO_DISPONIBLES[0]);
        setProductoTipoDetalle('');
        setExamenIncluido(false);
        setExamenFormato(FORMATOS_EXAMEN_DISPONIBLES[0]);
        setExamenFormatoDetalle('');
        setDraftPendiente(null);
        setInstrumentoDraft(null);
        setShowGenerarInstrumentoExamen(false);
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
                body: JSON.stringify(payloadGeneracion()),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const data: { prompt: string; mapa: Record<string, string> } = await response.json();
            setResultado(data);
            setPaso(5);
        } catch (err) {
            setErrorPaso1(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerando(false);
        }
    };

    // Compartido por la vía de copiar/pegar (handleProcesarRespuesta) y por
    // Groq (handleGenerarConGroq) -- ambas acaban con la misma forma de
    // respuesta ({unidad, codigosDescartados, instrumentoExamen}), solo
    // cambia cómo se consigue.
    const entregarUnidadGenerada = (data: {
        unidad: {
            name: string;
            context: string;
            sessions: number;
            sessionDetails: SessionDetail[];
            finalProduct: FinalProduct;
            finalExam: FinalExam;
            linkedBasicKnowledgeIds: string[];
            linkedCriteriaIds: string[];
            linkedSpecificCompetenceIds: string[];
        };
        codigosDescartados: string[];
        instrumentoExamen: Omit<EvaluationTool, 'id'> | null;
    }) => {
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
            context: data.unidad.context,
            sessionDetails: data.unidad.sessionDetails,
            linkedCriteriaIds: data.unidad.linkedCriteriaIds,
            linkedBasicKnowledgeIds: data.unidad.linkedBasicKnowledgeIds,
            linkedSpecificCompetenceIds: data.unidad.linkedSpecificCompetenceIds,
            finalProduct: data.unidad.finalProduct,
            finalExam: data.unidad.finalExam,
            startDate: '',
        };

        // Si el examen final tiene criterios, se pasa por el Paso 7 --
        // normalmente ya con el instrumento listo para revisar (ver
        // arriba), o si no, con la opción de generarlo aparte. Si no hay
        // examen con criterios, se entrega directo como hasta ahora.
        if (draft.finalExam?.incluido && criteriosDelExamen(draft).length > 0) {
            setDraftPendiente(draft);
            if (data.instrumentoExamen) {
                setInstrumentoDraft({ ...data.instrumentoExamen, id: 'draft' } as EvaluationTool);
            }
            setPaso(7);
        } else {
            handleClose();
            onDraftReady(draft);
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
            entregarUnidadGenerada(await response.json());
        } catch (err) {
            setErrorPaso3(err instanceof Error ? err.message : String(err));
        } finally {
            setProcesando(false);
        }
    };

    // Payload compartido por /generar (prompt para copiar/pegar) y
    // /generar-groq (llamada directa) -- mismos campos, solo cambia el
    // endpoint y qué se hace con la respuesta.
    const payloadGeneracion = () => ({
        course_id: courseId, documento: textoEntrada, modo,
        sesiones_modo: sesionesModo,
        sesiones_fijo: sesionesModo === 'fijo' ? sesionesFijo : undefined,
        sesiones_min: sesionesModo === 'rango' ? sesionesMin : undefined,
        sesiones_max: sesionesModo === 'rango' ? sesionesMax : undefined,
        caracteristicas_grupo: caracteristicasGrupo,
        tipos_actividad: tiposActividad,
        estructuras_cooperativas: tiposActividad.includes('Trabajo cooperativo/grupal') ? estructurasCooperativas : [],
        actividades_obligatorias: actividadesObligatorias.map(a => ({ texto: a.texto, sesion: a.sesion })),
        estructura_sesion: estructuraSesion,
        estructura_sesion_detalle: (estructuraSesion === 'rutina_propia' || estructuraSesion === 'otro') ? estructuraSesionDetalle : undefined,
        progresion_autonomia: progresionAutonomia,
        atencion_diversidad: atencionDiversidad,
        atencion_diversidad_detalle: atencionDiversidad === 'otro' ? atencionDiversidadDetalle : undefined,
        class_id: classId || undefined,
        producto_incluido: productoIncluido,
        producto_tipo: productoIncluido ? productoTipoResuelto : undefined,
        examen_incluido: examenIncluido,
        examen_formato: examenIncluido ? examenFormatoResuelto : undefined,
        duracion_sesion_min: duracionSesionMin,
        diagnostico_incluido: diagnosticoIncluido,
        diagnostico_minutos: diagnosticoIncluido ? diagnosticoMinutos : undefined,
    });

    // Vía rápida con Groq -- solo funciona para SA pequeñas (el currículo
    // completo del curso ya ocupa buena parte del presupuesto gratuito de
    // Groq, antes incluso de contar sesiones/producto/examen -- ver nota en
    // situacion_aprendizaje.py). Si no cabe, el backend lo dice con
    // claridad y aquí se deja tal cual como error -- copiar/pegar sigue
    // siendo la vía por defecto (botón principal) precisamente por esto.
    const [probandoGroq, setProbandoGroq] = useState(false);
    const [errorGroq, setErrorGroq] = useState<string | null>(null);

    const handleGenerarConGroq = async () => {
        setProbandoGroq(true);
        setErrorGroq(null);
        try {
            const response = await fetch('/api/prompts/unidad-programacion/generar-groq', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadGeneracion()),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.documentoResumido) {
                window.alert(
                    'El documento era demasiado largo para Groq y se ha resumido automáticamente antes de ' +
                    'generar -- revisa que la unidad no se haya dejado nada importante fuera.'
                );
            }
            entregarUnidadGenerada(data);
        } catch (err) {
            setErrorGroq(err instanceof Error ? err.message : String(err));
        } finally {
            setProbandoGroq(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Generar Situación de Aprendizaje con IA" size="3xl" accent="sand">
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <SparklesIcon className="w-4 h-4" />
                    {paso <= 6 ? `Paso ${paso} de 6` : 'Instrumento del examen'}
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
                                    ¡Sube o pega tus contenidos a trabajar (temario, unidad o material didáctico ya
                                    creado). Si lo deseas, puedes incluir también la metodología y la evaluación. Se
                                    generará un prompt optimizado junto con el currículo oficial para tu IA.
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
                                {(['fijo', 'rango'] as SesionesModo[]).map(opcion => (
                                    <button
                                        key={opcion}
                                        type="button"
                                        onClick={() => setSesionesModo(opcion)}
                                        className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${sesionesModo === opcion ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                    >
                                        {opcion === 'fijo' ? 'Número fijo' : 'Rango orientativo'}
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
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-sm text-slate-500">Duración de cada sesión:</span>
                                <div className="w-20"><Input type="number" min={1} value={duracionSesionMin} onChange={e => setDuracionSesionMin(parseInt(e.target.value, 10) || 1)} /></div>
                                <span className="text-sm text-slate-500">min</span>
                            </div>
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

                        <div>
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-1.5">
                                <input type="checkbox" checked={diagnosticoIncluido} onChange={e => setDiagnosticoIncluido(e.target.checked)} className="rounded border-slate-300" />
                                Reservar tiempo en la primera sesión para diagnóstico de conocimientos previos
                            </label>
                            {diagnosticoIncluido && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-500">Minutos reservados:</span>
                                    <div className="w-20"><Input type="number" min={1} value={diagnosticoMinutos} onChange={e => setDiagnosticoMinutos(parseInt(e.target.value, 10) || 1)} /></div>
                                </div>
                            )}
                            <p className="text-xs text-slate-500 mt-1.5">
                                Comprueba lo que el alumnado ya debería saber de las SA anteriores de este curso
                                (se le pasan a la IA automáticamente, ver Paso 4).
                            </p>
                        </div>

                        <div className="pt-2 border-t">
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Tu perfil como docente</p>
                            <p className="text-xs text-slate-500 mb-1.5">
                                Se guarda en Ajustes y se reutiliza en todas las SA -- si lo cambias aquí, se guarda igual.
                            </p>
                            <ChipMultiPicker
                                opciones={RASGOS_DOCENTE_HABITUALES}
                                seleccion={perfilDocente}
                                onChange={handlePerfilDocenteChange}
                                placeholderOtro="Otro rasgo..."
                            />
                        </div>

                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(1)}>Atrás</Button>
                            <Button type="button" onClick={() => setPaso(3)}>Siguiente</Button>
                        </div>
                    </div>
                )}

                {paso === 3 && (
                    <div className="flex flex-col gap-4">
                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Tipos de actividad</p>
                            <ChipMultiPicker
                                opciones={TIPOS_ACTIVIDAD_DISPONIBLES}
                                seleccion={tiposActividad}
                                onChange={setTiposActividad}
                                placeholderOtro="Otro tipo de actividad..."
                            />
                        </div>

                        {tiposActividad.includes('Trabajo cooperativo/grupal') && (
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-1.5">Estructuras cooperativas preferidas</p>
                                <ChipMultiPicker
                                    opciones={ESTRUCTURAS_COOPERATIVAS_DISPONIBLES}
                                    seleccion={estructurasCooperativas}
                                    onChange={setEstructurasCooperativas}
                                    placeholderOtro="Otra estructura..."
                                />
                            </div>
                        )}

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Actividades que quieres incluir sí o sí</p>
                            {actividadesObligatorias.length > 0 && (
                                <div className="flex flex-col gap-1 mb-1.5">
                                    {actividadesObligatorias.map((a, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 border rounded-md px-2 py-1">
                                            <span className="flex-1">{a.texto}</span>
                                            <span className="text-xs text-slate-400">{a.sesion ? `Sesión ${a.sesion}` : 'Automáticamente'}</span>
                                            <button type="button" onClick={() => quitarActividadObligatoria(i)} className="text-red-400 hover:text-red-600">&times;</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex gap-1.5">
                                <Input
                                    type="text"
                                    value={nuevaObligatoriaTexto}
                                    onChange={e => setNuevaObligatoriaTexto(e.target.value)}
                                    placeholder="Ej.: Realizar una práctica de identificación de nutrientes"
                                    className="flex-1"
                                />
                                <div className="w-28"><Input type="number" min={1} value={nuevaObligatoriaSesion} onChange={e => setNuevaObligatoriaSesion(e.target.value)} placeholder="Sesión (op.)" /></div>
                                <Button type="button" variant="secondary" onClick={anadirActividadObligatoria}>Añadir</Button>
                            </div>
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Estructura de cada sesión</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {([
                                    ['inicio_desarrollo_cierre', 'Inicio-Desarrollo-Cierre'],
                                    ['rutina_propia', 'Mi rutina habitual'],
                                    ['ia', 'Que la IA la diseñe'],
                                    ['otro', 'Otra'],
                                ] as const).map(([valor, etiqueta]) => (
                                    <button
                                        key={valor}
                                        type="button"
                                        onClick={() => setEstructuraSesion(valor)}
                                        className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${estructuraSesion === valor ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                    >
                                        {etiqueta}
                                    </button>
                                ))}
                            </div>
                            {(estructuraSesion === 'rutina_propia' || estructuraSesion === 'otro') && (
                                <div className="mt-2">
                                    <Input type="text" value={estructuraSesionDetalle} onChange={e => setEstructuraSesionDetalle(e.target.value)} placeholder="Describe la estructura que quieres utilizar..." />
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Progresión de autonomía</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {([
                                    ['creciente', 'Creciente'],
                                    ['constante', 'Constante'],
                                    ['ia', 'Que la IA la decida'],
                                ] as const).map(([valor, etiqueta]) => (
                                    <button
                                        key={valor}
                                        type="button"
                                        onClick={() => setProgresionAutonomia(valor)}
                                        className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${progresionAutonomia === valor ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                    >
                                        {etiqueta}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1.5">Atención a la diversidad</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {([
                                    ['diferenciadas', 'Actividades diferenciadas'],
                                    ['unica', 'Una única vía para todo el grupo'],
                                    ['otro', 'Otro'],
                                ] as const).map(([valor, etiqueta]) => (
                                    <button
                                        key={valor}
                                        type="button"
                                        onClick={() => setAtencionDiversidad(valor)}
                                        className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${atencionDiversidad === valor ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                    >
                                        {etiqueta}
                                    </button>
                                ))}
                            </div>
                            {atencionDiversidad === 'otro' && (
                                <div className="mt-2">
                                    <Input type="text" value={atencionDiversidadDetalle} onChange={e => setAtencionDiversidadDetalle(e.target.value)} placeholder="Describe el planteamiento..." />
                                </div>
                            )}
                            {classId && (
                                <p className="text-xs text-slate-500 mt-2">
                                    Si hay adaptaciones NEAE anotadas en el grupo elegido, se incluirán agregadas (sin
                                    nombres) para que la IA proponga variantes de actividad cuando corresponda.
                                </p>
                            )}
                        </div>

                        <div className="pt-2 border-t">
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-1.5">
                                <input type="checkbox" checked={productoIncluido} onChange={e => setProductoIncluido(e.target.checked)} className="rounded border-slate-300" />
                                Incluir producto final
                            </label>
                            {productoIncluido && (
                                <>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {[...TIPOS_PRODUCTO_DISPONIBLES, 'Otro'].map(tipo => (
                                            <button
                                                key={tipo}
                                                type="button"
                                                onClick={() => setProductoTipo(tipo)}
                                                className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${productoTipo === tipo ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                            >
                                                {tipo}
                                            </button>
                                        ))}
                                    </div>
                                    {productoTipo === 'Otro' && (
                                        <div className="mt-2">
                                            <Input type="text" value={productoTipoDetalle} onChange={e => setProductoTipoDetalle(e.target.value)} placeholder="Describe el tipo de producto..." />
                                        </div>
                                    )}
                                    <p className="text-xs text-slate-500 mt-1.5">
                                        La descripción del producto y la situación de partida las decide la IA, coherentes con este tipo.
                                    </p>
                                </>
                            )}
                        </div>

                        <div>
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-1.5">
                                <input type="checkbox" checked={examenIncluido} onChange={e => setExamenIncluido(e.target.checked)} className="rounded border-slate-300" />
                                Incluir examen final
                            </label>
                            {examenIncluido && (
                                <>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {[...FORMATOS_EXAMEN_DISPONIBLES, 'Otro'].map(formato => (
                                            <button
                                                key={formato}
                                                type="button"
                                                onClick={() => setExamenFormato(formato)}
                                                className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${examenFormato === formato ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                            >
                                                {formato}
                                            </button>
                                        ))}
                                    </div>
                                    {examenFormato === 'Otro' && (
                                        <div className="mt-2">
                                            <Input type="text" value={examenFormatoDetalle} onChange={e => setExamenFormatoDetalle(e.target.value)} placeholder="Describe el formato del examen..." />
                                        </div>
                                    )}
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
                            <Button type="button" variant="secondary" onClick={() => setPaso(2)}>Atrás</Button>
                            <Button type="button" onClick={() => setPaso(4)}>Revisar</Button>
                        </div>
                    </div>
                )}

                {paso === 4 && (
                    <div className="flex flex-col gap-4">
                        <p className="text-sm text-slate-600">
                            Repasa lo que vas a pedirle a la IA antes de generar el prompt.
                        </p>

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1">Contenido</p>
                            <ul className="text-sm text-slate-600 space-y-0.5">
                                <li>
                                    · Modo: {modo === 'documento'
                                        ? `Tengo material (${textoEntrada.length.toLocaleString('es-ES')} caracteres)`
                                        : `La IA genera los contenidos (${textoEntrada.length.toLocaleString('es-ES')} caracteres de descripción)`}
                                </li>
                            </ul>
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1">Planificación</p>
                            <ul className="text-sm text-slate-600 space-y-0.5">
                                <li>
                                    · Sesiones: {sesionesModo === 'fijo'
                                        ? `${sesionesFijo} (tú decides)`
                                        : `entre ${sesionesMin} y ${sesionesMax} (tú decides el rango)`}
                                </li>
                                <li>· Duración de cada sesión: {duracionSesionMin} min</li>
                                <li>
                                    · Diagnóstico de conocimientos previos: {diagnosticoIncluido
                                        ? `Sí, ${diagnosticoMinutos} min en la primera sesión`
                                        : 'No'}
                                </li>
                                <li>· Grupo: {clasesDelCurso.find(c => c.id === classId)?.grupo || 'sin grupo seleccionado'}</li>
                                <li>· Características del grupo: {caracteristicasGrupo.length > 0 ? caracteristicasGrupo.join(', ') : 'ninguna'}</li>
                                <li>· Tu perfil docente: {perfilDocente.length > 0 ? perfilDocente.join(', ') : 'sin definir'}</li>
                            </ul>
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1">Diseño didáctico</p>
                            <ul className="text-sm text-slate-600 space-y-0.5">
                                <li>· Tipos de actividad: {tiposActividad.length > 0 ? tiposActividad.join(', ') : 'que decida la IA'}</li>
                                {tiposActividad.includes('Trabajo cooperativo/grupal') && (
                                    <li>· Estructuras cooperativas: {estructurasCooperativas.length > 0 ? estructurasCooperativas.join(', ') : 'que decida la IA'}</li>
                                )}
                                <li>· Actividades obligatorias: {actividadesObligatorias.length > 0 ? actividadesObligatorias.length : 'ninguna'}</li>
                                <li>
                                    · Estructura de sesión: {estructuraSesion === 'ia'
                                        ? 'que decida la IA'
                                        : estructuraSesion === 'inicio_desarrollo_cierre'
                                            ? 'Inicio-Desarrollo-Cierre (tú decides)'
                                            : `${estructuraSesionDetalle || 'personalizada'} (tú decides)`}
                                </li>
                                <li>
                                    · Progresión de autonomía: {progresionAutonomia === 'ia'
                                        ? 'que decida la IA'
                                        : progresionAutonomia === 'creciente' ? 'Creciente (tú decides)' : 'Constante (tú decides)'}
                                </li>
                                <li>
                                    · Atención a la diversidad: {atencionDiversidad === 'diferenciadas'
                                        ? 'Actividades diferenciadas (tú decides)'
                                        : atencionDiversidad === 'unica'
                                            ? 'Una única vía para el grupo (tú decides)'
                                            : `${atencionDiversidadDetalle || 'Otro'} (tú decides)`}
                                </li>
                            </ul>
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-1">Evaluación</p>
                            <ul className="text-sm text-slate-600 space-y-0.5">
                                <li>
                                    · Producto final: {productoIncluido
                                        ? `Sí, tipo ${productoTipoResuelto} (tú eliges el tipo, la IA redacta la descripción)`
                                        : 'No'}
                                </li>
                                <li>
                                    · Examen final: {examenIncluido
                                        ? `Sí, formato ${examenFormatoResuelto} (tú eliges el formato, la IA diseña los bloques)`
                                        : 'No'}
                                </li>
                            </ul>
                        </div>

                        {errorPaso1 && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {errorPaso1}
                            </p>
                        )}
                        {errorGroq && (
                            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                {errorGroq} Sigue con "Generar prompt" para copiar/pegar en su lugar.
                            </p>
                        )}
                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(3)}>Atrás</Button>
                            <div className="flex gap-2">
                                <Button type="button" variant="secondary" onClick={handleGenerarConGroq} disabled={probandoGroq || generando}>
                                    {probandoGroq ? 'Probando con Groq...' : 'Probar con Groq (rápido, solo SA pequeñas)'}
                                </Button>
                                <Button type="button" onClick={handleGenerarPrompt} disabled={generando || probandoGroq}>
                                    {generando ? 'Generando...' : 'Generar prompt'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {paso === 5 && resultado && (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-slate-600">
                            Copia este prompt y pégalo en tu IA online de confianza.
                        </p>
                        <Textarea value={resultado.prompt} readOnly rows={14} className="font-mono text-sm bg-slate-50" />
                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(4)}>Atrás</Button>
                            <div className="flex gap-2">
                                <CopyButton texto={resultado.prompt} />
                                <Button type="button" onClick={() => setPaso(6)}>Siguiente</Button>
                            </div>
                        </div>
                    </div>
                )}

                {paso === 6 && (
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
                            <Button type="button" variant="secondary" onClick={() => setPaso(5)}>Atrás</Button>
                            <Button type="button" onClick={handleProcesarRespuesta} disabled={!respuestaIA.trim() || procesando}>
                                {procesando ? 'Procesando...' : 'Continuar a revisión'}
                            </Button>
                        </div>
                    </div>
                )}

                {paso === 7 && draftPendiente && (
                    <div className="flex flex-col gap-3">
                        {!instrumentoDraft ? (
                            <>
                                <p className="text-sm text-slate-600">
                                    El examen final tiene {criteriosDelExamen(draftPendiente).length} criterio(s) de
                                    evaluación vinculado(s), pero la respuesta no incluyó el desglose de preguntas con
                                    puntos. ¿Generar su instrumento (Examen criterial) antes de guardar la SA?
                                </p>
                                <div className="flex justify-between">
                                    <Button type="button" variant="secondary" onClick={handleSaltarInstrumentoExamen}>
                                        Continuar sin generarlo
                                    </Button>
                                    <Button type="button" onClick={() => setShowGenerarInstrumentoExamen(true)}>
                                        Generar examen criterial
                                    </Button>
                                </div>
                                <GenerarInstrumentoIAModal
                                    isOpen={showGenerarInstrumentoExamen}
                                    onClose={() => setShowGenerarInstrumentoExamen(false)}
                                    courseId={courseId}
                                    linkedCriteriaIds={criteriosDelExamen(draftPendiente)}
                                    contexto={`Examen final${draftPendiente.finalExam?.formato ? `: ${draftPendiente.finalExam.formato}` : ''} de la SA "${draftPendiente.name}"`}
                                    documentoClaseInicial={textoEntrada}
                                    onDraftReady={setInstrumentoDraft}
                                />
                            </>
                        ) : (
                            <EvaluationToolEditorModal
                                isOpen={true}
                                onClose={handleSaltarInstrumentoExamen}
                                onSave={handleGuardarInstrumentoExamen}
                                toolToEdit={instrumentoDraft}
                                criteria={criteria}
                                courses={courses.filter(c => c.id === courseId)}
                            />
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default GenerarSituacionAprendizajeModal;
