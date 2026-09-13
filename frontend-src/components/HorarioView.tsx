import React, { useMemo } from 'react';
import type { ClassData, Course, AcademicConfiguration, View } from '../types';
import { getMateria, getSiglas, getClassAccentColor } from '../utils';
import { ClockIcon } from './Icons';
import { SIDEBAR_BG } from '../theme/palette';
import { tableBaseClassName, tableCellClassName, tableHeadCellClassName, tableHeadRowClassName, tableRowClassName, tableWrapperClassName } from '../theme/components/Table';
import EmptyState from './EmptyState';
import { pageHeaderMinHeight } from '../theme/components/PageHeader';
import { headerPatternStyle } from '../theme/headerPattern';

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

// Vista de solo lectura del horario semanal: la edición (añadir/mover/
// borrar franjas) se queda en Ajustes → Horario Semanal (ScheduleManager).
// Aquí pinchar una clase lleva directo a su Cuaderno.
//
// El horario es una PLANTILLA semanal recurrente (ClassData.schedule no
// tiene fecha, solo día de la semana), así que se presenta como una única
// tabla estable para todo el curso, sin controles que sugieran versiones
// distintas según la fecha.
const HorarioView: React.FC<HorarioViewProps> = ({ classes, courses, academicConfiguration, setActiveView, setActiveClassId }) => {
    const periods = academicConfiguration.periods || [];

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
                className={`rounded-xl p-4 sm:p-5 ${pageHeaderMinHeight} flex items-center`}
                style={{ backgroundColor: SIDEBAR_BG, ...headerPatternStyle }}
            >
                <div className="flex items-center gap-3">
                    <ClockIcon className="w-6 h-6 flex-shrink-0 text-white/90" />
                    <div>
                        <h2 className="text-xl font-bold text-white">Horario semanal</h2>
                        <p className="text-sm text-white/80">El mismo horario se aplica durante todo el curso.</p>
                    </div>
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
