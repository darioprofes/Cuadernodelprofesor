import React, { useMemo, useState } from 'react';
import type { ClassData, Course, AcademicConfiguration, View } from '../types';
import { getMateria, getSiglas, addDays, getClassAccentColor, toYYYYMMDD } from '../utils';
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from './Icons';
import { PALETTE } from '../theme/palette';
import { tableBaseClassName, tableCellClassName, tableHeadCellClassName, tableHeadRowClassName, tableRowClassName, tableWrapperClassName } from '../theme/components/Table';
import EmptyState from './EmptyState';
import { pageHeaderMinHeight } from '../theme/components/PageHeader';
import { headerPatternStyle } from '../theme/headerPattern';
import DateNavButton from './DateNavButton';

interface HorarioViewProps {
    classes: ClassData[];
    courses: Course[];
    academicConfiguration: AcademicConfiguration;
    setActiveView: (view: View) => void;
    setActiveClassId: (id: string) => void;
}

const DAYS = [
    { label: 'Lunes', value: 1 },
    { label: 'Martes', value: 2 },
    { label: 'Miércoles', value: 3 },
    { label: 'Jueves', value: 4 },
    { label: 'Viernes', value: 5 },
];

const startOfWeekMonday = (date: Date): Date => {
    const d = new Date(date);
    const dow = d.getDay(); // 0 = domingo
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    d.setHours(0, 0, 0, 0);
    return d;
};

