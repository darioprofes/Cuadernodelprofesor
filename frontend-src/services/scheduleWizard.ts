// Asistente de inicio de curso: genera y parsea una plantilla Excel de 5
// hojas (Instrucciones / Curso Académico / Configuración / Horario /
// Alumnado) para dar de alta de una vez un curso académico completo:
// nombre, fechas, festivos, periodos de evaluación, materias, horario y
// alumnado. Funciones puras, sin React ni backend — igual en web y en
// escritorio (exceljs trabaja enteramente en memoria vía ArrayBuffer/Blob,
// sin acceso a filesystem de Node).
//
// v2 (2026-08-05): la hoja Horario pasó de "una celda con hasta 3 líneas
// separadas por Alt+Intro" (v1, ver git log de este fichero) a columnas
// propias por día con desplegables — Excel no permite validaciones de
// datos distintas dentro de una misma celda combinada, así que combinar
// celdas (para el nombre de cada día) y tener desplegables (para Nivel/
// Materia/Grupo/Aula) obliga a repartir esos datos en columnas separadas.
// La hoja Configuración nueva es la fuente de esos desplegables.
//
// v3 (2026-08-06): el asistente pasa de "rellenar el curso activo" a
// "crear un curso académico nuevo" — nueva hoja "Curso Académico".
//
// v3.1 (2026-08-06): repaso estético completo pedido por el usuario —
// cada hoja de datos lleva ahora una franja explicativa propia arriba (en
// vez de amontonar toda la mecánica en "Instrucciones", que pasa a ser un
// texto general corto, estilo documento), más filas alternas, bordes
// finos y algunos iconos en cabeceras que NUNCA se leen por texto al
// parsear (ver nota junto a `PRIMERA_FILA_CONTENIDO` y los `estiliza*`).

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

// Cada hoja de datos (todas menos Instrucciones) empieza con una franja
// explicativa propia: fila 1 = banner (texto), fila 2 = separador fino.
// El contenido real de cada hoja arranca aquí. Todo lo que sigue en este
// fichero da por hecho este desplazamiento — no hay "fila 1 = cabecera"
// en ninguna hoja de datos, a diferencia de la v3.0.
const PRIMERA_FILA_CONTENIDO = 3;

// Layout de la hoja "Curso Académico": bloque clave/valor + dos tablas
// apiladas verticalmente (Festivos, luego Periodos de evaluación) — más
// simple de construir/parsear que ponerlas una al lado de otra, y esta
// hoja es corta así que no hace falta ahorrar espacio.
const CURSO_FILA_NOMBRE = PRIMERA_FILA_CONTENIDO;
const CURSO_FILA_INICIO = PRIMERA_FILA_CONTENIDO + 1;
const CURSO_FILA_FIN = PRIMERA_FILA_CONTENIDO + 2;
// Periodos de evaluación va ANTES que Festivos a propósito (bug real
// reportado por el usuario): con Festivos primero, sus 20 filas casi
// siempre vacías hacían que la tabla de Periodos —ya prellenada con datos
// reales— quedara fuera de la vista inicial y pasara desapercibida.
const EVALUACIONES_FILA_TITULO = PRIMERA_FILA_CONTENIDO + 4;
const EVALUACIONES_FILA_CABECERA = EVALUACIONES_FILA_TITULO + 1;
const EVALUACIONES_FILA_INICIO = EVALUACIONES_FILA_TITULO + 2;
const EVALUACIONES_FILAS = 10;
const FESTIVOS_FILA_TITULO = EVALUACIONES_FILA_INICIO + EVALUACIONES_FILAS + 1;
const FESTIVOS_FILA_CABECERA = FESTIVOS_FILA_TITULO + 1;
const FESTIVOS_FILA_INICIO = FESTIVOS_FILA_TITULO + 2;
const FESTIVOS_FILAS = 20;

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
const CONFIG_FILA_CABECERA = PRIMERA_FILA_CONTENIDO;
const CONFIG_FILA_DATOS_INICIO = CONFIG_FILA_CABECERA + 1;
const CONFIG_FILAS = 40; // filas de datos por lista

const SUBCOLUMNAS_DIA = ['Nivel', 'Materia', 'Grupo', 'Aula'] as const;
const COLS_POR_DIA = SUBCOLUMNAS_DIA.length;

const COLOR_CABECERA = 'FF2563EB'; // Tailwind blue-600, mismo azul que los botones primarios de la app
const COLOR_BANNER_TITULO = 'FF1E3A8A'; // Tailwind blue-900
const COLOR_BANNER_TEXTO = 'FF475569'; // Tailwind slate-600
const COLOR_BANNER_FONDO = 'FFEFF6FF'; // Tailwind blue-50
const COLOR_ZEBRA = 'FFF8FAFC'; // Tailwind slate-50, apenas perceptible
const COLOR_BORDE_FINO = 'FFE2E8F0'; // Tailwind slate-200

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

