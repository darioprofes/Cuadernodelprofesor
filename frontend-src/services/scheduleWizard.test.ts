import { describe, it, expect } from 'vitest';
import { generateTemplate, parseWorkbook } from './scheduleWizard';
import type { FilaHorario } from '../types';

const ALUMNADO_CABECERA = ['Nivel', 'Materia', 'Grupo', 'Nombre', 'Primer Apellido', 'Segundo Apellido', 'Fecha Nacimiento', 'DNI', 'ACNEAE'];

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const SUBCOLS_ORDEN_NORMAL = ['Nivel', 'Materia', 'Grupo', 'Aula'] as const;

interface DatosDia {
    nivel?: string;
    materia?: string;
    grupo?: string;
    aula?: string;
}

interface FilaHorarioTest {
    hora?: string;
    dias?: (DatosDia | undefined)[]; // índice 0=Lunes .. 4=Viernes
}

// Construye la hoja "Horario" con el layout de producción (v2): cabeceras
// de día combinadas en la fila 1, subcabeceras Nivel/Materia/Grupo/Aula en
// la fila 2 (en el orden dado, por defecto el normal — se puede pasar
// desordenado para probar que el parseo no depende de la posición).
function addHorarioSheet(wb: import('exceljs').Workbook, filas: FilaHorarioTest[], subcolsOrden: readonly string[] = SUBCOLS_ORDEN_NORMAL) {
    const sheet = wb.addWorksheet('Horario');
    sheet.getCell(1, 1).value = 'Hora';
    DIAS.forEach((dia, d) => {
        const colInicio = 2 + d * 4;
        sheet.mergeCells(1, colInicio, 1, colInicio + 3);
        sheet.getCell(1, colInicio).value = dia;
        subcolsOrden.forEach((sub, i) => {
            sheet.getCell(2, colInicio + i).value = sub;
        });
    });

    filas.forEach((fila, i) => {
        const r = 3 + i;
        if (fila.hora !== undefined) sheet.getCell(r, 1).value = fila.hora;
        DIAS.forEach((_, d) => {
            const datos = fila.dias?.[d];
            if (!datos) return;
            const colInicio = 2 + d * 4;
            subcolsOrden.forEach((sub, si) => {
                const clave = sub.toLowerCase() as keyof DatosDia;
                const valor = datos[clave];
                if (valor !== undefined) sheet.getCell(r, colInicio + si).value = valor;
            });
        });
    });

    return sheet;
}

function addAlumnadoSheet(wb: import('exceljs').Workbook, opts?: { cabecera?: string[]; filas?: (string | undefined)[][] }) {
    const sheet = wb.addWorksheet('Alumnado');
    sheet.addRow(opts?.cabecera ?? ALUMNADO_CABECERA);
    opts?.filas?.forEach(fila => sheet.addRow(fila));
    return sheet;
}

// Construye un workbook mínimo con exceljs directamente (sin pasar por
// generateTemplate) para probar parseWorkbook con datos de control propios.
// Salvo que se omita explícitamente, ambas hojas se crean (vacías, solo
// cabecera, si el test no les da contenido) para que un test centrado en
// una hoja no arrastre el error de "falta la otra".
async function buildWorkbook(opts: {
    horario?: FilaHorarioTest[];
    horarioSubcolsOrden?: readonly string[];
    alumnado?: { cabecera?: string[]; filas: (string | undefined)[][] };
    omitirHojas?: string[];
}): Promise<ArrayBuffer> {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();

    if (!opts.omitirHojas?.includes('Horario')) {
        addHorarioSheet(wb, opts.horario ?? [], opts.horarioSubcolsOrden ?? SUBCOLS_ORDEN_NORMAL);
    }
    if (!opts.omitirHojas?.includes('Alumnado')) {
        addAlumnadoSheet(wb, opts.alumnado);
    }

    return wb.xlsx.writeBuffer() as unknown as Promise<ArrayBuffer>;
}

