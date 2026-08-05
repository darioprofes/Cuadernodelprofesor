// Asistente de inicio de curso: genera y parsea una plantilla Excel de 3
// hojas (Instrucciones / Horario / Alumnado) para dar de alta de una vez
// materias, clases, horario y alumnado. Funciones puras, sin React ni
// backend — igual en web y en escritorio (exceljs trabaja enteramente en
// memoria vía ArrayBuffer/Blob, sin acceso a filesystem de Node).
//
// El formato "grid" de la hoja Horario (horas en filas, días en columnas,
// celdas de 1-3 líneas) reutiliza la misma semántica que ya tenía la
// plantilla CSV "grid" del sistema anterior a CuadernMestre (ver
// services/horario.py del backup profe.bak-20260724-123414), pero sin la
// complejidad de _agrupar_bloques_periodo/_combinar_columna de esa versión:
// esas funciones existían para reconstruir filas partidas por pegar una
// tabla de Word en un CSV, un problema que no se da en un .xlsx real
// rellenado directamente en Excel (cada fila ya trae su hora y sus días en
// las celdas correctas, sin artefactos de pegado).

import type { FilaHorario } from '../types';

export interface FilaAlumnado {
    nivel: string;
    materia: string;
    grupo: string;
    nombre: string;
    primerApellido: string;
    segundoApellido: string;
    fechaNacimiento: string | null;
    dni: string | null;
    acneae: string[];
}

export interface ParsedWorkbook {
    filas: FilaHorario[];
    alumnado: FilaAlumnado[];
    errores: string[];
}

const HOJA_HORARIO = 'Horario';
const HOJA_ALUMNADO = 'Alumnado';
const HOJA_INSTRUCCIONES = 'Instrucciones';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const DIAS_NOMBRE: Record<string, number> = {
    lunes: 0,
    martes: 1,
    miercoles: 2,
    jueves: 3,
    viernes: 4,
};

const sinAcentos = (texto: string): string =>
    texto.normalize('NFKD').replace(/[̀-ͯ]/g, '');

const normalizarDia = (texto: string): number | null => {
    const clave = sinAcentos(texto.trim().toLowerCase());
    return clave in DIAS_NOMBRE ? DIAS_NOMBRE[clave] : null;
};

const HORA_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const parsearHora = (texto: string): string | null => {
    const limpio = texto.trim();
    const m = HORA_RE.exec(limpio);
    if (!m) return null;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
};

// Acepta guion normal, guion medio/largo o signo menos como separador entre
// las dos horas de una franja — igual criterio que ya usaba la importación
// PDF (services/horario_pdf.py) para el mismo problema.
const parsearRangoHoras = (texto: string): [string, string] | null => {
    const partes = texto.trim().split(/\s*[-‐-―−]\s*/);
    if (partes.length !== 2) return null;
    const inicio = parsearHora(partes[0]);
    const fin = parsearHora(partes[1]);
    if (!inicio || !fin) return null;
    return [inicio, fin];
};

const lineasDeCelda = (valor: unknown): string[] => {
    if (valor === null || valor === undefined) return [];
    const texto = typeof valor === 'string' ? valor : String(valor);
    return texto
        .split(/\r\n|\n|\r/)
        .map(l => l.trim())
        .filter(l => l.length > 0);
};

const celdaTexto = (valor: unknown): string => {
    if (valor === null || valor === undefined) return '';
    return String(valor).trim();
};

// ==========================================================
// Generación de la plantilla
// ==========================================================

