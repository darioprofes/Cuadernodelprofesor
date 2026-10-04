import React, { useEffect, useRef, useState } from 'react';
import type { ClassData, Student } from '../types';
import { getNombreCompleto } from '../utils';
import { XMarkIcon, PencilIcon, CheckCircleIcon, PhotoIcon, UserCircleIcon, TableCellsIcon } from './Icons';
import { moveClassroomGroup, selectClassroomRectangle, snapClassroomPosition, type ClassroomPosition } from '../services/classroomLayout';
import { TYPOGRAPHY } from '../theme/typography';
import { SEMANTIC } from '../theme/palette';

interface PlanoClaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    classData: ClassData;
    materia: string;
    onUpdateMesaProfesor: (x: number, y: number) => Promise<void> | void;
    onUpdateStudentPosition: (studentId: string, x: number, y: number) => Promise<void> | void;
    onOpenFicha: (student: Student) => void;
}

const MESA_PROFESOR_ID = '__mesa_profesor__';
const CLAVE_MOSTRAR_FOTOS = 'planoClase.mostrarFotos';

// Persistido en localStorage (no por clase, es una preferencia general de
// visualización -- p.ej. para proyectar el plano sin mostrar caras) y no se
// resetea al cerrar el modal, a diferencia de editMode/draggingId/livePos
// (esos sí son estado transitorio de una sesión de edición concreta).
const leerMostrarFotos = (): boolean => {
    try {
        return localStorage.getItem(CLAVE_MOSTRAR_FOTOS) !== 'false';
    } catch {
        return true;
    }
};

