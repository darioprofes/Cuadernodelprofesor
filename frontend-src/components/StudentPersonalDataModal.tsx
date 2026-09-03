import React, { useState, useEffect, useRef } from 'react';
import type { Student, Tutor } from '../types';
import { ACNEAE_TAGS, ACNEAE_LABELS } from '../constants';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Textarea from './Textarea';
import { TrashIcon, ChevronRightIcon, ChevronDownIcon } from './Icons';
import StudentPhotoAvatar from './StudentPhotoAvatar';
import SiNoToggle from './SiNoToggle';
import { fileToDataUrl, getNombreCompleto } from '../utils';
import { checkboxClassName } from '../theme/components/Input';

interface StudentPersonalDataModalProps {
    isOpen: boolean;
    onClose: () => void;
    student: Student | null;
    onSave: (studentId: string, data: Partial<Student>) => void;
}

type FormState = Omit<Student, 'id' | 'nombre' | 'primerApellido' | 'segundoApellido'> & {
    nombre: string;
    primerApellido: string;
    segundoApellido: string;
};

const emptyTutor: Tutor = { nombre: '', relacion: '', telefono: '', email: '' };

// Ficha completa de datos personales del alumnado: se edita aquí (foto,
// familia, domicilio, académico, sanitario, atención educativa,
// autorizaciones); se muestra de solo lectura en StudentSummaryModal.
// Organizada en secciones desplegables (abiertas por defecto salvo
// Sanitaria/Autorizaciones, más sensibles y menos consultadas a diario) para
// no convertir esto en un formulario interminable de un solo vistazo.
const StudentPersonalDataModal: React.FC<StudentPersonalDataModalProps> = ({ isOpen, onClose, student, onSave }) => {
    const [form, setForm] = useState<FormState>({ nombre: '', primerApellido: '', segundoApellido: '', acneae: [] });
    // Este modal NUNCA se desmonta (GradebookTable.tsx solo cambia `isOpen`/
    // `student`) -- el flush del autoguardado pendiente se cuelga del
    // cierre (ver el useEffect de isOpen más abajo), no de un unmount, igual
    // que SessionActionModal.tsx.
    const pendingSaveRef = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);

    const flushPendingSave = () => {
        if (pendingSaveRef.current) {
            clearTimeout(pendingSaveRef.current.timer);
            pendingSaveRef.current.run();
            pendingSaveRef.current = null;
        }
    };

    // Al cerrar el modal (Guardar, la X, el fondo, Esc), lanza de inmediato
    // cualquier autoguardado pendiente.
    useEffect(() => {
        if (!isOpen) flushPendingSave();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && student) {
            // Por si hubiera algo pendiente de la ficha anterior (no debería
            // llegar a pasar, el modal se cierra entre una y otra, pero no
            // cuesta nada cubrirlo).
            flushPendingSave();
            setForm({
                nombre: student.nombre || '',
                primerApellido: student.primerApellido || '',
                segundoApellido: student.segundoApellido || '',
                foto: student.foto,
                fechaNacimiento: student.fechaNacimiento || '',
                dni: student.dni || '',
                nie: student.nie || '',
                nacionalidad: student.nacionalidad || '',
                ultimoCursoSauce: student.ultimoCursoSauce || '',
                ultimaUnidadSauce: student.ultimaUnidadSauce || '',
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
                indicacionesPti: student.indicacionesPti || '',
                autorizacionImagen: student.autorizacionImagen,
                autorizacionSalidas: student.autorizacionSalidas,
                observacionesTutor: student.observacionesTutor || '',
            });
        }
    }, [isOpen, student]);

    if (!student) return null;

    const trimOrUndef = (v?: string) => v?.trim() || undefined;
    const trimTutor = (t?: Tutor): Tutor | undefined => {
        if (!t) return undefined;
        const cleaned = { nombre: trimOrUndef(t.nombre), relacion: trimOrUndef(t.relacion), telefono: trimOrUndef(t.telefono), email: trimOrUndef(t.email) };
        return Object.values(cleaned).some(Boolean) ? cleaned : undefined;
    };

    // Misma forma que espera onSave, extraída de handleSubmit para
    // reutilizarla también desde el autoguardado (ver scheduleAutosave).
    const buildPayload = (f: FormState): Partial<Student> => ({
        nombre: trimOrUndef(f.nombre),
        primerApellido: trimOrUndef(f.primerApellido),
        segundoApellido: trimOrUndef(f.segundoApellido),
        foto: f.foto,
        fechaNacimiento: trimOrUndef(f.fechaNacimiento),
        dni: trimOrUndef(f.dni),
        nie: trimOrUndef(f.nie),
        nacionalidad: trimOrUndef(f.nacionalidad),
        ultimoCursoSauce: trimOrUndef(f.ultimoCursoSauce),
        ultimaUnidadSauce: trimOrUndef(f.ultimaUnidadSauce),
        telefonoUrgencias: trimOrUndef(f.telefonoUrgencias),
        tutor1: trimTutor(f.tutor1),
        tutor2: trimTutor(f.tutor2),
        domicilioDireccion: trimOrUndef(f.domicilioDireccion),
        domicilioLocalidad: trimOrUndef(f.domicilioLocalidad),
        domicilioCodigoPostal: trimOrUndef(f.domicilioCodigoPostal),
        domicilioTelefono: trimOrUndef(f.domicilioTelefono),
        centroProcedencia: trimOrUndef(f.centroProcedencia),
        haRepetidoCurso: f.haRepetidoCurso,
        materiasPendientes: trimOrUndef(f.materiasPendientes),
        programaEspecifico: trimOrUndef(f.programaEspecifico),
        alergias: trimOrUndef(f.alergias),
        enfermedadesRelevantes: trimOrUndef(f.enfermedadesRelevantes),
        medicacionHabitual: trimOrUndef(f.medicacionHabitual),
        intoleranciasAlimentarias: trimOrUndef(f.intoleranciasAlimentarias),
        observacionesSanitarias: trimOrUndef(f.observacionesSanitarias),
        acneae: f.acneae || [],
        neae: f.neae,
        neaeDetalle: trimOrUndef(f.neaeDetalle),
        medidasEducativas: trimOrUndef(f.medidasEducativas),
        indicacionesPti: trimOrUndef(f.indicacionesPti),
        autorizacionImagen: f.autorizacionImagen,
        autorizacionSalidas: f.autorizacionSalidas,
        observacionesTutor: trimOrUndef(f.observacionesTutor),
    });

    // Autoguardado: 1.5s tras el último cambio en CUALQUIER campo (mismo
    // criterio que ReunionesView.tsx) -- un único temporizador compartido
    // para los ~30 campos, ya que todos pasan por `set`/`setTutor`. `next`
    // se computa aquí mismo (no dentro de un `setForm(prev => ...)`, que
    // React invoca dos veces en StrictMode y duplicaría el guardado si
    // llevara el efecto secundario dentro -- ver el mismo bug ya
    // encontrado y corregido en AcademicConfigManager.tsx).
    const scheduleAutosave = (next: FormState) => {
        if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current.timer);
        const run = () => { pendingSaveRef.current = null; onSave(student.id, buildPayload(next)); };
        pendingSaveRef.current = { timer: setTimeout(run, 1500), run };
    };

    const set = (patch: Partial<FormState>) => {
        const next = { ...form, ...patch };
        setForm(next);
        scheduleAutosave(next);
    };
    const setTutor = (which: 'tutor1' | 'tutor2', patch: Partial<Tutor>) => {
        const next = { ...form, [which]: { ...form[which], ...patch } };
        setForm(next);
        scheduleAutosave(next);
    };

    const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        set({ foto: await fileToDataUrl(file) });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Cancela el temporizador sin lanzarlo -- ya vamos a guardar ahora.
        if (pendingSaveRef.current) { clearTimeout(pendingSaveRef.current.timer); pendingSaveRef.current = null; }
        onSave(student.id, buildPayload(form));
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Ficha personal — ${getNombreCompleto(student)}`} size="2xl">
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
                        <Field label="Primer apellido">
                            <Input type="text" value={form.primerApellido || ''} onChange={e => set({ primerApellido: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Segundo apellido">
                            <Input type="text" value={form.segundoApellido || ''} onChange={e => set({ segundoApellido: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Nombre de pila" className="sm:col-span-2">
                            <Input type="text" value={form.nombre || ''} onChange={e => set({ nombre: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Fecha de nacimiento">
                            <Input type="date" value={form.fechaNacimiento || ''} onChange={e => set({ fechaNacimiento: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="DNI/NIE (documento de identidad)">
                            <Input type="text" value={form.dni || ''} onChange={e => set({ dni: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="NIE — Nº Identificación Escolar (SAUCE)">
                            <Input type="text" value={form.nie || ''} onChange={e => set({ nie: e.target.value })} className={inputClass} />
                            <p className="mt-1 text-xs text-amber-700">
                                Muy recomendable rellenarlo: es el identificador único de SAUCE — no todo el alumnado tiene DNI, pero todos tienen NIE. Evita duplicados al importar.
                            </p>
                        </Field>
                        <Field label="Nacionalidad">
                            <Input type="text" value={form.nacionalidad || ''} onChange={e => set({ nacionalidad: e.target.value })} className={inputClass} />
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
                        <Field label="Nivel de referencia">
                            <Input type="text" value={form.ultimoCursoSauce || ''} onChange={e => set({ ultimoCursoSauce: e.target.value })} placeholder="Ej: 1º ESO" className={inputClass} />
                            <p className="mt-1 text-xs text-slate-400">
                                Nivel/grupo administrativo real del alumno/a, independiente de en qué clase-materia esté matriculado/a
                                (útil sobre todo para optativas con alumnado mezclado de varios grupos) — SAUCE lo actualiza solo al reimportar.
                            </p>
                        </Field>
                        <Field label="Grupo de referencia">
                            <Input type="text" value={form.ultimaUnidadSauce || ''} onChange={e => set({ ultimaUnidadSauce: e.target.value })} placeholder="Ej: A" className={inputClass} />
                        </Field>
                        <Field label="Programa específico (Diversificación, etc.)">
                            <Input type="text" value={form.programaEspecifico || ''} onChange={e => set({ programaEspecifico: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="¿Ha repetido curso?">
                            <SiNoToggle value={form.haRepetidoCurso} onChange={v => set({ haRepetidoCurso: v })} />
                        </Field>
                        <Field label="¿Programa bilingüe?">
                            <SiNoToggle value={form.programaBilingue} onChange={v => set({ programaBilingue: v })} />
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
                            <div className="space-y-3 mt-1 p-3 bg-slate-50 rounded-lg border border-slate-200">
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
                                                        checked={(form.acneae || []).includes(tag)}
                                                        onChange={e => {
                                                            const current = form.acneae || [];
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
                        </Field>
                        <Field label="En caso afirmativo, indicar">
                            <Input type="text" value={form.neaeDetalle || ''} onChange={e => set({ neaeDetalle: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="Medidas educativas aplicadas">
                            <Textarea value={form.medidasEducativas || ''} onChange={e => set({ medidasEducativas: e.target.value })} className={`${inputClass} h-16`} />
                        </Field>
                        <Field label="Indicaciones del PTI (Plan de Trabajo Individualizado)">
                            <Textarea value={form.indicacionesPti || ''} onChange={e => set({ indicacionesPti: e.target.value })} className={`${inputClass} h-16`} />
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
