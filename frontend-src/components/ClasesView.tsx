import React, { useState } from 'react';
import type { ClassData, Course, AcademicConfiguration, View, EvaluationCriterion, SpecificCompetence, KeyCompetence, Student } from '../types';
import { UserGroupIcon, ClockIcon, BookOpenIcon, ChevronDownIcon, CalendarDaysIcon, AcademicCapIcon } from './Icons';
import PageHeader from './PageHeader';
import StudentSummaryModal from './StudentSummaryModal';
import PlanoClaseModal from './PlanoClaseModal';
import { getClassAccentColor, getMateria, getDayOfWeek1a7, parsePeriodRange } from '../utils';
import { getClassIconComponent } from '../classIcons';
import { RADIUS } from '../theme/radius';
import { SHADOW } from '../theme/shadows';
import { SEMANTIC } from '../theme/palette';
import EmptyState from './EmptyState';

interface ClasesViewProps {
    classes: ClassData[];
    courses: Course[];
    academicConfiguration: AcademicConfiguration;
    criteria: EvaluationCriterion[];
    specificCompetences: SpecificCompetence[];
    keyCompetences: KeyCompetence[];
    onUpdateClass: (updated: ClassData) => void;
    setActiveView: (view: View) => void;
    setActiveClassId: (id: string) => void;
}

const DIA_CORTO: Record<number, string> = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V' };

const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
};

