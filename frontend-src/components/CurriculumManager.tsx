import React, { useState, useMemo } from 'react';
import type { Course, KeyCompetence, OperationalDescriptor, SpecificCompetence, EvaluationCriterion, BasicKnowledge } from '../types';
import { api } from '../services/api';
import {
    useSpecificCompetences, useCreateSpecificCompetence, useUpdateSpecificCompetence, useDeleteSpecificCompetence,
    useLinkDescriptor,
} from '../hooks/useSpecificCompetences';
import { useEvaluationCriteria, useCreateCriterion, useUpdateCriterion, useDeleteCriterion } from '../hooks/useEvaluationCriteria';
import { useBasicKnowledge, useCreateBasicKnowledge, useUpdateBasicKnowledge, useDeleteBasicKnowledge } from '../hooks/useBasicKnowledge';
import { useCurriculumImport } from '../hooks/useCurriculumImport';

type CurriculumItemType = 'ec' | 'sc' | 'kc' | 'sb' | 'od';
type CurriculumItem = EvaluationCriterion | SpecificCompetence | KeyCompetence | BasicKnowledge | OperationalDescriptor;
import { PencilIcon, TrashIcon, PlusIcon, ChevronRightIcon, ChevronDownIcon } from './Icons';
import { CURRICULOS_OFICIALES, CURRICULOS_OFICIALES_BACHILLERATO, CURRICULOS_PROPIOS, TODOS_LOS_PRESETS, filtrarPorCurso } from '../curriculumPresets';
import { compararCodigo } from '../utils';
import Button from './Button';
import IconButton from './IconButton';
import Badge from './Badge';
import { TYPOGRAPHY } from '../theme/typography';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';
import { checkboxClassName } from '../theme/components/Input';
import { linkClassName } from '../theme/components/Link';


// Fuera del componente (no cierra sobre nada de React) para que los useMemo
// que la usan puedan depender solo de cursoNumero, sin necesidad de incluir
// la propia función como dependencia.
const Accordion: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <details className="border border-slate-200 rounded-lg">
        <summary className="p-3 cursor-pointer font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-t-lg">{title}</summary>
        <div className="p-4 bg-white rounded-b-lg">
            {children}
        </div>
    </details>
);

// Grupo colapsable más compacto que Accordion (para anidar dentro de uno):
// con tantos criterios por materia, una lista plana se hace inmanejable —
// agrupar por competencia específica y dejarlos cerrados por defecto ayuda
// a encontrar lo que se busca sin desplazarse por decenas de filas.
const CriterioGroup: React.FC<{ title: string; count: number; children: React.ReactNode }> = ({ title, count, children }) => (
    <details className="group border border-slate-200 rounded-lg">
        <summary className="flex items-center gap-2 p-2.5 cursor-pointer font-medium text-sm text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg [&::-webkit-details-marker]:hidden list-none">
            <ChevronRightIcon className="w-4 h-4 text-slate-400 flex-shrink-0 group-open:hidden" />
            <ChevronDownIcon className="w-4 h-4 text-slate-400 flex-shrink-0 hidden group-open:block" />
            <span className="flex-grow truncate">{title}</span>
            <span className="text-xs text-slate-400 flex-shrink-0">{count}</span>
        </summary>
        <div className="p-2 space-y-2 border-t border-slate-200">
            {children}
        </div>
    </details>
);

// Helper function for robust stage detection
const isBachilleratoStage = (level: string): boolean => /bach/i.test(level);

// Redondea cada valor a 2 decimales ajustando el último para que la suma dé
// exactamente `targetSum` (redondear cada uno por separado puede dejar la
// suma en 99.99 o 100.01 en vez de 100 en punto).
const roundToExactSum = (values: number[], targetSum: number): number[] => {
    if (values.length === 0) return [];
    const rounded = values.map(v => Math.round(v * 100) / 100);
    const sumExceptLast = rounded.slice(0, -1).reduce((a, b) => a + b, 0);
    rounded[rounded.length - 1] = Math.round((targetSum - sumExceptLast) * 100) / 100;
    return rounded;
};

interface CurriculumManagerProps {
    // Fase 8: la materia activa se elige en la cabecera (App.tsx), ya no
    // dentro de este componente — ver el antiguo selector "Curso a
    // gestionar:" (retirado), sustituido por un simple encabezado con el
    // nombre de la materia.
    courseId: string;
    courses: Course[];
    onUpdateCourse: (id: string, data: Partial<{ level: string; subject: string; type: 'academic' | 'other'; pesoCriteriosManual: boolean }>) => Promise<void>;
    keyCompetences: KeyCompetence[];
    onCreateKeyCompetence: (data: { code: string; description: string }) => Promise<KeyCompetence>;
    onUpdateKeyCompetence: (id: string, data: Partial<{ code: string; description: string }>) => Promise<void>;
    onDeleteKeyCompetence: (id: string) => Promise<void>;
    onCreateDescriptor: (keyCompetenceId: string, data: { code: string; description: string; stage?: 'eso' | 'bachillerato' }) => Promise<OperationalDescriptor>;
    onUpdateDescriptor: (id: string, data: Partial<{ code: string; description: string; stage: 'eso' | 'bachillerato' }>) => Promise<void>;
    onDeleteDescriptor: (id: string) => Promise<void>;
}

