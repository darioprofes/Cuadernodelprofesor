
import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Textarea from './Textarea';
import { checkboxClassName } from '../theme/components/Input';
import { TrashIcon } from './Icons';
import { ACNEAE_TAGS } from '../constants';
import { parsearNombre } from '../utils';

interface TempStudent {
    id: number;
    nombre: string;
    primerApellido: string;
    segundoApellido: string;
    nie: string;
    acneae: Set<string>;
}

interface BulkAddStudentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (students: { nombre?: string; primerApellido?: string; segundoApellido?: string; nie?: string; acneae: string[] }[]) => void;
}


const AcneaeSelector: React.FC<{ selected: Set<string>; onChange: (newSelection: Set<string>) => void }> = ({ selected, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const handleTagChange = (tag: string, checked: boolean) => {
        const newSelection = new Set(selected);
        if (checked) {
            newSelection.add(tag);
        } else {
            newSelection.delete(tag);
        }
        onChange(newSelection);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
                ACNEAE ({selected.size})
            </button>
            {isOpen && (
                <div className="absolute z-10 mt-1 w-64 bg-white shadow-lg border rounded-md p-2 right-0">
                    <p className="text-xs font-bold mb-2">Seleccionar Medidas</p>
                    <div className="grid grid-cols-2 gap-2">
                        {ACNEAE_TAGS.map(tag => (
                            <label key={tag} className="flex items-center space-x-2 text-xs cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selected.has(tag)}
                                    onChange={e => handleTagChange(tag, e.target.checked)}
                                    className={checkboxClassName}
                                />
                                <span>{tag}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};


const BulkAddStudentModal: React.FC<BulkAddStudentModalProps> = ({ isOpen, onClose, onSave }) => {
    const [students, setStudents] = useState<TempStudent[]>([]);
    const [rawText, setRawText] = useState('');

    // Antes esto se hacía interceptando el evento "paste" del textarea
    // (preventDefault + clipboardData): si el pegado llegaba por otra vía
    // (clic derecho, atajo distinto, entorno remoto...) ese evento no se
    // disparaba como se esperaba, el texto quedaba visible en el cuadro
    // pero la lista de abajo nunca se generaba y el botón de guardar se
    // quedaba desactivado para siempre. Ahora el textarea es un campo
    // normal y un botón explícito "Procesar lista" hace el troceado,
    // así que funciona sin importar cómo haya llegado el texto ahí.
    // "|" al final de la línea es opcional: "Apellido1, Apellido2, Nombre |
    // NIE" — separado a propósito del resto (que ya usa comas para
    // apellidos/nombre, con hasta 3 formas distintas de interpretarlas) para
    // no crear ambigüedad. Sin "|", la línea se sigue interpretando igual
    // que siempre.
    const handleProcesarTexto = () => {
        const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return;
        const newStudents: TempStudent[] = lines.map((line, index) => {
            const [nombreParte, nieParte] = line.split('|').map(p => p.trim());
            return {
                id: Date.now() + index,
                ...parsearNombre(nombreParte),
                nie: nieParte || '',
                acneae: new Set<string>(),
            };
        });
        setStudents(current => [...current, ...newStudents]);
        setRawText('');
    };

    const patchStudent = (id: number, patch: Partial<TempStudent>) => {
        setStudents(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    };

    const handleAcneaeChange = (id: number, newAcneae: Set<string>) => {
        setStudents(prev => prev.map(s => s.id === id ? { ...s, acneae: newAcneae } : s));
    };

    const removeStudent = (id: number) => {
        setStudents(prev => prev.filter(s => s.id !== id));
    };

    const handleSave = () => {
        const studentsToSave = students
            .filter(s => s.primerApellido.trim() || s.nombre.trim())
            .map(s => ({
                nombre: s.nombre.trim() || undefined,
                primerApellido: s.primerApellido.trim() || undefined,
                segundoApellido: s.segundoApellido.trim() || undefined,
                nie: s.nie.trim() || undefined,
                acneae: Array.from(s.acneae),
            }));
        
        if(studentsToSave.length > 0) {
            onSave(studentsToSave);
        }
        handleClose();
    };

    const handleClose = () => {
        setStudents([]);
        setRawText('');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Añadir Alumnado en Lote" size="2xl">
            <div className="space-y-4">
                {students.length === 0 && (
                <div>
                    <label htmlFor="student-paste-area" className="block text-sm font-medium text-slate-700">
                        Pega aquí el listado de alumnado
                    </label>
                    <Textarea
                        id="student-paste-area"
                        value={rawText}
                        onChange={e => setRawText(e.target.value)}
                        placeholder={"García Fernández, López Martínez, Juan Pablo | 1234567\nRuiz, Díaz, Ana\n…"}
                        className="mt-1 min-h-[100px] font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                        Formato preferido: <code className="bg-slate-100 px-1 rounded">Apellido1, Apellido2, Nombre</code> (un alumno/a por línea) — permite apellidos compuestos.
                        También se acepta <code className="bg-slate-100 px-1 rounded">Apellido1 Apellido2, Nombre</code> o <code className="bg-slate-100 px-1 rounded">Nombre Apellido1 Apellido2</code>.
                        Para incluir el NIE, añade <code className="bg-slate-100 px-1 rounded">| NIE</code> al final de la línea (opcional, también se puede rellenar después fila a fila).
                        Puedes corregir los campos antes de guardar.
                    </p>
                    <button
                        type="button"
                        onClick={handleProcesarTexto}
                        disabled={!rawText.trim()}
                        className="mt-2 bg-slate-100 text-slate-700 text-sm font-medium py-1.5 px-3 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Procesar lista
                    </button>
                </div>
                )}

                {students.length > 0 && (
                    <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-2">Alumnado a añadir:</h4>
                        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-2 bg-slate-50">
                            {students.map((student, index) => (
                                <div key={student.id} className="flex items-center gap-1.5 p-1.5 bg-white rounded-md border">
                                    <span className="font-semibold text-slate-400 w-5 text-center text-xs flex-shrink-0">{index + 1}</span>
                                    <Input
                                        type="text"
                                        value={student.primerApellido}
                                        onChange={e => patchStudent(student.id, { primerApellido: e.target.value })}
                                        placeholder="1er apellido"
                                        className="!w-auto flex-1 min-w-0"
                                    />
                                    <Input
                                        type="text"
                                        value={student.segundoApellido}
                                        onChange={e => patchStudent(student.id, { segundoApellido: e.target.value })}
                                        placeholder="2º apellido"
                                        className="!w-auto flex-1 min-w-0"
                                    />
                                    <Input
                                        type="text"
                                        value={student.nombre}
                                        onChange={e => patchStudent(student.id, { nombre: e.target.value })}
                                        placeholder="Nombre"
                                        className="!w-auto flex-1 min-w-0"
                                    />
                                    <Input
                                        type="text"
                                        value={student.nie}
                                        onChange={e => patchStudent(student.id, { nie: e.target.value })}
                                        placeholder="NIE"
                                        title="NIE — Nº Identificación Escolar (SAUCE), opcional pero recomendable"
                                        className="!w-24 flex-shrink-0"
                                    />
                                    <AcneaeSelector
                                        selected={student.acneae}
                                        onChange={newTags => handleAcneaeChange(student.id, newTags)}
                                    />
                                    <button onClick={() => removeStudent(student.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-full flex-shrink-0">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex justify-end pt-4 space-x-2 border-t mt-4">
                    <Button type="button" variant="secondary" onClick={handleClose}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        onClick={handleSave}
                        disabled={students.length === 0}
                    >
                        Añadir {students.length > 0 ? `${students.length} ` : ''}Alumn@s
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default BulkAddStudentModal;
