
import React, { useState, useRef } from 'react';
import Modal from './Modal';
import Button from './Button';
import { ArrowUpTrayIcon } from './Icons';
import ClassLabel from './ClassLabel';
import type { ClassData, Course, AcademicConfiguration } from '../types';
import { HUE_PRESETS, buildDefaultCategories } from '../utils';

interface FilaHorario {
    dia: number; // 0=Lunes ... 4=Viernes (formato del backend)
    hora_inicio: string;
    hora_fin: string;
    grupo: string | null;
    asignatura: string;
    aula: string | null;
    ensenanza: string | null; // nivel educativo (p.ej. "4ESOPDC", "1ºESO"), columna "Enseñanza" del PDF
}

interface ImportScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    courses: Course[];
    setCourses: (updater: React.SetStateAction<Course[]>) => void;
    classes: ClassData[];
    setClasses: (updater: React.SetStateAction<ClassData[]>) => void;
    academicConfiguration: AcademicConfiguration;
    setAcademicConfiguration: (updater: React.SetStateAction<AcademicConfiguration>) => void;
}

const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
};

// El PDF trae el nivel en la columna "Enseñanza" con códigos crudos (p.ej.
// "4ESOPDC", "1ºESO") que no siguen el mismo formato que se usa al crear un
// curso a mano ("4º ESO", "4º ESO (PDC)"...). Se normaliza para que ambos
// caminos generen el mismo texto y no acaben duplicando el mismo nivel con
// dos nombres distintos.
const normalizarNivel = (raw: string): string => {
    const limpio = raw.trim();

    const eso = limpio.match(/^([1-4])º?\s*ESO\s*(PDC)?$/i);
    if (eso) {
        return `${eso[1]}º ESO${eso[2] ? ' (PDC)' : ''}`;
    }

    const bachillerato = limpio.match(/^([1-2])º?\s*BA?CH(ILLERATO)?$/i);
    if (bachillerato) {
        return `${bachillerato[1]}º Bachillerato`;
    }

    return limpio;
};

