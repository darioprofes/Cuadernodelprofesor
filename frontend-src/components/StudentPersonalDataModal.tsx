import React, { useState, useEffect } from 'react';
import type { Student, Tutor } from '../types';
import { ACNEAE_TAGS } from '../constants';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Textarea from './Textarea';
import { TrashIcon, ChevronRightIcon, ChevronDownIcon } from './Icons';
import StudentPhotoAvatar from './StudentPhotoAvatar';
import { fileToDataUrl } from '../utils';
import { checkboxClassName } from '../theme/components/Input';

interface StudentPersonalDataModalProps {
    isOpen: boolean;
    onClose: () => void;
    student: Student | null;
    onSave: (studentId: string, data: Partial<Student>) => void;
}

type FormState = Omit<Student, 'id' | 'name'>;

const emptyTutor: Tutor = { nombre: '', relacion: '', telefono: '', email: '' };

// Ficha completa de datos personales del alumnado: se edita aquí (foto,
// familia, domicilio, académico, sanitario, atención educativa,
// autorizaciones); se muestra de solo lectura en StudentSummaryModal.
// Organizada en secciones desplegables (abiertas por defecto salvo
// Sanitaria/Autorizaciones, más sensibles y menos consultadas a diario) para
// no convertir esto en un formulario interminable de un solo vistazo.
const StudentPersonalDataModal: React.FC<StudentPersonalDataModalProps> = ({ isOpen, onClose, student, onSave }) => {
    const [form, setForm] = useState<FormState>({ acneae: [] });

    useEffect(() => {
        if (isOpen && student) {
            setForm({
                foto: student.foto,
                fechaNacimiento: student.fechaNacimiento || '',
                dni: student.dni || '',
                telefonoUrgencias: student.telefonoUrgencias || '',
                tutor1: student.tutor1 || { ...emptyTutor },
                tutor2: student.tutor2 || { ...emptyTutor },
                domicilioDireccion: student.domicilioDireccion || '',
                domicilioLocalidad: student.domicilioLocalidad || '',
                domicilioCodigoPostal: student.domicilioCodigoPostal || '',
                domicilioTelefono: student.domicilioTelefono || '',
                centroProcedencia: student.centroProcedencia || '',
                haRepetidoCurso: student.haRepetidoCurso,
                materiasPendientes: student.materiasPendientes || '',
                programaEspecifico: student.programaEspecifico || '',
                alergias: student.alergias || '',
                enfermedadesRelevantes: student.enfermedadesRelevantes || '',
                medicacionHabitual: student.medicacionHabitual || '',
                intoleranciasAlimentarias: student.intoleranciasAlimentarias || '',
                observacionesSanitarias: student.observacionesSanitarias || '',
                acneae: student.acneae || [],
                neae: student.neae,
                neaeDetalle: student.neaeDetalle || '',
                medidasEducativas: student.medidasEducativas || '',
                autorizacionImagen: student.autorizacionImagen,
                autorizacionSalidas: student.autorizacionSalidas,
                observacionesTutor: student.observacionesTutor || '',
            });
        }
    }, [isOpen, student]);

    if (!student) return null;

    const set = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }));
    const setTutor = (which: 'tutor1' | 'tutor2', patch: Partial<Tutor>) =>
        setForm(prev => ({ ...prev, [which]: { ...prev[which], ...patch } }));

    const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        set({ foto: await fileToDataUrl(file) });
    };

    const trimOrUndef = (v?: string) => v?.trim() || undefined;
    const trimTutor = (t?: Tutor): Tutor | undefined => {
        if (!t) return undefined;
        const cleaned = { nombre: trimOrUndef(t.nombre), relacion: trimOrUndef(t.relacion), telefono: trimOrUndef(t.telefono), email: trimOrUndef(t.email) };
        return Object.values(cleaned).some(Boolean) ? cleaned : undefined;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(student.id, {
            foto: form.foto,
            fechaNacimiento: trimOrUndef(form.fechaNacimiento),
            dni: trimOrUndef(form.dni),
            telefonoUrgencias: trimOrUndef(form.telefonoUrgencias),
            tutor1: trimTutor(form.tutor1),
            tutor2: trimTutor(form.tutor2),
            domicilioDireccion: trimOrUndef(form.domicilioDireccion),
            domicilioLocalidad: trimOrUndef(form.domicilioLocalidad),
            domicilioCodigoPostal: trimOrUndef(form.domicilioCodigoPostal),
            domicilioTelefono: trimOrUndef(form.domicilioTelefono),
            centroProcedencia: trimOrUndef(form.centroProcedencia),
            haRepetidoCurso: form.haRepetidoCurso,
            materiasPendientes: trimOrUndef(form.materiasPendientes),
            programaEspecifico: trimOrUndef(form.programaEspecifico),
            alergias: trimOrUndef(form.alergias),
            enfermedadesRelevantes: trimOrUndef(form.enfermedadesRelevantes),
            medicacionHabitual: trimOrUndef(form.medicacionHabitual),
            intoleranciasAlimentarias: trimOrUndef(form.intoleranciasAlimentarias),
            observacionesSanitarias: trimOrUndef(form.observacionesSanitarias),
            acneae: form.acneae || [],
            neae: form.neae,
            neaeDetalle: trimOrUndef(form.neaeDetalle),
            medidasEducativas: trimOrUndef(form.medidasEducativas),
            autorizacionImagen: form.autorizacionImagen,
            autorizacionSalidas: form.autorizacionSalidas,
            observacionesTutor: trimOrUndef(form.observacionesTutor),
        });
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Ficha personal — ${student.name}`} size="2xl">
            <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex items-center gap-4 pb-2">
                    <StudentPhotoAvatar foto={form.foto} size="w-20 h-20" />
                    <div className="flex flex-col gap-1">
                        <label className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">
                            {form.foto ? 'Cambiar foto' : 'Subir foto'}
                            <input type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
                        </label>
                        {form.foto && (
                            <button type="button" onClick={() => set({ foto: undefined })} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600">
                                <TrashIcon className="w-3.5 h-3.5" /> Quitar foto
                            </button>
                        )}
                    </div>
                </div>

                <FichaSection title="Datos del alumno/a" defaultOpen>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Fecha de nacimiento">
                            <Input type="date" value={form.fechaNacimiento || ''} onChange={e => set({ fechaNacimiento: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="DNI/NIE">
                            <Input type="text" value={form.dni || ''} onChange={e => set({ dni: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Teléfono de urgencias" className="sm:col-span-2">
                            <Input type="text" value={form.telefonoUrgencias || ''} onChange={e => set({ telefonoUrgencias: e.target.value })} className={inputClass} />
                        </Field>
                    </div>
                </FichaSection>

                <FichaSection title="Datos familiares" defaultOpen>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <TutorFields label="Progenitor/a o tutor/a legal 1" value={form.tutor1} onChange={p => setTutor('tutor1', p)} />
                        <TutorFields label="Progenitor/a o tutor/a legal 2" value={form.tutor2} onChange={p => setTutor('tutor2', p)} />
                    </div>
                </FichaSection>

                <FichaSection title="Domicilio" defaultOpen>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Dirección" className="sm:col-span-2">
                            <Input type="text" value={form.domicilioDireccion || ''} onChange={e => set({ domicilioDireccion: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Localidad">
                            <Input type="text" value={form.domicilioLocalidad || ''} onChange={e => set({ domicilioLocalidad: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Código Postal">
                            <Input type="text" value={form.domicilioCodigoPostal || ''} onChange={e => set({ domicilioCodigoPostal: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Teléfono">
                            <Input type="text" value={form.domicilioTelefono || ''} onChange={e => set({ domicilioTelefono: e.target.value })} className={inputClass} />
                        </Field>
                    </div>
                </FichaSection>

                <FichaSection title="Información académica">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Centro de procedencia">
                            <Input type="text" value={form.centroProcedencia || ''} onChange={e => set({ centroProcedencia: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Programa específico (Diversificación, etc.)">
                            <Input type="text" value={form.programaEspecifico || ''} onChange={e => set({ programaEspecifico: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="¿Ha repetido curso?">
                            <SiNoToggle value={form.haRepetidoCurso} onChange={v => set({ haRepetidoCurso: v })} />
                        </Field>
                        <Field label="Materias pendientes">
                            <Input type="text" value={form.materiasPendientes || ''} onChange={e => set({ materiasPendientes: e.target.value })} className={inputClass} />
                        </Field>
                    </div>
                </FichaSection>

                <FichaSection title="Información sanitaria">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Alergias">
                            <Input type="text" value={form.alergias || ''} onChange={e => set({ alergias: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Enfermedades relevantes">
                            <Input type="text" value={form.enfermedadesRelevantes || ''} onChange={e => set({ enfermedadesRelevantes: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Medicación habitual">
                            <Input type="text" value={form.medicacionHabitual || ''} onChange={e => set({ medicacionHabitual: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Intolerancias alimentarias">
                            <Input type="text" value={form.intoleranciasAlimentarias || ''} onChange={e => set({ intoleranciasAlimentarias: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Otras observaciones de interés" className="sm:col-span-2">
                            <Textarea value={form.observacionesSanitarias || ''} onChange={e => set({ observacionesSanitarias: e.target.value })} className={`${inputClass} h-16`} />
                        </Field>
                    </div>
                </FichaSection>

                <FichaSection title="Atención educativa">
                    <div className="space-y-3">
                        <Field label="¿Presenta necesidades específicas de apoyo educativo (NEAE)?">
                            <SiNoToggle value={form.neae} onChange={v => set({ neae: v })} />
                        </Field>
                        <Field label="Anotaciones ACNEAE">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-1 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                {ACNEAE_TAGS.map(tag => (
                                    <label key={tag} className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={(form.acneae || []).includes(tag)}
                                            onChange={e => {
                                                const current = form.acneae || [];
                                                set({ acneae: e.target.checked ? [...current, tag] : current.filter(t => t !== tag) });
                                            }}
                                            className={checkboxClassName}
                                        />
                                        <span>{tag}</span>
                                    </label>
                                ))}
                            </div>
                        </Field>
                        <Field label="En caso afirmativo, indicar">
                            <Input type="text" value={form.neaeDetalle || ''} onChange={e => set({ neaeDetalle: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Medidas educativas aplicadas">
                            <Textarea value={form.medidasEducativas || ''} onChange={e => set({ medidasEducativas: e.target.value })} className={`${inputClass} h-16`} />
                        </Field>
                    </div>
                </FichaSection>

                <FichaSection title="Autorizaciones">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Autorización de uso de imagen">
                            <SiNoToggle value={form.autorizacionImagen} onChange={v => set({ autorizacionImagen: v })} />
                        </Field>
                        <Field label="Autorización para salidas escolares">
                            <SiNoToggle value={form.autorizacionSalidas} onChange={v => set({ autorizacionSalidas: v })} />
                        </Field>
                    </div>
                </FichaSection>

                <FichaSection title="Observaciones del tutor/a" defaultOpen>
                    <Textarea value={form.observacionesTutor || ''} onChange={e => set({ observacionesTutor: e.target.value })} className={`${inputClass} h-20`} />
                </FichaSection>

                <div className="flex justify-end pt-4 space-x-2 border-t">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" variant="primary">Guardar</Button>
                </div>
            </form>
        </Modal>
    );
};

const inputClass = "mt-1";

const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className, children }) => (
    <div className={className}>
        <label className="block text-xs font-medium text-slate-600">{label}</label>
        {children}
    </div>
);

const TutorFields: React.FC<{ label: string; value?: Tutor; onChange: (patch: Partial<Tutor>) => void }> = ({ label, value, onChange }) => (
    <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <Field label="Nombre y apellidos">
            <Input type="text" value={value?.nombre || ''} onChange={e => onChange({ nombre: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Relación con el alumno/a">
            <Input type="text" value={value?.relacion || ''} onChange={e => onChange({ relacion: e.target.value })} placeholder="Madre, padre, tutor legal..." className={inputClass} />
        </Field>
        <Field label="Teléfono">
            <Input type="text" value={value?.telefono || ''} onChange={e => onChange({ telefono: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Correo electrónico">
            <Input type="email" value={value?.email || ''} onChange={e => onChange({ email: e.target.value })} className={inputClass} />
        </Field>
    </div>
);

// Sí/No sin forzar una respuesta: ambos botones empiezan sin marcar
// (equivalente a las casillas ☐ Sí ☐ No en blanco del papel) hasta que se
// elige una; se puede volver a dejar sin especificar pulsando la ya activa.
const SiNoToggle: React.FC<{ value?: boolean; onChange: (v: boolean | undefined) => void }> = ({ value, onChange }) => (
    <div className="mt-1 flex items-center gap-2">
        <button
            type="button"
            onClick={() => onChange(value === true ? undefined : true)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${value === true ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
        >
            Sí
        </button>
        <button
            type="button"
            onClick={() => onChange(value === false ? undefined : false)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${value === false ? 'bg-slate-600 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
        >
            No
        </button>
    </div>
);

const FichaSection: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, defaultOpen, children }) => (
    <details className="group border border-slate-200 rounded-lg" open={defaultOpen}>
        <summary className="flex items-center gap-2 p-2.5 cursor-pointer font-semibold text-sm text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg [&::-webkit-details-marker]:hidden list-none">
            <ChevronRightIcon className="w-4 h-4 text-slate-400 flex-shrink-0 group-open:hidden" />
            <ChevronDownIcon className="w-4 h-4 text-slate-400 flex-shrink-0 hidden group-open:block" />
            {title}
        </summary>
        <div className="p-3 border-t border-slate-200">
            {children}
        </div>
    </details>
);

export default StudentPersonalDataModal;