const FECHA_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FECHA_DDMMYYYY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

// Valida forma Y que sea una fecha de calendario real (rechaza "31/02/2026"
// comprobando que Date.UTC no la "corrija" a otro día al reconstruirla).
// Acepta DD/MM/AAAA (formato español, el que ve el profesor en la
// plantilla — `FORMATO_FECHA`) y también AAAA-MM-DD por compatibilidad
// (texto pegado desde fuera, o generado a mano) — sin ambigüedad entre
// los dos, se distinguen por el separador ("/" vs "-"). Siempre devuelve
// en AAAA-MM-DD, el formato interno de esta app.
const parsearFechaTexto = (texto: string): string | null => {
    const limpio = texto.trim();
    let y: number, mo: number, d: number;
    const mDMY = FECHA_DDMMYYYY_RE.exec(limpio);
    if (mDMY) {
        d = Number(mDMY[1]); mo = Number(mDMY[2]); y = Number(mDMY[3]);
    } else {
        const mISO = FECHA_ISO_RE.exec(limpio);
        if (!mISO) return null;
        y = Number(mISO[1]); mo = Number(mISO[2]); d = Number(mISO[3]);
    }
    const ms = Date.UTC(y, mo - 1, d);
    const comprobacion = new Date(ms);
    if (comprobacion.getUTCFullYear() !== y || comprobacion.getUTCMonth() !== mo - 1 || comprobacion.getUTCDate() !== d) return null;
    return utcAFechaISO(ms);
};

const fechaISOaDate = (iso: string): Date => new Date(fechaISOaUTC(iso));

// Las celdas de fecha llevan `numFmt` explícito (ver `FORMATO_FECHA`,
// formato español dd/mm/yyyy) para que Excel las trate como fechas reales
// en vez de texto libre — bug real reportado por el usuario: en una
// celda sin formato de fecha, al teclear una fecha Excel la reconocía por
// su cuenta y la mostraba con el formato corto que tuviera el sistema en
// ese momento, sin control. Con el numFmt ya fijado de antemano, exceljs
// devuelve un objeto Date real al leer el fichero (confirmado contra su
// comportamiento real, no asumido) en vez de una cadena de texto — se lee
// con getUTC*, igual criterio que el resto de fechas de este fichero,
// para no depender del huso horario de la máquina. Se mantiene además el
// parseo de texto por si acaso (pegar como texto, o abrir con un programa
// que no respete el numFmt) — acepta DD/MM/AAAA (lo que ve el profesor en
// la plantilla) y también AAAA-MM-DD, ver `parsearFechaTexto`.
const leerCeldaFecha = (valor: unknown): { texto: string; fecha: string | null } => {
    if (valor instanceof Date) {
        const iso = utcAFechaISO(valor.getTime());
        return { texto: iso, fecha: iso };
    }
    const texto = celdaTexto(valor);
    return { texto, fecha: texto ? parsearFechaTexto(texto) : null };
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

const FORMATO_FECHA = 'dd/mm/yyyy'; // formato español, pedido explícito del usuario

// Deja la celda lista para admitir una fecha real: solo `numFmt` explícito
// (para que Excel no le aplique su propio formato corto por defecto al
// reconocer una fecha tecleada, y para que se muestre siempre en
// DD/MM/AAAA). Sin validación de aviso: la primera versión comprobaba
// `SEARCH("-", celda)`, pensada para texto libre — pero para un valor que
// Excel YA reconoció como fecha real (justo lo que se busca con el
// numFmt), SEARCH/FIND con un argumento numérico lo convierte a texto con
// el formato numérico genérico (el número de serie, sin guiones), no con
// el numFmt visible de la celda — así que la validación saltaba SIEMPRE,
// incluso tecleando exactamente "2026-09-13" (bug real reportado por el
// usuario, y error de razonamiento mío la primera vez: asumí que SEARCH
// respetaba el formato de visualización). No hay una validación de aviso
// sencilla y fiable que sirva a la vez para texto libre y fecha real, así
// que se prescinde de ella — `leerCeldaFecha()` ya admite ambos casos al
// parsear, que es donde de verdad hace falta la tolerancia.
const prepararCeldaFecha = (cell: import('exceljs').Cell) => {
    cell.numFmt = FORMATO_FECHA;
};

// Rango de una columna de Configuración, para usar como fuente de un
// desplegable en otra hoja (formulae de dataValidation no lleva "=").
const configRange = (col: number): string => {
    const letra = String.fromCharCode(64 + col); // 1 -> 'A', 2 -> 'B'...
    return `${HOJA_CONFIGURACION}!$${letra}$${CONFIG_FILA_DATOS_INICIO}:$${letra}$${CONFIG_FILA_DATOS_INICIO + CONFIG_FILAS - 1}`;
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

function estilizarCabecera(cell: import('exceljs').Cell) {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CABECERA } };
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
}

