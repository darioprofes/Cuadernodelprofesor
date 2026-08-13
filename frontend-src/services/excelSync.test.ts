import { describe, it, expect } from 'vitest';
import { resolverAlumno, claveNombre } from './excelSync';
import type { Student } from '../types/api';

const alumno = (over: Partial<Student>): Student => ({
    id: over.id ?? 'id',
    nombre: over.nombre,
    primerApellido: over.primerApellido,
    segundoApellido: over.segundoApellido,
    dni: over.dni,
    nie: over.nie,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
});

describe('resolverAlumno', () => {
    it('empareja por DNI exacto', () => {
        const estudiantes = [alumno({ id: 's1', dni: '12345678A', nombre: 'Elena', primerApellido: 'García' })];
        const resultado = resolverAlumno({ dni: '12345678a', nie: null, nombre: 'Otro', primerApellido: 'Nombre', segundoApellido: '' }, estudiantes);
        expect(resultado).toEqual({ tipo: 'existente', studentId: 's1' });
    });

    it('cae a NIE si el DNI no está presente en la fila', () => {
        const estudiantes = [alumno({ id: 's1', nie: '1234567', nombre: 'Elena', primerApellido: 'García' })];
        const resultado = resolverAlumno({ dni: null, nie: '1234567', nombre: 'Otro', primerApellido: 'Nombre', segundoApellido: '' }, estudiantes);
        expect(resultado).toEqual({ tipo: 'existente', studentId: 's1' });
    });

    it('cae a NIE si el DNI de la fila no coincide con nadie', () => {
        const estudiantes = [alumno({ id: 's1', dni: '99999999X', nie: '1234567', nombre: 'Elena', primerApellido: 'García' })];
        const resultado = resolverAlumno({ dni: '00000000Z', nie: '1234567', nombre: 'Otro', primerApellido: 'Nombre', segundoApellido: '' }, estudiantes);
        expect(resultado).toEqual({ tipo: 'existente', studentId: 's1' });
    });

    it('cae a nombre si no hay DNI ni NIE en la fila', () => {
        const estudiantes = [alumno({ id: 's1', nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López' })];
        const resultado = resolverAlumno({ dni: null, nie: null, nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López' }, estudiantes);
        expect(resultado).toEqual({ tipo: 'existente', studentId: 's1' });
    });

    it('tolera diferencias de acentos/mayúsculas en el nombre', () => {
        const estudiantes = [alumno({ id: 's1', nombre: 'Íñigo', primerApellido: 'Muñoz', segundoApellido: '' })];
        const resultado = resolverAlumno({ dni: null, nie: null, nombre: 'inigo', primerApellido: 'MUÑOZ', segundoApellido: '' }, estudiantes);
        expect(resultado).toEqual({ tipo: 'existente', studentId: 's1' });
    });

    it('sin ninguna coincidencia, es alumnado nuevo', () => {
        const estudiantes = [alumno({ id: 's1', nombre: 'Elena', primerApellido: 'García' })];
        const resultado = resolverAlumno({ dni: null, nie: null, nombre: 'Marcos', primerApellido: 'Ruiz', segundoApellido: '' }, estudiantes);
        expect(resultado).toEqual({ tipo: 'nuevo' });
    });

    it('varios alumnos con el mismo nombre y sin DNI/NIE: ambiguo', () => {
        const estudiantes = [
            alumno({ id: 's1', nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López' }),
            alumno({ id: 's2', nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López' }),
        ];
        const resultado = resolverAlumno({ dni: null, nie: null, nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López' }, estudiantes);
        expect(resultado.tipo).toBe('ambiguo');
        if (resultado.tipo === 'ambiguo') {
            expect(resultado.candidatos).toHaveLength(2);
        }
    });

    it('un alumno con DNI en la fila que no coincide con nadie, y sin NIE, resuelve por nombre igualmente', () => {
        const estudiantes = [alumno({ id: 's1', nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López' })];
        const resultado = resolverAlumno({ dni: '00000000Z', nie: null, nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López' }, estudiantes);
        expect(resultado).toEqual({ tipo: 'existente', studentId: 's1' });
    });
});

describe('claveNombre', () => {
    it('normaliza tildes, mayúsculas y espacios repetidos', () => {
        expect(claveNombre('  Íñigo', 'MUÑOZ ', 'García')).toBe(claveNombre('inigo', 'muñoz', 'garcia'));
    });
});
