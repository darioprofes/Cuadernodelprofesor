import React, { useMemo, useState, useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { ClassData, Course, AcademicConfiguration, Task, Meeting, View } from '../types';
import type { Absence } from '../types/api';
import ClassLabel from './ClassLabel';
import BannerCostero from './BannerCostero';
import Input from './Input';
import { getDayOfWeek1a7, toYYYYMMDD, addDays, parsePeriodRange, formatFechaEs } from '../utils';
import { ClockIcon, CheckCircleIcon, CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon, PlusIcon, ClipboardDocumentCheckIcon, UsersIcon, ArrowUpTrayIcon, ExclamationTriangleIcon, SparklesIcon } from './Icons';
import { PALETTE } from '../theme/palette';
import DateNavButton from './DateNavButton';
import { computeDashboardNotices, type DashboardNoticeKind } from '../services/dashboardNotices';
import { useTrabajosIA, type ResultadoTrabajoSA, type ResultadoTrabajoInstrumento } from '../hooks/useTrabajosIA';
import TrabajosIAPanel from './TrabajosIAPanel';

// Trabajos de IA descartados por el usuario (ver TrabajosIAPanel) -- solo
// del lado del cliente, no hay endpoint de borrado en el backend (los
// trabajos ya expiran solos a la hora, ver _TTL_TRABAJO_SEGUNDOS). Se
// guardan en localStorage para que "descartar" sobreviva a recargar la
// página, no solo a cerrar el panel.
const DESCARTADOS_KEY = 'trabajosIADescartados';

const leerDescartados = (): Set<string> => {
    try {
        const raw = localStorage.getItem(DESCARTADOS_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
};

const guardarDescartados = (ids: Set<string>) => {
    try {
        localStorage.setItem(DESCARTADOS_KEY, JSON.stringify([...ids]));
    } catch {
        // localStorage puede fallar (privado, cuota llena) -- sin
        // consecuencia real, en el peor caso vuelven a verse trabajos ya
        // descartados tras recargar.
    }
};

const NOTICE_ICON: Record<DashboardNoticeKind, React.FC<{ className?: string }>> = {
    ungraded: ClipboardDocumentCheckIcon,
    periodClosing: ClockIcon,
    educasturBacklog: ArrowUpTrayIcon,
    absenceStreak: ExclamationTriangleIcon,
};

// 'warn' reutiliza el dorado ya presente en PALETTE; 'alert' reutiliza el
// mismo rojo que ya usa el badge "Vencida" de Tareas pendientes, aquí abajo.
const NOTICE_TONE_CLASS: Record<'warn' | 'alert', string> = {
    warn: '',
    alert: 'text-red-700',
};
const NOTICE_TONE_STYLE: Record<'warn' | 'alert', React.CSSProperties | undefined> = {
    warn: { color: PALETTE.sand.header },
    alert: undefined,
};

interface HoyViewProps {
    classes: ClassData[];
    courses: Course[];
    academicConfiguration: AcademicConfiguration;
    tasks: Task[];
    setTasks: (updater: React.SetStateAction<Task[]>) => void;
    meetings: Meeting[];
    absencesByClassId: Record<string, Absence[]>;
    setActiveView: (view: View) => void;
    setActiveClassId: (id: string) => void;
    onAbrirBorradorSA: (courseId: string, resultado: ResultadoTrabajoSA) => void;
    onAbrirBorradorInstrumento: (courseId: string, resultado: ResultadoTrabajoInstrumento) => void;
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

const HoyView: React.FC<HoyViewProps> = ({ classes, courses, academicConfiguration, tasks, setTasks, meetings, absencesByClassId, setActiveView, setActiveClassId, onAbrirBorradorSA, onAbrirBorradorInstrumento }) => {
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

    // Fecha del día mostrado (sigue al selector de día), en formato largo.
    // En español los días de la semana van en minúscula salvo que empiecen
    // la frase — aquí siempre van a mitad ("Horario de hoy, miércoles..."),
    // así que no se capitalizan.
    const fechaLarga = `${viewDate.getDate()} de ${viewDate.toLocaleDateString('es-ES', { month: 'long' })} de ${viewDate.getFullYear()}`;
    const diaSemanaLargo = viewDate.toLocaleDateString('es-ES', { weekday: 'long' });

    const handleOpenCuaderno = (classId: string) => {
        setActiveClassId(classId);
        setActiveView('gradebook');
    };

    const handleDiaAnterior = () => setFechaSeleccionada(toYYYYMMDD(addDays(viewDate, -1)));
    const handleDiaSiguiente = () => setFechaSeleccionada(toYYYYMMDD(addDays(viewDate, 1)));

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
    // (fecha estrictamente futura, ni hoy ni pasada). Se cuenta desde el día
    // seleccionado en el selector, no siempre desde hoy — así "Próximos
    // eventos" también se ajusta al navegar a otro día.
    //
    // Cada franja cuenta solo lo que no esté ya contado en la anterior (24h
    // no se repite dentro de "7 días", ni "7 días" dentro de "1 mes") — de
    // ahí el `desdeExclusive`: `null` para la primera franja (usa el mismo
    // criterio de siempre, hoy inclusive para reuniones / estrictamente
    // futuro para tareas), y el límite superior de la franja anterior para
    // las siguientes (estrictamente posterior, para no solaparse con ella).
    const contarEventosEnVentana = (desdeExclusive: string | null, hasta: string): { tareasEvaluables: number; reuniones: number } => {
        let tareasEvaluables = 0, reuniones = 0;
        meetings.forEach(m => {
            const enRango = desdeExclusive ? (m.fecha > desdeExclusive && m.fecha <= hasta) : (m.fecha >= fechaSeleccionada && m.fecha <= hasta);
            if (enRango) reuniones++;
        });
        classes.forEach(c => c.assignments.forEach(a => {
            if (!a.date) return;
            const enRango = desdeExclusive ? (a.date > desdeExclusive && a.date <= hasta) : (a.date > fechaSeleccionada && a.date <= hasta);
            if (enRango) tareasEvaluables++;
        }));
        return { tareasEvaluables, reuniones };
    };

    // Límites de las 3 franjas de "Próximos eventos", encadenados: el
    // superior de una es el "desdeExclusive" de la siguiente (ver más abajo).
    const limite24h = toYYYYMMDD(addDays(viewDate, 1));
    const limite7dias = toYYYYMMDD(addDays(viewDate, 7));
    const limite30dias = toYYYYMMDD(addDays(viewDate, 30));
    const ventanasEventos = [
        { label: '24 h', desdeExclusive: null as string | null, hasta: limite24h },
        { label: '7 días', desdeExclusive: limite24h, hasta: limite7dias },
        { label: '1 mes', desdeExclusive: limite7dias, hasta: limite30dias },
    ];

    // Avisos (tareas sin calificar, periodo cerrando...): sobre la fecha REAL
    // de hoy, no la que se esté navegando en el selector — a diferencia de
    // "Próximos eventos", son estado accionable, no una consulta puntual.
    const notices = useMemo(
        () => computeDashboardNotices(classes, courses, academicConfiguration.evaluationPeriods, absencesByClassId, now, isTauri()),
        [classes, courses, academicConfiguration.evaluationPeriods, absencesByClassId, now]
    );

    // Cola de trabajos de IA en segundo plano (SA por partes, instrumentos)
    // -- mismo sitio que el resto de avisos accionables, ver nota de cabecera.
    const trabajosIAQuery = useTrabajosIA();
    const [descartados, setDescartados] = useState<Set<string>>(leerDescartados);
    const [panelTrabajosAbierto, setPanelTrabajosAbierto] = useState(false);
    const trabajosVisibles = (trabajosIAQuery.data ?? []).filter(t => !descartados.has(t.jobId));
    const trabajosEnCurso = trabajosVisibles.filter(t => t.estado === 'en_progreso').length;
    const trabajosConProblema = trabajosVisibles.filter(t => t.estado === 'error' || t.estado === 'cancelado').length;
    // "listo" no es un estado final de verdad: la SA o el instrumento
    // generado todavía no existe como tal en la aplicación hasta que se
    // guarda desde el panel (ver TrabajosIAPanel.tsx) -- si el chip solo
    // contase "en curso"/"con error", un trabajo terminado con el modal ya
    // cerrado se quedaría invisible para siempre y nunca se llegaría a
    // guardar.
    const trabajosListosSinGuardar = trabajosVisibles.filter(t => t.estado === 'listo').length;

    const descartarTrabajo = (jobId: string) => {
        setDescartados(prev => {
            const next = new Set(prev).add(jobId);
            guardarDescartados(next);
            return next;
        });
    };
    const descartarTrabajosTerminados = () => {
        setDescartados(prev => {
            const next = new Set(prev);
            // Los "listo" quedan fuera a propósito -- son SA/instrumentos
            // generados que TODAVÍA no se han guardado en ningún sitio
            // (ver TrabajosIAPanel.tsx). Un botón de "vaciar todo" no debe
            // poder tirar contenido generado sin guardar sin que el
            // profesor lo decida uno a uno.
            trabajosVisibles.forEach(t => { if (t.estado === 'error' || t.estado === 'cancelado') next.add(t.jobId); });
            guardarDescartados(next);
            return next;
        });
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
                    <DateNavButton
                        value={fechaSeleccionada}
                        label={esHoy ? 'Hoy' : formatFechaEs(fechaSeleccionada)}
                        onChange={setFechaSeleccionada}
                        className="text-xs font-semibold text-slate-700 px-1"
                    />
                    <button onClick={handleDiaSiguiente} className="p-1 rounded-full text-slate-600 hover:bg-white" title="Día siguiente">
                        <ChevronRightIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 flex-shrink-0 bg-white shadow-sm rounded-full pl-3 pr-4 py-1.5">
                    <CalendarDaysIcon className="w-4 h-4 text-slate-400" /> Avisos
                </div>
                {notices.map(notice => {
                    const NoticeIcon = NOTICE_ICON[notice.kind];
                    return (
                        <button
                            key={notice.id}
                            type="button"
                            onClick={notice.target ? () => {
                                if (notice.target!.classId) setActiveClassId(notice.target!.classId);
                                setActiveView(notice.target!.view);
                            } : undefined}
                            disabled={!notice.target}
                            className={`flex items-center gap-1.5 bg-white shadow-sm rounded-full pl-3 pr-4 py-1.5 text-sm font-semibold transition-opacity ${notice.target ? 'hover:opacity-70' : ''} ${NOTICE_TONE_CLASS[notice.tone]}`}
                            style={NOTICE_TONE_STYLE[notice.tone]}
                        >
                            <NoticeIcon className="w-4 h-4 flex-shrink-0" /> {notice.label}
                        </button>
                    );
                })}
                {(trabajosEnCurso > 0 || trabajosConProblema > 0 || trabajosListosSinGuardar > 0) && (
                    <button
                        type="button"
                        onClick={() => setPanelTrabajosAbierto(true)}
                        className={`flex items-center gap-1.5 bg-white shadow-sm rounded-full pl-3 pr-4 py-1.5 text-sm font-semibold transition-opacity hover:opacity-70 ${trabajosConProblema > 0 ? 'text-red-700' : (trabajosListosSinGuardar > 0 ? 'text-emerald-700' : '')}`}
                        style={trabajosConProblema > 0 || trabajosListosSinGuardar > 0 ? undefined : { color: PALETTE.sand.header }}
                    >
                        <SparklesIcon className="w-4 h-4 flex-shrink-0" />
                        {[
                            trabajosEnCurso > 0 && `${trabajosEnCurso} en curso`,
                            trabajosListosSinGuardar > 0 && `${trabajosListosSinGuardar} lista${trabajosListosSinGuardar === 1 ? '' : 's'} para guardar`,
                            trabajosConProblema > 0 && `${trabajosConProblema} con error`,
                        ].filter(Boolean).join(' · ')}
                    </button>
                )}
                {ventanasEventos.map(tile => {
                        const conteo = contarEventosEnVentana(tile.desdeExclusive, tile.hasta);
                        if (conteo.tareasEvaluables === 0 && conteo.reuniones === 0) return null;
                        return (
                            <div key={tile.label} className="flex items-center gap-2 bg-white shadow-sm rounded-full pl-3 pr-2 py-1.5">
                                <span className="text-xs text-slate-500 flex-shrink-0">{tile.label}</span>
                                <button
                                    type="button"
                                    onClick={() => setActiveView('exams')}
                                    title="Tareas evaluables"
                                    className="flex items-center gap-1 text-sm font-bold hover:opacity-70 transition-opacity"
                                    style={{ color: PALETTE.green.header }}
                                >
                                    <ClipboardDocumentCheckIcon className="w-4 h-4" /> {conteo.tareasEvaluables}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveView('meetings')}
                                    title="Reuniones"
                                    className="flex items-center gap-1 text-sm font-bold hover:opacity-70 transition-opacity"
                                    style={{ color: PALETTE.teal.header }}
                                >
                                    <UsersIcon className="w-4 h-4" /> {conteo.reuniones}
                                </button>
                            </div>
                        );
                    })}
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
                                            t.hecho ? '' : 'border-slate-300 hover:border-[var(--color-green-header)]'
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
                        <ClockIcon className="w-4 h-4 flex-shrink-0" />
                        <h3>{esHoy ? `Horario de hoy, ${diaSemanaLargo} ${fechaLarga}` : `Horario del ${diaSemanaLargo} ${fechaLarga}`}</h3>
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
                                // "Otras ocupaciones" (guardias, recreo...) no tienen
                                // alumnado ni Cuaderno que abrir.
                                const course = courses.find(c => c.id === cls.courseId);
                                const esAcademica = course?.type !== 'other';
                                const claseComun = `w-full flex items-center gap-2 text-left p-2 rounded-lg border-l-2 transition-colors ${
                                    esFranjaActual ? 'bg-[#fbf1dc] border-[#d9b878]' : (esAcademica ? 'hover:bg-slate-50 border-blue-400' : 'border-slate-300')
                                }`;
                                const contenido = (
                                    <>
                                        <span className="text-xs text-slate-400 flex-shrink-0 w-24">{slot.periodName}</span>
                                        <ClassLabel classData={cls} courses={courses} className="text-sm font-medium text-slate-700 truncate" />
                                        {slot.aula && <span className="text-xs text-slate-400 flex-shrink-0">Aula {slot.aula}</span>}
                                    </>
                                );
                                return esAcademica ? (
                                    <button
                                        key={`${slot.classId}-${slot.periodIndex}`}
                                        onClick={() => handleOpenCuaderno(slot.classId)}
                                        className={claseComun}
                                    >
                                        {contenido}
                                    </button>
                                ) : (
                                    <div key={`${slot.classId}-${slot.periodIndex}`} className={claseComun}>
                                        {contenido}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    </div>
                </div>
            </div>
            <TrabajosIAPanel
                isOpen={panelTrabajosAbierto}
                onClose={() => setPanelTrabajosAbierto(false)}
                trabajos={trabajosVisibles}
                onDescartar={descartarTrabajo}
                onDescartarTerminados={descartarTrabajosTerminados}
                onAbrirBorradorSA={onAbrirBorradorSA}
                onAbrirBorradorInstrumento={onAbrirBorradorInstrumento}
            />
        </div>
    );
};

export default HoyView;
