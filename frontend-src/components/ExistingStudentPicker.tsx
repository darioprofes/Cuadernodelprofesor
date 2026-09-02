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

interface NivelGrupo {
    nivel: string;
    grupo: string;
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
    // Nivel/grupo REALES por alumno, derivados de sus matrículas de verdad
    // en otras clases (ver ClassManager.tsx/GradebookTable.tsx) -- a
    // diferencia de ultimoCursoSauce/ultimaUnidadSauce (que SOLO rellena
    // ImportSauceStudentsModal.tsx), esto cubre también al alumnado
    // añadido a mano/en lote. Ambas fuentes alimentan el mismo filtro de
    // Nivel/Grupo más abajo -- petición explícita del usuario: con mucho
    // alumnado añadido a mano en varias clases, no había forma de
    // encontrar "a quién tengo ya en 1º ESO A" para matricularlo también
    // en una clase nueva.
    nivelesGruposByStudentId?: Map<string, NivelGrupo[]>;
    onEnroll: (studentId: string) => Promise<void> | void;
    // Borrado definitivo de ficha(s) (no solo desmatricular) — opcional
    // porque solo tiene sentido donde exista un registro global de
    // STUDENT propio (ver ClassManager.tsx). Un único id sirve tanto para
    // el icono de papelera de una fila como para "Eliminar seleccionados";
    // el llamante decide qué hacer con quien siga matriculado en otra
    // clase (preguntar si desmatricular también, o dejarlo tal cual).
    onDeleteStudents?: (studentIds: string[]) => Promise<void> | void;
}> = ({ allStudents, alreadyEnrolledIds, currentYearId, nivelesGruposByStudentId, onEnroll, onDeleteStudents }) => {
    const [query, setQuery] = useState('');
    const [verTodos, setVerTodos] = useState(false);
    const [filtroCurso, setFiltroCurso] = useState('');
    const [filtroUnidad, setFiltroUnidad] = useState('');
    const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
    const [matriculando, setMatriculando] = useState(false);
    const [borrando, setBorrando] = useState(false);

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

    // Combina el nivel/grupo real (de matrículas de verdad en otras
    // clases) con el de SAUCE (ultimoCursoSauce/ultimaUnidadSauce) en una
    // única lista por alumno -- el mismo filtro de abajo sirve para las
    // dos fuentes, sin que el profesor tenga que saber de cuál viene cada
    // dato.
    const nivelesGruposDe = (s: PickerStudent): NivelGrupo[] => {
        const real = nivelesGruposByStudentId?.get(s.id) ?? [];
        if (!s.ultimoCursoSauce && !s.ultimaUnidadSauce) return real;
        const sauce: NivelGrupo = { nivel: s.ultimoCursoSauce || '', grupo: s.ultimaUnidadSauce || '' };
        const yaExiste = real.some(r => r.nivel === sauce.nivel && r.grupo === sauce.grupo);
        return yaExiste ? real : [...real, sauce];
    };

    // Los desplegables de Nivel/Grupo solo aparecen si hay algo que
    // filtrar (de SAUCE o de matrículas reales en otras clases) — si no
    // hay nada todavía, no tiene sentido mostrar un filtro vacío.
    const cursosDisponibles = useMemo(
        () => Array.from(new Set(enAmbito.flatMap(s => nivelesGruposDe(s)).map(ng => ng.nivel).filter(Boolean))).sort(),
        [enAmbito, nivelesGruposByStudentId]
    );
    const unidadesDisponibles = useMemo(
        () => Array.from(new Set(
            enAmbito
                .flatMap(s => nivelesGruposDe(s))
                .filter(ng => !filtroCurso || ng.nivel === filtroCurso)
                .map(ng => ng.grupo)
                .filter(Boolean)
        )).sort(),
        [enAmbito, filtroCurso, nivelesGruposByStudentId]
    );

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        return enAmbito
            .filter(s => !filtroCurso || nivelesGruposDe(s).some(ng => ng.nivel === filtroCurso))
            .filter(s => !filtroUnidad || nivelesGruposDe(s).some(ng => ng.grupo === filtroUnidad))
            .filter(s => !q || `${s.nombre ?? ''} ${s.primerApellido ?? ''} ${s.segundoApellido ?? ''}`.toLowerCase().includes(q));
    }, [enAmbito, query, filtroCurso, filtroUnidad, nivelesGruposByStudentId]);

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

    const handleDeleteSeleccionados = async () => {
        if (!onDeleteStudents) return;
        setBorrando(true);
        await onDeleteStudents(Array.from(seleccionados));
        setSeleccionados(new Set());
        setBorrando(false);
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
                        <option value="">Nivel: todos</option>
                        {cursosDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                    </Select>
                    <Select value={filtroUnidad} onChange={e => setFiltroUnidad(e.target.value)} className="text-xs">
                        <option value="">Grupo: todos</option>
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
                            {(() => {
                                const etiquetas = nivelesGruposDe(s).map(ng => [ng.nivel, ng.grupo].filter(Boolean).join(' '));
                                if (etiquetas.length === 0) return null;
                                const texto = etiquetas.join(', ');
                                return (
                                    <span className="text-xs text-slate-400 truncate max-w-[40%] flex-shrink" title={texto}>
                                        {texto}
                                    </span>
                                );
                            })()}
                        </label>
                        {onDeleteStudents && (
                            <IconButton
                                label="Borrar ficha definitivamente"
                                tone="danger"
                                size="sm"
                                onClick={() => onDeleteStudents([s.id])}
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
                <div className="flex justify-end items-center gap-2 pt-1 border-t">
                    {onDeleteStudents && (
                        <Button variant="danger" onClick={handleDeleteSeleccionados} disabled={borrando || matriculando}>
                            {borrando ? 'Eliminando…' : `Eliminar ${seleccionados.size} seleccionado(s)`}
                        </Button>
                    )}
                    <Button variant="primary" onClick={handleEnrollSeleccionados} disabled={matriculando || borrando}>
                        {matriculando ? 'Matriculando…' : `Matricular ${seleccionados.size} seleccionado(s) →`}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default ExistingStudentPicker;