const ESTILO_BORDE_FINO = { style: 'thin' as const, color: { argb: COLOR_BORDE_FINO } };

function bordeFino(cell: import('exceljs').Cell) {
    cell.border = { ...cell.border, top: ESTILO_BORDE_FINO, left: ESTILO_BORDE_FINO, bottom: ESTILO_BORDE_FINO, right: ESTILO_BORDE_FINO };
}

// Filas alternas (zebra striping) dentro de una tabla de datos —
// `filaIndex` es 0-based DENTRO de esa tabla (0 = primera fila de datos),
// no el número de fila real de la hoja.
function estilizarCeldaDatos(cell: import('exceljs').Cell, filaIndex: number) {
    bordeFino(cell);
    if (filaIndex % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ZEBRA } };
    }
}

// Excel NO recalcula la altura de una fila con texto envuelto (wrapText)
// cuando la celda está combinada — es una limitación conocida del propio
// Excel, no algo que se pueda pedir vía exceljs; hay que fijar la altura a
// mano o el texto se ve cortado (bug real reportado por el usuario: con una
// altura fija de 54pt para las 4 hojas, el texto no cabía en las más
// estrechas). Estimación aproximada: 1 unidad de ancho de columna ≈ 1
// carácter de la fuente por defecto (con un 15% de margen porque el título
// va en negrita, más ancha) — de sobra para no quedarse corto; que sobre
// espacio es mucho menos molesto que un texto cortado.
function estimarAlturaTexto(anchoColumnas: number, texto: string, lineasExtra = 0): number {
    const charsPorLinea = Math.max(10, anchoColumnas * 0.85);
    const lineas = lineasExtra + Math.ceil(texto.length / charsPorLinea);
    return Math.max(40, lineas * 16 + 22);
}

// Franja explicativa propia de cada hoja de datos (fila 1 = texto en dos
// tonos dentro de la misma celda combinada — título en negrita + azul
// oscuro, descripción en gris —, fila 2 = separador fino). Sustituye a la
// vieja "Instrucciones" como único sitio con la mecánica de cada hoja: el
// profesor ve la explicación justo donde la necesita, sin tener que volver
// a una hoja aparte. El texto de aquí NUNCA se parsea (a diferencia de las
// cabeceras de columna reales, que si llevan icono no se podrían reconocer
// por texto al subir el fichero — ver comentario en cada `build*Sheet`).
// `anchoTotal` es la suma de anchos de las columnas que abarca el banner
// (no `colFin`, que es solo el número de columnas) — hace falta para
// estimar cuántas líneas ocupará el texto.
function addBanner(sheet: import('exceljs').Worksheet, colFin: number, anchoTotal: number, icono: string, titulo: string, descripcion: string) {
    sheet.mergeCells(1, 1, 1, colFin);
    const cell = sheet.getCell(1, 1);
    cell.value = {
        richText: [
            { font: { bold: true, size: 12, color: { argb: COLOR_BANNER_TITULO } }, text: `${icono} ${titulo}\n` },
            { font: { size: 10, color: { argb: COLOR_BANNER_TEXTO } }, text: descripcion },
        ],
    };
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BANNER_FONDO } };
    // +1 línea extra por el título, que va en su propia línea antes de la descripción.
    sheet.getRow(1).height = estimarAlturaTexto(anchoTotal, descripcion, 1);
    sheet.getRow(2).height = 6;
}

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

