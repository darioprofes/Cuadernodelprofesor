
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { EvaluationTool, EvaluationLevel, BaseEvaluationItem, EvaluationCriterion, Course, ProgrammingUnit } from '../types';
import { PencilIcon, TrashIcon, PlusIcon, LinkIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, ChevronDownIcon, ClipboardDocumentCheckIcon, ChartBarIcon, TableCellsIcon, AcademicCapIcon } from './Icons';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';
import { checkboxClassName } from '../theme/components/Input';
import { linkClassName } from '../theme/components/Link';
import { SparklesIcon } from './Icons';
import GenerarInstrumentoIAModal from './GenerarInstrumentoIAModal';
import SeleccionarActividadSAModal from './SeleccionarActividadSAModal';
import { PALETTE, type AccentColor } from '../theme/palette';
import type { ResultadoTrabajoInstrumento } from '../hooks/useTrabajosIA';
import { useCreateEvaluationTool } from '../hooks/useEvaluationTools';
import { useProgrammingUnitsForCourses, useUpdateProgrammingUnit } from '../hooks/useProgrammingUnits';
import { programmingUnitFromApi } from '../services/apiAdapters';
import {
    buildInstrumentoExportPayload, instrumentoExportFilename, parseInstrumentoImportPayload, resolverInstrumento,
    type ItemSA, type UbicacionItemSA,
} from '../services/programmingUnitShare';
import { sugerirCriteriosConGroq } from '../services/generarInstrumentoIA';

// Forma "de borrador" usada mientras se edita un instrumento: unifica
// BaseEvaluationItem y RubricItem en un único tipo con `levelDescriptions`
// opcional (en vez de `any`, que es como estaba tipado antes) — checklist/
// rating_scale/rubric comparten el mismo formulario y solo rubric usa ese
// campo, pero el usuario puede cambiar de tipo a media edición.
interface ToolItemDraft extends BaseEvaluationItem {
    levelDescriptions?: Record<string, string>;
}

interface ToolDraft {
    id?: string;
    name: string;
    type: 'checklist' | 'rating_scale' | 'rubric' | 'criterial_exam';
    courseId?: string;
    items: ToolItemDraft[];
    levels?: EvaluationLevel[];
}

interface EvaluationToolManagerProps {
    evaluationTools: EvaluationTool[];
    onCreate: (data: Omit<EvaluationTool, 'id'>) => void;
    onUpdate: (id: string, data: Omit<EvaluationTool, 'id'>) => void;
    onDelete: (id: string) => void;
    criteria: EvaluationCriterion[];
    courses: Course[];
    // Resultado de un trabajo de IA en segundo plano (ver TrabajosIAPanel.tsx
    // en HoyView) pendiente de revisar -- se precarga igual que un
    // instrumento recién generado con el flujo normal (handleInstrumentoGenerado).
    pendingResultado?: { courseId: string; resultado: ResultadoTrabajoInstrumento } | null;
    onPendingResultadoConsumido?: () => void;
}

