import React, { useMemo, useState } from 'react';
import type { Assignment, Grade, QuestionRoundEntry, Student } from '../types';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { DicesIcon } from './Icons';
import { getNombreCompleto } from '../utils';

const getEntries = (grade?: Grade): QuestionRoundEntry[] => {
    const entries = grade?.toolResults?.questionRoundEntries;
    return Array.isArray(entries)
        ? entries.filter((entry): entry is QuestionRoundEntry => !!entry && typeof entry === 'object' && typeof entry.score === 'number')
        : [];
};

interface Props {
    isOpen: boolean;
    assignment: Assignment | null;
    students: Student[];
    grades: Grade[];
    onClose: () => void;
    onSave: (student: Student, entries: QuestionRoundEntry[]) => Promise<void>;
}

const QuestionRoundModal: React.FC<Props> = ({ isOpen, assignment, students, grades, onClose, onSave }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [score, setScore] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const entriesByStudent = useMemo(() => new Map(students.map(student => [student.id, getEntries(grades.find(grade => grade.studentId === student.id && grade.assignmentId === assignment?.id))])), [students, grades, assignment?.id]);
    const counts = useMemo(() => students.map(student => entriesByStudent.get(student.id)?.length || 0), [students, entriesByStudent]);
    const minimum = counts.length ? Math.min(...counts) : 0;
    const candidates = students.filter(student => (entriesByStudent.get(student.id)?.length || 0) === minimum);
    const roundNumber = minimum + 1;
    const completedThisRound = counts.filter(count => count >= roundNumber).length;
    const totalEntries = counts.reduce((sum, count) => sum + count, 0);
    const selected = students.find(student => student.id === selectedId) || null;
    const selectedCount = selected ? entriesByStudent.get(selected.id)?.length || 0 : 0;

    const pick = () => {
        if (!candidates.length) return;
        const student = candidates[Math.floor(Math.random() * candidates.length)];
        setSelectedId(student.id);
        setScore('');
        setNotes('');
    };

    const save = async () => {
        if (!selected || !assignment) return;
        const numericScore = Number(score.replace(',', '.'));
        if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 10) return;
        setSaving(true);
        try {
            await onSave(selected, [...(entriesByStudent.get(selected.id) || []), {
                id: crypto.randomUUID(), recordedAt: new Date().toISOString(), score: numericScore, notes: notes.trim() || undefined,
            }]);
            setSelectedId(null);
            setScore('');
            setNotes('');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={assignment ? `Ronda de preguntas · ${assignment.name}` : 'Ronda de preguntas'} size="lg">
            <div className="space-y-4">
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950">
                    <p className="font-semibold">Vuelta equilibrada</p>
                    <p className="mt-1 text-indigo-800">Ronda {roundNumber} · {completedThisRound} de {students.length} con {roundNumber} nota{roundNumber === 1 ? '' : 's'} · {candidates.length} pendiente{candidates.length === 1 ? '' : 's'}.</p>
                    <p className="mt-1 text-xs text-indigo-700">{totalEntries} nota{totalEntries === 1 ? '' : 's'} registrada{totalEntries === 1 ? '' : 's'} en total. El sorteo elige entre quienes siguen pendientes en esta ronda.</p>
                    {assignment?.questionRoundDescription && <p className="mt-2 border-t border-indigo-200 pt-2 text-indigo-900"><span className="font-medium">Se observa:</span> {assignment.questionRoundDescription}</p>}
                </div>
                {!selected ? (
                    <div className="space-y-3">
                        <Button type="button" onClick={pick} className="w-full justify-center" disabled={!students.length}>
                            <DicesIcon className="h-5 w-5" /> Elegir siguiente alumno
                        </Button>
                        <div className="border-t border-slate-200 pt-3">
                            <label htmlFor="question-round-student" className="text-sm font-medium text-slate-700">O elegir alumno manualmente</label>
                            <select id="question-round-student" value="" onChange={event => { if (event.target.value) { setSelectedId(event.target.value); setScore(''); setNotes(''); } }} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                                <option value="">Selecciona un alumno…</option>
                                {students.map(student => {
                                    const count = entriesByStudent.get(student.id)?.length || 0;
                                    return <option key={student.id} value={student.id}>{getNombreCompleto(student)} · {count} nota{count === 1 ? '' : 's'}</option>;
                                })}
                            </select>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Le toca</p><p className="text-lg font-bold text-slate-900">{getNombreCompleto(selected)}</p></div>
                            <Button type="button" variant="secondary" onClick={pick}>Otro alumno</Button>
                        </div>
                        {selectedCount > minimum && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Elección manual: esta persona ya tiene {selectedCount} notas, mientras que el mínimo del grupo es {minimum}.</p>}
                        <div>
                            <label htmlFor="round-score" className="text-sm font-medium text-slate-700">Calificación (0–10)</label>
                            <Input id="round-score" type="number" min="0" max="10" step="0.1" autoFocus value={score} onChange={event => setScore(event.target.value)} className="mt-1 w-full text-lg font-semibold" />
                        </div>
                        <div>
                            <label htmlFor="round-notes" className="text-sm font-medium text-slate-700">Observación <span className="font-normal text-slate-400">(opcional)</span></label>
                            <textarea id="round-notes" value={notes} onChange={event => setNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                        </div>
                        <Button type="button" onClick={save} disabled={saving || score.trim() === ''} className="w-full justify-center">{saving ? 'Guardando…' : 'Registrar respuesta y continuar'}</Button>
                    </div>
                )}
                <p className="text-xs text-slate-500">Las intervenciones sin nota no se contabilizan para el equilibrio de la ronda.</p>
            </div>
        </Modal>
    );
};

export default QuestionRoundModal;
