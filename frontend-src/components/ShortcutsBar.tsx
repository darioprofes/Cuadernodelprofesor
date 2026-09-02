import React, { useEffect, useRef, useState } from 'react';
import type { Shortcut } from '../types';
import { LinkIcon, PlusIcon, XMarkIcon } from './Icons';
import ShortcutModal from './ShortcutModal';
import { openExternalLink } from '../utils';
import { SIDEBAR_BG } from '../theme/palette';

interface ShortcutsBarProps {
    shortcuts: Shortcut[];
    onCreate: (data: Omit<Shortcut, 'id'>) => void;
    onUpdate: (id: string, data: Omit<Shortcut, 'id'>) => void;
    onDelete: (id: string) => void;
}

// Segundo diseño, pedido explícito del usuario: en vez de una fila con
// todos los iconos siempre visibles + un lápiz de editar aparte, un único
// icono de enlace ("disparador") que al pulsarlo despliega el resto --
// clic normal enseña/oculta, clic derecho entra/sale de edición (ya no
// hace falta un icono de lápiz separado). En pantallas anchas se
// despliegan en la misma fila, hacia la izquierda del disparador (que se
// queda fijo junto al perfil/ajustes en App.tsx); en pantallas estrechas,
// sin sitio para desplegar en la fila, caen en un dropdown flotante bajo
// el disparador. Los iconos viven en public/shortcut-icons/. El listado
// se persiste vía onCreate/onUpdate/onDelete, granulares (backend propio
// en web; blob local en escritorio, ver App.tsx) — este componente no
// conoce cuál de los dos es.
const ShortcutsBar: React.FC<ShortcutsBarProps> = ({ shortcuts, onCreate, onUpdate, onDelete }) => {
    const [expanded, setExpanded] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [shortcutToEdit, setShortcutToEdit] = useState<Shortcut | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!expanded) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setExpanded(false);
                setEditMode(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [expanded]);

    const handleOpenAdd = () => {
        setShortcutToEdit(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (s: Shortcut) => {
        setShortcutToEdit(s);
        setIsModalOpen(true);
    };

    const handleSave = (data: Omit<Shortcut, 'id'>) => {
        if (shortcutToEdit) {
            onUpdate(shortcutToEdit.id, data);
        } else {
            onCreate(data);
        }
        setIsModalOpen(false);
    };

    const handleDelete = (id: string) => {
        onDelete(id);
    };

    const handleTriggerContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setExpanded(true);
        setEditMode(v => !v);
    };

    const renderShortcutItems = () => (
        <>
            {shortcuts.map(s => (
                <div key={s.id} className="relative flex-shrink-0">
                    {editMode ? (
                        <button
                            type="button"
                            onClick={() => handleOpenEdit(s)}
                            title={s.label}
                            className="w-8 h-8 rounded-lg border border-dashed border-white/20 flex items-center justify-center hover:bg-white/10 overflow-hidden"
                        >
                            <ShortcutIcon shortcut={s} />
                        </button>
                    ) : (
                        <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => openExternalLink(e, s.url)}
                            title={s.label}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 overflow-hidden"
                        >
                            <ShortcutIcon shortcut={s} />
                        </a>
                    )}
                    {editMode && (
                        <button
                            type="button"
                            onClick={() => handleDelete(s.id)}
                            title="Eliminar"
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                        >
                            <XMarkIcon className="w-3 h-3" />
                        </button>
                    )}
                </div>
            ))}
            {editMode && (
                <button
                    type="button"
                    onClick={handleOpenAdd}
                    title="Añadir acceso directo"
                    className="w-8 h-8 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-white hover:bg-white/10 flex-shrink-0"
                >
                    <PlusIcon className="w-4 h-4" />
                </button>
            )}
        </>
    );

    return (
        <div className="relative flex items-center" ref={wrapperRef}>
            {/* Pantallas anchas: se despliegan en la misma fila, a la
                izquierda del disparador (van ANTES en el DOM a propósito,
                sin flex-row-reverse, para que "a la izquierda" salga
                gratis del propio orden). */}
            {expanded && (
                <div className="hidden sm:flex items-center gap-1 mr-1">
                    {renderShortcutItems()}
                </div>
            )}

            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                onContextMenu={handleTriggerContextMenu}
                title={editMode ? 'Clic: mostrar/ocultar — botón derecho: terminar de editar' : 'Accesos directos (clic derecho para editar)'}
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${editMode ? 'bg-white/20 text-white' : expanded ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
            >
                <LinkIcon className="w-4 h-4" />
            </button>

            {/* Pantallas estrechas: sin sitio para desplegar en la fila,
                dropdown flotante bajo el disparador. */}
            {expanded && (
                <div className="sm:hidden absolute right-0 top-full mt-1 z-30 rounded-lg shadow-lg border border-white/10 p-1.5 flex flex-wrap gap-1 w-40" style={{ backgroundColor: SIDEBAR_BG }}>
                    {renderShortcutItems()}
                </div>
            )}

            <ShortcutModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                shortcutToEdit={shortcutToEdit}
            />
        </div>
    );
};

const ShortcutIcon: React.FC<{ shortcut: Shortcut }> = ({ shortcut }) => {
    if (shortcut.icon) {
        return <img src={shortcut.icon} alt="" className="w-5 h-5 object-contain pointer-events-none" />;
    }
    return (
        <span className="w-5 h-5 rounded-full border border-white/70 text-white text-[10px] font-bold flex items-center justify-center pointer-events-none">
            {shortcut.label.charAt(0).toUpperCase()}
        </span>
    );
};

export default ShortcutsBar;
