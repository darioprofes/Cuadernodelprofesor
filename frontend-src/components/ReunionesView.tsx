import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { Meeting } from '../types';
import { TrashIcon, PlusIcon, UsersIcon, PencilIcon, ExclamationTriangleIcon, ClockIcon, CalendarDaysIcon } from './Icons';
import { toYYYYMMDD, addDays, getDayOfWeek1a7, formatFechaEs, TIPO_REUNION_LABEL as TIPO_LABEL } from '../utils';
import PageHeader from './PageHeader';
import { PAGE_ACCENT, PALETTE, SEMANTIC } from '../theme/palette';
import Modal from './Modal';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';
import Button from './Button';

interface ReunionesViewProps {
    meetings: Meeting[];
    setMeetings: (updater: React.SetStateAction<Meeting[]>) => void;
    /** Id de una reunión a abrir en el formulario de edición en cuanto se
     * monta esta vista (p.ej. al pinchar una reunión en la Agenda). */
    openMeetingId?: string | null;
    onOpened?: () => void;
}

const TIPO_COLOR: Record<Meeting['tipo'], string> = {
    tutoria: 'bg-blue-100 text-blue-700',
    r_tutores: 'bg-amber-100 text-amber-700',
    departamento: 'bg-purple-100 text-purple-700',
    familia: 'bg-teal-100 text-teal-700',
    otras: 'bg-slate-100 text-slate-700',
};

// Mismo color que TIPO_COLOR de arriba pero en hex (tono "700" de cada
// familia) -- hace falta como valor real para el acento de la fila
// (box-shadow inset), no solo como clase de Tailwind para el badge.
const TIPO_ACCENT: Record<Meeting['tipo'], string> = {
    tutoria: '#1d4ed8',
    r_tutores: '#b45309',
    departamento: '#7e22ce',
    familia: '#0f766e',
    otras: '#475569',
};

type RangoFecha = 'hoy' | 'semana' | 'mes' | 'todas';

const finDeSemana = (hoy: Date): string => toYYYYMMDD(addDays(hoy, 7 - getDayOfWeek1a7(hoy)));
const finDeMes = (hoy: Date): string => toYYYYMMDD(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));

