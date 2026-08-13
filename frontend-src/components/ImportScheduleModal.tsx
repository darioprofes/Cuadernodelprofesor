
import React, { useState, useRef } from 'react';
import Modal from './Modal';
import Button from './Button';
import { ArrowUpTrayIcon, ArrowDownTrayIcon } from './Icons';
import ClassLabel from './ClassLabel';
import type { ClassData, Course, AcademicConfiguration, FilaHorario } from '../types';
import { HUE_PRESETS, buildDefaultCategories } from '../utils';
import { useCreateCourse, useDeleteCourse } from '../hooks/useCourses';
import { useCreateClass, useUpdateClass, useDeleteClass } from '../hooks/useApiClasses';
import { useAcademicYearCourses, useAddAcademicYearCourse, useRemoveAcademicYearCourse, useEvaluationPeriods } from '../hooks/useAcademicYears';
import { useCreateCategory } from '../hooks/useCategories';
import { generateHorarioTemplate, parseHorarioWorkbook } from '../services/scheduleWizard';
import { isTauri } from '@tauri-apps/api/core';

// El PDF oficial necesita pdfplumber (solo backend Python) -- sin
// equivalente en Rust, mismo criterio ya aplicado a la importación de
// horario del asistente de inicio de curso. El Excel es puro cálculo en
// memoria (exceljs), funciona igual en las dos plataformas -- en
// escritorio es la única opción, así que ni se muestra el selector de modo.
const PDF_IMPORT_AVAILABLE = !isTauri();

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

interface ImportScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    // courses/classes: ya resueltos por ScheduleManager (curriculumCourses /
    // clases del backend nuevo mapeadas a la forma local). Se renderiza en
    // las dos plataformas (ver PDF_IMPORT_AVAILABLE más arriba) — el plan
    // se aplica siempre contra el backend "nuevo" sin rama isDesktop propia
    // porque services/api.ts ya enruta esas mutaciones por su cuenta.
    courses: Course[];
    classes: ClassData[];
    yearId: string;
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
export const normalizarNivel = (raw: string): string => {
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
//
// `sustituirOtrasOcupaciones` (por defecto true, comportamiento histórico de
// este asistente): "otras ocupaciones" (guardias, reuniones, recreo...) no
// guardan alumnado ni calificaciones, así que importar el horario implica
// sustituirlas siempre por completo (curso + clase) — sin esto, reimportar
// tras renombrar una (p.ej. "Libre" → "RECREO") no la reconoce por el
// nombre y crea otra en paralelo, dejando la antigua con franjas obsoletas.
// SyncAcademicYearModal.tsx pasa `false`: ese flujo promete no borrar nada
// sin que el profesor lo marque explícitamente (a diferencia de este
// asistente), así que "otras ocupaciones" se emparejan por identidad
// (materia+tipo, igual que las académicas) en vez de sustituirse siempre.
//
// `periodosReferencia`: por defecto (undefined/vacío, comportamiento
// histórico) la lista de franjas se recalcula desde cero a partir de lo que
// aparece en el propio fichero — correcto para el asistente de importación,
// que no tiene ningún horario previo con el que ser consistente. Pero
// SyncAcademicYearModal.tsx sincroniza sobre un curso YA activo, cuyas
// clases guardan sus franjas por ÍNDICE (ClassData.schedule[].periodIndex),
// no por texto: si una franja real (p.ej. "11:00-11:30") no tiene ninguna
// clase asignada esa semana, recalcular la lista la haría desaparecer y
// desplazaría el índice de todas las franjas posteriores, desincronizando
// las franjas ya guardadas de cualquier clase real que sí las usa (bug real
// encontrado verificando esta función contra producción: una clase con una
// franja después del hueco aparecía como "actualizada", duplicando esa
// franja con el índice desplazado en vez de reconocerla). Se le pasan las
// franjas reales del curso (`academicYear.periods`), en su orden real, y se
// usan tal cual — ninguna franja desaparece ni cambia de índice solo por no
// tener contenido esta semana.
export const buildImportPlan = (filas: FilaHorario[], courses: Course[], classes: ClassData[], evaluationPeriods: AcademicConfiguration['evaluationPeriods'], borrarAcademicasSinUsar: boolean, sustituirOtrasOcupaciones: boolean = true, periodosReferencia?: string[]) => {
    // La materia puede venir vacía (franja sin nada asignado en el PDF,
    // p.ej. el recreo): se importa igual, sin nombre por defecto.
    const filasValidas = filas.filter(f => f.hora_inicio && f.hora_fin);

    const idsOtrasOcupaciones = sustituirOtrasOcupaciones
        ? new Set(courses.filter(c => c.type === 'other').map(c => c.id))
        : new Set<string>();

    // Igual que "inicio" e "fin" cuando la franja viene de una etiqueta
    // libre sin horas (p.ej. "Recreo", ver scheduleWizard.ts) — sin este
    // caso especial saldría duplicada como "Recreo-Recreo". Un PDF real
    // nunca produce inicio===fin (toda franja tiene alguna duración), así
    // que esto no cambia nada para esa vía. Solo se usa para RECONSTRUIR una
    // etiqueta a partir de inicio/fin ya conocidos — nunca para separar una
    // etiqueta ya unida, que podría contener guiones propios.
    const etiquetaFranja = (inicio: string, fin: string): string => (inicio === fin ? inicio : `${inicio}-${fin}`);

    let periods: string[];
    let periodIndexOf: (fila: { hora_inicio: string; hora_fin: string }) => number | undefined;
    if (periodosReferencia && periodosReferencia.length > 0) {
        periods = periodosReferencia;
        const porEtiqueta = new Map(periodosReferencia.map((label, i) => [label, i]));
        periodIndexOf = fila => porEtiqueta.get(etiquetaFranja(fila.hora_inicio, fila.hora_fin));
    } else {
        const parejasUnicas = Array.from(new Set(filasValidas.map(f => `${f.hora_inicio}|${f.hora_fin}`)))
            .map(par => {
                const [inicio, fin] = par.split('|');
                return { inicio, fin };
            })
            .sort((a, b) => toMinutes(a.inicio) - toMinutes(b.inicio));
        periods = parejasUnicas.map(p => etiquetaFranja(p.inicio, p.fin));
        const porPar = new Map(parejasUnicas.map((p, i) => [`${p.inicio}|${p.fin}`, i]));
        periodIndexOf = fila => porPar.get(`${fila.hora_inicio}|${fila.hora_fin}`);
    }

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
        const periodIndex = periodIndexOf(fila);
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
        idsClasesNuevas,
        idsClasesActualizadas,
    };
};

