import React, { useMemo, useState, useEffect } from 'react';
import type { ClassData, Course, AcademicConfiguration, Task, Meeting, View } from '../types';
import ClassLabel from './ClassLabel';
import BannerCostero from './BannerCostero';
import Input from './Input';
import { getDayOfWeek1a7, toYYYYMMDD, addDays, parsePeriodRange } from '../utils';
import { ClockIcon, CheckCircleIcon, CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon, PlusIcon } from './Icons';
import { PALETTE } from '../theme/palette';
import { linkClassName } from '../theme/components/Link';

interface HoyViewProps {
    classes: ClassData[];
    courses: Course[];
    academicConfiguration: AcademicConfiguration;
    tasks: Task[];
    setTasks: (updater: React.SetStateAction<Task[]>) => void;
    meetings: Meeting[];
    setActiveView: (view: View) => void;
    setActiveClassId: (id: string) => void;
}

const saludo = (hora: number): string => {
    if (hora < 13) return 'Buenos días';
    if (hora < 20) return 'Buenas tardes';
    return 'Buenas noches';
};

interface SlotHoy {
    classId: string;
    periodIndex: number;
    periodName: string;
    aula?: string;
}

const HoyView: React.FC<HoyViewProps> = ({ classes, courses, academicConfiguration, tasks, setTasks, meetings, setActiveView, setActiveClassId }) => {
    // `new Date()` solo se recalcularía en cada render: sin este tick, si no
    // hay ninguna otra interacción la vista se queda con la hora congelada
    // en el momento en que se montó (p.ej. tras cambiar la hora del sistema
    // y no volver a tocar nada, "Ahora" no se entera del cambio).
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(id);
    }, []);

    const periods = academicConfiguration.periods || [];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const hoyStr = toYYYYMMDD(now);

    const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(hoyStr);
    const esHoy = fechaSeleccionada === hoyStr;
    const viewDate = new Date(fechaSeleccionada);
    const dow = getDayOfWeek1a7(viewDate);

    const handleOpenCuaderno = (classId: string) => {
        setActiveClassId(classId);
        setActiveView('gradebook');
    };

    const handleDiaAnterior = () => setFechaSeleccionada(toYYYYMMDD(addDays(viewDate, -1)));
    const handleDiaSiguiente = () => setFechaSeleccionada(toYYYYMMDD(addDays(viewDate, 1)));
    const handleIrAHoy = () => setFechaSeleccionada(hoyStr);

    const construirSlots = (diaSemana: number): SlotHoy[] => {
        if (diaSemana > 5) return [];
        const rows: SlotHoy[] = [];
        classes.forEach(c => {
            (c.schedule || []).forEach(slot => {
                if (slot.day === diaSemana) {
                    rows.push({
                        classId: c.id,
                        periodIndex: slot.periodIndex,
                        periodName: periods[slot.periodIndex] || `Periodo ${slot.periodIndex + 1}`,
                        aula: slot.aula,
                    });
                }
            });
        });
        return rows.sort((a, b) => a.periodIndex - b.periodIndex);
    };

    // Horario del día que se está navegando (para el panel "Horario de...").
    // construirSlots excluida a propósito: es una función recreada en cada
    // render, pero solo lee `classes` y `periods` (además de su propio
    // parámetro `dow`), y las tres ya están en este array — no hay nada más
    // de lo que depender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const slotsDia: SlotHoy[] = useMemo(() => construirSlots(dow), [classes, dow, periods]);

    // Compara la hora REAL contra el horario del día navegado (no
    // necesariamente hoy) para saber qué franja está en curso ahora mismo;
    // se usa para destacarla en el listado de "Horario de...".
    const actual = useMemo(() => {
        for (const slot of slotsDia) {
            const range = parsePeriodRange(slot.periodName);
            if (range && nowMinutes >= range.startMin && nowMinutes < range.endMin) {
                return slot;
            }
        }
        return null;
    }, [slotsDia, nowMinutes]);

    // Se muestran TODAS (pendientes primero, luego hechas) para que marcar
    // como hecha no dé la sensación de borrar la tarea: solo desaparece al
    // pulsar el icono de borrar, y con confirmación previa.
    const tareasOrdenadas = [...tasks].sort((a, b) => Number(a.hecho) - Number(b.hecho));
    const tareasPendientes = tasks.filter(t => !t.hecho);

    const [nuevaTareaTexto, setNuevaTareaTexto] = useState('');

    const handleAgregarTarea = (e: React.FormEvent) => {
        e.preventDefault();
        const texto = nuevaTareaTexto.trim();
        if (!texto) return;
        const nuevaTarea: Task = {
            id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            texto,
            hecho: false,
        };
        setTasks(prev => [...prev, nuevaTarea]);
        setNuevaTareaTexto('');
    };

    const handleToggleTarea = (id: string) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, hecho: !t.hecho } : t));
    };

    const handleEliminarTarea = (id: string, texto: string) => {
        if (!window.confirm(`¿Eliminar la tarea "${texto}"?`)) return;
        setTasks(prev => prev.filter(t => t.id !== id));
    };

    // Tareas evaluables: mismo criterio que la vista "Tareas evaluables"
    // (fecha estrictamente futura, ni hoy ni pasada).
    const contarEventosEnVentana = (dias: number): { tareasEvaluables: number; reuniones: number } => {
        const limite = toYYYYMMDD(addDays(now, dias));
        let tareasEvaluables = 0, reuniones = 0;
        meetings.forEach(m => { if (m.fecha >= hoyStr && m.fecha <= limite) reuniones++; });
        classes.forEach(c => c.assignments.forEach(a => {
            if (a.date && a.date > hoyStr && a.date <= limite) tareasEvaluables++;
        }));
        return { tareasEvaluables, reuniones };
    };

    return (
        <div className="space-y-6">
            <div className="relative overflow-hidden rounded-xl p-6 flex items-center justify-between flex-wrap gap-3 min-h-[9rem]" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #e0f2fe 100%)' }}>
                <BannerCostero className="absolute inset-0 w-full h-full pointer-events-none select-none" />
                <div className="relative z-10">
                    <p className="text-xl font-bold text-slate-800">{saludo(now.getHours())}! 👋</p>
                    <p className="text-sm text-slate-600">Todo listo para un día productivo.</p>
                </div>
                <div className="relative z-10 flex items-center gap-0.5 bg-white/80 backdrop-blur-sm shadow-sm rounded-full pl-1 pr-2 py-1">
                    <button onClick={handleDiaAnterior} className="p-1 rounded-full text-slate-600 hover:bg-white" title="Día anterior">
                        <ChevronLeftIcon className="w-4 h-4" />
                    </button>
                    <input
                        type="date"
                        value={fechaSeleccionada}
                        onChange={(e) => setFechaSeleccionada(e.target.value)}
                        className="text-xs text-slate-700 bg-transparent border-none focus:outline-none w-[6.5rem]"
                    />
                    <button onClick={handleDiaSiguiente} className="p-1 rounded-full text-slate-600 hover:bg-white" title="Día siguiente">
                        <ChevronRightIcon className="w-4 h-4" />
                    </button>
                    {!esHoy && (
                        <button onClick={handleIrAHoy} className={`text-xs font-semibold pl-1 ${linkClassName}`} title="Ir a hoy">
                            Hoy
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden h-full flex flex-col">
                    <div className="px-4 py-2 flex items-center justify-between text-white text-sm font-semibold" style={{ backgroundColor: PALETTE.green.header }}>
                        <span className="flex items-center gap-1.5"><CheckCircleIcon className="w-4 h-4" /> Tareas pendientes</span>
                        {tareasPendientes.length > 0 && (
                            <span className="text-[10px] font-semibold bg-white/25 rounded-full px-2 py-0.5 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-white/90"></span>{tareasPendientes.length}
                            </span>
                        )}
                    </div>
                    <div className="p-4 flex-grow">
                    {tareasOrdenadas.length === 0 ? (
                        <div className="flex items-center gap-3">
                            <div className="flex-grow min-w-0">
                                <p className="font-semibold text-slate-800">Sin tareas pendientes</p>
                                <p className="text-sm text-slate-500 mt-0.5">¡Enhorabuena! Todo al día.</p>
                            </div>
                            <img src="/illustrations/clipboard-checklist.png" alt="" className="w-20 h-20 object-contain flex-shrink-0 pointer-events-none select-none" />
                        </div>
                    ) : (
                        <ul className="space-y-1">
                            {tareasOrdenadas.map(t => (
                                <li key={t.id} className="text-sm text-slate-700 flex items-center gap-2 group">
                                    <button
                                        type="button"
                                        onClick={() => handleToggleTarea(t.id)}
                                        title={t.hecho ? 'Marcar como pendiente' : 'Marcar como hecha'}
                                        className={`w-4 h-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                                            t.hecho ? '' : 'border-slate-300 hover:border-[#7aab74]'
                                        }`}
                                        style={t.hecho ? { backgroundColor: PALETTE.green.header, borderColor: PALETTE.green.header } : undefined}
                                    >
                                        {t.hecho && <CheckCircleIcon className="w-3 h-3 text-white" />}
                                    </button>
                                    <span className={`truncate flex-grow ${t.hecho ? 'line-through text-slate-400' : ''}`}>{t.texto}</span>
                                    {!t.hecho && t.fechaFin && t.fechaFin < hoyStr && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex-shrink-0">Vencida</span>}
                                    <button
                                        type="button"
                                        onClick={() => handleEliminarTarea(t.id, t.texto)}
                                        title="Eliminar tarea"
                                        className="flex-shrink-0 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <form onSubmit={handleAgregarTarea} className="mt-3 flex items-center gap-2">
                        <Input
                            type="text"
                            value={nuevaTareaTexto}
                            onChange={e => setNuevaTareaTexto(e.target.value)}
                            placeholder="Nueva tarea..."
                            className="flex-grow px-2 py-1.5"
                        />
                        <button
                            type="submit"
                            title="Añadir tarea"
                            className="flex-shrink-0 p-1.5 rounded-lg text-white hover:opacity-90 disabled:opacity-40"
                            style={{ backgroundColor: PALETTE.green.header }}
                            disabled={!nuevaTareaTexto.trim()}
                        >
                            <PlusIcon className="w-4 h-4" />
                        </button>
                    </form>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border overflow-hidden h-full flex flex-col">
                    <div className="px-4 py-2 flex items-center gap-1.5 text-white text-sm font-semibold" style={{ backgroundColor: PALETTE.blue.header }}>
                        <ClockIcon className="w-4 h-4" />
                        <h3>{esHoy ? 'Horario de hoy' : `Horario del ${viewDate.toLocaleDateString('es-ES', { weekday: 'long' })}`}</h3>
                    </div>
                    <div className="p-4 flex-grow">
                    {slotsDia.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center py-4">
                            <img src="/illustrations/calendar-check.png" alt="" className="w-40 h-40 object-contain pointer-events-none select-none mb-2" />
                            <p className="text-sm text-slate-400">{esHoy ? 'No hay clases hoy.' : 'No hay clases ese día.'}</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {slotsDia.map(slot => {
                                const cls = classes.find(c => c.id === slot.classId);
                                if (!cls) return null;
                                // Solo se destaca cuando de verdad es "ahora": el día
                                // navegado es hoy Y esta es la franja en curso (nunca
                                // al navegar a otro día, aunque coincida la hora).
                                const esFranjaActual = esHoy && actual !== null
                                    && actual.classId === slot.classId
                                    && actual.periodIndex === slot.periodIndex;
                                return (
                                    <button
                                        key={`${slot.classId}-${slot.periodIndex}`}
                                        onClick={() => handleOpenCuaderno(slot.classId)}
                                        className={`w-full flex items-center gap-2 text-left p-2 rounded-lg border-l-2 transition-colors ${
                                            esFranjaActual ? 'bg-[#fbf1dc] border-[#d9b878]' : 'hover:bg-slate-50 border-blue-400'
                                        }`}
                                    >
                                        <span className="text-xs text-slate-400 flex-shrink-0 w-24">{slot.periodName}</span>
                                        <ClassLabel classData={cls} courses={courses} className="text-sm font-medium text-slate-700 truncate" />
                                        {slot.aula && <span className="text-xs text-slate-400 flex-shrink-0">Aula {slot.aula}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="px-4 py-2 flex items-center gap-1.5 text-white text-sm font-semibold" style={{ backgroundColor: PALETTE.navy.header }}>
                    <CalendarDaysIcon className="w-4 h-4" /> Próximos eventos
                </div>
                <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                        { label: 'Próximas 24 horas', dias: 1 },
                        { label: 'Próximos 7 días', dias: 7 },
                        { label: 'Próximo mes', dias: 30 },
                    ].map(tile => {
                        const conteo = contarEventosEnVentana(tile.dias);
                        return (
                            <div key={tile.label} className="bg-slate-50 rounded-lg p-3">
                                <p className="text-xs text-slate-500 text-center mb-2">{tile.label}</p>
                                <div className="space-y-1">
                                    <button onClick={() => setActiveView('exams')} className="w-full flex items-center justify-between gap-2 text-sm px-2 py-1 rounded hover:bg-white transition-colors">
                                        <span className="text-slate-600">📝 Tareas evaluables</span>
                                        <span className="font-bold" style={{ color: PALETTE.green.header }}>{conteo.tareasEvaluables}</span>
                                    </button>
                                    <button onClick={() => setActiveView('meetings')} className="w-full flex items-center justify-between gap-2 text-sm px-2 py-1 rounded hover:bg-white transition-colors">
                                        <span className="text-slate-600">🤝 Reuniones</span>
                                        <span className="font-bold" style={{ color: PALETTE.teal.header }}>{conteo.reuniones}</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                </div>
            </div>
        </div>
    );
};

export default HoyView;
