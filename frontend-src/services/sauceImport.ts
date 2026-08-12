// Importación de alumnado desde el listado que exporta SAUCE (aplicación
// de gestión académica del Principado de Asturias): columnas Alumno/a, Nº
// Id. Escolar (NIE), Nº Expte. centro, DNI/Pasaporte, Fecha de nacimiento,
// Curso, Fecha de creación, Unidad, Nacionalidad. Formato de "Alumno/a":
// "APELLIDO1 APELLIDO2, NOMBRE".
//
// Funciones puras, sin React ni backend — el mismo módulo sirve tanto para
// subir el .xlsx real de SAUCE como para pegar la tabla como texto (dos
// formas de llegar al mismo SauceRow[], pedidas explícitamente por el
// usuario: "no siempre se tienen esos excels a mano").
//
// Solo se importan los campos que ya tienen hueco en STUDENT (persona
// global, ver types.ts): nombre/apellidos, NIE, DNI/Pasaporte, fecha de
// nacimiento, nacionalidad. Nº Expte. centro/Curso/Unidad/Fecha de
// creación no se persisten (no hay campo equivalente y son datos de
// contexto administrativo, no de la persona) — se conservan en SauceRow
// solo para que la tabla de revisión los muestre como referencia.
//
// Emparejamiento contra el alumnado ya existente (matchSauceRow, al final
// del fichero): el NIE es la clave real — a diferencia del DNI, todo el
// alumnado lo tiene desde que se matricula, así que una coincidencia de
// NIE se fusiona sin preguntar. Sin NIE (fila importada o alumno existente
// sin rellenar), se cae a comparar nombre completo — pero eso sí es
// ambiguo (dos alumnos pueden llamarse igual), así que solo se marca como
// "posible duplicado" para que el profesor decida, nunca se fusiona solo.

export interface SauceRow {
    nombre: string;
    primerApellido: string;
    segundoApellido: string;
    nie: string | null;
    dni: string | null;
    fechaNacimiento: string | null; // YYYY-MM-DD
    nacionalidad: string | null;
    // Contexto, no se persiste (ver cabecera del fichero).
    curso: string | null;
    unidad: string | null;
    filaOrigen: number; // 1-based, para señalar errores al usuario
}

export interface SauceImportResult {
    filas: SauceRow[];
    errores: string[];
}

const sinAcentos = (texto: string): string =>
    texto.normalize('NFKD').replace(/[̀-ͯ]/g, '');

const normalizarClave = (texto: string): string =>
    sinAcentos(texto.trim().toLowerCase()).replace(/[^a-z0-9]/g, '');

// Cada clave posible (ya normalizada, sin acentos/espacios/puntuación) que
// puede traer la cabecera de SAUCE para esa columna — tolera alguna
// variación razonable de redacción sin depender de un texto exacto.
const CLAVES_COLUMNA: Record<keyof typeof CAMPOS_SAUCE, string[]> = {
    alumno: ['alumnoa', 'alumno', 'nombrealumno'],
    // "Nº" se normaliza a "no" (NFKD descompone "º" en "o") — de ahí
    // "noidescolar", no "nidescolar".
    nie: ['noidescolar', 'nidescolar', 'idescolar', 'nie'],
    dni: ['dnipasaporte', 'dni', 'pasaporte'],
    fechaNacimiento: ['fechadenacimiento', 'fechanacimiento'],
    curso: ['curso'],
    unidad: ['unidad'],
    nacionalidad: ['nacionalidad'],
};

// Placeholder tipado — CLAVES_COLUMNA arriba lo referencia solo por sus
// claves (keyof), nunca se usa como valor.
const CAMPOS_SAUCE = { alumno: 0, nie: 0, dni: 0, fechaNacimiento: 0, curso: 0, unidad: 0, nacionalidad: 0 };

const FECHA_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FECHA_DDMMYYYY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

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
    const yyyy = String(y).padStart(4, '0');
    const mm = String(mo).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const utcAFechaISO = (ms: number): string => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