export async function generateTemplate(): Promise<Blob> {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    wb.creator = 'Cuaderno Docente';
    wb.created = new Date();

    buildInstruccionesSheet(wb);
    buildHorarioSheet(wb);
    buildAlumnadoSheet(wb);

    const buffer = await wb.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function buildInstruccionesSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_INSTRUCCIONES);
    sheet.getColumn(1).width = 100;

    const parrafos = [
        'Asistente de inicio de curso',
        '',
        'Rellena las hojas "Horario" y "Alumnado" de este libro y súbelo desde Ajustes → Curso Académico → "Importar datos del curso". Antes de aplicar nada, la app te enseña un resumen de lo que va a crear para que lo confirmes.',
        '',
        'Hoja "Horario":',
        '- Cada fila es una franja horaria (p.ej. "08:15 - 09:10"); cada columna, un día de la semana.',
        '- Cada celda admite hasta 3 líneas (Alt+Intro dentro de la celda en Excel para pasar de línea):',
        '   · 1 línea → una actividad suelta, sin grupo ni aula (p.ej. "Guardia").',
        '   · 2 líneas → actividad + aula, sin grupo (p.ej. "Reunión de departamento" / "A12").',
        '   · 3 líneas → "Nivel - Materia" / Grupo / Aula (p.ej. "1º ESO - Biología y Geología" / "1º ESO A" / "A16"). Es la única forma que crea una clase académica real, con alumnado y calificaciones.',
        '- Deja una celda vacía si esa franja está libre ese día.',
        '',
        'Hoja "Alumnado":',
        '- Una fila por alumno/a.',
        '- Las columnas "Nivel", "Materia" y "Grupo" deben escribirse EXACTAMENTE igual que en la hoja "Horario" (misma clase) — si no coinciden con ninguna clase de esa hoja, esa fila da error y no se importa.',
        '- "Fecha Nacimiento" (AAAA-MM-DD), "DNI" y "ACNEAE" son opcionales. El resto de la ficha (tutores, domicilio, datos sanitarios...) se rellena después desde la propia app.',
        '',
        'No borres la fila de cabecera de ninguna hoja. Esta hoja de instrucciones no se procesa al importar.',
    ];

    parrafos.forEach((texto, i) => {
        const row = sheet.getRow(i + 1);
        row.getCell(1).value = texto;
        row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
        if (i === 0) {
            row.getCell(1).font = { bold: true, size: 14 };
        } else if (/^Hoja "/.test(texto)) {
            row.getCell(1).font = { bold: true };
        }
    });
}

function buildHorarioSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_HORARIO);
    const header = sheet.getRow(1);
    header.getCell(1).value = 'Hora';
    DIAS_SEMANA.forEach((dia, i) => {
        header.getCell(i + 2).value = dia;
    });
    header.font = { bold: true };
    sheet.getColumn(1).width = 18;
    DIAS_SEMANA.forEach((_, i) => {
        sheet.getColumn(i + 2).width = 28;
    });

    const filaEjemplo = sheet.getRow(2);
    filaEjemplo.getCell(1).value = '08:15 - 09:10';
    filaEjemplo.getCell(2).value = '1º ESO - Biología y Geología\n1º ESO A\nA16';
    filaEjemplo.getCell(4).value = 'Guardia';

    const filaRecreo = sheet.getRow(3);
    filaRecreo.getCell(1).value = '11:00 - 11:30';

    for (let r = 2; r <= 3; r++) {
        for (let c = 1; c <= DIAS_SEMANA.length + 1; c++) {
            sheet.getRow(r).getCell(c).alignment = { wrapText: true, vertical: 'top' };
        }
    }
}

function buildAlumnadoSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_ALUMNADO);
    const columnas = ['Nivel', 'Materia', 'Grupo', 'Nombre', 'Primer Apellido', 'Segundo Apellido', 'Fecha Nacimiento', 'DNI', 'ACNEAE'];
    const header = sheet.getRow(1);
    columnas.forEach((c, i) => {
        header.getCell(i + 1).value = c;
        sheet.getColumn(i + 1).width = 20;
    });
    header.font = { bold: true };

    const ejemplo = sheet.getRow(2);
    ['1º ESO', 'Biología y Geología', '1º ESO A', 'Elena', 'García', 'López', '2012-03-15', '', ''].forEach((v, i) => {
        ejemplo.getCell(i + 1).value = v;
    });
}

// ==========================================================
// Parseo de un workbook subido
// ==========================================================

export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParsedWorkbook> {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load(buffer);

    const errores: string[] = [];

    const hojaHorario = wb.getWorksheet(HOJA_HORARIO);
    const hojaAlumnado = wb.getWorksheet(HOJA_ALUMNADO);

    if (!hojaHorario) errores.push(`No se encuentra la hoja "${HOJA_HORARIO}".`);
    if (!hojaAlumnado) errores.push(`No se encuentra la hoja "${HOJA_ALUMNADO}".`);

    const filas = hojaHorario ? parseHorarioSheet(hojaHorario, errores) : [];
    const alumnado = hojaAlumnado ? parseAlumnadoSheet(hojaAlumnado, errores) : [];

    return { filas, alumnado, errores };
}

