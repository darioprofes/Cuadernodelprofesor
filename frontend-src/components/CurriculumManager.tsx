import React, { useState, useMemo } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { Course, KeyCompetence, OperationalDescriptor, SpecificCompetence, EvaluationCriterion, BasicKnowledge } from '../types';
import { api } from '../services/api';
import {
    useSpecificCompetences, useCreateSpecificCompetence, useUpdateSpecificCompetence, useDeleteSpecificCompetence,
    useLinkDescriptor,
} from '../hooks/useSpecificCompetences';
import { useEvaluationCriteria, useCreateCriterion, useUpdateCriterion, useDeleteCriterion } from '../hooks/useEvaluationCriteria';
import { useBasicKnowledge, useCreateBasicKnowledge, useUpdateBasicKnowledge, useDeleteBasicKnowledge } from '../hooks/useBasicKnowledge';

type CurriculumItemType = 'ec' | 'sc' | 'kc' | 'sb' | 'od';
type CurriculumItem = EvaluationCriterion | SpecificCompetence | KeyCompetence | BasicKnowledge | OperationalDescriptor;
import { PencilIcon, TrashIcon, PlusIcon, ChevronRightIcon, ChevronDownIcon } from './Icons';
import { CURRICULOS_OFICIALES, CURRICULOS_PROPIOS, TODOS_LOS_PRESETS } from '../curriculumPresets';
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
const filtrarPorCurso = (cursoNumero: number | null, presets: typeof TODOS_LOS_PRESETS) =>
    cursoNumero === null ? presets : presets.filter(p => p.curso === cursoNumero);

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
    specificCompetences: SpecificCompetence[];
    setSpecificCompetences: (updater: React.SetStateAction<SpecificCompetence[]>) => void;
    evaluationCriteria: EvaluationCriterion[];
    setEvaluationCriteria: (updater: React.SetStateAction<EvaluationCriterion[]>) => void;
    basicKnowledge: BasicKnowledge[];
    setBasicKnowledge: (updater: React.SetStateAction<BasicKnowledge[]>) => void;
}

