import React, { useMemo, useState } from 'react';
import type { Meeting } from '../types';
import { TrashIcon, PlusIcon, UsersIcon, PencilIcon } from './Icons';
import { toYYYYMMDD, addDays, getDayOfWeek1a7, formatFechaEs } from '../utils';
import PageHeader from './PageHeader';
import Modal from './Modal';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';
import Button from './Button';

interface ReunionesViewProps {
    meetings: Meeting[];
    setMeetings: (updater: React.SetStateAction<Meeting[]>) => void;
}

const TIPO_LABEL: Record<Meeting['tipo'], string> = {
    tutoria: 'Tutoría',
    r_tutores: 'R. Tutores',
    departamento: 'Departamento',
    familia: 'Familia',
};

const TIPO_COLOR: Record<Meeting['tipo'], string> = {
    tutoria: 'bg-blue-100 text-blue-700',
    r_tutores: 'bg-amber-100 text-amber-700',
    departamento: 'bg-purple-100 text-purple-700',
    familia: 'bg-teal-100 text-teal-700',
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
const ReunionesView: React.FC<ReunionesViewProps> = ({ meetings, setMeetings }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [fecha, setFecha] = useState(toYYYYMMDD(new Date()));
    const [hora, setHora] = useState('');
    const [tipo, setTipo] = useState<Meeting['tipo']>('tutoria');
    const [conQuien, setConQuien] = useState('');
    const [motivo, setMotivo] = useState('');
    const [acuerdos, setAcuerdos] = useState('');
    const [seguimiento, setSeguimiento] = useState('');

    const hoy = new Date();
    const hoyStr = toYYYYMMDD(hoy);
    const finSemanaStr = finDeSemana(hoy);
    const finMesStr = finDeMes(hoy);

    const [rango, setRango] = useState<RangoFecha>('hoy');
    const [tipoFiltro, setTipoFiltro] = useState<Meeting['tipo'] | ''>('');
    const [busqueda, setBusqueda] = useState('');

    const resetForm = () => {
        setEditingId(null);
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
        setIsFormOpen(true);
    };

    const handleEdit = (m: Meeting) => {
        setEditingId(m.id);
        setFecha(m.fecha);
        setHora(m.hora || '');
        setTipo(m.tipo);
        setConQuien(m.conQuien || '');
        setMotivo(m.motivo || '');
        setAcuerdos(m.acuerdos || '');
        setSeguimiento(m.seguimiento || '');
        setIsFormOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const data = {
            fecha: fecha || toYYYYMMDD(new Date()),
            hora: hora || undefined,
            tipo,
            conQuien: conQuien.trim() || undefined,
            motivo: motivo.trim() || undefined,
            acuerdos: acuerdos.trim() || undefined,
            seguimiento: seguimiento.trim() || undefined,
        };

        if (editingId) {
            setMeetings(prev => prev.map(m => m.id === editingId ? { ...m, ...data } : m));
        } else {
            setMeetings(prev => [...prev, { id: `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, ...data }]);
        }
        setIsFormOpen(false);
        resetForm();
    };

    const handleDelete = (id: string) => {
        if (!window.confirm('¿Eliminar esta reunión?')) return;
        setMeetings(prev => prev.filter(m => m.id !== id));
        if (editingId === id) {
            setIsFormOpen(false);
            resetForm();
        }
    };

    const sorted = useMemo(() => [...meetings].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id)), [meetings]);

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
            <PageHeader title="Reuniones" subtitle="Tutorías, coordinación de tutores, departamento y familias." accent="teal" icon={<UsersIcon className="w-6 h-6" />} />

            <div className="bg-white rounded-xl shadow-sm border p-3 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <Input
                        type="text"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar por tipo, con quién, motivo..."
                        className="sm:flex-grow"
                    />
                    <Button variant="primary" onClick={handleOpenNew} className="flex-shrink-0">
                        <PlusIcon className="w-4 h-4" /> Nueva reunión
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
                    </Select>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border divide-y">
                {meetings.length === 0 ? (
                    <p className="p-6 text-center text-slate-400 text-sm">No hay reuniones registradas.</p>
                ) : filtered.length === 0 ? (
                    <p className="p-6 text-center text-slate-400 text-sm">Ninguna reunión coincide con el filtro actual.</p>
                ) : (
                    filtered.map(m => (
                        <div key={m.id} className="p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
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
                    ))
                )}
            </div>

            <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={editingId ? 'Editar reunión' : 'Nueva reunión'} size="lg">
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs font-medium text-slate-600">Fecha</label>
                            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full mt-1" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-600">Hora</label>
                            <Input type="time" value={hora} onChange={e => setHora(e.target.value)} className="w-full mt-1" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-600">Tipo</label>
                            <Select value={tipo} onChange={e => setTipo(e.target.value as Meeting['tipo'])} className="w-full mt-1">
                                <option value="tutoria">Tutoría</option>
                                <option value="r_tutores">R. Tutores</option>
                                <option value="departamento">Departamento</option>
                                <option value="familia">Familia</option>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Con quién</label>
                        <Input type="text" value={conQuien} onChange={e => setConQuien(e.target.value)} placeholder="Ej: Familia de..., Claustro, Equipo docente..." className="w-full mt-1" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Motivo</label>
                        <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} className="w-full mt-1" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Acuerdos</label>
                        <Textarea value={acuerdos} onChange={e => setAcuerdos(e.target.value)} rows={2} className="w-full mt-1" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Seguimiento</label>
                        <Textarea value={seguimiento} onChange={e => setSeguimiento(e.target.value)} rows={2} className="w-full mt-1" />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
                        <Button type="submit" variant="primary">
                            {editingId ? 'Guardar cambios' : 'Guardar'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ReunionesView;