// Hoja de portada: un texto general corto, a modo de documento (fondo
// suave, párrafos con aire), sin mecánica columna-por-columna — esa vive
// ahora en el banner propio de cada hoja (ver `addBanner`). Petición
// explícita del usuario: el wall-of-text anterior no invitaba a leerlo.
function buildInstruccionesSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_INSTRUCCIONES);
    sheet.getColumn(1).width = 100;

    const titulo = sheet.getCell(1, 1);
    titulo.value = '🚀 Asistente de inicio de curso';
    titulo.font = { bold: true, size: 18, color: { argb: COLOR_BANNER_TITULO } };
    titulo.alignment = { vertical: 'middle' };
    sheet.getRow(1).height = 34;

    const parrafos = [
        'Este libro te permite arrancar un curso académico nuevo de una sola vez: nombre y fechas del curso, festivos, periodos de evaluación, las materias que impartes, tu horario semanal y el alumnado de cada clase — todo en un único fichero.',
        'Rellena las hojas en el orden en que aparecen. Cada una trae su propia explicación arriba, en la franja de color — no hace falta volver aquí para saber qué va en cada columna.',
        'Cuando termines, súbelo desde Ajustes → Curso Académico → "Iniciar nuevo curso académico". Verás un resumen de lo que se va a crear antes de confirmar nada, así que no hay ningún riesgo en subirlo y revisar primero.',
        'Este asistente SIEMPRE crea un curso académico nuevo y lo activa — nunca modifica el curso que tengas activo ahora mismo.',
    ];

    let fila = 3;
    parrafos.forEach(texto => {
        const cell = sheet.getCell(fila, 1);
        cell.value = texto;
        cell.font = { size: 12 };
        cell.alignment = { wrapText: true, vertical: 'middle' };
        sheet.getRow(fila).height = estimarAlturaTexto(100, texto);
        fila += 1;
    });

    // "Tarjeta" de fondo suave para que se lea como un documento, no como
    // una hoja de cálculo de trabajo.
    for (let r = 1; r <= fila - 1; r++) {
        sheet.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BANNER_FONDO } };
    }
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

    addBanner(
        sheet, 4, 32 + 20 + 20 + 10, '🚀', 'Curso Académico',
        'Datos del curso NUEVO que este asistente va a crear y activar (nunca toca el que tengas activo). Abajo: nombre y fechas; más abajo, festivos y periodos de evaluación — si diste las fechas, ya vienen 3 periodos calculados a partes iguales.',
    );

    // Los iconos de estas 3 etiquetas son solo decorativos: el parseo lee
    // B3/B4/B5 directamente por posición, nunca por el texto de A3/A4/A5.
    const setEtiqueta = (fila: number, etiqueta: string) => {
        const etiquetaCell = sheet.getCell(fila, 1);
        etiquetaCell.value = etiqueta;
        etiquetaCell.font = { bold: true };
        etiquetaCell.alignment = { vertical: 'middle' };
    };
    setEtiqueta(CURSO_FILA_NOMBRE, '🏷️ Nombre del curso');
    setEtiqueta(CURSO_FILA_INICIO, '📅 Fecha de inicio');
    setEtiqueta(CURSO_FILA_FIN, '📅 Fecha de fin');
    if (prefill?.label) sheet.getCell(CURSO_FILA_NOMBRE, 2).value = prefill.label;
    if (prefill?.startDate) sheet.getCell(CURSO_FILA_INICIO, 2).value = fechaISOaDate(prefill.startDate);
    if (prefill?.endDate) sheet.getCell(CURSO_FILA_FIN, 2).value = fechaISOaDate(prefill.endDate);
    prepararCeldaFecha(sheet.getCell(CURSO_FILA_INICIO, 2));
    prepararCeldaFecha(sheet.getCell(CURSO_FILA_FIN, 2));

    const tituloSeccion = (fila: number, colFin: number, texto: string) => {
        sheet.mergeCells(fila, 1, fila, colFin);
        const cell = sheet.getCell(fila, 1);
        cell.value = texto;
        cell.font = { bold: true, size: 12 };
        cell.alignment = { vertical: 'middle' };
    };
    const cabeceraTabla = (fila: number, columnas: string[]) => {
        columnas.forEach((h, i) => {
            const cell = sheet.getCell(fila, i + 1);
            cell.value = h;
            estilizarCabecera(cell);
        });
    };

    tituloSeccion(FESTIVOS_FILA_TITULO, 3, '🎉 Festivos y días no lectivos');
    cabeceraTabla(FESTIVOS_FILA_CABECERA, ['Nombre', 'Fecha inicio', 'Fecha fin']);
    for (let i = 0; i < FESTIVOS_FILAS; i++) {
        const r = FESTIVOS_FILA_INICIO + i;
        for (let c = 1; c <= 3; c++) estilizarCeldaDatos(sheet.getCell(r, c), i);
        prepararCeldaFecha(sheet.getCell(r, 2));
        prepararCeldaFecha(sheet.getCell(r, 3));
    }

    tituloSeccion(EVALUACIONES_FILA_TITULO, 4, '📊 Periodos de evaluación');
    cabeceraTabla(EVALUACIONES_FILA_CABECERA, ['Nombre', 'Fecha inicio', 'Fecha fin', 'Peso']);
    for (let i = 0; i < EVALUACIONES_FILAS; i++) {
        const r = EVALUACIONES_FILA_INICIO + i;
        for (let c = 1; c <= 4; c++) estilizarCeldaDatos(sheet.getCell(r, c), i);
        prepararCeldaFecha(sheet.getCell(r, 2));
        prepararCeldaFecha(sheet.getCell(r, 3));
    }
    if (prefill?.startDate && prefill?.endDate) {
        defaultEvaluationPeriods(prefill.startDate, prefill.endDate).forEach((p, i) => {
            const r = EVALUACIONES_FILA_INICIO + i;
            sheet.getCell(r, 1).value = p.nombre;
            sheet.getCell(r, 2).value = fechaISOaDate(p.fechaInicio);
            sheet.getCell(r, 3).value = fechaISOaDate(p.fechaFin);
            sheet.getCell(r, 4).value = p.peso;
        });
    }
}

