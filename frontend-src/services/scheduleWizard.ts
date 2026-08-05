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

export interface FilaFestivo {
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
}

export interface FilaPeriodoEvaluacion {
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
    peso: number;
}

// Info de la hoja "Curso Académico" — v3: el asistente pasa de "rellenar el
// curso activo" a "crear un curso académico nuevo" (ver
// asistente-inicio-curso.md, sección v3), así que este bloque es el
// contrato que StartOfYearWizardModal usa para llamar a
// POST /academic-years antes que nada.
export interface CursoAcademicoInfo {
    label: string;
    startDate: string;
    endDate: string;
    holidays: FilaFestivo[];
    evaluationPeriods: FilaPeriodoEvaluacion[];
}

export interface ParsedWorkbook {
    cursoAcademico: CursoAcademicoInfo | null;
    filas: FilaHorario[];
    alumnado: FilaAlumnado[];
    errores: string[];
}

const HOJA_INSTRUCCIONES = 'Instrucciones';
const HOJA_CURSO = 'Curso Académico';
const HOJA_CONFIGURACION = 'Configuración';
const HOJA_HORARIO = 'Horario';
const HOJA_ALUMNADO = 'Alumnado';

// Layout de la hoja "Curso Académico": bloque clave/valor (filas 1-3) +
// dos tablas apiladas verticalmente (Festivos, luego Periodos de
// evaluación) — más simple de construir/parsear que ponerlas una al lado
// de otra, y esta hoja es corta así que no hace falta ahorrar espacio.
const CURSO_FILA_NOMBRE = 1;
const CURSO_FILA_INICIO = 2;
const CURSO_FILA_FIN = 3;
const FESTIVOS_FILA_TITULO = 5;
const FESTIVOS_FILA_CABECERA = 6;
const FESTIVOS_FILA_INICIO = 7;
const FESTIVOS_FILAS = 20; // filas de datos 7..26
const EVALUACIONES_FILA_TITULO = 28;
const EVALUACIONES_FILA_CABECERA = 29;
const EVALUACIONES_FILA_INICIO = 30;
const EVALUACIONES_FILAS = 10; // filas de datos 30..39

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

const MS_POR_DIA = 86400000;

// Aritmética de fechas en UTC puro (sin componente de hora ni huso
// horario): estas fechas son solo "días de calendario", igual que las
// columnas DATE del backend — usar Date.UTC/getUTC* en todo momento evita
// que un huso horario negativo desplace el día al convertir ida y vuelta
// (mismo cuidado que ya tuvo parsearHora con las horas).
const fechaISOaUTC = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};

