import { describe, it, expect } from 'vitest';
import { generateTemplate, parseWorkbook, defaultEvaluationPeriods } from './scheduleWizard';
import type { FilaHorario } from '../types';

const ALUMNADO_CABECERA = ['Nivel', 'Materia', 'Grupo', 'Nombre', 'Primer Apellido', 'Segundo Apellido', 'Fecha Nacimiento', 'DNI', 'ACNEAE'];

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const SUBCOLS_ORDEN_NORMAL = ['Nivel', 'Materia', 'Grupo', 'Aula'] as const;

// Cada hoja de datos empieza con una franja explicativa propia (fila 1 =
// banner, fila 2 = separador) — ver `PRIMERA_FILA_CONTENIDO` en
// scheduleWizard.ts. Los tests que construyen hojas a mano reproducen aquí
// el mismo desplazamiento, sin importar los valores del banner en sí
// (nunca se parsean).
const PRIMERA_FILA_CONTENIDO = 3;
const HORARIO_FILA_DIA = PRIMERA_FILA_CONTENIDO;
const HORARIO_FILA_SUBCOL = HORARIO_FILA_DIA + 1;
const HORARIO_FILA_DATOS_INICIO = HORARIO_FILA_SUBCOL + 1;
const ALUMNADO_FILA_CABECERA = PRIMERA_FILA_CONTENIDO;
const ALUMNADO_FILA_DATOS_INICIO = ALUMNADO_FILA_CABECERA + 1;
const CURSO_FILA_NOMBRE = PRIMERA_FILA_CONTENIDO;
const CURSO_FILA_INICIO = PRIMERA_FILA_CONTENIDO + 1;
const CURSO_FILA_FIN = PRIMERA_FILA_CONTENIDO + 2;
const FESTIVOS_FILA_INICIO = PRIMERA_FILA_CONTENIDO + 6; // 9
const FESTIVOS_FILAS = 20;
const EVALUACIONES_FILA_INICIO = FESTIVOS_FILA_INICIO + FESTIVOS_FILAS + 3; // 32

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

