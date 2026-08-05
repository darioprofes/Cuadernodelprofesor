// Asistente de inicio de curso: genera y parsea una plantilla Excel de 4
// hojas (Instrucciones / Configuración / Horario / Alumnado) para dar de
// alta de una vez materias, clases, horario y alumnado. Funciones puras,
// sin React ni backend — igual en web y en escritorio (exceljs trabaja
// enteramente en memoria vía ArrayBuffer/Blob, sin acceso a filesystem de
// Node).
//
// v2 (2026-08-05): la hoja Horario pasó de "una celda con hasta 3 líneas
// separadas por Alt+Intro" (v1, ver git log de este fichero) a columnas
// propias por día con desplegables — Excel no permite validaciones de
// datos distintas dentro de una misma celda combinada, así que combinar
// celdas (para el nombre de cada día) y tener desplegables (para Nivel/
// Materia/Grupo/Aula) obliga a repartir esos datos en columnas separadas.
// La hoja Configuración nueva es la fuente de esos desplegables: el
// profesor declara una vez qué niveles/materias/grupos/aulas usa, y el
// resto del libro tira de esas listas en vez de tenerlas que teclear a
// mano en cada franja (motivo real: en la verificación de la v1 una fila
// de Alumnado no resolvió a ninguna clase por una errata de tecleo).

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

const HOJA_INSTRUCCIONES = 'Instrucciones';
const HOJA_CONFIGURACION = 'Configuración';
const HOJA_HORARIO = 'Horario';
const HOJA_ALUMNADO = 'Alumnado';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const DIAS_NOMBRE: Record<string, number> = {
    lunes: 0,
    martes: 1,
    miercoles: 2,
    jueves: 3,
    viernes: 4,
};

// Columnas de la hoja Configuración — cada una alimenta un desplegable en
// Horario/Alumnado. "Materia" incluye a propósito tanto materias reales
// como "otras ocupaciones" (guardias, reuniones...): la app ya no
// distingue "materia" de "actividad" a nivel de dato (`asignatura` sirve
// para ambas, `esAcademica` se decide por si hay Grupo, no por qué lista
// viene) — separarlas en dos listas obligaría a una validación de lista
// que fuera la unión de dos rangos, que Excel no soporta bien.
const CONFIG_COL_NIVEL = 1;
const CONFIG_COL_MATERIA = 2;
const CONFIG_COL_GRUPO = 3;
const CONFIG_COL_AULA = 4;
const CONFIG_FILAS = 40; // filas de datos por lista (2..41)

const SUBCOLUMNAS_DIA = ['Nivel', 'Materia', 'Grupo', 'Aula'] as const;
const COLS_POR_DIA = SUBCOLUMNAS_DIA.length;

const COLOR_CABECERA = 'FF2563EB'; // Tailwind blue-600, mismo azul que los botones primarios de la app

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

const celdaTexto = (valor: unknown): string => {
    if (valor === null || valor === undefined) return '';
    return String(valor).trim();
};

// Rango de una columna de Configuración, para usar como fuente de un
// desplegable en otra hoja (formulae de dataValidation no lleva "=").
const configRange = (col: number): string => {
    const letra = String.fromCharCode(64 + col); // 1 -> 'A', 2 -> 'B'...
    return `${HOJA_CONFIGURACION}!$${letra}$2:$${letra}$${CONFIG_FILAS + 1}`;
};

// Desplegable "flexible" (decisión explícita del usuario): sugiere desde
// la lista de Configuración pero no bloquea si se escribe un valor no
// listado — para una actividad puntual que no compensa predeclarar.
const setListValidation = (cell: import('exceljs').Cell, rangeRef: string) => {
    cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [rangeRef],
        showErrorMessage: false,
    };
};

const colInicioDia = (diaIndex: number): number => 2 + diaIndex * COLS_POR_DIA;

// ==========================================================
// Generación de la plantilla
// ==========================================================

