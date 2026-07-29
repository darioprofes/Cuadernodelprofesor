import type { ClassData, Course } from './types';

// Las fotos de alumnado (Student.foto, data URL) viven aparte del blob
// principal (ver App.tsx: photosApi, /api/photos) para que el autoguardado
// frecuente del blob no tenga que resubir todas las fotos en cada cambio
// ajeno a ellas. Estos 3 helpers son el punto único de conversión entre
// "las clases tal como las usa la UI" (con foto) y "las clases tal como se
// guardan en el blob" (sin foto).
export const extractPhotos = (classes: ClassData[]): Record<string, string> => {
    const photos: Record<string, string> = {};
    classes.forEach(cls => cls.students.forEach(s => {
        if (s.foto) photos[s.id] = s.foto;
    }));
    return photos;
};

export const stripPhotos = (classes: ClassData[]): ClassData[] =>
    classes.map(cls => ({
        ...cls,
        students: cls.students.map(s => ({ ...s, foto: undefined })),
    }));

export const mergePhotos = (classes: ClassData[], photos: Record<string, string>): ClassData[] =>
    classes.map(cls => ({
        ...cls,
        students: cls.students.map(s => photos[s.id] ? { ...s, foto: photos[s.id] } : s),
    }));

// Patrón "subir imagen -> data URL" reutilizado por varios pickers de icono/
// foto (clase, acceso directo, ficha de alumno...) que antes reimplementaban
// su propio FileReader por separado.
export const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

// Orden natural para códigos curriculares ("1.1"/"1.10"/"2.1", "A.1"/"K.4",
// "CEs 1".."CEs 6", "CCL1".."CCL10"...): localeCompare con numeric:true trata
// cada tramo de dígitos como número en vez de comparar caracter a caracter
// (si no, "1.10" quedaría antes que "1.2").
export const compararCodigo = (a: string, b: string): number =>
    a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

export const buildClassName = (grupo: string | undefined, materia: string): string => {
    return grupo ? `${grupo} - ${materia}` : materia;
};

export const getMateria = (classData: ClassData, courses: Course[]): string => {
    const course = courses.find(c => c.id === classData.courseId);
    return course?.subject || '';
};

// Texto único "Grupo - Materia", calculado al vuelo: no se guarda en
// ClassData para no duplicar lo que ya viven grupo/materia por separado.
// Solo para sitios que de verdad necesitan una única cadena (orden
// alfabético, nombres de fichero, semilla de color determinista...).
export const getClassName = (classData: ClassData, courses: Course[]): string => {
    return buildClassName(classData.grupo, getMateria(classData, courses));
};

// Para sitios que solo admiten texto plano (<option>, CSV, atributos title...):
// no se puede separar visualmente ahí, así que se ordena como "Materia (Grupo)".
export const formatClassLabel = (classData: ClassData, courses: Course[]): string => {
    const materia = getMateria(classData, courses);
    return classData.grupo ? `${materia} (${classData.grupo})` : materia;
};

// Color estable por materia (no por nivel de curso), para distinguir
// asignaturas/actividades entre sí en vez de un gris plano — usado en el
// Horario Semanal, las cabeceras del Cuaderno y el Diario de Clase.
const hashHue = (text: string): number => {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
};

export interface ClassAccentColor {
    cellBg: string;   // fondo pastel (celdas del Horario)
    pillBg: string;   // insignia de grupo, algo más saturada que cellBg
    text: string;      // texto oscuro legible sobre cellBg/pillBg
    headerBg: string; // fondo intenso para cabeceras con texto blanco
}

// Tonos repartidos por la rueda de color para elegir a mano el acento de una
// clase u ocupación (ver getClassAccentColor abajo); compartido entre
// ClassModal (clases académicas) y CourseManager (otras ocupaciones).
export const HUE_PRESETS = [0, 25, 50, 90, 150, 190, 220, 260, 300, 335];

// Blanco y negro no son un tono de la rueda de color (hsl con saturación),
// así que se marcan con valores fuera del rango real de hueOverride (0-360)
// y getClassAccentColor los trata aparte.
export const ACCENT_WHITE = -1;
export const ACCENT_BLACK = -2;

// `hueOverride` (0-360, o ACCENT_WHITE/ACCENT_BLACK) permite fijar el color a
// mano desde Ajustes → Clases y Alumnado en vez de dejarlo siempre al hash
// de la materia. cellBg y pillBg comparten `text` en los sitios donde se
// usan juntos (p.ej. la franja del Horario y su insignia de grupo), así que
// deben tener luminosidad parecida entre sí — por eso "negro" usa fondos
// oscuros con texto claro en vez de un negro puro sobre fondo claro.
export const getClassAccentColor = (materia: string, hueOverride?: number): ClassAccentColor => {
    if (hueOverride === ACCENT_WHITE) {
        return { cellBg: '#f8fafc', pillBg: '#e2e8f0', text: '#334155', headerBg: '#475569' };
    }
    if (hueOverride === ACCENT_BLACK) {
        return { cellBg: '#334155', pillBg: '#1e293b', text: '#f8fafc', headerBg: '#0f172a' };
    }
    const hue = hueOverride ?? hashHue(materia);
    return {
        cellBg: `hsl(${hue}, 60%, 95%)`,
        pillBg: `hsl(${hue}, 55%, 85%)`,
        text: `hsl(${hue}, 55%, 32%)`,
        headerBg: `hsl(${hue}, 45%, 42%)`,
    };
};

