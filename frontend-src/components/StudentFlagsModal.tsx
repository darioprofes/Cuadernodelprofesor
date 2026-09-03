import React, { useState, useEffect, useRef } from 'react';
import type { Student } from '../types';
import { ACNEAE_TAGS, ACNEAE_LABELS } from '../constants';
import Modal from './Modal';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';
import StudentPhotoAvatar from './StudentPhotoAvatar';
import SiNoToggle from './SiNoToggle';
import { getNombreCompleto } from '../utils';
import { checkboxClassName } from '../theme/components/Input';

interface StudentFlagsModalProps {
    isOpen: boolean;
    onClose: () => void;
    students: Student[];
    initialStudentId: string | null;
    onSave: (studentId: string, data: Partial<Student>) => void;
}

type Flags = Pick<Student, 'haRepetidoCurso' | 'programaBilingue' | 'neae' | 'acneae' | 'autorizacionImagen' | 'autorizacionSalidas'>;

const buildFlags = (s: Student): Flags => ({
    haRepetidoCurso: s.haRepetidoCurso,
    programaBilingue: s.programaBilingue,
    neae: s.neae,
    acneae: s.acneae || [],
    autorizacionImagen: s.autorizacionImagen,
    autorizacionSalidas: s.autorizacionSalidas,
});

// Ficha de edición rápida: solo los campos seleccionables (booleanos/
// checkboxes) de un alumno/a, sin ningún campo de texto libre -- pensada
// para repasar todo el grupo de golpe a principio de curso (repetidor,
// bilingüe, NEAE/ACNEAE, autorizaciones), no como sustituto de la ficha
// completa (StudentPersonalDataModal). Con Anterior/Siguiente para no
// tener que cerrar y reabrir por cada alumno/a.
const StudentFlagsModal: React.FC<StudentFlagsModalProps> = ({ isOpen, onClose, students, initialStudentId, onSave }) => {
    const [currentId, setCurrentId] = useState<string | null>(initialStudentId);
    const [flags, setFlags] = useState<Flags>({ acneae: [] });
    const pendingSaveRef = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);

    const flushPendingSave = () => {
        if (pendingSaveRef.current) {
            clearTimeout(pendingSaveRef.current.timer);
            pendingSaveRef.current.run();
            pendingSaveRef.current = null;
        }
    };

    useEffect(() => {
        if (!isOpen) flushPendingSave();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) setCurrentId(initialStudentId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialStudentId]);

    const index = students.findIndex(s => s.id === currentId);
    const student = index >= 0 ? students[index] : null;

    useEffect(() => {
        if (student) setFlags(buildFlags(student));
    }, [student]);

    const scheduleAutosave = (studentId: string, next: Flags) => {
        if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current.timer);
        const run = () => { pendingSaveRef.current = null; onSave(studentId, next); };
        pendingSaveRef.current = { timer: setTimeout(run, 1500), run };
    };

    const set = (patch: Partial<Flags>) => {
        if (!student) return;
        const next = { ...flags, ...patch };
        setFlags(next);
        scheduleAutosave(student.id, next);
    };

    const goTo = (newIndex: number) => {
        flushPendingSave();
        setCurrentId(students[newIndex].id);
    };

    if (!isOpen || !student) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Editar datos rápidos" size="lg">
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-200">
                    <button
                        type="button"
                        onClick={() => goTo(index - 1)}
                        disabled={index <= 0}
                        className="p-2 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Alumno/a anterior"
                    >
                        <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2 min-w-0">
                        <StudentPhotoAvatar foto={student.foto} size="w-10 h-10" />
                        <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{getNombreCompleto(student)}</p>
                            <p className="text-xs text-slate-400">
                                {index + 1} de {students.length}
                                {(student.ultimoCursoSauce || student.ultimaUnidadSauce) && (
                                    <> · Grupo de referencia: {[student.ultimoCursoSauce, student.ultimaUnidadSauce].filter(Boolean).join(' ')}</>
                                )}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => goTo(index + 1)}
                        disabled={index >= students.length - 1}
                        className="p-2 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Siguiente alumno/a"
                    >
                        <ChevronRightIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FlagField label="¿Ha repetido curso?">
                        <SiNoToggle value={flags.haRepetidoCurso} onChange={v => set({ haRepetidoCurso: v })} />
                    </FlagField>
                    <FlagField label="¿Programa bilingüe?">
                        <SiNoToggle value={flags.programaBilingue} onChange={v => set({ programaBilingue: v })} />
                    </FlagField>
                    <FlagField label="¿Presenta NEAE?" className="sm:col-span-2">
                        <SiNoToggle value={flags.neae} onChange={v => set({ neae: v })} />
                    </FlagField>
                    <FlagField label="Autorización de uso de imagen">
                        <SiNoToggle value={flags.autorizacionImagen} onChange={v => set({ autorizacionImagen: v })} />
                    </FlagField>
                    <FlagField label="Autorización para salidas escolares">
                        <SiNoToggle value={flags.autorizacionSalidas} onChange={v => set({ autorizacionSalidas: v })} />
                    </FlagField>
                </div>

                <div>
                    <p className="block text-xs font-medium text-slate-600 mb-1">Anotaciones ACNEAE (tipo de NEAE)</p>
                    <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        {([
                            ['ACNEE', 'NEE (necesidades educativas especiales)'],
                            ['OTRAS', 'Otras NEAE'],
                            ['ESPEC', 'Altas capacidades'],
                        ] as const).map(([prefijo, titulo]) => (
                            <div key={prefijo}>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{titulo}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                                    {ACNEAE_TAGS.filter(tag => tag.startsWith(`${prefijo}-`)).map(tag => (
                                        <label key={tag} className="flex items-start gap-2 text-xs cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={(flags.acneae || []).includes(tag)}
                                                onChange={e => {
                                                    const current = flags.acneae || [];
                                                    set({ acneae: e.target.checked ? [...current, tag] : current.filter(t => t !== tag) });
                                                }}
                                                className={`${checkboxClassName} mt-0.5 flex-shrink-0`}
                                            />
                                            <span><span className="font-mono font-semibold">{tag}</span> <span className="text-slate-500">— {ACNEAE_LABELS[tag]}</span></span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

const FlagField: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className, children }) => (
    <div className={className}>
        <label className="block text-xs font-medium text-slate-600">{label}</label>
        {children}
    </div>
);

export default StudentFlagsModal;