const utcAFechaISO = (ms: number): string => {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dia}`;
};

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Valida forma Y que sea una fecha de calendario real (rechaza "2026-02-30"
// comprobando que Date.UTC no la "corrija" a otro día al reconstruirla).
const parsearFechaISO = (texto: string): string | null => {
    const m = FECHA_RE.exec(texto.trim());
    if (!m) return null;
    const [, yStr, moStr, dStr] = m;
    const y = Number(yStr), mo = Number(moStr), d = Number(dStr);
    const ms = Date.UTC(y, mo - 1, d);
    const comprobacion = new Date(ms);
    if (comprobacion.getUTCFullYear() !== y || comprobacion.getUTCMonth() !== mo - 1 || comprobacion.getUTCDate() !== d) return null;
    return `${yStr}-${moStr}-${dStr}`;
};

// Mismo reparto que _default_evaluation_periods en
// api/app/services/academic_years.py (tercios por días naturales, división
// entera) — portado aquí para que la plantilla pueda prellenar los 3
// periodos de evaluación por defecto sin esperar a que exista el curso
// académico en el backend todavía.
export const defaultEvaluationPeriods = (startDate: string, endDate: string): FilaPeriodoEvaluacion[] => {
    const inicioMs = fechaISOaUTC(startDate);
    const finMs = fechaISOaUTC(endDate);
    const totalDias = Math.round((finMs - inicioMs) / MS_POR_DIA);
    const tercio = Math.floor(totalDias / 3);
    const p1FinMs = inicioMs + tercio * MS_POR_DIA;
    const p2FinMs = inicioMs + 2 * tercio * MS_POR_DIA;
    return [
        { nombre: '1ª Evaluación', fechaInicio: utcAFechaISO(inicioMs), fechaFin: utcAFechaISO(p1FinMs), peso: 1 },
        { nombre: '2ª Evaluación', fechaInicio: utcAFechaISO(p1FinMs + MS_POR_DIA), fechaFin: utcAFechaISO(p2FinMs), peso: 1 },
        { nombre: '3ª Evaluación', fechaInicio: utcAFechaISO(p2FinMs + MS_POR_DIA), fechaFin: utcAFechaISO(finMs), peso: 1 },
    ];
};

// Aviso de formato (no bloqueante) para una celda de fecha en texto libre —
// mismo criterio tolerante que ya usa la celda Hora de la hoja Horario.
const setDateHint = (cell: import('exceljs').Cell) => {
    cell.dataValidation = {
        type: 'custom',
        allowBlank: true,
        formulae: [`ISNUMBER(SEARCH("-",${cell.address}))`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Formato de fecha',
        error: 'Se esperaba el formato AAAA-MM-DD. Puedes continuar igualmente.',
    };
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

export interface PrefillCursoAcademico {
    label?: string;
    startDate?: string;
    endDate?: string;
}

export async function generateTemplate(prefill?: PrefillCursoAcademico): Promise<Blob> {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    wb.creator = 'Cuaderno Docente';
    wb.created = new Date();

    buildInstruccionesSheet(wb);
    buildCursoAcademicoSheet(wb, prefill);
    buildConfiguracionSheet(wb);
    buildHorarioSheet(wb);
    buildAlumnadoSheet(wb);

    const buffer = await wb.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// La hoja "Curso Académico" declara el curso NUEVO que este asistente va a
// crear y activar — nunca modifica el curso ya activo (decisión explícita,
// ver asistente-inicio-curso.md v3). `prefill` viene del mini-formulario
// que se muestra antes de descargar; si trae fechas, ya se prellenan los 3
// periodos de evaluación por defecto (editables) para no obligar a
// calcularlos a mano.
function buildCursoAcademicoSheet(wb: import('exceljs').Workbook, prefill?: PrefillCursoAcademico) {
    const sheet = wb.addWorksheet(HOJA_CURSO);
    sheet.getColumn(1).width = 32;
    sheet.getColumn(2).width = 20;
    sheet.getColumn(3).width = 20;
    sheet.getColumn(4).width = 10;

    const setEtiqueta = (fila: number, etiqueta: string, valor?: string) => {
        const etiquetaCell = sheet.getCell(fila, 1);
        etiquetaCell.value = etiqueta;
        etiquetaCell.font = { bold: true };
        if (valor) sheet.getCell(fila, 2).value = valor;
    };
    setEtiqueta(CURSO_FILA_NOMBRE, 'Nombre del curso', prefill?.label);
    setEtiqueta(CURSO_FILA_INICIO, 'Fecha de inicio (AAAA-MM-DD)', prefill?.startDate);
    setEtiqueta(CURSO_FILA_FIN, 'Fecha de fin (AAAA-MM-DD)', prefill?.endDate);
    setDateHint(sheet.getCell(CURSO_FILA_INICIO, 2));
    setDateHint(sheet.getCell(CURSO_FILA_FIN, 2));

    const tituloSeccion = (fila: number, colFin: number, texto: string) => {
        sheet.mergeCells(fila, 1, fila, colFin);
        const cell = sheet.getCell(fila, 1);
        cell.value = texto;
        cell.font = { bold: true, size: 12 };
    };
    const cabeceraTabla = (fila: number, columnas: string[]) => {
        columnas.forEach((h, i) => {
            const cell = sheet.getCell(fila, i + 1);
            cell.value = h;
            estilizarCabecera(cell);
        });
    };

    tituloSeccion(FESTIVOS_FILA_TITULO, 3, 'Festivos y días no lectivos');
    cabeceraTabla(FESTIVOS_FILA_CABECERA, ['Nombre', 'Fecha inicio (AAAA-MM-DD)', 'Fecha fin (AAAA-MM-DD)']);
    for (let r = FESTIVOS_FILA_INICIO; r < FESTIVOS_FILA_INICIO + FESTIVOS_FILAS; r++) {
        setDateHint(sheet.getCell(r, 2));
        setDateHint(sheet.getCell(r, 3));
    }

    tituloSeccion(EVALUACIONES_FILA_TITULO, 4, 'Periodos de evaluación');
    cabeceraTabla(EVALUACIONES_FILA_CABECERA, ['Nombre', 'Fecha inicio (AAAA-MM-DD)', 'Fecha fin (AAAA-MM-DD)', 'Peso']);
    for (let r = EVALUACIONES_FILA_INICIO; r < EVALUACIONES_FILA_INICIO + EVALUACIONES_FILAS; r++) {
        setDateHint(sheet.getCell(r, 2));
        setDateHint(sheet.getCell(r, 3));
    }
    if (prefill?.startDate && prefill?.endDate) {
        defaultEvaluationPeriods(prefill.startDate, prefill.endDate).forEach((p, i) => {
            const r = EVALUACIONES_FILA_INICIO + i;
            sheet.getCell(r, 1).value = p.nombre;
            sheet.getCell(r, 2).value = p.fechaInicio;
            sheet.getCell(r, 3).value = p.fechaFin;
            sheet.getCell(r, 4).value = p.peso;
        });
    }
}

function buildInstruccionesSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_INSTRUCCIONES);
    sheet.getColumn(1).width = 100;

    const parrafos = [
        'Asistente de inicio de curso',
        '',
        'Rellena las hojas de este libro EN ORDEN — "Curso Académico" y "Configuración" primero, para que el resto de hojas tengan lo que necesitan — y súbelo desde Ajustes → Curso Académico → "Iniciar nuevo curso académico". Antes de aplicar nada, la app te enseña un resumen de lo que va a crear para que lo confirmes.',
        '',
        'Hoja "Curso Académico":',
        '- Nombre del curso (p.ej. "2026-2027") y fechas de inicio/fin (AAAA-MM-DD): este asistente SIEMPRE crea un curso académico nuevo y lo activa — nunca modifica el que tengas activo ahora mismo.',
        '- Festivos y días no lectivos: opcional, uno por fila.',
        '- Periodos de evaluación: si ya pusiste las fechas de inicio/fin de arriba, aquí tienes 3 periodos calculados a partes iguales — puedes editarlos o añadir/quitar filas. "Peso" sirve para ponderar la nota final entre evaluaciones (1 por defecto, igual para todas).',
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
        '- Truco: para copiar Nivel/Grupo en varias filas seguidas (varios alumnos del mismo grupo), arrastra el tirador de relleno con la tecla Ctrl pulsada — si no, Excel puede incrementar el número en vez de copiarlo tal cual.',
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

    // Borde grueso al principio de cada bloque de día (y al final del
    // último) — sin esto cuesta ver a simple vista dónde empieza cada día,
    // ya que las 4 subcolumnas de Lunes/Martes/... no tienen ninguna
    // separación visual propia más allá de la cabecera combinada de la
    // fila 1.
    DIAS_SEMANA.forEach((_, d) => {
        const colInicio = colInicioDia(d);
        for (let r = 1; r <= filaFinDatos; r++) {
            const cell = sheet.getCell(r, colInicio);
            cell.border = { ...cell.border, left: { style: 'thick' } };
        }
    });
    for (let r = 1; r <= filaFinDatos; r++) {
        const cell = sheet.getCell(r, ultimaColumna);
        cell.border = { ...cell.border, right: { style: 'thick' } };
    }
}

const FILAS_ALUMNADO = 60;

// Excel incrementa por defecto el número de un texto (p.ej. "1º ESO" ->
// "2º ESO") al arrastrar el tirador de relleno desde una sola celda — es
// comportamiento nativo del cliente Excel (AutoFill), no algo que se pueda
// desactivar desde el .xlsx generado; lo único real es documentarlo (nota
// de celda + Instrucciones), útil aquí porque es habitual copiar Nivel/
// Grupo en varias filas seguidas al dar de alta un grupo entero.
const NOTA_AUTOINCREMENTO = 'Si arrastras el tirador de relleno (la crucecita de la esquina) para copiar este valor en varias filas seguidas, mantén pulsada la tecla Ctrl mientras arrastras. Si no, Excel puede incrementar el número que contiene (p.ej. "1º ESO" pasaría a "2º ESO") en vez de repetir el mismo valor.';

function buildAlumnadoSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_ALUMNADO);
    const columnas = ['Nivel', 'Materia', 'Grupo', 'Nombre', 'Primer Apellido', 'Segundo Apellido', 'Fecha Nacimiento', 'DNI', 'ACNEAE'];
    columnas.forEach((c, i) => {
        const col = i + 1;
        const headerCell = sheet.getCell(1, col);
        headerCell.value = c;
        estilizarCabecera(headerCell);
        sheet.getColumn(col).width = 20;
        if (c === 'Nivel' || c === 'Grupo') headerCell.note = NOTA_AUTOINCREMENTO;
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

    const hojaCurso = wb.getWorksheet(HOJA_CURSO);
    const hojaHorario = wb.getWorksheet(HOJA_HORARIO);
    const hojaAlumnado = wb.getWorksheet(HOJA_ALUMNADO);

    if (!hojaCurso) errores.push(`No se encuentra la hoja "${HOJA_CURSO}".`);
    if (!hojaHorario) errores.push(`No se encuentra la hoja "${HOJA_HORARIO}".`);
    if (!hojaAlumnado) errores.push(`No se encuentra la hoja "${HOJA_ALUMNADO}".`);

    const cursoAcademico = hojaCurso ? parseCursoAcademicoSheet(hojaCurso, errores) : null;
    const filas = hojaHorario ? parseHorarioSheet(hojaHorario, errores) : [];
    const alumnado = hojaAlumnado ? parseAlumnadoSheet(hojaAlumnado, errores) : [];

    return { cursoAcademico, filas, alumnado, errores };
}

// Devuelve `null` (bloqueante) si falta o es inválido cualquiera de
// Nombre/Fecha inicio/Fecha fin — sin esos 3 datos no hay curso académico
// que crear, así que StartOfYearWizardModal no deja confirmar nada.
// Festivos/periodos de evaluación son tolerantes: una fila mal rellena da
// error y se descarta, sin abortar el resto (mismo criterio que
// parseAlumnadoSheet).
function parseCursoAcademicoSheet(sheet: import('exceljs').Worksheet, errores: string[]): CursoAcademicoInfo | null {
    const label = celdaTexto(sheet.getCell(CURSO_FILA_NOMBRE, 2).value);
    const startDateTexto = celdaTexto(sheet.getCell(CURSO_FILA_INICIO, 2).value);
    const endDateTexto = celdaTexto(sheet.getCell(CURSO_FILA_FIN, 2).value);
    const startDate = startDateTexto ? parsearFechaISO(startDateTexto) : null;
    const endDate = endDateTexto ? parsearFechaISO(endDateTexto) : null;

    if (!label) errores.push(`Hoja "${HOJA_CURSO}": falta el nombre del curso (celda B1).`);
    if (!startDateTexto) errores.push(`Hoja "${HOJA_CURSO}": falta la fecha de inicio (celda B2).`);
    else if (!startDate) errores.push(`Hoja "${HOJA_CURSO}": fecha de inicio inválida: "${startDateTexto}" (usa AAAA-MM-DD).`);
    if (!endDateTexto) errores.push(`Hoja "${HOJA_CURSO}": falta la fecha de fin (celda B3).`);
    else if (!endDate) errores.push(`Hoja "${HOJA_CURSO}": fecha de fin inválida: "${endDateTexto}" (usa AAAA-MM-DD).`);
    if (startDate && endDate && endDate <= startDate) {
        errores.push(`Hoja "${HOJA_CURSO}": la fecha de fin debe ser posterior a la de inicio.`);
    }

    if (!label || !startDate || !endDate || endDate <= startDate) return null;

    const holidays: FilaFestivo[] = [];
    for (let r = FESTIVOS_FILA_INICIO; r < FESTIVOS_FILA_INICIO + FESTIVOS_FILAS; r++) {
        const nombre = celdaTexto(sheet.getCell(r, 1).value);
        const inicioTexto = celdaTexto(sheet.getCell(r, 2).value);
        const finTexto = celdaTexto(sheet.getCell(r, 3).value);
        if (!nombre && !inicioTexto && !finTexto) continue; // fila vacía
        const inicio = parsearFechaISO(inicioTexto);
        const fin = parsearFechaISO(finTexto);
        if (!nombre || !inicio || !fin) {
            errores.push(`Fila ${r} (${HOJA_CURSO} — Festivos): faltan datos o la fecha no tiene forma AAAA-MM-DD.`);
            continue;
        }
        holidays.push({ nombre, fechaInicio: inicio, fechaFin: fin });
    }

    const evaluationPeriods: FilaPeriodoEvaluacion[] = [];
    for (let r = EVALUACIONES_FILA_INICIO; r < EVALUACIONES_FILA_INICIO + EVALUACIONES_FILAS; r++) {
        const nombre = celdaTexto(sheet.getCell(r, 1).value);
        const inicioTexto = celdaTexto(sheet.getCell(r, 2).value);
        const finTexto = celdaTexto(sheet.getCell(r, 3).value);
        const pesoTexto = celdaTexto(sheet.getCell(r, 4).value);
        if (!nombre && !inicioTexto && !finTexto) continue; // fila vacía
        const inicio = parsearFechaISO(inicioTexto);
        const fin = parsearFechaISO(finTexto);
        if (!nombre || !inicio || !fin) {
            errores.push(`Fila ${r} (${HOJA_CURSO} — Periodos de evaluación): faltan datos o la fecha no tiene forma AAAA-MM-DD.`);
            continue;
        }
        const pesoNum = parseFloat(pesoTexto.replace(',', '.'));
        evaluationPeriods.push({ nombre, fechaInicio: inicio, fechaFin: fin, peso: Number.isFinite(pesoNum) && pesoNum > 0 ? pesoNum : 1 });
    }

    return { label, startDate, endDate, holidays, evaluationPeriods };
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