// Los iconos de estas 4 cabeceras son solo decorativos: nada las lee por
// texto al parsear (a diferencia de las cabeceras de Alumnado/Horario, que
// si llevaran icono dejarían de coincidir con el emparejamiento por texto
// que ya usan `parseAlumnadoSheet`/`mapearSubcolumnas` — por eso esas se
// quedan sin icono).
function buildConfiguracionSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_CONFIGURACION);

    addBanner(
        sheet, 4, 32 * 4, '📋', 'Configuración',
        'Declara aquí, una vez, lo que usas: niveles, materias/actividades (incluye guardias, reuniones...), grupos y aulas — un valor por fila. Estas listas alimentan los desplegables de "Horario" y "Alumnado". Son 4 listas INDEPENDIENTES entre sí: la fila 5 de una columna no tiene por qué tener nada que ver con la fila 5 de otra — cada columna es su propia lista suelta.',
    );

    const columnas: { header: string; ejemplo: string; ejemplo2?: string }[] = [
        { header: '🎓 Niveles que impartes', ejemplo: '1º ESO' },
        { header: '📘 Materias / actividades que impartes', ejemplo: 'Biología y Geología', ejemplo2: 'Guardia' },
        { header: '👥 Grupos a los que das clase', ejemplo: '1º ESO A' },
        { header: '🏫 Aulas habituales', ejemplo: 'A16' },
    ];

    columnas.forEach((c, i) => {
        const col = i + 1;
        sheet.getColumn(col).width = 32;
        const headerCell = sheet.getCell(CONFIG_FILA_CABECERA, col);
        headerCell.value = c.header;
        estilizarCabecera(headerCell);
        sheet.getCell(CONFIG_FILA_DATOS_INICIO, col).value = c.ejemplo;
        if (c.ejemplo2) sheet.getCell(CONFIG_FILA_DATOS_INICIO + 1, col).value = c.ejemplo2;
    });

    for (let i = 0; i < CONFIG_FILAS; i++) {
        const r = CONFIG_FILA_DATOS_INICIO + i;
        for (let c = 1; c <= 4; c++) estilizarCeldaDatos(sheet.getCell(r, c), i);
    }

    sheet.getRow(CONFIG_FILA_CABECERA).height = 32;
    sheet.views = [{ state: 'frozen', ySplit: CONFIG_FILA_CABECERA }];
}

const FILAS_HORARIO = 15;
const HORARIO_FILA_DIA = PRIMERA_FILA_CONTENIDO;
const HORARIO_FILA_SUBCOL = HORARIO_FILA_DIA + 1;
const PRIMERA_FILA_DATOS_HORARIO = HORARIO_FILA_SUBCOL + 1;

// Ancho (en unidades de columna) del bloque donde va la explicación del
// banner de Horario — 2 bloques de día (8 columnas), ni tan estrecho que
// obligue a demasiadas líneas ni tan ancho que vuelva a necesitar scroll
// horizontal para leerlo entero.
const HORARIO_BANNER_EXPLICACION_COLS = 8;

function buildHorarioSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_HORARIO);
    const ultimaColumna = colInicioDia(DIAS_SEMANA.length - 1) + COLS_POR_DIA - 1;

    // Banner en dos celdas, no una sola combinada a lo ancho de las 21
    // columnas como en el resto de hojas: con esa versión el texto quedaba
    // en líneas larguísimas que había que desplazar horizontalmente para
    // leer enteras (petición explícita del usuario: nada de scroll para
    // leer la explicación). Ahora: icono+título en la columna "Hora" —
    // que además queda inmovilizada al hacer scroll horizontal, así el
    // rótulo de la hoja siempre está a la vista — y la explicación, en
    // varias líneas cortas, en un bloque más estrecho justo a su derecha.
    for (let c = 1; c <= ultimaColumna; c++) {
        sheet.getCell(1, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BANNER_FONDO } };
    }
    const tituloCell = sheet.getCell(1, 1);
    tituloCell.value = { richText: [{ font: { bold: true, size: 11, color: { argb: COLOR_BANNER_TITULO } }, text: '🗓️ Horario' }] };
    tituloCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };

    const descripcionHorario = 'Una fila por franja horaria — la columna Hora admite un rango ("08:15 - 09:10") o solo una etiqueta libre, como "Recreo" (igual que las franjas de la propia app). Cada día tiene sus columnas Nivel/Materia/Grupo/Aula (con desplegable). Solo Materia es obligatoria: si además pones Grupo, se crea una clase académica real; si no, es una "otra ocupación" sin alumnado. Deja Materia vacía si esa franja está libre ese día.';
    sheet.mergeCells(1, 2, 1, 1 + HORARIO_BANNER_EXPLICACION_COLS);
    const descCell = sheet.getCell(1, 2);
    descCell.value = descripcionHorario;
    descCell.font = { size: 10, color: { argb: COLOR_BANNER_TEXTO } };
    descCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };

    const anchoExplicacion = (HORARIO_BANNER_EXPLICACION_COLS / COLS_POR_DIA) * (14 + 26 + 14 + 14);
    sheet.getRow(1).height = estimarAlturaTexto(anchoExplicacion, descripcionHorario);
    sheet.getRow(2).height = 6;

    // "Hora" combinada verticalmente (sin subcolumnas propias). Sin icono:
    // esta celda no se lee por texto al parsear, pero mantenerla igual que
    // las demás cabeceras evita una excepción visual sin motivo.
    sheet.mergeCells(HORARIO_FILA_DIA, 1, HORARIO_FILA_SUBCOL, 1);
    const horaHeader = sheet.getCell(HORARIO_FILA_DIA, 1);
    horaHeader.value = '🕐 Hora';
    horaHeader.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getColumn(1).width = 18;

    // Los nombres de día (Lunes..Viernes) y las subcabeceras Nivel/Materia/
    // Grupo/Aula SE LEEN POR TEXTO al parsear (`normalizarDia`/
    // `mapearSubcolumnas`) — llevar un icono aquí rompería ese
    // emparejamiento, así que se quedan en texto plano a propósito.
    DIAS_SEMANA.forEach((dia, d) => {
        const colInicio = colInicioDia(d);
        const colFin = colInicio + COLS_POR_DIA - 1;

        sheet.mergeCells(HORARIO_FILA_DIA, colInicio, HORARIO_FILA_DIA, colFin);
        const diaCell = sheet.getCell(HORARIO_FILA_DIA, colInicio);
        diaCell.value = dia;
        diaCell.alignment = { vertical: 'middle', horizontal: 'center' };

        SUBCOLUMNAS_DIA.forEach((sub, i) => {
            const col = colInicio + i;
            const subCell = sheet.getCell(HORARIO_FILA_SUBCOL, col);
            subCell.value = sub;
            subCell.alignment = { vertical: 'middle', horizontal: 'center' };
            sheet.getColumn(col).width = sub === 'Materia' ? 26 : 14;
        });
    });

    for (let r = HORARIO_FILA_DIA; r <= HORARIO_FILA_SUBCOL; r++) {
        for (let c = 1; c <= ultimaColumna; c++) {
            estilizarCabecera(sheet.getCell(r, c));
        }
    }
    sheet.getRow(HORARIO_FILA_DIA).height = 22;
    sheet.getRow(HORARIO_FILA_SUBCOL).height = 20;

    // Cabecera (2 filas) y columna Hora siempre visibles al bajar por la tabla.
    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: HORARIO_FILA_SUBCOL }];

    const filaFinDatos = PRIMERA_FILA_DATOS_HORARIO + FILAS_HORARIO - 1;
    for (let r = PRIMERA_FILA_DATOS_HORARIO; r <= filaFinDatos; r++) {
        const filaIndex = r - PRIMERA_FILA_DATOS_HORARIO;
        for (let c = 1; c <= ultimaColumna; c++) estilizarCeldaDatos(sheet.getCell(r, c), filaIndex);

        // Sin validación en la columna Hora: al principio comprobaba que
        // hubiera ":" y "-" (pensada solo para rangos de horas), pero la
        // columna admite igual de bien una etiqueta libre sin horas
        // (p.ej. "Recreo", igual que las franjas horarias de la propia
        // app) — ver `parseHorarioSheet`. Poner una validación ahí habría
        // repetido el mismo error de falso positivo que ya se corrigió en
        // las celdas de fecha (avisar de algo que en realidad es válido).

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
    // separación visual propia más allá de la cabecera combinada. Se aplica
    // DESPUÉS del borde fino de `estilizarCeldaDatos` para que el grueso
    // gane en los lados que coinciden (izquierda del primer día, derecha
    // del último).
    DIAS_SEMANA.forEach((_, d) => {
        const colInicio = colInicioDia(d);
        for (let r = HORARIO_FILA_DIA; r <= filaFinDatos; r++) {
            const cell = sheet.getCell(r, colInicio);
            cell.border = { ...cell.border, left: { style: 'thick' } };
        }
    });
    for (let r = HORARIO_FILA_DIA; r <= filaFinDatos; r++) {
        const cell = sheet.getCell(r, ultimaColumna);
        cell.border = { ...cell.border, right: { style: 'thick' } };
    }
}

const FILAS_ALUMNADO = 60;
const ALUMNADO_FILA_CABECERA = PRIMERA_FILA_CONTENIDO;
const ALUMNADO_FILA_DATOS_INICIO = ALUMNADO_FILA_CABECERA + 1;

// Excel incrementa por defecto el número de un texto (p.ej. "1º ESO" ->
// "2º ESO") al arrastrar el tirador de relleno desde una sola celda — es
// comportamiento nativo del cliente Excel (AutoFill), no algo que se pueda
// desactivar desde el .xlsx generado; lo único real es documentarlo (nota
// de celda + banner), útil aquí porque es habitual copiar Nivel/Grupo en
// varias filas seguidas al dar de alta un grupo entero.
const NOTA_AUTOINCREMENTO = 'Si arrastras el tirador de relleno (la crucecita de la esquina) para copiar este valor en varias filas seguidas, mantén pulsada la tecla Ctrl mientras arrastras. Si no, Excel puede incrementar el número que contiene (p.ej. "1º ESO" pasaría a "2º ESO") en vez de repetir el mismo valor.';