// Recibe {...props} desde SettingsModal (todas las props de Ajustes), pero
// solo usa este subconjunto — de ahí que el tipo no sea "SettingsModalProps"
// completo, sino justo lo que se destructura aquí abajo.
//
// keyCompetences/operational_descriptors ya vienen del backend granular
// nuevo (ver plan, "Fase 5 fusionada", bloque 3) — de ahí que sus
// operaciones sean async (onCreate.../onUpdate...) en vez del patrón
// setX(prev => ...) que todavía usan specificCompetences/evaluationCriteria/
// basicKnowledge (pendientes de migrar, siguen en el blob).
const CurriculumManager: React.FC<CurriculumManagerProps> = (props) => {
    const {
        courseId, courses, onUpdateCourse, keyCompetences,
        onCreateKeyCompetence, onUpdateKeyCompetence, onDeleteKeyCompetence,
        onCreateDescriptor, onUpdateDescriptor, onDeleteDescriptor,
        specificCompetences, setSpecificCompetences, evaluationCriteria, setEvaluationCriteria, basicKnowledge, setBasicKnowledge,
    } = props;
    const selectedCourseId = courseId;
    // Elemento recién creado (criterio, competencia específica/clave o
    // descriptor): se abre directamente en modo edición para que se rellenen
    // código/descripción sin un paso extra de "editar". Solo uno pendiente a
    // la vez, es suficiente para el flujo de "añadir uno y rellenarlo".
    const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);

    // specificCompetences/evaluationCriteria/basicKnowledge: a diferencia de
    // keyCompetences (global), estas son por-curso en el backend nuevo — la
    // consulta necesita selectedCourseId, así que a diferencia del resto de
    // entidades ya migradas (donde App.tsx resuelve la plataforma de forma
    // centralizada), aquí el propio componente decide blob vs. API. Las
    // props specificCompetences/setSpecificCompetences etc. (sin cambios,
    // ver interfaz arriba) solo se usan en escritorio.
    const isDesktop = isTauri();
    const remoteSpecificCompetences = useSpecificCompetences(selectedCourseId, { enabled: !isDesktop });
    const createCompetence = useCreateSpecificCompetence();
    const updateCompetenceMutation = useUpdateSpecificCompetence();
    const deleteCompetenceMutation = useDeleteSpecificCompetence();
    const linkDescriptorMutation = useLinkDescriptor();
    const remoteEvaluationCriteria = useEvaluationCriteria(selectedCourseId, { enabled: !isDesktop });
    const createCriterionMutation = useCreateCriterion();
    const updateCriterionMutation = useUpdateCriterion();
    const deleteCriterionMutation = useDeleteCriterion();
    const remoteBasicKnowledge = useBasicKnowledge(selectedCourseId, { enabled: !isDesktop });
    const createBasicKnowledgeMutation = useCreateBasicKnowledge();
    const updateBasicKnowledgeMutation = useUpdateBasicKnowledge();
    const deleteBasicKnowledgeMutation = useDeleteBasicKnowledge();

    const handleAddCriterion = async (competenceId: string) => {
        if (isDesktop) {
            const newId = `ec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const newCriterion: EvaluationCriterion = { id: newId, code: '', description: '', competenceId, courseId: selectedCourseId };
            setEvaluationCriteria((prev: EvaluationCriterion[]) => [...prev, newCriterion]);
            setNewlyAddedId(newId);
            return;
        }
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
                if (isDesktop) {
                    setEvaluationCriteria(prev => prev.map(i => i.id === criterion.id ? criterion : i));
                } else {
                    updateCriterionMutation.mutate({ id: criterion.id, courseId: selectedCourseId, data: { code: criterion.code, description: criterion.description, weight: criterion.weight, excludeFromWeighting: criterion.excludeFromWeighting } });
                }
                break;
            }
            case 'sc': {
                const competence = item as SpecificCompetence;
                if (isDesktop) {
                    setSpecificCompetences(prev => prev.map(i => i.id === competence.id ? competence : i));
                } else {
                    updateCompetenceMutation.mutate({ id: competence.id, courseId: selectedCourseId, data: { code: competence.code, description: competence.description } });
                }
                break;
            }
            case 'kc': {
                const keyCompetence = item as KeyCompetence;
                onUpdateKeyCompetence(keyCompetence.id, { code: keyCompetence.code, description: keyCompetence.description });
                break;
            }
            case 'sb': {
                const basic = item as BasicKnowledge;
                if (isDesktop) {
                    setBasicKnowledge(prev => prev.map(i => i.id === basic.id ? basic : i));
                } else {
                    updateBasicKnowledgeMutation.mutate({ id: basic.id, courseId: selectedCourseId, data: { code: basic.code, description: basic.description } });
                }
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
                if (isDesktop) {
                    setEvaluationCriteria((prev: EvaluationCriterion[]) => prev.filter(c => c.id !== id));
                } else {
                    deleteCriterionMutation.mutate({ id, courseId: selectedCourseId });
                }
                break;
            case 'sc': {
                const currentCriteria = isDesktop ? evaluationCriteria : (remoteEvaluationCriteria.data ?? []);
                const isDependency = currentCriteria.some((ec: EvaluationCriterion) => ec.competenceId === id);
                if (isDependency) {
                    alert("No se puede eliminar esta competencia específica porque hay criterios de evaluación que dependen de ella.");
                    return;
                }
                if (isDesktop) {
                    setSpecificCompetences((prev: SpecificCompetence[]) => prev.filter(c => c.id !== id));
                } else {
                    deleteCompetenceMutation.mutate({ id, courseId: selectedCourseId }, {
                        onError: () => alert("No se puede eliminar esta competencia específica porque hay criterios de evaluación que dependen de ella."),
                    });
                }
                break;
            }
            case 'kc':
            case 'od':
                alert("La eliminación de Competencias Clave y Descriptores no está permitida para mantener la integridad del currículo base.");
                break;
            case 'sb':
                if (isDesktop) {
                    setBasicKnowledge((prev: BasicKnowledge[]) => prev.filter(sb => sb.id !== id));
                } else {
                    deleteBasicKnowledgeMutation.mutate({ id, courseId: selectedCourseId });
                }
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
        if (isDesktop) {
            const newId = `sc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const newSc: SpecificCompetence = { id: newId, code: '', description: '', keyCompetenceDescriptorIds: [], courseId: selectedCourseId };
            setSpecificCompetences((prev: SpecificCompetence[]) => [...prev, newSc]);
            setNewlyAddedId(newId);
            return;
        }
        const created = await createCompetence.mutateAsync({ courseId: selectedCourseId, data: { code: '', description: '' } });
        setNewlyAddedId(created.id);
    };


    const confirmarReemplazo = (course: Course): boolean => {
        const stage = isBachilleratoStage(course.level) ? 'Bachillerato' : 'ESO';
        const courseName = `${course.level} - ${course.subject}`;

        const confirmationMessage = `Se va a importar el currículo para el curso '${courseName}'.\n\n` +
            `- Competencias Específicas, Criterios y Saberes de ESTE CURSO serán reemplazados.\n` +
            `- Descriptores Operativos para la etapa '${stage}' serán FUSIONADOS inteligentemente por código (ej. CCL1) para evitar duplicados.\n` +
            `- Los datos de otros cursos no se verán afectados.\n\n` +
            `¿Deseas continuar?`;

        return window.confirm(confirmationMessage);
    };

    const importarTexto = async (text: string) => {
        try {
            const parsedData = parseCurriculumCsv(text, selectedCourseId, specificCompetences);
            await updateCurriculumState(parsedData, selectedCourseId);
        } catch (error) {
            console.error('Error parsing CSV:', error);
            alert('Error al procesar el archivo CSV. Comprueba el formato, el contenido y la codificación del archivo (UTF-8 o UTF-16).');
        }
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

        if (!confirmarReemplazo(course)) {
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
            importarTexto(text);
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

    const oficialesFiltrados = useMemo(() => filtrarPorCurso(cursoNumeroSeleccionado, CURRICULOS_OFICIALES), [cursoNumeroSeleccionado]);
    const propiosFiltrados = useMemo(() => filtrarPorCurso(cursoNumeroSeleccionado, CURRICULOS_PROPIOS), [cursoNumeroSeleccionado]);
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

        if (!preset.oficial && !window.confirm(
            `"${preset.etiqueta}" NO es un currículo oficial: es uno propio, no correspondiente al decreto LOMLOE. ¿Seguro que quieres importarlo?`
        )) return;

        if (!confirmarReemplazo(course)) return;

        try {
            const response = await fetch(preset.ruta);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            await importarTexto(text);
        } catch (error) {
            console.error('Error cargando currículo preseleccionado:', error);
            alert('No se pudo cargar el currículo seleccionado.');
        }
    };

    const parseCurriculumCsv = (csvText: string, courseId: string, existingSpecificCompetences: SpecificCompetence[]) => {
        const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
        if (lines.length < 1) return { newKCs: [], newODs: [], newSCs: [], newECs: [], newSBs: [] };

        const headerLine = lines.shift()!; // Remove header line
        // Algunos CSV propios (p.ej. los de Ámbito) añaden una columna final
        // "origen" (documenta a qué competencias de las materias del ámbito
        // corresponde una competencia combinada) que NO es un enlace real:
        // se calcula cuántas columnas "linkN" declara la cabecera para no
        // confundir esa anotación con un descriptor operativo más. Los CSV
        // oficiales no tienen esa columna, así que no se ven afectados.
        const numLinkColumns = headerLine.split(',').filter(h => /^link\d+$/i.test(h.trim())).length;

        const newKCs: (Omit<KeyCompetence, 'descriptors'>)[] = [];
        const newODs: (OperationalDescriptor & { parentKcId: string })[] = [];
        const newSCs: SpecificCompetence[] = [];
        const newECs: EvaluationCriterion[] = [];
        const newSBs: BasicKnowledge[] = [];

        const parseCsvLine = (line: string): string[] => {
            const result: string[] = [];
            let currentVal = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                        currentVal += '"';
                        i++; 
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    result.push(currentVal.trim());
                    currentVal = "";
                } else {
                    currentVal += char;
                }
            }
            result.push(currentVal.trim());
            return result;
        };
        
        // Mapa de CÓDIGOS de Competencias Específicas a sus IDs, priorizando las de ESTE ARCHIVO
        const localScCodeToIdMap = new Map<string, string>();
        
        // Pre-escaneo para construir el mapa local de Competencias Específicas del archivo
        lines.forEach(line => {
            const parts = parseCsvLine(line);
            const [type, id, code] = parts;
            if (type?.toUpperCase() === 'SC' && id && code) {
                localScCodeToIdMap.set(code, id);
            }
        });

        // Procesamiento principal del archivo
        for (const line of lines) {
            const parts = parseCsvLine(line);
            const [type, id, code, description, ...rest] = parts;
            const links = numLinkColumns > 0 ? rest.slice(0, numLinkColumns) : rest;
            if (!type || !id || !code || !description) continue;
            const commonData = { id, code, description };
            
            switch (type.toUpperCase()) {
                case 'KC':
                    newKCs.push({ ...commonData });
                    break;
                case 'OD':
                    newODs.push({ ...commonData, parentKcId: links[0] });
                    break;
                case 'SC': {
                    const scData = { ...commonData, courseId, keyCompetenceDescriptorIds: links.filter(l => l) };
                    newSCs.push(scData);
                    break;
                }
                case 'EC': {
                    const criterionCode = commonData.code;
                    const competenceNumberMatch = criterionCode.match(/^(\d+)\./);
                    let competenceId = links[0] || '';

                    if (competenceNumberMatch && competenceNumberMatch[1]) {
                        const targetScCode = `CEs ${competenceNumberMatch[1].trim()}`;
                        if (localScCodeToIdMap.has(targetScCode)) {
                            // Prioridad 1: Usar la competencia del archivo actual
                            competenceId = localScCodeToIdMap.get(targetScCode)!;
                        } else {
                             // Prioridad 2: Buscar una competencia existente con ese código (comportamiento anterior, como fallback)
                            const existingSc = existingSpecificCompetences.find(sc => sc.code === targetScCode && sc.courseId === courseId);
                            if (existingSc) {
                                competenceId = existingSc.id;
                                console.warn(`WARN: El criterio '${criterionCode}' se ha vinculado a una Competencia Específica existente ('${targetScCode}') porque no se encontró una con ese código en el archivo CSV importado.`);
                            } else {
                                console.error(`ERROR: No se pudo encontrar una Competencia Específica con el código '${targetScCode}' para vincular el criterio '${criterionCode}'. Por favor, asegúrate de que la competencia está definida en el mismo archivo CSV.`);
                            }
                        }
                    }
                    newECs.push({ ...commonData, courseId: courseId, competenceId: competenceId });
                    break;
                }
                case 'SB':
                    newSBs.push({ ...commonData, courseId });
                    break;
            }
        }
        return { newKCs, newODs, newSCs, newECs, newSBs };
    };

    // KC/OD: fusión inteligente por código, pero contra el backend nuevo —
    // no hay "reemplazar el array entero" en la API, así que en vez de
    // construir el estado final de golpe (como hacía el setKeyCompetences
    // de antes), se calcula ese mismo estado final KC a KC y se emiten solo
    // las llamadas (crear/actualizar) necesarias para llegar a él. Devuelve
    // el mapa de sustitución de IDs (id del CSV -> id real, ya sea uno
    // reutilizado por coincidencia de código o uno recién creado) para que
    // las Competencias Específicas puedan resolver sus enlaces después.
    const syncKeyCompetencesFromImport = async (
        newKCs: (Omit<KeyCompetence, 'descriptors'>)[],
        augmentedODs: (OperationalDescriptor & { parentKcId: string })[],
        stage: 'eso' | 'bachillerato',
    ): Promise<Map<string, string>> => {
        const odIdReplacementMap = new Map<string, string>();
        const importKcIdToCodeMap = new Map(newKCs.map(kc => [kc.id, kc.code]));

        const newODsByParentCode = new Map<string, (OperationalDescriptor & { parentKcId: string })[]>();
        augmentedODs.forEach(od => {
            const parentCode = importKcIdToCodeMap.get(od.parentKcId);
            if (parentCode) {
                if (!newODsByParentCode.has(parentCode)) newODsByParentCode.set(parentCode, []);
                newODsByParentCode.get(parentCode)!.push(od);
            }
        });

        const kcByCode = new Map(keyCompetences.map(kc => [kc.code, kc]));

        for (const nkc of newKCs) {
            let kc = kcByCode.get(nkc.code);
            if (!kc) {
                const created = await onCreateKeyCompetence({ code: nkc.code, description: nkc.description });
                kc = { ...created, descriptors: [] };
                kcByCode.set(nkc.code, kc);
            } else if (kc.description !== nkc.description) {
                await onUpdateKeyCompetence(kc.id, { description: nkc.description });
            }

            // Igual que antes: solo se tocan los descriptores de la etapa de
            // este curso (ESO o Bachillerato) — los de la otra etapa, si los
            // hay, se quedan intactos sin ni siquiera leerse aquí. La etapa
            // vive en operational_descriptors.stage (columna real); el
            // sistema anterior la codificaba en el propio id, algo que no es
            // posible con ids reales de Postgres (ver migración 0004).
            const currentStageDescriptors = (kc.descriptors || []).filter(d => d.stage === stage);
            const existingByCode = new Map(currentStageDescriptors.map(d => [d.code, d]));
            const newDescriptorsForThisKC = newODsByParentCode.get(nkc.code) || [];

            for (const newDesc of newDescriptorsForThisKC) {
                const existing = existingByCode.get(newDesc.code);
                if (existing) {
                    odIdReplacementMap.set(newDesc.id, existing.id);
                    if (existing.description !== newDesc.description) {
                        await onUpdateDescriptor(existing.id, { description: newDesc.description });
                    }
                } else {
                    const createdDescriptor = await onCreateDescriptor(kc.id, { code: newDesc.code, description: newDesc.description, stage });
                    odIdReplacementMap.set(newDesc.id, createdDescriptor.id);
                }
            }
        }

        return odIdReplacementMap;
    };

    // SC/EC/SB (resto del bloque 3): a diferencia de KC/OD (fusión por
    // código), el comportamiento original aquí era un reemplazo COMPLETO del
    // curso — se tiraba lo que hubiera y se ponía lo importado. Se replica
    // borrando primero lo existente y creando después lo nuevo. El orden
    // importa: evaluation_criteria.competence_id es RESTRICT, así que hay
    // que borrar criterios antes que competencias, y crear competencias
    // antes que criterios (para poder resolver sus ids reales). Usa `api`
    // directamente (no los hooks de mutación) porque necesita leer el
    // estado actual del curso de golpe, no solo mutarlo.
    const syncCourseContentFromImport = async (
        courseId: string,
        newSCs: SpecificCompetence[],
        newECs: EvaluationCriterion[],
        newSBs: BasicKnowledge[],
        odIdReplacementMap: Map<string, string>,
        suffix: string,
    ): Promise<void> => {
        const augmentId = (id: string, suffixToAdd: string) => (id.endsWith('-eso') || id.endsWith('-bach')) ? id : id + suffixToAdd;

        const [existingCriteria, existingCompetences, existingBasicKnowledge] = await Promise.all([
            api.get<EvaluationCriterion[]>(`/courses/${courseId}/criteria`),
            api.get<SpecificCompetence[]>(`/courses/${courseId}/competences`),
            api.get<BasicKnowledge[]>(`/courses/${courseId}/basic-knowledge`),
        ]);

        for (const c of existingCriteria) await deleteCriterionMutation.mutateAsync({ id: c.id, courseId });
        for (const sc of existingCompetences) await deleteCompetenceMutation.mutateAsync({ id: sc.id, courseId });
        for (const sb of existingBasicKnowledge) await deleteBasicKnowledgeMutation.mutateAsync({ id: sb.id, courseId });

        const scIdReplacementMap = new Map<string, string>();
        for (const sc of newSCs) {
            const created = await createCompetence.mutateAsync({ courseId, data: { code: sc.code, description: sc.description } });
            scIdReplacementMap.set(sc.id, created.id);

            const rawDescriptorIds = sc.keyCompetenceDescriptorIds.map(id => augmentId(id, suffix));
            const resolvedDescriptorIds = Array.from(new Set(rawDescriptorIds.map(id => odIdReplacementMap.get(id) ?? id)));
            for (const descriptorId of resolvedDescriptorIds) {
                await linkDescriptorMutation.mutateAsync({ competenceId: created.id, courseId, descriptorId });
            }
        }

        for (const ec of newECs) {
            const resolvedCompetenceId = scIdReplacementMap.get(ec.competenceId) ?? ec.competenceId;
            await createCriterionMutation.mutateAsync({
                courseId,
                data: { competenceId: resolvedCompetenceId, code: ec.code, description: ec.description, weight: ec.weight, excludeFromWeighting: ec.excludeFromWeighting ?? false },
            });
        }

        for (const sb of newSBs) {
            await createBasicKnowledgeMutation.mutateAsync({ courseId, data: { code: sb.code, description: sb.description } });
        }
    };

    const updateCurriculumState = async ({ newKCs, newODs, newSCs, newECs, newSBs }: {
        newKCs: (Omit<KeyCompetence, 'descriptors'>)[];
        newODs: (OperationalDescriptor & { parentKcId: string })[];
        newSCs: SpecificCompetence[];
        newECs: EvaluationCriterion[];
        newSBs: BasicKnowledge[];
    }, courseId: string) => {
        if ([newKCs, newODs, newSCs, newECs, newSBs].every(arr => arr.length === 0)) {
            alert("No se encontraron elementos curriculares válidos en el archivo.");
            return;
        }

        const course = courses.find((c: Course) => c.id === courseId);
        if (!course) return;

        const isBachStage = isBachilleratoStage(course.level);
        const stage = isBachStage ? 'Bachillerato' : 'ESO';
        const suffix = isBachStage ? '-bach' : '-eso';
        // stageValue: valor real que se guarda en operational_descriptors.stage
        // (ver syncKeyCompetencesFromImport) — distinto de `suffix`, que solo
        // sirve para namespacing de ids DENTRO del propio CSV importado.
        const stageValue: 'eso' | 'bachillerato' = isBachStage ? 'bachillerato' : 'eso';

        const augmentId = (id: string, suffixToAdd: string) => {
            if (id.endsWith('-eso') || id.endsWith('-bach')) {
                return id;
            }
            return id + suffixToAdd;
        };

        // Augment IDs in the new data to make them stage-specific
        const augmentedODs = newODs.map(od => ({ ...od, id: augmentId(od.id, suffix) }));

        if (isDesktop) {
            setEvaluationCriteria((prevCriteria: EvaluationCriterion[]) => {
                const criteriaFromOtherCourses = prevCriteria.filter(c => c.courseId !== courseId);
                return [...criteriaFromOtherCourses, ...newECs].sort((a, b) => compararCodigo(a.code, b.code));
            });

            setBasicKnowledge((prevSBs: BasicKnowledge[]) => {
                const sbsFromOtherCourses = prevSBs.filter(sb => sb.courseId !== courseId);
                return [...sbsFromOtherCourses, ...newSBs].sort((a, b) => compararCodigo(a.code, b.code));
            });

            const odIdReplacementMap = await syncKeyCompetencesFromImport(newKCs, augmentedODs, stageValue);

            // SPECIFIC COMPETENCES MERGING (WITH LINK RESOLUTION)
            setSpecificCompetences((prev: SpecificCompetence[]) => {
                const scsFromOtherCourses = prev.filter(sc => sc.courseId !== courseId);

                const resolvedSCs = newSCs.map(sc => {
                    // 1. Augment IDs first (add suffix)
                    const rawDescriptorIds = sc.keyCompetenceDescriptorIds.map(id => augmentId(id, suffix));

                    // 2. Resolve IDs using the replacement map generated during Descriptor merging
                    const resolvedDescriptorIds = rawDescriptorIds.map(id => {
                        if (odIdReplacementMap.has(id)) {
                            return odIdReplacementMap.get(id)!;
                        }
                        return id;
                    });

                    // Remove duplicates in links just in case
                    return {
                        ...sc,
                        keyCompetenceDescriptorIds: Array.from(new Set(resolvedDescriptorIds))
                    };
                });

                return [...scsFromOtherCourses, ...resolvedSCs].sort((a, b) => compararCodigo(a.code, b.code));
            });
        } else {
            const odIdReplacementMap = await syncKeyCompetencesFromImport(newKCs, augmentedODs, stageValue);
            await syncCourseContentFromImport(courseId, newSCs, newECs, newSBs, odIdReplacementMap, suffix);
        }

        const courseName = `${course.level} - ${course.subject}`;
        alert(`Currículo para '${courseName}' (${stage.toUpperCase()}) importado con éxito.\n\nSe ha aplicado una fusión inteligente de Descriptores Operativos para evitar duplicados entre cursos.`);
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
            const courseIdsSet = new Set(courseIdsForStage);

            if (isDesktop) {
                setEvaluationCriteria((prev: EvaluationCriterion[]) => prev.filter(item => !courseIdsSet.has(item.courseId)));
                setSpecificCompetences((prev: SpecificCompetence[]) => prev.filter(item => !courseIdsSet.has(item.courseId)));
                setBasicKnowledge((prev: BasicKnowledge[]) => prev.filter(item => !courseIdsSet.has(item.courseId)));
            } else {
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
        const source = isDesktop ? evaluationCriteria.filter((ec: EvaluationCriterion) => ec.courseId === selectedCourseId) : (remoteEvaluationCriteria.data ?? []);
        return [...source].sort((a, b) => compararCodigo(a.code, b.code));
    }, [isDesktop, evaluationCriteria, remoteEvaluationCriteria.data, selectedCourseId]);
    const filteredCompetences = useMemo(() => {
        const source = isDesktop ? specificCompetences.filter((sc: SpecificCompetence) => sc.courseId === selectedCourseId) : (remoteSpecificCompetences.data ?? []);
        return [...source].sort((a, b) => compararCodigo(a.code, b.code));
    }, [isDesktop, specificCompetences, remoteSpecificCompetences.data, selectedCourseId]);
    const filteredBasicKnowledge = useMemo(() => {
        const source = isDesktop ? basicKnowledge.filter((sb: BasicKnowledge) => sb.courseId === selectedCourseId) : (remoteBasicKnowledge.data ?? []);
        return [...source].sort((a, b) => compararCodigo(a.code, b.code));
    }, [isDesktop, basicKnowledge, remoteBasicKnowledge.data, selectedCourseId]);

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
                            <EditableItem key={sc.id} item={sc} type="sc" onSave={handleUpdate} onDelete={handleDelete} defaultEditing={sc.id === newlyAddedId} />
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

                            if (isDesktop) {
                                setEvaluationCriteria((prev: EvaluationCriterion[]) => prev.map((c: EvaluationCriterion) =>
                                    weightMap.has(c.id) ? { ...c, weight: weightMap.get(c.id) } : c
                                ));
                            } else {
                                weightMap.forEach((weight, id) => {
                                    updateCriterionMutation.mutate({ id, courseId: selectedCourseId, data: { weight } });
                                });
                            }
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
                                    <EditableItem key={ec.id} item={ec} type="ec" onSave={handleUpdate} onDelete={handleDelete} editableWeight={selectedCourse?.pesoCriteriosManual === true} defaultEditing={ec.id === newlyAddedId} />
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
                                    <EditableItem key={ec.id} item={ec} type="ec" onSave={handleUpdate} onDelete={handleDelete} editableWeight={selectedCourse?.pesoCriteriosManual === true} defaultEditing={ec.id === newlyAddedId} />
                                ))}
                            </CriterioGroup>
                        )}
                    </div>
                 </Accordion>
                 <Accordion title={`Saberes Básicos para ${courseName}`}>
                    <div className="space-y-2">
                        {filteredBasicKnowledge.map((sb: BasicKnowledge) => (
                            <EditableItem key={sb.id} item={sb} type="sb" onSave={handleUpdate} onDelete={handleDelete} />
                        ))}
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
                                <li><strong>SB:</strong> Saber Básico. No necesita enlaces. Se asignará al curso seleccionado.</li>
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
                        >
                            <option value="">Selecciona materia y curso...</option>
                            {oficialesFiltrados.length > 0 && (
                                <optgroup label="Oficiales (decreto LOMLOE, Asturias)">
                                    {oficialesFiltrados.map(preset => (
                                        <option key={preset.id} value={preset.id}>{preset.etiqueta}</option>
                                    ))}
                                </optgroup>
                            )}
                            {propiosFiltrados.length > 0 && (
                                <optgroup label="⚠ No oficiales (propios)">
                                    {propiosFiltrados.map(preset => (
                                        <option key={preset.id} value={preset.id}>⚠ {preset.etiqueta} — no oficial</option>
                                    ))}
                                </optgroup>
                            )}
                        </Select>
                        <button
                            onClick={handleCargarPreset}
                            disabled={!selectedCourseId || !presetSeleccionado}
                            className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
                        >
                            Cargar
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
                    />
                    <label
                        htmlFor="csv-importer"
                        className={`cursor-pointer w-full text-center bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors ${!selectedCourseId ? 'bg-blue-300 cursor-not-allowed' : ''}`}
                    >
                        O sube tu propio archivo CSV...
                    </label>
                </div>
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
}

// `code`/`description`/`id` existen en los 5 tipos de ítem curricular, así
// que se leen directamente sobre la unión sin narrowing. `weight` (solo en
// EvaluationCriterion), `keyCompetenceDescriptorIds` (solo en
// SpecificCompetence) y `competenceId` (solo en EvaluationCriterion) usan
// el operador `in` para estrechar la unión sin necesidad de casts.
const EditableItem: React.FC<EditableItemProps> = ({ item, type, onSave, onDelete, editableWeight, defaultEditing }) => {
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
                                className="w-28"
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
                {type === 'sc' && <p className="text-xs text-slate-500 mt-1">Descriptores: {(keyCompetenceDescriptorIds || []).join(', ')}</p>}
                 {type === 'ec' && <p className="text-xs text-slate-500 mt-1">Comp. Específica: {competenceId}</p>}
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <IconButton label="Editar" size="sm" onClick={() => setIsEditing(true)}><PencilIcon className="w-4 h-4" /></IconButton>
                <IconButton label="Eliminar" tone="danger" size="sm" onClick={() => onDelete(type, item.id)}><TrashIcon className="w-4 h-4" /></IconButton>
            </div>
        </div>
    );
};


export default CurriculumManager;