const EvaluationToolManager: React.FC<EvaluationToolManagerProps> = ({ evaluationTools, onCreate, onUpdate, onDelete, criteria, courses, pendingResultado, onPendingResultadoConsumido }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [toolToEdit, setToolToEdit] = useState<EvaluationTool | null>(null);
    const fileImportRef = useRef<HTMLInputElement>(null);
    // Instrumento recién generado con IA (fuera del contexto de una SA, ver
    // más abajo) pendiente de revisar en el mismo formulario de edición de
    // siempre -- se precarga como toolToEdit para reutilizar el formulario
    // tal cual, pero debe GUARDARSE como nuevo (onCreate), no como
    // actualización de un instrumento real (onUpdate), así que necesita
    // distinguirse aparte.
    const [instrumentoGeneradoPendiente, setInstrumentoGeneradoPendiente] = useState(false);
    // Origen del instrumento a generar: criterios elegidos a mano (de
    // siempre), o una actividad/producto/examen concreto de una SA (nuevo --
    // hereda criterios y contexto, y al guardar enlaza el instrumento de
    // vuelta a ese elemento, ver handleSave). El botón "Generar con IA"
    // pregunta primero cuál de los dos antes de abrir nada.
    const [showOrigenGenerarIA, setShowOrigenGenerarIA] = useState(false);
    const [showCriteriaPickerParaIA, setShowCriteriaPickerParaIA] = useState(false);
    const [showSeleccionarActividadSA, setShowSeleccionarActividadSA] = useState(false);
    const [criteriosParaIA, setCriteriosParaIA] = useState<{ courseId: string; ids: string[] } | null>(null);
    const [contextoParaIA, setContextoParaIA] = useState<string | undefined>(undefined);
    const [origenSA, setOrigenSA] = useState<{ unit: ProgrammingUnit; item: ItemSA } | null>(null);
    const [showGenerarIA, setShowGenerarIA] = useState(false);
    // Paso "describir y que la IA proponga criterios": primero se pide la
    // descripción (este modal), luego se llama a sugerirCriteriosConGroq y
    // el resultado se revisa/ajusta en el MISMO CriteriaSelectorModal de
    // elegir a mano (selectedIds precargado con la sugerencia) -- nunca se
    // salta directo a generar el instrumento sin que el profesor vea y
    // pueda tocar qué criterios se usaron.
    const [showDescribir, setShowDescribir] = useState(false);
    const [descripcionParaSugerir, setDescripcionParaSugerir] = useState('');
    const [sugiriendoCriterios, setSugiriendoCriterios] = useState(false);
    const [errorSugerencia, setErrorSugerencia] = useState<string | null>(null);
    // Recuerda la descripción y la materia mientras se revisan los criterios
    // sugeridos en CriteriaSelectorModal, para poder pasarla como contexto
    // al generar el instrumento una vez confirmados.
    const [sugerenciaPendiente, setSugerenciaPendiente] = useState<{ courseId: string; descripcion: string } | null>(null);
    const createToolMutation = useCreateEvaluationTool();
    const updateUnitMutation = useUpdateProgrammingUnit();
    // Todas las SA de todas las materias -- Instrumentos de Evaluación no
    // tiene una materia activa (a diferencia de ProgrammingManager.tsx),
    // así que hace falta cargarlas todas para poder elegir cualquiera aquí.
    const programmingUnitsQueries = useProgrammingUnitsForCourses(courses.map(c => c.id));
    const programmingUnits = useMemo(
        () => programmingUnitsQueries.flatMap(q => (q.data ?? []).map(programmingUnitFromApi)),
        [programmingUnitsQueries]
    );
    // Buscador + filtro por materia: con muchos instrumentos, una lista
    // plana por tipo se vuelve difícil de recorrer (petición explícita del
    // usuario). '' = todas las materias, 'sin-materia' = solo los que no
    // tienen courseId todavía (la mayoría, mientras no se hayan revisado
    // uno a uno tras la migración).
    const [busqueda, setBusqueda] = useState('');
    const [filtroMateriaId, setFiltroMateriaId] = useState('');
    const materiasDisponibles = courses.filter(c => c.type !== 'other');

    // Reescribe evaluationToolId en el elemento de la SA del que salió este
    // instrumento (actividad/producto/examen) -- mismo patrón que
    // handleImportarSAFile en ProgrammingManager.tsx: PATCH parcial con solo
    // el campo tocado para producto/examen; para una actividad hace falta
    // mandar sessionDetails completo (no hay una columna aparte por
    // actividad), con solo esa actividad modificada, copia inmutable.
    const enlazarInstrumentoConOrigen = async (unit: ProgrammingUnit, ubicacion: UbicacionItemSA, toolId: string) => {
        if (ubicacion.tipo === 'producto') {
            await updateUnitMutation.mutateAsync({
                id: unit.id, courseId: unit.courseId,
                data: { finalProduct: { ...(unit.finalProduct ?? { incluido: true }), evaluationToolId: toolId } },
            });
        } else if (ubicacion.tipo === 'examen') {
            await updateUnitMutation.mutateAsync({
                id: unit.id, courseId: unit.courseId,
                data: { finalExam: { ...(unit.finalExam ?? { incluido: true }), evaluationToolId: toolId } },
            });
        } else {
            const sessionDetails = unit.sessionDetails.map((sd, si) => si !== ubicacion.sessionIndex ? sd : {
                ...sd,
                actividades: sd.actividades.map((act, ai) => ai !== ubicacion.activityIndex ? act : { ...act, evaluationToolId: toolId }),
            });
            await updateUnitMutation.mutateAsync({ id: unit.id, courseId: unit.courseId, data: { sessionDetails } });
        }
    };

    const handleSave = async (tool: EvaluationTool) => {
        if (toolToEdit && !instrumentoGeneradoPendiente) {
            // criterionScores de una nota basada en instrumento se deriva
            // siempre en caliente a partir de toolResults + la definición
            // VIGENTE del instrumento (ver services/apiAdapters.ts,
            // decodeGrade), así que no hay nada que recalcular ni
            // reguardar aquí en ninguna plataforma: el siguiente GET ya usa
            // la definición nueva.
            const { id, ...data } = tool;
            onUpdate(id, data);
        } else if (origenSA) {
            // Generado a partir de un elemento de una SA: se crea aparte
            // (no con el onCreate genérico) para tener el id real y poder
            // enlazarlo de vuelta a ese elemento -- mismo cierre del
            // círculo que si se hubiera generado desde dentro del editor de
            // la SA (InstrumentoSelectConIA en ProgrammingManager.tsx).
            const { id: _unused, ...data } = tool;
            const creado = await createToolMutation.mutateAsync(data);
            await enlazarInstrumentoConOrigen(origenSA.unit, origenSA.item.ubicacion, creado.id);
        } else {
            const { id: _unused, ...data } = tool;
            onCreate(data);
        }
        setIsModalOpen(false);
        setInstrumentoGeneradoPendiente(false);
        setOrigenSA(null);
    };

    const handleEditExisting = (tool: EvaluationTool) => {
        setInstrumentoGeneradoPendiente(false);
        setToolToEdit(tool);
    };

    // Paso 1 de "describir lo que se quiere evaluar": pide la descripción.
    // Como aquí no hay ningún criterio ya elegido del que deducir la
    // materia, se usa el filtro de materia de la lista (mismo criterio que
    // la importación JSON, más abajo) -- sin uno real elegido no hay curso
    // al que preguntar por sus criterios.
    const handleDescribirParaIA = () => {
        setShowOrigenGenerarIA(false);
        if (!filtroMateriaId || filtroMateriaId === 'sin-materia') {
            alert('Elige primero una materia en el filtro de arriba ("Todas las materias") -- ahí es donde la IA buscará los criterios.');
            return;
        }
        setDescripcionParaSugerir('');
        setErrorSugerencia(null);
        setShowDescribir(true);
    };

    // Paso 2: llama a la IA para que proponga criterios a partir de la
    // descripción, y abre el MISMO selector de criterios de elegir a mano
    // (más abajo) con esa sugerencia ya marcada -- el profesor la revisa y
    // ajusta ahí, nunca se genera el instrumento a partir de una selección
    // que no ha visto.
    const handleSugerirCriterios = async () => {
        if (!descripcionParaSugerir.trim() || filtroMateriaId === '' || filtroMateriaId === 'sin-materia') return;
        setSugiriendoCriterios(true);
        setErrorSugerencia(null);
        try {
            const { criterionIds, codigosDescartados } = await sugerirCriteriosConGroq(filtroMateriaId, descripcionParaSugerir.trim());
            if (codigosDescartados.length > 0) {
                console.warn('Códigos de criterio descartados en la sugerencia:', codigosDescartados);
            }
            setSugerenciaPendiente({ courseId: filtroMateriaId, descripcion: descripcionParaSugerir.trim() });
            setShowDescribir(false);
            setShowCriteriaPickerParaIA(true);
            // criteriosParaIA aquí solo sirve para precargar el selector con
            // la sugerencia (selectedIds) -- handleCriteriosElegidosParaIA
            // decide el destino real al confirmar, usando sugerenciaPendiente.
            setCriteriosParaIA({ courseId: filtroMateriaId, ids: criterionIds });
        } catch (err) {
            setErrorSugerencia(err instanceof Error ? err.message : String(err));
        } finally {
            setSugiriendoCriterios(false);
        }
    };

    // Confirmación de criterios (elegidos a mano desde cero, O revisados
    // tras una sugerencia de la IA -- sugerenciaPendiente distingue cuál de
    // los dos es). El curso se deduce del primer criterio elegido, salvo
    // que venga de una sugerencia (ahí ya se sabe, y hace falta de todas
    // formas para poder confirmar con cero criterios marcados).
    const handleCriteriosElegidosParaIA = (ids: string[]) => {
        setShowCriteriaPickerParaIA(false);
        const sugerencia = sugerenciaPendiente;
        setSugerenciaPendiente(null);
        const courseId = sugerencia?.courseId ?? criteria.find(c => ids.includes(c.id))?.courseId;
        if (!courseId) return;
        if (ids.length === 0 && !sugerencia) return;
        setOrigenSA(null);
        setContextoParaIA(sugerencia?.descripcion);
        setCriteriosParaIA({ courseId, ids });
        setShowGenerarIA(true);
    };

    // Elegir una actividad/producto/examen de una SA: hereda sus criterios
    // Y su descripción como contexto para la IA (a diferencia de la
    // elección manual de arriba, que no tiene contexto que ofrecer).
    const handleActividadSASeleccionada = ({ unit, item }: { unit: ProgrammingUnit; item: ItemSA }) => {
        setShowSeleccionarActividadSA(false);
        setOrigenSA({ unit, item });
        setContextoParaIA(item.contexto || undefined);
        setCriteriosParaIA({ courseId: unit.courseId, ids: item.linkedCriteriaIds });
        setShowGenerarIA(true);
    };

    const handleInstrumentoGenerado = (draft: EvaluationTool) => {
        setShowGenerarIA(false);
        setInstrumentoGeneradoPendiente(true);
        // La IA ya generó el instrumento a partir de criterios de una
        // materia concreta -- se le asigna directamente, sin obligar a
        // repetir la elección que ya se hizo en el selector de criterios.
        setToolToEdit({ ...draft, courseId: criteriosParaIA?.courseId });
        setIsModalOpen(true);
    };

    // "Resumir" un trabajo de la cola (ver TrabajosIAPanel.tsx): mismo
    // destino que handleInstrumentoGenerado (precargar el formulario de
    // edición para crear como nuevo), pero el courseId viene ya resuelto
    // del propio trabajo en vez de deducirse de criteriosParaIA (aquí no
    // hubo selector de criterios de por medio). `ultimoResumidoRef` evita
    // procesarlo dos veces bajo React StrictMode -- ver la misma guarda en
    // GenerarSituacionAprendizajeModal.tsx para el porqué.
    const ultimoResumidoRef = useRef<typeof pendingResultado>(null);
    useEffect(() => {
        if (pendingResultado && pendingResultado !== ultimoResumidoRef.current) {
            ultimoResumidoRef.current = pendingResultado;
            setInstrumentoGeneradoPendiente(true);
            setToolToEdit({ ...pendingResultado.resultado.instrumento, id: 'draft', courseId: pendingResultado.courseId } as EvaluationTool);
            setIsModalOpen(true);
            onPendingResultadoConsumido?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingResultado]);

    const handleDelete = (toolId: string) => {
        if (window.confirm("¿Seguro que quieres eliminar este instrumento? Esta acción no se puede deshacer.")) {
            onDelete(toolId);
        }
    };

    // Exportar/importar un instrumento suelto como JSON -- mismo formato y
    // criterio (por códigos de criterio, no ids) que el export/import de una
    // SA completa en ProgrammingManager.tsx, ver services/programmingUnitShare.ts.
    // Sustituye a la antigua importación CSV: no tenía exportación, no
    // soportaba examen criterial, y era un formato aparte del que usa el
    // resto de la app para instrumentos con esta forma anidada.
    const handleExportarInstrumento = (tool: EvaluationTool) => {
        const exportObj = buildInstrumentoExportPayload(tool, criteria);
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = instrumentoExportFilename(tool.name);
        a.click();
        URL.revokeObjectURL(url);
    };

    // A diferencia de una SA (que se importa siempre dentro de un curso ya
    // elegido), aquí no hay una materia activa -- se usa el filtro "materia"
    // de la lista como destino; sin uno real elegido no hay dónde resolver
    // los códigos de criterio a ids.
    const handleImportarInstrumentoClick = () => {
        if (!filtroMateriaId || filtroMateriaId === 'sin-materia') {
            alert('Elige primero una materia en el filtro de arriba ("Todas las materias") -- ahí es donde se importará el instrumento.');
            return;
        }
        fileImportRef.current?.click();
    };

    const handleImportarInstrumentoJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (event.target) event.target.value = '';
        if (!file || !filtroMateriaId || filtroMateriaId === 'sin-materia') return;
        const courseId = filtroMateriaId;

        const reader = new FileReader();
        reader.onload = (e) => {
            let data;
            try {
                data = parseInstrumentoImportPayload(JSON.parse(e.target?.result as string));
            } catch (error) {
                alert(error instanceof Error ? error.message : 'Error al procesar el archivo JSON.');
                return;
            }
            const resuelto = resolverInstrumento(data, courseId, criteria);
            if (!resuelto) return;
            // Se abre en el mismo formulario de revisión que un instrumento
            // generado con IA -- nunca se guarda a ciegas, y los códigos que
            // no coincidan con el currículo de esta materia se habrán
            // quedado sin vincular (revisable ahí mismo).
            setInstrumentoGeneradoPendiente(true);
            setOrigenSA(null);
            setToolToEdit({ ...resuelto.data, id: 'draft' } as EvaluationTool);
            setIsModalOpen(true);
        };
        reader.onerror = () => alert('Error al leer el archivo.');
        reader.readAsText(file, 'utf-8');
    };

    const toolsFiltrados = evaluationTools.filter(t => {
        if (busqueda.trim() && !t.name.toLowerCase().includes(busqueda.trim().toLowerCase())) return false;
        if (filtroMateriaId === 'sin-materia') return !t.courseId;
        if (filtroMateriaId) return t.courseId === filtroMateriaId;
        return true;
    });
    const checklists = toolsFiltrados.filter(t => t.type === 'checklist');
    const ratingScales = toolsFiltrados.filter(t => t.type === 'rating_scale');
    const rubrics = toolsFiltrados.filter(t => t.type === 'rubric');
    const criterialExams = toolsFiltrados.filter(t => t.type === 'criterial_exam');

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-slate-800">Instrumentos de Evaluación</h3>
                <div className="flex gap-2">
                     <button
                        onClick={handleImportarInstrumentoClick}
                        title="Importar un instrumento exportado en JSON desde Faro Docente"
                        className="inline-flex items-center justify-center py-2 px-3 border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50"
                    >
                        <ArrowUpTrayIcon className="w-4 h-4 mr-1" />
                        Importar JSON
                    </button>
                    <input ref={fileImportRef} type="file" accept=".json" className="hidden" onChange={handleImportarInstrumentoJSON} />
                    <button
                        onClick={() => { setInstrumentoGeneradoPendiente(false); setToolToEdit(null); setIsModalOpen(true); }}
                        className="inline-flex items-center justify-center py-2 px-3 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700"
                    >
                        <PlusIcon className="w-4 h-4 mr-1" />
                        Nuevo Instrumento
                    </button>
                    {/* Mismo orden y estilo (ámbar sólido) que "Generar con
                        IA" en el header de Situaciones de Aprendizaje
                        (ProgrammingManager.tsx) -- uniformidad de diseño
                        entre los dos generadores con IA que van en la
                        cabecera de una lista, pedida explícitamente. */}
                    <button
                        onClick={() => setShowOrigenGenerarIA(true)}
                        title="Generar un instrumento con IA"
                        className="inline-flex items-center justify-center py-2 px-3 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-amber-600 hover:bg-amber-700"
                    >
                        <SparklesIcon className="w-4 h-4 mr-1" />
                        Generar con IA
                    </button>
                </div>
            </div>


            <p className="text-sm text-slate-600 mb-4">
                Crea y gestiona plantillas de Listas de Cotejo, Escalas de Valoración y Rúbricas para reutilizarlas en tus tareas.
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
                <Input
                    type="text"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar por nombre..."
                    className="max-w-xs"
                />
                <Select value={filtroMateriaId} onChange={e => setFiltroMateriaId(e.target.value)} className="!w-auto min-w-[12rem]">
                    <option value="">Todas las materias</option>
                    <option value="sin-materia">Sin materia asignada</option>
                    {materiasDisponibles.map(c => (
                        <option key={c.id} value={c.id}>{c.level} - {c.subject}</option>
                    ))}
                </Select>
            </div>

            <div className="space-y-6">
                <ToolSection type="checklist" tools={checklists} courses={courses} onEdit={handleEditExisting} onDelete={handleDelete} onExport={handleExportarInstrumento} onOpenModal={() => setIsModalOpen(true)} />
                <ToolSection type="rating_scale" tools={ratingScales} courses={courses} onEdit={handleEditExisting} onDelete={handleDelete} onExport={handleExportarInstrumento} onOpenModal={() => setIsModalOpen(true)} />
                <ToolSection type="rubric" tools={rubrics} courses={courses} onEdit={handleEditExisting} onDelete={handleDelete} onExport={handleExportarInstrumento} onOpenModal={() => setIsModalOpen(true)} />
                <ToolSection type="criterial_exam" tools={criterialExams} courses={courses} onEdit={handleEditExisting} onDelete={handleDelete} onExport={handleExportarInstrumento} onOpenModal={() => setIsModalOpen(true)} />
            </div>

            {isModalOpen && (
                <EvaluationToolEditorModal
                    isOpen={isModalOpen}
                    onClose={() => { setIsModalOpen(false); setInstrumentoGeneradoPendiente(false); setOrigenSA(null); }}
                    onSave={handleSave}
                    toolToEdit={toolToEdit}
                    criteria={criteria}
                    courses={courses}
                    defaultCourseId={filtroMateriaId && filtroMateriaId !== 'sin-materia' ? filtroMateriaId : undefined}
                />
            )}
            {showOrigenGenerarIA && (
                <Modal isOpen={showOrigenGenerarIA} onClose={() => setShowOrigenGenerarIA(false)} title="Generar instrumento con IA" size="md">
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-slate-600">¿De dónde salen los criterios y el contexto para la IA?</p>
                        <button
                            type="button"
                            onClick={handleDescribirParaIA}
                            className="text-left p-3 border rounded-lg bg-white hover:bg-amber-50 hover:border-amber-300 transition-colors"
                        >
                            <span className="block text-sm font-medium text-slate-700">Describir lo que quiero evaluar</span>
                            <span className="block text-xs text-slate-400">
                                Escribes qué quieres evaluar (p.ej. un examen con sus preguntas) y la IA propone los criterios que encajen.
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowOrigenGenerarIA(false); setSugerenciaPendiente(null); setCriteriosParaIA(null); setShowCriteriaPickerParaIA(true); }}
                            className="text-left px-3 -mt-2 text-xs text-slate-500 underline hover:text-amber-700"
                        >
                            ¿Prefieres elegir tú los criterios en vez de que la IA los proponga? Elígelos a mano.
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowOrigenGenerarIA(false); setShowSeleccionarActividadSA(true); }}
                            className="text-left p-3 border rounded-lg bg-white hover:bg-amber-50 hover:border-amber-300 transition-colors"
                        >
                            <span className="block text-sm font-medium text-slate-700">Elegir una actividad de una Situación de Aprendizaje</span>
                            <span className="block text-xs text-slate-400">
                                Hereda sus criterios y su descripción, y al guardar el instrumento se enlaza automáticamente a esa actividad/producto/examen.
                            </span>
                        </button>
                    </div>
                </Modal>
            )}
            {showDescribir && (
                <Modal isOpen={showDescribir} onClose={() => setShowDescribir(false)} title="Describir lo que quiero evaluar" size="md">
                    <div className="flex flex-col gap-3">
                        <div>
                            <label className="text-sm font-semibold text-slate-700 mb-1.5 block">¿Qué quieres evaluar?</label>
                            <Textarea
                                value={descripcionParaSugerir}
                                onChange={e => setDescripcionParaSugerir(e.target.value)}
                                rows={5}
                                placeholder="P.ej. un examen con las siguientes preguntas: ..."
                                className="text-sm"
                            />
                            <p className="text-xs text-slate-500 mt-1.5">
                                La IA propondrá qué criterios de evaluación de esta materia encajan -- los revisas y ajustas
                                antes de generar el instrumento.
                            </p>
                        </div>
                        {errorSugerencia && <p className="text-sm text-red-600">{errorSugerencia}</p>}
                        <div className="flex justify-end gap-2 pt-2 border-t">
                            <Button type="button" variant="secondary" onClick={() => setShowDescribir(false)}>Cancelar</Button>
                            <Button type="button" onClick={handleSugerirCriterios} disabled={!descripcionParaSugerir.trim() || sugiriendoCriterios}>
                                {sugiriendoCriterios ? 'Buscando criterios...' : 'Buscar criterios con IA'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
            {showCriteriaPickerParaIA && (
                <CriteriaSelectorModal
                    isOpen={showCriteriaPickerParaIA}
                    onClose={() => { setShowCriteriaPickerParaIA(false); setSugerenciaPendiente(null); }}
                    allCriteria={criteria}
                    courses={courses}
                    selectedIds={criteriosParaIA?.ids || []}
                    initialCourseId={criteriosParaIA?.courseId ?? (filtroMateriaId && filtroMateriaId !== 'sin-materia' ? filtroMateriaId : undefined)}
                    onSave={handleCriteriosElegidosParaIA}
                />
            )}
            {showSeleccionarActividadSA && (
                <SeleccionarActividadSAModal
                    isOpen={showSeleccionarActividadSA}
                    onClose={() => setShowSeleccionarActividadSA(false)}
                    programmingUnits={programmingUnits}
                    courses={courses}
                    onSeleccionar={handleActividadSASeleccionada}
                />
            )}
            {criteriosParaIA && (
                <GenerarInstrumentoIAModal
                    isOpen={showGenerarIA}
                    onClose={() => { setShowGenerarIA(false); setOrigenSA(null); }}
                    courseId={criteriosParaIA.courseId}
                    linkedCriteriaIds={criteriosParaIA.ids}
                    contexto={contextoParaIA}
                    onDraftReady={handleInstrumentoGenerado}
                />
            )}
        </div>
    );
};

const TOOL_TYPE_ICON: Record<'checklist' | 'rating_scale' | 'rubric' | 'criterial_exam', React.FC<{ className?: string }>> = {
    checklist: ClipboardDocumentCheckIcon,
    rating_scale: ChartBarIcon,
    rubric: TableCellsIcon,
    criterial_exam: AcademicCapIcon,
};

// Un tono distinto de PALETTE por tipo de instrumento, solo para dar vida
// visual a esta lista (icono + borde + insignia) -- no tiene relación con
// PAGE_ACCENT (esa es por página, esto es por subsección dentro de la misma
// página). navy queda fuera por ser el color de marca/acción principal.
const TOOL_TYPE_COLOR: Record<'checklist' | 'rating_scale' | 'rubric' | 'criterial_exam', AccentColor> = {
    checklist: PALETTE.green,
    rating_scale: PALETTE.blue,
    rubric: PALETTE.teal,
    criterial_exam: PALETTE.sand,
};

const ToolSection: React.FC<{ type: 'checklist' | 'rating_scale' | 'rubric' | 'criterial_exam', tools: EvaluationTool[], courses: Course[], onEdit: (tool: EvaluationTool) => void, onDelete: (id: string) => void, onExport: (tool: EvaluationTool) => void, onOpenModal: () => void }> = ({ type, tools, courses, onEdit, onDelete, onExport, onOpenModal }) => {
    const title = {
        checklist: 'Listas de Cotejo',
        rating_scale: 'Escalas de Valoración',
        rubric: 'Rúbricas',
        criterial_exam: 'Exámenes Criteriales'
    }[type];
    const TypeIcon = TOOL_TYPE_ICON[type];
    const color = TOOL_TYPE_COLOR[type];

    const materiaLabel = (courseId?: string) => {
        if (!courseId) return null;
        const c = courses.find(c => c.id === courseId);
        return c ? `${c.level} - ${c.subject}` : null;
    };

    return (
        <details className="group rounded-lg bg-white border border-slate-200 shadow-sm overflow-hidden">
            {/* Barra de acento como bloque real (no border-left ni
                box-shadow: pintaban dentro del área de <summary> y su
                fondo de hover los tapaba en la esquina). Va DUPLICADA --
                una dentro de <summary> y otra dentro del contenido -- en
                vez de una sola como hijo directo de <details>: los
                navegadores ocultan cualquier hijo de <details> que no sea
                <summary> mientras está plegado, así que una barra fuera de
                <summary> desaparecía en la vista colapsada. */}
            <summary
                className="relative flex items-center gap-2 pl-4 pr-3 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden transition-colors hover:bg-slate-50"
            >
                <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color.base }} />
                <span className="flex-shrink-0 opacity-50 transition-transform group-open:rotate-0 -rotate-90" style={{ color: color.base }}>
                    <ChevronDownIcon className="w-4 h-4" />
                </span>
                <span className="flex-shrink-0" style={{ color: color.base }}>
                    <TypeIcon className="w-5 h-5" />
                </span>
                <h4 className="text-lg font-semibold text-slate-700">{title}</h4>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: color.soft, color: color.header }}>{tools.length}</span>
            </summary>
            <div className="relative flex flex-wrap gap-2 pl-4 pr-3 pb-3">
                <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color.base }} />
                {tools.length > 0 ? tools.map(tool => (
                    <div key={tool.id} className="group/item inline-flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-full border" style={{ backgroundColor: color.soft, borderColor: `${color.base}40` }}>
                        <span className="font-medium text-sm">{tool.name}</span>
                        {materiaLabel(tool.courseId) && (
                            <span className="text-xs text-slate-400">· {materiaLabel(tool.courseId)}</span>
                        )}
                        <div className="flex items-center opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <button onClick={() => onExport(tool)} title="Exportar JSON (para compartir con otro profesor)" className="p-1 hover:bg-slate-200 rounded-full"><ArrowDownTrayIcon className="w-3.5 h-3.5 text-slate-600" /></button>
                            <button onClick={() => { onEdit(tool); onOpenModal(); }} className="p-1 hover:bg-slate-200 rounded-full"><PencilIcon className="w-3.5 h-3.5 text-slate-600" /></button>
                            <button onClick={() => onDelete(tool.id)} className="p-1 hover:bg-red-100 rounded-full"><TrashIcon className="w-3.5 h-3.5 text-red-500" /></button>
                        </div>
                    </div>
                )) : (
                    <p className="text-slate-500 text-sm py-2">No hay {title.toLowerCase()} que coincidan.</p>
                )}
            </div>
        </details>
    );
}