// Construye la hoja "Horario" con el layout de producción: banner+separador,
// cabeceras de día combinadas, subcabeceras Nivel/Materia/Grupo/Aula (en el
// orden dado, por defecto el normal — se puede pasar desordenado para
// probar que el parseo no depende de la posición).
function addHorarioSheet(wb: import('exceljs').Workbook, filas: FilaHorarioTest[], subcolsOrden: readonly string[] = SUBCOLS_ORDEN_NORMAL) {
    const sheet = wb.addWorksheet('Horario');
    sheet.getCell(HORARIO_FILA_DIA, 1).value = 'Hora';
    DIAS.forEach((dia, d) => {
        const colInicio = 2 + d * 4;
        sheet.mergeCells(HORARIO_FILA_DIA, colInicio, HORARIO_FILA_DIA, colInicio + 3);
        sheet.getCell(HORARIO_FILA_DIA, colInicio).value = dia;
        subcolsOrden.forEach((sub, i) => {
            sheet.getCell(HORARIO_FILA_SUBCOL, colInicio + i).value = sub;
        });
    });

    filas.forEach((fila, i) => {
        const r = HORARIO_FILA_DATOS_INICIO + i;
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
    const cabecera = opts?.cabecera ?? ALUMNADO_CABECERA;
    cabecera.forEach((v, i) => { sheet.getCell(ALUMNADO_FILA_CABECERA, i + 1).value = v; });
    opts?.filas?.forEach((fila, i) => {
        fila.forEach((v, c) => { if (v !== undefined) sheet.getCell(ALUMNADO_FILA_DATOS_INICIO + i, c + 1).value = v; });
    });
    return sheet;
}

interface DatosCursoAcademico {
    label?: string;
    startDate?: string;
    endDate?: string;
    holidays?: [string, string, string][]; // [nombre, inicio, fin]
    evaluationPeriods?: [string, string, string, string?][]; // [nombre, inicio, fin, peso?]
}

const CURSO_ACADEMICO_POR_DEFECTO: DatosCursoAcademico = { label: '2026-2027', startDate: '2026-09-09', endDate: '2027-06-23' };

// Layout real de "Curso Académico" (ver scheduleWizard.ts): B{CURSO_FILA_*}
// = nombre/inicio/fin, festivos y periodos de evaluación en los rangos de
// filas de arriba — se reproducen aquí, no se exportan como constantes
// solo para esto.
function addCursoAcademicoSheet(wb: import('exceljs').Workbook, datos: DatosCursoAcademico = {}) {
    const sheet = wb.addWorksheet('Curso Académico');
    if (datos.label !== undefined) sheet.getCell(CURSO_FILA_NOMBRE, 2).value = datos.label;
    if (datos.startDate !== undefined) sheet.getCell(CURSO_FILA_INICIO, 2).value = datos.startDate;
    if (datos.endDate !== undefined) sheet.getCell(CURSO_FILA_FIN, 2).value = datos.endDate;
    (datos.holidays ?? []).forEach(([nombre, inicio, fin], i) => {
        const r = FESTIVOS_FILA_INICIO + i;
        sheet.getCell(r, 1).value = nombre;
        sheet.getCell(r, 2).value = inicio;
        sheet.getCell(r, 3).value = fin;
    });
    (datos.evaluationPeriods ?? []).forEach(([nombre, inicio, fin, peso], i) => {
        const r = EVALUACIONES_FILA_INICIO + i;
        sheet.getCell(r, 1).value = nombre;
        sheet.getCell(r, 2).value = inicio;
        sheet.getCell(r, 3).value = fin;
        if (peso !== undefined) sheet.getCell(r, 4).value = peso;
    });
    return sheet;
}

// Construye un workbook mínimo con exceljs directamente (sin pasar por
// generateTemplate) para probar parseWorkbook con datos de control propios.
// Salvo que se omita explícitamente, las tres hojas se crean (Curso
// Académico con nombre/fechas válidos por defecto; Horario/Alumnado vacías
// si el test no les da contenido) para que un test centrado en una hoja no
// arrastre el error de "falta la otra"/"falta el curso académico".
async function buildWorkbook(opts: {
    horario?: FilaHorarioTest[];
    horarioSubcolsOrden?: readonly string[];
    alumnado?: { cabecera?: string[]; filas: (string | undefined)[][] };
    cursoAcademico?: DatosCursoAcademico;
    omitirHojas?: string[];
}): Promise<ArrayBuffer> {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();

    if (!opts.omitirHojas?.includes('Curso Académico')) {
        addCursoAcademicoSheet(wb, opts.cursoAcademico ?? CURSO_ACADEMICO_POR_DEFECTO);
    }
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
            sheet.getCell(HORARIO_FILA_DIA, 1).value = 'Hora';
            sheet.mergeCells(HORARIO_FILA_DIA, 2, HORARIO_FILA_DIA, 5);
            sheet.getCell(HORARIO_FILA_DIA, 2).value = 'Sábado'; // no es un día lectivo válido
            ['Nivel', 'Materia', 'Grupo', 'Aula'].forEach((sub, i) => { sheet.getCell(HORARIO_FILA_SUBCOL, 2 + i).value = sub; });
            addAlumnadoSheet(wb);
            const buffer = await wb.xlsx.writeBuffer() as unknown as ArrayBuffer;

            const { errores } = await parseWorkbook(buffer);
            expect(errores.some(e => e.includes('no se reconoce el día "Sábado"'))).toBe(true);
        });

        it('un bloque de día sin subcolumna "Materia" se reporta como error', async () => {
            const { Workbook } = await import('exceljs');
            const wb = new Workbook();
            const sheet = wb.addWorksheet('Horario');
            sheet.getCell(HORARIO_FILA_DIA, 1).value = 'Hora';
            sheet.mergeCells(HORARIO_FILA_DIA, 2, HORARIO_FILA_DIA, 5);
            sheet.getCell(HORARIO_FILA_DIA, 2).value = 'Lunes';
            ['Nivel', 'Grupo', 'Aula'].forEach((sub, i) => { sheet.getCell(HORARIO_FILA_SUBCOL, 2 + i).value = sub; }); // sin "Materia"
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
            const buffer = await buildWorkbook({ omitirHojas: ['Curso Académico', 'Horario', 'Alumnado'] });
            const { cursoAcademico, filas, alumnado, errores } = await parseWorkbook(buffer);
            expect(cursoAcademico).toBeNull();
            expect(filas).toEqual([]);
            expect(alumnado).toEqual([]);
            expect(errores).toHaveLength(3);
            expect(errores.some(e => e.includes('Curso Académico'))).toBe(true);
            expect(errores.some(e => e.includes('Horario'))).toBe(true);
            expect(errores.some(e => e.includes('Alumnado'))).toBe(true);
        });
    });

    describe('parseWorkbook — hoja Curso Académico', () => {
        it('parsea nombre/fechas válidos junto con festivos y periodos de evaluación', async () => {
            const buffer = await buildWorkbook({
                cursoAcademico: {
                    label: '2026-2027',
                    startDate: '2026-09-09',
                    endDate: '2027-06-23',
                    holidays: [['Navidad', '2026-12-23', '2027-01-08']],
                    evaluationPeriods: [
                        ['1ª Evaluación', '2026-09-09', '2026-12-01', '1'],
                        ['2ª Evaluación', '2026-12-02', '2027-03-01'], // sin peso -> por defecto 1
                    ],
                },
            });
            const { cursoAcademico, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(cursoAcademico).toEqual({
                label: '2026-2027',
                startDate: '2026-09-09',
                endDate: '2027-06-23',
                holidays: [{ nombre: 'Navidad', fechaInicio: '2026-12-23', fechaFin: '2027-01-08' }],
                evaluationPeriods: [
                    { nombre: '1ª Evaluación', fechaInicio: '2026-09-09', fechaFin: '2026-12-01', peso: 1 },
                    { nombre: '2ª Evaluación', fechaInicio: '2026-12-02', fechaFin: '2027-03-01', peso: 1 },
                ],
            });
        });

        it('devuelve null y bloquea si falta el nombre del curso', async () => {
            const buffer = await buildWorkbook({ cursoAcademico: { startDate: '2026-09-09', endDate: '2027-06-23' } });
            const { cursoAcademico, errores } = await parseWorkbook(buffer);
            expect(cursoAcademico).toBeNull();
            expect(errores.some(e => e.includes('falta el nombre del curso'))).toBe(true);
        });

        it('devuelve null y bloquea si una fecha no tiene forma AAAA-MM-DD', async () => {
            const buffer = await buildWorkbook({ cursoAcademico: { label: '2026-2027', startDate: '09/09/2026', endDate: '2027-06-23' } });
            const { cursoAcademico, errores } = await parseWorkbook(buffer);
            expect(cursoAcademico).toBeNull();
            expect(errores.some(e => /fecha de inicio inválida/.test(e))).toBe(true);
        });

        it('devuelve null y bloquea si la fecha de fin no es posterior a la de inicio', async () => {
            const buffer = await buildWorkbook({ cursoAcademico: { label: '2026-2027', startDate: '2027-06-23', endDate: '2026-09-09' } });
            const { cursoAcademico, errores } = await parseWorkbook(buffer);
            expect(cursoAcademico).toBeNull();
            expect(errores.some(e => /fecha de fin debe ser posterior/.test(e))).toBe(true);
        });

        it('rechaza una fecha de calendario inexistente (31 de abril)', async () => {
            const buffer = await buildWorkbook({ cursoAcademico: { label: '2026-2027', startDate: '2026-04-31', endDate: '2027-06-23' } });
            const { cursoAcademico, errores } = await parseWorkbook(buffer);
            expect(cursoAcademico).toBeNull();
            expect(errores.some(e => /fecha de inicio inválida/.test(e))).toBe(true);
        });

        it('ignora filas de festivos/periodos totalmente vacías, sin error', async () => {
            const buffer = await buildWorkbook({ cursoAcademico: CURSO_ACADEMICO_POR_DEFECTO });
            const { cursoAcademico, errores } = await parseWorkbook(buffer);
            expect(errores).toEqual([]);
            expect(cursoAcademico?.holidays).toEqual([]);
            expect(cursoAcademico?.evaluationPeriods).toEqual([]);
        });

        it('reporta como error una fila de festivo parcialmente rellena, sin abortar el resto', async () => {
            const buffer = await buildWorkbook({
                cursoAcademico: {
                    ...CURSO_ACADEMICO_POR_DEFECTO,
                    holidays: [['Festivo sin fechas', '', ''], ['Navidad', '2026-12-23', '2027-01-08']],
                },
            });
            const { cursoAcademico, errores } = await parseWorkbook(buffer);
            expect(errores).toHaveLength(1);
            expect(errores[0]).toMatch(/Festivos/);
            expect(cursoAcademico?.holidays).toEqual([{ nombre: 'Navidad', fechaInicio: '2026-12-23', fechaFin: '2027-01-08' }]);
        });
    });

    describe('defaultEvaluationPeriods', () => {
        it('reparte el curso en tercios por días naturales, igual que el backend', () => {
            const periodos = defaultEvaluationPeriods('2026-09-09', '2027-06-23');
            expect(periodos).toHaveLength(3);
            expect(periodos[0].fechaInicio).toBe('2026-09-09');
            expect(periodos[2].fechaFin).toBe('2027-06-23');
            // Cada periodo empieza justo al día siguiente de que acabe el anterior.
            expect(periodos[1].fechaInicio > periodos[0].fechaFin).toBe(true);
            expect(periodos[2].fechaInicio > periodos[1].fechaFin).toBe(true);
            periodos.forEach(p => expect(p.peso).toBe(1));
        });

        it('división entera de días (caso borde de redondeo) no deja huecos ni solapes', () => {
            // 10 días totales -> tercio = 3 (floor(10/3)) -> p1: 3 días, p2: 3 días, p3: se lleva el resto (4 días)
            const periodos = defaultEvaluationPeriods('2026-01-01', '2026-01-11');
            expect(periodos[0]).toEqual({ nombre: '1ª Evaluación', fechaInicio: '2026-01-01', fechaFin: '2026-01-04', peso: 1 });
            expect(periodos[1]).toEqual({ nombre: '2ª Evaluación', fechaInicio: '2026-01-05', fechaFin: '2026-01-07', peso: 1 });
            expect(periodos[2]).toEqual({ nombre: '3ª Evaluación', fechaInicio: '2026-01-08', fechaFin: '2026-01-11', peso: 1 });
        });
    });

    describe('generateTemplate — round-trip con parseWorkbook', () => {
        it('la plantilla generada se vuelve a parsear sin errores y con la fila de ejemplo esperada', async () => {
            const blob = await generateTemplate({ label: '2026-2027', startDate: '2026-09-09', endDate: '2027-06-23' });
            const buffer = await blob.arrayBuffer();
            const { cursoAcademico, filas, alumnado, errores } = await parseWorkbook(buffer);

            expect(errores).toEqual([]);
            expect(cursoAcademico?.label).toBe('2026-2027');
            expect(cursoAcademico?.startDate).toBe('2026-09-09');
            expect(cursoAcademico?.endDate).toBe('2027-06-23');
            // Los 3 periodos por defecto vienen ya prellenados en la plantilla.
            expect(cursoAcademico?.evaluationPeriods).toEqual(defaultEvaluationPeriods('2026-09-09', '2027-06-23'));
            expect(cursoAcademico?.holidays).toEqual([]);

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
            const filaDatos = PRIMERA_FILA_CONTENIDO + 1;
            expect(config!.getCell(filaDatos, 1).value).toBe('1º ESO'); // Niveles
            expect(config!.getCell(filaDatos, 2).value).toBe('Biología y Geología'); // Materias/actividades
            expect(config!.getCell(filaDatos + 1, 2).value).toBe('Guardia');
            expect(config!.getCell(filaDatos, 3).value).toBe('1º ESO A'); // Grupos
            expect(config!.getCell(filaDatos, 4).value).toBe('A16'); // Aulas
        });

        it('cada hoja de datos trae su propia franja explicativa (banner) en la fila 1', async () => {
            const blob = await generateTemplate({ label: '2026-2027', startDate: '2026-09-09', endDate: '2027-06-23' });
            const buffer = await blob.arrayBuffer();
            const { Workbook } = await import('exceljs');
            const wb = new Workbook();
            await wb.xlsx.load(buffer);

            for (const nombreHoja of ['Curso Académico', 'Configuración', 'Horario', 'Alumnado']) {
                const sheet = wb.getWorksheet(nombreHoja);
                expect(sheet, `hoja "${nombreHoja}"`).toBeDefined();
                const valor = sheet!.getCell(1, 1).value;
                expect(valor, `banner de "${nombreHoja}"`).not.toBeNull();
                // richText: primer "run" es el título en negrita con icono.
                const texto = typeof valor === 'object' && valor !== null && 'richText' in valor
                    ? (valor as { richText: { text: string }[] }).richText.map(r => r.text).join('')
                    : String(valor);
                expect(texto.length, `banner de "${nombreHoja}" no debería estar vacío`).toBeGreaterThan(10);
            }
        });
    });
});