const ImportScheduleModal: React.FC<ImportScheduleModalProps> = ({ isOpen, onClose, courses, classes, yearId, academicConfiguration, setAcademicConfiguration }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const excelFileInputRef = useRef<HTMLInputElement>(null);
    const [modo, setModo] = useState<'pdf' | 'excel'>(PDF_IMPORT_AVAILABLE ? 'pdf' : 'excel');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [filas, setFilas] = useState<FilaHorario[] | null>(null);
    const [erroresExtraccion, setErroresExtraccion] = useState<string[]>([]);
    const [applied, setApplied] = useState(false);
    const [borrarAcademicasSinUsar, setBorrarAcademicasSinUsar] = useState(false);
    const [applying, setApplying] = useState(false);

    const createCourseMutation = useCreateCourse();
    const deleteCourseMutation = useDeleteCourse();
    const createClassMutation = useCreateClass();
    const updateClassMutation = useUpdateClass();
    const deleteClassMutation = useDeleteClass();
    // academic_year_courses (Fase 8): este flujo crea/borra courses+classes
    // directamente, desde antes de que existiera esa tabla — sin este hook
    // las materias académicas importadas quedaban sin declarar como
    // "impartidas este curso académico" (invisibles en la píldora de
    // Materia/en "Materias" de Ajustes), aunque sus clases sí se crearan
    // bien. "Otras ocupaciones" (type 'other') no pasan por aquí a
    // propósito, igual que en CourseManager.tsx.
    const yearCoursesQuery = useAcademicYearCourses(yearId);
    const addYearCourseMutation = useAddAcademicYearCourse();
    const removeYearCourseMutation = useRemoveAcademicYearCourse();
    // Bug real (2026-08-04): las clases nuevas se quedaban sin categorías de
    // calificación por defecto. `academicConfiguration.evaluationPeriods`
    // (prop heredada de SettingsModal, sin resolver por plataforma) es el del
    // blob viejo, vacío en web — así que buildDefaultCategories() no tenía
    // con qué construir nada. Y aunque lo tuviera, createClassMutation solo
    // manda los campos "cáscara" (courseId/grupo/schedule/colorAcento): las
    // categorías nunca se enviaban al servidor, había que crearlas aparte.
    const remotePeriods = useEvaluationPeriods(yearId, { enabled: !!yearId });
    const realEvaluationPeriods = (remotePeriods.data ?? []).map(p => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate }));
    const createCategoryMutation = useCreateCategory();

    const handleClose = () => {
        setFilas(null);
        setErroresExtraccion([]);
        setErrorMsg(null);
        setApplied(false);
        setBorrarAcademicasSinUsar(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (excelFileInputRef.current) excelFileInputRef.current.value = '';
        onClose();
    };

    const handleDownloadTemplate = async () => {
        try {
            const blob = await generateHorarioTemplate();
            downloadBlob(blob, 'plantilla_horario.xlsx');
        } catch (e) {
            setErrorMsg(`Error al generar la plantilla: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleFileChangeExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setErrorMsg(null);
        setFilas(null);

        try {
            const buffer = await file.arrayBuffer();
            const { filas: parsedFilas, errores } = await parseHorarioWorkbook(buffer);
            setFilas(parsedFilas);
            setErroresExtraccion(errores);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
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

    const handleConfirm = async () => {
        if (!plan) return;
        setApplying(true);
        try {
            // 1. Cursos que desaparecen del plan: "otras ocupaciones" siempre
            //    (se sustituyen por completo, buildImportPlan ya las excluyó de
            //    newCourses de entrada) + académicas sin usar solo si el
            //    usuario marcó el checkbox. Hay que borrar sus clases antes que
            //    el curso (course_id es RESTRICT).
            const linkedCourseIds = new Set((yearCoursesQuery.data ?? []).map(yc => yc.courseId));
            const coursesToDelete = courses.filter(c => !plan.courses.some(pc => pc.id === c.id));
            for (const course of coursesToDelete) {
                const classesToDelete = classes.filter(cl => cl.courseId === course.id);
                for (const cls of classesToDelete) {
                    await deleteClassMutation.mutateAsync({ id: cls.id, yearId });
                }
                // course_id es RESTRICT en academic_year_courses (Fase 8) —
                // hay que desenlazar antes de borrar la materia, si no da 409
                // (mismo caso ya arreglado en CourseManager.tsx). "Otras
                // ocupaciones" nunca se enlazan, no hace falta comprobarlas.
                if (course.type !== 'other' && linkedCourseIds.has(course.id)) {
                    await removeYearCourseMutation.mutateAsync({ yearId, courseId: course.id });
                }
                await deleteCourseMutation.mutateAsync(course.id);
            }

            // 2. Cursos nuevos del plan (académicos nuevos + "otras
            //    ocupaciones" recién creadas) — se necesita el id real para
            //    poder crear sus clases después.
            const idMap = new Map<string, string>();
            for (const course of plan.courses) {
                if (!courses.some(c => c.id === course.id)) {
                    const created = await createCourseMutation.mutateAsync({ level: course.level, subject: course.subject, type: course.type ?? 'academic' });
                    idMap.set(course.id, created.id);
                }
            }

            // 2b. Declarar como "impartidas este curso académico" todas las
            //     materias académicas del plan (nuevas o reutilizadas de otro
            //     año) que todavía no lo estén — sin esto, sus clases se
            //     crean bien pero la materia no aparece en la píldora de
            //     Materia ni en "Materias" de Ajustes (bug real encontrado
            //     tras el bloque 5: la importación creaba clases pero nunca
            //     enlazaba la materia, porque este flujo es anterior a
            //     academic_year_courses).
            for (const course of plan.courses) {
                if (course.type === 'other') continue;
                const realCourseId = idMap.get(course.id) ?? course.id;
                if (!linkedCourseIds.has(realCourseId)) {
                    await addYearCourseMutation.mutateAsync({ yearId, data: { courseId: realCourseId } });
                }
            }

            // 3. Clases nuevas o con franjas añadidas/cambiadas.
            for (const cls of plan.classes) {
                const realCourseId = idMap.get(cls.courseId) ?? cls.courseId;
                if (plan.idsClasesNuevas.has(cls.id)) {
                    const created = await createClassMutation.mutateAsync({
                        yearId,
                        data: { courseId: realCourseId, grupo: cls.grupo, schedule: cls.schedule ?? [], colorAcento: cls.colorAcento },
                    });
                    // Solo clases académicas reales (con grupo) llevan
                    // categorías de calificación por defecto — igual que
                    // ClassManager.tsx al crear una a mano.
                    if (cls.grupo !== undefined) {
                        for (const cat of buildDefaultCategories(realEvaluationPeriods)) {
                            await createCategoryMutation.mutateAsync({
                                classId: created.id,
                                data: { evaluationPeriodId: cat.evaluationPeriodId, name: cat.name, weight: cat.weight },
                            });
                        }
                    }
                } else if (plan.idsClasesActualizadas.has(cls.id)) {
                    await updateClassMutation.mutateAsync({ id: cls.id, yearId, data: { schedule: cls.schedule ?? [] } });
                }
            }

            setAcademicConfiguration(prev => ({ ...prev, periods: plan.periods }));
            setApplied(true);
        } finally {
            setApplying(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Importar Horario" size="2xl">
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
                        {PDF_IMPORT_AVAILABLE && (
                            <div className="flex gap-2 border-b border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => { setModo('pdf'); setFilas(null); setErroresExtraccion([]); setErrorMsg(null); }}
                                    className={`px-3 py-2 text-sm font-medium border-b-2 ${modo === 'pdf' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                >
                                    PDF oficial (SAUCE)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setModo('excel'); setFilas(null); setErroresExtraccion([]); setErrorMsg(null); }}
                                    className={`px-3 py-2 text-sm font-medium border-b-2 ${modo === 'excel' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                >
                                    Excel
                                </button>
                            </div>
                        )}

                        <p className="text-sm text-slate-600">
                            {modo === 'pdf'
                                ? 'Sube el PDF oficial "Horario individual del profesorado" (SAUCE).'
                                : 'Sube un Excel con hoja "Horario" — descarga la plantilla si no tienes una ya rellena (mismo formato que la del asistente de inicio de curso).'
                            } Se extraen las franjas horarias y, para cada una con grupo asignado, se crea (o reutiliza) un curso y una clase con ese alumnado vacío listo para rellenar.
                        </p>

                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                            <p>⚠️ Al confirmar, la lista de <strong>franjas horarias</strong> (Ajustes → Configuración del Curso) se <strong>sustituye</strong> por las horas encontradas en el archivo. Pensado para hacerse una vez, al empezar.</p>
                            <p>Las <strong>otras ocupaciones</strong> (guardias, reuniones, recreo...) se sustituyen siempre por completo — no guardan alumnado ni calificaciones.</p>
                            <p>El <strong>aula</strong> de cada sesión se importa junto a la franja; puedes revisarla o añadir una nota (p.ej. "Laboratorio") pulsando la celda en "Horario Semanal".</p>
                            <p>Los grupos que ya venían fusionados en una misma franja (p.ej. dos subgrupos compartiendo una clase) se mantienen como un único nombre combinado.</p>
                        </div>

                        {!filas && modo === 'pdf' && (
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

                        {!filas && modo === 'excel' && (
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={handleDownloadTemplate}
                                    className="w-full flex items-center justify-center gap-2 bg-white text-blue-600 border border-blue-200 py-2 rounded-lg hover:bg-blue-50 font-medium text-sm"
                                >
                                    <ArrowDownTrayIcon className="w-4 h-4" />
                                    Descargar plantilla Excel
                                </button>
                                <input type="file" ref={excelFileInputRef} onChange={handleFileChangeExcel} accept=".xlsx" className="hidden" />
                                <button
                                    onClick={() => excelFileInputRef.current?.click()}
                                    disabled={loading}
                                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium shadow-sm disabled:bg-blue-300"
                                >
                                    <ArrowUpTrayIcon className="w-5 h-5" />
                                    {loading ? 'Leyendo el Excel…' : 'Seleccionar Excel del horario'}
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
                                    <p>{filas.length} franjas encontradas.</p>
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
                                    <Button variant="primary" onClick={handleConfirm} disabled={applying}>{applying ? 'Aplicando…' : 'Confirmar Importación'}</Button>
                                </div>
                            </div>
                        )}

                        {filas && filas.length === 0 && !errorMsg && (
                            <p className="text-slate-500 text-sm">No se ha reconocido ninguna franja horaria en el archivo.</p>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default ImportScheduleModal;
