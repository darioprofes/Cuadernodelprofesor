import React, { useState, useEffect, useMemo } from 'react';
import type { ClassData, Course } from '../types';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { buildClassName, getClassAccentColor } from '../utils';
import { CLASS_ICON_OPTIONS } from '../classIcons';
import IconPicker, { type IconPickerOption } from './IconPicker';

interface ClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (classData: Omit<ClassData, 'students' | 'categories' | 'assignments' | 'grades'>) => void;
  classToEdit: ClassData | null;
  courses: Course[];
}

// Tonos repartidos por la rueda de color para elegir a mano el acento de la
// clase (ver getClassAccentColor en utils.ts); "Automático" vuelve a dejar
// que se derive del hash de la materia, como el resto de materias que no se
// toquen aquí.
const HUE_PRESETS = [0, 25, 50, 90, 150, 190, 220, 260, 300, 335];

const ClassModal: React.FC<ClassModalProps> = ({ isOpen, onClose, onSave, classToEdit, courses }) => {
  const [grupo, setGrupo] = useState('');
  const [courseId, setCourseId] = useState<string>(courses[0]?.id || '');
  const [icono, setIcono] = useState<string | undefined>(undefined);
  const [colorAcento, setColorAcento] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (isOpen) {
        if (classToEdit) {
            setGrupo(classToEdit.grupo || '');
            setCourseId(classToEdit.courseId);
            setIcono(classToEdit.icono);
            setColorAcento(classToEdit.colorAcento);
        } else {
            setGrupo('');
            setCourseId(courses[0]?.id || '');
            setIcono(undefined);
            setColorAcento(undefined);
        }
    }
  }, [classToEdit, isOpen, courses]);

  const selectedCourse = courses.find(c => c.id === courseId);

  const iconOptions: IconPickerOption[] = useMemo(() => CLASS_ICON_OPTIONS.map(opt => ({
      key: opt.key,
      label: opt.label,
      render: (className: string) => <opt.Icon className={className} />,
  })), []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (courseId && selectedCourse) {
      const grupoTrim = grupo.trim();
      onSave({
        id: classToEdit ? classToEdit.id : `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        grupo: grupoTrim || undefined,
        courseId,
        icono,
        colorAcento,
      });
      onClose();
    } else {
        alert("Por favor, selecciona un curso.");
    }
  };

  const previewAccent = getClassAccentColor(selectedCourse?.subject || '', colorAcento);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={classToEdit ? 'Editar Clase' : 'Nueva Clase'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="grupo" className="block text-sm font-medium text-slate-700">Grupo</label>
          <Input
            type="text" id="grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}
            placeholder="Ej: S4BD (déjalo vacío si no aplica: guardias, reuniones...)"
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="course" className="block text-sm font-medium text-slate-700">Curso (nivel y materia)</label>
          <Select
            id="course" value={courseId} onChange={(e) => setCourseId(e.target.value)}
            className="mt-1"
            required
          >
            {courses.map(course => (
              <option key={course.id} value={course.id}>{course.level} - {course.subject}</option>
            ))}
          </Select>
        </div>
        {selectedCourse && (
            <p className="text-xs text-slate-500">
                Nombre resultante: <span className="font-semibold">{buildClassName(grupo.trim() || undefined, selectedCourse.subject)}</span>
            </p>
        )}

        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Icono</label>
                <IconPicker value={icono} onChange={setIcono} options={iconOptions} />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Color de acento</label>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setColorAcento(undefined)}
                        title="Automático (según la materia)"
                        className={`w-7 h-7 rounded-full border-2 border-dashed flex items-center justify-center text-[9px] font-bold text-slate-400 bg-white ${colorAcento == null ? 'ring-2 ring-offset-1 ring-blue-500 border-blue-400' : 'border-slate-300'}`}
                    >
                        A
                    </button>
                    {HUE_PRESETS.map(hue => (
                        <button
                            key={hue}
                            type="button"
                            onClick={() => setColorAcento(hue)}
                            title={`Tono ${hue}°`}
                            className={`w-7 h-7 rounded-full ${colorAcento === hue ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
                            style={{ backgroundColor: `hsl(${hue}, 45%, 42%)` }}
                        />
                    ))}
                </div>
                {selectedCourse && (
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-slate-400">Vista previa:</span>
                        <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold" style={{ backgroundColor: previewAccent.pillBg, color: previewAccent.text }}>
                            {grupo.trim() || 'S1A'}
                        </span>
                    </div>
                )}
            </div>
        </div>

        <div className="flex justify-end pt-4 space-x-2 border-t mt-4 sticky bottom-0 bg-white -mx-6 -mb-6 px-6 pb-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary">{classToEdit ? 'Guardar Cambios' : 'Crear Clase'}</Button>
        </div>
      </form>
    </Modal>
  );
};

export default ClassModal;