// Recibe {...props} desde SettingsModal (todas las props de Ajustes), pero
// solo usa este subconjunto — de ahí que el tipo no sea "SettingsModalProps"
// completo, sino justo lo que se destructura aquí abajo.
const CurriculumManager: React.FC<CurriculumManagerProps> = (props) => {
    const {
        courseId, courses, onUpdateCourse, keyCompetences,
        onCreateKeyCompetence, onUpdateKeyCompetence, onDeleteKeyCompetence,
        onCreateDescriptor, onUpdateDescriptor, onDeleteDescriptor,
    } = props;
    const selectedCourseId = courseId;
    // Elemento recién creado (criterio, competencia específica/clave o
    // descriptor): se abre directamente en modo edición para que se rellenen
    // código/descripción sin un paso extra de "editar". Solo uno pendiente a
    // la vez, es suficiente para el flujo de "añadir uno y rellenarlo".
    const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);

    const remoteSpecificCompetences = useSpecificCompetences(selectedCourseId);
    const createCompetence = useCreateSpecificCompetence();
    const updateCompetenceMutation = useUpdateSpecificCompetence();
    const deleteCompetenceMutation = useDeleteSpecificCompetence();
    const linkDescriptorMutation = useLinkDescriptor();
    const remoteEvaluationCriteria = useEvaluationCriteria(selectedCourseId);
    const createCriterionMutation = useCreateCriterion();
    const updateCriterionMutation = useUpdateCriterion();
    const deleteCriterionMutation = useDeleteCriterion();
    const remoteBasicKnowledge = useBasicKnowledge(selectedCourseId);
    const createBasicKnowledgeMutation = useCreateBasicKnowledge();
    const updateBasicKnowledgeMutation = useUpdateBasicKnowledge();
    const deleteBasicKnowledgeMutation = useDeleteBasicKnowledge();

    const curriculumImport = useCurriculumImport({
        keyCompetences, onCreateKeyCompetence, onUpdateKeyCompetence, onCreateDescriptor, onUpdateDescriptor,
    });

    // Al cambiar de materia (o la primera vez que se abre una), las tres
    // consultas tardan un momento en traer datos nuevos y, mientras tanto,
    // la vista se queda vacía sin ningún indicio de que está pasando algo —
    // parece congelada aunque está cargando por detrás. isLoading (no
    // isFetching) a propósito: solo cubre "sin datos todavía + cargando",
    // no cada refresco silencioso en segundo plano de una materia ya vista.
    const cargandoCurriculo = remoteSpecificCompetences.isLoading || remoteEvaluationCriteria.isLoading || remoteBasicKnowledge.isLoading;

    const handleAddCriterion = async (competenceId: string) => {
        const created = await createCriterionMutation.mutateAsync({ courseId: selectedCourseId, data: { competenceId, code: '', description: '' } });
        setNewlyAddedId(created.id);
    };

    // `type` es una etiqueta externa (no un discriminante propio del ítem, a
    // diferencia de EvaluationTool.type), así que no hay forma de que TS
    // enlace automáticamente cada rama con su tipo concreto — de ahí el
    // único cast por rama, cada uno garantizado por el propio `case`.
    const handleUpdate = (type: CurriculumItemType, item: CurriculumItem) => {
        switch (type) {
            case 'ec': {
                const criterion = item as EvaluationCriterion;
                updateCriterionMutation.mutate({ id: criterion.id, courseId: selectedCourseId, data: { code: criterion.code, description: criterion.description, weight: criterion.weight, excludeFromWeighting: criterion.excludeFromWeighting } });
                break;
            }
            case 'sc': {
                const competence = item as SpecificCompetence;
                updateCompetenceMutation.mutate({ id: competence.id, courseId: selectedCourseId, data: { code: competence.code, description: competence.description } });
                break;
            }
            case 'kc': {
                const keyCompetence = item as KeyCompetence;
                onUpdateKeyCompetence(keyCompetence.id, { code: keyCompetence.code, description: keyCompetence.description });
                break;
            }
            case 'sb': {
                const basic = item as BasicKnowledge;
                updateBasicKnowledgeMutation.mutate({ id: basic.id, courseId: selectedCourseId, data: { code: basic.code, description: basic.description } });
                break;
            }
            case 'od': {
                const descriptor = item as OperationalDescriptor;
                onUpdateDescriptor(descriptor.id, { code: descriptor.code, description: descriptor.description });
                break;
            }
        }
    };

    const handleDelete = (type: CurriculumItemType, id: string) => {
        if (!window.confirm("¿Seguro que quieres eliminar este elemento? Esta acción no se puede deshacer.")) {
            return;
        }

        switch (type) {
            case 'ec':
                deleteCriterionMutation.mutate({ id, courseId: selectedCourseId });
                break;
            case 'sc': {
                const currentCriteria = remoteEvaluationCriteria.data ?? [];
                const isDependency = currentCriteria.some((ec: EvaluationCriterion) => ec.competenceId === id);
                if (isDependency) {
                    alert("No se puede eliminar esta competencia específica porque hay criterios de evaluación que dependen de ella.");
                    return;
                }
                deleteCompetenceMutation.mutate({ id, courseId: selectedCourseId }, {
                    onError: () => alert("No se puede eliminar esta competencia específica porque hay criterios de evaluación que dependen de ella."),
                });
                break;
            }
            case 'kc':
            case 'od':
                alert("La eliminación de Competencias Clave y Descriptores no está permitida para mantener la integridad del currículo base.");
                break;
            case 'sb':
                deleteBasicKnowledgeMutation.mutate({ id, courseId: selectedCourseId });
                break;
        }
    };

    const handleAddKeyCompetence = async () => {
        const created = await onCreateKeyCompetence({ code: '', description: '' });
        setNewlyAddedId(created.id);
    };

    const handleAddDescriptor = async (kcId: string) => {
        const created = await onCreateDescriptor(kcId, { code: '', description: '' });
        setNewlyAddedId(created.id);
    };

    const handleAddSpecificCompetence = async () => {
        const created = await createCompetence.mutateAsync({ courseId: selectedCourseId, data: { code: '', description: '' } });
        setNewlyAddedId(created.id);
    };


    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!selectedCourseId) {
            alert("Por favor, selecciona un curso para el que importar el currículo.");
            if (event.target) event.target.value = '';
            return;
        }

        const file = event.target.files?.[0];
        if (!file) return;

        const course = courses.find((c: Course) => c.id === selectedCourseId);
        if (!course) return;

        if (!curriculumImport.confirmarReemplazo(course)) {
            if (event.target) event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const buffer = e.target?.result as ArrayBuffer;
            if (!buffer) {
                alert('No se pudo leer el archivo.');
                return;
            }

            const view = new Uint8Array(buffer);
            let encoding = 'utf-8'; // Default encoding

            // Check for Byte Order Mark (BOM) to detect encoding
            if (view.length >= 2) {
                if (view[0] === 0xFF && view[1] === 0xFE) {
                    encoding = 'utf-16le';
                } else if (view[0] === 0xFE && view[1] === 0xFF) {
                    encoding = 'utf-16be';
                } else if (view.length >= 3 && view[0] === 0xEF && view[1] === 0xBB && view[2] === 0xBF) {
                    encoding = 'utf-8';
                }
            }

            const decoder = new TextDecoder(encoding);
            const text = decoder.decode(buffer);
            curriculumImport.cargarDesdeTexto(course, text, filteredCompetences);
        };
        reader.onerror = () => {
            alert('Error al leer el archivo.');
        };

        reader.readAsArrayBuffer(file);

        if (event.target) event.target.value = '';
    };

    const [presetSeleccionado, setPresetSeleccionado] = useState('');

    // El curso seleccionado (p.ej. "1º ESO") no tiene un campo numérico propio:
    // se extrae el primer dígito de "level" para poder filtrar los currículos
    // oficiales que le corresponden (no todos los códigos oficiales cubren
    // todos los cursos, p.ej. LAT/ECO solo existen en 4º).
    const cursoNumeroSeleccionado = useMemo(() => {
        const course = courses.find((c: Course) => c.id === selectedCourseId);
        const match = course?.level.match(/(\d)/);
        return match ? Number(match[1]) : null;
    }, [courses, selectedCourseId]);

    const etapaSeleccionada = useMemo((): 'eso' | 'bachillerato' => {
        const course = courses.find((c: Course) => c.id === selectedCourseId);
        return course && isBachilleratoStage(course.level) ? 'bachillerato' : 'eso';
    }, [courses, selectedCourseId]);

    const oficialesFiltrados = useMemo(
        () => filtrarPorCurso(cursoNumeroSeleccionado, etapaSeleccionada, [...CURRICULOS_OFICIALES, ...CURRICULOS_OFICIALES_BACHILLERATO]),
        [cursoNumeroSeleccionado, etapaSeleccionada]
    );
    const propiosFiltrados = useMemo(
        () => filtrarPorCurso(cursoNumeroSeleccionado, etapaSeleccionada, CURRICULOS_PROPIOS),
        [cursoNumeroSeleccionado, etapaSeleccionada]
    );
    const presetsFiltrados = useMemo(() => [...oficialesFiltrados, ...propiosFiltrados], [oficialesFiltrados, propiosFiltrados]);

    const handleCargarPreset = async () => {
        if (!selectedCourseId) {
            alert("Por favor, selecciona un curso para el que importar el currículo.");
            return;
        }
        if (!presetSeleccionado) return;

        const course = courses.find((c: Course) => c.id === selectedCourseId);
        const preset = TODOS_LOS_PRESETS.find(p => p.id === presetSeleccionado);
        if (!course || !preset) return;

        await curriculumImport.cargarDesdePreset(course, preset, filteredCompetences);
    };


    const handleDeleteCurriculum = async () => {
        if (!selectedCourseId) {
            alert("Por favor, selecciona un curso para definir el nivel educativo a eliminar (ESO o Bachillerato).");
            return;
        }

        const course = courses.find((c: Course) => c.id === selectedCourseId);
        if (!course) return;

        const isBachStage = isBachilleratoStage(course.level);
        const stage = isBachStage ? 'Bachillerato' : 'ESO';
        const stageValue: 'eso' | 'bachillerato' = isBachStage ? 'bachillerato' : 'eso';

        const courseIdsForStage = courses
            .filter((c: Course) => isBachilleratoStage(c.level) === isBachStage)
            .map((c: Course) => c.id);
        
        const coursesToDeleteText = courses
            .filter((c: Course) => courseIdsForStage.includes(c.id))
            .map((c: Course) => `- ${c.level} ${c.subject}`)
            .join('\n');

        const confirmationMessage = `¡ADVERTENCIA! Esta acción es irreversible.\n\n` +
            `Se eliminará el currículo completo de la etapa ${stage}. Esto incluye:\n\n` +
            `1. TODAS las Competencias Específicas, Criterios de Evaluación y Saberes Básicos de los siguientes cursos:\n${coursesToDeleteText}\n` +
            `2. TODOS los Descriptores Operativos de ${stage} en todas las Competencias Clave.\n\n` +
            `Si una Competencia Clave se queda sin descriptores, también será eliminada.\n` +
            `¿Estás absolutamente seguro de que quieres continuar?`;

        if (window.confirm(confirmationMessage)) {
            // Cruza TODOS los cursos de la etapa, no solo el seleccionado —
            // las queries de react-query solo cubren el curso activo, así
            // que aquí se usa `api` directamente por curso, uno a uno.
            // Mismo orden que syncCourseContentFromImport: criterios antes
            // que competencias (RESTRICT), el resto sin dependencias.
            for (const courseId of courseIdsForStage) {
                const [criteriaForCourse, competencesForCourse, basicKnowledgeForCourse] = await Promise.all([
                    api.get<EvaluationCriterion[]>(`/courses/${courseId}/criteria`),
                    api.get<SpecificCompetence[]>(`/courses/${courseId}/competences`),
                    api.get<BasicKnowledge[]>(`/courses/${courseId}/basic-knowledge`),
                ]);
                for (const c of criteriaForCourse) await deleteCriterionMutation.mutateAsync({ id: c.id, courseId });
                for (const sc of competencesForCourse) await deleteCompetenceMutation.mutateAsync({ id: sc.id, courseId });
                for (const sb of basicKnowledgeForCourse) await deleteBasicKnowledgeMutation.mutateAsync({ id: sb.id, courseId });
            }

            // Borra primero los descriptores de la etapa, luego la propia
            // competencia clave si se ha quedado sin ninguno — el backend no
            // tiene un "reemplazar todo de golpe", así que se hace uno a uno.
            for (const kc of keyCompetences) {
                const toDelete = (kc.descriptors || []).filter(d => d.stage === stageValue);
                for (const d of toDelete) {
                    await onDeleteDescriptor(d.id);
                }
                const remaining = (kc.descriptors || []).length - toDelete.length;
                if (remaining === 0 && toDelete.length > 0) {
                    await onDeleteKeyCompetence(kc.id);
                }
            }

            alert(`El currículo para la etapa ${stage} ha sido eliminado.`);
        }
    };

    const courseName = courses.find((c: Course) => c.id === selectedCourseId)?.subject || '...';
    const filteredCriteria = useMemo(() => {
        return [...(remoteEvaluationCriteria.data ?? [])].sort((a, b) => compararCodigo(a.code, b.code));
    }, [remoteEvaluationCriteria.data]);
    const filteredCompetences = useMemo(() => {
        return [...(remoteSpecificCompetences.data ?? [])].sort((a, b) => compararCodigo(a.code, b.code));
    }, [remoteSpecificCompetences.data]);
    const filteredBasicKnowledge = useMemo(() => {
        return [...(remoteBasicKnowledge.data ?? [])].sort((a, b) => compararCodigo(a.code, b.code));
    }, [remoteBasicKnowledge.data]);

    // Bug real: EditableItem mostraba los ids en bruto de descriptor/
    // competencia (p.ej. "e5eba6ff-fbf0-...") en vez de su código corto
    // (p.ej. "STEM1") bajo "Competencias Específicas" — sí se resolvían
    // bien en "Competencias Clave", que ya recorre keyCompetences con sus
    // descriptores anidados. Estos dos mapas dan el mismo código legible en
    // los otros dos sitios que hasta ahora mostraban el id sin resolver.
    const descriptorCodeById = useMemo(() => {
        const map = new Map<string, string>();
        for (const kc of keyCompetences) {
            for (const od of kc.descriptors || []) map.set(od.id, od.code);
        }
        return map;
    }, [keyCompetences]);
    const competenceCodeById = useMemo(() => {
        return new Map(filteredCompetences.map(sc => [sc.id, sc.code]));
    }, [filteredCompetences]);

    // Agrupa los saberes básicos por el nombre real de su bloque oficial
    // (p.ej. "A. Proyecto científico") en vez de mostrarlos en una lista
    // plana — el nombre viene de las filas BB del CSV importado (ver
    // parseCurriculumCsv). Los grupos se ordenan por LETRA de bloque (A, B,
    // D si ese curso no tiene C...), no alfabéticamente por nombre — igual
    // que aparecen en el propio decreto. Dentro de cada bloque, los saberes
    // ya vienen en orden natural por código (A.1, A.2, A.7, A.10...) porque
    // filteredBasicKnowledge ya está ordenado así con compararCodigo. Los
    // saberes sin bloque conocido (currículos propios, importaciones
    // antiguas sin filas BB) van todos juntos al final bajo "Sin bloque
    // asignado", nunca se pierden.
    const SIN_BLOQUE = 'Sin bloque asignado';
    const basicKnowledgeGroupedByBlock = useMemo(() => {
        const porLetra = new Map<string, { nombre: string; items: BasicKnowledge[] }>();
        const sinBloque: BasicKnowledge[] = [];
        for (const sb of filteredBasicKnowledge) {
            const letra = sb.blockName ? sb.code.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() : undefined;
            if (!letra) { sinBloque.push(sb); continue; }
            if (!porLetra.has(letra)) porLetra.set(letra, { nombre: sb.blockName!, items: [] });
            porLetra.get(letra)!.items.push(sb);
        }
        const grupos = Array.from(porLetra.entries())
            .sort((a, b) => compararCodigo(a[0], b[0]))
            .map(([letra, grupo]) => ({ ...grupo, nombre: `${letra}. ${grupo.nombre}` }));
        if (sinBloque.length > 0) grupos.push({ nombre: SIN_BLOQUE, items: sinBloque });
        return grupos;
    }, [filteredBasicKnowledge]);

    // Agrupa los criterios por competencia específica (los que no encajen en
    // ninguna, p.ej. por currículos importados con datos inconsistentes, van
    // a un grupo aparte para no perderlos silenciosamente).
    const criteriaGroupedByCompetence = useMemo(() => {
        // Se incluyen TODAS las competencias (aunque no tengan aún ningún
        // criterio) para poder añadir el primero desde su propio grupo.
        const groups = filteredCompetences
            .map((sc: SpecificCompetence) => ({ competence: sc, criteria: filteredCriteria.filter((ec: EvaluationCriterion) => ec.competenceId === sc.id) }));
        const orphanCriteria = filteredCriteria.filter((ec: EvaluationCriterion) =>
            !filteredCompetences.some((sc: SpecificCompetence) => sc.id === ec.competenceId)
        );
        return { groups, orphanCriteria };
    }, [filteredCriteria, filteredCompetences]);

    const selectedCourse = useMemo(() => courses.find((c: Course) => c.id === selectedCourseId), [courses, selectedCourseId]);
    const selectedStage = useMemo((): 'eso' | 'bachillerato' | null => {
        if (!selectedCourse) return null;
        return isBachilleratoStage(selectedCourse.level) ? 'bachillerato' : 'eso';
    }, [selectedCourse]);

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Currículo de {courseName}</h3>
                <p className="text-sm text-slate-600 mb-4">
                    Visualiza y edita las competencias específicas, criterios de evaluación y saberes básicos de esta materia.
                </p>
            </div>

            {cargandoCurriculo && (
                <div className="flex items-center gap-2 text-sm text-slate-500 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin flex-shrink-0" />
                    Cargando el currículo de esta materia…
                </div>
            )}

            <div className="space-y-3">
                <Accordion title="Competencias Clave y Descriptores Operativos">
                    <div className="space-y-4">
                        {keyCompetences.map((kc: KeyCompetence) => {
                             const descriptorsToShow = (kc.descriptors || []).filter(d =>
                                !selectedStage || // show all if no course selected
                                d.stage === selectedStage || // show if matches stage
                                !d.stage // always show generic
                            ).sort((a, b) => compararCodigo(a.code, b.code));

                            return (
                                <div key={kc.id} className="p-3 border border-slate-200 rounded-lg bg-slate-50/50">
                                    <EditableItem item={kc} type="kc" onSave={handleUpdate} onDelete={handleDelete} defaultEditing={kc.id === newlyAddedId} />
                                    <div className="pl-4 mt-2 space-y-1">
                                        {descriptorsToShow.map(od => (
                                            <EditableItem key={od.id} item={od} type="od" onSave={handleUpdate} onDelete={handleDelete} defaultEditing={od.id === newlyAddedId} />
                                        ))}
                                        <button
                                            onClick={() => handleAddDescriptor(kc.id)}
                                            className={`text-xs font-semibold flex items-center gap-1 mt-1 ${linkClassName}`}
                                        >
                                            <PlusIcon className="w-3 h-3" /> Añadir descriptor
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        <button
                            onClick={handleAddKeyCompetence}
                            className={`text-sm font-semibold flex items-center gap-1 ${linkClassName}`}
                        >
                            <PlusIcon className="w-4 h-4" /> Añadir competencia clave
                        </button>
                    </div>
                </Accordion>

                <Accordion title={`Competencias Específicas para ${courseName}`}>
                    <div className="space-y-2">
                        {filteredCompetences.map((sc: SpecificCompetence) => (
                            <EditableItem key={sc.id} item={sc} type="sc" onSave={handleUpdate} onDelete={handleDelete} defaultEditing={sc.id === newlyAddedId} descriptorCodeById={descriptorCodeById} />
                        ))}
                        <button
                            onClick={handleAddSpecificCompetence}
                            className={`text-sm font-semibold flex items-center gap-1 ${linkClassName}`}
                        >
                            <PlusIcon className="w-4 h-4" /> Añadir competencia específica
                        </button>
                    </div>
                </Accordion>

                 <Accordion title={`Criterios de Evaluación para ${courseName}`}>
                    {(() => {
                        const repartoManual = selectedCourse?.pesoCriteriosManual === true;
                        // Los criterios marcados "no cuenta para la nota" quedan fuera del
                        // reparto por completo: ni tienen que sumar al 100%, ni el botón de
                        // ajustar los toca.
                        const criteriaEnJuego = filteredCriteria.filter((c: EvaluationCriterion) => !c.excludeFromWeighting);
                        // Un peso de 0% escrito a mano es la misma ambigüedad que no
                        // rellenarlo — si de verdad no debe contar, es "No cuenta para la
                        // nota" (excludeFromWeighting), no un 0 suelto.
                        const sinResolver = criteriaEnJuego.filter((c: EvaluationCriterion) => c.weight == null || c.weight === 0);
                        const totalWeight = criteriaEnJuego.reduce((sum: number, ec: EvaluationCriterion) => sum + (ec.weight || 0), 0);
                        const sumaCorrecta = Math.abs(totalWeight - 100) < 0.01;

                        const handleToggleRepartoManual = (manual: boolean) => {
                            onUpdateCourse(selectedCourseId, { pesoCriteriosManual: manual });
                        };

                        const handleAjustarPesos = () => {
                            // Un 0% cuenta como "sin resolver" igual que null, ver arriba.
                            const weighted = criteriaEnJuego.filter((c: EvaluationCriterion) => c.weight != null && c.weight !== 0);
                            const unweighted = criteriaEnJuego.filter((c: EvaluationCriterion) => c.weight == null || c.weight === 0);
                            const explicitSum = weighted.reduce((sum: number, c: EvaluationCriterion) => sum + (c.weight || 0), 0);

                            // Peso objetivo al que se reescalan los criterios YA ponderados, y
                            // los pesos que recibirán los criterios sin ponderar (por defecto 0,
                            // salvo que se elija repartir el resto entre ellos).
                            let weightedTargetSum = 100;
                            let unweightedWeights: number[] = unweighted.map(() => 0);

                            if (unweighted.length > 0) {
                                const remaining = 100 - explicitSum;
                                if (remaining <= 0) {
                                    alert(`Los criterios con peso ya suman ${explicitSum}%: no queda porcentaje para repartir. ${unweighted.length === 1 ? 'El criterio' : 'Los ' + unweighted.length + ' criterios'} sin peso se quedará${unweighted.length === 1 ? '' : 'n'} a 0%.`);
                                    // unweightedWeights ya está a 0; weighted se reescala a 100 entre ellos.
                                } else {
                                    const repartir = window.confirm(
                                        `Hay ${unweighted.length} criterio(s) sin peso definido.\n\nAceptar: repartir el ${remaining.toFixed(2)}% restante a partes iguales entre ellos.\nCancelar: dejarlos a 0%.`
                                    );
                                    if (repartir) {
                                        unweightedWeights = roundToExactSum(unweighted.map(() => remaining / unweighted.length), remaining);
                                        weightedTargetSum = explicitSum; // los ya ponderados no cambian, ya suman esto
                                    }
                                    // Si no reparte, unweightedWeights sigue a 0 y weighted se reescala a 100.
                                }
                            } else if (!window.confirm(`Los pesos actuales suman ${totalWeight}%. ¿Ajustarlos proporcionalmente para que sumen 100%?`)) {
                                return;
                            }

                            const weightedRaw = weighted.map((c: EvaluationCriterion) =>
                                explicitSum > 0 ? ((c.weight || 0) / explicitSum) * weightedTargetSum : weightedTargetSum / weighted.length
                            );
                            const weightedRounded = roundToExactSum(weightedRaw, weightedTargetSum);

                            const weightMap = new Map<string, number>();
                            weighted.forEach((c: EvaluationCriterion, i: number) => weightMap.set(c.id, weightedRounded[i]));
                            unweighted.forEach((c: EvaluationCriterion, i: number) => weightMap.set(c.id, unweightedWeights[i]));

                            weightMap.forEach((weight, id) => {
                                updateCriterionMutation.mutate({ id, courseId: selectedCourseId, data: { weight } });
                            });
                        };

                        // Compartir pesos entre compañeros -- separado del CSV grande de
                        // currículo (ese no lleva columna de peso, y mezclar ambos formatos
                        // sería confuso). Solo tiene sentido si el compañero ya tiene cargado
                        // el MISMO currículo oficial: se empareja por código contra los
                        // criterios que YA existen en su curso, nunca crea ni borra ninguno.
                        const handleExportarPesos = () => {
                            const filas = criteriaEnJuego
                                .concat(filteredCriteria.filter((c: EvaluationCriterion) => c.excludeFromWeighting))
                                .sort((a: EvaluationCriterion, b: EvaluationCriterion) => compararCodigo(a.code, b.code))
                                .map((c: EvaluationCriterion) => `${c.code},${c.weight ?? ''},${c.excludeFromWeighting ? 'true' : 'false'}`);
                            const csv = ['code,weight,excludeFromWeighting', ...filas].join('\n');
                            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `pesos-${courseName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                        };

                        const handleImportarPesosFile = (event: React.ChangeEvent<HTMLInputElement>) => {
                            const file = event.target.files?.[0];
                            if (event.target) event.target.value = '';
                            if (!file) return;

                            const reader = new FileReader();
                            reader.onload = async (e) => {
                                const text = e.target?.result as string;
                                const lineas = text.split(/\r\n|\n/).filter(l => l.trim() !== '');
                                lineas.shift(); // cabecera
                                const criteriosPorCodigo = new Map(filteredCriteria.map((c: EvaluationCriterion) => [c.code, c]));
                                const noEncontrados: string[] = [];
                                // Un peso no numérico (columna corrupta, fila mal editada a mano) se
                                // convertía antes en NaN -> null en silencio, la misma ambigüedad que
                                // ya se evita en el resto de este formulario -- se avisa igual que un
                                // código sin encontrar, no se aplica callado.
                                const pesosInvalidos: string[] = [];
                                const aAplicar: { id: string; weight: number | undefined; excludeFromWeighting: boolean }[] = [];

                                for (const linea of lineas) {
                                    const [code, weightTexto, excludeTexto] = linea.split(',').map(s => s.trim());
                                    const criterio = criteriosPorCodigo.get(code);
                                    if (!criterio) {
                                        noEncontrados.push(code);
                                        continue;
                                    }
                                    const excludeFromWeighting = excludeTexto === 'true';
                                    if (!excludeFromWeighting && weightTexto !== '' && isNaN(Number(weightTexto))) {
                                        pesosInvalidos.push(code);
                                        continue;
                                    }
                                    const weight = excludeFromWeighting || weightTexto === '' ? undefined : Number(weightTexto);
                                    aAplicar.push({ id: criterio.id, weight, excludeFromWeighting });
                                }

                                const resultados = await Promise.allSettled(
                                    aAplicar.map(({ id, weight, excludeFromWeighting }) =>
                                        updateCriterionMutation.mutateAsync({ id, courseId: selectedCourseId, data: { weight, excludeFromWeighting } })
                                    )
                                );
                                const aplicados = resultados.filter(r => r.status === 'fulfilled').length;
                                const fallidos = resultados.length - aplicados;

                                if (aplicados > 0 && !repartoManual) onUpdateCourse(selectedCourseId, { pesoCriteriosManual: true });

                                alert(
                                    `Pesos importados: ${aplicados} criterio(s) actualizado(s) de verdad.` +
                                    (fallidos > 0 ? `\n\n${fallidos} actualización(es) fallaron (revisa tu conexión e inténtalo de nuevo).` : '') +
                                    (pesosInvalidos.length > 0 ? `\n\n${pesosInvalidos.length} peso(s) no eran un número válido, se han ignorado: ${pesosInvalidos.join(', ')}.` : '') +
                                    (noEncontrados.length > 0 ? `\n\n${noEncontrados.length} código(s) del archivo no existen en este curso, se han ignorado: ${noEncontrados.join(', ')}.` : '')
                                );
                            };
                            reader.onerror = () => alert('Error al leer el archivo.');
                            reader.readAsText(file, 'utf-8');
                        };

                        return (
                            <div className="mb-3 space-y-2">
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!repartoManual}
                                        onChange={(e) => handleToggleRepartoManual(!e.target.checked)}
                                        className={checkboxClassName}
                                    />
                                    Reparto igual entre criterios
                                </label>
                                {repartoManual ? (
                                    <>
                                        <div className={`flex items-center gap-2 text-xs font-semibold ${sumaCorrecta ? 'text-slate-500' : 'text-amber-600'}`}>
                                            <span>Peso anual total: {totalWeight}% {!sumaCorrecta && '(debe sumar 100%)'}</span>
                                            {!sumaCorrecta && (
                                                <button
                                                    onClick={handleAjustarPesos}
                                                    className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-800"
                                                >
                                                    Ajustar a 100%
                                                </button>
                                            )}
                                        </div>
                                        {sinResolver.length > 0 && (
                                            <p className="text-xs font-semibold text-red-600">
                                                {sinResolver.length === 1 ? 'Hay 1 criterio' : `Hay ${sinResolver.length} criterios`} sin peso ni marcar como excluido — cuenta{sinResolver.length === 1 ? '' : 'n'} como 0% mientras tanto: {sinResolver.map((c: EvaluationCriterion) => c.code).join(', ')}.
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 pt-1">
                                            <button
                                                onClick={handleExportarPesos}
                                                className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                                            >
                                                Exportar pesos (CSV)
                                            </button>
                                            <input
                                                type="file"
                                                accept=".csv"
                                                id="pesos-importer"
                                                className="hidden"
                                                onChange={handleImportarPesosFile}
                                            />
                                            <label
                                                htmlFor="pesos-importer"
                                                className="cursor-pointer text-xs font-semibold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                                            >
                                                Importar pesos (CSV)
                                            </label>
                                            <span className="text-xs text-slate-400">para compartir con compañeros con el mismo currículo</span>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-xs text-slate-400">
                                        Reparto igual activo: los {filteredCriteria.length} criterios pesan lo mismo, sea cual sea el peso que se guardara antes.
                                    </p>
                                )}
                            </div>
                        );
                    })()}
                    <div className="space-y-2">
                        {criteriaGroupedByCompetence.groups.map(({ competence, criteria: groupCriteria }: { competence: SpecificCompetence; criteria: EvaluationCriterion[] }) => (
                            <CriterioGroup key={competence.id} title={`${competence.code}: ${competence.description}`} count={groupCriteria.length}>
                                {groupCriteria.map((ec: EvaluationCriterion) => (
                                    <EditableItem key={ec.id} item={ec} type="ec" onSave={handleUpdate} onDelete={handleDelete} editableWeight={selectedCourse?.pesoCriteriosManual === true} defaultEditing={ec.id === newlyAddedId} competenceCodeById={competenceCodeById} />
                                ))}
                                <button
                                    onClick={() => handleAddCriterion(competence.id)}
                                    className={`text-xs font-semibold flex items-center gap-1 ${linkClassName}`}
                                >
                                    <PlusIcon className="w-3 h-3" /> Añadir criterio
                                </button>
                            </CriterioGroup>
                        ))}
                        {criteriaGroupedByCompetence.orphanCriteria.length > 0 && (
                            <CriterioGroup title="Sin competencia específica asociada" count={criteriaGroupedByCompetence.orphanCriteria.length}>
                                {criteriaGroupedByCompetence.orphanCriteria.map((ec: EvaluationCriterion) => (
                                    <EditableItem key={ec.id} item={ec} type="ec" onSave={handleUpdate} onDelete={handleDelete} editableWeight={selectedCourse?.pesoCriteriosManual === true} defaultEditing={ec.id === newlyAddedId} competenceCodeById={competenceCodeById} />
                                ))}
                            </CriterioGroup>
                        )}
                    </div>
                 </Accordion>
                 <Accordion title={`Saberes Básicos para ${courseName}`}>
                    <div className="space-y-2">
                        {basicKnowledgeGroupedByBlock.length === 1 && basicKnowledgeGroupedByBlock[0].nombre === SIN_BLOQUE ? (
                            // Sin ningún bloque conocido (currículo propio, o importado sin
                            // filas BB) -- lista plana, agrupar bajo un único "Sin bloque
                            // asignado" sería ruido puro.
                            filteredBasicKnowledge.map((sb: BasicKnowledge) => (
                                <EditableItem key={sb.id} item={sb} type="sb" onSave={handleUpdate} onDelete={handleDelete} />
                            ))
                        ) : (
                            basicKnowledgeGroupedByBlock.map(grupo => (
                                <CriterioGroup key={grupo.nombre} title={grupo.nombre} count={grupo.items.length}>
                                    {grupo.items.map(sb => (
                                        <EditableItem key={sb.id} item={sb} type="sb" onSave={handleUpdate} onDelete={handleDelete} />
                                    ))}
                                </CriterioGroup>
                            ))
                        )}
                    </div>
                 </Accordion>
            </div>
            
            <div className="pt-6 border-t">
                 <h4 className={`${TYPOGRAPHY.sectionTitle} mb-2`}>Importar Currículo desde CSV</h4>
                 <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 space-y-3">
                    <p className="font-semibold">Instrucciones para el formato del archivo CSV:</p>
                    <ul className="list-disc list-inside space-y-1">
                        <li>El currículo importado (CE, EC, SB) se asignará automáticamente al curso seleccionado en el desplegable. <strong>No es necesario añadir una columna `courseId` al CSV.</strong></li>
                        <li>El archivo debe tener una cabecera: <strong>type,id,code,description,links...</strong></li>
                        <li>Utiliza la codificación <strong>UTF-8</strong> para evitar problemas con tildes y caracteres especiales.</li>
                        <li>Si la descripción contiene comas, debe ir entre comillas dobles (<code>"</code>).</li>
                        <li>Los Descriptores Operativos (OD) se vincularán a la etapa (ESO/Bachillerato) del curso seleccionado.</li>
                        <li><strong>Importante:</strong> El sistema detectará si los Descriptores (OD) ya existen por su código (ej. "CCL1") y los unificará automáticamente, incluso si los IDs en el archivo CSV son diferentes entre cursos (ej. <code>od_bg3_ccl1</code> vs <code>od_bg4_ccl1</code>).</li>
                        <li>La columna <strong>id</strong> debe ser un identificador <strong>único para CEs, ECs y SBs</strong>.</li>
                        <li>La columna <strong>type</strong> indica el tipo de elemento:
                            <ul className="list-['-_'] list-inside pl-4">
                                <li><strong>KC:</strong> Competencia Clave.</li>
                                <li><strong>OD:</strong> Descriptor Operativo. En la 5ª columna, poner el <code>id</code> de su Competencia Clave (el `id` de la fila KC en el mismo archivo).</li>
                                <li><strong>SC:</strong> Competencia Específica. En las siguientes columnas, los <code>id</code> de sus Descriptores Operativos. Se asignará al curso seleccionado.</li>
                                <li><strong>EC:</strong> Criterio de Evaluación. El sistema lo vinculará a la Competencia Específica (SC) que tenga el código correspondiente (ej. un criterio "1.2" se vincula a la CE "CEs 1") <strong>definida en el mismo archivo</strong>. Se asignará al curso seleccionado.</li>
                                <li><strong>SB:</strong> Saber Básico. No necesita enlaces. Se asignará al curso seleccionado. Su bloque se resuelve por la letra inicial del código (p.ej. "A" en "A.1") contra las filas BB del mismo archivo.</li>
                                <li><strong>BB:</strong> nombre del Bloque de saberes básicos (opcional). La columna <code>code</code> lleva la letra del bloque ("A", "B"...) y <code>description</code> su nombre real (p.ej. "Proyecto científico"). No crea ningún elemento por sí sola, solo agrupa los SB con esa letra bajo ese nombre en pantalla — sin filas BB, los saberes básicos se muestran en una lista plana como hasta ahora.</li>
                            </ul>
                        </li>
                    </ul>
                    <details>
                        <summary className={`cursor-pointer font-medium ${linkClassName}`}>Ver ejemplo de formato</summary>
                        <pre className="mt-2 p-2 bg-slate-200 text-xs rounded overflow-x-auto">
{`type,id,code,description,links
KC,kc-ccl-generic,"CCL","Competencia en comunicación lingüística"
OD,od-ccl1-generic,"CCL1","Se expresa de forma oral...",kc-ccl-generic
SC,sc-bg3-1,"CEs 1","Interpretar y transmitir información...",od-ccl1-generic
EC,ec-bg3-1.1,"1.1","Analizar conceptos y procesos biológicos..."
SB,sb-bg3-1,"A.1","La célula como unidad estructural..."`}
                        </pre>
                    </details>
                </div>

                <div className="p-3 bg-slate-100 rounded-lg border mt-4 space-y-2">
                    <label htmlFor="preset-curr-select" className="block text-sm font-medium text-slate-700">
                        Currículo preseleccionado
                    </label>
                    <div className="flex items-end gap-2">
                        <Select
                            id="preset-curr-select"
                            value={presetsFiltrados.some(p => p.id === presetSeleccionado) ? presetSeleccionado : ''}
                            onChange={e => setPresetSeleccionado(e.target.value)}
                            className="flex-1"
                            title={presetsFiltrados.find(p => p.id === presetSeleccionado)?.materia}
                        >
                            <option value="">Selecciona materia y curso...</option>
                            {oficialesFiltrados.length > 0 && (
                                <optgroup label="Oficiales (decreto LOMLOE, Asturias)">
                                    {oficialesFiltrados.map(preset => (
                                        <option key={preset.id} value={preset.id} title={preset.materia}>{preset.etiqueta}</option>
                                    ))}
                                </optgroup>
                            )}
                            {propiosFiltrados.length > 0 && (
                                <optgroup label="⚠ No oficiales (propios)">
                                    {propiosFiltrados.map(preset => (
                                        <option key={preset.id} value={preset.id} title={preset.materia}>⚠ {preset.etiqueta} — no oficial</option>
                                    ))}
                                </optgroup>
                            )}
                        </Select>
                        <button
                            onClick={handleCargarPreset}
                            disabled={!selectedCourseId || !presetSeleccionado || curriculumImport.importando}
                            className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {curriculumImport.importando && <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" />}
                            {curriculumImport.importando ? 'Cargando…' : 'Cargar'}
                        </button>
                    </div>
                    <p className="text-xs text-slate-500">
                        {cursoNumeroSeleccionado !== null
                            ? `Mostrando materias de ${cursoNumeroSeleccionado}º ESO.`
                            : 'Selecciona un curso arriba para filtrar por nivel.'}
                        {' '}Los marcados con ⚠ no corresponden al decreto: son currículos propios (p.ej. Diversificación).
                    </p>
                </div>

                <div className="flex items-end gap-4 p-3 bg-slate-100 rounded-lg border mt-4">
                    <input
                        type="file"
                        id="csv-importer"
                        className="hidden"
                        accept=".csv, text/csv"
                        onChange={handleFileChange}
                        disabled={curriculumImport.importando}
                    />
                    <label
                        htmlFor="csv-importer"
                        className={`cursor-pointer w-full text-center bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 ${(!selectedCourseId || curriculumImport.importando) ? 'bg-blue-300 cursor-not-allowed pointer-events-none' : ''}`}
                    >
                        {curriculumImport.importando && <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" />}
                        {curriculumImport.importando ? 'Cargando…' : 'O sube tu propio archivo CSV...'}
                    </label>
                </div>

                {curriculumImport.importando && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 p-3 bg-blue-50 border border-blue-200 rounded-lg mt-3">
                        <span className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
                        Importando el currículo… puede tardar unos segundos, no cierres esta ventana.
                    </div>
                )}
            </div>

            <div className="pt-6 border-t border-red-200 mt-6">
                <h4 className="text-lg font-semibold text-red-800 mb-2">Zona de Peligro</h4>
                <p className="text-sm text-slate-600 mb-4">
                    Esta acción elimina el currículo para toda una etapa educativa (ESO o Bachillerato), según el curso seleccionado.
                </p>
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <Button variant="danger" onClick={handleDeleteCurriculum} disabled={!selectedCourseId} className="w-full">
                        Eliminar Currículo de la Etapa Seleccionada
                    </Button>
                </div>
            </div>
        </div>
    );
};

interface EditableItemProps {
    item: CurriculumItem;
    type: CurriculumItemType;
    onSave: (type: CurriculumItemType, item: CurriculumItem) => void;
    onDelete: (type: CurriculumItemType, id: string) => void;
    editableWeight?: boolean;
    defaultEditing?: boolean;
    // Solo hacen falta para 'sc' (descriptores enlazados) y 'ec' (competencia
    // enlazada) — mostrar su código corto (p.ej. "STEM1") en vez del id.
    descriptorCodeById?: Map<string, string>;
    competenceCodeById?: Map<string, string>;
}

// `code`/`description`/`id` existen en los 5 tipos de ítem curricular, así
// que se leen directamente sobre la unión sin narrowing. `weight` (solo en
// EvaluationCriterion), `keyCompetenceDescriptorIds` (solo en
// SpecificCompetence) y `competenceId` (solo en EvaluationCriterion) usan
// el operador `in` para estrechar la unión sin necesidad de casts.
const EditableItem: React.FC<EditableItemProps> = ({ item, type, onSave, onDelete, editableWeight, defaultEditing, descriptorCodeById, competenceCodeById }) => {
    const [isEditing, setIsEditing] = useState(!!defaultEditing);
    const [data, setData] = useState<CurriculumItem>(item);

    const handleSave = () => {
        onSave(type, data);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setData(item);
        setIsEditing(false);
    };

    if (isEditing) {
        const weight = 'weight' in data ? data.weight : undefined;
        const excluded = 'excludeFromWeighting' in data ? data.excludeFromWeighting === true : false;
        // Un 0% escrito a mano cuenta como "sin resolver" igual que vacío: si de
        // verdad no debe puntuar, es "No cuenta para la nota", no un 0 suelto —
        // evita reproducir la ambigüedad que causó el problema original.
        const pesoInvalido = type === 'ec' && editableWeight && !excluded && (weight == null || weight === 0);
        return (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <Input
                    value={data.code}
                    onChange={(e) => setData({ ...data, code: e.target.value })}
                    placeholder="Código"
                />
                 <Textarea
                    value={data.description}
                    onChange={(e) => setData({ ...data, description: e.target.value })}
                    className="min-h-[60px]"
                    placeholder="Descripción"
                />
                {type === 'ec' && editableWeight && (
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Peso anual (%)</label>
                            <Input
                                type="number" min="0" max="100" step="1"
                                value={weight ?? ''}
                                onChange={(e) => setData({ ...data, weight: e.target.value === '' ? undefined : Number(e.target.value) } as EvaluationCriterion)}
                                className="!w-28"
                                disabled={excluded}
                                error={pesoInvalido}
                            />
                            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={excluded}
                                    onChange={(e) => setData({ ...data, excludeFromWeighting: e.target.checked, weight: e.target.checked ? undefined : weight } as EvaluationCriterion)}
                                    className={checkboxClassName}
                                />
                                No cuenta para la nota
                            </label>
                        </div>
                        {pesoInvalido && (
                            <p className="text-xs text-red-600">Asigna un peso o marca "No cuenta para la nota" — no puede quedar sin ninguno de los dos.</p>
                        )}
                    </div>
                )}
                <div className="flex justify-end gap-2">
                    <button onClick={handleCancel} className="text-xs font-semibold text-slate-600 hover:text-slate-800">Cancelar</button>
                    <button onClick={handleSave} disabled={pesoInvalido} className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 rounded-md">Guardar</button>
                </div>
            </div>
        )
    }

    const weight = 'weight' in item ? item.weight : undefined;
    const excluded = 'excludeFromWeighting' in item ? item.excludeFromWeighting === true : false;
    const keyCompetenceDescriptorIds = 'keyCompetenceDescriptorIds' in item ? item.keyCompetenceDescriptorIds : undefined;
    const competenceId = 'competenceId' in item ? item.competenceId : undefined;

    return (
        <div className="flex items-center gap-2 p-2 group hover:bg-slate-50 rounded-md">
            <div className="flex-grow">
                <p className="font-semibold text-sm">
                    {item.code}: <span className="font-normal text-slate-700">{item.description}</span>
                    {type === 'ec' && editableWeight && (
                        excluded
                            ? <Badge variant="neutral" className="ml-2 align-middle">No cuenta</Badge>
                            : weight != null && weight !== 0
                                ? <Badge className="ml-2 align-middle">{weight}%</Badge>
                                : <Badge variant="danger" className="ml-2 align-middle">Sin peso</Badge>
                    )}
                </p>
                {type === 'sc' && (
                    <p className="text-xs text-slate-500 mt-1">
                        Descriptores: {(keyCompetenceDescriptorIds || []).map(id => descriptorCodeById?.get(id) ?? id).join(', ') || '—'}
                    </p>
                )}
                {type === 'ec' && (
                    <p className="text-xs text-slate-500 mt-1">
                        Comp. Específica: {(competenceId && competenceCodeById?.get(competenceId)) ?? competenceId ?? '—'}
                    </p>
                )}
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <IconButton label="Editar" size="sm" onClick={() => setIsEditing(true)}><PencilIcon className="w-4 h-4" /></IconButton>
                <IconButton label="Eliminar" tone="danger" size="sm" onClick={() => onDelete(type, item.id)}><TrashIcon className="w-4 h-4" /></IconButton>
            </div>
        </div>
    );
};


export default CurriculumManager;