// Editor Modal

interface EditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (tool: EvaluationTool) => void;
    toolToEdit: EvaluationTool | null;
    criteria: EvaluationCriterion[];
    courses: Course[];
    // Materia preseleccionada al crear uno nuevo -- p.ej. el filtro activo
    // en la lista, o (desde InstrumentoSelectConIA) la única materia de la
    // SA en curso. Ignorado si toolToEdit ya trae la suya.
    defaultCourseId?: string;
}

// Exportado -- reutilizado tal cual por InstrumentoSelectConIA
// (ProgrammingManager.tsx) para revisar/editar un instrumento recién
// generado con IA antes de guardarlo, sin duplicar este formulario.
export const EvaluationToolEditorModal: React.FC<EditorModalProps> = ({ isOpen, onClose, onSave, toolToEdit, criteria, courses, defaultCourseId }) => {
    const [tool, setTool] = useState<ToolDraft>(() =>
        toolToEdit || { name: '', type: 'checklist', courseId: defaultCourseId, items: [] }
    );

    const handleFieldChange = <K extends keyof ToolDraft>(field: K, value: ToolDraft[K]) => {
        setTool(prev => ({ ...prev, [field]: value }));
    };

    const handleTypeChange = (newType: 'checklist' | 'rating_scale' | 'rubric' | 'criterial_exam') => {
        setTool(prev => {
            if (prev.type === newType) return prev;
            const baseProps = {
                name: prev.name,
                courseId: prev.courseId,
                items: prev.items.map(item => 'levelDescriptions' in item ? { id: item.id, description: item.description, weight: item.weight, linkedCriteriaIds: item.linkedCriteriaIds } : item)
            };

            if (newType === 'rating_scale') {
                return { ...baseProps, type: 'rating_scale', levels: [{ id: `level-${Date.now()}`, name: 'Conseguido', points: 1 }] };
            }
            if (newType === 'rubric') {
                const defaultLevel = { id: `level-${Date.now()}`, name: 'Nivel 1', points: 1 };
                return {
                    ...baseProps,
                    type: 'rubric',
                    levels: [defaultLevel],
                    items: baseProps.items.map(item => ({ ...item, levelDescriptions: { [defaultLevel.id]: '' } }))
                };
            }
            if (newType === 'criterial_exam') {
                return { ...baseProps, type: 'criterial_exam' };
            }
            return { ...baseProps, type: 'checklist' };
        });
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Única conversión de "borrador en edición" a tipo de dominio: el
        // formulario ya garantiza que levels/levelDescriptions están
        // presentes cuando el tipo los necesita (ver handleTypeChange). El
        // `id` que falte para un instrumento nuevo lo genera handleSave.
        onSave(tool as EvaluationTool);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={toolToEdit ? 'Editar Instrumento' : 'Nuevo Instrumento'} size={tool.type === 'rubric' ? '5xl' : '4xl'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Nombre del Instrumento</label>
                        <Input type="text" value={tool.name} onChange={e => handleFieldChange('name', e.target.value)} required className="mt-1" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Tipo de Instrumento</label>
                        <Select
                            value={tool.type}
                            onChange={e => handleTypeChange(e.target.value as 'checklist' | 'rating_scale' | 'rubric' | 'criterial_exam')}
                            disabled={!!toolToEdit}
                            className="mt-1"
                        >
                            <option value="checklist">Lista de Cotejo</option>
                            <option value="rating_scale">Escala de Valoración</option>
                            <option value="rubric">Rúbrica</option>
                            <option value="criterial_exam">Examen criterial</option>
                        </Select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Materia (opcional)</label>
                        <Select value={tool.courseId ?? ''} onChange={e => handleFieldChange('courseId', e.target.value || undefined)} className="mt-1">
                            <option value="">Sin materia asignada</option>
                            {courses.filter(c => c.type !== 'other').map(c => (
                                <option key={c.id} value={c.id}>{c.level} - {c.subject}</option>
                            ))}
                        </Select>
                    </div>
                </div>

                <ToolEditorFields tool={tool} setTool={setTool} criteria={criteria} courses={courses} />

                <div className="flex justify-end pt-4 space-x-2 border-t">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" variant="primary">Guardar</Button>
                </div>
            </form>
        </Modal>
    );
};

interface ToolEditorFieldsProps {
    tool: ToolDraft;
    setTool: React.Dispatch<React.SetStateAction<ToolDraft>>;
    criteria: EvaluationCriterion[];
    courses: Course[];
}

const ToolEditorFields: React.FC<ToolEditorFieldsProps> = ({tool, setTool, criteria, courses}) => {

    // Un único handler para ambos tipos de ítem: ToolItemDraft ya cubre
    // BaseEvaluationItem + el levelDescriptions opcional de RubricItem.
    const handleItemChange = <K extends keyof ToolItemDraft>(index: number, field: K, value: ToolItemDraft[K]) => {
        const newItems = [...tool.items];
        newItems[index] = { ...newItems[index], [field]: value };
        setTool(prev => ({...prev, items: newItems}));
    };

    const handleAddItem = () => {
        if (tool.type === 'rubric' && tool.levels) {
            const newItem: ToolItemDraft = {
                id: `item-${Date.now()}`, description: '', weight: 1, linkedCriteriaIds: [],
                levelDescriptions: tool.levels.reduce((acc, level) => ({...acc, [level.id]: ''}), {} as Record<string, string>)
            };
            setTool(prev => ({...prev, items: [...prev.items, newItem]}));
        } else {
            const newItem: ToolItemDraft = { id: `item-${Date.now()}`, description: '', weight: 1, linkedCriteriaIds: [] };
            setTool(prev => ({...prev, items: [...prev.items, newItem]}));
        }
    };

    const handleRemoveItem = (index: number) => {
        setTool(prev => ({...prev, items: prev.items.filter((_, i) => i !== index)}));
    };

    const handleLevelChange = <K extends keyof EvaluationLevel>(index: number, field: K, value: EvaluationLevel[K]) => {
        const newLevels = [...(tool.levels ?? [])];
        newLevels[index] = { ...newLevels[index], [field]: value };

        // If points change, ensure no duplicates
        if (field === 'points') {
            const points = newLevels.map(l => l.points);
            if (new Set(points).size !== points.length) {
                // simple reset for now if duplicate
                 alert("Los puntos de cada nivel deben ser únicos.");
                 return;
            }
        }

        setTool(prev => ({...prev, levels: newLevels}));
    };

    const handleAddLevel = () => {
        const levels = tool.levels ?? [];
        const newPoints = (levels[levels.length - 1]?.points || 0) + 1;
        const newLevel: EvaluationLevel = { id: `level-${Date.now()}`, name: '', points: newPoints };
        const newLevels = [...levels, newLevel];

        const newItems = tool.type === 'rubric'
            ? tool.items.map(item => ({
                ...item,
                levelDescriptions: { ...item.levelDescriptions, [newLevel.id]: '' }
            }))
            : tool.items;

        setTool(prev => ({...prev, levels: newLevels, items: newItems}));
    };

    const handleRemoveLevel = (index: number) => {
        const levels = tool.levels ?? [];
        const levelToRemove = levels[index];
        const newLevels = levels.filter((_, i) => i !== index);

        const newItems = tool.type === 'rubric'
            ? tool.items.map(item => {
                const newDescriptions = {...item.levelDescriptions};
                delete newDescriptions[levelToRemove.id];
                return {...item, levelDescriptions: newDescriptions};
            })
            : tool.items;

        setTool(prev => ({...prev, levels: newLevels, items: newItems}));
    };
    
    if (tool.type === 'rubric') {
        const levels = tool.levels ?? [];
        return (
            <div className="space-y-4">
                 <div className="p-3 border rounded-lg bg-slate-50/50">
                    <h4 className="font-semibold mb-2">Columnas de la Rúbrica (Niveles de Desempeño)</h4>
                    <div className="space-y-2">
                        {levels.map((level, index) => (
                            <div key={level.id} className="flex items-center gap-2">
                                <Input type="text" value={level.name} onChange={e => handleLevelChange(index, 'name', e.target.value)} placeholder="Nombre Nivel" className="w-full" />
                                <Input type="number" value={level.points} onChange={e => handleLevelChange(index, 'points', Number(e.target.value))} placeholder="Puntos" className="!w-24" />
                                <button type="button" onClick={() => handleRemoveLevel(index)} disabled={levels.length <= 1} className="p-2 text-red-500 hover:bg-red-100 rounded-full disabled:opacity-30"><TrashIcon className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={handleAddLevel} className={`mt-2 text-sm font-semibold ${linkClassName}`}>+ Añadir nivel</button>
                </div>
                <div>
                     <h4 className="font-semibold mb-2">Filas de la Rúbrica (Ítems a Evaluar)</h4>
                     <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
                        {tool.items.map((item, index) => (
                            <RubricItemEditor
                                key={item.id}
                                item={item}
                                levels={levels}
                                onItemChange={(field, value) => handleItemChange(index, field, value)}
                                onRemove={() => handleRemoveItem(index)}
                                criteria={criteria}
                                courses={courses}
                            />
                        ))}
                     </div>
                     <button type="button" onClick={handleAddItem} className={`mt-2 text-sm font-semibold ${linkClassName}`}>+ Añadir ítem</button>
                </div>
            </div>
        )
    }

    const scaleLevels = tool.levels ?? [];
    return (
        <>
        {(tool.type === 'rating_scale') && (
            <div className="p-3 border rounded-lg bg-slate-50/50">
                <h4 className="font-semibold mb-2">Niveles de la Escala</h4>
                <div className="space-y-2">
                    {scaleLevels.map((level, index) => (
                        <div key={level.id} className="flex items-center gap-2">
                            <Input type="text" value={level.name} onChange={e => handleLevelChange(index, 'name', e.target.value)} placeholder="Nombre Nivel" className="w-full" />
                            <Input type="number" value={level.points} onChange={e => handleLevelChange(index, 'points', Number(e.target.value))} placeholder="Puntos" className="!w-24" />
                            <button type="button" onClick={() => handleRemoveLevel(index)} disabled={scaleLevels.length <= 1} className="p-2 text-red-500 hover:bg-red-100 rounded-full disabled:opacity-30"><TrashIcon className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
                <button type="button" onClick={handleAddLevel} className={`mt-2 text-sm font-semibold ${linkClassName}`}>+ Añadir nivel</button>
            </div>
        )}

        <div className="p-3 border rounded-lg bg-slate-50/50">
            <h4 className="font-semibold mb-2">{tool.type === 'criterial_exam' ? 'Preguntas del examen' : 'Ítems a Evaluar'}</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {tool.items.map((item, index) => (
                    <ItemEditor
                        key={item.id}
                        item={item}
                        onItemChange={(field, value) => handleItemChange(index, field, value)}
                        onRemove={() => handleRemoveItem(index)}
                        criteria={criteria}
                        courses={courses}
                        pesoLabel={tool.type === 'criterial_exam' ? 'Puntos máximos:' : 'Ponderación:'}
                    />
                ))}
            </div>
            <button type="button" onClick={handleAddItem} className={`mt-2 text-sm font-semibold ${linkClassName}`}>
                + {tool.type === 'criterial_exam' ? 'Añadir pregunta' : 'Añadir ítem'}
            </button>
        </div>
        </>
    );
};

// Chips de solo lectura con los criterios ya vinculados + un botón para
// abrir el selector -- mismo estilo visual que CriteriaChips
// (ProgrammingManager.tsx), pero sin los chips de TODOS los criterios como
// botones de toggle (petición explícita: aquí solo se quiere ver lo ya
// elegido, la edición pasa por el botón/modal).
const LinkedCriteriaChips: React.FC<{ criteria: EvaluationCriterion[]; linkedIds: string[]; onEdit: () => void }> = ({ criteria, linkedIds, onEdit }) => {
    const seleccionados = criteria.filter(c => linkedIds.includes(c.id));
    return (
        <div className="flex flex-wrap items-center gap-1">
            {seleccionados.map(c => (
                <span
                    key={c.id}
                    title={c.description}
                    className="text-xs font-medium px-2 py-0.5 rounded-full border bg-slate-700 text-white border-slate-700"
                >
                    {c.code}
                </span>
            ))}
            <button
                type="button"
                onClick={onEdit}
                className="flex items-center gap-1 text-xs text-blue-600 px-2 py-0.5 hover:bg-blue-50 rounded-full border border-dashed border-blue-300"
            >
                <LinkIcon className="w-3 h-3" />
                {seleccionados.length === 0 ? 'Vincular criterios' : 'Editar criterios'}
            </button>
        </div>
    );
};

interface ItemEditorProps {
    item: ToolItemDraft;
    onItemChange: <K extends keyof ToolItemDraft>(field: K, value: ToolItemDraft[K]) => void;
    onRemove: () => void;
    criteria: EvaluationCriterion[];
    courses: Course[];
    pesoLabel?: string;
}

// Item Editor (for checklist, rating scale y examen criterial)
const ItemEditor: React.FC<ItemEditorProps> = ({ item, onItemChange, onRemove, criteria, courses, pesoLabel = 'Ponderación:' }) => {
    const [isCriteriaModalOpen, setIsCriteriaModalOpen] = useState(false);
    return (
        <div className="p-3 border rounded bg-white flex items-start gap-2">
            <div className="flex-grow space-y-2">
                <Input
                    type="text"
                    value={item.description}
                    onChange={e => onItemChange('description', e.target.value)}
                    placeholder="Descripción del ítem"
                    className="w-full"
                />
                <div className="flex items-center gap-2">
                    <label className="text-sm">{pesoLabel}</label>
                    <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.weight}
                        onChange={e => onItemChange('weight', Number(e.target.value))}
                        className="w-24"
                    />
                </div>
                <LinkedCriteriaChips criteria={criteria} linkedIds={item.linkedCriteriaIds} onEdit={() => setIsCriteriaModalOpen(true)} />
            </div>
            <button type="button" onClick={onRemove} className="p-2 text-red-500 hover:bg-red-100 rounded-full flex-shrink-0"><TrashIcon className="w-4 h-4" /></button>
            {isCriteriaModalOpen && (
                <CriteriaSelectorModal
                    isOpen={isCriteriaModalOpen}
                    onClose={() => setIsCriteriaModalOpen(false)}
                    allCriteria={criteria}
                    courses={courses}
                    selectedIds={item.linkedCriteriaIds}
                    onSave={ids => onItemChange('linkedCriteriaIds', ids)}
                />
            )}
        </div>
    );
};

// Rubric Item Editor
interface RubricItemEditorProps {
    item: ToolItemDraft;
    levels: EvaluationLevel[];
    onItemChange: <K extends keyof ToolItemDraft>(field: K, value: ToolItemDraft[K]) => void;
    onRemove: () => void;
    criteria: EvaluationCriterion[];
    courses: Course[];
}
const RubricItemEditor: React.FC<RubricItemEditorProps> = ({item, levels, onItemChange, onRemove, criteria, courses}) => {
    const [isCriteriaModalOpen, setIsCriteriaModalOpen] = useState(false);

    const handleLevelDescriptionChange = (levelId: string, description: string) => {
        const newDescriptions = { ...item.levelDescriptions, [levelId]: description };
        onItemChange('levelDescriptions', newDescriptions);
    }
    
    return (
        <div className="p-3 border rounded bg-white">
            <div className="flex items-start gap-2 mb-2">
                <div className="flex-grow space-y-2">
                    <Input
                        type="text"
                        value={item.description}
                        onChange={e => onItemChange('description', e.target.value)}
                        placeholder="Descripción del ítem/criterio de la rúbrica"
                        className="w-full font-semibold"
                    />
                    <div className="flex items-center gap-2">
                        <label className="text-sm">Ponderación:</label>
                        <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.weight}
                            onChange={e => onItemChange('weight', Number(e.target.value))}
                            className="w-24"
                        />
                    </div>
                    <LinkedCriteriaChips criteria={criteria} linkedIds={item.linkedCriteriaIds} onEdit={() => setIsCriteriaModalOpen(true)} />
                </div>
                <button type="button" onClick={onRemove} className="p-2 text-red-500 hover:bg-red-100 rounded-full flex-shrink-0"><TrashIcon className="w-4 h-4" /></button>
            </div>
            <div className="grid gap-2" style={{gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))`}}>
                {levels.map(level => (
                    <div key={level.id}>
                        <label className="text-xs font-semibold text-slate-600">{level.name}</label>
                        <Textarea
                            value={item.levelDescriptions?.[level.id] || ''}
                            onChange={e => handleLevelDescriptionChange(level.id, e.target.value)}
                            placeholder={`Descripción para ${level.name}...`}
                            className="mt-1 text-xs min-h-[80px]"
                        />
                    </div>
                ))}
            </div>

            {isCriteriaModalOpen && (
                <CriteriaSelectorModal
                    isOpen={isCriteriaModalOpen}
                    onClose={() => setIsCriteriaModalOpen(false)}
                    allCriteria={criteria}
                    courses={courses}
                    selectedIds={item.linkedCriteriaIds}
                    onSave={ids => onItemChange('linkedCriteriaIds', ids)}
                />
            )}
        </div>
    );
};

interface CriteriaSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    allCriteria: EvaluationCriterion[];
    courses: Course[];
    selectedIds: string[];
    onSave: (ids: string[]) => void;
    // Curso al que pertenecen `selectedIds` (p.ej. una sugerencia de la IA)
    // -- sin esto, "Filtrar por Curso" defecto al primer curso de la lista,
    // que podría no ser el de los criterios ya marcados.
    initialCourseId?: string;
}

// Criteria Selector Modal
const CriteriaSelectorModal: React.FC<CriteriaSelectorProps> = ({ isOpen, onClose, allCriteria, courses, selectedIds, onSave, initialCourseId }) => {
    const [currentSelection, setCurrentSelection] = useState<Set<string>>(() => new Set(selectedIds));
    const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId || courses[0]?.id || '');

    const filteredCriteria = useMemo(() => allCriteria.filter(c => c.courseId === selectedCourseId), [allCriteria, selectedCourseId]);

    const handleToggle = (id: string) => {
        setCurrentSelection(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const handleSave = () => {
        onSave(Array.from(currentSelection));
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Vincular Criterios de Evaluación" size="2xl">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700">Filtrar por Curso</label>
                    <Select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} className="mt-1">
                        {courses.map(c => <option key={c.id} value={c.id}>{c.level} - {c.subject}</option>)}
                    </Select>
                </div>
                <div className="max-h-80 overflow-y-auto border rounded-lg p-2 space-y-1 bg-slate-50">
                    {filteredCriteria.map(c => (
                        <label key={c.id} className="flex items-start gap-2 p-2 hover:bg-slate-100 rounded-md cursor-pointer">
                            <input type="checkbox" checked={currentSelection.has(c.id)} onChange={() => handleToggle(c.id)} className={`mt-1 ${checkboxClassName}`} />
                            <span className="text-sm"><strong>{c.code}:</strong> {c.description}</span>
                        </label>
                    ))}
                </div>
                 <div className="flex justify-end pt-4 space-x-2 border-t">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="button" variant="primary" onClick={handleSave}>Guardar Vínculos</Button>
                </div>
            </div>
        </Modal>
    )
}

export default EvaluationToolManager;