const getStartTime = (periodLabel: string): string => {
    const match = periodLabel.match(/(\d{1,2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : periodLabel;
};

const StatPill: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-sm font-medium text-white whitespace-nowrap">
        {icon} {label}
    </div>
);

// Foto si la tiene, si no iniciales sobre el color de la clase — reutilizado
// tanto en la fila compacta como en el listado completo desplegado.
const StudentAvatar: React.FC<{ student: Student; bgColor: string; className?: string }> = ({ student, bgColor, className = 'w-6 h-6 text-[10px]' }) => (
    <span className={`${className} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`} style={{ backgroundColor: bgColor }}>
        {student.foto ? <img src={student.foto} alt="" className="w-full h-full object-cover" /> : getInitials(student.name)}
    </span>
);

// Listado de clases (renombrado de "Grupos"), con click-through directo al
// Cuaderno de cada una y a la ficha de cada alumno. La edición (alta/baja,
// alumnado...) sigue en Ajustes → Clases y Alumnado.
const ClasesView: React.FC<ClasesViewProps> = ({ classes, courses, academicConfiguration, criteria, specificCompetences, keyCompetences, onUpdateClass, setActiveView, setActiveClassId }) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [fichaTarget, setFichaTarget] = useState<{ student: Student; classData: ClassData } | null>(null);
    const [planoTarget, setPlanoTarget] = useState<ClassData | null>(null);

    const academicCourseIds = new Set(courses.filter(c => c.type !== 'other').map(c => c.id));
    const academicClasses = classes.filter(c => academicCourseIds.has(c.courseId));

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const hoyDow = getDayOfWeek1a7(now);

    const isActiveNow = (cls: ClassData): boolean => (cls.schedule || []).some(slot => {
        if (slot.day !== hoyDow) return false;
        const periodLabel = academicConfiguration.periods?.[slot.periodIndex];
        const range = periodLabel ? parsePeriodRange(periodLabel) : null;
        return range ? (nowMinutes >= range.startMin && nowMinutes < range.endMin) : false;
    });

    const totalAlumnos = academicClasses.reduce((sum, c) => sum + c.students.length, 0);
    const totalSesiones = academicClasses.reduce((sum, c) => sum + (c.schedule?.length || 0), 0);

    const handleOpenCuaderno = (classId: string) => {
        setActiveClassId(classId);
        setActiveView('gradebook');
    };

    const toggleExpanded = (classId: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(classId)) next.delete(classId); else next.add(classId);
            return next;
        });
    };

    const header = (
        <PageHeader
            title="Clases"
            subtitle="Tus grupos de este curso, con acceso directo al cuaderno."
            accent="sand"
            icon={<UserGroupIcon className="w-6 h-6" />}
            actions={
                <>
                    <StatPill icon={<UserGroupIcon className="w-4 h-4" />} label={`${academicClasses.length} grupos`} />
                    <StatPill icon={<UserGroupIcon className="w-4 h-4" />} label={`${totalAlumnos} alumnos`} />
                    <StatPill icon={<CalendarDaysIcon className="w-4 h-4" />} label={`${totalSesiones} sesiones esta semana`} />
                </>
            }
        />
    );

    if (academicClasses.length === 0) {
        return (
            <div className="space-y-4">
                {header}
                <EmptyState
                    title="Todavía no tienes clases creadas."
                    message="Ve a Ajustes → Clases y Alumnado para crear la primera."
                />
            </div>
        );
    }

    return (
        <div className="space-y-4">
        {header}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {academicClasses.map(cls => {
                const expanded = expandedIds.has(cls.id);
                const materia = getMateria(cls, courses);
                const accent = getClassAccentColor(materia, cls.colorAcento);
                const activo = isActiveNow(cls);
                const sesiones = (cls.schedule || [])
                    .slice()
                    .sort((a, b) => a.day - b.day || a.periodIndex - b.periodIndex)
                    .map(s => ({
                        diaCorto: DIA_CORTO[s.day] || `D${s.day}`,
                        horaInicio: getStartTime(academicConfiguration.periods?.[s.periodIndex] || ''),
                    }));

                return (
                    <div key={cls.id} className={`bg-white ${RADIUS.container} ${SHADOW.sm} border overflow-hidden flex flex-col`}>
                        <div className="h-1.5" style={{ backgroundColor: accent.headerBg }} />
                        <div className="p-4 flex-grow flex flex-col justify-between">
                            <div>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {(() => {
                                            const IconComp = getClassIconComponent(cls.icono) || AcademicCapIcon;
                                            const esImagenPropia = cls.icono?.startsWith('data:');
                                            return (
                                                <div
                                                    title="El icono y el color se cambian en Ajustes → Clases y Alumnado"
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                                                    style={{ backgroundColor: accent.cellBg, color: accent.text }}
                                                >
                                                    {esImagenPropia ? (
                                                        <img src={cls.icono} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <IconComp className="w-4 h-4" />
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {cls.grupo && (
                                            <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold flex-shrink-0" style={{ backgroundColor: accent.pillBg, color: accent.text }}>
                                                {cls.grupo}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {activo && (
                                            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 whitespace-nowrap">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Activa ahora
                                            </span>
                                        )}
                                        <button
                                            onClick={() => toggleExpanded(cls.id)}
                                            className="p-1 text-slate-400 hover:text-slate-600"
                                            title={expanded ? 'Ocultar detalles' : 'Ver detalles'}
                                        >
                                            <ChevronDownIcon className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                        </button>
                                    </div>
                                </div>

                                <h3 className="font-bold text-slate-800 text-base leading-tight mb-1 truncate">{materia}</h3>

                                <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-2">
                                    <UserGroupIcon className="w-4 h-4 flex-shrink-0" /> {cls.students.length} alumn@s
                                </div>

                                {sesiones.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {sesiones.map((s, i) => (
                                            <span key={i} className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{s.diaCorto} {s.horaInicio}</span>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-2">
                                        <ClockIcon className="w-4 h-4 flex-shrink-0" /> Sin horario asignado
                                    </div>
                                )}

                                {cls.students.length > 0 && (
                                    <div className="flex items-center gap-1 mb-2">
                                        {cls.students.slice(0, 4).map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => setFichaTarget({ student: s, classData: cls })}
                                                title={s.name}
                                                className="hover:opacity-80"
                                            >
                                                <StudentAvatar student={s} bgColor={accent.headerBg} />
                                            </button>
                                        ))}
                                        {cls.students.length > 4 && (
                                            <button
                                                onClick={() => toggleExpanded(cls.id)}
                                                className="text-[11px] text-slate-400 font-medium hover:text-slate-600"
                                            >
                                                +{cls.students.length - 4}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {expanded && (
                                    <div className="mt-2 pt-2 border-t">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Alumnado</p>
                                        {cls.students.length === 0 ? (
                                            <p className="text-sm text-slate-400">Sin alumnado todavía.</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                                                {cls.students.map(s => (
                                                    <button
                                                        key={s.id}
                                                        onClick={() => setFichaTarget({ student: s, classData: cls })}
                                                        title={s.name}
                                                        className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full border border-slate-200 hover:bg-slate-50 hover:border-blue-300 transition-colors"
                                                    >
                                                        <StudentAvatar student={s} bgColor={accent.headerBg} />
                                                        <span className="text-xs text-slate-700 truncate max-w-[110px]">{s.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="mt-4 flex items-center gap-2">
                                <button
                                    onClick={() => handleOpenCuaderno(cls.id)}
                                    className="flex-1 flex items-center justify-center gap-1.5 text-white text-sm font-medium py-2 rounded-full hover:brightness-110 transition-[filter]"
                                    style={{ backgroundColor: SEMANTIC.primary.base }}
                                >
                                    <BookOpenIcon className="w-4 h-4" /> Cuaderno
                                </button>
                                <button
                                    onClick={() => setPlanoTarget(cls)}
                                    className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 text-sm font-medium py-2 rounded-full hover:bg-slate-50"
                                >
                                    <span className="text-base leading-none">🪑</span> Plano
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>

        {fichaTarget && (
            <StudentSummaryModal
                isOpen={!!fichaTarget}
                onClose={() => setFichaTarget(null)}
                student={fichaTarget.student}
                classData={fichaTarget.classData}
                courses={courses}
                academicConfiguration={academicConfiguration}
                criteria={criteria.filter(c => c.courseId === fichaTarget.classData.courseId)}
                specificCompetences={specificCompetences.filter(sc => sc.courseId === fichaTarget.classData.courseId)}
                keyCompetences={keyCompetences}
                repartoIgualCriterios={!courses.find(c => c.id === fichaTarget.classData.courseId)?.pesoCriteriosManual}
            />
        )}

        {planoTarget && (
            <PlanoClaseModal
                isOpen={!!planoTarget}
                onClose={() => setPlanoTarget(null)}
                classData={planoTarget}
                materia={getMateria(planoTarget, courses)}
                onUpdateClass={(updated) => { onUpdateClass(updated); setPlanoTarget(updated); }}
                onOpenFicha={(student) => setFichaTarget({ student, classData: planoTarget })}
            />
        )}
        </div>
    );
};

export default ClasesView;