export async function generateTemplate(): Promise<Blob> {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    wb.creator = 'Cuaderno Docente';
    wb.created = new Date();

    buildInstruccionesSheet(wb);
    buildConfiguracionSheet(wb);
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
        'Rellena las hojas de este libro EN ORDEN — "Configuración" primero, para que los desplegables de las demás hojas tengan algo que ofrecer — y súbelo desde Ajustes → Curso Académico → "Importar datos del curso". Antes de aplicar nada, la app te enseña un resumen de lo que va a crear para que lo confirmes.',
        '',
        'Hoja "Configuración":',
        '- 4 listas simples, una por columna: Niveles que impartes, Materias/actividades que impartes (incluye guardias, reuniones... no solo materias con alumnado), Grupos a los que das clase, Aulas habituales.',
        '- Un valor por fila. Estas listas alimentan los desplegables de "Horario" y "Alumnado".',
        '',
        'Hoja "Horario":',
        '- Cada fila es una franja horaria (p.ej. "08:15 - 09:10"); cada día tiene sus propias columnas: Nivel, Materia, Grupo, Aula.',
        '- Nivel/Materia/Grupo/Aula tienen desplegable (sugiere desde "Configuración", pero puedes escribir otra cosa si hace falta).',
        '- Solo Materia es obligatoria para que esa franja cuente ese día. Si además rellenas Grupo, se crea una clase académica real (con alumnado y calificaciones); si dejas Grupo vacío, se trata como una "otra ocupación" (guardia, reunión...) sin alumnado.',
        '- Deja Materia vacía si esa franja está libre ese día.',
        '',
        'Hoja "Alumnado":',
        '- Una fila por alumno/a.',
        '- Nivel/Materia/Grupo (con el mismo desplegable) deben coincidir con una clase de la hoja "Horario" — si no coinciden con ninguna, esa fila da error y no se importa.',
        '- "Fecha Nacimiento" (AAAA-MM-DD), "DNI" y "ACNEAE" son opcionales. El resto de la ficha (tutores, domicilio, datos sanitarios...) se rellena después desde la propia app.',
        '',
        'No borres ninguna fila de cabecera. Esta hoja de instrucciones no se procesa al importar.',
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

function buildConfiguracionSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_CONFIGURACION);

    const columnas: { header: string; ejemplo: string; ejemplo2?: string }[] = [
        { header: 'Niveles que impartes', ejemplo: '1º ESO' },
        { header: 'Materias / actividades que impartes', ejemplo: 'Biología y Geología', ejemplo2: 'Guardia' },
        { header: 'Grupos a los que das clase', ejemplo: '1º ESO A' },
        { header: 'Aulas habituales', ejemplo: 'A16' },
    ];

    columnas.forEach((c, i) => {
        const col = i + 1;
        sheet.getColumn(col).width = 32;
        const headerCell = sheet.getCell(1, col);
        headerCell.value = c.header;
        estilizarCabecera(headerCell);
        headerCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
        sheet.getCell(2, col).value = c.ejemplo;
        if (c.ejemplo2) sheet.getCell(3, col).value = c.ejemplo2;
    });

    sheet.getRow(1).height = 32;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function estilizarCabecera(cell: import('exceljs').Cell) {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CABECERA } };
}

const FILAS_HORARIO = 15;
const PRIMERA_FILA_DATOS_HORARIO = 3;

function buildHorarioSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_HORARIO);

    // "Hora" combinada verticalmente (sin subcolumnas propias).
    sheet.mergeCells(1, 1, 2, 1);
    const horaHeader = sheet.getCell(1, 1);
    horaHeader.value = 'Hora';
    horaHeader.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getColumn(1).width = 18;

    DIAS_SEMANA.forEach((dia, d) => {
        const colInicio = colInicioDia(d);
        const colFin = colInicio + COLS_POR_DIA - 1;

        // Nombre del día en una celda combinada que abarca sus 4 subcolumnas.
        sheet.mergeCells(1, colInicio, 1, colFin);
        const diaCell = sheet.getCell(1, colInicio);
        diaCell.value = dia;
        diaCell.alignment = { vertical: 'middle', horizontal: 'center' };

        SUBCOLUMNAS_DIA.forEach((sub, i) => {
            const col = colInicio + i;
            const subCell = sheet.getCell(2, col);
            subCell.value = sub;
            subCell.alignment = { vertical: 'middle', horizontal: 'center' };
            sheet.getColumn(col).width = sub === 'Materia' ? 26 : 14;
        });
    });

    const ultimaColumna = colInicioDia(DIAS_SEMANA.length - 1) + COLS_POR_DIA - 1;
    for (let r = 1; r <= 2; r++) {
        for (let c = 1; c <= ultimaColumna; c++) {
            estilizarCabecera(sheet.getCell(r, c));
        }
    }
    sheet.getRow(1).height = 22;
    sheet.getRow(2).height = 20;

    // Cabecera (2 filas) y columna Hora siempre visibles al bajar por la tabla.
    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

    const filaFinDatos = PRIMERA_FILA_DATOS_HORARIO + FILAS_HORARIO - 1;
    for (let r = PRIMERA_FILA_DATOS_HORARIO; r <= filaFinDatos; r++) {
        // Validación de formato de hora — de AVISO, no bloqueante: una
        // comprobación estricta por fórmula de Excel es frágil con horas de
        // 1-2 dígitos y distintos tipos de guion, así que solo se
        // comprueba que haya ":" y "-" en algún sitio; la validación de
        // verdad la hace parseHorarioSheet() al subir el fichero.
        sheet.getCell(r, 1).dataValidation = {
            type: 'custom',
            allowBlank: true,
            formulae: [`AND(ISNUMBER(SEARCH(":",A${r})),ISNUMBER(SEARCH("-",A${r})))`],
            showErrorMessage: true,
            errorStyle: 'warning',
            errorTitle: 'Formato de hora',
            error: 'Se esperaba algo como "08:15 - 09:10". Puedes continuar igualmente.',
        };

        DIAS_SEMANA.forEach((_, d) => {
            const colInicio = colInicioDia(d);
            setListValidation(sheet.getCell(r, colInicio + 0), configRange(CONFIG_COL_NIVEL));
            setListValidation(sheet.getCell(r, colInicio + 1), configRange(CONFIG_COL_MATERIA));
            setListValidation(sheet.getCell(r, colInicio + 2), configRange(CONFIG_COL_GRUPO));
            setListValidation(sheet.getCell(r, colInicio + 3), configRange(CONFIG_COL_AULA));
        });
    }

    // Fila de ejemplo, coherente con los ejemplos ya sembrados en
    // Configuración (para que los desplegables muestren algo válido nada
    // más abrir la plantilla): una clase académica real el lunes, y una
    // "otra ocupación" (sin grupo) el martes.
    sheet.getCell(PRIMERA_FILA_DATOS_HORARIO, 1).value = '08:15 - 09:10';
    const lunesInicio = colInicioDia(0);
    sheet.getCell(PRIMERA_FILA_DATOS_HORARIO, lunesInicio + 0).value = '1º ESO';
    sheet.getCell(PRIMERA_FILA_DATOS_HORARIO, lunesInicio + 1).value = 'Biología y Geología';
    sheet.getCell(PRIMERA_FILA_DATOS_HORARIO, lunesInicio + 2).value = '1º ESO A';
    sheet.getCell(PRIMERA_FILA_DATOS_HORARIO, lunesInicio + 3).value = 'A16';
    const martesInicio = colInicioDia(1);
    sheet.getCell(PRIMERA_FILA_DATOS_HORARIO, martesInicio + 1).value = 'Guardia';
}

const FILAS_ALUMNADO = 60;

function buildAlumnadoSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_ALUMNADO);
    const columnas = ['Nivel', 'Materia', 'Grupo', 'Nombre', 'Primer Apellido', 'Segundo Apellido', 'Fecha Nacimiento', 'DNI', 'ACNEAE'];
    columnas.forEach((c, i) => {
        const col = i + 1;
        const headerCell = sheet.getCell(1, col);
        headerCell.value = c;
        estilizarCabecera(headerCell);
        sheet.getColumn(col).width = 20;
    });
    sheet.getRow(1).height = 20;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const ejemplo = sheet.getRow(2);
    ['1º ESO', 'Biología y Geología', '1º ESO A', 'Elena', 'García', 'López', '2012-03-15', '', ''].forEach((v, i) => {
        ejemplo.getCell(i + 1).value = v;
    });

    for (let r = 2; r <= FILAS_ALUMNADO + 1; r++) {
        setListValidation(sheet.getCell(r, 1), configRange(CONFIG_COL_NIVEL));
        setListValidation(sheet.getCell(r, 2), configRange(CONFIG_COL_MATERIA));
        setListValidation(sheet.getCell(r, 3), configRange(CONFIG_COL_GRUPO));
    }
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

interface BloqueDia {
    dia: number;
    colInicio: number;
    colFin: number;
}

