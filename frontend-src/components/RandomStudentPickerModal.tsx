import React, { useMemo, useState } from 'react';
import type { Assignment, Grade, Student } from '../types';
import Modal from './Modal';
import Button from './Button';
import { DicesIcon } from './Icons';
import { getNombreCompleto } from '../utils';
import { getRandomGradeCandidates } from '../services/randomGradeEntry';

interface Props {
  isOpen: boolean;
  assignment: Assignment | null;
  students: Student[];
  grades: Grade[];
  onClose: () => void;
  onPick: (student: Student, assignment: Assignment) => void;
}

const RandomStudentPickerModal: React.FC<Props> = ({ isOpen, assignment, students, grades, onClose, onPick }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { gradedStudentIds, pendingStudents, candidates } = useMemo(
    () => getRandomGradeCandidates(students, grades, assignment?.id ?? ''),
    [students, grades, assignment?.id],
  );
  const selected = students.find(student => student.id === selectedId) || null;
  const allGraded = students.length > 0 && pendingStudents.length === 0;

  const pick = () => {
    if (!candidates.length) return;
    const student = candidates[Math.floor(Math.random() * candidates.length)];
    setSelectedId(student.id);
  };

  const startGrading = () => {
    if (!selected || !assignment) return;
    onPick(selected, assignment);
    setSelectedId(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={assignment ? `Elegir alumno · ${assignment.shortName || assignment.name}` : 'Elegir alumno'} size="md">
      <div className="space-y-4">
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950">
          <p className="font-semibold">Selección aleatoria</p>
          <p className="mt-1 text-indigo-800">
            {pendingStudents.length > 0
              ? `${pendingStudents.length} alumno${pendingStudents.length === 1 ? '' : 's'} sin calificación en esta tarea.`
              : allGraded
                ? 'Todo el alumnado ya tiene calificación en esta tarea. El sorteo elegirá entre todos.'
                : 'No hay alumnado disponible.'}
          </p>
        </div>

        {!selected ? (
          <div className="space-y-3">
            <Button type="button" onClick={pick} className="w-full justify-center" disabled={!candidates.length}>
              <DicesIcon className="h-5 w-5" /> Elegir al azar
            </Button>
            <div className="border-t border-slate-200 pt-3">
              <label htmlFor="random-student-picker" className="text-sm font-medium text-slate-700">O elegir manualmente</label>
              <select
                id="random-student-picker"
                value=""
                onChange={event => { if (event.target.value) setSelectedId(event.target.value); }}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Selecciona un alumno…</option>
                {students.map(student => (
                  <option key={student.id} value={student.id}>
                    {getNombreCompleto(student)}{gradedStudentIds.has(student.id) ? ' · ya tiene nota' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alumno seleccionado</p>
              <p className="text-lg font-bold text-slate-900">{getNombreCompleto(selected)}</p>
              {gradedStudentIds.has(selected.id) && <p className="mt-1 text-xs text-amber-700">Este alumno ya tiene calificación en esta tarea.</p>}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={pick} className="flex-1 justify-center">Otro</Button>
              <Button type="button" onClick={startGrading} className="flex-1 justify-center">Calificar</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default RandomStudentPickerModal;
