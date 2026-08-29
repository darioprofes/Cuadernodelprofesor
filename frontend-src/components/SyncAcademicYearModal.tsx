import React, { useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import { buildDefaultCategories } from '../utils';
import type { ClassData, Course } from '../types';
import type { AcademicYearHoliday, EvaluationPeriod, Student as ApiStudent } from '../types/api';
import { useCreateCourse } from '../hooks/useCourses';
import { useCreateClass, useUpdateClass, useDeleteClass } from '../hooks/useApiClasses';
import {
    useUpdateAcademicYear, useCreateEvaluationPeriod, useUpdateEvaluationPeriod,
    useAddAcademicYearCourse,
} from '../hooks/useAcademicYears';
import { useCreateCategory } from '../hooks/useCategories';
import { useCreateEnrollment, useDeleteEnrollment } from '../hooks/useEnrollments';
import { generateTemplate, parseWorkbook, buildDatosRealesTemplate, type FilaAlumnado, type FilaFestivo, type ParsedWorkbook } from '../services/scheduleWizard';
import { buildImportPlan, normalizarNivel } from './ImportScheduleModal';
import { resolverAlumno } from '../services/excelSync';

// Respuesta de POST /calendario/importar-pdf -- ver
// api/app/services/calendario_pdf.py y el mismo tipo en
// StartOfYearWizardModal.tsx. Aquí solo interesan festivos/noLectivo/
// vacaciones: el curso ya existe, sus fechas de inicio/fin no se tocan
// desde este modal (no hay campo editable para ellas, a diferencia del
// asistente de curso nuevo), así que inicioClases/finClases del PDF no
// tienen dónde aplicarse.
interface CalendarioPdfResultado {
    inicioClases: { fecha: string; etiqueta: string }[];
    finClases: { fecha: string; etiqueta: string }[];
    noLectivo: FilaFestivo[];
    vacaciones: FilaFestivo[];
    festivos: FilaFestivo[];
    errores: string[];
}

interface SyncAcademicYearModalProps {
    isOpen: boolean;
    onClose: () => void;
    yearId: string;
    yearLabel: string;
    yearStartDate: string;
    yearEndDate: string;
    yearHolidays: AcademicYearHoliday[];
    yearPeriods: string[];
    evaluationPeriods: EvaluationPeriod[];
    courses: Course[];
    classes: ClassData[]; // clases reales del curso activo, con .students ya hidratado (joinEnrolledStudents)
    allStudents: ApiStudent[];
}

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

// Misma lógica de resolución de clase que StartOfYearWizardModal.tsx —
// Nivel/Materia/Grupo de la fila contra el plan calculado por
// buildImportPlan (materia+nivel normalizado -> curso, curso+grupo ->
// clase). Duplicada a propósito (5 líneas): no merece la pena exportarla
// solo para esto y acoplar los dos modales por un detalle tan pequeño.
const resolveClassId = (fila: FilaAlumnado, plan: ReturnType<typeof buildImportPlan>): string | null => {
    const nivel = normalizarNivel(fila.nivel);
    const course = plan.courses.find(c => c.type !== 'other' && c.subject === fila.materia && c.level === nivel);
    if (!course) return null;
    const cls = plan.classes.find(c => c.courseId === course.id && c.grupo === fila.grupo);
    return cls?.id ?? null;
};

const nombreCompleto = (s: { nombre?: string; primerApellido?: string; segundoApellido?: string }): string =>
    [s.nombre, s.primerApellido, s.segundoApellido].filter(Boolean).join(' ') || '(sin nombre)';

const SyncAcademicYearModal: React.FC<SyncAcademicYearModalProps> = ({
    isOpen, onClose, yearId, yearLabel, yearStartDate, yearEndDate, yearHolidays, yearPeriods,
    evaluationPeriods, courses, classes, allStudents,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
    const [applied, setApplied] = useState(false);
    const [applying, setApplying] = useState(false);
    const [descargando, setDescargando] = useState(false);
    const calendarioFileInputRef = useRef<HTMLInputElement>(null);
    const [importandoCalendario, setImportandoCalendario] = useState(false);
    const [calendarioImportado, setCalendarioImportado] = useState<CalendarioPdfResultado | null>(null);
    // Ids (de plan.classes / enrollmentId real) marcados a mano para borrar
    // — todo vacío por defecto, nada se borra si el profesor no lo marca
    // explícitamente él mismo.
    const [clasesABorrar, setClasesABorrar] = useState<Set<string>>(new Set());
    const [enrollmentsABorrar, setEnrollmentsABorrar] = useState<Set<string>>(new Set());
    const [resumenAplicado, setResumenAplicado] = useState({
        clasesCreadas: 0, clasesActualizadas: 0, clasesBorradas: 0,
        alumnadoNuevo: 0, alumnadoMatriculado: 0, alumnadoBorrado: 0,
    });

    const updateAcademicYearMutation = useUpdateAcademicYear();
    const createEvaluationPeriodMutation = useCreateEvaluationPeriod();
    const updateEvaluationPeriodMutation = useUpdateEvaluationPeriod();
    const createCourseMutation = useCreateCourse();
    const addYearCourseMutation = useAddAcademicYearCourse();
    const createClassMutation = useCreateClass();
    const updateClassMutation = useUpdateClass();
    const deleteClassMutation = useDeleteClass();
    const createCategoryMutation = useCreateCategory();
    const createEnrollmentMutation = useCreateEnrollment();
    const deleteEnrollmentMutation = useDeleteEnrollment();

    const handleClose = () => {
        setParsed(null);
        setErrorMsg(null);
        setApplied(false);
        setClasesABorrar(new Set());
        setEnrollmentsABorrar(new Set());
        setCalendarioImportado(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (calendarioFileInputRef.current) calendarioFileInputRef.current.value = '';
        onClose();
    };

    // No lectivo/vacaciones importados del PDF, listos para fusionarse con
    // los festivos ya reales del curso -- se excluye cualquier entrada sin
    // fecha de fin exacta (p.ej. vacaciones de verano, ver
    // calendario_pdf.py); el aviso correspondiente ya viene en
    // `calendarioImportado.errores` y se muestra tal cual.
    const festivosImportados: FilaFestivo[] = useMemo(() => {
        if (!calendarioImportado) return [];
        const festivos = calendarioImportado.festivos.map(h => ({ ...h, tipo: 'festivo' as const }));
        const noLectivo = calendarioImportado.noLectivo.map(h => ({ ...h, tipo: 'no_lectivo' as const }));
        const vacaciones = calendarioImportado.vacaciones.filter(h => h.fechaFin).map(h => ({ ...h, tipo: 'vacaciones' as const }));
        return [...festivos, ...noLectivo, ...vacaciones];
    }, [calendarioImportado]);

    const handleImportarCalendarioPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImportandoCalendario(true);
        setErrorMsg(null);

        try {
            const formData = new FormData();
            formData.append('archivo', file);
            const response = await fetch('/api/calendario/importar-pdf', { method: 'POST', body: formData });

            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.detail || `El servidor respondió con un error (HTTP ${response.status}).`);
            }

            setCalendarioImportado(await response.json());
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
        } finally {
            setImportandoCalendario(false);
            if (calendarioFileInputRef.current) calendarioFileInputRef.current.value = '';
        }
    };

    const handleDownloadTemplate = async () => {
        setDescargando(true);
        try {
            const datosReales = buildDatosRealesTemplate({
                holidays: [
                    ...yearHolidays.map(h => ({ nombre: h.name, fechaInicio: h.startDate, fechaFin: h.endDate, tipo: h.type })),
                    ...festivosImportados,
                ],
                evaluationPeriods: evaluationPeriods.map(p => ({ nombre: p.name, fechaInicio: p.startDate, fechaFin: p.endDate, peso: p.weight })),
                periods: yearPeriods,
                classes,
                courses,
            });
            const blob = await generateTemplate({ label: yearLabel, startDate: yearStartDate, endDate: yearEndDate }, datosReales);
            downloadBlob(blob, `configuracion_${yearLabel}.xlsx`);
        } catch (e) {
            setErrorMsg(`Error al generar la plantilla: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setDescargando(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setErrorMsg(null);
        setParsed(null);
        setClasesABorrar(new Set());
        setEnrollmentsABorrar(new Set());
        try {
            const buffer = await file.arrayBuffer();
            setParsed(await parseWorkbook(buffer));
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    // `classes=[]` en evaluationPeriods -> buildImportPlan solo necesita
    // {id,name,startDate,endDate} para nombrar categorías por defecto en
    // clases nuevas; se le pasan las reales del curso activo.
    // `sustituirOtrasOcupaciones=false`: a diferencia del asistente de
    // importación de horario, este modal nunca borra nada sin que el
    // profesor lo marque a mano — "otras ocupaciones" deben emparejarse por
    // identidad (materia+tipo) igual que las académicas, no sustituirse
    // siempre por completo (ver comentario en buildImportPlan).
    // `yearPeriods` como referencia: las franjas del curso YA activo deben
    // mantener su índice real aunque alguna no tenga ninguna clase asignada
    // esta semana — recalcularlas desde cero (comportamiento por defecto,
    // pensado para el asistente de importación) desincroniza el horario ya
    // guardado de cualquier clase real (ver comentario en buildImportPlan).
    const plan = parsed ? buildImportPlan(parsed.filas, courses, classes, evaluationPeriods, false, false, yearPeriods) : null;

    // Previsualización de alumnado: SIN mutar nada, solo para contar y
    // para construir la lista de "matriculado y ausente del fichero". La
    // resolución real (con dedupe de alumnado nuevo repetido en varias
    // clases) se repite en handleConfirm — mismo criterio que
    // StartOfYearWizardModal con alumnadoResuelto/handleConfirm.
    const alumnadoPreview = useMemo(() => {
        if (!plan || !parsed) return null;
        let nuevos = 0, existentes = 0, ambiguos = 0, sinClase = 0;
        const resueltosPorClase = new Map<string, Set<string>>();
        for (const fila of parsed.alumnado) {
            const classId = resolveClassId(fila, plan);
            if (!classId) { sinClase++; continue; }
            const match = resolverAlumno(fila, allStudents);
            if (match.tipo === 'ambiguo') { ambiguos++; continue; }
            if (match.tipo === 'nuevo') { nuevos++; continue; }
            existentes++;
            const set = resueltosPorClase.get(classId) ?? new Set<string>();
            set.add(match.studentId);
            resueltosPorClase.set(classId, set);
        }
        const ausentes: { classId: string; classLabel: string; enrollmentId: string; nombre: string }[] = [];
        for (const cls of plan.classes) {
            if (plan.idsClasesNuevas.has(cls.id)) continue; // clase nueva: no puede tener ausentes
            const resueltos = resueltosPorClase.get(cls.id) ?? new Set<string>();
            const claseReal = classes.find(c => c.id === cls.id);
            for (const s of claseReal?.students ?? []) {
                if (!s.enrollmentId || resueltos.has(s.id)) continue;
                ausentes.push({ classId: cls.id, classLabel: cls.grupo ?? '(sin grupo)', enrollmentId: s.enrollmentId, nombre: nombreCompleto(s) });
            }
        }
        return { nuevos, existentes, ambiguos, sinClase, ausentes };
    }, [plan, parsed, allStudents, classes]);

    const toggleClaseABorrar = (id: string) => {
        setClasesABorrar(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleEnrollmentABorrar = (id: string) => {
        setEnrollmentsABorrar(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleConfirm = async () => {
        if (!plan || !parsed || !parsed.cursoAcademico) return;
        setApplying(true);
        setErrorMsg(null);
        try {
            const cursoAcademico = parsed.cursoAcademico;
            const clasesCreadas = plan.clasesCreadas;
            const clasesActualizadas = plan.clasesActualizadas;

            // 1. Curso académico: fechas/nombre, festivos, periodos de
            // evaluación (si el Excel trae los suyos, sustituyen a los
            // actuales — mismo criterio que StartOfYearWizardModal, pero
            // aquí sobre el curso YA activo, no uno nuevo).
            await updateAcademicYearMutation.mutateAsync({
                id: yearId,
                data: {
                    label: cursoAcademico.label,
                    startDate: cursoAcademico.startDate,
                    endDate: cursoAcademico.endDate,
                    holidays: cursoAcademico.holidays.map(h => ({ id: crypto.randomUUID(), name: h.nombre, startDate: h.fechaInicio, endDate: h.fechaFin, type: h.tipo })),
                },
            });
            // Los periodos de evaluación se EMPAREJAN por nombre y solo se
            // actualizan o se crean los que faltan — nunca se borran desde
            // aquí. evaluation_periods tiene categorías/tareas evaluables
            // colgando con ON DELETE RESTRICT (una por cada clase real con
            // alumnado), así que borrar y recrear sin más rompía la
            // sincronización en cuanto el curso tenía datos reales: el
            // primer borrado lanzaba un 409 que ni se capturaba, dejando
            // todo lo posterior (materias/clases/alumnado/borrados
            // marcados) sin aplicar y sin avisar (bug real, encontrado tras
            // un aviso del profesor de que la sincronización se quedaba a
            // medias). Un periodo que ya no aparece en el Excel se deja tal
            // cual — se gestiona a mano en Ajustes si hace falta borrarlo.
            for (const p of cursoAcademico.evaluationPeriods) {
                const existente = evaluationPeriods.find(ep => ep.name.trim() === p.nombre.trim());
                if (existente) {
                    await updateEvaluationPeriodMutation.mutateAsync({
                        id: existente.id, yearId,
                        data: { name: p.nombre, startDate: p.fechaInicio, endDate: p.fechaFin, weight: p.peso },
                    });
                } else {
                    await createEvaluationPeriodMutation.mutateAsync({
                        yearId,
                        data: { name: p.nombre, startDate: p.fechaInicio, endDate: p.fechaFin, weight: p.peso },
                    });
                }
            }

            // 2. Materias/clases/horario — mismo procedimiento que
            // StartOfYearWizardModal/ImportScheduleModal.
            const courseIdsUsados = new Set(plan.classes.map(cl => cl.courseId));
            const courseIdMap = new Map<string, string>();
            for (const course of plan.courses) {
                if (!courses.some(c => c.id === course.id)) {
                    const created = await createCourseMutation.mutateAsync({ level: course.level, subject: course.subject, type: course.type ?? 'academic' });
                    courseIdMap.set(course.id, created.id);
                }
            }
            for (const course of plan.courses) {
                if (course.type === 'other' || !courseIdsUsados.has(course.id)) continue;
                const realCourseId = courseIdMap.get(course.id) ?? course.id;
                try {
                    await addYearCourseMutation.mutateAsync({ yearId, data: { courseId: realCourseId } });
                } catch {
                    // Ya declarada como impartida este curso (409 por UNIQUE) — nada que hacer.
                }
            }

            const classIdMap = new Map<string, string>();
            for (const cls of plan.classes) {
                const yaExistia = !plan.idsClasesNuevas.has(cls.id);
                const realCourseId = courseIdMap.get(cls.courseId) ?? cls.courseId;
                if (yaExistia) {
                    classIdMap.set(cls.id, cls.id);
                    if (plan.idsClasesActualizadas.has(cls.id)) {
                        await updateClassMutation.mutateAsync({ id: cls.id, yearId, data: { schedule: cls.schedule ?? [] } });
                    }
                    continue;
                }
                const created = await createClassMutation.mutateAsync({
                    yearId,
                    data: { courseId: realCourseId, grupo: cls.grupo, schedule: cls.schedule ?? [], colorAcento: cls.colorAcento },
                });
                classIdMap.set(cls.id, created.id);
                if (cls.grupo !== undefined) {
                    for (const cat of buildDefaultCategories(evaluationPeriods)) {
                        await createCategoryMutation.mutateAsync({ classId: created.id, data: { evaluationPeriodId: cat.evaluationPeriodId, name: cat.name, weight: cat.weight } });
                    }
                }
            }
            await updateAcademicYearMutation.mutateAsync({ id: yearId, data: { periods: plan.periods } });

            // 3. Alumnado: resolución real, con dedupe de "nuevo" repetido
            // en varias clases dentro del mismo Excel (crece la lista de
            // estudiantes conocidos según se van creando personas).
            let estudiantesConocidos = allStudents;
            let alumnadoNuevo = 0;
            let alumnadoMatriculado = 0;
            for (const fila of parsed.alumnado) {
                const planClassId = resolveClassId(fila, plan);
                if (!planClassId) continue;
                const realClassId = classIdMap.get(planClassId) ?? planClassId;
                const match = resolverAlumno(fila, estudiantesConocidos);
                if (match.tipo === 'ambiguo') continue;

                if (match.tipo === 'nuevo') {
                    const created = await createEnrollmentMutation.mutateAsync({
                        classId: realClassId,
                        data: {
                            newStudent: {
                                nombre: fila.nombre,
                                primerApellido: fila.primerApellido,
                                segundoApellido: fila.segundoApellido || undefined,
                                fechaNacimiento: fila.fechaNacimiento || undefined,
                                dni: fila.dni || undefined,
                                nie: fila.nie || undefined,
                            },
                            acneae: fila.acneae,
                        },
                    });
                    estudiantesConocidos = [...estudiantesConocidos, {
                        id: created.studentId, nombre: fila.nombre, primerApellido: fila.primerApellido,
                        segundoApellido: fila.segundoApellido, dni: fila.dni ?? undefined, nie: fila.nie ?? undefined,
                        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                    }];
                    alumnadoNuevo++;
                    continue;
                }

                const claseReal = classes.find(c => c.id === planClassId);
                const yaMatriculado = (claseReal?.students ?? []).some(s => s.id === match.studentId);
                if (!yaMatriculado) {
                    await createEnrollmentMutation.mutateAsync({ classId: realClassId, data: { studentId: match.studentId, acneae: fila.acneae } });
                    alumnadoMatriculado++;
                }
            }

            // 4. Borrados — SOLO lo que el profesor marcó a mano, nunca por
            // defecto (ver clasesABorrar/enrollmentsABorrar).
            let alumnadoBorrado = 0;
            for (const enrollmentId of enrollmentsABorrar) {
                const ausente = alumnadoPreview?.ausentes.find(a => a.enrollmentId === enrollmentId);
                if (!ausente) continue;
                await deleteEnrollmentMutation.mutateAsync({ id: enrollmentId, classId: ausente.classId });
                alumnadoBorrado++;
            }
            let clasesBorradas = 0;
            for (const claseId of clasesABorrar) {
                await deleteClassMutation.mutateAsync({ id: claseId, yearId });
                clasesBorradas++;
            }

            setResumenAplicado({ clasesCreadas, clasesActualizadas, clasesBorradas, alumnadoNuevo, alumnadoMatriculado, alumnadoBorrado });
            setApplied(true);
        } catch (e) {
            // Sin esto, un fallo a mitad de camino (p.ej. un 409 de la API)
            // dejaba lo ya aplicado hasta ese punto sin avisar de nada, con
            // la ventana quieta como si no hubiera pasado nada (bug real).
            // Los pasos ya completados (curso académico, materias/clases
            // hasta el punto del fallo...) NO se deshacen — hay que revisar
            // qué quedó aplicado y repetir la sincronización si hace falta.
            setErrorMsg(
                `Algo ha fallado a mitad de la sincronización: ${e instanceof Error ? e.message : String(e)}. ` +
                'Lo aplicado hasta este punto (fechas/festivos, materias/clases, alumnado) ya está guardado; revisa el curso académico y vuelve a intentarlo si hace falta.'
            );
        } finally {
            setApplying(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Modificar Curso Académico con Excel" size="3xl">
            <div className="space-y-4">
                {applied ? (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                        Curso académico «{yearLabel}» actualizado: {resumenAplicado.clasesCreadas} clase(s) nueva(s), {resumenAplicado.clasesActualizadas} actualizada(s), {resumenAplicado.clasesBorradas} borrada(s); {resumenAplicado.alumnadoNuevo} alumno(s) nuevo(s), {resumenAplicado.alumnadoMatriculado} matriculado(s), {resumenAplicado.alumnadoBorrado} desmatriculado(s).
                        <div className="mt-4 text-right">
                            <button onClick={handleClose} className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 font-medium">Cerrar</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-slate-600">
                            Sube un Excel editado (con la misma plantilla que "Descargar configuración actual") para actualizar el curso académico ACTIVO — a diferencia de "Crear nuevo curso con Excel", este no crea uno nuevo. Solo se añade o actualiza lo que aparece en el fichero: nada se borra salvo que lo marques tú mismo/a, uno a uno, antes de confirmar.
                        </p>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="secondary" onClick={() => calendarioFileInputRef.current?.click()} disabled={importandoCalendario} title="Usa la versión APAISADA (horizontal) del calendario oficial de Educastur -- la vertical no se reconoce bien">
                                {importandoCalendario ? 'Leyendo el PDF…' : '📅 Importar calendario oficial (PDF)'}
                            </Button>
                            <input ref={calendarioFileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleImportarCalendarioPdf} />
                            <Button type="button" variant="secondary" onClick={handleDownloadTemplate} disabled={descargando}>
                                {descargando ? 'Generando…' : '📥 Descargar configuración actual'}
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                                {loading ? 'Leyendo…' : '📤 Subir Excel editado'}
                            </Button>
                            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
                        </div>
                        <p className="text-[11px] text-slate-400 -mt-1">Para "Importar calendario oficial": usa la versión apaisada (horizontal), no la vertical.</p>

                        {calendarioImportado && (
                            <div className="p-2 bg-slate-50 border rounded-lg text-xs text-slate-600 space-y-1">
                                <p>
                                    {festivosImportados.length} festivo(s)/no lectivo(s)/vacaciones detectados en el PDF — se incluirán,
                                    con su Tipo ya puesto, al descargar "Configuración actual".
                                </p>
                                {calendarioImportado.errores.length > 0 && (
                                    <ul className="list-disc list-inside text-orange-700">
                                        {calendarioImportado.errores.map((e, i) => <li key={i}>{e}</li>)}
                                    </ul>
                                )}
                            </div>
                        )}

                        {errorMsg && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errorMsg}</div>}

                        {parsed && parsed.errores.length > 0 && (
                            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-800">
                                <p className="font-semibold mb-1">Avisos al leer el Excel (esas filas concretas no se importarán, el resto sigue adelante):</p>
                                <ul className="list-disc list-inside">
                                    {parsed.errores.map((e, i) => <li key={i}>{e}</li>)}
                                </ul>
                            </div>
                        )}

                        {parsed && !parsed.cursoAcademico && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                Falta completar la hoja "Curso Académico": revisa Nombre/Fecha inicio/Fecha fin (ver avisos arriba).
                            </div>
                        )}

                        {plan && parsed && parsed.cursoAcademico && alumnadoPreview && (
                            <div className="space-y-3">
                                <div className="p-3 border rounded-lg bg-slate-50 text-sm text-slate-700 space-y-0.5">
                                    <p>Curso académico «{parsed.cursoAcademico.label}» ({parsed.cursoAcademico.startDate} — {parsed.cursoAcademico.endDate}).</p>
                                    <p>{plan.clasesCreadas} clase(s) nueva(s), {plan.clasesActualizadas} actualizada(s).</p>
                                    <p>{alumnadoPreview.nuevos} alumno(s) nuevo(s), {alumnadoPreview.existentes} ya reconocido(s)/a matricular.</p>
                                    {alumnadoPreview.ambiguos > 0 && (
                                        <p className="text-orange-700">{alumnadoPreview.ambiguos} fila(s) de alumnado con nombre ambiguo (varias personas posibles, sin DNI/NIE que las distinga) — no se importarán, revísalas en el Excel si hace falta.</p>
                                    )}
                                    {alumnadoPreview.sinClase > 0 && (
                                        <p className="text-orange-700">{alumnadoPreview.sinClase} fila(s) de alumnado no coinciden con ninguna clase de la hoja "Horario" — no se importarán.</p>
                                    )}
                                </div>

                                {plan.clasesAcademicasSinUsar.length > 0 && (
                                    <div className="border border-amber-200 rounded-lg overflow-hidden">
                                        <p className="p-2 px-3 bg-amber-50 text-xs font-semibold text-amber-800">
                                            Estas clases ya existían y no aparecen en el Excel — sin marcar, se quedan tal cual (con su alumnado y notas):
                                        </p>
                                        <div className="max-h-32 overflow-y-auto divide-y">
                                            {plan.clasesAcademicasSinUsar.map(cls => (
                                                <label key={cls.id} className="flex items-center gap-2 p-2 px-3 text-sm cursor-pointer hover:bg-slate-50">
                                                    <input type="checkbox" checked={clasesABorrar.has(cls.id)} onChange={() => toggleClaseABorrar(cls.id)} />
                                                    <span className="flex-1">{cls.grupo ?? '(sin grupo)'}</span>
                                                    {clasesABorrar.has(cls.id) && <span className="text-red-600 text-xs font-semibold">Se borrará</span>}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {alumnadoPreview.ausentes.length > 0 && (
                                    <div className="border border-amber-200 rounded-lg overflow-hidden">
                                        <p className="p-2 px-3 bg-amber-50 text-xs font-semibold text-amber-800">
                                            Este alumnado ya estaba matriculado y no aparece en el Excel para su clase — sin marcar, se queda matriculado tal cual:
                                        </p>
                                        <div className="max-h-40 overflow-y-auto divide-y">
                                            {alumnadoPreview.ausentes.map(a => (
                                                <label key={a.enrollmentId} className="flex items-center gap-2 p-2 px-3 text-sm cursor-pointer hover:bg-slate-50">
                                                    <input type="checkbox" checked={enrollmentsABorrar.has(a.enrollmentId)} onChange={() => toggleEnrollmentABorrar(a.enrollmentId)} />
                                                    <span className="flex-1">{a.nombre}</span>
                                                    <span className="text-slate-400 text-xs">{a.classLabel}</span>
                                                    {enrollmentsABorrar.has(a.enrollmentId) && <span className="text-red-600 text-xs font-semibold">Se desmatriculará</span>}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end gap-2 pt-2">
                                    <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
                                    <Button variant="primary" onClick={handleConfirm} disabled={applying}>{applying ? 'Aplicando…' : 'Confirmar Cambios'}</Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default SyncAcademicYearModal;