// Registro de reuniones, deliberadamente más estructurado que el Diario de
// Clase (que solo tiene un campo de texto libre por clase/día): fecha,
// tipo, con quién, motivo, acuerdos y seguimiento por separado. El
// formulario vive en un popup (antes estaba siempre visible arriba de la
// lista) para que la vista por defecto sea la lista + un botón de añadir,
// igual que en Tareas evaluables. "R. Tutores" (coordinación de tutores de
// un nivel con Jefatura y Orientación) es un tipo más, distinto de una
// tutoría 1 a 1 con familia/alumno.
const ReunionesView: React.FC<ReunionesViewProps> = ({ meetings, setMeetings, openMeetingId, onOpened }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    // "Reunión ahora" abre directo en una pantalla reducida (tipo + con
    // quién + un único cuadro de notas grande) pensada para tenerla abierta
    // EN la reunión, sin ir a buscar fecha/hora/motivo/seguimiento -- esos
    // campos siguen ahí, solo replegados (ver "Más campos" más abajo).
    const [modoReunion, setModoReunion] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [fecha, setFecha] = useState(toYYYYMMDD(new Date()));
    const [hora, setHora] = useState('');
    const [tipo, setTipo] = useState<Meeting['tipo']>('tutoria');
    const [conQuien, setConQuien] = useState('');
    const [motivo, setMotivo] = useState('');
    const [acuerdos, setAcuerdos] = useState('');
    const [seguimiento, setSeguimiento] = useState('');
    // editingIdRef espeja a editingId (estado) pero de lectura/escritura
    // síncrona -- el autoguardado debounced (ver scheduleAutosave) lo
    // necesita para decidir crear-vs-actualizar sin arriesgarse a un
    // closure obsoleto si el usuario teclea de nuevo justo después de que
    // el primer autoguardado cree la reunión (antes de que ese
    // setEditingId(state) haya vuelto a renderizar).
    const editingIdRef = useRef<string | null>(null);
    const pendingSaveRef = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);

    const setEditingIdBoth = (id: string | null) => {
        editingIdRef.current = id;
        setEditingId(id);
    };

    const cancelPendingSave = () => {
        if (pendingSaveRef.current) { clearTimeout(pendingSaveRef.current.timer); pendingSaveRef.current = null; }
    };

    const hoy = new Date();
    const hoyStr = toYYYYMMDD(hoy);
    const finSemanaStr = finDeSemana(hoy);
    const finMesStr = finDeMes(hoy);

    const [rango, setRango] = useState<RangoFecha>('hoy');
    const [tipoFiltro, setTipoFiltro] = useState<Meeting['tipo'] | ''>('');
    const [busqueda, setBusqueda] = useState('');

    const resetForm = () => {
        cancelPendingSave();
        setEditingIdBoth(null);
        setFecha(toYYYYMMDD(new Date()));
        setHora('');
        setTipo('tutoria');
        setConQuien('');
        setMotivo('');
        setAcuerdos('');
        setSeguimiento('');
    };

    const handleOpenNew = () => {
        resetForm();
        setModoReunion(false);
        setIsFormOpen(true);
    };

    // Crea la reunión ya mismo (fecha/hora actuales) y entra directo en modo
    // reunión -- pensado para pulsarlo según se sienta a la reunión, sin
    // tener que rellenar nada antes de poder empezar a escribir.
    const handleOpenNow = () => {
        resetForm();
        setFecha(toYYYYMMDD(new Date()));
        setHora(new Date().toTimeString().slice(0, 5));
        setModoReunion(true);
        setIsFormOpen(true);
    };

    const handleEdit = (m: Meeting) => {
        cancelPendingSave();
        setEditingIdBoth(m.id);
        setFecha(m.fecha);
        setHora(m.hora || '');
        setTipo(m.tipo);
        setConQuien(m.conQuien || '');
        setMotivo(m.motivo || '');
        setAcuerdos(m.acuerdos || '');
        setSeguimiento(m.seguimiento || '');
        setModoReunion(true);
        setIsFormOpen(true);
    };

    // Al desmontar (se navega a otra vista del menú mientras el formulario
    // tenía algo sin guardar), lanza de inmediato cualquier autoguardado
    // pendiente en vez de perderlo.
    useEffect(() => () => {
        if (pendingSaveRef.current) { clearTimeout(pendingSaveRef.current.timer); pendingSaveRef.current.run(); }
    }, []);

    // Llegada desde la Agenda con una reunión concreta que abrir.
    useEffect(() => {
        if (!openMeetingId) return;
        const meeting = meetings.find(m => m.id === openMeetingId);
        if (meeting) handleEdit(meeting);
        onOpened?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openMeetingId]);

    type ReunionFormValues = { fecha: string; hora: string; tipo: Meeting['tipo']; conQuien: string; motivo: string; acuerdos: string; seguimiento: string };

    const buildData = (v: ReunionFormValues) => ({
        fecha: v.fecha || toYYYYMMDD(new Date()),
        hora: v.hora || undefined,
        tipo: v.tipo,
        conQuien: v.conQuien.trim() || undefined,
        motivo: v.motivo.trim() || undefined,
        acuerdos: v.acuerdos.trim() || undefined,
        seguimiento: v.seguimiento.trim() || undefined,
    });

    // Autoguardado: 1.5s tras la última pulsación en CUALQUIER campo del
    // formulario (mismo intervalo que ClassJournal.tsx y compañía) -- un
    // único temporizador compartido para los 7 campos, no uno por campo,
    // así que escribir en "Motivo" y luego en "Acuerdos" no dispara dos
    // guardados sueltos. `overrides` lleva el campo recién tecleado (su
    // setState todavía no se habría reflejado en el resto de variables de
    // estado al construir este closure). Si todavía no existe la reunión
    // (editingIdRef.current === null), el PRIMER autoguardado la crea y
    // memoriza su id (vía editingIdRef, síncrono) para que los siguientes
    // autoguardados actualicen esa misma fila en vez de crear duplicados.
    const scheduleAutosave = (overrides: Partial<ReunionFormValues>) => {
        const snapshot: ReunionFormValues = { fecha, hora, tipo, conQuien, motivo, acuerdos, seguimiento, ...overrides };
        const data = buildData(snapshot);

        cancelPendingSave();
        const run = () => {
            pendingSaveRef.current = null;
            const idToUse = editingIdRef.current;
            if (idToUse) {
                setMeetings(prev => prev.map(m => m.id === idToUse ? { ...m, ...data } : m));
            } else {
                const newId = `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                setMeetings(prev => [...prev, { id: newId, ...data }]);
                setEditingIdBoth(newId);
            }
        };
        pendingSaveRef.current = { timer: setTimeout(run, 1500), run };
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        cancelPendingSave();

        const data = buildData({ fecha, hora, tipo, conQuien, motivo, acuerdos, seguimiento });

        if (editingId) {
            setMeetings(prev => prev.map(m => m.id === editingId ? { ...m, ...data } : m));
        } else {
            setMeetings(prev => [...prev, { id: `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, ...data }]);
        }
        setIsFormOpen(false);
        resetForm();
    };

    // Cerrar el formulario: en modo reunión no hay un botón "Guardar" visible
    // (todo va por autoguardado), así que cerrar tiene que VOLCAR cualquier
    // cambio pendiente en vez de descartarlo -- a diferencia de "Cancelar" en
    // el formulario normal, que si descarta a propósito (mismo criterio que
    // el resto de la app: cancelar es cancelar).
    const handleCloseForm = () => {
        if (modoReunion && pendingSaveRef.current) {
            clearTimeout(pendingSaveRef.current.timer);
            pendingSaveRef.current.run();
        } else {
            cancelPendingSave();
        }
        setIsFormOpen(false);
    };

    const handleDelete = (id: string) => {
        if (!window.confirm('¿Eliminar esta reunión?')) return;
        if (editingId === id) cancelPendingSave();
        setMeetings(prev => prev.filter(m => m.id !== id));
        if (editingId === id) {
            setIsFormOpen(false);
            resetForm();
        }
    };

    const sorted = useMemo(() => [...meetings].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id)), [meetings]);

    // Icono + color según la urgencia de la fecha -- mismo criterio que
    // Tareas evaluables (un color por "tipo", aquí el tipo es la cercanía
    // de la fecha en vez del formato del instrumento).
    const urgencia = (fecha: string): { Icon: React.FC<{ className?: string }>; color: string } => {
        if (fecha < hoyStr) return { Icon: ExclamationTriangleIcon, color: SEMANTIC.danger.base };
        if (fecha === hoyStr) return { Icon: ClockIcon, color: PALETTE.sand.header };
        return { Icon: CalendarDaysIcon, color: PALETTE.blue.header };
    };

    const filtered = useMemo(() => {
        const query = busqueda.trim().toLowerCase();
        return sorted.filter(m => {
            if (rango !== 'todas' && m.fecha < hoyStr) return false;
            if (rango === 'semana' && m.fecha > finSemanaStr) return false;
            if (rango === 'mes' && m.fecha > finMesStr) return false;
            if (tipoFiltro && m.tipo !== tipoFiltro) return false;
            if (!query) return true;
            const haystack = [TIPO_LABEL[m.tipo], m.conQuien, m.motivo, m.acuerdos, m.seguimiento].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(query);
        });
    }, [sorted, rango, tipoFiltro, busqueda, hoyStr, finSemanaStr, finMesStr]);

    return (
        <div className="space-y-6">
            <PageHeader title="Reuniones" subtitle="Tutorías, coordinación de tutores, departamento y familias." accent={PAGE_ACCENT.reuniones} icon={<UsersIcon className="w-6 h-6" />} />

            <div className="bg-white rounded-xl shadow-sm border p-3 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <Input
                        type="text"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar por tipo, con quién, motivo..."
                        className="sm:flex-grow"
                    />
                    <Button variant="secondary" onClick={handleOpenNew} className="flex-shrink-0">
                        <PlusIcon className="w-4 h-4" /> Nueva reunión
                    </Button>
                    <Button variant="primary" onClick={handleOpenNow} className="flex-shrink-0">
                        <ClockIcon className="w-4 h-4" /> Reunión ahora
                    </Button>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <Select value={rango} onChange={e => setRango(e.target.value as RangoFecha)} className="sm:w-auto">
                        <option value="hoy">Desde hoy</option>
                        <option value="semana">Esta semana</option>
                        <option value="mes">Este mes</option>
                        <option value="todas">Todas (incluye pasadas)</option>
                    </Select>
                    <Select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as Meeting['tipo'] | '')} className="sm:w-auto">
                        <option value="">Todos los tipos</option>
                        <option value="tutoria">Tutoría</option>
                        <option value="r_tutores">R. Tutores</option>
                        <option value="departamento">Departamento</option>
                        <option value="familia">Familia</option>
                        <option value="otras">Otras</option>
                    </Select>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border divide-y overflow-hidden">
                {meetings.length === 0 ? (
                    <p className="p-6 text-center text-slate-400 text-sm">No hay reuniones registradas.</p>
                ) : filtered.length === 0 ? (
                    <p className="p-6 text-center text-slate-400 text-sm">Ninguna reunión coincide con el filtro actual.</p>
                ) : (
                    filtered.map(m => {
                        const { Icon: UrgenciaIcon, color: urgenciaColor } = urgencia(m.fecha);
                        return (
                        <div key={m.id} className="p-4 first:rounded-t-xl last:rounded-b-xl" style={{ boxShadow: `inset 4px 0 0 0 ${TIPO_ACCENT[m.tipo]}` }}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="flex-shrink-0" style={{ color: urgenciaColor }}>
                                        <UrgenciaIcon className="w-4 h-4" />
                                    </span>
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TIPO_COLOR[m.tipo]}`}>{TIPO_LABEL[m.tipo]}</span>
                                    <span className="text-xs text-slate-400">{formatFechaEs(m.fecha)}{m.hora ? ` · ${m.hora}` : ''}</span>
                                    {m.conQuien && <span className="text-sm font-medium text-slate-800">{m.conQuien}</span>}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button onClick={() => handleEdit(m)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-full" title="Editar">
                                        <PencilIcon className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(m.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-full" title="Eliminar">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 space-y-1 text-sm text-slate-600">
                                {m.motivo && <p><span className="font-semibold text-slate-700">Motivo:</span> {m.motivo}</p>}
                                {m.acuerdos && <p><span className="font-semibold text-slate-700">Acuerdos:</span> {m.acuerdos}</p>}
                                {m.seguimiento && <p><span className="font-semibold text-slate-700">Seguimiento:</span> {m.seguimiento}</p>}
                            </div>
                        </div>
                        );
                    })
                )}
            </div>

            <Modal isOpen={isFormOpen} onClose={handleCloseForm} title={editingId ? 'Editar reunión' : (modoReunion ? 'Reunión en curso' : 'Nueva reunión')} size="full">
                {modoReunion ? (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            {(['tutoria', 'r_tutores', 'departamento', 'familia', 'otras'] as const).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => { setTipo(t); scheduleAutosave({ tipo: t }); }}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${tipo === t ? `${TIPO_COLOR[t]} border-transparent` : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                >
                                    {TIPO_LABEL[t]}
                                </button>
                            ))}
                        </div>
                        <Input
                            type="text"
                            value={conQuien}
                            onChange={e => { setConQuien(e.target.value); scheduleAutosave({ conQuien: e.target.value }); }}
                            placeholder="Con quién (Familia de..., Claustro, Equipo docente...)"
                            className="w-full"
                        />
                        <Textarea
                            autoFocus
                            value={acuerdos}
                            onChange={e => { setAcuerdos(e.target.value); scheduleAutosave({ acuerdos: e.target.value }); }}
                            rows={16}
                            className="w-full font-mono text-sm"
                            placeholder="Empieza a escribir -- se guarda solo mientras hablas..."
                        />
                        <details className="text-sm">
                            <summary className="cursor-pointer text-slate-500 font-medium select-none">Más campos (fecha, hora, motivo, seguimiento)</summary>
                            <div className="mt-3 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-slate-600">Fecha</label>
                                        <Input type="date" value={fecha} onChange={e => { setFecha(e.target.value); scheduleAutosave({ fecha: e.target.value }); }} className="w-full mt-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-600">Hora</label>
                                        <Input type="time" value={hora} onChange={e => { setHora(e.target.value); scheduleAutosave({ hora: e.target.value }); }} className="w-full mt-1" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-600">Motivo</label>
                                    <Textarea value={motivo} onChange={e => { setMotivo(e.target.value); scheduleAutosave({ motivo: e.target.value }); }} rows={2} className="w-full mt-1" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-600">Seguimiento</label>
                                    <Textarea value={seguimiento} onChange={e => { setSeguimiento(e.target.value); scheduleAutosave({ seguimiento: e.target.value }); }} rows={3} className="w-full mt-1" />
                                </div>
                            </div>
                        </details>
                        <div className="flex items-center justify-end pt-2">
                            <Button type="button" variant="primary" onClick={handleCloseForm}>Cerrar</Button>
                        </div>
                    </div>
                ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs font-medium text-slate-600">Fecha</label>
                            <Input type="date" value={fecha} onChange={e => { setFecha(e.target.value); scheduleAutosave({ fecha: e.target.value }); }} className="w-full mt-1" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-600">Hora</label>
                            <Input type="time" value={hora} onChange={e => { setHora(e.target.value); scheduleAutosave({ hora: e.target.value }); }} className="w-full mt-1" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-600">Tipo</label>
                            <Select value={tipo} onChange={e => { setTipo(e.target.value as Meeting['tipo']); scheduleAutosave({ tipo: e.target.value as Meeting['tipo'] }); }} className="w-full mt-1">
                                <option value="tutoria">Tutoría</option>
                                <option value="r_tutores">R. Tutores</option>
                                <option value="departamento">Departamento</option>
                                <option value="familia">Familia</option>
                                <option value="otras">Otras</option>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Con quién</label>
                        <Input type="text" value={conQuien} onChange={e => { setConQuien(e.target.value); scheduleAutosave({ conQuien: e.target.value }); }} placeholder="Ej: Familia de..., Claustro, Equipo docente..." className="w-full mt-1" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Motivo</label>
                        <Textarea value={motivo} onChange={e => { setMotivo(e.target.value); scheduleAutosave({ motivo: e.target.value }); }} rows={2} className="w-full mt-1" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Acuerdos</label>
                        <Textarea value={acuerdos} onChange={e => { setAcuerdos(e.target.value); scheduleAutosave({ acuerdos: e.target.value }); }} rows={6} className="w-full mt-1" placeholder="Notas de la reunión: lo que se ha hablado y acordado..." />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Seguimiento</label>
                        <Textarea value={seguimiento} onChange={e => { setSeguimiento(e.target.value); scheduleAutosave({ seguimiento: e.target.value }); }} rows={3} className="w-full mt-1" />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={() => { cancelPendingSave(); setIsFormOpen(false); }}>Cancelar</Button>
                        <Button type="submit" variant="primary">
                            {editingId ? 'Guardar cambios' : 'Guardar'}
                        </Button>
                    </div>
                </form>
                )}
            </Modal>
        </div>
    );
};

export default ReunionesView;
