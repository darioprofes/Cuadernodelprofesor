import React, { useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import ClassLabel from './ClassLabel';
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from './Icons';
import { buildDefaultCategories } from '../utils';
import { useCourses, useCreateCourse } from '../hooks/useCourses';
import { useCreateClass } from '../hooks/useApiClasses';
import {
    useCreateAcademicYear, useUpdateAcademicYear, useAddAcademicYearCourse,
    useCreateEvaluationPeriod, useDeleteEvaluationPeriod,
} from '../hooks/useAcademicYears';
import { useCreateCategory } from '../hooks/useCategories';
import { useCreateEnrollment } from '../hooks/useEnrollments';
import { api } from '../services/api';
import type { EvaluationPeriod } from '../types/api';
import { buildImportPlan, normalizarNivel } from './ImportScheduleModal';
import { generateTemplate, parseWorkbook, type FilaAlumnado, type FilaFestivo, type ParsedWorkbook } from '../services/scheduleWizard';
import { invoke, isTauri } from '@tauri-apps/api/core';

// Respuesta de POST /calendario/importar-pdf -- ver
// api/app/services/calendario_pdf.py para el porqué de esta forma (solo
// Inicio/Fin de clases y No lectivo/Vacaciones son parseables del PDF
// oficial; Festivos nacionales/autonómicos/locales no traen fecha en el
// documento, se añaden a mano).
interface OpcionFechaClases {
    fecha: string;
    etiqueta: string;
}
interface CalendarioPdfResultado {
    inicioClases: OpcionFechaClases[];
    finClases: OpcionFechaClases[];
    noLectivo: FilaFestivo[];
    vacaciones: FilaFestivo[];
    // Festivo nacional/autonómico leído del color de cada día en el
    // dibujo del calendario (ver calendario_pdf.py), no de texto --
    // festivos locales (cada municipio el suyo) no vienen del PDF.
    festivos: FilaFestivo[];
    errores: string[];
}

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
    const calendarioFileInputRef = useRef<HTMLInputElement>(null);
    const [nombreCurso, setNombreCurso] = useState('');
    const [fechaInicioCurso, setFechaInicioCurso] = useState('');
    const [fechaFinCurso, setFechaFinCurso] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
    // Importación previa del PDF oficial del calendario escolar (antes de
    // descargar la plantilla) -- depende de pdfplumber, igual que la
    // importación de horario en PDF; en escritorio va por el sidecar
    // python-helper (importar_calendario_pdf) en vez del backend web.
    const [importandoCalendario, setImportandoCalendario] = useState(false);
    const [calendarioImportado, setCalendarioImportado] = useState<CalendarioPdfResultado | null>(null);
    const [inicioClasesElegido, setInicioClasesElegido] = useState(0);
    const [finClasesElegido, setFinClasesElegido] = useState(0);
    const [applied, setApplied] = useState(false);
    const [applying, setApplying] = useState(false);
    // Snapshot tomado al confirmar, no derivado de `plan` en el render de
    // éxito: una vez aplicados los cambios, las queries de courses se
    // refrescan e invalidan, así que buildImportPlan() se recalcularía con
    // los datos YA actualizados y el resumen final mostraría un recuento
    // equivocado aunque la importación en sí fuera correcta.
    const [resumenAplicado, setResumenAplicado] = useState({ cursoLabel: '', clasesCreadas: 0, alumnadoMatriculado: 0, alumnadoConError: 0 });

    // El asistente SIEMPRE crea un curso académico nuevo (nunca reutiliza el
    // actual, decisión explícita — ver asistente-inicio-curso.md v3), así
    // que no hay `yearId` hasta confirmar: no hace falta leer clases ni
    // periodos de evaluación de ningún curso existente para la
    // previsualización — un curso recién creado nunca tiene ninguno.
    // `courses` (materias) sí se lee: el currículo se reutiliza entre años.
    const remoteCourses = useCourses();
    const courses = remoteCourses.data ?? [];

    const createAcademicYearMutation = useCreateAcademicYear();
    const createCourseMutation = useCreateCourse();
    const createClassMutation = useCreateClass();
    const addYearCourseMutation = useAddAcademicYearCourse();
    const createCategoryMutation = useCreateCategory();
    const updateAcademicYearMutation = useUpdateAcademicYear();
    const createEvaluationPeriodMutation = useCreateEvaluationPeriod();
    const deleteEvaluationPeriodMutation = useDeleteEvaluationPeriod();
    const createEnrollmentMutation = useCreateEnrollment();

    const handleClose = () => {
        setNombreCurso('');
        setFechaInicioCurso('');
        setFechaFinCurso('');
        setParsed(null);
        setErrorMsg(null);
        setApplied(false);
        setCalendarioImportado(null);
        setInicioClasesElegido(0);
        setFinClasesElegido(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (calendarioFileInputRef.current) calendarioFileInputRef.current.value = '';
        onClose();
    };

    const puedeDescargar = nombreCurso.trim() !== '' && !!fechaInicioCurso && !!fechaFinCurso;

    // No lectivo/vacaciones importados del PDF, listos para prellenar la
    // plantilla -- se excluye cualquier entrada sin fecha de fin exacta
    // (p.ej. "vacaciones de verano hasta el inicio del curso siguiente": el
    // PDF no la da, ver calendario_pdf.py) en vez de escribir una celda de
    // fecha vacía en el Excel; el aviso correspondiente ya viene en
    // `calendarioImportado.errores` y se muestra tal cual más abajo.
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
            let data: CalendarioPdfResultado;
            if (isTauri()) {
                // Mismo patrón que importar_horario_pdf: bytes crudos por
                // un comando propio, no el despachador genérico api_request.
                const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
                data = await invoke('importar_calendario_pdf', { bytes });
            } else {
                const formData = new FormData();
                formData.append('archivo', file);
                const response = await fetch('/api/calendario/importar-pdf', { method: 'POST', body: formData });

                if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    throw new Error(body?.detail || `El servidor respondió con un error (HTTP ${response.status}).`);
                }

                data = await response.json();
            }
            setCalendarioImportado(data);

            // Preselección: la opción de Inicio/Fin de clases que aplica a
            // ESO/Bachillerato si existe (lo más habitual para este
            // profesorado), si no la primera -- ambas siguen siendo
            // editables a mano con los desplegables de abajo.
            const idxInicio = data.inicioClases.findIndex(o => o.etiqueta.toUpperCase().includes('ESO'));
            const idxFin = data.finClases.findIndex(o => o.etiqueta.toUpperCase().includes('ESO'));
            const inicioElegido = idxInicio >= 0 ? idxInicio : 0;
            const finElegido = idxFin >= 0 ? idxFin : 0;
            setInicioClasesElegido(inicioElegido);
            setFinClasesElegido(finElegido);
            if (data.inicioClases[inicioElegido]) setFechaInicioCurso(data.inicioClases[inicioElegido].fecha);
            if (data.finClases[finElegido]) setFechaFinCurso(data.finClases[finElegido].fecha);
        } catch (err) {
            // invoke() rechaza con el propio ApiError ({status, detail}) del
            // lado Rust, no con una instancia de Error -- distinto del
            // fetch() de arriba.
            if (err && typeof err === 'object' && 'detail' in err) {
                setErrorMsg(String((err as { detail: unknown }).detail));
            } else {
                setErrorMsg(err instanceof Error ? err.message : String(err));
            }
        } finally {
            setImportandoCalendario(false);
            if (calendarioFileInputRef.current) calendarioFileInputRef.current.value = '';
        }
    };

    const handleDownloadTemplate = async () => {
        try {
            const blob = await generateTemplate({ label: nombreCurso.trim(), startDate: fechaInicioCurso, endDate: fechaFinCurso, holidays: festivosImportados });
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

    const cursoAcademico = parsed?.cursoAcademico ?? null;

    // Solo para que buildImportPlan/buildDefaultCategories calculen los
    // nombres de categoría en la previsualización — se descartan y se
    // recalculan con ids reales en handleConfirm (igual que ya hace hoy con
    // materias/clases vía courseIdMap/classIdMap).
    const previewEvaluationPeriods = useMemo(
        () => (cursoAcademico?.evaluationPeriods ?? []).map((p, i) => ({ id: `preview-periodo-${i}`, name: p.nombre, startDate: p.fechaInicio, endDate: p.fechaFin })),
        [cursoAcademico],
    );

    // `classes=[]` siempre: el asistente crea un curso académico nuevo en
    // cada confirmación (nunca reutiliza uno existente), así que no puede
    // haber ninguna clase previa contra la que diferenciar "nueva" de "ya
    // existente" — a diferencia de ImportScheduleModal, que sí opera sobre
    // el curso activo y sí necesita ese diffing.
    const plan = parsed && cursoAcademico ? buildImportPlan(parsed.filas, courses, [], previewEvaluationPeriods, false) : null;

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
        if (!plan || !parsed || !cursoAcademico) return;
        setApplying(true);
        try {
            // Capturado ANTES de mutar nada: en cuanto la primera mutación
            // invalida una query, `plan` (derivado de `courses` reactivo) se
            // recalcula con datos ya actualizados, y clasesCreadas dejaría
            // de reflejar lo que esta confirmación concreta hizo de verdad.
            const clasesCreadas = plan.clasesCreadas;

            // 0. Curso académico nuevo: se crea y activa antes que nada —
            // todo lo demás (materias, clases, alumnado) cuelga de su id
            // real. El backend siembra 3 periodos de evaluación por defecto
            // al crearlo (ver academic_years.py::create_academic_year); si
            // el Excel traía los suyos, se sustituyen a continuación.
            const year = await createAcademicYearMutation.mutateAsync({
                label: cursoAcademico.label,
                startDate: cursoAcademico.startDate,
                endDate: cursoAcademico.endDate,
            });
            const yearId = year.id;

            let realEvaluationPeriods: EvaluationPeriod[] = await api.get<EvaluationPeriod[]>(`/academic-years/${yearId}/evaluation-periods`);
            if (cursoAcademico.evaluationPeriods.length > 0) {
                for (const p of realEvaluationPeriods) {
                    await deleteEvaluationPeriodMutation.mutateAsync({ id: p.id, yearId });
                }
                realEvaluationPeriods = [];
                for (const p of cursoAcademico.evaluationPeriods) {
                    const created = await createEvaluationPeriodMutation.mutateAsync({
                        yearId,
                        data: { name: p.nombre, startDate: p.fechaInicio, endDate: p.fechaFin, weight: p.peso },
                    });
                    realEvaluationPeriods.push(created);
                }
            }

            if (cursoAcademico.holidays.length > 0) {
                await updateAcademicYearMutation.mutateAsync({
                    id: yearId,
                    data: { holidays: cursoAcademico.holidays.map(h => ({ id: crypto.randomUUID(), name: h.nombre, startDate: h.fechaInicio, endDate: h.fechaFin, type: h.tipo })) },
                });
            }

            // 1-4: mismo procedimiento que ImportScheduleModal.handleConfirm
            // para materias/clases/horario — ver ese fichero para el porqué
            // de cada paso (RESTRICT de course_id, categorías por defecto...).
            // Sin diffing contra materias/clases "ya enlazadas": un curso
            // recién creado nunca tiene ninguna.
            //
            // OJO: `plan.courses` (buildImportPlan) es, a propósito, TODA la
            // lista global de materias académicas (para poder reutilizar una
            // ya existente de otro año por nombre+nivel) — no solo las que
            // aparecen en este Excel. Enlazar el año nuevo con `plan.courses`
            // entero enlazaría también materias de otros cursos académicos
            // que no pintan nada aquí. `courseIdsUsados` (derivado de
            // `plan.classes`, que SÍ solo contiene lo que view de las filas
            // de este Excel) es el filtro real.
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
                await addYearCourseMutation.mutateAsync({ yearId, data: { courseId: realCourseId } });
            }

            // Mapa temporal->real de CLASES: a diferencia de
            // ImportScheduleModal (que no lo necesita), aquí hace falta para
            // saber en qué classId real matricular al alumnado de la hoja
            // "Alumnado" de una clase recién creada.
            const classIdMap = new Map<string, string>();
            for (const cls of plan.classes) {
                const realCourseId = courseIdMap.get(cls.courseId) ?? cls.courseId;
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
            }

            await updateAcademicYearMutation.mutateAsync({ id: yearId, data: { periods: plan.periods } });

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

            setResumenAplicado({ cursoLabel: cursoAcademico.label, clasesCreadas, alumnadoMatriculado, alumnadoConError });
            setApplied(true);
        } finally {
            setApplying(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Crear Nuevo Curso con Excel" size="3xl">
            <div className="space-y-4">
                {applied ? (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                        Curso académico «{resumenAplicado.cursoLabel}» creado y activado: {resumenAplicado.clasesCreadas} clase(s) nueva(s), {resumenAplicado.alumnadoMatriculado} alumno(s) matriculado(s).
                        {resumenAplicado.alumnadoConError > 0 && (
                            <p className="mt-1 text-amber-700">{resumenAplicado.alumnadoConError} fila(s) de alumnado no se pudieron matricular — revísalas e inténtalo de nuevo si hace falta.</p>
                        )}
                        <p className="mt-2 text-sm">Puedes revisarlo y ajustarlo en "Curso Académico", "Materias", "Clases y Alumnado" y "Horario Semanal".</p>
                        <div className="mt-4 text-right">
                            <button onClick={handleClose} className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 font-medium">Cerrar</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-slate-600">
                            Este asistente crea un curso académico NUEVO (nunca modifica el que tengas activo ahora). Indica lo básico, descarga la plantilla, rellénala en Excel (fechas, festivos, periodos de evaluación, horario y alumnado de cada clase) y súbela aquí. Antes de crear nada, verás un resumen para confirmar.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 border rounded-lg bg-slate-50">
                            <div>
                                <label className="text-xs font-medium text-slate-600">Nombre del curso</label>
                                <Input type="text" value={nombreCurso} onChange={e => setNombreCurso(e.target.value)} placeholder="Ej: 2026-2027" className="w-full mt-1" disabled={!!parsed} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Fecha de inicio</label>
                                <Input type="date" value={fechaInicioCurso} onChange={e => setFechaInicioCurso(e.target.value)} className="w-full mt-1" disabled={!!parsed} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Fecha de fin</label>
                                <Input type="date" value={fechaFinCurso} onChange={e => setFechaFinCurso(e.target.value)} className="w-full mt-1" disabled={!!parsed} />
                            </div>
                        </div>

                        {/* Importar el PDF oficial ANTES de descargar la plantilla: si
                            se hace, las fechas de abajo se prellenan solas y el .xlsx
                            descargado ya trae festivo/no lectivo/vacaciones con su Tipo,
                            en vez de tecleado todo a mano. Festivos locales (cada
                            municipio el suyo) no vienen en el PDF (ver
                            calendario_pdf.py) -- esos se siguen añadiendo a mano, en el
                            Excel o en Ajustes. Requiere la versión APAISADA
                            (horizontal) del calendario -- la vertical tiene otra
                            maquetación y no se reconoce bien (probado contra el PDF
                            vertical real de Educastur: 0 fechas de no lectivo/
                            vacaciones/inicio-fin de clases, aunque los festivos por
                            color sí suelen salir). Solo web: depende de pdfplumber en
                            el backend Python, sin equivalente en escritorio (mismo
                            criterio que la importación de horario). */}
                        {!parsed && (
                            <div className="p-3 border rounded-lg bg-slate-50 space-y-2">
                                <input type="file" ref={calendarioFileInputRef} onChange={handleImportarCalendarioPdf} accept=".pdf" className="hidden" />
                                <button
                                    onClick={() => calendarioFileInputRef.current?.click()}
                                    disabled={importandoCalendario}
                                    title="Usa la versión APAISADA (horizontal) del calendario oficial de Educastur -- la vertical no se reconoce bien"
                                    className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 py-2 rounded-lg hover:bg-slate-100 font-medium shadow-sm text-sm disabled:opacity-50"
                                >
                                    <ArrowUpTrayIcon className="w-4 h-4" />
                                    {importandoCalendario ? 'Leyendo el PDF…' : 'Importar calendario oficial (PDF)'}
                                </button>
                                <p className="text-[11px] text-slate-400 text-center">Usa la versión apaisada (horizontal) del calendario oficial, no la vertical.</p>

                                {calendarioImportado && (
                                    <div className="space-y-2 text-xs">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <div>
                                                <label className="font-medium text-slate-600">Inicio de clases</label>
                                                <Select
                                                    value={inicioClasesElegido}
                                                    onChange={e => {
                                                        const idx = Number(e.target.value);
                                                        setInicioClasesElegido(idx);
                                                        setFechaInicioCurso(calendarioImportado.inicioClases[idx].fecha);
                                                    }}
                                                    className="w-full mt-1 text-xs"
                                                >
                                                    {calendarioImportado.inicioClases.map((o, i) => (
                                                        <option key={i} value={i}>{o.fecha} — {o.etiqueta}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div>
                                                <label className="font-medium text-slate-600">Fin de clases</label>
                                                <Select
                                                    value={finClasesElegido}
                                                    onChange={e => {
                                                        const idx = Number(e.target.value);
                                                        setFinClasesElegido(idx);
                                                        setFechaFinCurso(calendarioImportado.finClases[idx].fecha);
                                                    }}
                                                    className="w-full mt-1 text-xs"
                                                >
                                                    {calendarioImportado.finClases.map((o, i) => (
                                                        <option key={i} value={i}>{o.fecha} — {o.etiqueta}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                        </div>
                                        <p className="text-slate-500">
                                            {festivosImportados.length} festivo(s)/no lectivo(s)/vacaciones detectados — se incluirán en la plantilla, columna "Tipo" ya rellena.
                                        </p>
                                        {calendarioImportado.errores.length > 0 && (
                                            <ul className="list-disc list-inside text-orange-700">
                                                {calendarioImportado.errores.map((e, i) => <li key={i}>{e}</li>)}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleDownloadTemplate}
                            disabled={!puedeDescargar}
                            className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 py-2.5 rounded-lg hover:bg-slate-50 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                        >
                            <ArrowDownTrayIcon className="w-5 h-5" />
                            Descargar plantilla (.xlsx)
                        </button>
                        {!puedeDescargar && (
                            <p className="text-xs text-slate-500 -mt-2">Rellena nombre y fechas del curso para descargar la plantilla ya con esos datos.</p>
                        )}

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
                            // Naranja, no rojo: estas filas se saltan pero el resto de la
                            // importación sigue adelante — no bloquean nada. Lo que sí
                            // bloquea (falta la hoja "Curso Académico" o sus datos) tiene
                            // su propia caja en rojo, justo debajo.
                            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-800">
                                <p className="font-semibold mb-1">Avisos al leer el Excel (esas filas concretas no se importarán, el resto sigue adelante):</p>
                                <ul className="list-disc list-inside">
                                    {parsed.errores.map((e, i) => <li key={i}>{e}</li>)}
                                </ul>
                            </div>
                        )}

                        {parsed && !cursoAcademico && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                Falta completar la hoja "Curso Académico": revisa Nombre/Fecha inicio/Fecha fin (ver avisos arriba). Sin esos datos no hay curso académico que crear.
                            </div>
                        )}

                        {plan && parsed && cursoAcademico && (
                            <div className="space-y-3">
                                <div className="p-3 border rounded-lg bg-slate-50 text-sm text-slate-700">
                                    <p>Curso académico «{cursoAcademico.label}» ({cursoAcademico.startDate} — {cursoAcademico.endDate}), {cursoAcademico.holidays.length} festivo(s), {cursoAcademico.evaluationPeriods.length || 3} periodo(s) de evaluación.</p>
                                    <p>{plan.periods.length} franjas horarias distintas encontradas.</p>
                                    <p>{plan.clasesCreadas} clase(s) nueva(s) se crearán.</p>
                                    <p>{alumnadoResuelto.validos} alumno(s) a matricular.</p>
                                    {alumnadoResuelto.invalidos > 0 && (
                                        <p className="text-orange-700">{alumnadoResuelto.invalidos} fila(s) de alumnado no coinciden con ninguna clase de la hoja "Horario" — no se importarán (el resto sí).</p>
                                    )}
                                </div>
                                {plan.classes.length > 0 ? (
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
                                ) : (
                                    <p className="text-slate-500 text-sm">
                                        Sin materias, horario ni alumnado en el Excel — se creará solo el curso académico (fechas, festivos y periodos de evaluación). Podrás añadir clases y alumnado después desde la app.
                                    </p>
                                )}
                                <div className="flex justify-end gap-2 pt-2">
                                    <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
                                    <Button variant="primary" onClick={handleConfirm} disabled={applying}>{applying ? 'Aplicando…' : 'Confirmar Importación'}</Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default StartOfYearWizardModal;
