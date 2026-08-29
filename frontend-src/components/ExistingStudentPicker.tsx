import React, { useState, useMemo } from 'react';
import type { Student } from '../types';
import { getNombreCompleto } from '../utils';
import { MagnifyingGlassIcon, TrashIcon } from './Icons';
import Input from './Input';
import Button from './Button';
import Select from './Select';
import IconButton from './IconButton';

interface PickerStudent {
    id: string;
    nombre?: string;
    primerApellido?: string;
    segundoApellido?: string;
    importedAcademicYearId?: string;
    ultimoCursoSauce?: string;
    ultimaUnidadSauce?: string;
}

// Panel de "alumnado disponible" para matricular en la clase activa —
// solo tiene sentido en web (registro global de STUDENT propio del
// backend nuevo, ver plan "Fase 5 fusionada" bloque 5); en escritorio no
// hay tal registro aparte del embebido por clase, así que este bloque no
// se renderiza ahí.
//
// En GradebookTable.tsx vive detrás de un botón "+ Matricular alumn@ ya
// existente" (dentro de un Modal), no siempre visible en la pantalla del
// cuaderno -- se probó primero siempre visible para dejar claro que
// "Importar de SAUCE" no matricula por sí solo (solo rellena este
// listado), pero el usuario prefirió el cuaderno más limpio; esa
// aclaración se quedó como una frase dentro del propio modal.
//
// Por defecto solo se lista el alumnado importado (SAUCE) en el curso
// académico actual — el listado global crece con los años y mezclar ahí
// alumnado de cursos ya cerrados sería ruido. "Ver también alumnado de
// otros cursos" quita ese filtro. Si hay Curso/Unidad de SAUCE entre el
// alumnado visible, se pueden usar como filtro rápido; la selección
// múltiple + "Matricular N seleccionados" mueve de una vez a la clase
// activa (cambiar de clase activa recalcula qué sigue disponible aquí).
const ExistingStudentPicker: React.FC<{
    allStudents: PickerStudent[];
    alreadyEnrolledIds: Set<string>;
    currentYearId?: string;
    onEnroll: (studentId: string) => Promise<void> | void;
    // Borrado definitivo de la ficha (no solo desmatricular) — opcional
    // porque solo tiene sentido donde exista un registro global de
    // STUDENT propio (ver ClassManager.tsx). El backend ya rechaza el
    // borrado con un mensaje claro si la persona tiene matrículas en
    // cualquier clase/curso académico, así que aquí no hace falta
    // comprobarlo por adelantado — el mensaje de error lo cuenta.
    onDeleteStudent?: (studentId: string) => Promise<void> | void;
}> = ({ allStudents, alreadyEnrolledIds, currentYearId, onEnroll, onDeleteStudent }) => {
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
        // importedAcademicYearId solo lo rellena la importación de SAUCE
        // (ImportSauceStudentsModal.tsx) -- el alumnado añadido a mano
        // nunca lo tiene, así que sin este `!s.importedAcademicYearId`
        // quedaba invisible para siempre en cuanto se desmatriculaba de
        // cualquier clase (bug real, encontrado 2026-08-29): el filtro solo
        // debe descartar alumnado importado de OTRO curso, nunca alumnado
        // que simplemente no viene de SAUCE.
        return disponibles.filter(s => !s.importedAcademicYearId || s.importedAcademicYearId === currentYearId);
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

    const visibles = matches.slice(0, 60);

    const toggleSeleccionado = (id: string) => {
        setSeleccionados(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Solo sobre lo visible (lo filtrado y dentro del límite de 60) — no
    // tiene sentido seleccionar "todos" incluyendo coincidencias que ni
    // siquiera se están mostrando.
    const todosVisiblesSeleccionados = visibles.length > 0 && visibles.every(s => seleccionados.has(s.id));
    const toggleSeleccionarTodos = () => {
        setSeleccionados(prev => {
            if (todosVisiblesSeleccionados) {
                const next = new Set(prev);
                visibles.forEach(s => next.delete(s.id));
                return next;
            }
            return new Set([...prev, ...visibles.map(s => s.id)]);
        });
    };

    const handleEnrollSeleccionados = async () => {
        setMatriculando(true);
        for (const id of seleccionados) {
            await onEnroll(id);
        }
        setSeleccionados(new Set());
        setMatriculando(false);
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <Input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Buscar por nombre o apellidos…"
                    className="w-full"
                />
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

            {visibles.length > 0 && (
                <div className="flex items-center justify-between px-1">
                    <button type="button" onClick={toggleSeleccionarTodos} className="text-xs text-blue-600 hover:underline font-medium">
                        {todosVisiblesSeleccionados ? 'Deseleccionar todos' : `Seleccionar todos (${visibles.length})`}
                    </button>
                    {seleccionados.size > 0 && <span className="text-xs text-slate-400">{seleccionados.size} seleccionado(s)</span>}
                </div>
            )}

            <div className="space-y-1 max-h-96 overflow-y-auto">
                {visibles.length === 0 && (
                    <p className="text-xs text-slate-400 px-1 py-2">
                        {disponibles.length === 0 ? 'No hay alumnado disponible — importa desde SAUCE o añade alumnado nuevo.' : 'Sin coincidencias con este filtro.'}
                    </p>
                )}
                {visibles.map(s => (
                    <div key={s.id} className="flex items-center gap-2 bg-white p-2 rounded-md border text-sm">
                        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={seleccionados.has(s.id)}
                                onChange={() => toggleSeleccionado(s.id)}
                            />
                            <span className="flex-1 min-w-0 truncate" title={getNombreCompleto(s as Student)}>{getNombreCompleto(s as Student)}</span>
                            {(s.ultimoCursoSauce || s.ultimaUnidadSauce) && (
                                <span
                                    className="text-xs text-slate-400 truncate max-w-[40%] flex-shrink"
                                    title={[s.ultimoCursoSauce, s.ultimaUnidadSauce].filter(Boolean).join(' / ')}
                                >
                                    {[s.ultimoCursoSauce, s.ultimaUnidadSauce].filter(Boolean).join(' / ')}
                                </span>
                            )}
                        </label>
                        {onDeleteStudent && (
                            <IconButton
                                label="Borrar ficha definitivamente"
                                tone="danger"
                                size="sm"
                                onClick={() => onDeleteStudent(s.id)}
                            >
                                <TrashIcon className="w-4 h-4" />
                            </IconButton>
                        )}
                    </div>
                ))}
                {matches.length > visibles.length && (
                    <p className="text-xs text-slate-400 px-1">…y {matches.length - visibles.length} más — acota la búsqueda para verlos.</p>
                )}
            </div>

            {seleccionados.size > 0 && (
                <div className="flex justify-end pt-1 border-t">
                    <Button variant="primary" onClick={handleEnrollSeleccionados} disabled={matriculando}>
                        {matriculando ? 'Matriculando…' : `Matricular ${seleccionados.size} seleccionado(s) →`}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default ExistingStudentPicker;
