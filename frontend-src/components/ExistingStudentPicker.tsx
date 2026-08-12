import React, { useState, useMemo } from 'react';
import type { Student } from '../types';
import { getNombreCompleto } from '../utils';
import { MagnifyingGlassIcon } from './Icons';
import Input from './Input';
import Button from './Button';
import Select from './Select';

interface PickerStudent {
    id: string;
    nombre?: string;
    primerApellido?: string;
    segundoApellido?: string;
    importedAcademicYearId?: string;
    ultimoCursoSauce?: string;
    ultimaUnidadSauce?: string;
}

// Búsqueda y matrícula de un alumno ya existente en otra clase — solo tiene
// sentido en web (registro global de STUDENT propio del backend nuevo, ver
// plan "Fase 5 fusionada" bloque 5); en escritorio no hay tal registro
// aparte del embebido por clase, así que este bloque no se renderiza ahí.
//
// Por defecto solo se busca entre el alumnado importado (SAUCE) en el
// curso académico actual — el listado global crece con los años y mezclar
// ahí alumnado de cursos ya cerrados hacía la búsqueda por nombre lenta y
// ruidosa. "Ver también alumnado de otros cursos" quita ese filtro. Si hay
// Curso/Unidad de SAUCE en el alumnado visible, se pueden usar como filtro
// rápido y matricular varios a la vez — pedido explícito del usuario para
// no tener que ir alumno a alumno buscando por nombre.
const ExistingStudentPicker: React.FC<{
    allStudents: PickerStudent[];
    alreadyEnrolledIds: Set<string>;
    currentYearId?: string;
    onEnroll: (studentId: string) => Promise<void> | void;
}> = ({ allStudents, alreadyEnrolledIds, currentYearId, onEnroll }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [verTodos, setVerTodos] = useState(false);
    const [filtroCurso, setFiltroCurso] = useState('');
    const [filtroUnidad, setFiltroUnidad] = useState('');
    const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
    const [matriculando, setMatriculando] = useState(false);

    const disponibles = useMemo(
        () => allStudents.filter(s => !alreadyEnrolledIds.has(s.id)),
        [allStudents, alreadyEnrolledIds]
    );

    const enAmbito = useMemo(() => {
        if (verTodos || !currentYearId) return disponibles;
        return disponibles.filter(s => s.importedAcademicYearId === currentYearId);
    }, [disponibles, verTodos, currentYearId]);

    // Los desplegables de Curso/Unidad solo aparecen si hay datos de SAUCE
    // que filtrar — si nadie se importó así todavía, no tiene sentido
    // mostrar un filtro vacío.
    const cursosDisponibles = useMemo(
        () => Array.from(new Set(enAmbito.map(s => s.ultimoCursoSauce).filter((c): c is string => !!c))).sort(),
        [enAmbito]
    );
    const unidadesDisponibles = useMemo(
        () => Array.from(new Set(
            enAmbito
                .filter(s => !filtroCurso || s.ultimoCursoSauce === filtroCurso)
                .map(s => s.ultimaUnidadSauce)
                .filter((u): u is string => !!u)
        )).sort(),
        [enAmbito, filtroCurso]
    );

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        return enAmbito
            .filter(s => !filtroCurso || s.ultimoCursoSauce === filtroCurso)
            .filter(s => !filtroUnidad || s.ultimaUnidadSauce === filtroUnidad)
            .filter(s => !q || `${s.nombre ?? ''} ${s.primerApellido ?? ''} ${s.segundoApellido ?? ''}`.toLowerCase().includes(q));
    }, [enAmbito, query, filtroCurso, filtroUnidad]);

    // Sin ningún filtro activo (ni texto ni Curso/Unidad) no se lista nada
    // — la lista completa del curso podría ser larga, y hasta que no se
    // acota por algo no aporta mostrarla entera.
    const hayFiltroActivo = query.trim() !== '' || filtroCurso !== '' || filtroUnidad !== '';
    const visibles = hayFiltroActivo ? matches.slice(0, 40) : [];

    const toggleSeleccionado = (id: string) => {
        setSeleccionados(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleClose = () => {
        setOpen(false);
        setQuery('');
        setFiltroCurso('');
        setFiltroUnidad('');
        setSeleccionados(new Set());
    };

    const handleEnrollOne = async (id: string) => {
        await onEnroll(id);
        setSeleccionados(prev => { const next = new Set(prev); next.delete(id); return next; });
    };

    const handleEnrollSeleccionados = async () => {
        setMatriculando(true);
        for (const id of seleccionados) {
            await onEnroll(id);
        }
        setSeleccionados(new Set());
        setMatriculando(false);
    };

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
                <button onClick={handleClose} className="text-xs text-slate-500 hover:text-slate-700 flex-shrink-0">Cerrar</button>
            </div>

            {currentYearId && (
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    <input type="checkbox" checked={verTodos} onChange={e => { setVerTodos(e.target.checked); setFiltroCurso(''); setFiltroUnidad(''); }} />
                    Ver también alumnado de otros cursos académicos
                </label>
            )}

            {cursosDisponibles.length > 0 && (
                <div className="flex items-center gap-2">
                    <Select value={filtroCurso} onChange={e => { setFiltroCurso(e.target.value); setFiltroUnidad(''); }} className="text-xs">
                        <option value="">Curso (SAUCE): todos</option>
                        {cursosDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                    </Select>
                    <Select value={filtroUnidad} onChange={e => setFiltroUnidad(e.target.value)} className="text-xs">
                        <option value="">Unidad (SAUCE): todas</option>
                        {unidadesDisponibles.map(u => <option key={u} value={u}>{u}</option>)}
                    </Select>
                </div>
            )}

            {hayFiltroActivo && (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                    {visibles.length === 0 && <p className="text-xs text-slate-400 px-1 py-1">Sin coincidencias.</p>}
                    {visibles.map(s => (
                        <label key={s.id} className="flex items-center gap-2 bg-white p-2 rounded-md border text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                checked={seleccionados.has(s.id)}
                                onChange={() => toggleSeleccionado(s.id)}
                            />
                            <span className="flex-1">{getNombreCompleto(s as Student)}</span>
                            {(s.ultimoCursoSauce || s.ultimaUnidadSauce) && (
                                <span className="text-xs text-slate-400">{[s.ultimoCursoSauce, s.ultimaUnidadSauce].filter(Boolean).join(' / ')}</span>
                            )}
                            <Button variant="secondary" onClick={() => handleEnrollOne(s.id)}>Matricular</Button>
                        </label>
                    ))}
                    {matches.length > visibles.length && (
                        <p className="text-xs text-slate-400 px-1">…y {matches.length - visibles.length} más — acota la búsqueda para verlos.</p>
                    )}
                </div>
            )}

            {seleccionados.size > 0 && (
                <div className="flex justify-end pt-1 border-t">
                    <Button variant="primary" onClick={handleEnrollSeleccionados} disabled={matriculando}>
                        {matriculando ? 'Matriculando…' : `Matricular ${seleccionados.size} seleccionado(s)`}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default ExistingStudentPicker;
