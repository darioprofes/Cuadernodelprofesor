
import React, { useState, useMemo } from 'react';
import type { EvaluationTool, Checklist, RatingScale, Rubric, EvaluationLevel, BaseEvaluationItem, EvaluationCriterion, Course } from '../types';
import { PencilIcon, TrashIcon, PlusIcon, LinkIcon, ArrowUpTrayIcon } from './Icons';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';
import { checkboxClassName } from '../theme/components/Input';
import { linkClassName } from '../theme/components/Link';

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
}

const EvaluationToolManager: React.FC<EvaluationToolManagerProps> = ({ evaluationTools, onCreate, onUpdate, onDelete, criteria, courses }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [toolToEdit, setToolToEdit] = useState<EvaluationTool | null>(null);
    const [showImportHelp, setShowImportHelp] = useState(false);

    const handleSave = (tool: EvaluationTool) => {
        if (toolToEdit) {
            // criterionScores de una nota basada en instrumento se deriva
            // siempre en caliente a partir de toolResults + la definición
            // VIGENTE del instrumento (ver services/apiAdapters.ts,
            // decodeGrade), así que no hay nada que recalcular ni
            // reguardar aquí en ninguna plataforma: el siguiente GET ya usa
            // la definición nueva.
            const { id, ...data } = tool;
            onUpdate(id, data);
        } else {
            const { id: _unused, ...data } = tool;
            onCreate(data);
        }
        setIsModalOpen(false);
    };

    const handleDelete = (toolId: string) => {
        if (window.confirm("¿Seguro que quieres eliminar este instrumento? Esta acción no se puede deshacer.")) {
            onDelete(toolId);
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (text) {
                parseAndImportCSV(text);
            }
        };
        reader.readAsText(file);
        if (event.target) event.target.value = '';
    };

    const parseAndImportCSV = (csvText: string) => {
        try {
            const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
            if (lines.length < 2) {
                alert("El archivo CSV parece estar vacío o no tiene datos válidos.");
                return;
            }

            // Parse headers to identify levels
            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            // Standard columns: type, name, description, weight
            // Level columns start at index 4
            
            const levelConfigs: { name: string; points: number; colIndex: number }[] = [];
            for (let i = 4; i < headers.length; i++) {
                const header = headers[i];
                // Attempt to parse "Name (Points)" e.g., "Excellent (4)"
                const match = header.match(/^(.*)\s*\((\d+(?:\.\d+)?)\)$/);
                if (match) {
                    levelConfigs.push({
                        name: match[1].trim(),
                        points: parseFloat(match[2]),
                        colIndex: i
                    });
                } else if (header) {
                    // Fallback if no points specified, assume index + 1
                    levelConfigs.push({
                        name: header,
                        points: i - 3, 
                        colIndex: i
                    });
                }
            }

            const toolsMap = new Map<string, EvaluationTool>();

            // Parse data lines
            for (let i = 1; i < lines.length; i++) {
                // Handle commas inside quotes
                const row: string[] = [];
                let currentVal = '';
                let insideQuotes = false;
                for (const char of lines[i]) {
                    if (char === '"' && insideQuotes) insideQuotes = false;
                    else if (char === '"' && !insideQuotes) insideQuotes = true;
                    else if (char === ',' && !insideQuotes) {
                        row.push(currentVal.trim());
                        currentVal = '';
                    } else {
                        currentVal += char;
                    }
                }
                row.push(currentVal.trim());

                const [typeRaw, nameRaw, descRaw, weightRaw] = row;
                if (!typeRaw || !nameRaw) continue;

                const type = typeRaw.toLowerCase().replace(/_/g, '') as string;
                const name = nameRaw.replace(/^"|"$/g, '');
                const description = (descRaw || '').replace(/^"|"$/g, '');
                const weight = weightRaw ? parseFloat(weightRaw) : 1;

                // Determine tool type
                let toolType: 'checklist' | 'rating_scale' | 'rubric' = 'checklist';
                if (type.includes('rubri') || type.includes('rúbri')) toolType = 'rubric';
                else if (type.includes('scal') || type.includes('escala')) toolType = 'rating_scale';
                else toolType = 'checklist';

                // Initialize tool if not exists
                if (!toolsMap.has(name)) {
                    const toolId = `tool-imp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                    const baseTool: EvaluationTool = toolType === 'checklist'
                        ? { id: toolId, name, type: 'checklist', items: [] }
                        : {
                            id: toolId,
                            name,
                            type: toolType,
                            items: [],
                            levels: levelConfigs.length > 0
                                ? levelConfigs.map((lc, idx) => ({
                                    id: `lvl-${Date.now()}-${idx}-${Math.floor(Math.random()*1000)}`,
                                    name: lc.name,
                                    points: lc.points
                                  }))
                                : [{ id: `lvl-def-1`, name: 'Sí', points: 1 }, { id: `lvl-def-0`, name: 'No', points: 0 }], // Fallback
                        };
                    toolsMap.set(name, baseTool);
                }

                const tool = toolsMap.get(name)!;

                // Add Item
                if (toolType === 'checklist') {
                    (tool as Checklist).items.push({
                        id: `item-${Date.now()}-${i}`,
                        description,
                        weight: isNaN(weight) ? 1 : weight,
                        linkedCriteriaIds: []
                    });
                } else if (toolType === 'rating_scale') {
                    (tool as RatingScale).items.push({
                         id: `item-${Date.now()}-${i}`,
                        description,
                        weight: isNaN(weight) ? 1 : weight,
                        linkedCriteriaIds: []
                    });
                } else if (toolType === 'rubric') {
                    const rubric = tool as Rubric;
                    const levelDescriptions: Record<string, string> = {};
                    
                    // Map CSV columns to the tool's level IDs
                    levelConfigs.forEach((lc, idx) => {
                        if (rubric.levels[idx]) {
                            const colValue = row[lc.colIndex];
                            levelDescriptions[rubric.levels[idx].id] = colValue ? colValue.replace(/^"|"$/g, '') : '';
                        }
                    });

                    rubric.items.push({
                        id: `item-${Date.now()}-${i}`,
                        description,
                        weight: isNaN(weight) ? 1 : weight,
                        linkedCriteriaIds: [],
                        levelDescriptions
                    });
                }
            }

            if (toolsMap.size > 0) {
                toolsMap.forEach(tool => {
                    const { id: _unused, ...data } = tool;
                    onCreate(data);
                });
                alert(`Se han importado ${toolsMap.size} instrumentos correctamente.`);
            } else {
                alert("No se encontraron instrumentos válidos en el archivo.");
            }

        } catch (error) {
            console.error("CSV Import Error:", error);
            alert("Error al procesar el archivo CSV. Revisa el formato.");
        }
    };

    const checklists = evaluationTools.filter(t => t.type === 'checklist');
    const ratingScales = evaluationTools.filter(t => t.type === 'rating_scale');
    const rubrics = evaluationTools.filter(t => t.type === 'rubric');
    const criterialExams = evaluationTools.filter(t => t.type === 'criterial_exam');

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-slate-800">Instrumentos de Evaluación</h3>
                <div className="flex gap-2">
                     <button
                        onClick={() => setShowImportHelp(!showImportHelp)}
                        className="inline-flex items-center justify-center py-2 px-3 border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50"
                    >
                        <ArrowUpTrayIcon className="w-4 h-4 mr-1" />
                        Importar CSV
                    </button>
                    <button
                        onClick={() => { setToolToEdit(null); setIsModalOpen(true); }}
                        className="inline-flex items-center justify-center py-2 px-3 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700"
                    >
                        <PlusIcon className="w-4 h-4 mr-1" />
                        Nuevo Instrumento
                    </button>
                </div>
            </div>

            {showImportHelp && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 animate-fade-in-down">
                    <h4 className="font-bold mb-2">Instrucciones para Importar Instrumentos</h4>
                    <p className="mb-2">Puedes importar múltiples instrumentos (Rúbricas, Escalas, Listas) en un solo archivo CSV. El formato debe ser:</p>
                    <div className="bg-white p-2 rounded border border-blue-100 overflow-x-auto font-mono text-xs mb-3">
                        type,name,description,weight,Nivel 1 (1),Nivel 2 (2),Nivel 3 (3),Nivel 4 (4)<br/>
                        rubric,"Mi Rúbrica","Ortografía",1,"Muchos errores","Algunos errores","Pocos errores","Sin errores"<br/>
                        rating_scale,"Mi Escala","Presentación",1,,,,<br/>
                        checklist,"Mi Lista","Entregado a tiempo",1,,,,
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                        <li><strong>type:</strong> <code>rubric</code>, <code>rating_scale</code> o <code>checklist</code>.</li>
                        <li><strong>name:</strong> El nombre agrupa las filas en un mismo instrumento.</li>
                        <li><strong>description:</strong> El ítem a evaluar.</li>
                        <li><strong>weight:</strong> Peso del ítem (opcional, por defecto 1).</li>
                        <li><strong>Columnas de Nivel (5 en adelante):</strong> El encabezado define el nombre y los puntos entre paréntesis ej: <code>Logrado (10)</code>.</li>
                        <li>Para <strong>Rúbricas</strong>, el contenido de la celda es la descripción del nivel. Para <strong>Escalas</strong>, el contenido se ignora (se usan solo los encabezados).</li>
                    </ul>
                    <div className="mt-3">
                         <label className="cursor-pointer inline-flex items-center justify-center py-2 px-4 border border-blue-300 shadow-sm text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50">
                            <ArrowUpTrayIcon className="w-4 h-4 mr-2" />
                            Seleccionar Archivo CSV
                            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                        </label>
                    </div>
                </div>
            )}

            <p className="text-sm text-slate-600 mb-4">
                Crea y gestiona plantillas de Listas de Cotejo, Escalas de Valoración y Rúbricas para reutilizarlas en tus tareas.
            </p>

            <div className="space-y-6">
                <ToolSection type="checklist" tools={checklists} onEdit={setToolToEdit} onDelete={handleDelete} onOpenModal={() => setIsModalOpen(true)} />
                <ToolSection type="rating_scale" tools={ratingScales} onEdit={setToolToEdit} onDelete={handleDelete} onOpenModal={() => setIsModalOpen(true)} />
                <ToolSection type="rubric" tools={rubrics} onEdit={setToolToEdit} onDelete={handleDelete} onOpenModal={() => setIsModalOpen(true)} />
                <ToolSection type="criterial_exam" tools={criterialExams} onEdit={setToolToEdit} onDelete={handleDelete} onOpenModal={() => setIsModalOpen(true)} />
            </div>

            {isModalOpen && (
                <EvaluationToolEditorModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSave}
                    toolToEdit={toolToEdit}
                    criteria={criteria}
                    courses={courses}
                />
            )}
        </div>
    );
};

const ToolSection: React.FC<{ type: 'checklist' | 'rating_scale' | 'rubric' | 'criterial_exam', tools: EvaluationTool[], onEdit: (tool: EvaluationTool) => void, onDelete: (id: string) => void, onOpenModal: () => void }> = ({ type, tools, onEdit, onDelete, onOpenModal }) => {
    const title = {
        checklist: 'Listas de Cotejo',
        rating_scale: 'Escalas de Valoración',
        rubric: 'Rúbricas',
        criterial_exam: 'Exámenes Criteriales'
    }[type];

    return (
        <div>
            <h4 className="text-lg font-semibold text-slate-700 mb-2">{title}</h4>
            <div className="space-y-2">
                {tools.length > 0 ? tools.map(tool => (
                    <div key={tool.id} className="flex items-center justify-between p-3 border rounded-lg bg-white group">
                        <span className="font-medium">{tool.name}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { onEdit(tool); onOpenModal(); }} className="p-2 hover:bg-slate-200 rounded-full"><PencilIcon className="w-4 h-4 text-slate-600" /></button>
                            <button onClick={() => onDelete(tool.id)} className="p-2 hover:bg-red-100 rounded-full"><TrashIcon className="w-4 h-4 text-red-500" /></button>
                        </div>
                    </div>
                )) : (
                    <p className="text-slate-500 text-center py-4 bg-slate-50 rounded-lg">No hay {title.toLowerCase()} creadas.</p>
                )}
            </div>
        </div>
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
}

const EvaluationToolEditorModal: React.FC<EditorModalProps> = ({ isOpen, onClose, onSave, toolToEdit, criteria, courses }) => {
    const [tool, setTool] = useState<ToolDraft>(() =>
        toolToEdit || { name: '', type: 'checklist', items: [] }
    );

    const handleFieldChange = <K extends keyof ToolDraft>(field: K, value: ToolDraft[K]) => {
        setTool(prev => ({ ...prev, [field]: value }));
    };

    const handleTypeChange = (newType: 'checklist' | 'rating_scale' | 'rubric' | 'criterial_exam') => {
        setTool(prev => {
            if (prev.type === newType) return prev;
            const baseProps = {
                name: prev.name,
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
                <div className="grid grid-cols-2 gap-4">
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
                                <Input type="number" value={level.points} onChange={e => handleLevelChange(index, 'points', Number(e.target.value))} placeholder="Puntos" className="w-24" />
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
                            <Input type="number" value={level.points} onChange={e => handleLevelChange(index, 'points', Number(e.target.value))} placeholder="Puntos" className="w-24" />
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
                        step="0.5"
                        value={item.weight}
                        onChange={e => onItemChange('weight', Number(e.target.value))}
                        className="w-24"
                    />
                    <button type="button" onClick={() => setIsCriteriaModalOpen(true)} className="flex items-center gap-1 text-sm text-blue-600 p-2 hover:bg-blue-50 rounded-md">
                        <LinkIcon className="w-4 h-4" />
                        Vincular Criterios ({item.linkedCriteriaIds.length})
                    </button>
                </div>
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
                            step="0.5"
                            value={item.weight}
                            onChange={e => onItemChange('weight', Number(e.target.value))}
                            className="w-24"
                        />
                        <button type="button" onClick={() => setIsCriteriaModalOpen(true)} className="flex items-center gap-1 text-sm text-blue-600 p-2 hover:bg-blue-50 rounded-md">
                            <LinkIcon className="w-4 h-4" />
                            Vincular Criterios LOMLOE ({item.linkedCriteriaIds.length})
                        </button>
                    </div>
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
}

// Criteria Selector Modal
const CriteriaSelectorModal: React.FC<CriteriaSelectorProps> = ({ isOpen, onClose, allCriteria, courses, selectedIds, onSave }) => {
    const [currentSelection, setCurrentSelection] = useState<Set<string>>(() => new Set(selectedIds));
    const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || '');

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
