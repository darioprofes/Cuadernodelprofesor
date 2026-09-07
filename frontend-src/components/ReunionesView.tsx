import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { Meeting } from '../types';
import { TrashIcon, PlusIcon, UsersIcon, PencilIcon, ExclamationTriangleIcon, ClockIcon, CalendarDaysIcon } from './Icons';
import { toYYYYMMDD, addDays, getDayOfWeek1a7, formatFechaEs, TIPO_REUNION_LABEL as TIPO_LABEL } from '../utils';
import PageHeader from './PageHeader';
import { PAGE_ACCENT, PALETTE, SEMANTIC } from '../theme/palette';
import Input from './Input';
import Select from './Select';
import Button from './Button';
import ReunionEditorScreen from './ReunionEditorScreen';

interface ReunionesViewProps {
    meetings: Meeting[];
    // Devuelve el mapa id-provisional -> reunión real creada -- lo necesita
    // scheduleAutosave para corregir editingIdRef con el id que de verdad
    // asigna el servidor (ver el comentario de diffAndSyncList en
    // apiAdapters.ts para el bug real que esto evita).
    setMeetings: (updater: React.SetStateAction<Meeting[]>) => Promise<Map<string, Meeting>>;
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
    const [editingId, setEditingId] = useState<string | null>(null);
    const [fecha, setFecha] = useState(toYYYYMMDD(new Date()));
    const [hora, setHora] = useState('');
    const [tipo, setTipo] = useState<Meeting['tipo']>('tutoria');
    const [conQuien, setConQuien] = useState('');
    const [motivo, setMotivo] = useState('');
    const [acuerdos, setAcuerdos] = useState('');
    const [seguimiento, setSeguimiento] = useState('');
    const [acta, setActa] = useState('');
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
        setActa('');
    };

    const handleOpenNew = () => {
        resetForm();
        setIsFormOpen(true);
    };

    // Crea la reunión ya mismo (fecha/hora actuales) -- pensado para
    // pulsarlo según se sienta a la reunión, sin tener que rellenar nada
    // antes de poder empezar a escribir.
    const handleOpenNow = () => {
        resetForm();
        setFecha(toYYYYMMDD(new Date()));
        setHora(new Date().toTimeString().slice(0, 5));
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
        setActa(m.acta || '');
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

    type ReunionFormValues = { fecha: string; hora: string; tipo: Meeting['tipo']; conQuien: string; motivo: string; acuerdos: string; seguimiento: string; acta: string };

    const buildData = (v: ReunionFormValues) => ({
        fecha: v.fecha || toYYYYMMDD(new Date()),
        hora: v.hora || undefined,
        tipo: v.tipo,
        conQuien: v.conQuien.trim() || undefined,
        motivo: v.motivo.trim() || undefined,
        acuerdos: v.acuerdos.trim() || undefined,
        seguimiento: v.seguimiento.trim() || undefined,
        acta: v.acta.trim() || undefined,
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
        const snapshot: ReunionFormValues = { fecha, hora, tipo, conQuien, motivo, acuerdos, seguimiento, acta, ...overrides };
        const data = buildData(snapshot);

        cancelPendingSave();
        const run = () => {
            pendingSaveRef.current = null;
            const idToUse = editingIdRef.current;
            if (idToUse) {
                setMeetings(prev => prev.map(m => m.id === idToUse ? { ...m, ...data } : m));
            } else {
                const newId = `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                setEditingIdBoth(newId);
                // El id provisional de arriba nunca existe en el servidor --
                // en cuanto la caché de react-query se refresque con el id
                // real (UUID) que asigna el backend, cualquier autoguardado
                // posterior que siga usando el provisional no encontraría
                // ninguna fila que actualizar y el cambio se perdería en
                // silencio (bug real, confirmado 2026-09-07). Se corrige
                // editingIdRef en cuanto se conoce el id real -- salvo que
                // mientras tanto ya se haya cerrado y abierto otra reunión
                // (entonces editingIdRef ya no apunta a este id provisional
                // y no hay nada que corregir).
                setMeetings(prev => [...prev, { id: newId, ...data }]).then(created => {
                    const real = created.get(newId);
                    if (real && editingIdRef.current === newId) setEditingIdBoth(real.id);
                });
            }
        };
        pendingSaveRef.current = { timer: setTimeout(run, 1500), run };
    };

    // Cerrar la pantalla: no hay un botón "Guardar" visible (todo va por
    // autoguardado), así que cerrar tiene que VOLCAR cualquier cambio
    // pendiente en vez de descartarlo.
    const handleCloseForm = () => {
        if (pendingSaveRef.current) {
            clearTimeout(pendingSaveRef.current.timer);
            pendingSaveRef.current.run();
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

    if (isFormOpen) {
        return (
            <div className="space-y-6">
                <ReunionEditorScreen
                    onClose={handleCloseForm}
                    onDelete={editingId ? () => handleDelete(editingId) : undefined}
                    fecha={fecha}
                    onFechaChange={v => { setFecha(v); scheduleAutosave({ fecha: v }); }}
                    hora={hora}
                    onHoraChange={v => { setHora(v); scheduleAutosave({ hora: v }); }}
                    tipo={tipo}
                    onTipoChange={v => { setTipo(v); scheduleAutosave({ tipo: v }); }}
                    conQuien={conQuien}
                    onConQuienChange={v => { setConQuien(v); scheduleAutosave({ conQuien: v }); }}
                    motivo={motivo}
                    onMotivoChange={v => { setMotivo(v); scheduleAutosave({ motivo: v }); }}
                    acuerdos={acuerdos}
                    onAcuerdosChange={v => { setAcuerdos(v); scheduleAutosave({ acuerdos: v }); }}
                    seguimiento={seguimiento}
                    onSeguimientoChange={v => { setSeguimiento(v); scheduleAutosave({ seguimiento: v }); }}
                    acta={acta}
                    onActaChange={v => { setActa(v); scheduleAutosave({ acta: v }); }}
                />
            </div>
        );
    }

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
                        <div
                            key={m.id}
                            onClick={() => handleEdit(m)}
                            className="p-4 first:rounded-t-xl last:rounded-b-xl cursor-pointer hover:bg-slate-50"
                            style={{ boxShadow: `inset 4px 0 0 0 ${TIPO_ACCENT[m.tipo]}` }}
                        >
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
                                    <button onClick={e => { e.stopPropagation(); handleEdit(m); }} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-full" title="Editar">
                                        <PencilIcon className="w-4 h-4" />
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); handleDelete(m.id); }} className="p-1.5 text-slate-400 hover:text-red-500 rounded-full" title="Eliminar">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            {m.motivo && <p className="text-sm font-semibold text-slate-700 mt-1 truncate">{m.motivo}</p>}
                        </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default ReunionesView;
