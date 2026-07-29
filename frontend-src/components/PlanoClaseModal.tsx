import React, { useEffect, useRef, useState } from 'react';
import type { ClassData, Student } from '../types';
import { XMarkIcon, PencilIcon, CheckCircleIcon } from './Icons';
import { TYPOGRAPHY } from '../theme/typography';
import { SEMANTIC } from '../theme/palette';

interface PlanoClaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    classData: ClassData;
    materia: string;
    onUpdateClass: (updated: ClassData) => void;
    onOpenFicha: (student: Student) => void;
}

const MESA_PROFESOR_ID = '__mesa_profesor__';

// Portado del "plano de clase" del Profe Planner anterior (antes del cambio
// a este fork; ver /mnt/storage/docker/data/profe.bak-20260724-123414/js/
// sesion.js), con el mismo modelo (posiciones en % del lienzo, modo edición
// para arrastrar, casillas sin colocar con borde discontinuo hasta que se
// arrastran por primera vez), pero abriendo la ficha del alumno al hacer
// clic en vez del antiguo menú contextual de foto/color (eso ya se edita
// desde la propia ficha).
const PlanoClaseModal: React.FC<PlanoClaseModalProps> = ({ isOpen, onClose, classData, materia, onUpdateClass, onOpenFicha }) => {
    const [editMode, setEditMode] = useState(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [livePos, setLivePos] = useState<Record<string, { x: number; y: number }>>({});
    const canvasRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const movedRef = useRef(false);

    useEffect(() => {
        if (!isOpen) {
            setEditMode(false);
            setDraggingId(null);
            setLivePos({});
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const getDefaultPos = (index: number) => ({
        x: 10 + (index % 6) * 15,
        y: 20 + Math.floor(index / 6) * 20,
    });

    const getPos = (id: string, storedX: number | undefined, storedY: number | undefined, fallback: { x: number; y: number }) => {
        if (livePos[id]) return livePos[id];
        if (storedX != null && storedY != null) return { x: storedX, y: storedY };
        return fallback;
    };

    const handlePointerDown = (e: React.PointerEvent, id: string) => {
        if (!editMode) return;
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        movedRef.current = false;
        setDraggingId(id);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!draggingId || !canvasRef.current) return;
        if (dragStartRef.current) {
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) movedRef.current = true;
        }
        const rect = canvasRef.current.getBoundingClientRect();
        let x = ((e.clientX - rect.left) / rect.width) * 100;
        let y = ((e.clientY - rect.top) / rect.height) * 100;
        x = Math.max(2, Math.min(98, x));
        y = Math.max(4, Math.min(96, y));
        setLivePos(prev => ({ ...prev, [draggingId]: { x, y } }));
    };

    const handlePointerUp = (id: string, student?: Student) => {
        if (draggingId !== id) return;
        const moved = movedRef.current;
        const pos = livePos[id];
        setDraggingId(null);
        dragStartRef.current = null;

        if (!moved) {
            // Clic sin arrastrar: abre la ficha (solo para alumnos, la mesa
            // del profesor no tiene ficha).
            if (student) onOpenFicha(student);
            return;
        }
        if (!pos) return;
        if (id === MESA_PROFESOR_ID) {
            onUpdateClass({ ...classData, mesaProfesorX: pos.x, mesaProfesorY: pos.y });
        } else {
            onUpdateClass({
                ...classData,
                students: classData.students.map(s => s.id === id ? { ...s, planoX: pos.x, planoY: pos.y } : s),
            });
        }
    };

    const mesaPos = getPos(MESA_PROFESOR_ID, classData.mesaProfesorX, classData.mesaProfesorY, { x: 50, y: 6 });

    const PLANO_COLOR_BG: Record<string, string> = {
        azul: '#dbeafe',
        rosa: '#fce7f3',
        verde: '#dcfce7',
    };

    return (
        <div className="fixed inset-0 z-40 bg-white flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
                <h2 className={`${TYPOGRAPHY.sectionTitle} truncate`}>Plano de la clase — {materia}</h2>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={() => setEditMode(v => !v)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg ${editMode ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        {editMode ? <CheckCircleIcon className="w-4 h-4" /> : <PencilIcon className="w-4 h-4" />}
                        {editMode ? 'Terminar edición' : 'Editar'}
                    </button>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" title="Cerrar">
                        <XMarkIcon className="w-5 h-5 text-slate-500" />
                    </button>
                </div>
            </div>

            {editMode && (
                <p className="text-xs text-center text-slate-400 py-1 flex-shrink-0 border-b bg-slate-50">
                    Arrastra a cada alumno/a y la mesa del profesor a su sitio. Sin arrastrar, un clic abre la ficha.
                </p>
            )}

            <div
                ref={canvasRef}
                className="relative flex-grow bg-slate-50 overflow-hidden touch-none"
                onPointerMove={handlePointerMove}
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
                            title={s.name}
                            className={`absolute flex flex-col items-center w-16 select-none ${editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${draggingId === s.id ? 'opacity-80 z-20' : ''}`}
                            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }}
                        >
                            {s.foto ? (
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
                                {s.name}
                            </div>
                        </div>
                    );
                })}

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
