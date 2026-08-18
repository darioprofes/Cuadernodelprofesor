// Adaptadores entre el backend granular nuevo (types/api.ts) y las formas
// antiguas del blob (types.ts) que siguen esperando los componentes de
// clases/alumnado todavía no reescritos por completo (Fase 5 fusionada,
// bloques 4-6). Vive aparte porque lo usan varios ficheros a la vez
// (ScheduleManager, ClassManager, ClasesView) y encierra reglas de negocio
// reales (qué campo pertenece a STUDENT vs a ENROLLMENT, ver el ERD del
// plan) que no queremos duplicar ni desincronizar.

import type { ClassData, Student, Category, Assignment, Grade, EvaluationTool, ImportanciaActividad } from '../types';
import type {
    ClassData as ApiClassData,
    Student as ApiStudent,
    Enrollment as ApiEnrollment,
    StudentPatch as ApiStudentPatch,
    EnrollmentPatch as ApiEnrollmentPatch,
    Category as ApiCategory,
    Assignment as ApiAssignment,
    Grade as ApiGrade,
    GradeInput as ApiGradeInput,
} from '../types/api';
import { calculateToolGlobalScore, calculateCriterionScoresFromTool } from './gradeCalculations';
import { isTauri, invoke } from '@tauri-apps/api/core';

// Fase 7 bloque 7: en escritorio las fotos se sirven vía el protocolo
// custom studentphoto:// (ver src-tauri/src/lib.rs), no por /api/photos/.
// WebView2 (Windows, única plataforma de distribución de esta app) exige
// la forma http://{scheme}.localhost/... para que un protocolo custom
// funcione como src de un <img> — mismo criterio que usa el propio
// convertFileSrc de Tauri para su protocolo "asset" nativo.
const studentPhotoUrl = (studentId: string): string => `http://studentphoto.localhost/${studentId}`;

// classes (Postgres) todavía no tiene alumnado/categorías/tareas/notas
// embebidos (bloques 5/6) — se rellenan vacíos aquí; cada consumidor los
// sustituye aparte (roster hidratado) o simplemente no los usa (nunca los
// lee ni los escribe).
export const apiClassToLocal = (cls: Pick<ApiClassData, 'id' | 'courseId' | 'grupo' | 'schedule' | 'skippedDays' | 'icono' | 'colorAcento' | 'mesaProfesorX' | 'mesaProfesorY' | 'caracteristicasGrupo'>): ClassData => ({
    id: cls.id,
    grupo: cls.grupo,
    courseId: cls.courseId,
    students: [],
    categories: [],
    assignments: [],
    grades: [],
    schedule: (cls.schedule ?? []) as ClassData['schedule'],
    skippedDays: (cls.skippedDays ?? []) as ClassData['skippedDays'],
    icono: cls.icono,
    colorAcento: cls.colorAcento,
    mesaProfesorX: cls.mesaProfesorX,
    mesaProfesorY: cls.mesaProfesorY,
    caracteristicasGrupo: cls.caracteristicasGrupo ?? [],
});

// STUDENT (persona, global) + ENROLLMENT (matrícula de esta clase) fundidos
// en el `Student` embebido que siguen esperando StudentRow/PlanoClaseModal/
// StudentSummaryModal/StudentPersonalDataModal. `enrollmentId` es el único
// campo añadido (ver types.ts) — necesario para saber qué matrícula tocar
// al borrar/editar/mover en el plano. `foto` se resuelve a una URL propia
// (no un data URL embebido) si el alumno tiene una — StudentPhotoAvatar ya
// funciona igual con cualquier string válido como src, no distingue.
export const joinStudentEnrollment = (student: ApiStudent, enrollment: ApiEnrollment): Student => ({
    id: student.id,
    enrollmentId: enrollment.id,
    nombre: student.nombre,
    primerApellido: student.primerApellido,
    segundoApellido: student.segundoApellido,
    foto: student.fotoContentType ? (isTauri() ? studentPhotoUrl(student.id) : `/api/photos/${student.id}`) : undefined,
    acneae: enrollment.acneae,
    fechaNacimiento: student.fechaNacimiento,
    dni: student.dni,
    nie: student.nie,
    nacionalidad: student.nacionalidad,
    telefonoUrgencias: student.telefonoUrgencias,
    tutor1: student.tutor1,
    tutor2: student.tutor2,
    domicilioDireccion: student.domicilioDireccion,
    domicilioLocalidad: student.domicilioLocalidad,
    domicilioCodigoPostal: student.domicilioCodigoPostal,
    domicilioTelefono: student.domicilioTelefono,
    centroProcedencia: enrollment.centroProcedencia,
    haRepetidoCurso: enrollment.haRepetidoCurso,
    materiasPendientes: enrollment.materiasPendientes,
    programaEspecifico: enrollment.programaEspecifico,
    alergias: student.alergias,
    enfermedadesRelevantes: student.enfermedadesRelevantes,
    medicacionHabitual: student.medicacionHabitual,
    intoleranciasAlimentarias: student.intoleranciasAlimentarias,
    observacionesSanitarias: student.observacionesSanitarias,
    neae: enrollment.neae,
    neaeDetalle: enrollment.neaeDetalle,
    medidasEducativas: enrollment.medidasEducativas,
    autorizacionImagen: student.autorizacionImagen,
    autorizacionSalidas: student.autorizacionSalidas,
    observacionesTutor: enrollment.observacionesTutor,
    planoX: enrollment.planoX,
    planoY: enrollment.planoY,
    planoColor: enrollment.planoColor as Student['planoColor'],
});

