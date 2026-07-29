import React, { useState, useEffect, useMemo } from 'react';
import type { Shortcut } from '../types';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import IconPicker, { type IconPickerOption } from './IconPicker';

interface ShortcutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Omit<Shortcut, 'id'>) => void;
    shortcutToEdit: Shortcut | null;
}

// Iconos ya empaquetados con la app (copiados de la sección "Trabajo" del
// panel); alternativa rápida a subir un icono propio.
const BUNDLED_ICONS = [
    '/shortcut-icons/teams.svg',
    '/shortcut-icons/onedrive-c89ba2.svg',
    '/shortcut-icons/outlook.svg',
    '/shortcut-icons/nextcloud.svg',
    '/shortcut-icons/notes-ad1424.svg',
    '/shortcut-icons/noto-1f4d4.svg',
    '/shortcut-icons/lucide-user-x-2b6eda.svg',
    '/shortcut-icons/sauce.svg',
    '/shortcut-icons/educastur.svg',
    '/shortcut-icons/copilot.svg',
];

const ShortcutModal: React.FC<ShortcutModalProps> = ({ isOpen, onClose, onSave, shortcutToEdit }) => {
    const [label, setLabel] = useState('');
    const [url, setUrl] = useState('');
    const [icon, setIcon] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (isOpen) {
            setLabel(shortcutToEdit?.label || '');
            setUrl(shortcutToEdit?.url || '');
            setIcon(shortcutToEdit?.icon);
        }
    }, [isOpen, shortcutToEdit]);

    const iconOptions: IconPickerOption[] = useMemo(() => BUNDLED_ICONS.map(src => ({
        key: src,
        label: src,
        render: (className: string) => <img src={src} alt="" className={className} />,
    })), []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!label.trim() || !url.trim()) return;
        onSave({ label: label.trim(), url: url.trim(), icon });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={shortcutToEdit ? 'Editar acceso directo' : 'Nuevo acceso directo'} size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700">Nombre</label>
                    <Input
                        type="text" value={label} onChange={e => setLabel(e.target.value)}
                        className="mt-1" required autoFocus
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">URL</label>
                    <Input
                        type="url" value={url} onChange={e => setUrl(e.target.value)}
                        placeholder="https://..."
                        className="mt-1" required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Icono</label>
                    <IconPicker
                        value={icon}
                        onChange={setIcon}
                        options={iconOptions}
                        uploadLabel="Subir icono propio"
                        fallbackPreview={<span className="w-6 h-6 rounded-full bg-slate-300 text-white text-xs font-bold flex items-center justify-center">{label.charAt(0).toUpperCase() || '?'}</span>}
                    />
                </div>
                <div className="flex justify-end pt-4 space-x-2 border-t">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" variant="primary">Guardar</Button>
                </div>
            </form>
        </Modal>
    );
};

export default ShortcutModal;
