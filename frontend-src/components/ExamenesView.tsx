import React, { useMemo, useState } from 'react';
import type { ClassData, Course, View } from '../types';
import { ClipboardDocumentCheckIcon, PlusIcon } from './Icons';
import PageHeader from './PageHeader';
import { PAGE_ACCENT, PALETTE, SEMANTIC } from '../theme/palette';
import EmptyState from './EmptyState';
import Input from './Input';
import Select from './Select';
import Button from './Button';
import { toYYYYMMDD, addDays, getDayOfWeek1a7, getMateria, getSiglas, getClassAccentColor, formatClassLabel } from '../utils';

interface ExamenesViewProps {
    classes: ClassData[];
    courses: Course[];
    setActiveView: (view: View) => void;
    setActiveClassId: (id: string) => void;
    onOpenAddTask: () => void;
}

interface TareaEvaluableRow {
    id: string;
    name: string;
    date: string;
    classId: string;
    categoryName?: string;
}

type RangoFecha = 'hoy' | 'semana' | 'mes' | 'todas';

const finDeSemana = (hoy: Date): string => toYYYYMMDD(addDays(hoy, 7 - getDayOfWeek1a7(hoy)));
const finDeMes = (hoy: Date): string => toYYYYMMDD(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));

const MESES_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Fecha como una "hoja de calendario" (día grande + mes abreviado), en vez
// de texto plano -- se lee de un vistazo, como el resto de la app ya hace
// con tarjetas de fecha en Agenda/Horario.
const DateBadge: React.FC<{ fecha: string; color: string }> = ({ fecha, color }) => {
    const [anio, mes, dia] = fecha.split('-');
    return (
        <div className="flex flex-col items-center justify-center w-9 h-11 rounded-lg bg-white flex-shrink-0 py-1" style={{ boxShadow: `inset 0 0 0 1px ${color}66` }}>
            <span className="text-[8px] font-bold uppercase leading-none" style={{ color }}>{MESES_ABBR[parseInt(mes, 10) - 1]}</span>
            <span className="text-sm font-bold leading-none text-slate-700 mt-0.5">{parseInt(dia, 10)}</span>
            <span className="text-[7px] text-slate-400 leading-none mt-0.5">{anio}</span>
        </div>
    );
};

