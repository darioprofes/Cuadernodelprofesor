import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import Textarea from './Textarea';

interface CalendarNoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (texto: string) => void;
    selectedDate: Date;
}

// Nota libre para un día de la agenda: no es evaluable ni está ligada a
// ninguna clase, solo texto (AgendaNote, distinta de las tareas
// personales de "Hoy" aunque antes compartían almacenamiento).
const CalendarNoteModal: React.FC<CalendarNoteModalProps> = ({ isOpen, onClose, onSave, selectedDate }) => {
    const [texto, setTexto] = useState('');

    useEffect(() => {
        if (isOpen) setTexto('');
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!texto.trim()) return;
        onSave(texto.trim());
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Nueva nota para el ${selectedDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`} size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <Textarea
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    placeholder="Escribe aquí lo que quieras recordar ese día (no es una tarea calificable ni un examen)..."
                    className="min-h-[6rem]"
                    autoFocus
                    required
                />
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" variant="primary">Guardar Nota</Button>
                </div>
            </form>
        </Modal>
    );
};

export default CalendarNoteModal;