// Portado del "plano de clase" del Profe Planner anterior (antes del cambio
// a este fork; ver /mnt/storage/docker/data/profe.bak-20260724-123414/js/
// sesion.js), con el mismo modelo (posiciones en % del lienzo, modo edición
// para arrastrar, casillas sin colocar con borde discontinuo hasta que se
// arrastran por primera vez), pero abriendo la ficha del alumno al hacer
// clic en vez del antiguo menú contextual de foto/color (eso ya se edita
// desde la propia ficha).
const PlanoClaseModal: React.FC<PlanoClaseModalProps> = ({ isOpen, onClose, classData, materia, onUpdateMesaProfesor, onUpdateStudentPosition, onOpenFicha }) => {
    const [editMode, setEditMode] = useState(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [livePos, setLivePos] = useState<Record<string, { x: number; y: number }>>({});
    const [mostrarFotos, setMostrarFotos] = useState(leerMostrarFotos);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [snapToGrid, setSnapToGrid] = useState(false);
    const [selectionBox, setSelectionBox] = useState<{ start: ClassroomPosition; end: ClassroomPosition } | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const movedRef = useRef(false);
    const dragRef = useRef<{ id: string; start: ClassroomPosition; positions: Record<string, ClassroomPosition>; current: Record<string, ClassroomPosition> } | null>(null);
    const boxRef = useRef<{ start: ClassroomPosition; end: ClassroomPosition; initial: Set<string> } | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setEditMode(false);
            setDraggingId(null);
            setLivePos({});
            setSelectedIds(new Set());
            setSelectionBox(null);
            dragRef.current = null;
            boxRef.current = null;
            setError(null);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, saving]);

    if (!isOpen) return null;

    const getDefaultPos = (index: number) => ({
        x: 10 + (index % 6) * 15,
        y: 20 + Math.floor(index / 6) * Math.min(20, 70 / Math.max(1, Math.floor((classData.students.length - 1) / 6))),
    });

    const getPos = (id: string, storedX: number | undefined, storedY: number | undefined, fallback: { x: number; y: number }) => {
        if (livePos[id]) return livePos[id];
        if (storedX != null && storedY != null) return { x: storedX, y: storedY };
        return fallback;
    };

    const studentPositions = () => Object.fromEntries(classData.students.map((student, index) =>
        [student.id, getPos(student.id, student.planoX, student.planoY, getDefaultPos(index))]));

    const canvasPoint = (e: React.PointerEvent): ClassroomPosition => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 };
    };

    const savePositions = async (positions: Record<string, ClassroomPosition>) => {
        setSaving(true);
        setError(null);
        const entries = Object.entries(positions);
        const results = await Promise.allSettled(entries.map(async ([id, pos]) =>
            id === MESA_PROFESOR_ID ? onUpdateMesaProfesor(pos.x, pos.y) : onUpdateStudentPosition(id, pos.x, pos.y)));
        const failed = entries.filter((_, index) => results[index].status === 'rejected').map(([id]) => id);
        if (failed.length) {
            setError(`No se pudieron guardar ${failed.length} posiciones. Inténtalo de nuevo.`);
            setLivePos(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !failed.includes(id))));
        }
        setSaving(false);
    };

    const handlePointerDown = (e: React.PointerEvent, id: string) => {
        if (!editMode || saving || e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const positions = studentPositions();
        const group = id === MESA_PROFESOR_ID ? [] : selectedIds.has(id) ? [...selectedIds] : [id];
        const origin = id === MESA_PROFESOR_ID
            ? { [id]: getPos(id, classData.mesaProfesorX, classData.mesaProfesorY, { x: 50, y: 6 }) }
            : Object.fromEntries(group.map(studentId => [studentId, positions[studentId]]));
        dragRef.current = { id, start: canvasPoint(e), positions: origin, current: origin };
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        movedRef.current = false;
        setDraggingId(id);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!canvasRef.current) return;
        if (boxRef.current) {
            const end = canvasPoint(e);
            boxRef.current.end = end;
            setSelectionBox({ start: boxRef.current.start, end });
            setSelectedIds(new Set([...boxRef.current.initial, ...selectClassroomRectangle(studentPositions(), boxRef.current.start, end)]));
            return;
        }
        const drag = dragRef.current;
        if (!drag) return;
        if (dragStartRef.current) {
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) movedRef.current = true;
        }
        if (!movedRef.current) return;
        if (drag.id !== MESA_PROFESOR_ID) setSelectedIds(new Set(Object.keys(drag.positions)));
        const point = canvasPoint(e);
        drag.current = moveClassroomGroup(drag.positions, drag.id, { x: point.x - drag.start.x, y: point.y - drag.start.y }, snapToGrid);
        setLivePos(prev => ({ ...prev, ...drag.current }));
    };

    const handlePointerUp = (id: string, student?: Student) => {
        if (draggingId !== id) return;
        const moved = movedRef.current;
        const drag = dragRef.current;
        dragRef.current = null;
        setDraggingId(null);
        dragStartRef.current = null;

        if (!moved) {
            if (student) setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
            });
            return;
        }
        if (drag) void savePositions(drag.current);
    };

    const alignToGrid = () => {
        const positions = studentPositions();
        const ids = selectedIds.size ? [...selectedIds] : Object.keys(positions);
        const aligned = Object.fromEntries(ids.map(id => [id, snapClassroomPosition(positions[id])]));
        setLivePos(prev => ({ ...prev, ...aligned }));
        void savePositions(aligned);
    };

    const cancelPointer = () => {
        const drag = dragRef.current;
        if (drag && movedRef.current) setLivePos(prev => ({ ...prev, ...drag.positions }));
        if (boxRef.current) setSelectedIds(boxRef.current.initial);
        dragRef.current = null;
        boxRef.current = null;
        setDraggingId(null);
        setSelectionBox(null);
    };

    const toggleMostrarFotos = () => {
        setMostrarFotos(prev => {
            const next = !prev;
            try { localStorage.setItem(CLAVE_MOSTRAR_FOTOS, String(next)); } catch { /* almacenamiento no disponible, se queda en memoria */ }
            return next;
        });
    };

    const mesaPos = getPos(MESA_PROFESOR_ID, classData.mesaProfesorX, classData.mesaProfesorY, { x: 50, y: 6 });

    const PLANO_COLOR_BG: Record<string, string> = {
        azul: '#dbeafe',
        rosa: '#fce7f3',
        verde: '#dcfce7',
    };

    return (
        <div className="fixed inset-0 z-40 bg-white flex flex-col">
            <div className="flex flex-wrap gap-2 items-center justify-between px-4 py-3 border-b flex-shrink-0">
                <h2 className={`${TYPOGRAPHY.sectionTitle} truncate`}>Plano de la clase — {materia}</h2>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={toggleMostrarFotos}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                        title={mostrarFotos ? 'Mostrar iconos en vez de fotos' : 'Mostrar fotos del alumnado'}
                    >
                        {mostrarFotos ? <UserCircleIcon className="w-4 h-4" /> : <PhotoIcon className="w-4 h-4" />}
                        {mostrarFotos ? 'Ver como iconos' : 'Ver fotos'}
                    </button>
                    <button
                        disabled={saving}
                        onClick={() => { setEditMode(v => !v); setSelectedIds(new Set()); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg ${editMode ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        {editMode ? <CheckCircleIcon className="w-4 h-4" /> : <PencilIcon className="w-4 h-4" />}
                        {editMode ? 'Terminar edición' : 'Editar'}
                    </button>
                    <button disabled={saving} onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" title="Cerrar">
                        <XMarkIcon className="w-5 h-5 text-slate-500" />
                    </button>
                </div>
            </div>

            {editMode && (
                <div className="flex flex-wrap items-center justify-center gap-3 px-3 py-2 text-xs border-b bg-slate-50">
                    <span>Clic para seleccionar varios o arrastra un recuadro. Arrastra un seleccionado para mover el grupo.</span>
                    <span className="font-semibold">{selectedIds.size} seleccionados</span>
                    <button disabled={saving || !classData.students.length} onClick={() => setSelectedIds(new Set(classData.students.map(student => student.id)))} className="text-blue-700 hover:underline">Seleccionar todos</button>
                    <button disabled={saving || !selectedIds.size} onClick={() => setSelectedIds(new Set())} className="text-blue-700 hover:underline">Deseleccionar</button>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={snapToGrid} disabled={saving} onChange={event => setSnapToGrid(event.target.checked)} />Ajustar al mover</label>
                    <button disabled={saving || !classData.students.length} onClick={alignToGrid} className="flex items-center gap-1 rounded-lg bg-slate-200 px-2 py-1 font-semibold hover:bg-slate-300"><TableCellsIcon className="h-4 w-4" />Alinear {selectedIds.size ? 'selección' : 'todos'} a cuadrícula</button>
                    {saving && <span role="status">Guardando posiciones…</span>}
                </div>
            )}
            {error && <p role="alert" className="bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div
                ref={canvasRef}
                className="relative flex-grow bg-slate-50 overflow-hidden touch-none"
                onPointerMove={handlePointerMove}
                onPointerDown={e => {
                    if (!editMode || saving || e.target !== e.currentTarget || e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const point = canvasPoint(e);
                    boxRef.current = { start: point, end: point, initial: e.shiftKey ? new Set(selectedIds) : new Set() };
                    setSelectionBox({ start: point, end: point });
                    if (!e.shiftKey) setSelectedIds(new Set());
                }}
                onPointerUp={() => { boxRef.current = null; setSelectionBox(null); }}
                onPointerCancel={cancelPointer}
                style={editMode ? { backgroundImage: 'linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)', backgroundSize: '5% 5%' } : undefined}
            >
                {/* Mesa del profesor */}
                <div
                    onPointerDown={(e) => handlePointerDown(e, MESA_PROFESOR_ID)}
                    onPointerUp={() => handlePointerUp(MESA_PROFESOR_ID)}
                    className={`absolute flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow whitespace-nowrap select-none ${editMode ? 'cursor-grab active:cursor-grabbing' : ''} ${draggingId === MESA_PROFESOR_ID ? 'opacity-80 z-20' : ''}`}
                    style={{ left: `${mesaPos.x}%`, top: `${mesaPos.y}%`, transform: 'translate(-50%, -50%)', touchAction: 'none', backgroundColor: SEMANTIC.primary.base }}
                >
                    🧑‍🏫 Mesa del profesor
                </div>

                {/* Alumnado */}
                {classData.students.map((s, index) => {
                    const pos = getPos(s.id, s.planoX, s.planoY, getDefaultPos(index));
                    const sinColocar = s.planoX == null;
                    const bg = s.planoColor ? PLANO_COLOR_BG[s.planoColor] : undefined;
                    return (
                        <div
                            key={s.id}
                            onPointerDown={(e) => handlePointerDown(e, s.id)}
                            onPointerUp={() => handlePointerUp(s.id, s)}
                            onClick={() => { if (!editMode) onOpenFicha(s); }}
                            title={getNombreCompleto(s)}
                            className={`absolute flex flex-col items-center w-16 select-none rounded-lg ${editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${editMode && selectedIds.has(s.id) ? 'ring-2 ring-blue-600 bg-blue-100/80' : ''} ${draggingId === s.id ? 'opacity-80 z-20' : ''}`}
                            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }}
                        >
                            {s.foto && mostrarFotos ? (
                                <img src={s.foto} alt="" className="w-[76px] h-[76px] rounded-full object-cover shadow pointer-events-none" />
                            ) : (
                                <div
                                    className={`w-[76px] h-[76px] rounded-full flex items-center justify-center text-3xl shadow pointer-events-none ${sinColocar ? 'border-2 border-dashed border-purple-300' : ''}`}
                                    style={{ backgroundColor: bg || '#ede9fe' }}
                                >
                                    🧑‍🎓
                                </div>
                            )}
                            <div className="mt-1 text-xs text-center bg-white px-1.5 py-0.5 rounded-md truncate max-w-[110px] shadow-sm pointer-events-none">
                                {getNombreCompleto(s)}
                            </div>
                        </div>
                    );
                })}
                {selectionBox && <div className="absolute pointer-events-none border-2 border-blue-500 bg-blue-200/30 z-30" style={{
                    left: `${Math.min(selectionBox.start.x, selectionBox.end.x)}%`, top: `${Math.min(selectionBox.start.y, selectionBox.end.y)}%`,
                    width: `${Math.abs(selectionBox.end.x - selectionBox.start.x)}%`, height: `${Math.abs(selectionBox.end.y - selectionBox.start.y)}%`,
                }} />}

                {classData.students.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                        Sin alumnado en esta clase todavía.
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlanoClaseModal;