// Lista agregada de tareas evaluables (Assignment) de todas las clases, con
// filtro por rango de fechas (desde hoy / esta semana / este mes / todas,
// incluyendo pasadas), clase y categoría — antes solo había un interruptor
// binario "desde hoy sí/no" y ni rastro de las tareas ya pasadas.
const ExamenesView: React.FC<ExamenesViewProps> = ({ classes, courses, setActiveView, setActiveClassId, onOpenAddTask }) => {
    const hoy = new Date();
    const hoyStr = toYYYYMMDD(hoy);
    const finSemanaStr = finDeSemana(hoy);
    const finMesStr = finDeMes(hoy);

    const [rango, setRango] = useState<RangoFecha>('hoy');
    const [claseId, setClaseId] = useState<string>('');
    const [categoria, setCategoria] = useState<string>('');
    const [busqueda, setBusqueda] = useState('');

    const todasLasTareas: TareaEvaluableRow[] = useMemo(() => classes
        .flatMap(c => c.assignments
            .filter(a => a.date)
            .map(a => ({
                id: a.id,
                name: a.name,
                date: a.date as string,
                classId: c.id,
                categoryName: c.categories.find(cat => cat.id === a.categoryId)?.name,
            }))
        )
        .sort((a, b) => a.date.localeCompare(b.date)), [classes]);

    const categoriasDisponibles = useMemo(() => {
        const nombres = new Set<string>();
        todasLasTareas.forEach(t => {
            if (t.categoryName && (!claseId || t.classId === claseId)) nombres.add(t.categoryName);
        });
        return Array.from(nombres).sort((a, b) => a.localeCompare(b));
    }, [todasLasTareas, claseId]);

    const tareas = useMemo(() => {
        const query = busqueda.trim().toLowerCase();
        return todasLasTareas.filter(t => {
            if (rango !== 'todas' && t.date < hoyStr) return false;
            if (rango === 'semana' && t.date > finSemanaStr) return false;
            if (rango === 'mes' && t.date > finMesStr) return false;
            if (claseId && t.classId !== claseId) return false;
            if (categoria && t.categoryName !== categoria) return false;
            if (!query) return true;
            const cls = classes.find(c => c.id === t.classId);
            const materia = cls ? getMateria(cls, courses) : '';
            const haystack = [t.name, t.categoryName, materia, cls?.grupo].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(query);
        });
    }, [todasLasTareas, rango, claseId, categoria, busqueda, hoyStr, finSemanaStr, finMesStr, classes, courses]);

    const handleOpenCuaderno = (classId: string) => {
        setActiveClassId(classId);
        setActiveView('gradebook');
    };

    // Color según la urgencia de la fecha -- mismo criterio que Instrumentos
    // de Evaluación (un color por "tipo", aquí el tipo es la cercanía de la
    // fecha en vez del formato del instrumento). `text` usa siempre el tono
    // `header` (oscurecido donde hace falta, p.ej. el dorado) en vez de
    // `base` -- este sí lleva texto encima, y el dorado medido en Educastur
    // es demasiado claro para eso.
    const urgencia = (fecha: string): { text: string; soft: string } => {
        if (fecha < hoyStr) return { text: SEMANTIC.danger.base, soft: SEMANTIC.danger.soft };
        if (fecha === hoyStr) return { text: PALETTE.sand.header, soft: PALETTE.sand.soft };
        return { text: PALETTE.blue.header, soft: PALETTE.blue.soft };
    };

    const header = (
        <PageHeader title="Tareas evaluables" subtitle="Tareas y exámenes programados en todas tus clases." accent={PAGE_ACCENT.tareasEvaluables} icon={<ClipboardDocumentCheckIcon className="w-6 h-6" />} />
    );

    if (todasLasTareas.length === 0) {
        return (
            <div className="space-y-6">
                {header}
                <EmptyState
                    title="No hay tareas evaluables."
                    message="Se crean dentro del Cuaderno de cada clase, o desde el botón de aquí abajo."
                    action={<Button variant="primary" onClick={onOpenAddTask}><PlusIcon className="w-4 h-4" /> Nueva tarea</Button>}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {header}

            <div className="bg-white rounded-xl shadow-sm border p-3 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <Input
                        type="text"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar por tarea, categoría o clase..."
                        className="sm:flex-grow"
                    />
                    <Button variant="primary" onClick={onOpenAddTask} className="flex-shrink-0">
                        <PlusIcon className="w-4 h-4" /> Nueva tarea
                    </Button>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <Select value={rango} onChange={e => setRango(e.target.value as RangoFecha)} className="sm:w-auto">
                        <option value="hoy">Desde hoy</option>
                        <option value="semana">Esta semana</option>
                        <option value="mes">Este mes</option>
                        <option value="todas">Todas (incluye pasadas)</option>
                    </Select>
                    <Select value={claseId} onChange={e => { setClaseId(e.target.value); setCategoria(''); }} className="sm:w-auto">
                        <option value="">Todas las clases</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{formatClassLabel(c, courses)}</option>)}
                    </Select>
                    <Select value={categoria} onChange={e => setCategoria(e.target.value)} className="sm:w-auto" disabled={categoriasDisponibles.length === 0}>
                        <option value="">Todas las categorías</option>
                        {categoriasDisponibles.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </Select>
                </div>
            </div>

            {tareas.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8 bg-white rounded-xl border">Ninguna tarea coincide con el filtro actual.</p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {tareas.map(tarea => {
                        const cls = classes.find(c => c.id === tarea.classId);
                        const materia = cls ? getMateria(cls, courses) : '';
                        const accent = cls ? getClassAccentColor(materia, cls.colorAcento) : null;
                        const { text: urgenciaColor, soft: urgenciaSoft } = urgencia(tarea.date);
                        return (
                            <button
                                key={tarea.id}
                                onClick={() => handleOpenCuaderno(tarea.classId)}
                                className="inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border hover:shadow-sm transition-shadow max-w-full"
                                style={{ backgroundColor: urgenciaSoft, borderColor: `${urgenciaColor}40` }}
                            >
                                <DateBadge fecha={tarea.date} color={urgenciaColor} />
                                {accent && (
                                    <span
                                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold flex-shrink-0"
                                        style={{ backgroundColor: accent.pillBg, color: accent.text }}
                                        title={materia}
                                    >
                                        {cls?.grupo || getSiglas(materia)}
                                    </span>
                                )}
                                <span className="text-sm text-slate-800 truncate max-w-[20rem]">
                                    {tarea.categoryName && (
                                        <span className="font-semibold" style={{ color: accent?.text ?? undefined }}>{tarea.categoryName}: </span>
                                    )}
                                    <span className="font-medium">{tarea.name}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ExamenesView;
