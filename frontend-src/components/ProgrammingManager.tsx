
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { ProgrammingUnit, Course, SessionDetail, SessionActivity, FinalProduct, FinalExam, EvaluationCriterion, BasicKnowledge, SpecificCompetence, EvaluationTool, ClassData, AcademicConfiguration } from '../types';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon, ArrowUpTrayIcon, SparklesIcon, ChevronDownIcon, ChevronRightIcon } from './Icons';
import Modal from './Modal';
import Input from './Input';
import GenerarSituacionAprendizajeModal from './GenerarSituacionAprendizajeModal';
import { TYPOGRAPHY } from '../theme/typography';
import { checkboxClassName } from '../theme/components/Input';
import { formatFechaEs } from '../utils';
import { useProgrammingUnits, useCreateProgrammingUnit, useUpdateProgrammingUnit, useDeleteProgrammingUnit } from '../hooks/useProgrammingUnits';
import { useEvaluationCriteria } from '../hooks/useEvaluationCriteria';
import { useBasicKnowledge } from '../hooks/useBasicKnowledge';
import { useSpecificCompetences } from '../hooks/useSpecificCompetences';
import { useEvaluationTools, useCreateEvaluationTool, useUpdateEvaluationTool } from '../hooks/useEvaluationTools';
import { EvaluationToolEditorModal } from './EvaluationToolManager';
import GenerarInstrumentoIAModal from './GenerarInstrumentoIAModal';

const EVALUATION_TOOL_TYPE_LABEL: Record<EvaluationTool['type'], string> = {
    checklist: 'Lista de cotejo',
    rating_scale: 'Escala',
    rubric: 'Rúbrica',
    criterial_exam: 'Examen criterial',
};

