import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AcademicConfiguration, ClassData, Course, JournalEntry } from '../types';
import { CalendarDaysIcon, ClockIcon } from './Icons';
import ClassLabel from './ClassLabel';
import EmptyState from './EmptyState';
import Input from './Input';
import Select from './Select';
import { formatClassLabel, formatFechaEs } from '../utils';

type JournalSession = {
    date: string;
    periodIndex: number;
    periodName: string;
    notes: string;
    isBreak: boolean;
    isScheduled: boolean;
};

const toYYYYMMDD = (date: Date): string => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const addDays = (date: Date, days: number): Date => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const dateFromString = (value: string): Date => new Date(`${value}T12:00:00`);

const ClassJournalRange: React.FC<{
    classes: ClassData[];
    courses: Course[];
    entries: JournalEntry[];
    academicConfiguration: AcademicConfiguration;
    initialClassId?: string;
}> = ({ classes, courses, entries, academicConfiguration, initialClassId }) => {
    const today = toYYYYMMDD(new Date());
    const [classId, setClassId] = useState(initialClassId || classes[0]?.id || '');
    const [startDate, setStartDate] = useState(toYYYYMMDD(addDays(new Date(), -15)));
    const [endDate, setEndDate] = useState(toYYYYMMDD(addDays(new Date(), 15)));
    const [onlyWithNotes, setOnlyWithNotes] = useState(false);
    const todaySectionRef = useRef<HTMLElement | null>(null);
    const hasFocusedTodayRef = useRef(false);

    useEffect(() => {
        if (initialClassId && classes.some(item => item.id === initialClassId)) setClassId(initialClassId);
    }, [initialClassId, classes]);

    useEffect(() => {
        if (!classes.some(item => item.id === classId)) setClassId(classes[0]?.id || '');
    }, [classes, classId]);

    const selectedClass = classes.find(item => item.id === classId);
    const rangeIsValid = startDate <= endDate;

    const sessions = useMemo((): JournalSession[] => {
        if (!selectedClass || !rangeIsValid) return [];

        const bySlot = new Map<string, JournalSession>();
        const entriesBySlot = new Map(
            entries
                .filter(entry => entry.classId === selectedClass.id && entry.date >= startDate && entry.date <= endDate)
                .map(entry => [`${entry.date}:${entry.periodIndex}`, entry]),
        );
        const skippedDays = new Set(selectedClass.skippedDays || []);
        const breakPeriods = new Set(academicConfiguration.breakPeriodIndexes || []);
        const current = dateFromString(startDate);
        const last = dateFromString(endDate);

        while (current <= last) {
            const date = toYYYYMMDD(current);
            const weekday = current.getDay();
            const isHoliday = (academicConfiguration.holidays || []).some(holiday => holiday.startDate <= date && holiday.endDate >= date);
            if (weekday >= 1 && weekday <= 5 && !isHoliday && !skippedDays.has(date)) {
                (selectedClass.schedule || [])
                    .filter(slot => slot.day === weekday)
                    .forEach(slot => {
                        const key = `${date}:${slot.periodIndex}`;
                        const entry = entriesBySlot.get(key);
                        bySlot.set(key, {
                            date,
                            periodIndex: slot.periodIndex,
                            periodName: academicConfiguration.periods?.[slot.periodIndex] || `Hora ${slot.periodIndex + 1}`,
                            notes: entry?.notes?.trim() || '',
                            isBreak: breakPeriods.has(slot.periodIndex),
                            isScheduled: true,
                        });
                    });
            }
            current.setDate(current.getDate() + 1);
        }

        // Una anotación histórica se conserva visible aunque el horario haya
        // cambiado después o la sesión se haya marcado como no lectiva.
        entriesBySlot.forEach((entry, key) => {
            if (bySlot.has(key)) return;
            bySlot.set(key, {
                date: entry.date,
                periodIndex: entry.periodIndex,
                periodName: academicConfiguration.periods?.[entry.periodIndex] || `Hora ${entry.periodIndex + 1}`,
                notes: entry.notes?.trim() || '',
                isBreak: breakPeriods.has(entry.periodIndex),
                isScheduled: false,
            });
        });

        return [...bySlot.values()]
            .filter(item => !onlyWithNotes || item.notes !== '')
            .sort((a, b) => a.date.localeCompare(b.date) || a.periodIndex - b.periodIndex);
    }, [selectedClass, entries, startDate, endDate, rangeIsValid, academicConfiguration.periods, academicConfiguration.holidays, academicConfiguration.breakPeriodIndexes, onlyWithNotes]);

    const sessionsByDate = useMemo(() => {
        const grouped = new Map<string, JournalSession[]>();
        sessions.forEach(session => grouped.set(session.date, [...(grouped.get(session.date) || []), session]));
        return [...grouped.entries()];
    }, [sessions]);

    const resetRange = () => {
        setStartDate(toYYYYMMDD(addDays(new Date(), -15)));
        setEndDate(toYYYYMMDD(addDays(new Date(), 15)));
    };

    // Al abrir esta vista, el punto de partida útil es la sesión de hoy, no
    // el comienzo del intervalo de 30 días.
    useEffect(() => {
        if (hasFocusedTodayRef.current || !sessions.some(session => session.date === today)) return;
        const frame = window.requestAnimationFrame(() => {
            todaySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            hasFocusedTodayRef.current = true;
        });
        return () => window.cancelAnimationFrame(frame);
    }, [sessions, today]);

    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_auto_auto_auto] md:items-end">
                    <div>
                        <label className="text-xs font-medium text-slate-600">Clase</label>
                        <Select value={classId} onChange={event => setClassId(event.target.value)} className="mt-1 w-full">
                            {classes.map(item => <option key={item.id} value={item.id}>{formatClassLabel(item, courses)}</option>)}
                        </Select>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Desde</label>
                        <Input type="date" value={startDate} max={endDate} onChange={event => setStartDate(event.target.value)} className="mt-1" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Hasta</label>
                        <Input type="date" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)} className="mt-1" />
                    </div>
                    <button type="button" onClick={resetRange} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        Hoy ±15 días
                    </button>
                </div>
                <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={onlyWithNotes} onChange={event => setOnlyWithNotes(event.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    Solo con anotaciones
                </label>
            </div>

            {selectedClass && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                    <CalendarDaysIcon className="h-4 w-4 text-slate-400" />
                    <ClassLabel classData={selectedClass} courses={courses} className="font-semibold text-slate-700" />
                    <span>· {sessions.length} sesión{sessions.length === 1 ? '' : 'es'}</span>
                </div>
            )}

            {!rangeIsValid ? (
                <EmptyState title="El intervalo no es válido." message="La fecha inicial debe ser anterior o igual a la fecha final." />
            ) : sessionsByDate.length === 0 ? (
                <EmptyState
                    title={onlyWithNotes ? 'No hay anotaciones en este intervalo.' : 'No hay sesiones de esta clase en este intervalo.'}
                    message={onlyWithNotes ? 'Desmarca el filtro para ver también las sesiones sin anotación.' : 'Puedes cambiar las fechas o seleccionar otra clase.'}
                />
            ) : (
                <div className="space-y-5">
                    {sessionsByDate.map(([date, daySessions]) => {
                        const isToday = date === today;
                        return (
                        <section
                            key={date}
                            ref={isToday ? todaySectionRef : undefined}
                            className={isToday ? 'rounded-xl border border-blue-200 bg-blue-50/60 p-3 shadow-sm' : undefined}
                        >
                            <h3 className={`mb-2 border-b pb-2 text-sm font-bold capitalize ${isToday ? 'border-blue-200 text-blue-800' : 'border-slate-200 text-slate-700'}`}>{isToday ? `Hoy · ${formatFechaEs(date)}` : formatFechaEs(date)}</h3>
                            <div className="space-y-2">
                                {daySessions.map(session => (
                                    <article key={`${session.date}:${session.periodIndex}`} className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${session.isBreak ? 'border-l-4 border-l-amber-400' : 'border-l-4 border-l-blue-400'} ${isToday && session.notes ? 'ring-1 ring-blue-200' : ''}`}>
                                        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                                            <div className="flex min-w-40 items-center gap-2 text-sm font-semibold text-slate-700">
                                                <ClockIcon className="h-4 w-4 text-slate-400" />
                                                <span>{session.periodName}</span>
                                                {session.isBreak && <span className="text-xs font-medium text-amber-700">Recreo</span>}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                {session.notes ? (
                                                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{session.notes}</p>
                                                ) : (
                                                    <p className="text-sm italic text-slate-400">Sin anotaciones.</p>
                                                )}
                                                {!session.isScheduled && <p className="mt-1 text-xs text-slate-400">Anotación conservada de una sesión ya no programada.</p>}
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ClassJournalRange;