// Construye la lista de franjas horarias únicas (ordenadas) a partir de las
// filas extraídas del PDF, y el nuevo conjunto de cursos/clases resultante
// de fusionar esas filas con lo que ya existía. No muta nada: se aplica solo
// cuando el usuario confirma la previsualización.
//
// `borrarAcademicasSinUsar` solo importa cuando hay cursos/grupos académicos
// que YA existían pero a los que esta importación no les toca ninguna
// franja (ya no aparecen en el PDF actual): true los borra del todo
// (alumnado y calificaciones incluidos), false los deja tal cual estaban.
const buildImportPlan = (filas: FilaHorario[], courses: Course[], classes: ClassData[], evaluationPeriods: AcademicConfiguration['evaluationPeriods'], borrarAcademicasSinUsar: boolean) => {
    // La materia puede venir vacía (franja sin nada asignado en el PDF,
    // p.ej. el recreo): se importa igual, sin nombre por defecto.
    const filasValidas = filas.filter(f => f.hora_inicio && f.hora_fin);

    // "Otras ocupaciones" (guardias, reuniones, recreo...) no guardan
    // alumnado ni calificaciones, así que importar el horario implica
    // sustituirlas siempre por completo (curso + clase) — sin esto, reimportar
    // tras renombrar una (p.ej. "Libre" → "RECREO") no la reconoce por el
    // nombre y crea otra en paralelo, dejando la antigua con franjas
    // obsoletas.
    const idsOtrasOcupaciones = new Set(courses.filter(c => c.type === 'other').map(c => c.id));

    const parejasUnicas = Array.from(new Set(filasValidas.map(f => `${f.hora_inicio}|${f.hora_fin}`)))
        .map(par => {
            const [inicio, fin] = par.split('|');
            return { inicio, fin };
        })
        .sort((a, b) => toMinutes(a.inicio) - toMinutes(b.inicio));

    const periods = parejasUnicas.map(p => `${p.inicio}-${p.fin}`);
    const periodIndexOf = new Map(parejasUnicas.map((p, i) => [`${p.inicio}|${p.fin}`, i]));

    let newCourses = courses.filter(c => !idsOtrasOcupaciones.has(c.id));
    let newClasses = classes.filter(cl => !idsOtrasOcupaciones.has(cl.courseId));
    // Se cuentan clases distintas tocadas por la importación, no franjas: una
    // misma clase recibe varias franjas (una por sesión/semana) sin que eso
    // cuente como varias clases nuevas o actualizadas. También sirve para
    // saber qué clases académicas ya existían pero esta vez no se han tocado.
    const idsClasesNuevas = new Set<string>();
    const idsClasesActualizadas = new Set<string>();
    const idsClasesTocadas = new Set<string>();

    const findOrCreateCourse = (subject: string, level: string, type: 'academic' | 'other'): Course => {
        let course = newCourses.find(c => c.subject === subject && c.level === level && c.type === type);
        if (!course) {
            course = {
                id: `course-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                level,
                subject,
                type,
            };
            newCourses.push(course);
        }
        return course;
    };

    // Empareja por (curso, grupo) cuando hay grupo — así una clase ya creada
    // a mano con el mismo grupo se reconoce aunque su nombre no coincida
    // carácter a carácter. Sin grupo (guardias, reuniones...) cada curso
    // "Otro" solo tiene una clase, así que basta con el curso.
    const findOrCreateClass = (courseId: string, grupo: string | undefined): ClassData => {
        let cls = grupo
            ? newClasses.find(c => c.courseId === courseId && c.grupo === grupo)
            : newClasses.find(c => c.courseId === courseId && !c.grupo);
        if (!cls) {
            // Ciclar por HUE_PRESETS para que cada clase nueva tenga un color
            // distinto sin que el usuario tenga que asignarlos a mano.
            const colorAcento = HUE_PRESETS[newClasses.length % HUE_PRESETS.length];
            cls = {
                id: `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                grupo,
                courseId,
                colorAcento,
                students: [],
                categories: grupo !== undefined ? buildDefaultCategories(evaluationPeriods ?? []) : [],
                assignments: [],
                grades: [],
                schedule: [],
            };
            newClasses.push(cls);
            idsClasesNuevas.add(cls.id);
        } else if (!idsClasesNuevas.has(cls.id)) {
            idsClasesActualizadas.add(cls.id);
        }
        idsClasesTocadas.add(cls.id);
        return cls;
    };

    for (const fila of filasValidas) {
        const day = fila.dia + 1; // el backend usa 0=Lunes; ClassData.schedule usa 1=Lunes
        const periodIndex = periodIndexOf.get(`${fila.hora_inicio}|${fila.hora_fin}`);
        if (periodIndex === undefined) continue;

        // El grupo (p.ej. "S4ABCD", ya fusionado si varias "Unidad" compartían
        // hora) se guarda como campo propio, separado de la materia (que vive
        // en el Curso): el nivel real lo da la columna "Enseñanza" del PDF
        // (p.ej. "4ESOPDC", "1ºESO").
        const esAcademica = !!fila.grupo;
        const level = esAcademica ? normalizarNivel(fila.ensenanza || fila.grupo!) : 'Otro';
        const course = findOrCreateCourse(fila.asignatura, level, esAcademica ? 'academic' : 'other');
        const cls = findOrCreateClass(course.id, esAcademica ? fila.grupo! : undefined);

        const yaTieneFranja = (cls.schedule || []).some(s => s.day === day && s.periodIndex === periodIndex);
        if (!yaTieneFranja) {
            const nuevaFranja: { day: number; periodIndex: number; aula?: string } = { day, periodIndex };
            if (fila.aula) nuevaFranja.aula = fila.aula;
            cls.schedule = [...(cls.schedule || []), nuevaFranja];
        }
    }

    // Cursos/grupos académicos que ya existían antes de esta importación pero
    // no han recibido ninguna franja del PDF actual: ya no aparecen en el
    // horario que se está importando. Se listan siempre (para avisar), y solo
    // se borran (con su alumnado y calificaciones) si el usuario lo confirma.
    const clasesAcademicasSinUsar = newClasses.filter(cl => {
        if (idsClasesTocadas.has(cl.id)) return false;
        const course = newCourses.find(c => c.id === cl.courseId);
        return course?.type !== 'other';
    });

    if (borrarAcademicasSinUsar && clasesAcademicasSinUsar.length > 0) {
        const idsABorrar = new Set(clasesAcademicasSinUsar.map(cl => cl.id));
        newClasses = newClasses.filter(cl => !idsABorrar.has(cl.id));
        const idsCoursesConClase = new Set(newClasses.map(cl => cl.courseId));
        newCourses = newCourses.filter(c => c.type === 'other' ? true : idsCoursesConClase.has(c.id));
    }

    return {
        periods,
        courses: newCourses,
        classes: newClasses,
        clasesCreadas: idsClasesNuevas.size,
        clasesActualizadas: idsClasesActualizadas.size,
        clasesAcademicasSinUsar,
    };
};

