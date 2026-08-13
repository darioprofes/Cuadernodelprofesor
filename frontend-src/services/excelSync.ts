// Emparejamiento de una fila de la hoja "Alumnado" (ver scheduleWizard.ts)
// contra el alumnado global ya existente (STUDENT, no ENROLLMENT) al
// re-subir un Excel para sincronizar el curso académico activo — ver
// SyncAcademicYearModal.tsx. Puro (sin React ni backend): recibe la lista
// completa de estudiantes ya cargada (useApiStudents) y decide, fila a
// fila, si es un alumno nuevo, uno ya existente, o si hay ambigüedad real.

import { sinAcentos, type FilaAlumnado } from './scheduleWizard';
import type { Student as ApiStudent } from '../types/api';

export type AlumnadoMatch =
    | { tipo: 'nuevo' }
    | { tipo: 'existente'; studentId: string }
    // Solo puede pasar de verdad al emparejar por nombre (DNI/NIE son
    // únicos en students, un choque ahí sería un problema de datos aparte)
    // — varias personas con el mismo nombre y sin DNI/NIE que las
    // distinga. La fila no se resuelve sola: se enseña al profesor para
    // que decida.
    | { tipo: 'ambiguo'; candidatos: { id: string; nombre: string }[] };

const normalizarIdentificador = (s: string): string => s.trim().toUpperCase();

const nombreCompleto = (nombre?: string, primerApellido?: string, segundoApellido?: string): string =>
    [nombre, primerApellido, segundoApellido].filter(Boolean).join(' ');

// Mismo criterio que _clave_nombre en api/app/services/educastur_sync.py:
// sin acentos/mayúsculas/espacios repetidos, para tolerar pequeñas
// discrepancias de tildes entre el Excel y la ficha real.
export const claveNombre = (nombre?: string, primerApellido?: string, segundoApellido?: string): string =>
    sinAcentos(nombreCompleto(nombre, primerApellido, segundoApellido).toLowerCase()).replace(/\s+/g, ' ').trim();

// DNI -> NIE -> nombre completo normalizado, en ese orden — el primer
// identificador presente en la fila con exactamente una coincidencia
// gana. Si un identificador está presente pero no coincide con nadie, se
// prueba igualmente el siguiente (más tolerante a un typo puntual en un
// campo que a perder la coincidencia del todo); si NINGUNO resuelve, es
// alumnado nuevo.
export function resolverAlumno(
    fila: Pick<FilaAlumnado, 'dni' | 'nie' | 'nombre' | 'primerApellido' | 'segundoApellido'>,
    estudiantes: ApiStudent[],
): AlumnadoMatch {
    const intentar = (candidatos: ApiStudent[]): AlumnadoMatch | null => {
        if (candidatos.length === 1) return { tipo: 'existente', studentId: candidatos[0].id };
        if (candidatos.length > 1) {
            return {
                tipo: 'ambiguo',
                candidatos: candidatos.map(s => ({ id: s.id, nombre: nombreCompleto(s.nombre, s.primerApellido, s.segundoApellido) })),
            };
        }
        return null;
    };

    if (fila.dni) {
        const resultado = intentar(estudiantes.filter(s => s.dni && normalizarIdentificador(s.dni) === normalizarIdentificador(fila.dni!)));
        if (resultado) return resultado;
    }
    if (fila.nie) {
        const resultado = intentar(estudiantes.filter(s => s.nie && normalizarIdentificador(s.nie) === normalizarIdentificador(fila.nie!)));
        if (resultado) return resultado;
    }
    const clave = claveNombre(fila.nombre, fila.primerApellido, fila.segundoApellido);
    if (clave) {
        const resultado = intentar(estudiantes.filter(s => claveNombre(s.nombre, s.primerApellido, s.segundoApellido) === clave));
        if (resultado) return resultado;
    }
    return { tipo: 'nuevo' };
}