// Selector-buscador de un EvaluationTool real (Instrumentos de Evaluación) --
// se reutiliza en producto final, examen y cada actividad, en vez de
// modelar una rúbrica aparte y más pobre dentro de la propia SA. Con
// muchos instrumentos, un <select> plano se vuelve difícil de recorrer --
// esto deja escribir para filtrar por nombre.
const InstrumentoSelect: React.FC<{ evaluationTools: EvaluationTool[]; value?: string; onChange: (id: string | undefined) => void }> = ({ evaluationTools, value, onChange }) => {
    const selected = evaluationTools.find(t => t.id === value);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const filtered = evaluationTools.filter(t => t.name.toLowerCase().includes(query.toLowerCase()));

    const handlePick = (id: string | undefined) => {
        onChange(id);
        setOpen(false);
        setQuery('');
    };

    return (
        <div className="relative" ref={containerRef}>
            <Input
                type="text"
                value={open ? query : (selected?.name || '')}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => { setQuery(''); setOpen(true); }}
                placeholder="Buscar instrumento de evaluación..."
                autoComplete="off"
            />
            {open && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    <button type="button" onClick={() => handlePick(undefined)} className="w-full text-left px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50">
                        Sin instrumento de evaluación
                    </button>
                    {filtered.length === 0 ? (
                        <p className="px-3 py-1.5 text-sm text-slate-400">Sin resultados</p>
                    ) : filtered.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => handlePick(t.id)}
                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${t.id === value ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'}`}
                        >
                            {t.name} <span className="text-xs text-slate-400">({EVALUATION_TOOL_TYPE_LABEL[t.type]})</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// InstrumentoSelect + botón "Generar con IA local" -- genera un
// instrumento nuevo a partir de los criterios YA vinculados a este
// producto/examen/actividad concretos (no todos los de la SA, mismo
// criterio que ya usa la importación al cuaderno de notas), lo abre en el
// formulario de edición de siempre para revisar, y al guardar lo enlaza
// automáticamente aquí mismo -- sin tener que ir a Ajustes y volver.
const InstrumentoSelectConIA: React.FC<{
    evaluationTools: EvaluationTool[];
    value?: string;
    onChange: (id: string | undefined) => void;
    courseId: string;
    courses: Course[];
    criteria: EvaluationCriterion[];
    linkedCriteriaIds: string[];
    contexto?: string;
}> = ({ evaluationTools, value, onChange, courseId, courses, criteria, linkedCriteriaIds, contexto }) => {
    const [showGenerar, setShowGenerar] = useState(false);
    const [draft, setDraft] = useState<EvaluationTool | null>(null);
    const [editando, setEditando] = useState(false);
    const createToolMutation = useCreateEvaluationTool();
    const updateToolMutation = useUpdateEvaluationTool();
    // Solo el curso de esta SA -- si no, el selector "Filtrar por Curso" del
    // formulario de revisión ofrece todas las etapas/niveles/materias de la
    // app, cuando aquí solo tiene sentido vincular criterios de este curso.
    const cursoDeEstaSA = useMemo(() => courses.filter(c => c.id === courseId), [courses, courseId]);
    const instrumentoActual = evaluationTools.find(t => t.id === value);

    const handleGuardarDraft = async (tool: EvaluationTool) => {
        const { id: _unused, ...data } = tool;
        const creado = await createToolMutation.mutateAsync(data);
        onChange(creado.id);
        setDraft(null);
    };

    const handleGuardarEdicion = async (tool: EvaluationTool) => {
        const { id, ...data } = tool;
        await updateToolMutation.mutateAsync({ id, data });
        setEditando(false);
    };

    return (
        <div className="flex items-center gap-1.5">
            <div className="flex-1"><InstrumentoSelect evaluationTools={evaluationTools} value={value} onChange={onChange} /></div>
            {instrumentoActual && (
                <button
                    type="button"
                    onClick={() => setEditando(true)}
                    title="Editar este instrumento sin salir de la SA"
                    className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-md flex-shrink-0"
                >
                    <PencilIcon className="w-4 h-4" />
                </button>
            )}
            <button
                type="button"
                onClick={() => setShowGenerar(true)}
                title="Generar instrumento con IA a partir de los criterios vinculados aquí"
                className="p-1.5 text-purple-600 hover:bg-purple-100 rounded-md flex-shrink-0"
            >
                <SparklesIcon className="w-4 h-4" />
            </button>
            <GenerarInstrumentoIAModal
                isOpen={showGenerar}
                onClose={() => setShowGenerar(false)}
                courseId={courseId}
                linkedCriteriaIds={linkedCriteriaIds}
                contexto={contexto}
                // La materia ya se sabe (es la de esta SA) -- se asigna
                // directamente al borrador generado, sin obligar a elegirla
                // otra vez en el formulario de revisión.
                onDraftReady={(d) => setDraft({ ...d, courseId })}
            />
            {draft && (
                <EvaluationToolEditorModal
                    isOpen={true}
                    onClose={() => setDraft(null)}
                    onSave={handleGuardarDraft}
                    toolToEdit={draft}
                    criteria={criteria}
                    courses={cursoDeEstaSA}
                />
            )}
            {editando && instrumentoActual && (
                <EvaluationToolEditorModal
                    isOpen={true}
                    onClose={() => setEditando(false)}
                    onSave={handleGuardarEdicion}
                    toolToEdit={instrumentoActual}
                    criteria={criteria}
                    courses={cursoDeEstaSA}
                />
            )}
        </div>
    );
};

// Envuelve una descripción de sesión "plana" (formato antiguo, o lo que
// sigue devolviendo el generador de IA en esta pasada) en una única
// actividad genérica -- mismo criterio que la migración 0013 aplicó a los
// datos ya existentes en producción, para no tener dos formas de leer una
// sesión en el frontend.
const wrapDescriptionAsActivity = (description: string): SessionDetail => ({
    titulo: '',
    actividades: [{ descripcion: description, linkedCriteriaIds: [] }],
});

interface ProgrammingManagerProps {
    // Fase 8: la materia activa se elige en la cabecera (App.tsx), ya no
    // dentro de este componente — ver CurriculumManager.tsx, mismo cambio.
    courseId: string;
    courses: Course[];
    classes: ClassData[];
    academicConfiguration: AcademicConfiguration;
    // Atajo desde Herramientas IA (AiToolsView): App.tsx navega aquí y pide
    // abrir GenerarSituacionAprendizajeModal directamente, sin que el profesor tenga que
    // pulsar el botón otra vez.
    autoOpenGenerarIA?: boolean;
    onAutoOpenGenerarIAHandled?: () => void;
}

const toYYYYMMDD = (date: Date): string => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const addDays = (date: Date, days: number): Date => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};


const ProgrammingManager: React.FC<ProgrammingManagerProps> = ({ courseId, courses, classes, academicConfiguration, autoOpenGenerarIA, onAutoOpenGenerarIAHandled }) => {
    const selectedCourseId = courseId;
    // "create" admite un `draft` opcional -- el borrador que entrega
    // GenerarSituacionAprendizajeModal para revisar en el mismo formulario que ya usa la
    // creación manual, en vez de tener un formulario de revisión aparte.
    const [unitEditorState, setUnitEditorState] = useState<{ mode: 'create', draft?: ProgrammingUnit } | { mode: 'edit', unit: ProgrammingUnit } | null>(null);
    const [showImportHelp, setShowImportHelp] = useState(false);
    const [showGenerarIA, setShowGenerarIA] = useState(false);
    // Vista de solo lectura al pinchar en una SA de la lista -- separada del
    // editor: mismo contenido pero sin campos editables ni secciones vacías.
    const [viewingUnit, setViewingUnit] = useState<ProgrammingUnit | null>(null);

    React.useEffect(() => {
        if (autoOpenGenerarIA) {
            setShowGenerarIA(true);
            onAutoOpenGenerarIAHandled?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpenGenerarIA]);

    const remoteUnits = useProgrammingUnits(selectedCourseId);
    const createUnitMutation = useCreateProgrammingUnit();
    const updateUnitMutation = useUpdateProgrammingUnit();
    const deleteUnitMutation = useDeleteProgrammingUnit();
    const remoteCriteria = useEvaluationCriteria(selectedCourseId);
    const remoteBasicKnowledge = useBasicKnowledge(selectedCourseId);
    const remoteSpecificCompetences = useSpecificCompetences(selectedCourseId);
    const remoteEvaluationTools = useEvaluationTools();

    const selectedCourse = useMemo(() => courses.find(c => c.id === selectedCourseId), [courses, selectedCourseId]);

    const filteredUnits = useMemo(() => (
        (remoteUnits.data ?? []) as unknown as ProgrammingUnit[]
    ), [remoteUnits.data]);
    const filteredCriteria = useMemo(() => (
        (remoteCriteria.data ?? []) as unknown as EvaluationCriterion[]
    ), [remoteCriteria.data]);
    const filteredBasicKnowledge = useMemo(() => (
        (remoteBasicKnowledge.data ?? []) as unknown as BasicKnowledge[]
    ), [remoteBasicKnowledge.data]);
    const filteredSpecificCompetences = useMemo(() => (
        (remoteSpecificCompetences.data ?? []) as unknown as SpecificCompetence[]
    ), [remoteSpecificCompetences.data]);
    const filteredEvaluationTools = useMemo(() => (
        (remoteEvaluationTools.data ?? []) as unknown as EvaluationTool[]
    ), [remoteEvaluationTools.data]);

    const unitDateRanges = useMemo(() => {
        const ranges = new Map<string, { start?: Date, end?: Date }>();
        if (!selectedCourseId || !classes || !academicConfiguration?.academicYearStart || !academicConfiguration.academicYearEnd) return ranges;

        const isHoliday = (date: Date): boolean => {
            if (!academicConfiguration?.holidays) return false;
            const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            return academicConfiguration.holidays.some(h => {
                const start = new Date(h.startDate + 'T00:00:00');
                const end = new Date(h.endDate + 'T00:00:00');
                return dateOnly >= start && dateOnly <= end;
            });
        };

        const unitsForCourse = filteredUnits;
        const classesForCourse = classes.filter(c => c.courseId === selectedCourseId);
        
        // We calculate valid school dates first
        const schoolDays: Date[] = [];
        let currentDateIterator = new Date(academicConfiguration.academicYearStart + 'T00:00:00');
        const endDate = new Date(academicConfiguration.academicYearEnd + 'T00:00:00');
        
        while (currentDateIterator <= endDate) {
            const dayOfWeek = currentDateIterator.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday(currentDateIterator)) {
                schoolDays.push(new Date(currentDateIterator));
            }
            currentDateIterator = addDays(currentDateIterator, 1);
        }

        // For simplicity in calculation, we assume the first class's schedule as the "master" timeline
        const classData = classesForCourse[0]; 
        if (!classData || !classData.schedule || classData.schedule.length === 0) return ranges;

        const skippedDaysSet = new Set(classData.skippedDays || []);
        const validSessionDates: Date[] = [];

        schoolDays.forEach(schoolDay => {
            const slotsForThisDay = (classData.schedule || []).filter(slot => slot.day === schoolDay.getDay());
            if (slotsForThisDay.length > 0 && !skippedDaysSet.has(toYYYYMMDD(schoolDay))) {
                // Add one entry per slot. We treat sessions as linear.
                for (let i = 0; i < slotsForThisDay.length; i++) {
                    validSessionDates.push(schoolDay);
                }
            }
        });

        // Now map units to dates using the Anchor logic
        let currentSessionIndex = 0;

        unitsForCourse.forEach((unit, unitIndex) => {
            let startSessionIndex = currentSessionIndex;

            // Check for Anchor (Fixed Start Date)
            if (unit.startDate) {
                const anchorDateStr = unit.startDate;
                // Find the index in validSessionDates that corresponds to or follows the anchor date
                const anchorIndex = validSessionDates.findIndex(d => toYYYYMMDD(d) >= anchorDateStr);
                
                if (anchorIndex !== -1) {
                    if (anchorIndex > currentSessionIndex) {
                        // GAP DETECTED: Extend the PREVIOUS unit to fill the gap.
                        if (unitIndex > 0) {
                            const prevUnitId = unitsForCourse[unitIndex - 1].id;
                            const prevRange = ranges.get(prevUnitId);
                            if (prevRange && prevRange.start) {
                                const extendedEndIndex = anchorIndex - 1;
                                const extendedEndDate = validSessionDates[extendedEndIndex];
                                ranges.set(prevUnitId, { start: prevRange.start, end: extendedEndDate });
                            }
                        }
                        startSessionIndex = anchorIndex;
                    } else {
                        // Overlap or sequential match, enforce anchor
                        startSessionIndex = anchorIndex;
                    }
                }
            }

            const sessionsCount = unit.sessions;
            // Ensure we don't go out of bounds
            if (startSessionIndex < validSessionDates.length) {
                const endSessionIndex = Math.min(startSessionIndex + sessionsCount - 1, validSessionDates.length - 1);
                
                const startDate = validSessionDates[startSessionIndex];
                const endDate = validSessionDates[endSessionIndex];
                
                ranges.set(unit.id, { start: startDate, end: endDate });
                
                // Prepare cursor for next unit
                currentSessionIndex = endSessionIndex + 1;
            }
        });

        return ranges;
    }, [selectedCourseId, classes, academicConfiguration, filteredUnits]);


    const handleSave = (unit: ProgrammingUnit) => {
        const data = {
            name: unit.name,
            sessions: unit.sessions,
            startDate: unit.startDate || undefined,
            context: unit.context || undefined,
            sessionDetails: unit.sessionDetails,
            linkedCriteriaIds: unit.linkedCriteriaIds,
            linkedBasicKnowledgeIds: unit.linkedBasicKnowledgeIds,
            linkedSpecificCompetenceIds: unit.linkedSpecificCompetenceIds,
            finalProduct: unit.finalProduct,
            finalExam: unit.finalExam,
        };
        if (unitEditorState?.mode === 'edit') {
            updateUnitMutation.mutate({ id: unit.id, courseId: selectedCourseId, data }, { onSuccess: () => setUnitEditorState(null) });
        } else {
            createUnitMutation.mutate({ courseId: selectedCourseId, data }, { onSuccess: () => setUnitEditorState(null) });
        }
    };

    const handleDelete = (unitId: string) => {
        if (!window.confirm("¿Seguro que quieres eliminar esta Situación de Aprendizaje?")) return;
        deleteUnitMutation.mutate({ id: unitId, courseId: selectedCourseId });
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const text = reader.result;
            if (typeof text === 'string') {
                parseAndImportCSV(text);
            }
        };
        reader.readAsText(file);
        if (event.target) event.target.value = '';
    };

    const parseAndImportCSV = async (csvText: string) => {
        try {
            const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
            if (lines.length < 2) {
                alert("El archivo CSV parece estar vacío o no tiene datos válidos.");
                return;
            }

            // Helpers to resolve codes to IDs
            const criteriaMap = new Map<string, string>(filteredCriteria.map(c => [c.code.trim(), c.id] as [string, string]));
            const knowledgeMap = new Map<string, string>(filteredBasicKnowledge.map(k => [k.code.trim(), k.id] as [string, string]));

            const newUnits: ProgrammingUnit[] = [];

            // Skip header (index 0)
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                // Basic CSV parsing handling quotes
                const parts: string[] = [];
                let currentVal = '';
                let insideQuotes = false;
                for (const char of line) {
                    if (char === '"' && insideQuotes) insideQuotes = false;
                    else if (char === '"' && !insideQuotes) insideQuotes = true;
                    else if (char === ',' && !insideQuotes) {
                        parts.push(currentVal.trim());
                        currentVal = '';
                    } else {
                        currentVal += char;
                    }
                }
                parts.push(currentVal.trim());

                // Expected Format: Name, Sessions, StartDate, Criteria, Knowledge, SessionDetails
                const [name, sessionsStr, startDate, criteriaCodes, knowledgeCodes, sessionDetailsStr] = parts;

                if (!name) continue;

                const sessions = parseInt(sessionsStr, 10) || 1;
                
                // Resolve Links
                const linkedCriteriaIds: string[] = [];
                if (criteriaCodes) {
                    criteriaCodes.replace(/^"|"$/g, '').split(',').forEach(code => {
                        const id = criteriaMap.get(code.trim());
                        if (id) linkedCriteriaIds.push(id);
                    });
                }

                const linkedBasicKnowledgeIds: string[] = [];
                if (knowledgeCodes) {
                    knowledgeCodes.replace(/^"|"$/g, '').split(',').forEach(code => {
                        const id = knowledgeMap.get(code.trim());
                        if (id) linkedBasicKnowledgeIds.push(id);
                    });
                }

                // Parse Session Details (split by pipe '|') -- el CSV solo trae
                // una descripción por sesión, se envuelve como una única
                // actividad genérica (mismo criterio que wrapDescriptionAsActivity).
                let sessionDetails: SessionDetail[] = [];
                if (sessionDetailsStr) {
                    const descriptions = sessionDetailsStr.replace(/^"|"$/g, '').split('|').map(d => d.trim());
                    sessionDetails = descriptions.map(desc => wrapDescriptionAsActivity(desc));
                }

                // Adjust sessions count if details provided are more
                const finalSessions = Math.max(sessions, sessionDetails.length);

                // Pad session details if less than sessions count
                while (sessionDetails.length < finalSessions) {
                    sessionDetails.push(wrapDescriptionAsActivity(''));
                }

                const newUnit: ProgrammingUnit = {
                    id: `pu-imp-${Date.now()}-${i}`,
                    courseId: selectedCourseId,
                    name: name.replace(/^"|"$/g, ''),
                    sessions: finalSessions,
                    startDate: startDate && startDate.match(/^\d{4}-\d{2}-\d{2}$/) ? startDate : undefined,
                    linkedCriteriaIds,
                    linkedBasicKnowledgeIds,
                    linkedSpecificCompetenceIds: [],
                    sessionDetails
                };

                newUnits.push(newUnit);
            }

            if (newUnits.length > 0) {
                for (const u of newUnits) {
                    await createUnitMutation.mutateAsync({
                        courseId: selectedCourseId,
                        data: {
                            name: u.name,
                            sessions: u.sessions,
                            startDate: u.startDate,
                            sessionDetails: u.sessionDetails,
                            linkedCriteriaIds: u.linkedCriteriaIds,
                            linkedBasicKnowledgeIds: u.linkedBasicKnowledgeIds,
                            linkedSpecificCompetenceIds: u.linkedSpecificCompetenceIds,
                        },
                    });
                }
                alert(`Se han importado ${newUnits.length} Situaciones de Aprendizaje correctamente al curso seleccionado.`);
                setShowImportHelp(false);
            } else {
                alert("No se pudieron extraer Situaciones de Aprendizaje del archivo. Verifica el formato.");
            }

        } catch (error) {
            console.error("Error parsing CSV:", error);
            alert("Error al procesar el archivo CSV.");
        }
    };
    
    return (
        <>
            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Situaciones de Aprendizaje</h3>
                    <p className="text-sm text-slate-600 mb-4">
                        Define la secuencia de Situaciones de Aprendizaje de esta materia. Esta planificación se usará para generar el calendario de todas sus clases.
                    </p>
                </div>

                {selectedCourse ? (
                    <div className="bg-white rounded-xl shadow-sm border">
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50/50 rounded-t-xl flex-wrap gap-2">
                            <h2 className={TYPOGRAPHY.sectionTitle}>Situaciones de Aprendizaje para {selectedCourse.level} - {selectedCourse.subject}</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowImportHelp(!showImportHelp)}
                                    className="inline-flex items-center justify-center py-2 px-3 border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50"
                                >
                                    <ArrowUpTrayIcon className="w-4 h-4 mr-1"/>
                                    Importar CSV
                                </button>
                                <button onClick={() => setUnitEditorState({ mode: 'create'})} disabled={!!unitEditorState} className="inline-flex items-center justify-center py-2 px-3 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed">
                                    <PlusIcon className="w-4 h-4 mr-1"/>
                                    Nueva SA
                                </button>
                                <button onClick={() => setShowGenerarIA(true)} disabled={!!unitEditorState || showGenerarIA} className="inline-flex items-center justify-center py-2 px-3 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed">
                                    <SparklesIcon className="w-4 h-4 mr-1"/>
                                    Generar con IA
                                </button>
                            </div>
                        </div>

                        {showImportHelp && (
                            <div className="p-4 bg-blue-50 border-b border-blue-100">
                                <h4 className="font-bold text-sm text-blue-800 mb-2">Instrucciones para Importar Situaciones de Aprendizaje</h4>
                                <p className="text-xs text-blue-700 mb-2">
                                    Sube un archivo CSV con las siguientes columnas (respeta el orden). Los Criterios y Saberes se vincularán automáticamente si coinciden con los códigos del curso (ej. "1.1", "A.1").
                                </p>
                                <div className="bg-white p-2 rounded border border-blue-200 overflow-x-auto font-mono text-xs mb-3 text-slate-600">
                                    Nombre,Sesiones,FechaInicio,Criterios,Saberes,DetalleSesiones<br/>
                                    "SA 1: La Célula",6,2024-09-15,"1.1, 1.2","A.1, A.2","Introducción|Teoría Celular|Microscopio|Práctica|Repaso|Examen"<br/>
                                    "SA 2: Nutrición",8,,"2.1, 2.3","B.1","Intro Nutrición|Dieta equilibrada|..."
                                </div>
                                <div className="mt-3">
                                    <label className="cursor-pointer inline-flex items-center justify-center py-2 px-4 border border-blue-300 shadow-sm text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50">
                                        <ArrowUpTrayIcon className="w-4 h-4 mr-2" />
                                        Seleccionar Archivo CSV
                                        <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className="p-4 space-y-3">
                            {filteredUnits.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    <p>No hay Situaciones de Aprendizaje para este curso.</p>
                                    <p>¡Añade una o impórtalas para empezar a planificar!</p>
                                </div>
                            ) : (
                                filteredUnits.map(unit => {
                                    const linkedCriteriaData = unit.linkedCriteriaIds.map(id => filteredCriteria.find(c => c.id === id)).filter((c): c is EvaluationCriterion => c !== undefined);
                                    const linkedBasicKnowledgeData = unit.linkedBasicKnowledgeIds.map(id => filteredBasicKnowledge.find(sb => sb.id === id)).filter((sb): sb is BasicKnowledge => sb !== undefined);
                                    
                                    return (
                                        <div
                                            key={unit.id}
                                            className="p-3 border rounded-lg group hover:bg-slate-50/50 transition-colors cursor-pointer"
                                            onClick={() => setViewingUnit(unit)}
                                        >
                                            <UnitViewer
                                                unit={unit}
                                                dateRange={unitDateRanges.get(unit.id)}
                                                linkedCriteria={linkedCriteriaData}
                                                linkedBasicKnowledge={linkedBasicKnowledgeData}
                                                onEdit={() => setUnitEditorState({ mode: 'edit', unit })}
                                                onDelete={() => handleDelete(unit.id)}
                                            />
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="p-8 text-center bg-white rounded-xl shadow-sm border"><p>Selecciona un curso para ver su planificación.</p></div>
                )}
            </div>
            {unitEditorState && (
                <Modal
                    isOpen={!!unitEditorState}
                    onClose={() => setUnitEditorState(null)}
                    title={unitEditorState.mode === 'create' ? 'Nueva Situación de Aprendizaje' : 'Editar Situación de Aprendizaje'}
                    size="5xl"
                >
                     <UnitEditor
                        key={unitEditorState.mode === 'edit' ? unitEditorState.unit.id : 'create-new'}
                        unit={unitEditorState.mode === 'edit' ? unitEditorState.unit : unitEditorState.draft ?? {
                            id: 'new', courseId: selectedCourseId, name: '', sessions: 1, context: '',
                            sessionDetails: [wrapDescriptionAsActivity('')],
                            linkedCriteriaIds: [], linkedBasicKnowledgeIds: [], linkedSpecificCompetenceIds: [],
                            finalProduct: { incluido: false }, finalExam: { incluido: false },
                            startDate: ''
                        }}
                        onSave={handleSave}
                        onCancel={() => setUnitEditorState(null)}
                        criteria={filteredCriteria}
                        basicKnowledge={filteredBasicKnowledge}
                        specificCompetences={filteredSpecificCompetences}
                        evaluationTools={filteredEvaluationTools}
                        courses={courses}
                    />
                </Modal>
            )}
            {viewingUnit && (
                <Modal isOpen={!!viewingUnit} onClose={() => setViewingUnit(null)} title={viewingUnit.name} size="5xl">
                    <UnitDetailView
                        unit={viewingUnit}
                        criteria={filteredCriteria}
                        basicKnowledge={filteredBasicKnowledge}
                        specificCompetences={filteredSpecificCompetences}
                        evaluationTools={filteredEvaluationTools}
                        onEdit={() => { setUnitEditorState({ mode: 'edit', unit: viewingUnit }); setViewingUnit(null); }}
                        onClose={() => setViewingUnit(null)}
                    />
                </Modal>
            )}
            <GenerarSituacionAprendizajeModal
                isOpen={showGenerarIA}
                courseId={selectedCourseId}
                courses={courses}
                onClose={() => setShowGenerarIA(false)}
                onDraftReady={draft => setUnitEditorState({ mode: 'create', draft })}
            />
        </>
    );
};

interface UnitViewerProps {
    unit: ProgrammingUnit;
    dateRange?: { start?: Date, end?: Date };
    linkedCriteria: EvaluationCriterion[];
    linkedBasicKnowledge: BasicKnowledge[];
    onEdit: () => void;
    onDelete: () => void;
}

const UnitViewer: React.FC<UnitViewerProps> = ({ unit, dateRange, linkedCriteria, linkedBasicKnowledge, onEdit, onDelete }) => {
    const formatDateRange = () => {
        if (!dateRange || !dateRange.start || !dateRange.end) return "Fechas no calculadas";
        const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
        const startStr = dateRange.start.toLocaleDateString('es-ES', options);
        const endStr = dateRange.end.toLocaleDateString('es-ES', options);
        return `${startStr} - ${endStr}`;
    };

    return (
        <div className="flex items-start justify-between">
            <div>
                <h3 className="font-bold text-slate-800">{unit.name} <span className="font-normal text-sm text-slate-500">({unit.sessions} sesiones)</span></h3>
                <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full inline-block">{formatDateRange()}</p>
                    {unit.startDate && <p className="text-xs text-slate-500 italic">Inicio fijado: {formatFechaEs(unit.startDate)}</p>}
                </div>
                <div className="mt-2 space-y-1">
                    <p className="text-sm font-semibold text-slate-600">Criterios:</p>
                    <div className="flex flex-wrap gap-1">
                        {linkedCriteria.map((crit) => (
                           <span key={crit.id} className="text-xs font-medium bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full" title={crit.description}>{crit.code}</span>
                        ))}
                    </div>
                </div>
                <div className="mt-2 space-y-1">
                    <p className="text-sm font-semibold text-slate-600">Saberes Básicos:</p>
                    <div className="flex flex-wrap gap-1">
                         {linkedBasicKnowledge.map((sb) => (
                            <span key={sb.id} className="text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full" title={sb.description}>{sb.code}</span>
                        ))}
                    </div>
                </div>
                {(unit.finalProduct?.incluido || unit.finalExam?.incluido) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {unit.finalProduct?.incluido && (
                            <span className="text-xs font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                📦 Producto final{unit.finalProduct.tipo ? `: ${unit.finalProduct.tipo}` : ''}
                            </span>
                        )}
                        {unit.finalExam?.incluido && (
                            <span className="text-xs font-medium bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                                📝 Examen final{unit.finalExam.formato ? `: ${unit.finalExam.formato}` : ''}
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={e => { e.stopPropagation(); onEdit(); }} className="p-2 hover:bg-slate-200 rounded-full"><PencilIcon className="w-4 h-4 text-slate-600" /></button>
                <button onClick={e => { e.stopPropagation(); onDelete(); }} className="p-2 hover:bg-red-100 rounded-full"><TrashIcon className="w-4 h-4 text-red-500" /></button>
            </div>
        </div>
    )
};

// Chips de solo lectura -- null si no hay nada que mostrar, para que la
// sección entera se pueda ocultar sin dejar un título huérfano.
const ReadOnlyChips: React.FC<{ codes: string[]; colorClass: string }> = ({ codes, colorClass }) => (
    codes.length === 0 ? null : (
        <div className="flex flex-wrap gap-1">
            {codes.map(c => <span key={c} className={`text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>{c}</span>)}
        </div>
    )
);

// Vista de solo lectura de una SA ya guardada -- mismo contenido que el
// editor, pero sin ningún campo editable, y ocultando toda sección/campo
// vacío en vez de mostrarlo en blanco (petición explícita del profesor).
const UnitDetailView: React.FC<{
    unit: ProgrammingUnit;
    criteria: EvaluationCriterion[];
    basicKnowledge: BasicKnowledge[];
    specificCompetences: SpecificCompetence[];
    evaluationTools: EvaluationTool[];
    onEdit: () => void;
    onClose: () => void;
}> = ({ unit, criteria, basicKnowledge, specificCompetences, evaluationTools, onEdit, onClose }) => {

    const codesFor = (ids: string[] | undefined, items: { id: string; code: string }[]) =>
        (ids || []).map(id => items.find(i => i.id === id)?.code).filter((c): c is string => !!c);

    const toolName = (id?: string) => id ? evaluationTools.find(t => t.id === id)?.name : undefined;

    const competenciaCodes = codesFor(unit.linkedSpecificCompetenceIds, specificCompetences);
    const criteriosCodes = codesFor(unit.linkedCriteriaIds, criteria);
    const saberesCodes = codesFor(unit.linkedBasicKnowledgeIds, basicKnowledge);

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3 text-sm text-slate-500">
                <span>{unit.sessions} sesiones</span>
                {unit.startDate && <span>· Inicio fijado: {formatFechaEs(unit.startDate)}</span>}
            </div>

            {unit.context && (
                <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-1">Contexto / situación de partida</h4>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{unit.context}</p>
                </div>
            )}

            {(competenciaCodes.length > 0 || criteriosCodes.length > 0 || saberesCodes.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {competenciaCodes.length > 0 && (
                        <div>
                            <p className="text-sm font-semibold text-slate-600 mb-1">Competencias Específicas</p>
                            <ReadOnlyChips codes={competenciaCodes} colorClass="bg-indigo-100 text-indigo-800" />
                        </div>
                    )}
                    {criteriosCodes.length > 0 && (
                        <div>
                            <p className="text-sm font-semibold text-slate-600 mb-1">Criterios de Evaluación</p>
                            <ReadOnlyChips codes={criteriosCodes} colorClass="bg-slate-200 text-slate-700" />
                        </div>
                    )}
                    {saberesCodes.length > 0 && (
                        <div>
                            <p className="text-sm font-semibold text-slate-600 mb-1">Saberes Básicos</p>
                            <ReadOnlyChips codes={saberesCodes} colorClass="bg-amber-100 text-amber-800" />
                        </div>
                    )}
                </div>
            )}

            <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Sesiones</h4>
                <div className="space-y-3">
                    {(unit.sessionDetails || []).map((session, sIndex) => (
                        <div key={sIndex} className="p-3 border rounded-lg bg-white">
                            <p className="font-semibold text-slate-700">
                                Sesión {sIndex + 1}{session.titulo ? `: ${session.titulo}` : ''}
                            </p>
                            <div className="mt-2 space-y-3 pl-3 border-l-2 border-slate-100">
                                {session.actividades.map((act, aIndex) => {
                                    const actCriterios = codesFor(act.linkedCriteriaIds, criteria);
                                    const actTool = toolName(act.evaluationToolId);
                                    const detalles = [act.tipo, act.agrupamiento, act.duracionMin ? `${act.duracionMin} min` : null].filter(Boolean);
                                    return (
                                        <div key={aIndex} className="text-sm">
                                            <p className="font-medium text-slate-700">
                                                {act.titulo || `Actividad ${aIndex + 1}`}
                                                {detalles.length > 0 && <span className="text-xs font-normal text-slate-400"> · {detalles.join(' · ')}</span>}
                                            </p>
                                            {act.descripcion && <p className="text-slate-600 mt-0.5">{act.descripcion}</p>}
                                            {(act.recursos || []).length > 0 && (
                                                <p className="text-xs text-slate-400 mt-0.5">Recursos: {(act.recursos || []).join(', ')}</p>
                                            )}
                                            {act.adaptacion && (
                                                <p className="text-xs text-emerald-700 mt-0.5">🧩 Adaptación: {act.adaptacion}</p>
                                            )}
                                            {(actCriterios.length > 0 || actTool) && (
                                                <div className="flex items-center flex-wrap gap-1.5 mt-1">
                                                    <ReadOnlyChips codes={actCriterios} colorClass="bg-slate-200 text-slate-700" />
                                                    {actTool && <span className="text-xs font-medium bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">📋 {actTool}</span>}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {unit.finalProduct?.incluido && (
                <div className="p-3 border rounded-lg bg-emerald-50/50">
                    <h4 className="font-semibold text-slate-700">
                        📦 Producto final{unit.finalProduct.tipo ? `: ${unit.finalProduct.tipo}` : ''}
                    </h4>
                    {unit.finalProduct.descripcion && <p className="text-sm text-slate-600 mt-1">{unit.finalProduct.descripcion}</p>}
                    {(() => {
                        const codes = codesFor(unit.finalProduct.linkedCriteriaIds, criteria);
                        const tool = toolName(unit.finalProduct.evaluationToolId);
                        return (codes.length > 0 || tool) && (
                            <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                                <ReadOnlyChips codes={codes} colorClass="bg-slate-200 text-slate-700" />
                                {tool && <span className="text-xs font-medium bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">📋 {tool}</span>}
                            </div>
                        );
                    })()}
                </div>
            )}

            {unit.finalExam?.incluido && (
                <div className="p-3 border rounded-lg bg-purple-50/50">
                    <h4 className="font-semibold text-slate-700">
                        📝 Examen final{unit.finalExam.formato ? `: ${unit.finalExam.formato}` : ''}
                    </h4>
                    {toolName(unit.finalExam.evaluationToolId) && (
                        <span className="inline-block text-xs font-medium bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full mt-1.5">📋 {toolName(unit.finalExam.evaluationToolId)}</span>
                    )}
                    {(unit.finalExam.bloques || []).length > 0 && (
                        <div className="mt-2 space-y-2">
                            {(unit.finalExam.bloques || []).map((block, i) => {
                                const codes = codesFor(block.linkedCriteriaIds, criteria);
                                return (
                                    <div key={i} className="text-sm">
                                        <p className="text-slate-600">{block.descripcion}</p>
                                        <ReadOnlyChips codes={codes} colorClass="bg-slate-200 text-slate-700" />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
                <button onClick={onClose} className="text-sm font-semibold text-slate-600 hover:text-slate-800 px-3 py-1">Cerrar</button>
                <button onClick={onEdit} className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-md inline-flex items-center gap-1.5"><PencilIcon className="w-4 h-4"/> Editar</button>
            </div>
        </div>
    );
};

const PALETTE_COLORS = ['#89b0f3', '#7dd7b2', '#fde28a', '#f472b6', '#b6a3f9', '#ef4444'];

// Selector compacto de códigos de criterio (solo el código, sin descripción)
// -- se repite por actividad/producto/bloque de examen, así que el
// MultiSelect de checkboxes con descripción completa sería demasiado grande
// repetido tantas veces. Chips que se activan/desactivan al clic.
const CriteriaChips: React.FC<{ criteria: EvaluationCriterion[]; selectedIds: string[]; onChange: (ids: string[]) => void }> = ({ criteria, selectedIds, onChange }) => {
    const toggle = (id: string) => {
        onChange(selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id]);
    };
    if (criteria.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1">
            {criteria.map(c => (
                <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    title={c.description}
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border transition-colors ${
                        selectedIds.includes(c.id)
                            ? 'bg-slate-700 text-white border-slate-700'
                            : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-100'
                    }`}
                >
                    {c.code}
                </button>
            ))}
        </div>
    );
};

const emptyActivity = (): SessionActivity => ({ descripcion: '', linkedCriteriaIds: [] });

const UnitEditor: React.FC<{
    unit: ProgrammingUnit;
    onSave: (unit: ProgrammingUnit) => void;
    onCancel: () => void;
    criteria: EvaluationCriterion[];
    basicKnowledge: BasicKnowledge[];
    specificCompetences: SpecificCompetence[];
    evaluationTools: EvaluationTool[];
    courses: Course[];
}> = ({ unit, onSave, onCancel, criteria, basicKnowledge, specificCompetences, evaluationTools, courses }) => {
    const [editedUnit, setEditedUnit] = useState(unit);
    const [activeTab, setActiveTab] = useState<'general' | 'curriculo' | 'sesiones' | 'evaluacion' | 'cobertura'>('general');
    // Actividades plegadas por defecto -- solo título/tipo/agrupamiento/
    // duración visibles hasta que se despliegan (petición explícita: mucha
    // información en poco espacio se ve mal, y los detalles necesitan más
    // sitio del que cabe siempre visible).
    const [actividadesAbiertas, setActividadesAbiertas] = useState<Set<string>>(new Set());
    const toggleActividadAbierta = (sIndex: number, aIndex: number) => {
        const clave = `${sIndex}-${aIndex}`;
        setActividadesAbiertas(prev => {
            const next = new Set(prev);
            if (next.has(clave)) next.delete(clave); else next.add(clave);
            return next;
        });
    };

    const handleFieldChange = <K extends keyof ProgrammingUnit>(field: K, value: ProgrammingUnit[K]) => {
        setEditedUnit(prev => ({ ...prev, [field]: value }));
    };

    const handleSessionsChange = (newSessionsCount: number) => {
        const targetLength = Math.max(1, isNaN(newSessionsCount) ? 1 : newSessionsCount);

        setEditedUnit(prev => {
            const currentDetails = prev.sessionDetails || [];
            const currentLength = currentDetails.length;

            if (targetLength === currentLength) {
                return { ...prev, sessions: targetLength };
            }

            let newDetails: SessionDetail[];
            if (targetLength > currentLength) {
                newDetails = [
                    ...currentDetails,
                    ...Array(targetLength - currentLength).fill(0).map(() => wrapDescriptionAsActivity(''))
                ];
            } else {
                newDetails = currentDetails.slice(0, targetLength);
            }
            return { ...prev, sessions: targetLength, sessionDetails: newDetails };
        });
    };

    const handleSessionFieldChange = (index: number, field: 'titulo' | 'color', value: string) => {
        setEditedUnit(prev => {
            const newDetails = [...(prev.sessionDetails || [])];
            newDetails[index] = { ...newDetails[index], [field]: value || undefined };
            return { ...prev, sessionDetails: newDetails };
        });
    };

    const handleSessionReorder = (index: number, direction: 'up' | 'down') => {
        setEditedUnit(prev => {
            const details = [...(prev.sessionDetails || [])];
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= details.length) return prev;

            const [movedItem] = details.splice(index, 1);
            details.splice(newIndex, 0, movedItem);

            return { ...prev, sessionDetails: details };
        });
    };

    const handleAddActivity = (sessionIndex: number) => {
        setEditedUnit(prev => {
            const newDetails = [...(prev.sessionDetails || [])];
            const session = newDetails[sessionIndex];
            newDetails[sessionIndex] = { ...session, actividades: [...session.actividades, emptyActivity()] };
            return { ...prev, sessionDetails: newDetails };
        });
    };

    const handleRemoveActivity = (sessionIndex: number, activityIndex: number) => {
        setEditedUnit(prev => {
            const newDetails = [...(prev.sessionDetails || [])];
            const session = newDetails[sessionIndex];
            newDetails[sessionIndex] = { ...session, actividades: session.actividades.filter((_, i) => i !== activityIndex) };
            return { ...prev, sessionDetails: newDetails };
        });
    };

    const handleActivityChange = (sessionIndex: number, activityIndex: number, patch: Partial<SessionActivity>) => {
        setEditedUnit(prev => {
            const newDetails = [...(prev.sessionDetails || [])];
            const session = newDetails[sessionIndex];
            const newActivities = [...session.actividades];
            newActivities[activityIndex] = { ...newActivities[activityIndex], ...patch };
            newDetails[sessionIndex] = { ...session, actividades: newActivities };
            return { ...prev, sessionDetails: newDetails };
        });
    };

    const handleMultiSelectChange = (field: 'linkedCriteriaIds' | 'linkedBasicKnowledgeIds' | 'linkedSpecificCompetenceIds', newIdSet: Set<string>) => {
        handleFieldChange(field, Array.from(newIdSet));
    };

    const finalProduct: FinalProduct = editedUnit.finalProduct ?? { incluido: false };
    const finalExam: FinalExam = editedUnit.finalExam ?? { incluido: false };

    const handleProductChange = (patch: Partial<FinalProduct>) => {
        handleFieldChange('finalProduct', { ...finalProduct, ...patch });
    };

    const handleExamChange = (patch: Partial<FinalExam>) => {
        handleFieldChange('finalExam', { ...finalExam, ...patch });
    };

    const handleAddExamBlock = () => {
        handleExamChange({ bloques: [...(finalExam.bloques || []), { descripcion: '', linkedCriteriaIds: [] }] });
    };

    const handleExamBlockChange = (index: number, patch: Partial<{ descripcion: string; linkedCriteriaIds: string[] }>) => {
        const rows = [...(finalExam.bloques || [])];
        rows[index] = { ...rows[index], ...patch };
        handleExamChange({ bloques: rows });
    };

    const handleRemoveExamBlock = (index: number) => {
        handleExamChange({ bloques: (finalExam.bloques || []).filter((_, i) => i !== index) });
    };

    const handleSaveClick = () => {
        if (editedUnit.name.trim()) {
            onSave(editedUnit);
        }
    };

    const TABS: { key: typeof activeTab; label: string }[] = [
        { key: 'general', label: 'General' },
        { key: 'curriculo', label: 'Currículo' },
        { key: 'sesiones', label: 'Sesiones y actividades' },
        { key: 'evaluacion', label: 'Evaluación' },
        { key: 'cobertura', label: 'Cobertura' },
    ];

    // Fase 6: matriz sesión × criterio de esta SA -- solo lectura, sobre los
    // datos ya guardados (no cambia el prompt ni el esquema). Solo cruza los
    // criterios que la propia unidad tiene vinculados (linkedCriteriaIds),
    // no el currículo entero del curso -- lo demás sería ruido para esta
    // vista. El aviso ("declarado pero no evidenciado") es el único pedido
    // explícitamente: un criterio puede quedar en la lista general de la SA
    // sin que ninguna actividad concreta lo marque de verdad.
    const criteriosVinculados = (editedUnit.linkedCriteriaIds || [])
        .map(id => criteria.find(c => c.id === id))
        .filter((c): c is EvaluationCriterion => !!c)
        .sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));

    const sesionesConActividades = editedUnit.sessionDetails || [];

    const criterioEvidenciadoEnSesion = (criterioId: string, sesion: SessionDetail) =>
        sesion.actividades.some(act => (act.linkedCriteriaIds || []).includes(criterioId));

    const criteriosSinEvidencia = criteriosVinculados.filter(c =>
        !sesionesConActividades.some(s => criterioEvidenciadoEnSesion(c.id, s))
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <div className="flex-grow">
                    <label className="text-xs font-medium text-slate-600">Nombre de la SA</label>
                    <input type="text" value={editedUnit.name} onChange={e => handleFieldChange('name', e.target.value)} placeholder="Título de la Situación de Aprendizaje" className="w-full text-lg font-bold p-1 border-b-2 border-slate-200 focus:border-blue-500 outline-none bg-transparent"/>
                </div>
                 <div className="w-24 flex-shrink-0">
                    <label className="text-xs font-medium text-slate-600">Nº de Sesiones</label>
                    <Input type="number" min="1" value={editedUnit.sessions} onChange={e => handleSessionsChange(parseInt(e.target.value, 10))} className="text-center"/>
                </div>
                <div className="flex-shrink-0">
                    <label className="text-xs font-medium text-slate-600">Fecha de Inicio</label>
                    <Input
                        type="date"
                        value={editedUnit.startDate || ''}
                        onChange={e => handleFieldChange('startDate', e.target.value)}
                        title="Fijar fecha de inicio. Si se deja en blanco, se calculará automáticamente."
                    />
                </div>
            </div>

            <div className="flex gap-1 border-b">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                            activeTab === tab.key
                                ? 'border-blue-600 text-blue-700'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="min-h-[22rem]">
            {activeTab === 'general' && (
                <div>
                    <label className="text-xs font-medium text-slate-600">Contexto / situación de partida</label>
                    <textarea
                        value={editedUnit.context || ''}
                        onChange={e => handleFieldChange('context', e.target.value)}
                        placeholder="El escenario o problema que se plantea al alumnado para arrancar la SA..."
                        className="w-full text-sm p-2 border rounded-md focus:border-blue-500 outline-none"
                        rows={6}
                    />
                </div>
            )}

            {activeTab === 'curriculo' && (
                <div className="space-y-4">
                    <MultiSelect title="Competencias Específicas" allItems={specificCompetences} selectedIds={new Set(editedUnit.linkedSpecificCompetenceIds || [])} setSelectedIds={(idSet) => handleMultiSelectChange('linkedSpecificCompetenceIds', idSet)} />
                    <MultiSelect title="Criterios de Evaluación" allItems={criteria} selectedIds={new Set(editedUnit.linkedCriteriaIds || [])} setSelectedIds={(idSet) => handleMultiSelectChange('linkedCriteriaIds', idSet)} />
                    <MultiSelect
                        title="Saberes Básicos"
                        allItems={basicKnowledge}
                        selectedIds={new Set(editedUnit.linkedBasicKnowledgeIds || [])}
                        setSelectedIds={(idSet) => handleMultiSelectChange('linkedBasicKnowledgeIds', idSet)}
                        groupBy={item => {
                            const sb = item as BasicKnowledge;
                            if (!sb.blockName) return null;
                            const letra = sb.code.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
                            return letra ? `${letra}. ${sb.blockName}` : sb.blockName;
                        }}
                    />
                </div>
            )}

            {activeTab === 'sesiones' && (
                <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-2">
                    {(editedUnit.sessionDetails || []).map((detail, sIndex) => (
                        <div key={sIndex} className="p-2 border rounded-lg bg-white space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="flex flex-col">
                                    <button type="button" onClick={() => handleSessionReorder(sIndex, 'up')} disabled={sIndex === 0} className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUpIcon className="w-4 h-4"/></button>
                                    <button type="button" onClick={() => handleSessionReorder(sIndex, 'down')} disabled={sIndex === (editedUnit.sessionDetails || []).length - 1} className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDownIcon className="w-4 h-4"/></button>
                                </div>
                                <label className="text-sm font-semibold text-slate-500 w-16 flex-shrink-0">Sesión {sIndex + 1}</label>
                                <div className="relative flex-shrink-0 flex items-center gap-1.5">
                                    {PALETTE_COLORS.map(color => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => handleSessionFieldChange(sIndex, 'color', color)}
                                            className={`w-5 h-5 rounded-full border-2 transition-transform transform hover:scale-110 ${detail.color === color ? 'border-blue-500 ring-2 ring-blue-300' : 'border-white'}`}
                                            style={{ backgroundColor: color }}
                                            title={`Seleccionar color ${color}`}
                                        />
                                    ))}
                                </div>
                                <Input type="text" value={detail.titulo || ''} onChange={e => handleSessionFieldChange(sIndex, 'titulo', e.target.value)} placeholder="Título de la sesión..." className="w-full"/>
                            </div>

                            <div className="pl-8 space-y-2">
                                {detail.actividades.map((act, aIndex) => {
                                    const abierta = actividadesAbiertas.has(`${sIndex}-${aIndex}`);
                                    const resumen = [act.tipo, act.agrupamiento, act.duracionMin ? `${act.duracionMin} min` : null].filter(Boolean).join(' · ');
                                    return (
                                    <div key={aIndex} className="border border-dashed rounded-md bg-slate-50">
                                        <div className="flex items-center gap-2 p-2">
                                            <button
                                                type="button"
                                                onClick={() => toggleActividadAbierta(sIndex, aIndex)}
                                                className="p-1 text-slate-400 hover:text-slate-700 flex-shrink-0"
                                                title={abierta ? 'Plegar detalles' : 'Desplegar detalles'}
                                            >
                                                {abierta ? <ChevronDownIcon className="w-4 h-4"/> : <ChevronRightIcon className="w-4 h-4"/>}
                                            </button>
                                            <button type="button" onClick={() => toggleActividadAbierta(sIndex, aIndex)} className="flex-1 min-w-0 text-left">
                                                <span className="text-sm font-medium text-slate-700">{act.titulo || `Actividad ${aIndex + 1}`}</span>
                                                {resumen && <span className="text-xs text-slate-400 ml-2">{resumen}</span>}
                                            </button>
                                            <button type="button" onClick={() => handleRemoveActivity(sIndex, aIndex)} disabled={detail.actividades.length <= 1} className="p-1.5 text-red-400 hover:text-red-600 disabled:opacity-20 flex-shrink-0"><TrashIcon className="w-4 h-4"/></button>
                                        </div>

                                        {abierta && (
                                            <div className="px-2 pb-2 space-y-2">
                                                <div className="flex gap-2 items-start flex-wrap">
                                                    <div className="w-48 flex-shrink-0">
                                                        <label className="text-xs font-medium text-slate-500">Título</label>
                                                        <Input type="text" value={act.titulo || ''} onChange={e => handleActivityChange(sIndex, aIndex, { titulo: e.target.value })} placeholder="Título de la actividad"/>
                                                    </div>
                                                    <div className="w-40 flex-shrink-0">
                                                        <label className="text-xs font-medium text-slate-500">Tipo</label>
                                                        <Input type="text" value={act.tipo || ''} onChange={e => handleActivityChange(sIndex, aIndex, { tipo: e.target.value })} placeholder="Ej. cooperativo"/>
                                                    </div>
                                                    <div className="w-32 flex-shrink-0">
                                                        <label className="text-xs font-medium text-slate-500">Agrupamiento</label>
                                                        <Input type="text" value={act.agrupamiento || ''} onChange={e => handleActivityChange(sIndex, aIndex, { agrupamiento: e.target.value })} placeholder="Agrupamiento"/>
                                                    </div>
                                                    <div className="w-24 flex-shrink-0">
                                                        <label className="text-xs font-medium text-slate-500">Duración (min)</label>
                                                        <Input type="number" min="0" value={act.duracionMin ?? ''} onChange={e => handleActivityChange(sIndex, aIndex, { duracionMin: e.target.value ? parseInt(e.target.value, 10) : undefined })} placeholder="min"/>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-slate-500">Descripción</label>
                                                    <textarea
                                                        value={act.descripcion}
                                                        onChange={e => handleActivityChange(sIndex, aIndex, { descripcion: e.target.value })}
                                                        placeholder="Descripción de la actividad..."
                                                        className="w-full text-sm p-2 border rounded-md focus:border-blue-500 outline-none"
                                                        rows={6}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-slate-500">Recursos</label>
                                                    <Input
                                                        type="text"
                                                        value={(act.recursos || []).join(', ')}
                                                        onChange={e => handleActivityChange(sIndex, aIndex, { recursos: e.target.value ? e.target.value.split(',').map(r => r.trim()).filter(Boolean) : [] })}
                                                        placeholder="Recursos (separados por comas)"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-slate-500">Adaptación para atender a la diversidad (opcional)</label>
                                                    <textarea
                                                        value={act.adaptacion || ''}
                                                        onChange={e => handleActivityChange(sIndex, aIndex, { adaptacion: e.target.value || undefined })}
                                                        placeholder="Adaptación, si esta actividad la necesita..."
                                                        className="w-full text-sm p-2 border rounded-md focus:border-blue-500 outline-none"
                                                        rows={3}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-slate-500 block mb-1">Criterios que activa</label>
                                                    <CriteriaChips criteria={criteria} selectedIds={act.linkedCriteriaIds || []} onChange={ids => handleActivityChange(sIndex, aIndex, { linkedCriteriaIds: ids })} />
                                                </div>
                                                <div className="w-72">
                                                    <label className="text-xs font-medium text-slate-500 block mb-1">Instrumento de evaluación</label>
                                                    <InstrumentoSelectConIA
                                                        evaluationTools={evaluationTools}
                                                        value={act.evaluationToolId}
                                                        onChange={id => handleActivityChange(sIndex, aIndex, { evaluationToolId: id })}
                                                        courseId={editedUnit.courseId}
                                                        courses={courses}
                                                        criteria={criteria}
                                                        linkedCriteriaIds={act.linkedCriteriaIds || []}
                                                        contexto={act.descripcion || act.titulo}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                                <button type="button" onClick={() => handleAddActivity(sIndex)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                    <PlusIcon className="w-3 h-3"/> Añadir actividad
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'evaluacion' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 border rounded-lg bg-white space-y-2">
                    <label className="flex items-center gap-2 font-semibold text-slate-700">
                        <input type="checkbox" checked={finalProduct.incluido} onChange={e => handleProductChange({ incluido: e.target.checked })} className={checkboxClassName}/>
                        📦 Producto final
                    </label>
                    {finalProduct.incluido && (
                        <div className="space-y-2 pl-1">
                            <Input type="text" value={finalProduct.tipo || ''} onChange={e => handleProductChange({ tipo: e.target.value })} placeholder="Tipo (ej. Infografía, Vídeo...)" className="w-full"/>
                            <textarea value={finalProduct.descripcion || ''} onChange={e => handleProductChange({ descripcion: e.target.value })} placeholder="Descripción..." className="w-full text-sm p-1.5 border rounded-md focus:border-blue-500 outline-none" rows={2}/>
                            <CriteriaChips criteria={criteria} selectedIds={finalProduct.linkedCriteriaIds || []} onChange={ids => handleProductChange({ linkedCriteriaIds: ids })} />
                            <div>
                                <p className="text-xs font-semibold text-slate-500 mb-1">Instrumento de evaluación</p>
                                <InstrumentoSelectConIA
                                    evaluationTools={evaluationTools}
                                    value={finalProduct.evaluationToolId}
                                    onChange={id => handleProductChange({ evaluationToolId: id })}
                                    courseId={editedUnit.courseId}
                                    courses={courses}
                                    criteria={criteria}
                                    linkedCriteriaIds={finalProduct.linkedCriteriaIds || []}
                                    contexto={finalProduct.descripcion || finalProduct.tipo}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-3 border rounded-lg bg-white space-y-2">
                    <label className="flex items-center gap-2 font-semibold text-slate-700">
                        <input type="checkbox" checked={finalExam.incluido} onChange={e => handleExamChange({ incluido: e.target.checked })} className={checkboxClassName}/>
                        📝 Examen final
                    </label>
                    {finalExam.incluido && (
                        <div className="space-y-2 pl-1">
                            <Input type="text" value={finalExam.formato || ''} onChange={e => handleExamChange({ formato: e.target.value })} placeholder="Formato (ej. Test, preguntas abiertas...)" className="w-full"/>
                            <div>
                                <p className="text-xs font-semibold text-slate-500 mb-1">Instrumento de evaluación</p>
                                <InstrumentoSelectConIA
                                    evaluationTools={evaluationTools}
                                    value={finalExam.evaluationToolId}
                                    onChange={id => handleExamChange({ evaluationToolId: id })}
                                    courseId={editedUnit.courseId}
                                    courses={courses}
                                    criteria={criteria}
                                    linkedCriteriaIds={Array.from(new Set((finalExam.bloques || []).flatMap(b => b.linkedCriteriaIds || [])))}
                                    contexto={finalExam.formato ? `Examen final: ${finalExam.formato}` : 'Examen final'}
                                />
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-slate-500">Bloques</p>
                                {(finalExam.bloques || []).map((block, i) => (
                                    <div key={i} className="p-1.5 border border-dashed rounded-md bg-slate-50 space-y-1">
                                        <div className="flex gap-1.5">
                                            <Input type="text" value={block.descripcion} onChange={e => handleExamBlockChange(i, { descripcion: e.target.value })} placeholder="Descripción del bloque..." className="w-full"/>
                                            <button type="button" onClick={() => handleRemoveExamBlock(i)} className="p-1.5 text-red-400 hover:text-red-600 flex-shrink-0"><TrashIcon className="w-4 h-4"/></button>
                                        </div>
                                        <CriteriaChips criteria={criteria} selectedIds={block.linkedCriteriaIds || []} onChange={ids => handleExamBlockChange(i, { linkedCriteriaIds: ids })} />
                                    </div>
                                ))}
                                <button type="button" onClick={handleAddExamBlock} className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                    <PlusIcon className="w-3 h-3"/> Añadir bloque
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            )}

            {activeTab === 'cobertura' && (
            <div className="space-y-4">
                {criteriosVinculados.length === 0 ? (
                    <p className="text-sm text-slate-500">
                        Esta SA todavía no tiene criterios de evaluación vinculados (pestaña Currículo).
                    </p>
                ) : (
                    <>
                        {criteriosSinEvidencia.length > 0 && (
                            <div className="p-2.5 border border-amber-300 bg-amber-50 rounded-lg text-sm text-amber-800">
                                <p className="font-semibold mb-1">⚠️ Vinculados a la SA pero sin ninguna actividad que los evidencie:</p>
                                <p>{criteriosSinEvidencia.map(c => c.code).join(', ')}</p>
                            </div>
                        )}
                        <div className="overflow-x-auto">
                            <table className="text-sm border-collapse">
                                <thead>
                                    <tr>
                                        <th className="text-left p-1.5 border-b border-r font-semibold text-slate-600 sticky left-0 bg-white">Sesión</th>
                                        {criteriosVinculados.map(c => (
                                            <th key={c.id} className="p-1.5 border-b font-semibold text-slate-600 whitespace-nowrap" title={c.description}>
                                                {c.code}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sesionesConActividades.map((sesion, sIndex) => (
                                        <tr key={sIndex}>
                                            <td className="p-1.5 border-r text-slate-600 whitespace-nowrap sticky left-0 bg-white">
                                                {sesion.titulo || `Sesión ${sIndex + 1}`}
                                            </td>
                                            {criteriosVinculados.map(c => (
                                                <td key={c.id} className="p-1.5 text-center text-slate-400">
                                                    {criterioEvidenciadoEnSesion(c.id, sesion) ? <span className="text-emerald-600 font-bold">✓</span> : '·'}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
            )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
                <button onClick={onCancel} className="text-sm font-semibold text-slate-600 hover:text-slate-800 px-3 py-1">Cancelar</button>
                <button onClick={handleSaveClick} className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-md">Guardar SA</button>
            </div>
        </div>
    );
};

type SelectableItem = EvaluationCriterion | BasicKnowledge | SpecificCompetence;

const MultiSelect = ({ title, allItems, selectedIds, setSelectedIds, groupBy } : {
    title: string;
    allItems: SelectableItem[];
    selectedIds: Set<string>;
    setSelectedIds: (ids: Set<string>) => void;
    // Opcional -- agrupa los ítems bajo un encabezado (p.ej. bloques de
    // Saberes Básicos). Sin esto se listan planos, como antes.
    groupBy?: (item: SelectableItem) => string | null;
}) => {

    const handleSelect = (id: string, checked: boolean) => {
        const newIds = new Set(selectedIds);
        if (checked) newIds.add(id);
        else newIds.delete(id);
        setSelectedIds(newIds);
    }

    const renderItem = (item: SelectableItem) => (
        <label key={item.id} className="flex items-start gap-2 p-1.5 rounded-md hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" checked={selectedIds.has(item.id)} onChange={e => handleSelect(item.id, e.target.checked)} className={`mt-0.5 ${checkboxClassName}`}/>
            <span className="text-sm text-slate-600"><span className="font-bold">{item.code}:</span> {item.description}</span>
        </label>
    );

    let content: React.ReactNode;

    if (groupBy) {
        const grupos = new Map<string, SelectableItem[]>();
        const sinGrupo: SelectableItem[] = [];
        for (const item of allItems) {
            const nombreGrupo = groupBy(item);
            if (!nombreGrupo) { sinGrupo.push(item); continue; }
            if (!grupos.has(nombreGrupo)) grupos.set(nombreGrupo, []);
            grupos.get(nombreGrupo)!.push(item);
        }
        content = (
            <>
                {Array.from(grupos.entries()).map(([nombreGrupo, items]) => (
                    <div key={nombreGrupo}>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-2 mb-1 first:mt-0">{nombreGrupo}</p>
                        {items.map(renderItem)}
                    </div>
                ))}
                {sinGrupo.length > 0 && (
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-2 mb-1">Sin bloque asignado</p>
                        {sinGrupo.map(renderItem)}
                    </div>
                )}
            </>
        );
    } else {
        content = allItems.map(renderItem);
    }

    return (
        <div className="p-3 border rounded-lg bg-white">
            <h4 className="font-semibold text-slate-700 mb-2">{title}</h4>
            <div className="max-h-56 overflow-y-auto space-y-1 pr-2">
                {content}
            </div>
        </div>
    )
}

export default ProgrammingManager;