describe('scheduleWizard', () => {
    describe('parseWorkbook — hoja Horario', () => {
        it('reconoce una clase académica con Nivel/Materia/Grupo/Aula rellenos', async () => {
            const buffer = await buildWorkbook({
                horario: [{ hora: '08:15 - 09:10', dias: [{ nivel: '1º ESO', materia: 'Biología y Geología', grupo: '1º ESO A', aula: 'A16' }] }],
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(filas).toEqual<FilaHorario[]>([
                { dia: 0, hora_inicio: '08:15', hora_fin: '09:10', grupo: '1º ESO A', asignatura: 'Biología y Geología', aula: 'A16', ensenanza: '1º ESO' },
            ]);
        });

        it('reconoce una "otra ocupación" con solo Materia rellena (sin grupo)', async () => {
            const buffer = await buildWorkbook({
                horario: [{ hora: '08:15 - 09:10', dias: [{ materia: 'Guardia' }] }],
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(filas).toEqual<FilaHorario[]>([
                { dia: 0, hora_inicio: '08:15', hora_fin: '09:10', grupo: null, asignatura: 'Guardia', aula: null, ensenanza: null },
            ]);
        });

        it('una franja sin Materia ese día se ignora (día libre), sin fila ni error', async () => {
            const buffer = await buildWorkbook({
                horario: [{ hora: '11:00 - 11:30', dias: [] }],
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(filas).toEqual([]);
            expect(errores).toEqual([]);
        });

        it('reporta un rango de horas inválido como error de fila, sin abortar el resto', async () => {
            const buffer = await buildWorkbook({
                horario: [
                    { hora: 'no-es-una-hora', dias: [{ materia: 'Guardia' }] },
                    { hora: '09:10 - 10:05', dias: [{ materia: 'Matemáticas' }] },
                ],
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(errores).toHaveLength(1);
            expect(errores[0]).toMatch(/rango de horas inválido/i);
            expect(filas).toHaveLength(1);
            expect(filas[0].asignatura).toBe('Matemáticas');
        });

        it('el orden de las subcolumnas (Nivel/Materia/Grupo/Aula) dentro de un bloque de día no importa', async () => {
            const buffer = await buildWorkbook({
                horario: [{ hora: '08:15 - 09:10', dias: [{ nivel: '1º ESO', materia: 'Biología y Geología', grupo: '1º ESO A', aula: 'A16' }] }],
                horarioSubcolsOrden: ['Aula', 'Grupo', 'Materia', 'Nivel'],
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(filas).toEqual<FilaHorario[]>([
                { dia: 0, hora_inicio: '08:15', hora_fin: '09:10', grupo: '1º ESO A', asignatura: 'Biología y Geología', aula: 'A16', ensenanza: '1º ESO' },
            ]);
        });

        it('reconoce varios días distintos en la misma fila', async () => {
            const buffer = await buildWorkbook({
                horario: [{
                    hora: '08:15 - 09:10',
                    dias: [
                        { materia: 'Guardia' },
                        undefined,
                        { nivel: '3º ESO', materia: 'Física y Química', grupo: '3º ESO B' },
                        undefined,
                        { materia: 'Reunión de nivel' },
                    ],
                }],
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(filas.map(f => f.dia)).toEqual([0, 2, 4]);
            expect(filas[1]).toMatchObject({ dia: 2, grupo: '3º ESO B', asignatura: 'Física y Química', ensenanza: '3º ESO' });
        });

        it('un día no reconocido en la cabecera se reporta como error', async () => {
            const { Workbook } = await import('exceljs');
            const wb = new Workbook();
            const sheet = wb.addWorksheet('Horario');
            sheet.getCell(1, 1).value = 'Hora';
            sheet.mergeCells(1, 2, 1, 5);
            sheet.getCell(1, 2).value = 'Sábado'; // no es un día lectivo válido
            ['Nivel', 'Materia', 'Grupo', 'Aula'].forEach((sub, i) => { sheet.getCell(2, 2 + i).value = sub; });
            addAlumnadoSheet(wb);
            const buffer = await wb.xlsx.writeBuffer() as unknown as ArrayBuffer;

            const { errores } = await parseWorkbook(buffer);
            expect(errores.some(e => e.includes('no se reconoce el día "Sábado"'))).toBe(true);
        });

        it('un bloque de día sin subcolumna "Materia" se reporta como error', async () => {
            const { Workbook } = await import('exceljs');
            const wb = new Workbook();
            const sheet = wb.addWorksheet('Horario');
            sheet.getCell(1, 1).value = 'Hora';
            sheet.mergeCells(1, 2, 1, 5);
            sheet.getCell(1, 2).value = 'Lunes';
            ['Nivel', 'Grupo', 'Aula'].forEach((sub, i) => { sheet.getCell(2, 2 + i).value = sub; }); // sin "Materia"
            addAlumnadoSheet(wb);
            const buffer = await wb.xlsx.writeBuffer() as unknown as ArrayBuffer;

            const { errores } = await parseWorkbook(buffer);
            expect(errores.some(e => e.includes('no se encuentra la subcolumna "Materia"'))).toBe(true);
        });
    });

    describe('parseWorkbook — hoja Alumnado', () => {
        it('parsea una fila válida completa', async () => {
            const buffer = await buildWorkbook({
                alumnado: {
                    filas: [
                        ['1º ESO', 'Biología y Geología', '1º ESO A', 'Elena', 'García', 'López', '2012-03-15', '12345678A', 'RE, ACS'],
                    ],
                },
            });
            const { alumnado, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(alumnado).toEqual([{
                nivel: '1º ESO',
                materia: 'Biología y Geología',
                grupo: '1º ESO A',
                nombre: 'Elena',
                primerApellido: 'García',
                segundoApellido: 'López',
                fechaNacimiento: '2012-03-15',
                dni: '12345678A',
                acneae: ['RE', 'ACS'],
            }]);
        });

        it('acepta filas sin los campos opcionales (fecha/DNI/ACNEAE)', async () => {
            const buffer = await buildWorkbook({
                alumnado: {
                    filas: [
                        ['1º ESO', 'Biología y Geología', '1º ESO A', 'Marcos', 'Rodríguez', undefined, undefined, undefined, undefined],
                    ],
                },
            });
            const { alumnado, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(alumnado).toHaveLength(1);
            expect(alumnado[0].fechaNacimiento).toBeNull();
            expect(alumnado[0].acneae).toEqual([]);
        });

        it('reporta como error una fila sin Nivel/Materia/Grupo (no se puede resolver la clase)', async () => {
            const buffer = await buildWorkbook({
                alumnado: {
                    filas: [
                        [undefined, undefined, undefined, 'Lucía', 'Fernández', undefined, undefined, undefined, undefined],
                    ],
                },
            });
            const { alumnado, errores } = await parseWorkbook(buffer);
            expect(alumnado).toEqual([]);
            expect(errores).toHaveLength(1);
            expect(errores[0]).toMatch(/Nivel\/Materia\/Grupo/);
        });

        it('reporta como error una fila sin Nombre/Primer Apellido', async () => {
            const buffer = await buildWorkbook({
                alumnado: {
                    filas: [
                        ['1º ESO', 'Biología y Geología', '1º ESO A', undefined, undefined, undefined, undefined, undefined, undefined],
                    ],
                },
            });
            const { alumnado, errores } = await parseWorkbook(buffer);
            expect(alumnado).toEqual([]);
            expect(errores).toHaveLength(1);
            expect(errores[0]).toMatch(/Nombre\/Primer Apellido/);
        });

        it('ignora filas totalmente vacías sin generar error', async () => {
            const buffer = await buildWorkbook({
                alumnado: {
                    filas: [
                        [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
                    ],
                },
            });
            const { alumnado, errores } = await parseWorkbook(buffer);
            expect(alumnado).toEqual([]);
            expect(errores).toEqual([]);
        });
    });

    describe('hojas ausentes', () => {
        it('reporta un error por cada hoja que falte, sin lanzar excepción', async () => {
            const buffer = await buildWorkbook({ omitirHojas: ['Horario', 'Alumnado'] });
            const { filas, alumnado, errores } = await parseWorkbook(buffer);
            expect(filas).toEqual([]);
            expect(alumnado).toEqual([]);
            expect(errores).toHaveLength(2);
            expect(errores.some(e => e.includes('Horario'))).toBe(true);
            expect(errores.some(e => e.includes('Alumnado'))).toBe(true);
        });
    });

    describe('generateTemplate — round-trip con parseWorkbook', () => {
        it('la plantilla generada se vuelve a parsear sin errores y con la fila de ejemplo esperada', async () => {
            const blob = await generateTemplate();
            const buffer = await blob.arrayBuffer();
            const { filas, alumnado, errores } = await parseWorkbook(buffer);

            expect(errores).toEqual([]);

            // Fila de ejemplo académica (Lunes) + la de "Guardia" (Martes, sin grupo).
            expect(filas).toContainEqual<FilaHorario>({
                dia: 0,
                hora_inicio: '08:15',
                hora_fin: '09:10',
                grupo: '1º ESO A',
                asignatura: 'Biología y Geología',
                aula: 'A16',
                ensenanza: '1º ESO',
            });
            expect(filas).toContainEqual<FilaHorario>({
                dia: 1,
                hora_inicio: '08:15',
                hora_fin: '09:10',
                grupo: null,
                asignatura: 'Guardia',
                aula: null,
                ensenanza: null,
            });

            expect(alumnado).toHaveLength(1);
            expect(alumnado[0]).toMatchObject({
                nivel: '1º ESO',
                materia: 'Biología y Geología',
                grupo: '1º ESO A',
                nombre: 'Elena',
                primerApellido: 'García',
            });
        });

        it('la hoja Configuración trae los mismos valores de ejemplo que usan Horario/Alumnado', async () => {
            const blob = await generateTemplate();
            const buffer = await blob.arrayBuffer();
            const { Workbook } = await import('exceljs');
            const wb = new Workbook();
            await wb.xlsx.load(buffer);
            const config = wb.getWorksheet('Configuración');
            expect(config).toBeDefined();
            expect(config!.getCell(2, 1).value).toBe('1º ESO'); // Niveles
            expect(config!.getCell(2, 2).value).toBe('Biología y Geología'); // Materias/actividades
            expect(config!.getCell(3, 2).value).toBe('Guardia');
            expect(config!.getCell(2, 3).value).toBe('1º ESO A'); // Grupos
            expect(config!.getCell(2, 4).value).toBe('A16'); // Aulas
        });
    });
});