// Cada celda no vacía de la fila 1 marca el inicio de un bloque de día (su
// valor, normalizado); el bloque se extiende hasta la siguiente celda no
// vacía de esa fila (o el final de las columnas usadas). OJO: al leer una
// celda combinada, exceljs devuelve el mismo valor en TODAS las celdas del
// rango (no solo en la superior-izquierda) — `cell.isMerged` es cierto
// tanto para la maestra como para sus "espejos", así que no sirve para
// distinguirlas; el tipo de celda sí: los espejos tienen
// `type === ValueType.Merge` (1), la maestra conserva su tipo real.
function detectarBloquesDia(sheet: import('exceljs').Worksheet, errores: string[]): BloqueDia[] {
    const row1 = sheet.getRow(1);
    const marcas: { col: number; dia: number | null; textoOriginal: string }[] = [];
    row1.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (colNumber === 1) return; // "Hora"
        if (cell.type === 1 /* ValueType.Merge */) return; // celda "espejo" de una combinación, no el inicio
        const texto = celdaTexto(cell.value);
        if (!texto) return;
        marcas.push({ col: colNumber, dia: normalizarDia(texto), textoOriginal: texto });
    });

    const bloques: BloqueDia[] = [];
    marcas.forEach((marca, i) => {
        if (marca.dia === null) {
            errores.push(`Hoja "${HOJA_HORARIO}": no se reconoce el día "${marca.textoOriginal}" en la cabecera.`);
            return;
        }
        const colFin = i + 1 < marcas.length ? marcas[i + 1].col - 1 : sheet.actualColumnCount;
        bloques.push({ dia: marca.dia, colInicio: marca.col, colFin });
    });
    return bloques;
}

interface MapaSubcolumnas {
    materia: number;
    nivel?: number;
    grupo?: number;
    aula?: number;
}

const SUBCOLUMNA_CLAVES: Record<string, keyof MapaSubcolumnas> = {
    nivel: 'nivel',
    materia: 'materia',
    grupo: 'grupo',
    aula: 'aula',
};

// Localiza, dentro del rango de columnas de un bloque de día, cuál es la
// subcolumna Nivel/Materia/Grupo/Aula por el TEXTO de su cabecera (fila 2)
// — no por posición fija, así que reordenar columnas dentro de un bloque
// no rompe el parseo.
function mapearSubcolumnas(sheet: import('exceljs').Worksheet, bloque: BloqueDia, errores: string[]): MapaSubcolumnas | null {
    const row2 = sheet.getRow(2);
    const mapa: Partial<MapaSubcolumnas> = {};
    for (let c = bloque.colInicio; c <= bloque.colFin; c++) {
        const clave = sinAcentos(celdaTexto(row2.getCell(c).value).toLowerCase());
        if (clave in SUBCOLUMNA_CLAVES) {
            mapa[SUBCOLUMNA_CLAVES[clave]] = c;
        }
    }
    if (mapa.materia === undefined) {
        errores.push(`Hoja "${HOJA_HORARIO}": no se encuentra la subcolumna "Materia" para ${DIAS_SEMANA[bloque.dia]}.`);
        return null;
    }
    return mapa as MapaSubcolumnas;
}

function parseHorarioSheet(sheet: import('exceljs').Worksheet, errores: string[]): FilaHorario[] {
    const bloques = detectarBloquesDia(sheet, errores);
    if (bloques.length === 0) {
        errores.push(`Hoja "${HOJA_HORARIO}": no se reconoce ningún día en la cabecera.`);
        return [];
    }

    const bloquesConMapa = bloques
        .map(bloque => ({ bloque, mapa: mapearSubcolumnas(sheet, bloque, errores) }))
        .filter((x): x is { bloque: BloqueDia; mapa: MapaSubcolumnas } => x.mapa !== null);

    const filas: FilaHorario[] = [];

    for (let r = PRIMERA_FILA_DATOS_HORARIO; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const horaTexto = celdaTexto(row.getCell(1).value);

        const hayContenido = bloquesConMapa.some(({ mapa }) => celdaTexto(row.getCell(mapa.materia).value).length > 0);

        if (!horaTexto) {
            if (hayContenido) errores.push(`Fila ${r} (Horario): falta la hora de la franja.`);
            continue;
        }

        const rango = parsearRangoHoras(horaTexto);
        if (!rango) {
            errores.push(`Fila ${r} (Horario): rango de horas inválido: "${horaTexto}" (usa HH:MM - HH:MM).`);
            continue;
        }
        const [horaInicio, horaFin] = rango;

        for (const { bloque, mapa } of bloquesConMapa) {
            const asignatura = celdaTexto(row.getCell(mapa.materia).value);
            if (!asignatura) continue; // franja libre ese día

            const grupo = mapa.grupo ? celdaTexto(row.getCell(mapa.grupo).value) || null : null;
            const aula = mapa.aula ? celdaTexto(row.getCell(mapa.aula).value) || null : null;
            const ensenanza = mapa.nivel ? celdaTexto(row.getCell(mapa.nivel).value) || null : null;

            filas.push({ dia: bloque.dia, hora_inicio: horaInicio, hora_fin: horaFin, grupo, asignatura, aula, ensenanza });
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