const ImportScheduleModal: React.FC<ImportScheduleModalProps> = ({ isOpen, onClose, courses, setCourses, classes, setClasses, academicConfiguration, setAcademicConfiguration }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [filas, setFilas] = useState<FilaHorario[] | null>(null);
    const [erroresExtraccion, setErroresExtraccion] = useState<string[]>([]);
    const [applied, setApplied] = useState(false);
    const [borrarAcademicasSinUsar, setBorrarAcademicasSinUsar] = useState(false);

    const handleClose = () => {
        setFilas(null);
        setErroresExtraccion([]);
        setErrorMsg(null);
        setApplied(false);
        setBorrarAcademicasSinUsar(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        onClose();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setErrorMsg(null);
        setFilas(null);

        try {
            const formData = new FormData();
            formData.append('archivo', file);
            const response = await fetch('/api/horario/importar-pdf', { method: 'POST', body: formData });

            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.detail || `El servidor respondió con un error (HTTP ${response.status}).`);
            }

            const data = await response.json();
            setFilas(data.filas || []);
            setErroresExtraccion(data.errores || []);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const plan = filas ? buildImportPlan(filas, courses, classes, academicConfiguration.evaluationPeriods, borrarAcademicasSinUsar) : null;

    const handleConfirm = () => {
        if (!plan) return;
        setAcademicConfiguration(prev => ({ ...prev, periods: plan.periods }));
        setCourses(plan.courses);
        setClasses(plan.classes);
        setApplied(true);
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Importar Horario desde PDF" size="2xl">
            <div className="space-y-4">
                {applied ? (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                        Horario importado con éxito. Puedes revisarlo y ajustarlo en "Horario Semanal" y en "Cursos y Materias".
                        <div className="mt-4 text-right">
                            <button onClick={handleClose} className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 font-medium">Cerrar</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-slate-600">
                            Sube el PDF oficial "Horario individual del profesorado" (SAUCE). Se extraen las franjas
                            horarias y, para cada una con grupo asignado, se crea (o reutiliza) un curso y una clase
                            con ese alumnado vacío listo para rellenar.
                        </p>

                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                            <p>⚠️ Al confirmar, la lista de <strong>franjas horarias</strong> (Ajustes → Configuración del Curso) se <strong>sustituye</strong> por las horas encontradas en el PDF. Pensado para hacerse una vez, al empezar.</p>
                            <p>Las <strong>otras ocupaciones</strong> (guardias, reuniones, recreo...) se sustituyen siempre por completo — no guardan alumnado ni calificaciones.</p>
                            <p>El <strong>aula</strong> de cada sesión se importa junto a la franja; puedes revisarla o añadir una nota (p.ej. "Laboratorio") pulsando la celda en "Horario Semanal".</p>
                            <p>Los grupos que ya venían fusionados en una misma franja (p.ej. dos subgrupos compartiendo una clase) se mantienen como un único nombre combinado.</p>
                        </div>

                        {!filas && (
                            <div>
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf" className="hidden" />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={loading}
                                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium shadow-sm disabled:bg-blue-300"
                                >
                                    <ArrowUpTrayIcon className="w-5 h-5" />
                                    {loading ? 'Leyendo el PDF…' : 'Seleccionar PDF del horario'}
                                </button>
                            </div>
                        )}

                        {errorMsg && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errorMsg}</div>
                        )}

                        {erroresExtraccion.length > 0 && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                                <p className="font-semibold mb-1">Avisos durante la extracción:</p>
                                <ul className="list-disc list-inside">
                                    {erroresExtraccion.map((e, i) => <li key={i}>{e}</li>)}
                                </ul>
                            </div>
                        )}

                        {plan && filas && filas.length > 0 && (
                            <div className="space-y-3">
                                <div className="p-3 border rounded-lg bg-slate-50 text-sm text-slate-700">
                                    <p>{filas.length} franjas encontradas en el PDF.</p>
                                    <p>{plan.periods.length} franjas horarias distintas.</p>
                                    <p>{plan.clasesCreadas} clase(s) nueva(s) se crearán; {plan.clasesActualizadas} clase(s) existentes se completarán con nuevas franjas.</p>
                                </div>
                                {plan.clasesAcademicasSinUsar.length > 0 && (
                                    <label className="flex items-start gap-2 p-3 border border-red-200 rounded-lg bg-red-50 text-sm text-red-800 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={borrarAcademicasSinUsar}
                                            onChange={e => setBorrarAcademicasSinUsar(e.target.checked)}
                                            className="mt-0.5"
                                        />
                                        <span>
                                            <span className="font-semibold">
                                                {plan.clasesAcademicasSinUsar.length} curso(s)/grupo(s) académico(s) ya no aparecen en este horario:
                                            </span>
                                            {' '}
                                            {plan.clasesAcademicasSinUsar.map(cl => (
                                                <ClassLabel key={cl.id} classData={cl} courses={courses} className="inline-block mr-1.5" />
                                            ))}
                                            <br />
                                            Márcalo para borrarlos por completo, <strong>incluyendo su alumnado y calificaciones</strong>. Sin marcar,
                                            se dejan tal cual estaban (con su horario anterior).
                                        </span>
                                    </label>
                                )}
                                <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                                    {classes.length === 0 && plan.classes.length === 0 && (
                                        <p className="p-3 text-slate-500 text-sm">No se ha detectado ninguna franja con grupo o materia.</p>
                                    )}
                                    {plan.classes.map(cls => {
                                        const course = plan.courses.find(c => c.id === cls.courseId);
                                        return (
                                            <div key={cls.id} className="p-2 px-3 text-sm flex justify-between items-center gap-2">
                                                <span>
                                                    <ClassLabel classData={cls} courses={plan.courses} />
                                                    {course && <span className="text-slate-400 ml-2">({course.level})</span>}
                                                </span>
                                                <span className="text-slate-400 flex-shrink-0">{(cls.schedule || []).length} sesión(es)/semana</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
                                    <Button variant="primary" onClick={handleConfirm}>Confirmar Importación</Button>
                                </div>
                            </div>
                        )}

                        {filas && filas.length === 0 && !errorMsg && (
                            <p className="text-slate-500 text-sm">No se ha reconocido ninguna franja horaria en este PDF.</p>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default ImportScheduleModal;