function parseHorarioSheet(sheet: import('exceljs').Worksheet, errores: string[]): FilaHorario[] {
    const header = sheet.getRow(1);
    const columnasDia = new Map<number, number>(); // índice de columna -> día (0-4)
    header.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (colNumber === 1) return; // "Hora"
        const dia = normalizarDia(celdaTexto(cell.value));
        if (dia !== null) columnasDia.set(colNumber, dia);
    });

    if (columnasDia.size === 0) {
        errores.push(`Hoja "${HOJA_HORARIO}": no se reconoce ningún día en la cabecera.`);
        return [];
    }

    const filas: FilaHorario[] = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const horaTexto = celdaTexto(row.getCell(1).value);

        const hayContenidoEnAlgunDia = Array.from(columnasDia.keys()).some(c => lineasDeCelda(row.getCell(c).value).length > 0);

        if (!horaTexto) {
            if (hayContenidoEnAlgunDia) {
                errores.push(`Fila ${r} (Horario): falta la hora de la franja.`);
            }
            continue;
        }

        const rango = parsearRangoHoras(horaTexto);
        if (!rango) {
            errores.push(`Fila ${r} (Horario): rango de horas inválido: "${horaTexto}" (usa HH:MM - HH:MM).`);
            continue;
        }
        const [horaInicio, horaFin] = rango;

        for (const [col, dia] of columnasDia) {
            const lineas = lineasDeCelda(row.getCell(col).value);
            if (lineas.length === 0) continue;

            let asignatura: string;
            let grupo: string | null = null;
            let aula: string | null = null;
            let ensenanza: string | null = null;

            if (lineas.length === 1) {
                asignatura = lineas[0];
            } else if (lineas.length === 2) {
                asignatura = lineas[0];
                aula = lineas[1];
            } else {
                const separador = lineas[0].indexOf(' - ');
                if (separador === -1) {
                    asignatura = lineas[0];
                } else {
                    ensenanza = lineas[0].slice(0, separador).trim();
                    asignatura = lineas[0].slice(separador + 3).trim();
                }
                grupo = lineas[1];
                aula = lineas[2] || null;
            }

            filas.push({ dia, hora_inicio: horaInicio, hora_fin: horaFin, grupo, asignatura, aula, ensenanza });
        }
    }

    return filas;
}

const CAMPOS_ALUMNADO = ['nivel', 'materia', 'grupo', 'nombre', 'primerapellido', 'segundoapellido', 'fechanacimiento', 'dni', 'acneae'] as const;

function parseAlumnadoSheet(sheet: import('exceljs').Worksheet, errores: string[]): FilaAlumnado[] {
    const header = sheet.getRow(1);
    const indices = new Map<string, number>();
    header.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const clave = sinAcentos(celdaTexto(cell.value).toLowerCase()).replace(/\s+/g, '');
        if ((CAMPOS_ALUMNADO as readonly string[]).includes(clave)) {
            indices.set(clave, colNumber);
        }
    });

    const obligatorias = ['nivel', 'materia', 'grupo', 'nombre', 'primerapellido'];
    const faltan = obligatorias.filter(c => !indices.has(c));
    if (faltan.length > 0) {
        errores.push(`Hoja "${HOJA_ALUMNADO}": faltan columnas obligatorias: ${faltan.join(', ')}.`);
        return [];
    }

    const valor = (row: import('exceljs').Row, campo: string): string => {
        const idx = indices.get(campo);
        return idx ? celdaTexto(row.getCell(idx).value) : '';
    };

    const alumnado: FilaAlumnado[] = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const fila = CAMPOS_ALUMNADO.map(c => valor(row, c));
        if (fila.every(v => !v)) continue; // fila totalmente vacía

        const nivel = valor(row, 'nivel');
        const materia = valor(row, 'materia');
        const grupo = valor(row, 'grupo');
        const nombre = valor(row, 'nombre');
        const primerApellido = valor(row, 'primerapellido');

        if (!nivel || !materia || !grupo) {
            errores.push(`Fila ${r} (Alumnado): faltan Nivel/Materia/Grupo — no se puede resolver la clase.`);
            continue;
        }
        if (!nombre || !primerApellido) {
            errores.push(`Fila ${r} (Alumnado): faltan Nombre/Primer Apellido.`);
            continue;
        }

        const acneaeTexto = valor(row, 'acneae');

        alumnado.push({
            nivel,
            materia,
            grupo,
            nombre,
            primerApellido,
            segundoApellido: valor(row, 'segundoapellido'),
            fechaNacimiento: valor(row, 'fechanacimiento') || null,
            dni: valor(row, 'dni') || null,
            acneae: acneaeTexto ? acneaeTexto.split(',').map(s => s.trim()).filter(Boolean) : [],
        });
    }

    return alumnado;
}