const CONECTORES = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'a', 'para', 'con', 'al']);

// Siglas calculadas solo para mostrar en sitios muy justos de espacio (la
// cuadrícula del Horario Semanal): no se guarda ni sustituye el nombre real
// de la materia en ningún otro sitio de la app. Si el nombre ya es corto
// (p.ej. "CHL", "G" en las ocupaciones sin grupo importadas del PDF), no
// hace falta abreviarlo más: se deja tal cual.
export const getSiglas = (materia: string): string => {
    const limpio = materia.trim();

    if (limpio.length <= 6) return limpio;

    const palabras = limpio
        .split(/[\s-]+/)
        .filter(w => w.length > 0 && !CONECTORES.has(w.toLowerCase()));

    const siglas = palabras.map(w => w[0].toUpperCase()).join('');

    if (siglas.length >= 2) return siglas;

    return limpio.slice(0, 6).toUpperCase();
};

// Divide un nombre completo en sus partes. Formatos aceptados:
//   "Apellido1, Apellido2, Nombre"   (preferido, permite apellidos compuestos)
//   "Apellido1 Apellido2, Nombre"    (una sola coma, formato Sauce/Séneca)
//   "Nombre Apellido1 Apellido2"     (sin coma)
export const parsearNombre = (raw: string): { nombre: string; primerApellido: string; segundoApellido: string } => {
    const trimmed = raw.trim();
    const parts = trimmed.split(',').map(p => p.trim());
    if (parts.length >= 3) {
        return { primerApellido: parts[0], segundoApellido: parts[1], nombre: parts.slice(2).join(', ') };
    }
    if (parts.length === 2) {
        const apellidosWords = parts[0].split(/\s+/);
        return { primerApellido: apellidosWords[0] || '', segundoApellido: apellidosWords.slice(1).join(' '), nombre: parts[1] };
    }
    const words = trimmed.split(/\s+/);
    if (words.length >= 2) {
        return { nombre: words[0], primerApellido: words[1], segundoApellido: words.slice(2).join(' ') };
    }
    return { nombre: trimmed, primerApellido: '', segundoApellido: '' };
};

export const reconstruirNombre = (primerApellido?: string, segundoApellido?: string, nombre?: string): string =>
    [primerApellido, segundoApellido, nombre].filter(Boolean).join(' ');

// --- Fechas (hora local, no UTC — para "hoy" en el reloj del navegador) ---

export const toYYYYMMDD = (date: Date): string => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// Formato de fecha para mostrar al usuario (dd-mm-aaaa, el habitual en
// España) a partir de una fecha guardada en YYYY-MM-DD. Deliberadamente no
// pasa por Date/toLocaleDateString: evita el redondeo de zona horaria (un
// "YYYY-MM-DD" parseado con `new Date()` se interpreta en UTC y puede
// mostrar el día anterior/siguiente según el huso del navegador) y evita
// también depender del separador que use la configuración regional del
// navegador (que en la práctica suele dar "/" en vez del "-" pedido aquí).
export const formatFechaEs = (fecha: string): string => {
    const [y, m, d] = fecha.split('-');
    return `${d}-${m}-${y}`;
};

export const addDays = (date: Date, days: number): Date => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};

// 1=Lunes...5=Viernes, 6=Sábado, 7=Domingo — misma convención que
// ClassData.schedule[].day (Date.getDay() nativo es 0=Domingo).
export const getDayOfWeek1a7 = (date: Date): number => {
    const day = date.getDay();
    return day === 0 ? 7 : day;
};

// Extrae "HH:MM" de inicio/fin de una etiqueta de franja horaria, tolerando
// tanto el formato puro que genera el import de PDF ("8:15-9:10") como el
// de las franjas de ejemplo ("1ª Hora (8:00-8:55)"). Devuelve minutos desde
// medianoche para poder comparar contra la hora actual.
export const parsePeriodRange = (label: string): { startMin: number; endMin: number } | null => {
    const match = label.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (!match) return null;

    const [, h1, m1, h2, m2] = match;
    return {
        startMin: parseInt(h1, 10) * 60 + parseInt(m1, 10),
        endMin: parseInt(h2, 10) * 60 + parseInt(m2, 10),
    };
};
