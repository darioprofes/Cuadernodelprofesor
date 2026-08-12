import { describe, it, expect } from 'vitest';
import { parseAlumnoSauce, parseSauceText, matchSauceRow } from './sauceImport';

describe('sauceImport', () => {
    describe('parseAlumnoSauce', () => {
        it('separa dos apellidos y nombre', () => {
            expect(parseAlumnoSauce('García López, Elena')).toEqual({
                nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López',
            });
        });

        it('admite un solo apellido', () => {
            expect(parseAlumnoSauce('García, Elena')).toEqual({
                nombre: 'Elena', primerApellido: 'García', segundoApellido: '',
            });
        });

        it('admite apellido compuesto (más de dos palabras) con una heurística razonable', () => {
            expect(parseAlumnoSauce('De la Fuente Martín, Elena')).toEqual({
                nombre: 'Elena', primerApellido: 'De la Fuente', segundoApellido: 'Martín',
            });
        });

        it('sin coma: todo el texto va a primerApellido, nombre queda vacío', () => {
            expect(parseAlumnoSauce('García López Elena')).toEqual({
                nombre: '', primerApellido: 'García López Elena', segundoApellido: '',
            });
        });
    });

    describe('parseSauceText', () => {
        const cabecera = ['Alumno/a', 'Nº Id. Escolar', 'Nº Expte. centro', 'DNI/Pasaporte', 'Fecha de nacimiento', 'Curso', 'Fecha de creación', 'Unidad', 'Nacionalidad'].join('\t');

        it('parsea una tabla con la cabecera real de SAUCE', () => {
            const fila = ['García López, Elena', '1234567', '99', '12345678A', '15/03/2012', '1ESO', '01/09/2024', 'A', 'Española'].join('\t');
            const { filas, errores } = parseSauceText(`${cabecera}\n${fila}`);
            expect(errores).toEqual([]);
            expect(filas).toHaveLength(1);
            expect(filas[0]).toMatchObject({
                nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López',
                nie: '1234567', dni: '12345678A', fechaNacimiento: '2012-03-15',
                nacionalidad: 'Española', curso: '1ESO', unidad: 'A',
            });
        });

        it('admite "|" como separador (para escribir la tabla a mano, no solo pegarla de Excel)', () => {
            const cabeceraPipe = ['Alumno/a', 'Nº Id. Escolar', 'Nº Expte. centro', 'DNI/Pasaporte', 'Fecha de nacimiento', 'Curso', 'Fecha de creación', 'Unidad', 'Nacionalidad'].join(' | ');
            const filaPipe = ['García López, Elena', '1234567', '99', '12345678A', '15/03/2012', '1ESO', '01/09/2024', 'A', 'Española'].join(' | ');
            const { filas, errores } = parseSauceText(`${cabeceraPipe}\n${filaPipe}`);
            expect(errores).toEqual([]);
            expect(filas).toHaveLength(1);
            expect(filas[0]).toMatchObject({
                nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López', nie: '1234567', curso: '1ESO', unidad: 'A',
            });
        });

        it('sin cabecera reconocible, devuelve un error y ninguna fila', () => {
            const { filas, errores } = parseSauceText('columna1\tcolumna2\nvalor1\tvalor2');
            expect(filas).toEqual([]);
            expect(errores.length).toBeGreaterThan(0);
        });

        it('una fila sin "Alumno/a" resoluble se reporta como error, no bloquea el resto', () => {
            const filaMala = ['sin coma aqui', '1', '', '', '', '', '', '', ''].join('\t');
            const filaBuena = ['Ruiz, Ana', '2', '', '', '', '', '', '', ''].join('\t');
            const { filas, errores } = parseSauceText(`${cabecera}\n${filaMala}\n${filaBuena}`);
            expect(filas).toHaveLength(1);
            expect(filas[0].nombre).toBe('Ana');
            expect(errores.length).toBe(1);
        });
    });

    describe('matchSauceRow', () => {
        const fila = {
            nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López',
            nie: '1234567', dni: null, fechaNacimiento: null, nacionalidad: null,
            curso: null, unidad: null, filaOrigen: 2,
        };

        it('fusiona por NIE aunque el nombre no coincida exactamente', () => {
            const existentes = [{ id: 'a1', nombre: 'Elena', primerApellido: 'Garcia', segundoApellido: 'Lopez', nie: '1234567' }];
            const match = matchSauceRow(fila, existentes);
            expect(match).toEqual({ kind: 'nie', student: existentes[0] });
        });

        it('sin NIE en ningún lado, cae a nombre completo exacto (normalizado) y avisa', () => {
            const filaSinNie = { ...fila, nie: null };
            const existentes = [{ id: 'a1', nombre: 'Elena', primerApellido: 'García', segundoApellido: 'López' }];
            const match = matchSauceRow(filaSinNie, existentes);
            expect(match.kind).toBe('nombre');
            expect(match.student).toEqual(existentes[0]);
        });

        it('sin ninguna coincidencia, es alumnado nuevo', () => {
            const existentes = [{ id: 'a1', nombre: 'Otro', primerApellido: 'Distinto', segundoApellido: 'Ya', nie: '9999999' }];
            const match = matchSauceRow(fila, existentes);
            expect(match).toEqual({ kind: 'nuevo', student: null });
        });
    });
});