// Vista de solo lectura del horario semanal: la edición (añadir/mover/
// borrar franjas) se queda en Ajustes → Horario Semanal (ScheduleManager).
// Aquí pinchar una clase lleva directo a su Cuaderno.
//
// El horario es una PLANTILLA semanal recurrente (ClassData.schedule no
// tiene fecha, solo día de la semana): moverse a la semana anterior/
// siguiente no cambia qué se muestra, solo el rango de fechas de la
// cabecera — es orientativo, para saber "qué semana es esta".
const HorarioView: React.FC<HorarioViewProps> = ({ classes, courses, academicConfiguration, setActiveView, setActiveClassId }) => {
    const periods = academicConfiguration.periods || [];

    const [weekOffset, setWeekOffset] = useState(0);
    const inicioSemanaReal = useMemo(() => startOfWeekMonday(new Date()), []);
    const inicioSemana = useMemo(() => addDays(inicioSemanaReal, weekOffset * 7), [inicioSemanaReal, weekOffset]);
    const finSemana = useMemo(() => addDays(inicioSemana, 4), [inicioSemana]);

    const rangoTexto = useMemo(() => {
        const mesInicio = inicioSemana.toLocaleDateString('es-ES', { month: 'long' });
        const mesFin = finSemana.toLocaleDateString('es-ES', { month: 'long' });
        const anio = finSemana.getFullYear();
        const rango = mesInicio === mesFin
            ? `${inicioSemana.getDate()} - ${finSemana.getDate()} de ${mesFin}`
            : `${inicioSemana.getDate()} de ${mesInicio} - ${finSemana.getDate()} de ${mesFin}`;
        return `${rango}, ${anio}`;
    }, [inicioSemana, finSemana]);

    // El horario es una plantilla semanal recurrente (arriba): elegir una
    // fecha aquí no cambia el contenido, solo salta a la semana a la que
    // pertenece esa fecha (igual que hacían antes las flechas, pero directo
    // en vez de una a una).
    const handleJumpToDate = (dateStr: string) => {
        const picked = new Date(dateStr + 'T00:00:00');
        const pickedWeekStart = startOfWeekMonday(picked);
        const diffDays = Math.round((pickedWeekStart.getTime() - inicioSemanaReal.getTime()) / 86400000);
        setWeekOffset(Math.round(diffDays / 7));
    };

    const grid = useMemo(() => {
        const map = new Map<string, { classId: string; aula?: string; nota?: string }>();
        classes.forEach(c => {
            (c.schedule || []).forEach(slot => {
                map.set(`${slot.day}-${slot.periodIndex}`, { classId: c.id, aula: slot.aula, nota: slot.nota });
            });
        });
        return map;
    }, [classes]);

    const handleOpenCuaderno = (classId: string) => {
        setActiveClassId(classId);
        setActiveView('gradebook');
    };

    if (periods.length === 0) {
        return (
            <EmptyState
                title="Todavía no hay franjas horarias configuradas."
                message="Ve a Ajustes → Horario Semanal para importar el PDF oficial o crearlas a mano."
            />
        );
    }

    return (
        <div className="space-y-4">
            <div
                className={`rounded-xl p-4 sm:p-5 ${pageHeaderMinHeight} flex items-center justify-between flex-wrap gap-3`}
                style={{ backgroundColor: PALETTE.blue.header, ...headerPatternStyle }}
            >
                <div className="flex items-center gap-3">
                    <ClockIcon className="w-6 h-6 flex-shrink-0 text-white/90" />
                    <div>
                        <h2 className="text-xl font-bold text-white">Horario semanal</h2>
                        <p className="text-sm text-white/80">Consulta tu horario semanal de clases y actividades.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg bg-white hover:bg-white/90 text-slate-600" title="Semana anterior">
                        <ChevronLeftIcon className="w-4 h-4" />
                    </button>
                    <DateNavButton
                        value={toYYYYMMDD(inicioSemana)}
                        onChange={handleJumpToDate}
                        title="Ir a la semana de una fecha concreta"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white text-sm font-medium text-slate-700 hover:bg-white/90"
                        label={
                            <>
                                <CalendarDaysIcon className="w-4 h-4 text-slate-400" />
                                {rangoTexto}
                            </>
                        }
                    />
                    <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg bg-white hover:bg-white/90 text-slate-600" title="Semana siguiente">
                        <ChevronRightIcon className="w-4 h-4" />
                    </button>
                    {weekOffset !== 0 && (
                        <button
                            onClick={() => setWeekOffset(0)}
                            className="text-xs font-semibold text-white/90 hover:text-white underline underline-offset-2"
                        >
                            Ir a esta semana
                        </button>
                    )}
                </div>
            </div>

            <div className={tableWrapperClassName}>
                <table className={tableBaseClassName}>
                    <thead>
                        <tr className={tableHeadRowClassName}>
                            <th className={`${tableHeadCellClassName} text-left`}>Franja</th>
                            {DAYS.map(d => (
                                <th key={d.value} className={`${tableHeadCellClassName} text-center text-slate-700`}>{d.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {periods.map((periodName, periodIndex) => (
                            <tr key={periodIndex} className={tableRowClassName}>
                                <td className={`${tableCellClassName} font-medium text-slate-500 whitespace-nowrap`}>{periodName}</td>
                                {DAYS.map(day => {
                                    const slot = grid.get(`${day.value}-${periodIndex}`);
                                    const cls = slot ? classes.find(c => c.id === slot.classId) : undefined;
                                    const detalle = [slot?.aula, slot?.nota].filter(Boolean).join(' · ');
                                    const materia = cls ? getMateria(cls, courses) : '';
                                    const color = cls ? getClassAccentColor(materia, cls.colorAcento) : null;
                                    // Las "otras ocupaciones" (guardias, reuniones, recreo...) no tienen
                                    // alumnado ni Cuaderno que abrir — la celda se muestra igual pero sin
                                    // convertirla en enlace.
                                    const course = cls ? courses.find(c => c.id === cls.courseId) : undefined;
                                    const esAcademica = course?.type !== 'other';
                                    const contenidoCelda = cls && color ? (
                                        <>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {cls.grupo && (
                                                    <span
                                                        className="inline-block px-1.5 py-0.5 rounded text-xs font-mono font-semibold"
                                                        style={{ backgroundColor: color.pillBg, color: color.text }}
                                                    >
                                                        {cls.grupo}
                                                    </span>
                                                )}
                                                <span className="text-sm font-semibold" style={{ color: color.text }}>
                                                    {getSiglas(materia)}
                                                </span>
                                            </div>
                                            {detalle && <div className="text-xs text-slate-500 mt-0.5 truncate">{detalle}</div>}
                                        </>
                                    ) : null;
                                    return (
                                        <td key={`${day.value}-${periodIndex}`} className="p-1.5 align-top">
                                            {cls && color ? (
                                                esAcademica ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenCuaderno(cls.id)}
                                                        className="w-full min-h-[2.75rem] p-1.5 rounded-lg text-left transition-[filter] hover:brightness-95"
                                                        style={{ backgroundColor: color.cellBg }}
                                                        title={materia}
                                                    >
                                                        {contenidoCelda}
                                                    </button>
                                                ) : (
                                                    <div
                                                        className="w-full min-h-[2.75rem] p-1.5 rounded-lg text-left"
                                                        style={{ backgroundColor: color.cellBg }}
                                                        title={materia}
                                                    >
                                                        {contenidoCelda}
                                                    </div>
                                                )
                                            ) : (
                                                <div className="min-h-[2.75rem]" />
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default HorarioView;
