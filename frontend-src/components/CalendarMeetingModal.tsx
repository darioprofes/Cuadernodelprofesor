import React, { useState, useEffect } from 'react';
import type { Meeting } from '../types';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';

interface CalendarMeetingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Omit<Meeting, 'id'>) => void;
    selectedDate: Date;
}

const toYYYYMMDD = (date: Date): string => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// Apuntar una reunión programada desde la Agenda: solo lo que se suele saber
// de antemano (tipo, con quién, motivo). Acuerdos/seguimiento se completan
// después de que la reunión tenga lugar, desde Reuniones (ya editable).
const CalendarMeetingModal: React.FC<CalendarMeetingModalProps> = ({ isOpen, onClose, onSave, selectedDate }) => {
    const [fecha, setFecha] = useState<string>(() => toYYYYMMDD(selectedDate));
    const [hora, setHora] = useState('');
    const [tipo, setTipo] = useState<Meeting['tipo']>('tutoria');
    const [conQuien, setConQuien] = useState('');
    const [motivo, setMotivo] = useState('');

    useEffect(() => {
        if (isOpen) {
            setFecha(toYYYYMMDD(selectedDate));
            setHora('');
            setTipo('tutoria');
            setConQuien('');
            setMotivo('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            fecha,
            hora: hora || undefined,
            tipo,
            conQuien: conQuien.trim() || undefined,
            motivo: motivo.trim() || undefined,
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nueva reunión" size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-medium text-slate-600">Fecha</label>
                        <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="mt-1" required />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Hora</label>
                        <Input type="time" value={hora} onChange={e => setHora(e.target.value)} className="mt-1" />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-600">Tipo</label>
                    <Select value={tipo} onChange={e => setTipo(e.target.value as Meeting['tipo'])} className="mt-1">
                        <option value="tutoria">Tutoría</option>
                        <option value="r_tutores">R. Tutores</option>
                        <option value="departamento">Departamento</option>
                        <option value="familia">Familia</option>
                    </Select>
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-600">Con quién</label>
                    <Input
                        type="text" value={conQuien} onChange={e => setConQuien(e.target.value)}
                        placeholder="Ej: Familia de..., Claustro, Equipo docente..."
                        className="mt-1"
                        autoFocus
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-600">Motivo</label>
                    <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} className="mt-1" />
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" variant="primary">Guardar Reunión</Button>
                </div>
            </form>
        </Modal>
    );
};

export default CalendarMeetingModal;
