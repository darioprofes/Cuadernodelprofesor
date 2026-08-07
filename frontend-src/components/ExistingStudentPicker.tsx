import React, { useState, useMemo } from 'react';
import type { Student } from '../types';
import { getNombreCompleto } from '../utils';
import { MagnifyingGlassIcon } from './Icons';
import Input from './Input';
import Button from './Button';

// Búsqueda y matrícula de un alumno ya existente en otra clase — solo tiene
// sentido en web (registro global de STUDENT propio del backend nuevo, ver
// plan "Fase 5 fusionada" bloque 5); en escritorio no hay tal registro
// aparte del embebido por clase, así que este bloque no se renderiza ahí.
const ExistingStudentPicker: React.FC<{
    allStudents: { id: string; nombre?: string; primerApellido?: string; segundoApellido?: string }[];
    alreadyEnrolledIds: Set<string>;
    onEnroll: (studentId: string) => void;
}> = ({ allStudents, alreadyEnrolledIds, onEnroll }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return allStudents
            .filter(s => !alreadyEnrolledIds.has(s.id))
            .filter(s => `${s.nombre ?? ''} ${s.primerApellido ?? ''} ${s.segundoApellido ?? ''}`.toLowerCase().includes(q))
            .slice(0, 8);
    }, [allStudents, alreadyEnrolledIds, query]);

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="w-full text-center py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 bg-white rounded-md border border-slate-200 shadow-sm">
                Matricular alumn@ ya existente
            </button>
        );
    }

    return (
        <div className="p-3 border border-slate-200 rounded-md bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2">
                <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <Input
                    type="text"
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Buscar por nombre o apellidos…"
                    className="w-full"
                />
                <button onClick={() => { setOpen(false); setQuery(''); }} className="text-xs text-slate-500 hover:text-slate-700 flex-shrink-0">Cerrar</button>
            </div>
            {query.trim() && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                    {matches.length === 0 && <p className="text-xs text-slate-400 px-1 py-1">Sin coincidencias.</p>}
                    {matches.map(s => (
                        <div key={s.id} className="flex items-center justify-between bg-white p-2 rounded-md border text-sm">
                            <span>{getNombreCompleto(s as Student)}</span>
                            <Button variant="secondary" onClick={() => { onEnroll(s.id); setQuery(''); }}>Matricular</Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ExistingStudentPicker;
