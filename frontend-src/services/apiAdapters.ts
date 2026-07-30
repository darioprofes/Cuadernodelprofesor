// Adaptadores entre el backend granular nuevo (types/api.ts) y las formas
// antiguas del blob (types.ts) que siguen esperando los componentes de
// clases/alumnado todavía no reescritos por completo (Fase 5 fusionada,
// bloques 4-6). Vive aparte porque lo usan varios ficheros a la vez
// (ScheduleManager, ClassManager, ClasesView) y encierra reglas de negocio
// reales (qué campo pertenece a STUDENT vs a ENROLLMENT, ver el ERD del
// plan) que no queremos duplicar ni desincronizar.

import type { ClassData, Student } from '../types';
import type {
    ClassData as ApiClassData,
    Student as ApiStudent,
    Enrollment as ApiEnrollment,
    StudentPatch as ApiStudentPatch,
    EnrollmentPatch as ApiEnrollmentPatch,
} from '../types/api';

// classes (Postgres) todavía no tiene alumnado/categorías/tareas/notas
// embebidos (bloques 5/6) — se rellenan vacíos aquí; cada consumidor los
// sustituye aparte (roster hidratado) o simplemente no los usa (nunca los
// lee ni los escribe).
export const apiClassToLocal = (cls: Pick<ApiClassData, 'id' | 'courseId' | 'grupo' | 'schedule' | 'skippedDays' | 'icono' | 'colorAcento' | 'mesaProfesorX' | 'mesaProfesorY'>): ClassData => ({
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
});

// STUDENT (persona, global) + ENROLLMENT (matrícula de esta clase) fundidos
// en el `Student` embebido que siguen esperando StudentRow/PlanoClaseModal/
// StudentSummaryModal/StudentPersonalDataModal. `enrollmentId` es el único
// campo añadido (ver types.ts) — necesario para saber qué matrícula tocar
// al borrar/editar/mover en el plano. `foto` queda ausente a propósito: el
// backend nuevo todavía no la soporta (aplazado a la Fase 6, ver plan).
export const joinStudentEnrollment = (student: ApiStudent, enrollment: ApiEnrollment): Student => ({
    id: student.id,
    enrollmentId: enrollment.id,
    nombre: student.nombre,
    primerApellido: student.primerApellido,
    segundoApellido: student.segundoApellido,
    acneae: enrollment.acneae,
    fechaNacimiento: student.fechaNacimiento,
    dni: student.dni,
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

// Reparto del `Partial<Student>` combinado que sigue emitiendo
// StudentPersonalDataModal al guardar una ficha: separa lo que pertenece a
// STUDENT (persona) de lo que pertenece a ENROLLMENT (matrícula de esta
// clase), mismo criterio que el ERD del plan. `foto` se descarta (ver
// joinStudentEnrollment).
export const splitStudentPatch = (data: Partial<Student>): { studentPatch: ApiStudentPatch; enrollmentPatch: ApiEnrollmentPatch } => {
    const studentPatch: ApiStudentPatch = {};
    const enrollmentPatch: ApiEnrollmentPatch = {};

    if ('nombre' in data) studentPatch.nombre = data.nombre;
    if ('primerApellido' in data) studentPatch.primerApellido = data.primerApellido;
    if ('segundoApellido' in data) studentPatch.segundoApellido = data.segundoApellido;
    if ('fechaNacimiento' in data) studentPatch.fechaNacimiento = data.fechaNacimiento;
    if ('dni' in data) studentPatch.dni = data.dni;
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
