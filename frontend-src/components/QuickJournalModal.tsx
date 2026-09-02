import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ClassData, Course, AcademicConfiguration, JournalEntry } from '../types';
import Modal from './Modal';
import Button from './Button';
import Select from './Select';
import Textarea from './Textarea';
import EmptyState from './EmptyState';
import { toYYYYMMDD, getDayOfWeek1a7, parsePeriodRange, formatClassLabel } from '../utils';

interface QuickJournalModalProps {
    isOpen: boolean;
    onClose: () => void;
    classes: ClassData[];
    courses: Course[];
    academicConfiguration: AcademicConfiguration;
    entries: JournalEntry[];
    onSave: (entry: JournalEntry) => void;
}

interface SesionHoy {
    classData: ClassData;
    periodIndex: number;
    periodName: string;
}

// Anotar en el Diario de Clase sin entrar en esa vista completa: solo las
// clases que tienes HOY según el horario, con la que esté en curso ahora
// mismo preseleccionada (comparando la hora actual contra el rango de la
// franja horaria, vía parsePeriodRange). Fuera de horario lectivo, cae a la
// primera clase del día.
const QuickJournalModal: React.FC<QuickJournalModalProps> = ({ isOpen, onClose, classes, courses, academicConfiguration, entries, onSave }) => {
    const hoy = new Date();
    const hoyStr = toYYYYMMDD(hoy);
    const dayOfWeek = getDayOfWeek1a7(hoy);
    const nowMin = hoy.getHours() * 60 + hoy.getMinutes();

    const sesionesHoy: SesionHoy[] = useMemo(() => {
        const list: SesionHoy[] = [];
        classes.forEach(c => {
            (c.schedule || []).filter(s => s.day === dayOfWeek).forEach(slot => {
                list.push({
                    classData: c,
                    periodIndex: slot.periodIndex,
                    periodName: academicConfiguration.periods?.[slot.periodIndex] || `Hora ${slot.periodIndex + 1}`,
                });
            });
        });
        return list.sort((a, b) => a.periodIndex - b.periodIndex);
    }, [classes, dayOfWeek, academicConfiguration.periods]);

    const indiceActual = useMemo(() => {
        return sesionesHoy.findIndex(s => {
            const rango = parsePeriodRange(s.periodName);
            return rango != null && nowMin >= rango.startMin && nowMin <= rango.endMin;
        });
    }, [sesionesHoy, nowMin]);

    const [selectedIdx, setSelectedIdx] = useState(0);
    const [notas, setNotas] = useState('');
    // Este modal SÍ se desmonta al cerrarse (App.tsx lo renderiza
    // condicionalmente, a diferencia de SessionActionModal.tsx) -- el flush
    // del autoguardado pendiente puede colgarse de un cleanup de useEffect.
    const pendingSaveRef = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);

    const saveNota = (sesion: SesionHoy, text: string) => {
        const existente = entries.find(en => en.classId === sesion.classData.id && en.date === hoyStr && en.periodIndex === sesion.periodIndex);
        onSave({
            id: existente?.id || `j-${Date.now()}-${sesion.classData.id}-${sesion.periodIndex}-${Math.random().toString(36).substring(2, 5)}`,
            date: hoyStr,
            classId: sesion.classData.id,
            periodIndex: sesion.periodIndex,
            notes: text,
        });
    };

    useEffect(() => {
        if (isOpen) {
            setSelectedIdx(indiceActual >= 0 ? indiceActual : 0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        // Cambiar de sesión en el desplegable descartaría silenciosamente
        // un autoguardado pendiente de la anterior -- se lanza antes.
        if (pendingSaveRef.current) {
            clearTimeout(pendingSaveRef.current.timer);
            pendingSaveRef.current.run();
            pendingSaveRef.current = null;
        }
        const sesion = sesionesHoy[selectedIdx];
        if (!sesion) {
            setNotas('');
            return;
        }
        const existente = entries.find(e => e.classId === sesion.classData.id && e.date === hoyStr && e.periodIndex === sesion.periodIndex);
        setNotas(existente?.notes || '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIdx, sesionesHoy, entries, hoyStr]);

    // Al desmontar (se cierra el modal, App.tsx deja de renderizarlo),
    // lanza cualquier autoguardado todavía pendiente.
    useEffect(() => () => {
        if (pendingSaveRef.current) { clearTimeout(pendingSaveRef.current.timer); pendingSaveRef.current.run(); }
    }, []);

    const handleNotasChange = (text: string) => {
        setNotas(text);
        const sesion = sesionesHoy[selectedIdx];
        if (!sesion) return;

        // Autoguardado: 1.5s tras la última pulsación (mismo criterio e
        // intervalo que ClassJournal.tsx/SessionActionModal.tsx).
        if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current.timer);
        const run = () => { pendingSaveRef.current = null; saveNota(sesion, text); };
        pendingSaveRef.current = { timer: setTimeout(run, 1500), run };
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Cancela el temporizador sin lanzarlo -- ya vamos a guardar ahora.
        if (pendingSaveRef.current) { clearTimeout(pendingSaveRef.current.timer); pendingSaveRef.current = null; }
        const sesion = sesionesHoy[selectedIdx];
        if (!sesion) return;
        saveNota(sesion, notas);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Anotar en el Diario — Hoy" size="lg">
            {sesionesHoy.length === 0 ? (
                <EmptyState title="No tienes clases programadas hoy." message="Revisa el horario en Ajustes si esto es incorrecto." />
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="quick-journal-class" className="block text-sm font-medium text-slate-700">Clase</label>
                        <Select
                            id="quick-journal-class"
                            value={selectedIdx}
                            onChange={e => setSelectedIdx(Number(e.target.value))}
                            className="mt-1"
                        >
                            {sesionesHoy.map((s, idx) => (
                                <option key={`${s.classData.id}-${s.periodIndex}`} value={idx}>
                                    {s.periodName} — {formatClassLabel(s.classData, courses)}{idx === indiceActual ? ' (en curso)' : ''}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div>
                        <label htmlFor="quick-journal-notes" className="block text-sm font-medium text-slate-700">Anotaciones</label>
                        <Textarea
                            id="quick-journal-notes"
                            value={notas}
                            onChange={e => handleNotasChange(e.target.value)}
                            placeholder="Incidencias, tareas mandadas, lo que realmente se ha hecho en clase..."
                            className="mt-1 h-32 resize-y"
                            autoFocus
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" variant="primary">Guardar</Button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

export default QuickJournalModal;