// Admite tanto texto (DD/MM/AAAA o AAAA-MM-DD) como una fecha real de Excel.
const leerFecha = (valor: unknown): string | null => {
    if (valor instanceof Date) return utcAFechaISO(valor.getTime());
    if (valor === null || valor === undefined) return null;
    return parsearFechaTexto(String(valor).trim());
};

// "APELLIDO1 APELLIDO2, NOMBRE" -> partes. Sin coma (formato inesperado):
// se trata todo como apellidos y el nombre queda vacío, para que la fila
// se marque como incompleta en vez de perder el dato entero. Con más de 2
// palabras en el bloque de apellidos (apellido compuesto): se asume que la
// última palabra es el segundo apellido y el resto el primero — es una
// heurística, no una regla real; la fila queda igual editable en la
// revisión antes de confirmar.
export function parseAlumnoSauce(raw: string): { nombre: string; primerApellido: string; segundoApellido: string } {
    const texto = raw.trim();
    const idxComa = texto.indexOf(',');
    if (idxComa === -1) {
        return { nombre: '', primerApellido: texto, segundoApellido: '' };
    }
    const apellidos = texto.slice(0, idxComa).trim();
    const nombre = texto.slice(idxComa + 1).trim();
    const palabras = apellidos.split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return { nombre, primerApellido: '', segundoApellido: '' };
    if (palabras.length === 1) return { nombre, primerApellido: palabras[0], segundoApellido: '' };
    if (palabras.length === 2) return { nombre, primerApellido: palabras[0], segundoApellido: palabras[1] };
    return { nombre, primerApellido: palabras.slice(0, -1).join(' '), segundoApellido: palabras[palabras.length - 1] };
}

const celda = (valor: unknown): string => {
    if (valor === null || valor === undefined) return '';
    return String(valor).trim();
};

// Construye una fila a partir de los valores ya extraídos por columna
// (compartido entre el parseo de Excel y el de texto pegado). `numeroFila`
// es 1-based tal como lo ve el usuario (para señalar errores).
function construirFila(valores: Record<string, unknown>, numeroFila: number, errores: string[]): SauceRow | null {
    const alumnoTexto = celda(valores.alumno);
    if (!alumnoTexto) return null; // fila vacía, se descarta sin más

    const { nombre, primerApellido, segundoApellido } = parseAlumnoSauce(alumnoTexto);
    if (!nombre || !primerApellido) {
        errores.push(`Fila ${numeroFila}: no se pudo interpretar "${alumnoTexto}" como "Apellidos, Nombre".`);
        return null;
    }

    return {
        nombre,
        primerApellido,
        segundoApellido,
        nie: celda(valores.nie) || null,
        dni: celda(valores.dni) || null,
        fechaNacimiento: leerFecha(valores.fechaNacimiento),
        nacionalidad: celda(valores.nacionalidad) || null,
        curso: celda(valores.curso) || null,
        unidad: celda(valores.unidad) || null,
        filaOrigen: numeroFila,
    };
}

// Busca, entre las primeras filas de una tabla ya trocead en celdas, cuál
// es la fila de cabecera real (misma idea que horario_pdf.py en el
// backend: localizar "Alumno" en vez de asumir que la fila 1 siempre lo
// es) y devuelve el índice de columna (0-based) de cada campo reconocido.
function localizarCabecera(filas: string[][]): { filaCabecera: number; columnas: Partial<Record<keyof typeof CAMPOS_SAUCE, number>> } | null {
    for (let f = 0; f < Math.min(filas.length, 10); f++) {
        const columnas: Partial<Record<keyof typeof CAMPOS_SAUCE, number>> = {};
        filas[f].forEach((texto, c) => {
            const clave = normalizarClave(texto);
            (Object.keys(CLAVES_COLUMNA) as (keyof typeof CAMPOS_SAUCE)[]).forEach(campo => {
                if (CLAVES_COLUMNA[campo].includes(clave) && columnas[campo] === undefined) {
                    columnas[campo] = c;
                }
            });
        });
        if (columnas.alumno !== undefined) return { filaCabecera: f, columnas };
    }
    return null;
}

