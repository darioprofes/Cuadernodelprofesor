import React, { useState } from 'react';
import type { Shortcut } from '../types';
import { PlusIcon, PencilIcon, XMarkIcon, CheckCircleIcon } from './Icons';
import ShortcutModal from './ShortcutModal';
import { openExternalLink } from '../utils';

interface ShortcutsBarProps {
    shortcuts: Shortcut[];
    onCreate: (data: Omit<Shortcut, 'id'>) => void;
    onUpdate: (id: string, data: Omit<Shortcut, 'id'>) => void;
    onDelete: (id: string) => void;
}

// Fila de accesos directos solo-icono (con tooltip al pasar por encima),
// inspirada en las secciones de enlaces editables del panel ("La
// Marejada"), pero autocontenida aquí: los iconos viven en
// public/shortcut-icons/. El listado se persiste vía onCreate/onUpdate/
// onDelete, granulares (backend propio en web; blob local en escritorio,
// ver App.tsx) — este componente no conoce cuál de los dos es.
const ShortcutsBar: React.FC<ShortcutsBarProps> = ({ shortcuts, onCreate, onUpdate, onDelete }) => {
    const [editMode, setEditMode] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [shortcutToEdit, setShortcutToEdit] = useState<Shortcut | null>(null);

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

    return (
        <div className="flex items-center gap-1 flex-wrap">
            {shortcuts.map(s => (
                <div key={s.id} className="relative">
                    {editMode ? (
                        <button
                            type="button"
                            onClick={() => handleOpenEdit(s)}
                            title={s.label}
                            className="w-8 h-8 rounded-lg border border-dashed border-slate-300 flex items-center justify-center hover:bg-slate-100 overflow-hidden"
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
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 overflow-hidden"
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
                    className="w-8 h-8 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                >
                    <PlusIcon className="w-4 h-4" />
                </button>
            )}

            <button
                type="button"
                onClick={() => setEditMode(v => !v)}
                title={editMode ? 'Terminar de editar' : 'Editar accesos directos'}
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${editMode ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
            >
                {editMode ? <CheckCircleIcon className="w-4 h-4" /> : <PencilIcon className="w-4 h-4" />}
            </button>

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
        <span className="w-5 h-5 rounded-full bg-slate-300 text-white text-[10px] font-bold flex items-center justify-center pointer-events-none">
            {shortcut.label.charAt(0).toUpperCase()}
        </span>
    );
};

export default ShortcutsBar;
