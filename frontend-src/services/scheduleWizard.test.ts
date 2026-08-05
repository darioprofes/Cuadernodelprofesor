import { describe, it, expect } from 'vitest';
import { generateTemplate, parseWorkbook } from './scheduleWizard';
import type { FilaHorario } from '../types';

const HORARIO_CABECERA = ['Hora', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const ALUMNADO_CABECERA = ['Nivel', 'Materia', 'Grupo', 'Nombre', 'Primer Apellido', 'Segundo Apellido', 'Fecha Nacimiento', 'DNI', 'ACNEAE'];

// Construye un workbook mínimo con exceljs directamente (sin pasar por
// generateTemplate) para probar parseWorkbook con datos de control propios,
// no solo con la plantilla de ejemplo.
async function buildWorkbook(opts: {
    horario?: { cabecera: string[]; filas: (string | undefined)[][] };
    alumnado?: { cabecera: string[]; filas: (string | undefined)[][] };
    omitirHojas?: string[];
}): Promise<ArrayBuffer> {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();

    // Salvo que la hoja se omita explícitamente (para probar el caso de
    // "hoja ausente"), siempre se crea — vacía (solo cabecera) si el test
    // no le da contenido propio — para que un test centrado en Horario no
    // arrastre un error de "falta Alumnado" y viceversa.
    if (!opts.omitirHojas?.includes('Horario')) {
        const sheet = wb.addWorksheet('Horario');
        sheet.addRow(opts.horario?.cabecera ?? HORARIO_CABECERA);
        opts.horario?.filas.forEach(fila => sheet.addRow(fila));
    }
    if (!opts.omitirHojas?.includes('Alumnado')) {
        const sheet = wb.addWorksheet('Alumnado');
        sheet.addRow(opts.alumnado?.cabecera ?? ALUMNADO_CABECERA);
        opts.alumnado?.filas.forEach(fila => sheet.addRow(fila));
    }

    return wb.xlsx.writeBuffer() as unknown as Promise<ArrayBuffer>;
}

describe('scheduleWizard', () => {
    describe('parseWorkbook — hoja Horario', () => {
        it('parsea una celda de 3 líneas como clase académica (Nivel - Materia / Grupo / Aula)', async () => {
            const buffer = await buildWorkbook({
                horario: {
                    cabecera: HORARIO_CABECERA,
                    filas: [
                        ['08:15 - 09:10', '1º ESO - Biología y Geología\n1º ESO A\nA16'],
                    ],
                },
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(filas).toHaveLength(1);
            expect(filas[0]).toEqual<FilaHorario>({
                dia: 0,
                hora_inicio: '08:15',
                hora_fin: '09:10',
                grupo: '1º ESO A',
                asignatura: 'Biología y Geología',
                aula: 'A16',
                ensenanza: '1º ESO',
            });
        });

        it('parsea una celda de 2 líneas como actividad + aula, sin grupo', async () => {
            const buffer = await buildWorkbook({
                horario: {
                    cabecera: HORARIO_CABECERA,
                    filas: [
                        ['08:15 - 09:10', 'Reunión de departamento\nA12'],
                    ],
                },
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(filas).toEqual<FilaHorario[]>([
                { dia: 0, hora_inicio: '08:15', hora_fin: '09:10', grupo: null, asignatura: 'Reunión de departamento', aula: 'A12', ensenanza: null },
            ]);
        });

        it('parsea una celda de 1 línea como actividad suelta, sin grupo ni aula', async () => {
            const buffer = await buildWorkbook({
                horario: {
                    cabecera: HORARIO_CABECERA,
                    filas: [
                        ['08:15 - 09:10', 'Guardia'],
                    ],
                },
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(filas).toEqual<FilaHorario[]>([
                { dia: 0, hora_inicio: '08:15', hora_fin: '09:10', grupo: null, asignatura: 'Guardia', aula: null, ensenanza: null },
            ]);
        });

        it('ignora celdas vacías (franja libre) sin generar fila ni error', async () => {
            const buffer = await buildWorkbook({
                horario: {
                    cabecera: HORARIO_CABECERA,
                    filas: [
                        ['11:00 - 11:30', undefined, undefined, undefined, undefined, undefined],
                    ],
                },
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(filas).toEqual([]);
            expect(errores).toEqual([]);
        });

        it('reporta un rango de horas inválido como error de fila, sin abortar el resto', async () => {
            const buffer = await buildWorkbook({
                horario: {
                    cabecera: HORARIO_CABECERA,
                    filas: [
                        ['no-es-una-hora', 'Guardia'],
                        ['09:10 - 10:05', 'Matemáticas'],
                    ],
                },
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(errores).toHaveLength(1);
            expect(errores[0]).toMatch(/rango de horas inválido/i);
            expect(filas).toHaveLength(1);
            expect(filas[0].asignatura).toBe('Matemáticas');
        });

        it('trata "Nivel Materia" sin separador " - " como materia sin nivel (buildImportPlan cae al grupo)', async () => {
            const buffer = await buildWorkbook({
                horario: {
                    cabecera: HORARIO_CABECERA,
                    filas: [
                        ['08:15 - 09:10', 'Biología y Geología\n1º ESO A\nA16'],
                    ],
                },
            });
            const { filas, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(filas[0].ensenanza).toBeNull();
            expect(filas[0].asignatura).toBe('Biología y Geología');
            expect(filas[0].grupo).toBe('1º ESO A');
        });
    });

    describe('parseWorkbook — hoja Alumnado', () => {
        it('parsea una fila válida completa', async () => {
            const buffer = await buildWorkbook({
                alumnado: {
                    cabecera: ALUMNADO_CABECERA,
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
                    cabecera: ALUMNADO_CABECERA,
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
                    cabecera: ALUMNADO_CABECERA,
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
                    cabecera: ALUMNADO_CABECERA,
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
                    cabecera: ALUMNADO_CABECERA,
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

            // Fila de ejemplo académica (3 líneas) + la de "Guardia" (1 línea).
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
                dia: 2,
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
    });
});