// La foto viaja aparte de studentPatch/enrollmentPatch (bytes crudos, no
// JSON: PUT/DELETE /photos/{id} en web, comandos set_student_photo/
// delete_student_photo en escritorio) — ver splitStudentPatch justo
// debajo, que por eso la excluye del patch normal. Si `foto` ya es una URL
// propia (puesta ahí por joinStudentEnrollment) es que no ha cambiado
// desde que se cargó la ficha: no hace falta volver a subir los mismos
// bytes en cada guardado de un campo cualquiera.
export const syncStudentPhoto = async (studentId: string, foto: string | undefined): Promise<void> => {
    if (isTauri()) {
        if (foto === undefined) {
            await invoke('delete_student_photo', { studentId });
            return;
        }
        if (foto.startsWith('http://studentphoto.localhost/')) return;
        const blob = await (await fetch(foto)).blob();
        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        await invoke('set_student_photo', { studentId, bytes, contentType: blob.type || 'application/octet-stream' });
        return;
    }
    if (foto === undefined) {
        await fetch(`/api/photos/${studentId}`, { method: 'DELETE' });
        return;
    }
    if (foto.startsWith('/api/photos/')) return;
    const blob = await (await fetch(foto)).blob();
    await fetch(`/api/photos/${studentId}`, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' } });
};

// Reparto del `Partial<Student>` combinado que sigue emitiendo
// StudentPersonalDataModal al guardar una ficha: separa lo que pertenece a
// STUDENT (persona) de lo que pertenece a ENROLLMENT (matrícula de esta
// clase), mismo criterio que el ERD del plan. `foto` se descarta (viaja
// aparte, ver syncStudentPhoto justo arriba).
export const splitStudentPatch = (data: Partial<Student>): { studentPatch: ApiStudentPatch; enrollmentPatch: ApiEnrollmentPatch } => {
    const studentPatch: ApiStudentPatch = {};
    const enrollmentPatch: ApiEnrollmentPatch = {};

    if ('nombre' in data) studentPatch.nombre = data.nombre;
    if ('primerApellido' in data) studentPatch.primerApellido = data.primerApellido;
    if ('segundoApellido' in data) studentPatch.segundoApellido = data.segundoApellido;
    if ('fechaNacimiento' in data) studentPatch.fechaNacimiento = data.fechaNacimiento;
    if ('dni' in data) studentPatch.dni = data.dni;
    if ('nie' in data) studentPatch.nie = data.nie;
    if ('nacionalidad' in data) studentPatch.nacionalidad = data.nacionalidad;
    if ('telefonoUrgencias' in data) studentPatch.telefonoUrgencias = data.telefonoUrgencias;
    if ('tutor1' in data) studentPatch.tutor1 = data.tutor1;
    if ('tutor2' in data) studentPatch.tutor2 = data.tutor2;
    if ('domicilioDireccion' in data) studentPatch.domicilioDireccion = data.domicilioDireccion;
    if ('domicilioLocalidad' in data) studentPatch.domicilioLocalidad = data.domicilioLocalidad;
    if ('domicilioCodigoPostal' in data) studentPatch.domicilioCodigoPostal = data.domicilioCodigoPostal;
    if ('domicilioTelefono' in data) studentPatch.domicilioTelefono = data.domicilioTelefono;
    if ('alergias' in data) studentPatch.alergias = data.alergias;
    if ('enfermedadesRelevantes' in data) studentPatch.enfermedadesRelevantes = data.enfermedadesRelevantes;
    if ('medicacionHabitual' in data) studentPatch.medicacionHabitual = data.medicacionHabitual;
    if ('intoleranciasAlimentarias' in data) studentPatch.intoleranciasAlimentarias = data.intoleranciasAlimentarias;
    if ('observacionesSanitarias' in data) studentPatch.observacionesSanitarias = data.observacionesSanitarias;
    if ('autorizacionImagen' in data) studentPatch.autorizacionImagen = data.autorizacionImagen;
    if ('autorizacionSalidas' in data) studentPatch.autorizacionSalidas = data.autorizacionSalidas;

    if ('acneae' in data) enrollmentPatch.acneae = data.acneae;
    if ('centroProcedencia' in data) enrollmentPatch.centroProcedencia = data.centroProcedencia;
    if ('haRepetidoCurso' in data) enrollmentPatch.haRepetidoCurso = data.haRepetidoCurso;
    if ('materiasPendientes' in data) enrollmentPatch.materiasPendientes = data.materiasPendientes;
    if ('programaEspecifico' in data) enrollmentPatch.programaEspecifico = data.programaEspecifico;
    if ('neae' in data) enrollmentPatch.neae = data.neae;
    if ('neaeDetalle' in data) enrollmentPatch.neaeDetalle = data.neaeDetalle;
    if ('medidasEducativas' in data) enrollmentPatch.medidasEducativas = data.medidasEducativas;
    if ('observacionesTutor' in data) enrollmentPatch.observacionesTutor = data.observacionesTutor;
    if ('planoX' in data) enrollmentPatch.planoX = data.planoX;
    if ('planoY' in data) enrollmentPatch.planoY = data.planoY;
    if ('planoColor' in data) enrollmentPatch.planoColor = data.planoColor;

    return { studentPatch, enrollmentPatch };
};

// ============================================================
// categories / assignments — traducción de forma casi directa (mismos
// campos, la API añade classId/createdAt/updatedAt que la forma vieja no
// tenía porque vivía embebida dentro de la propia ClassData).
// ============================================================

export const apiCategoryToLocal = (c: ApiCategory): Category => ({
    id: c.id,
    name: c.name,
    weight: c.weight,
    evaluationPeriodId: c.evaluationPeriodId,
    type: c.type,
});

export const apiAssignmentToLocal = (a: ApiAssignment): Assignment => ({
    id: a.id,
    name: a.name,
    categoryId: a.categoryId,
    evaluationPeriodId: a.evaluationPeriodId,
    date: a.date,
    evaluationMethod: a.evaluationMethod,
    evaluationToolId: a.evaluationToolId,
    linkedCriteria: a.linkedCriteria,
    programmingUnitId: a.programmingUnitId,
    recoversAssignmentIds: a.recoversAssignmentIds,
    pesoEnCategoria: a.pesoEnCategoria,
    importancia: a.importancia as ImportanciaActividad | undefined,
    importanciaPersonalizada: a.importanciaPersonalizada,
});

// ============================================================
// grades — el punto delicado de todo el bloque 6. gradeCalculations/*.ts
// (que NO se toca, ver plan) opera siempre sobre `Grade.criterionScores`,
// un mapa {criterioId|'direct_score'|'recovery_grade': nota} que en el blob
// viejo se computaba UNA VEZ al guardar y se guardaba tal cual. El backend
// nuevo, a propósito (ver fase-0-ddl-y-api.md), no tiene esa columna —
// grades solo guarda directScore/recoveryScore/toolResults. La solución no
// es guardar menos información, es guardar la MISMA información de otra
// forma y reconstruir criterionScores al leer, con las mismas fórmulas que
// ya existían (calculateToolGlobalScore/calculateCriterionScoresFromTool),
// solo que ahora se ejecutan en cada lectura en vez de una vez al guardar:
//
//   - Recuperación (criterionScores = {recovery_grade: N})      -> recoveryScore
//   - Nota única sin criterios (criterionScores = {direct_score: N}) -> directScore
//   - Instrumento (checklist/escala/rúbrica): criterionScores SIEMPRE
//     derivable de toolResults + la definición del instrumento (vigente,
//     no una copia congelada) -> se guarda solo toolResults, nunca
//     criterionScores; esto además vuelve innecesario el parche
//     recalculateGradesForTool al editar un instrumento (ver
//     EvaluationToolManager.tsx) porque ya no hay nada "desincronizado"
//     que recalcular: se deriva fresco en cada lectura.
//   - Nota directa CON criterios vinculados (uno o varios, posiblemente con
//     notas distintas cada uno): no cabe en un único escalar. Se guarda el
//     mapa completo tal cual dentro de `toolResults` (nunca usado por
//     direct_grade en el modelo viejo, así que no hay colisión posible) —
//     un "acarreador" genérico, no una reinterpretación de qué es
//     toolResults.
// ============================================================

export const encodeGradeInput = (
    data: { criterionScores: Record<string, number | null> } | { toolResults: Record<string, boolean | string | number>; criterionScores?: Record<string, number | null> },
): ApiGradeInput => {
    if ('toolResults' in data) {
        // Instrumento: el crudo es lo único que hace falta guardar,
        // criterionScores (si viene, derivado) se descarta — se recalcula
        // igual al leer.
        return { toolResults: data.toolResults };
    }

    const criterionScores = data.criterionScores;
    const keys = Object.keys(criterionScores);

    if (keys.length === 1 && keys[0] === 'recovery_grade') {
        const value = criterionScores['recovery_grade'];
        return value != null ? { recoveryScore: value } : {};
    }
    if (keys.length === 1 && keys[0] === 'direct_score') {
        const value = criterionScores['direct_score'];
        return value != null ? { directScore: value } : {};
    }
    // Mapa multi-criterio (o el 'manual_grade' de BulkGradeImportModal para
    // tareas sin criterios — sentinela que calculateSingleAssignmentScore no
    // lee hoy, comportamiento existente que no nos toca corregir aquí):
    // se guarda el mapa completo, sin decidir aquí qué significa cada clave.
    return { toolResults: criterionScores as unknown as Record<string, unknown> };
};

export const decodeGrade = (
    apiGrade: Pick<ApiGrade, 'directScore' | 'recoveryScore' | 'toolResults'>,
    studentId: string,
    assignment: Pick<Assignment, 'id' | 'evaluationMethod' | 'evaluationToolId' | 'linkedCriteria'>,
    evaluationTools: EvaluationTool[],
): Grade => {
    if (assignment.evaluationMethod !== 'direct_grade') {
        const toolResults = (apiGrade.toolResults ?? undefined) as Record<string, boolean | string | number> | undefined;
        let criterionScores: Record<string, number | null> = {};
        if (toolResults && Object.keys(toolResults).length > 0) {
            const tool = evaluationTools.find(t => t.id === assignment.evaluationToolId);
            if (tool) {
                if (assignment.linkedCriteria && assignment.linkedCriteria.length > 0) {
                    const globalScore = calculateToolGlobalScore(tool, toolResults);
                    assignment.linkedCriteria.forEach(lc => { criterionScores[lc.criterionId] = globalScore; });
                } else {
                    criterionScores = calculateCriterionScoresFromTool(tool, toolResults);
                }
            }
        }
        return { studentId, assignmentId: assignment.id, criterionScores, toolResults };
    }

    if (apiGrade.recoveryScore != null) {
        return { studentId, assignmentId: assignment.id, criterionScores: { recovery_grade: apiGrade.recoveryScore } };
    }
    if (apiGrade.directScore != null) {
        return { studentId, assignmentId: assignment.id, criterionScores: { direct_score: apiGrade.directScore } };
    }
    if (apiGrade.toolResults) {
        return { studentId, assignmentId: assignment.id, criterionScores: apiGrade.toolResults as Record<string, number | null> };
    }
    return { studentId, assignmentId: assignment.id, criterionScores: {} };
};

// Hidrata todas las notas de una clase de una vez: necesita el enrollmentId
// -> studentId de esa clase (las Grade de la API se indexan por matrícula,
// no por persona) y las assignments YA en forma local (para conocer
// evaluationMethod/linkedCriteria/evaluationToolId de cada una).
export const hydrateGrades = (
    apiGrades: Pick<ApiGrade, 'enrollmentId' | 'assignmentId' | 'directScore' | 'recoveryScore' | 'toolResults'>[],
    enrollments: Pick<ApiEnrollment, 'id' | 'studentId'>[],
    assignments: Assignment[],
    evaluationTools: EvaluationTool[],
): Grade[] => {
    const studentIdByEnrollment = new Map(enrollments.map(e => [e.id, e.studentId]));
    const assignmentById = new Map(assignments.map(a => [a.id, a]));
    const grades: Grade[] = [];
    for (const g of apiGrades) {
        const studentId = studentIdByEnrollment.get(g.enrollmentId);
        const assignment = assignmentById.get(g.assignmentId);
        if (!studentId || !assignment) continue; // matrícula/tarea borrada entretanto, no debería pasar
        grades.push(decodeGrade(g, studentId, assignment, evaluationTools));
    }
    return grades;
};

// Cruza las matrículas de UNA clase con el registro global de alumnado —
// mismo criterio que ClassManager.tsx/ClasesView.tsx (bloque 5), factorizado
// aquí porque App.tsx (bloque 6) también lo necesita para hidratar varias
// clases de una vez.
export const joinEnrolledStudents = (enrollments: ApiEnrollment[], globalStudents: ApiStudent[]): Student[] => {
    const studentsById = new Map(globalStudents.map(s => [s.id, s]));
    return enrollments
        .map(e => {
            const student = studentsById.get(e.studentId);
            return student ? joinStudentEnrollment(student, e) : null;
        })
        .filter((s): s is Student => !!s);
};

// Ensambla una ClassData completa (cáscara + alumnado + currículo de
// instancia) a partir de todas las piezas ya hidratadas por separado — la
// única función que junta los bloques 4/5/6 en el objeto único que siguen
// esperando GradebookTable/CalendarView/los informes de clase.
export const hydrateClassData = (
    shell: Pick<ApiClassData, 'id' | 'courseId' | 'grupo' | 'schedule' | 'skippedDays' | 'icono' | 'colorAcento' | 'mesaProfesorX' | 'mesaProfesorY'>,
    enrollments: ApiEnrollment[],
    globalStudents: ApiStudent[],
    apiCategories: ApiCategory[],
    apiAssignments: ApiAssignment[],
    apiGrades: Pick<ApiGrade, 'enrollmentId' | 'assignmentId' | 'directScore' | 'recoveryScore' | 'toolResults'>[],
    evaluationTools: EvaluationTool[],
): ClassData => {
    const assignments = apiAssignments.map(apiAssignmentToLocal);
    return {
        ...apiClassToLocal(shell),
        students: joinEnrolledStudents(enrollments, globalStudents),
        categories: apiCategories.map(apiCategoryToLocal),
        assignments,
        grades: hydrateGrades(apiGrades, enrollments, assignments, evaluationTools),
    };
};

// Fase 6: journalEntries/tasks/meetings/agendaNotes eran las últimas
// entidades gobernadas por el blob en web — sus consumidores (HoyView,
// ReunionesView, CalendarView...) siguen llamando a un setter estilo
// React.SetStateAction (setTasks(prev => [...prev, nueva])), porque
// reescribir cada uno para llamar directamente a create/update/delete
// habría sido un cambio mucho más invasivo que necesario para esta fase.
// En vez de eso, App.tsx envuelve el setter real: calcula next a partir de
// current, y esta función traduce la diferencia a las llamadas granulares
// que hacen falta. Comparación por JSON.stringify (no por referencia): el
// propio patrón `prev => prev.map(x => x.id === id ? {...x, campo} : x)`
// crea un objeto nuevo aunque el valor no cambie, así que iría a false
// positivo constantemente si comparásemos por referencia — a esta escala
// (decenas de filas, no miles) el coste de comparar por contenido es
// irrelevante frente a evitar peticiones de red vacías.
export async function diffAndSyncList<T extends { id: string }>(
    current: T[],
    next: T[],
    ops: {
        create: (item: Omit<T, 'id'>) => Promise<unknown>;
        update: (id: string, patch: Omit<T, 'id'>) => Promise<unknown>;
        remove: (id: string) => Promise<unknown>;
    },
): Promise<void> {
    const currentById = new Map(current.map(item => [item.id, item]));
    const nextIds = new Set(next.map(item => item.id));

    for (const item of next) {
        const { id, ...rest } = item;
        const prevItem = currentById.get(id);
        if (!prevItem) {
            await ops.create(rest as Omit<T, 'id'>);
        } else if (JSON.stringify(prevItem) !== JSON.stringify(item)) {
            await ops.update(id, rest as Omit<T, 'id'>);
        }
    }

    for (const item of current) {
        if (!nextIds.has(item.id)) {
            await ops.remove(item.id);
        }
    }
}