// Cabeceras en texto plano a propósito, sin icono: `parseAlumnadoSheet`
// las empareja por texto (insensible a mayúsculas/acentos/espacios) contra
// `CAMPOS_ALUMNADO` — un icono delante rompería ese emparejamiento.
function buildAlumnadoSheet(wb: import('exceljs').Workbook) {
    const sheet = wb.addWorksheet(HOJA_ALUMNADO);

    const columnas = ['Nivel', 'Materia', 'Grupo', 'Nombre', 'Primer Apellido', 'Segundo Apellido', 'Fecha Nacimiento', 'DNI', 'ACNEAE'];
    const anchos = [20, 26, 20, 18, 20, 20, 18, 14, 20];

    addBanner(
        sheet, 9, anchos.reduce((a, b) => a + b, 0), '🧑‍🎓', 'Alumnado',
        'Una fila por alumno/a. Nivel/Materia/Grupo deben coincidir con una clase de la hoja "Horario". El resto de la ficha (tutores, domicilio, datos sanitarios...) se rellena después desde la app. Consejo: para copiar Nivel/Grupo en varias filas, arrastra con Ctrl pulsado — si no, Excel puede incrementar el número.',
    );

    columnas.forEach((c, i) => {
        const col = i + 1;
        const headerCell = sheet.getCell(ALUMNADO_FILA_CABECERA, col);
        headerCell.value = c;
        estilizarCabecera(headerCell);
        sheet.getColumn(col).width = anchos[i];
        if (c === 'Nivel' || c === 'Grupo') headerCell.note = NOTA_AUTOINCREMENTO;
    });
    sheet.getRow(ALUMNADO_FILA_CABECERA).height = 20;
    sheet.views = [{ state: 'frozen', ySplit: ALUMNADO_FILA_CABECERA }];

    const ejemplo = sheet.getRow(ALUMNADO_FILA_DATOS_INICIO);
    ['1º ESO', 'Biología y Geología', '1º ESO A', 'Elena', 'García', 'López', '', '', ''].forEach((v, i) => {
        if (v) ejemplo.getCell(i + 1).value = v;
    });
    ejemplo.getCell(7).value = fechaISOaDate('2012-03-15'); // Fecha Nacimiento

    for (let i = 0; i < FILAS_ALUMNADO; i++) {
        const r = ALUMNADO_FILA_DATOS_INICIO + i;
        for (let c = 1; c <= 9; c++) estilizarCeldaDatos(sheet.getCell(r, c), i);
        setListValidation(sheet.getCell(r, 1), configRange(CONFIG_COL_NIVEL));
        setListValidation(sheet.getCell(r, 2), configRange(CONFIG_COL_MATERIA));
        setListValidation(sheet.getCell(r, 3), configRange(CONFIG_COL_GRUPO));
        prepararCeldaFecha(sheet.getCell(r, 7)); // Fecha Nacimiento
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
    const { texto: startDateTexto, fecha: startDate } = leerCeldaFecha(sheet.getCell(CURSO_FILA_INICIO, 2).value);
    const { texto: endDateTexto, fecha: endDate } = leerCeldaFecha(sheet.getCell(CURSO_FILA_FIN, 2).value);

    if (!label) errores.push(`Hoja "${HOJA_CURSO}": falta el nombre del curso (celda B${CURSO_FILA_NOMBRE}).`);
    if (!startDateTexto) errores.push(`Hoja "${HOJA_CURSO}": falta la fecha de inicio (celda B${CURSO_FILA_INICIO}).`);
    else if (!startDate) errores.push(`Hoja "${HOJA_CURSO}": fecha de inicio inválida: "${startDateTexto}" (usa DD/MM/AAAA).`);
    if (!endDateTexto) errores.push(`Hoja "${HOJA_CURSO}": falta la fecha de fin (celda B${CURSO_FILA_FIN}).`);
    else if (!endDate) errores.push(`Hoja "${HOJA_CURSO}": fecha de fin inválida: "${endDateTexto}" (usa DD/MM/AAAA).`);
    if (startDate && endDate && endDate <= startDate) {
        errores.push(`Hoja "${HOJA_CURSO}": la fecha de fin debe ser posterior a la de inicio.`);
    }

    if (!label || !startDate || !endDate || endDate <= startDate) return null;

    const holidays: FilaFestivo[] = [];
    for (let r = FESTIVOS_FILA_INICIO; r < FESTIVOS_FILA_INICIO + FESTIVOS_FILAS; r++) {
        const nombre = celdaTexto(sheet.getCell(r, 1).value);
        const { texto: inicioTexto, fecha: inicio } = leerCeldaFecha(sheet.getCell(r, 2).value);
        const { texto: finTexto, fecha: fin } = leerCeldaFecha(sheet.getCell(r, 3).value);
        if (!nombre && !inicioTexto && !finTexto) continue; // fila vacía
        if (!nombre || !inicio || !fin) {
            errores.push(`Fila ${r} (${HOJA_CURSO} — Festivos): faltan datos o la fecha no tiene forma DD/MM/AAAA.`);
            continue;
        }
        holidays.push({ nombre, fechaInicio: inicio, fechaFin: fin });
    }

    const evaluationPeriods: FilaPeriodoEvaluacion[] = [];
    for (let r = EVALUACIONES_FILA_INICIO; r < EVALUACIONES_FILA_INICIO + EVALUACIONES_FILAS; r++) {
        const nombre = celdaTexto(sheet.getCell(r, 1).value);
        const { texto: inicioTexto, fecha: inicio } = leerCeldaFecha(sheet.getCell(r, 2).value);
        const { texto: finTexto, fecha: fin } = leerCeldaFecha(sheet.getCell(r, 3).value);
        const pesoTexto = celdaTexto(sheet.getCell(r, 4).value);
        if (!nombre && !inicioTexto && !finTexto) continue; // fila vacía
        if (!nombre || !inicio || !fin) {
            errores.push(`Fila ${r} (${HOJA_CURSO} — Periodos de evaluación): faltan datos o la fecha no tiene forma DD/MM/AAAA.`);
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

// Cada celda no vacía de la fila de días marca el inicio de un bloque de
// día (su valor, normalizado); el bloque se extiende hasta la siguiente
// celda no vacía de esa fila (o el final de las columnas usadas). OJO: al
// leer una celda combinada, exceljs devuelve el mismo valor en TODAS las
// celdas del rango (no solo en la superior-izquierda) — `cell.isMerged` es
// cierto tanto para la maestra como para sus "espejos", así que no sirve
// para distinguirlas; el tipo de celda sí: los espejos tienen
// `type === ValueType.Merge` (1), la maestra conserva su tipo real.
function detectarBloquesDia(sheet: import('exceljs').Worksheet, errores: string[]): BloqueDia[] {
    const rowDia = sheet.getRow(HORARIO_FILA_DIA);
    const marcas: { col: number; dia: number | null; textoOriginal: string }[] = [];
    rowDia.eachCell({ includeEmpty: false }, (cell, colNumber) => {
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
// subcolumna Nivel/Materia/Grupo/Aula por el TEXTO de su cabecera — no por
// posición fija, así que reordenar columnas dentro de un bloque no rompe
// el parseo.
function mapearSubcolumnas(sheet: import('exceljs').Worksheet, bloque: BloqueDia, errores: string[]): MapaSubcolumnas | null {
    const rowSubcol = sheet.getRow(HORARIO_FILA_SUBCOL);
    const mapa: Partial<MapaSubcolumnas> = {};
    for (let c = bloque.colInicio; c <= bloque.colFin; c++) {
        const clave = sinAcentos(celdaTexto(rowSubcol.getCell(c).value).toLowerCase());
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

        // Admite un rango real ("08:15 - 09:10") o, si no lo parsea, una
        // etiqueta libre para toda la franja (p.ej. "Recreo") — igual de
        // válido que las franjas horarias de la propia app, que tampoco
        // exigen horas. `buildImportPlan` (compartido con la importación
        // PDF) construye el nombre final de la franja como
        // "inicio-fin" salvo que coincidan, en cuyo caso usa solo el
        // texto — así una etiqueta libre no sale duplicada.
        const rango = parsearRangoHoras(horaTexto);
        const [horaInicio, horaFin] = rango ?? [horaTexto, horaTexto];

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
    const header = sheet.getRow(ALUMNADO_FILA_CABECERA);
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
    // Fecha Nacimiento admite una fecha real de Excel (ver `leerCeldaFecha`)
    // además del texto libre AAAA-MM-DD que ya se aceptaba — sin bloquear
    // la fila si no encaja en ninguno de los dos, es un campo opcional.
    const valorFecha = (row: import('exceljs').Row, campo: string): string | null => {
        const idx = indices.get(campo);
        return idx ? leerCeldaFecha(row.getCell(idx).value).fecha : null;
    };

    const alumnado: FilaAlumnado[] = [];

    for (let r = ALUMNADO_FILA_DATOS_INICIO; r <= sheet.rowCount; r++) {
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
            fechaNacimiento: valorFecha(row, 'fechanacimiento'),
            dni: valor(row, 'dni') || null,
            acneae: acneaeTexto ? acneaeTexto.split(',').map(s => s.trim()).filter(Boolean) : [],
        });
    }

    return alumnado;
}
