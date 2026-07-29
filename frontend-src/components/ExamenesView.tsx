import React, { useMemo, useState } from 'react';
import type { ClassData, Course, View } from '../types';
import { ClipboardDocumentCheckIcon, PlusIcon } from './Icons';
import PageHeader from './PageHeader';
import EmptyState from './EmptyState';
import Input from './Input';
import Select from './Select';
import Button from './Button';
import { toYYYYMMDD, addDays, getDayOfWeek1a7, getMateria, getSiglas, getClassAccentColor, formatClassLabel, formatFechaEs } from '../utils';

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

    const header = (
        <PageHeader title="Tareas evaluables" subtitle="Tareas y exámenes programados en todas tus clases." accent="green" icon={<ClipboardDocumentCheckIcon className="w-6 h-6" />} />
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
                <div className="bg-white rounded-xl shadow-sm border divide-y">
                    {tareas.map(tarea => {
                        const cls = classes.find(c => c.id === tarea.classId);
                        const materia = cls ? getMateria(cls, courses) : '';
                        const accent = cls ? getClassAccentColor(materia, cls.colorAcento) : null;
                        return (
                            <button
                                key={tarea.id}
                                onClick={() => handleOpenCuaderno(tarea.classId)}
                                className="w-full text-left p-3 flex items-center gap-3 hover:bg-slate-50"
                            >
                                {accent && (
                                    <div className="flex flex-col gap-1 flex-shrink-0 w-20">
                                        <span
                                            className="px-2 py-0.5 rounded text-xs font-mono font-semibold text-center truncate"
                                            style={{ backgroundColor: accent.pillBg, color: accent.text }}
                                            title={materia}
                                        >
                                            {cls?.grupo || getSiglas(materia)}
                                        </span>
                                        {tarea.categoryName && (
                                            <span
                                                className="px-2 py-0.5 rounded text-xs font-semibold text-center truncate bg-white border"
                                                style={{ color: accent.text, borderColor: accent.pillBg }}
                                                title={tarea.categoryName}
                                            >
                                                {tarea.categoryName}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <div className="flex-grow min-w-0">
                                    <div className="text-sm font-medium text-slate-800 truncate">{tarea.name}</div>
                                </div>
                                <span className="text-xs text-slate-400 flex-shrink-0">{formatFechaEs(tarea.date)}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ExamenesView;