export function parseSauceText(texto: string): SauceImportResult {
    const lineas = texto.split(/\r\n|\r|\n/).filter(l => l.trim().length > 0);
    const tabla = lineas.map(l => l.split('\t'));

    const cabecera = localizarCabecera(tabla);
    if (!cabecera) {
        return { filas: [], errores: ['No se encuentra una columna "Alumno/a" en el texto pegado — comprueba que incluyes la fila de cabecera.'] };
    }

    const errores: string[] = [];
    const filas: SauceRow[] = [];
    for (let f = cabecera.filaCabecera + 1; f < tabla.length; f++) {
        const valores: Record<string, unknown> = {};
        (Object.keys(cabecera.columnas) as (keyof typeof CAMPOS_SAUCE)[]).forEach(campo => {
            const col = cabecera.columnas[campo];
            if (col !== undefined) valores[campo] = tabla[f][col];
        });
        const fila = construirFila(valores, f + 1, errores);
        if (fila) filas.push(fila);
    }

    return { filas, errores };
}

export interface SauceMatch {
    kind: 'nie' | 'nombre' | 'nuevo';
    student: { id: string; nombre?: string; primerApellido?: string; segundoApellido?: string; nie?: string } | null;
}

const normalizarNombre = (s: string): string => normalizarClave(s);

// NIE primero (fusión directa, sin ambigüedad); si no hay NIE en la fila o
// en ningún alumno existente, cae a nombre completo exacto (normalizado) —
// eso solo se marca como "posible duplicado", nunca se fusiona sin más.
export function matchSauceRow<S extends { id: string; nombre?: string; primerApellido?: string; segundoApellido?: string; nie?: string }>(
    row: SauceRow, existing: S[]
): SauceMatch {
    if (row.nie) {
        const porNie = existing.find(s => s.nie && s.nie === row.nie);
        if (porNie) return { kind: 'nie', student: porNie };
    }
    const nombreCompleto = normalizarNombre(`${row.primerApellido} ${row.segundoApellido} ${row.nombre}`);
    const porNombre = existing.find(s =>
        normalizarNombre(`${s.primerApellido || ''} ${s.segundoApellido || ''} ${s.nombre || ''}`) === nombreCompleto
    );
    if (porNombre) return { kind: 'nombre', student: porNombre };
    return { kind: 'nuevo', student: null };
}

export async function parseSauceExcel(buffer: ArrayBuffer): Promise<SauceImportResult> {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load(buffer);

    const sheet = wb.worksheets[0];
    if (!sheet) {
        return { filas: [], errores: ['El archivo no tiene ninguna hoja.'] };
    }

    // Solo hace falta texto para localizar la cabecera — los valores reales
    // (incluida la fecha, que puede venir como Date de Excel) se vuelven a
    // leer directamente de la celda al construir cada fila.
    const filasTexto: string[][] = [];
    for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
        const row = sheet.getRow(r);
        const fila: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => { fila[colNumber - 1] = celda(cell.value); });
        filasTexto.push(fila);
    }

    const cabecera = localizarCabecera(filasTexto);
    if (!cabecera) {
        return { filas: [], errores: ['No se encuentra una columna "Alumno/a" en las primeras filas del archivo.'] };
    }

    const errores: string[] = [];
    const filas: SauceRow[] = [];
    for (let r = cabecera.filaCabecera + 2; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const valores: Record<string, unknown> = {};
        (Object.keys(cabecera.columnas) as (keyof typeof CAMPOS_SAUCE)[]).forEach(campo => {
            const col = cabecera.columnas[campo];
            if (col !== undefined) valores[campo] = row.getCell(col + 1).value;
        });
        const fila = construirFila(valores, r, errores);
        if (fila) filas.push(fila);
    }

    return { filas, errores };
}
