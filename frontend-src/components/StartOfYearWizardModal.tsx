import React, { useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import ClassLabel from './ClassLabel';
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from './Icons';
import type { ClassData } from '../types';
import { buildDefaultCategories } from '../utils';
import { useCourses, useCreateCourse, useDeleteCourse } from '../hooks/useCourses';
import { useApiClasses, useCreateClass, useUpdateClass, useDeleteClass } from '../hooks/useApiClasses';
import {
    useCurrentAcademicYear, useEvaluationPeriods, useUpdateAcademicYear,
    useAcademicYearCourses, useAddAcademicYearCourse, useRemoveAcademicYearCourse,
} from '../hooks/useAcademicYears';
import { useCreateCategory } from '../hooks/useCategories';
import { useCreateEnrollment } from '../hooks/useEnrollments';
import { apiClassToLocal } from '../services/apiAdapters';
import { buildImportPlan, normalizarNivel } from './ImportScheduleModal';
import { generateTemplate, parseWorkbook, type FilaAlumnado, type ParsedWorkbook } from '../services/scheduleWizard';

interface StartOfYearWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Resuelve una fila de Alumnado (Nivel/Materia/Grupo en texto libre) contra
// la clase real del plan que le corresponde — mismo criterio de
// normalización que ya aplica buildImportPlan al crear la clase desde la
// hoja Horario, para que "1º ESO" en ambas hojas caiga en el mismo curso.
const resolveClassId = (fila: FilaAlumnado, plan: ReturnType<typeof buildImportPlan>): string | null => {
    const nivel = normalizarNivel(fila.nivel);
    const course = plan.courses.find(c => c.type !== 'other' && c.subject === fila.materia && c.level === nivel);
    if (!course) return null;
    const cls = plan.classes.find(c => c.courseId === course.id && c.grupo === fila.grupo);
    return cls?.id ?? null;
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

const StartOfYearWizardModal: React.FC<StartOfYearWizardModalProps> = ({ isOpen, onClose }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
    const [applied, setApplied] = useState(false);
    const [applying, setApplying] = useState(false);
    const [borrarAcademicasSinUsar, setBorrarAcademicasSinUsar] = useState(false);
    // Snapshot tomado al confirmar, no derivado de `plan` en el render de
    // éxito: una vez aplicados los cambios, las queries de courses/classes
    // se refrescan e invalidan, así que buildImportPlan() se recalcularía
    // con los datos YA actualizados (encontraría las clases recién creadas
    // como "ya existentes" en vez de "nuevas") y el resumen final mostraría
    // un recuento equivocado aunque la importación en sí fuera correcta.
    const [resumenAplicado, setResumenAplicado] = useState({ clasesCreadas: 0, clasesActualizadas: 0, alumnadoMatriculado: 0, alumnadoConError: 0 });

    const currentYear = useCurrentAcademicYear();
    const yearId = currentYear.data?.id ?? '';
    const remoteCourses = useCourses();
    const courses = remoteCourses.data ?? [];
    const remoteClasses = useApiClasses(yearId, { enabled: !!yearId });
    const classes: ClassData[] = useMemo(() => (remoteClasses.data ?? []).map(apiClassToLocal), [remoteClasses.data]);
    const remotePeriods = useEvaluationPeriods(yearId, { enabled: !!yearId });
    const realEvaluationPeriods = (remotePeriods.data ?? []).map(p => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate }));

    const createCourseMutation = useCreateCourse();
    const deleteCourseMutation = useDeleteCourse();
    const createClassMutation = useCreateClass();
    const updateClassMutation = useUpdateClass();
    const deleteClassMutation = useDeleteClass();
    const yearCoursesQuery = useAcademicYearCourses(yearId, { enabled: !!yearId });
    const addYearCourseMutation = useAddAcademicYearCourse();
    const removeYearCourseMutation = useRemoveAcademicYearCourse();
    const createCategoryMutation = useCreateCategory();
    const updateAcademicYearMutation = useUpdateAcademicYear();
    const createEnrollmentMutation = useCreateEnrollment();

    const handleClose = () => {
        setParsed(null);
        setErrorMsg(null);
        setApplied(false);
        setBorrarAcademicasSinUsar(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        onClose();
    };

    const handleDownloadTemplate = async () => {
        try {
            const blob = await generateTemplate();
            const filename = 'plantilla_inicio_de_curso.xlsx';
            downloadBlob(blob, filename);
            // Sin esto, la descarga sucede sin ningún indicio visible — mismo
            // motivo que ya se corrigió en BackupManager.tsx::handleExportClick.
            alert(`Plantilla descargada con éxito: "${filename}", en tu carpeta de Descargas.`);
        } catch (e) {
            console.error(e);
            alert(`Error al generar la plantilla: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setErrorMsg(null);
        setParsed(null);

        try {
            const buffer = await file.arrayBuffer();
            const result = await parseWorkbook(buffer);
            setParsed(result);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const plan = parsed ? buildImportPlan(parsed.filas, courses, classes, realEvaluationPeriods, borrarAcademicasSinUsar) : null;

    // Recuento de alumnado resoluble contra el plan actual — se recalcula en
    // cada render junto con `plan`, solo para la previsualización (la
    // resolución real, con los ids ya reales, se repite en handleConfirm).
    const alumnadoResuelto = useMemo(() => {
        if (!plan || !parsed) return { validos: 0, invalidos: 0 };
        let validos = 0;
        let invalidos = 0;
        for (const fila of parsed.alumnado) {
            if (resolveClassId(fila, plan)) validos++;
            else invalidos++;
        }
        return { validos, invalidos };
    }, [plan, parsed]);

    const handleConfirm = async () => {
        if (!plan || !parsed) return;
        setApplying(true);
        try {
            // Capturado ANTES de mutar nada: en cuanto la primera mutación
            // invalida una query, `plan` (derivado de `courses`/`classes`
            // reactivos) se recalcula con datos ya actualizados, y
            // clasesCreadas/clasesActualizadas dejarían de reflejar lo que
            // esta confirmación concreta hizo de verdad.
            const clasesCreadas = plan.clasesCreadas;
            const clasesActualizadas = plan.clasesActualizadas;

            // 1-4: mismo procedimiento que ImportScheduleModal.handleConfirm
            // para materias/clases/horario — ver ese fichero para el porqué
            // de cada paso (RESTRICT de course_id, categorías por defecto...).
            const linkedCourseIds = new Set((yearCoursesQuery.data ?? []).map(yc => yc.courseId));
            const coursesToDelete = courses.filter(c => !plan.courses.some(pc => pc.id === c.id));
            for (const course of coursesToDelete) {
                const classesToDelete = classes.filter(cl => cl.courseId === course.id);
                for (const cls of classesToDelete) {
                    await deleteClassMutation.mutateAsync({ id: cls.id, yearId });
                }
                if (course.type !== 'other' && linkedCourseIds.has(course.id)) {
                    await removeYearCourseMutation.mutateAsync({ yearId, courseId: course.id });
                }
                await deleteCourseMutation.mutateAsync(course.id);
            }

            const courseIdMap = new Map<string, string>();
            for (const course of plan.courses) {
                if (!courses.some(c => c.id === course.id)) {
                    const created = await createCourseMutation.mutateAsync({ level: course.level, subject: course.subject, type: course.type ?? 'academic' });
                    courseIdMap.set(course.id, created.id);
                }
            }

            for (const course of plan.courses) {
                if (course.type === 'other') continue;
                const realCourseId = courseIdMap.get(course.id) ?? course.id;
                if (!linkedCourseIds.has(realCourseId)) {
                    await addYearCourseMutation.mutateAsync({ yearId, data: { courseId: realCourseId } });
                }
            }

            // Mapa temporal->real de CLASES: a diferencia de
            // ImportScheduleModal (que no lo necesita), aquí hace falta para
            // saber en qué classId real matricular al alumnado de la hoja
            // "Alumnado" de una clase recién creada.
            const classIdMap = new Map<string, string>();
            for (const cls of plan.classes) {
                const realCourseId = courseIdMap.get(cls.courseId) ?? cls.courseId;
                if (plan.idsClasesNuevas.has(cls.id)) {
                    const created = await createClassMutation.mutateAsync({
                        yearId,
                        data: { courseId: realCourseId, grupo: cls.grupo, schedule: cls.schedule ?? [], colorAcento: cls.colorAcento },
                    });
                    classIdMap.set(cls.id, created.id);
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

            if (yearId) {
                await updateAcademicYearMutation.mutateAsync({ id: yearId, data: { periods: plan.periods } });
            }

            // 5. Alumnado: se resuelve DESPUÉS de que las clases ya tengan id
            // real, matriculando de uno en uno (misma secuencia que
            // ClassManager.tsx::handleBulkAddStudents para "Añadir Alumnado
            // en Lote" — no hay endpoint de matriculación en lote).
            let alumnadoMatriculado = 0;
            let alumnadoConError = 0;
            for (const fila of parsed.alumnado) {
                const planClassId = resolveClassId(fila, plan);
                if (!planClassId) {
                    alumnadoConError++;
                    continue;
                }
                const realClassId = classIdMap.get(planClassId) ?? planClassId;
                try {
                    await createEnrollmentMutation.mutateAsync({
                        classId: realClassId,
                        data: {
                            newStudent: {
                                nombre: fila.nombre,
                                primerApellido: fila.primerApellido,
                                segundoApellido: fila.segundoApellido || undefined,
                                fechaNacimiento: fila.fechaNacimiento || undefined,
                                dni: fila.dni || undefined,
                            },
                            acneae: fila.acneae,
                        },
                    });
                    alumnadoMatriculado++;
                } catch {
                    alumnadoConError++;
                }
            }

            setResumenAplicado({ clasesCreadas, clasesActualizadas, alumnadoMatriculado, alumnadoConError });
            setApplied(true);
        } finally {
            setApplying(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Importar Datos del Curso (Excel)" size="3xl">
            <div className="space-y-4">
                {applied ? (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                        Datos importados con éxito: {resumenAplicado.clasesCreadas} clase(s) nueva(s) ({resumenAplicado.clasesActualizadas} actualizada(s)), {resumenAplicado.alumnadoMatriculado} alumno(s) matriculado(s).
                        {resumenAplicado.alumnadoConError > 0 && (
                            <p className="mt-1 text-amber-700">{resumenAplicado.alumnadoConError} fila(s) de alumnado no se pudieron matricular — revísalas e inténtalo de nuevo si hace falta.</p>
                        )}
                        <p className="mt-2 text-sm">Puedes revisarlo y ajustarlo en "Materias", "Clases y Alumnado" y "Horario Semanal".</p>
                        <div className="mt-4 text-right">
                            <button onClick={handleClose} className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 font-medium">Cerrar</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-slate-600">
                            Descarga la plantilla, rellénala en Excel (horario y alumnado de cada clase) y súbela aquí. Antes de crear nada, verás un resumen para confirmar.
                        </p>

                        <button
                            onClick={handleDownloadTemplate}
                            className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 py-2.5 rounded-lg hover:bg-slate-50 font-medium shadow-sm"
                        >
                            <ArrowDownTrayIcon className="w-5 h-5" />
                            Descargar plantilla (.xlsx)
                        </button>

                        {!parsed && (
                            <div>
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx" className="hidden" />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={loading}
                                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium shadow-sm disabled:bg-blue-300"
                                >
                                    <ArrowUpTrayIcon className="w-5 h-5" />
                                    {loading ? 'Leyendo el Excel…' : 'Subir plantilla rellena'}
                                </button>
                            </div>
                        )}

                        {errorMsg && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errorMsg}</div>
                        )}

                        {parsed && parsed.errores.length > 0 && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                                <p className="font-semibold mb-1">Avisos al leer el Excel:</p>
                                <ul className="list-disc list-inside">
                                    {parsed.errores.map((e, i) => <li key={i}>{e}</li>)}
                                </ul>
                            </div>
                        )}

                        {plan && parsed && (parsed.filas.length > 0 || parsed.alumnado.length > 0) && (
                            <div className="space-y-3">
                                <div className="p-3 border rounded-lg bg-slate-50 text-sm text-slate-700">
                                    <p>{plan.periods.length} franjas horarias distintas encontradas.</p>
                                    <p>{plan.clasesCreadas} clase(s) nueva(s) se crearán; {plan.clasesActualizadas} clase(s) existentes se completarán con nuevas franjas.</p>
                                    <p>{alumnadoResuelto.validos} alumno(s) a matricular.</p>
                                    {alumnadoResuelto.invalidos > 0 && (
                                        <p className="text-red-700">{alumnadoResuelto.invalidos} fila(s) de alumnado no coinciden con ninguna clase de la hoja "Horario" — no se importarán.</p>
                                    )}
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
                                                {plan.clasesAcademicasSinUsar.length} curso(s)/grupo(s) académico(s) ya no aparecen en este Excel:
                                            </span>
                                            {' '}
                                            {plan.clasesAcademicasSinUsar.map(cl => (
                                                <ClassLabel key={cl.id} classData={cl} courses={courses} className="inline-block mr-1.5" />
                                            ))}
                                            <br />
                                            Márcalo para borrarlos por completo, <strong>incluyendo su alumnado y calificaciones</strong>. Sin marcar,
                                            se dejan tal cual estaban.
                                        </span>
                                    </label>
                                )}
                                <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                                    {plan.classes.map(cls => {
                                        const course = plan.courses.find(c => c.id === cls.courseId);
                                        const alumnadoDeClase = parsed.alumnado.filter(f => resolveClassId(f, plan) === cls.id).length;
                                        return (
                                            <div key={cls.id} className="p-2 px-3 text-sm flex justify-between items-center gap-2">
                                                <span>
                                                    <ClassLabel classData={cls} courses={plan.courses} />
                                                    {course && <span className="text-slate-400 ml-2">({course.level})</span>}
                                                </span>
                                                <span className="text-slate-400 flex-shrink-0">
                                                    {(cls.schedule || []).length} sesión(es)/semana
                                                    {alumnadoDeClase > 0 && ` · ${alumnadoDeClase} alumno(s)`}
                                                </span>
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

                        {parsed && parsed.filas.length === 0 && parsed.alumnado.length === 0 && parsed.errores.length === 0 && (
                            <p className="text-slate-500 text-sm">No se ha reconocido ninguna fila en el Excel.</p>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default StartOfYearWizardModal;
