
import React, { useState, useMemo } from 'react';
import type { ProgrammingUnit, Course, SessionDetail, SessionActivity, FinalProduct, FinalExam, EvaluationCriterion, BasicKnowledge, SpecificCompetence, ClassData, AcademicConfiguration } from '../types';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon, ArrowUpTrayIcon, SparklesIcon } from './Icons';
import Modal from './Modal';
import Input from './Input';
import GenerarUnidadIAModal from './GenerarUnidadIAModal';
import { TYPOGRAPHY } from '../theme/typography';
import { checkboxClassName } from '../theme/components/Input';
import { formatFechaEs } from '../utils';
import { useProgrammingUnits, useCreateProgrammingUnit, useUpdateProgrammingUnit, useDeleteProgrammingUnit } from '../hooks/useProgrammingUnits';
import { useEvaluationCriteria } from '../hooks/useEvaluationCriteria';
import { useBasicKnowledge } from '../hooks/useBasicKnowledge';
import { useSpecificCompetences } from '../hooks/useSpecificCompetences';

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
    // abrir GenerarUnidadIAModal directamente, sin que el profesor tenga que
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
    // GenerarUnidadIAModal para revisar en el mismo formulario que ya usa la
    // creación manual, en vez de tener un formulario de revisión aparte.
    const [unitEditorState, setUnitEditorState] = useState<{ mode: 'create', draft?: ProgrammingUnit } | { mode: 'edit', unit: ProgrammingUnit } | null>(null);
    const [showImportHelp, setShowImportHelp] = useState(false);
    const [showGenerarIA, setShowGenerarIA] = useState(false);

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
                                        <div key={unit.id} className="p-3 border rounded-lg group hover:bg-slate-50/50 transition-colors">
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
                    size="3xl"
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
                    />
                </Modal>
            )}
            <GenerarUnidadIAModal
                isOpen={showGenerarIA}
                courseId={selectedCourseId}
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
                <button onClick={onEdit} className="p-2 hover:bg-slate-200 rounded-full"><PencilIcon className="w-4 h-4 text-slate-600" /></button>
                <button onClick={onDelete} className="p-2 hover:bg-red-100 rounded-full"><TrashIcon className="w-4 h-4 text-red-500" /></button>
            </div>
        </div>
    )
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
}> = ({ unit, onSave, onCancel, criteria, basicKnowledge, specificCompetences }) => {
    const [editedUnit, setEditedUnit] = useState(unit);
    const [activeTab, setActiveTab] = useState<'general' | 'curriculo' | 'sesiones' | 'evaluacion'>('general');

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

    const handleAddRubricaRow = () => {
        handleProductChange({ rubrica: [...(finalProduct.rubrica || []), { criterio: '', descriptor: '' }] });
    };

    const handleRubricaRowChange = (index: number, field: 'criterio' | 'descriptor', value: string) => {
        const rows = [...(finalProduct.rubrica || [])];
        rows[index] = { ...rows[index], [field]: value };
        handleProductChange({ rubrica: rows });
    };

    const handleRemoveRubricaRow = (index: number) => {
        handleProductChange({ rubrica: (finalProduct.rubrica || []).filter((_, i) => i !== index) });
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
    ];

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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <MultiSelect title="Competencias Específicas" allItems={specificCompetences} selectedIds={new Set(editedUnit.linkedSpecificCompetenceIds || [])} setSelectedIds={(idSet) => handleMultiSelectChange('linkedSpecificCompetenceIds', idSet)} />
                    <MultiSelect title="Criterios de Evaluación" allItems={criteria} selectedIds={new Set(editedUnit.linkedCriteriaIds || [])} setSelectedIds={(idSet) => handleMultiSelectChange('linkedCriteriaIds', idSet)} />
                    <MultiSelect title="Saberes Básicos" allItems={basicKnowledge} selectedIds={new Set(editedUnit.linkedBasicKnowledgeIds || [])} setSelectedIds={(idSet) => handleMultiSelectChange('linkedBasicKnowledgeIds', idSet)} />
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
                                {detail.actividades.map((act, aIndex) => (
                                    <div key={aIndex} className="p-2 border border-dashed rounded-md bg-slate-50 space-y-1.5">
                                        <div className="flex gap-2 items-start flex-wrap">
                                            <div className="w-40 flex-shrink-0"><Input type="text" value={act.titulo || ''} onChange={e => handleActivityChange(sIndex, aIndex, { titulo: e.target.value })} placeholder="Actividad..."/></div>
                                            <div className="w-36 flex-shrink-0"><Input type="text" value={act.tipo || ''} onChange={e => handleActivityChange(sIndex, aIndex, { tipo: e.target.value })} placeholder="Tipo (ej. cooperativo)"/></div>
                                            <div className="w-28 flex-shrink-0"><Input type="text" value={act.agrupamiento || ''} onChange={e => handleActivityChange(sIndex, aIndex, { agrupamiento: e.target.value })} placeholder="Agrupamiento"/></div>
                                            <div className="w-16 flex-shrink-0"><Input type="number" min="0" value={act.duracionMin ?? ''} onChange={e => handleActivityChange(sIndex, aIndex, { duracionMin: e.target.value ? parseInt(e.target.value, 10) : undefined })} placeholder="min"/></div>
                                            <button type="button" onClick={() => handleRemoveActivity(sIndex, aIndex)} disabled={detail.actividades.length <= 1} className="p-1.5 text-red-400 hover:text-red-600 disabled:opacity-20 flex-shrink-0"><TrashIcon className="w-5 h-5"/></button>
                                        </div>
                                        <textarea
                                            value={act.descripcion}
                                            onChange={e => handleActivityChange(sIndex, aIndex, { descripcion: e.target.value })}
                                            placeholder="Descripción de la actividad..."
                                            className="w-full text-sm p-1.5 border rounded-md focus:border-blue-500 outline-none"
                                            rows={2}
                                        />
                                        <Input
                                            type="text"
                                            value={(act.recursos || []).join(', ')}
                                            onChange={e => handleActivityChange(sIndex, aIndex, { recursos: e.target.value ? e.target.value.split(',').map(r => r.trim()).filter(Boolean) : [] })}
                                            placeholder="Recursos (separados por comas)"
                                            className="w-full text-xs"
                                        />
                                        <CriteriaChips criteria={criteria} selectedIds={act.linkedCriteriaIds || []} onChange={ids => handleActivityChange(sIndex, aIndex, { linkedCriteriaIds: ids })} />
                                    </div>
                                ))}
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
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-slate-500">Rúbrica</p>
                                {(finalProduct.rubrica || []).map((row, i) => (
                                    <div key={i} className="flex gap-1.5 items-center">
                                        <div className="w-28 flex-shrink-0"><Input type="text" value={row.criterio} onChange={e => handleRubricaRowChange(i, 'criterio', e.target.value)} placeholder="Criterio (código)"/></div>
                                        <Input type="text" value={row.descriptor} onChange={e => handleRubricaRowChange(i, 'descriptor', e.target.value)} placeholder="Descriptor de logro..." className="flex-1"/>
                                        <button type="button" onClick={() => handleRemoveRubricaRow(i)} className="p-1.5 text-red-400 hover:text-red-600 flex-shrink-0"><TrashIcon className="w-5 h-5"/></button>
                                    </div>
                                ))}
                                <button type="button" onClick={handleAddRubricaRow} className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                    <PlusIcon className="w-3 h-3"/> Añadir descriptor
                                </button>
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
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
                <button onClick={onCancel} className="text-sm font-semibold text-slate-600 hover:text-slate-800 px-3 py-1">Cancelar</button>
                <button onClick={handleSaveClick} className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-md">Guardar SA</button>
            </div>
        </div>
    );
};

const MultiSelect = ({ title, allItems, selectedIds, setSelectedIds } : {title:string, allItems: (EvaluationCriterion | BasicKnowledge | SpecificCompetence)[], selectedIds: Set<string>, setSelectedIds: (ids: Set<string>) => void}) => {
    
    const handleSelect = (id: string, checked: boolean) => {
        const newIds = new Set(selectedIds);
        if (checked) newIds.add(id);
        else newIds.delete(id);
        setSelectedIds(newIds);
    }
    
    return (
        <div className="p-3 border rounded-lg bg-white">
            <h4 className="font-semibold text-slate-700 mb-2">{title}</h4>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-2">
                {allItems.map(item => (
                    <label key={item.id} className="flex items-start gap-2 p-1.5 rounded-md hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={e => handleSelect(item.id, e.target.checked)} className={`mt-0.5 ${checkboxClassName}`}/>
                        <span className="text-sm text-slate-600"><span className="font-bold">{item.code}:</span> {item.description}</span>
                    </label>
                ))}
            </div>
        </div>
    )
}

export default ProgrammingManager;
