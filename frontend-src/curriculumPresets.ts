// Currículos preseleccionables en el Gestor del Currículo (Ajustes > Currículo).
// Dos orígenes distintos, con el mismo formato de CSV (parseCurriculumCsv):
//  - "oficial: true"  — decreto LOMLOE de ESO del Principado de Asturias, un CSV por
//    materia/curso. Los códigos (BG, LCL, LAL...) son los que usa la propia
//    documentación oficial, no una traducción, para que el profesor los reconozca.
//  - "oficial: false" — currículos propios del profesor para asignaturas sin decreto
//    (p.ej. el Ámbito Científico-Tecnológico de un programa de Diversificación). Se
//    ofrecen igual de seleccionables, pero SIEMPRE marcados como no oficiales en la UI:
//    ver `oficial` más abajo y su uso en CurriculumManager.tsx.
export interface CurriculumPreset {
    id: string;
    codigo: string;
    curso: number;
    variante: string | null;
    ruta: string;
    etiqueta: string;
    oficial: boolean;
    // ESO y Bachillerato comparten numeración de curso (1º-2º de Bachillerato
    // solapan con 1º-2º de ESO) — sin esto, elegir un curso en el selector
    // mezclaría currículos de las dos etapas en la misma lista.
    etapa: 'eso' | 'bachillerato';
    // Nombre completo de la materia — el código corto (p.ej. "DTAP", "MACS")
    // no siempre es reconocible a simple vista, así que se muestra como
    // tooltip nativo (title) en el desplegable de currículos preseleccionados.
    materia: string;
}

export const CURRICULOS_OFICIALES: CurriculumPreset[] = [
    { id: 'bg1', codigo: 'BG', curso: 1, variante: null, ruta: '/curriculos-oficiales/bg1.csv', etiqueta: 'BG · 1º ESO', oficial: true, etapa: 'eso' , materia: 'Biología y Geología' },
    { id: 'bg3', codigo: 'BG', curso: 3, variante: null, ruta: '/curriculos-oficiales/bg3.csv', etiqueta: 'BG · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Biología y Geología' },
    { id: 'bg4', codigo: 'BG', curso: 4, variante: null, ruta: '/curriculos-oficiales/bg4.csv', etiqueta: 'BG · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Biología y Geología' },
    { id: 'cc2', codigo: 'CC', curso: 2, variante: null, ruta: '/curriculos-oficiales/cc2.csv', etiqueta: 'CC · 2º ESO', oficial: true, etapa: 'eso' , materia: 'Cultura Clásica' },
    { id: 'dig4', codigo: 'DIG', curso: 4, variante: null, ruta: '/curriculos-oficiales/dig4.csv', etiqueta: 'DIG · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Digitalización' },
    { id: 'diga1', codigo: 'DIGA', curso: 1, variante: null, ruta: '/curriculos-oficiales/diga1.csv', etiqueta: 'DIGA · 1º ESO', oficial: true, etapa: 'eso' , materia: 'Digitalización Aplicada' },
    { id: 'eart4', codigo: 'EART', curso: 4, variante: null, ruta: '/curriculos-oficiales/eart4.csv', etiqueta: 'EART · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Expresión Artística' },
    { id: 'eco4', codigo: 'ECO', curso: 4, variante: null, ruta: '/curriculos-oficiales/eco4.csv', etiqueta: 'ECO · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Economía y Emprendimiento' },
    { id: 'ef1', codigo: 'EF', curso: 1, variante: null, ruta: '/curriculos-oficiales/ef1.csv', etiqueta: 'EF · 1º ESO', oficial: true, etapa: 'eso' , materia: 'Educación Física' },
    { id: 'ef2', codigo: 'EF', curso: 2, variante: null, ruta: '/curriculos-oficiales/ef2.csv', etiqueta: 'EF · 2º ESO', oficial: true, etapa: 'eso' , materia: 'Educación Física' },
    { id: 'ef3', codigo: 'EF', curso: 3, variante: null, ruta: '/curriculos-oficiales/ef3.csv', etiqueta: 'EF · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Educación Física' },
    { id: 'ef4', codigo: 'EF', curso: 4, variante: null, ruta: '/curriculos-oficiales/ef4.csv', etiqueta: 'EF · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Educación Física' },
    { id: 'epva1', codigo: 'EPVA', curso: 1, variante: null, ruta: '/curriculos-oficiales/epva1.csv', etiqueta: 'EPVA · 1º ESO', oficial: true, etapa: 'eso' , materia: 'Educación Plástica, Visual y Audiovisual' },
    { id: 'epva3', codigo: 'EPVA', curso: 3, variante: null, ruta: '/curriculos-oficiales/epva3.csv', etiqueta: 'EPVA · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Educación Plástica, Visual y Audiovisual' },
    { id: 'evce3', codigo: 'EVCE', curso: 3, variante: null, ruta: '/curriculos-oficiales/evce3.csv', etiqueta: 'EVCE · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Educación en Valores Cívicos y Éticos' },
    { id: 'fil4', codigo: 'FIL', curso: 4, variante: null, ruta: '/curriculos-oficiales/fil4.csv', etiqueta: 'FIL · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Filosofía' },
    { id: 'fopp4', codigo: 'FOPP', curso: 4, variante: null, ruta: '/curriculos-oficiales/fopp4.csv', etiqueta: 'FOPP · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Formación y Orientación Personal y Profesional' },
    { id: 'fq2', codigo: 'FQ', curso: 2, variante: null, ruta: '/curriculos-oficiales/fq2.csv', etiqueta: 'FQ · 2º ESO', oficial: true, etapa: 'eso' , materia: 'Física y Química' },
    { id: 'fq3', codigo: 'FQ', curso: 3, variante: null, ruta: '/curriculos-oficiales/fq3.csv', etiqueta: 'FQ · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Física y Química' },
    { id: 'fq4', codigo: 'FQ', curso: 4, variante: null, ruta: '/curriculos-oficiales/fq4.csv', etiqueta: 'FQ · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Física y Química' },
    { id: 'gh1', codigo: 'GH', curso: 1, variante: null, ruta: '/curriculos-oficiales/gh1.csv', etiqueta: 'GH · 1º ESO', oficial: true, etapa: 'eso' , materia: 'Geografía e Historia' },
    { id: 'gh2', codigo: 'GH', curso: 2, variante: null, ruta: '/curriculos-oficiales/gh2.csv', etiqueta: 'GH · 2º ESO', oficial: true, etapa: 'eso' , materia: 'Geografía e Historia' },
    { id: 'gh3', codigo: 'GH', curso: 3, variante: null, ruta: '/curriculos-oficiales/gh3.csv', etiqueta: 'GH · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Geografía e Historia' },
    { id: 'gh4', codigo: 'GH', curso: 4, variante: null, ruta: '/curriculos-oficiales/gh4.csv', etiqueta: 'GH · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Geografía e Historia' },
    { id: 'lal1', codigo: 'LAL', curso: 1, variante: null, ruta: '/curriculos-oficiales/lal1.csv', etiqueta: 'LAL · 1º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Asturiana y Literatura' },
    { id: 'lal2', codigo: 'LAL', curso: 2, variante: null, ruta: '/curriculos-oficiales/lal2.csv', etiqueta: 'LAL · 2º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Asturiana y Literatura' },
    { id: 'lal3', codigo: 'LAL', curso: 3, variante: null, ruta: '/curriculos-oficiales/lal3.csv', etiqueta: 'LAL · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Asturiana y Literatura' },
    { id: 'lal4', codigo: 'LAL', curso: 4, variante: null, ruta: '/curriculos-oficiales/lal4.csv', etiqueta: 'LAL · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Asturiana y Literatura' },
    { id: 'lat4', codigo: 'LAT', curso: 4, variante: null, ruta: '/curriculos-oficiales/lat4.csv', etiqueta: 'LAT · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Latín' },
    { id: 'lcl1', codigo: 'LCL', curso: 1, variante: null, ruta: '/curriculos-oficiales/lcl1.csv', etiqueta: 'LCL · 1º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Castellana y Literatura' },
    { id: 'lcl2', codigo: 'LCL', curso: 2, variante: null, ruta: '/curriculos-oficiales/lcl2.csv', etiqueta: 'LCL · 2º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Castellana y Literatura' },
    { id: 'lcl3', codigo: 'LCL', curso: 3, variante: null, ruta: '/curriculos-oficiales/lcl3.csv', etiqueta: 'LCL · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Castellana y Literatura' },
    { id: 'lcl4', codigo: 'LCL', curso: 4, variante: null, ruta: '/curriculos-oficiales/lcl4.csv', etiqueta: 'LCL · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Castellana y Literatura' },
    { id: 'le1', codigo: 'LE', curso: 1, variante: null, ruta: '/curriculos-oficiales/le1.csv', etiqueta: 'LE · 1º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Extranjera' },
    { id: 'le2', codigo: 'LE', curso: 2, variante: null, ruta: '/curriculos-oficiales/le2.csv', etiqueta: 'LE · 2º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Extranjera' },
    { id: 'le3', codigo: 'LE', curso: 3, variante: null, ruta: '/curriculos-oficiales/le3.csv', etiqueta: 'LE · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Extranjera' },
    { id: 'le4', codigo: 'LE', curso: 4, variante: null, ruta: '/curriculos-oficiales/le4.csv', etiqueta: 'LE · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Lengua Extranjera' },
    { id: 'mat1', codigo: 'MAT', curso: 1, variante: null, ruta: '/curriculos-oficiales/mat1.csv', etiqueta: 'MAT · 1º ESO', oficial: true, etapa: 'eso' , materia: 'Matemáticas' },
    { id: 'mat2', codigo: 'MAT', curso: 2, variante: null, ruta: '/curriculos-oficiales/mat2.csv', etiqueta: 'MAT · 2º ESO', oficial: true, etapa: 'eso' , materia: 'Matemáticas' },
    { id: 'mat3', codigo: 'MAT', curso: 3, variante: null, ruta: '/curriculos-oficiales/mat3.csv', etiqueta: 'MAT · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Matemáticas' },
    { id: 'mat4a', codigo: 'MAT', curso: 4, variante: "A", ruta: '/curriculos-oficiales/mat4a.csv', etiqueta: 'MAT · 4º ESO (A)', oficial: true, etapa: 'eso' , materia: 'Matemáticas' },
    { id: 'mat4b', codigo: 'MAT', curso: 4, variante: "B", ruta: '/curriculos-oficiales/mat4b.csv', etiqueta: 'MAT · 4º ESO (B)', oficial: true, etapa: 'eso' , materia: 'Matemáticas' },
    { id: 'mus1', codigo: 'MUS', curso: 1, variante: null, ruta: '/curriculos-oficiales/mus1.csv', etiqueta: 'MUS · 1º ESO', oficial: true, etapa: 'eso' , materia: 'Música' },
    { id: 'mus2', codigo: 'MUS', curso: 2, variante: null, ruta: '/curriculos-oficiales/mus2.csv', etiqueta: 'MUS · 2º ESO', oficial: true, etapa: 'eso' , materia: 'Música' },
    { id: 'mus4', codigo: 'MUS', curso: 4, variante: null, ruta: '/curriculos-oficiales/mus4.csv', etiqueta: 'MUS · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Música' },
    { id: 'pese3', codigo: 'PESE', curso: 3, variante: null, ruta: '/curriculos-oficiales/pese3.csv', etiqueta: 'PESE · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Proyecto de Emprendimiento Social o Empresarial' },
    { id: 'sle1', codigo: 'SLE', curso: 1, variante: null, ruta: '/curriculos-oficiales/sle1.csv', etiqueta: 'SLE · 1º ESO', oficial: true, etapa: 'eso' , materia: 'Segunda Lengua Extranjera' },
    { id: 'sle2', codigo: 'SLE', curso: 2, variante: null, ruta: '/curriculos-oficiales/sle2.csv', etiqueta: 'SLE · 2º ESO', oficial: true, etapa: 'eso' , materia: 'Segunda Lengua Extranjera' },
    { id: 'sle3', codigo: 'SLE', curso: 3, variante: null, ruta: '/curriculos-oficiales/sle3.csv', etiqueta: 'SLE · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Segunda Lengua Extranjera' },
    { id: 'sle4', codigo: 'SLE', curso: 4, variante: null, ruta: '/curriculos-oficiales/sle4.csv', etiqueta: 'SLE · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Segunda Lengua Extranjera' },
    { id: 'tea4', codigo: 'TEA', curso: 4, variante: null, ruta: '/curriculos-oficiales/tea4.csv', etiqueta: 'TEA · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Taller de Economía Aplicada' },
    { id: 'tec4', codigo: 'TEC', curso: 4, variante: null, ruta: '/curriculos-oficiales/tec4.csv', etiqueta: 'TEC · 4º ESO', oficial: true, etapa: 'eso' , materia: 'Tecnología' },
    { id: 'tyd2', codigo: 'TYD', curso: 2, variante: null, ruta: '/curriculos-oficiales/tyd2.csv', etiqueta: 'TYD · 2º ESO', oficial: true, etapa: 'eso' , materia: 'Tecnología y Digitalización' },
    { id: 'tyd3', codigo: 'TYD', curso: 3, variante: null, ruta: '/curriculos-oficiales/tyd3.csv', etiqueta: 'TYD · 3º ESO', oficial: true, etapa: 'eso' , materia: 'Tecnología y Digitalización' },
];

// Decreto 60/2022, de 30 de agosto (Bachillerato, Principado de Asturias) —
// mismo formato de CSV que el Decreto 59/2022 de la ESO de arriba. Los ids
// de 'ef1', 'lal1/2', 'lcl1/2', 'le1/2', 'mat1/2' y 'sle1/2' ya estaban
// ocupados por sus homónimos de ESO (mismo código de materia, mismo número
// de curso — 1º-2º de Bachillerato solapan con 1º-2º de ESO), así que estas
// llevan un prefijo 'b' delante del id (no del código, que sigue siendo el
// mismo): bef1, blal1, blal2, blcl1, blcl2, ble1, ble2, bmat1, bmat2, bsle1,
// bsle2. Quedan sin CSV (no localizadas en el Anexo II con ese título
// exacto, o reguladas de otro modo): Proyecto de Investigación Integrado,
// Recursos Energéticos y Sostenibilidad, Gestión de Fuentes Documentales y
// Comunicación, Economía-Emprendimiento y Actividad Empresarial, Religión.
export const CURRICULOS_OFICIALES_BACHILLERATO: CurriculumPreset[] = [
    { id: 'anap1', codigo: 'ANAP', curso: 1, variante: null, ruta: '/curriculos-oficiales/anap1.csv', etiqueta: 'ANAP · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Anatomía Aplicada' },
    { id: 'anmus1', codigo: 'ANMUS', curso: 1, variante: null, ruta: '/curriculos-oficiales/anmus1.csv', etiqueta: 'ANMUS · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Análisis Musical' },
    { id: 'anmus2', codigo: 'ANMUS', curso: 2, variante: null, ruta: '/curriculos-oficiales/anmus2.csv', etiqueta: 'ANMUS · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Análisis Musical' },
    { id: 'aresc1', codigo: 'ARESC', curso: 1, variante: null, ruta: '/curriculos-oficiales/aresc1.csv', etiqueta: 'ARESC · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Artes Escénicas' },
    { id: 'aresc2', codigo: 'ARESC', curso: 2, variante: null, ruta: '/curriculos-oficiales/aresc2.csv', etiqueta: 'ARESC · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Artes Escénicas' },
    { id: 'bio2', codigo: 'BIO', curso: 2, variante: null, ruta: '/curriculos-oficiales/bio2.csv', etiqueta: 'BIO · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Biología' },
    { id: 'bgca1', codigo: 'BGCA', curso: 1, variante: null, ruta: '/curriculos-oficiales/bgca1.csv', etiqueta: 'BGCA · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Biología, Geología y Ciencias Ambientales' },
    { id: 'cgen2', codigo: 'CGEN', curso: 2, variante: null, ruta: '/curriculos-oficiales/cgen2.csv', etiqueta: 'CGEN · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Ciencias Generales' },
    { id: 'ctv1', codigo: 'CTV', curso: 1, variante: null, ruta: '/curriculos-oficiales/ctv1.csv', etiqueta: 'CTV · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Coro y Técnica Vocal' },
    { id: 'ctv2', codigo: 'CTV', curso: 2, variante: null, ruta: '/curriculos-oficiales/ctv2.csv', etiqueta: 'CTV · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Coro y Técnica Vocal' },
    { id: 'cau1', codigo: 'CAU', curso: 1, variante: null, ruta: '/curriculos-oficiales/cau1.csv', etiqueta: 'CAU · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Cultura Audiovisual' },
    { id: 'dar1', codigo: 'DAR', curso: 1, variante: null, ruta: '/curriculos-oficiales/dar1.csv', etiqueta: 'DAR · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Dibujo Artístico' },
    { id: 'dar2', codigo: 'DAR', curso: 2, variante: null, ruta: '/curriculos-oficiales/dar2.csv', etiqueta: 'DAR · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Dibujo Artístico' },
    { id: 'dt1', codigo: 'DT', curso: 1, variante: null, ruta: '/curriculos-oficiales/dt1.csv', etiqueta: 'DT · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Dibujo Técnico' },
    { id: 'dt2', codigo: 'DT', curso: 2, variante: null, ruta: '/curriculos-oficiales/dt2.csv', etiqueta: 'DT · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Dibujo Técnico' },
    { id: 'dtap1', codigo: 'DTAP', curso: 1, variante: null, ruta: '/curriculos-oficiales/dtap1.csv', etiqueta: 'DTAP · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Dibujo Técnico Aplicado a las Artes Plásticas y al Diseño' },
    { id: 'dtap2', codigo: 'DTAP', curso: 2, variante: null, ruta: '/curriculos-oficiales/dtap2.csv', etiqueta: 'DTAP · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Dibujo Técnico Aplicado a las Artes Plásticas y al Diseño' },
    { id: 'dis2', codigo: 'DIS', curso: 2, variante: null, ruta: '/curriculos-oficiales/dis2.csv', etiqueta: 'DIS · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Diseño' },
    { id: 'eco1', codigo: 'ECO', curso: 1, variante: null, ruta: '/curriculos-oficiales/eco1.csv', etiqueta: 'ECO · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Economía' },
    { id: 'bef1', codigo: 'EF', curso: 1, variante: null, ruta: '/curriculos-oficiales/bef1.csv', etiqueta: 'EF · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Educación Física' },
    { id: 'elc1', codigo: 'ELC', curso: 1, variante: null, ruta: '/curriculos-oficiales/elc1.csv', etiqueta: 'ELC · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'El Legado Clásico' },
    { id: 'edmn2', codigo: 'EDMN', curso: 2, variante: null, ruta: '/curriculos-oficiales/edmn2.csv', etiqueta: 'EDMN · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Empresa y Diseño de Modelos de Negocio' },
    { id: 'fil1', codigo: 'FIL', curso: 1, variante: null, ruta: '/curriculos-oficiales/fil1.csv', etiqueta: 'FIL · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Filosofía' },
    { id: 'fart2', codigo: 'FART', curso: 2, variante: null, ruta: '/curriculos-oficiales/fart2.csv', etiqueta: 'FART · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Fundamentos Artísticos' },
    { id: 'fis2', codigo: 'FIS', curso: 2, variante: null, ruta: '/curriculos-oficiales/fis2.csv', etiqueta: 'FIS · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Física' },
    { id: 'fq1', codigo: 'FQ', curso: 1, variante: null, ruta: '/curriculos-oficiales/fq1.csv', etiqueta: 'FQ · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Física y Química' },
    { id: 'geo2', codigo: 'GEO', curso: 2, variante: null, ruta: '/curriculos-oficiales/geo2.csv', etiqueta: 'GEO · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Geografía' },
    { id: 'gca2', codigo: 'GCA', curso: 2, variante: null, ruta: '/curriculos-oficiales/gca2.csv', etiqueta: 'GCA · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Geología y Ciencias Ambientales' },
    { id: 'gri1', codigo: 'GRI', curso: 1, variante: null, ruta: '/curriculos-oficiales/gri1.csv', etiqueta: 'GRI · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Griego' },
    { id: 'gri2', codigo: 'GRI', curso: 2, variante: null, ruta: '/curriculos-oficiales/gri2.csv', etiqueta: 'GRI · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Griego' },
    { id: 'hesp2', codigo: 'HESP', curso: 2, variante: null, ruta: '/curriculos-oficiales/hesp2.csv', etiqueta: 'HESP · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Historia de España' },
    { id: 'hfil2', codigo: 'HFIL', curso: 2, variante: null, ruta: '/curriculos-oficiales/hfil2.csv', etiqueta: 'HFIL · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Historia de la Filosofía' },
    { id: 'hmd2', codigo: 'HMD', curso: 2, variante: null, ruta: '/curriculos-oficiales/hmd2.csv', etiqueta: 'HMD · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Historia de la Música y de la Danza' },
    { id: 'hart2', codigo: 'HART', curso: 2, variante: null, ruta: '/curriculos-oficiales/hart2.csv', etiqueta: 'HART · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Historia del Arte' },
    { id: 'hmc1', codigo: 'HMC', curso: 1, variante: null, ruta: '/curriculos-oficiales/hmc1.csv', etiqueta: 'HMC · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Historia del Mundo Contemporáneo' },
    { id: 'lat1', codigo: 'LAT', curso: 1, variante: null, ruta: '/curriculos-oficiales/lat1.csv', etiqueta: 'LAT · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Latín' },
    { id: 'lat2', codigo: 'LAT', curso: 2, variante: null, ruta: '/curriculos-oficiales/lat2.csv', etiqueta: 'LAT · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Latín' },
    { id: 'blal1', codigo: 'LAL', curso: 1, variante: null, ruta: '/curriculos-oficiales/blal1.csv', etiqueta: 'LAL · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Lengua Asturiana y Literatura' },
    { id: 'blal2', codigo: 'LAL', curso: 2, variante: null, ruta: '/curriculos-oficiales/blal2.csv', etiqueta: 'LAL · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Lengua Asturiana y Literatura' },
    { id: 'blcl1', codigo: 'LCL', curso: 1, variante: null, ruta: '/curriculos-oficiales/blcl1.csv', etiqueta: 'LCL · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Lengua Castellana y Literatura' },
    { id: 'blcl2', codigo: 'LCL', curso: 2, variante: null, ruta: '/curriculos-oficiales/blcl2.csv', etiqueta: 'LCL · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Lengua Castellana y Literatura' },
    { id: 'ble1', codigo: 'LE', curso: 1, variante: null, ruta: '/curriculos-oficiales/ble1.csv', etiqueta: 'LE · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Lengua Extranjera' },
    { id: 'ble2', codigo: 'LE', curso: 2, variante: null, ruta: '/curriculos-oficiales/ble2.csv', etiqueta: 'LE · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Lengua Extranjera' },
    { id: 'lpm1', codigo: 'LPM', curso: 1, variante: null, ruta: '/curriculos-oficiales/lpm1.csv', etiqueta: 'LPM · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Lenguaje y Práctica Musical' },
    { id: 'ldram2', codigo: 'LDRAM', curso: 2, variante: null, ruta: '/curriculos-oficiales/ldram2.csv', etiqueta: 'LDRAM · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Literatura Dramática' },
    { id: 'lu1', codigo: 'LU', curso: 1, variante: null, ruta: '/curriculos-oficiales/lu1.csv', etiqueta: 'LU · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Literatura Universal' },
    { id: 'bmat1', codigo: 'MAT', curso: 1, variante: null, ruta: '/curriculos-oficiales/bmat1.csv', etiqueta: 'MAT · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Matemáticas' },
    { id: 'bmat2', codigo: 'MAT', curso: 2, variante: null, ruta: '/curriculos-oficiales/bmat2.csv', etiqueta: 'MAT · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Matemáticas' },
    { id: 'macs1', codigo: 'MACS', curso: 1, variante: null, ruta: '/curriculos-oficiales/macs1.csv', etiqueta: 'MACS · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Matemáticas Aplicadas a las Ciencias Sociales' },
    { id: 'macs2', codigo: 'MACS', curso: 2, variante: null, ruta: '/curriculos-oficiales/macs2.csv', etiqueta: 'MACS · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Matemáticas Aplicadas a las Ciencias Sociales' },
    { id: 'matg1', codigo: 'MATG', curso: 1, variante: null, ruta: '/curriculos-oficiales/matg1.csv', etiqueta: 'MATG · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Matemáticas Generales' },
    { id: 'mca2', codigo: 'MCA', curso: 2, variante: null, ruta: '/curriculos-oficiales/mca2.csv', etiqueta: 'MCA · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Movimientos Culturales y Artísticos' },
    { id: 'part1', codigo: 'PART', curso: 1, variante: null, ruta: '/curriculos-oficiales/part1.csv', etiqueta: 'PART · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Proyectos Artísticos' },
    { id: 'psoc2', codigo: 'PSOC', curso: 2, variante: null, ruta: '/curriculos-oficiales/psoc2.csv', etiqueta: 'PSOC · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Psicología y Sociedad' },
    { id: 'qui2', codigo: 'QUI', curso: 2, variante: null, ruta: '/curriculos-oficiales/qui2.csv', etiqueta: 'QUI · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Química' },
    { id: 'bsle1', codigo: 'SLE', curso: 1, variante: null, ruta: '/curriculos-oficiales/bsle1.csv', etiqueta: 'SLE · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Segunda Lengua Extranjera' },
    { id: 'bsle2', codigo: 'SLE', curso: 2, variante: null, ruta: '/curriculos-oficiales/bsle2.csv', etiqueta: 'SLE · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Segunda Lengua Extranjera' },
    { id: 'tin1', codigo: 'TIN', curso: 1, variante: null, ruta: '/curriculos-oficiales/tin1.csv', etiqueta: 'TIN · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Tecnología e Ingeniería' },
    { id: 'tin2', codigo: 'TIN', curso: 2, variante: null, ruta: '/curriculos-oficiales/tin2.csv', etiqueta: 'TIN · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Tecnología e Ingeniería' },
    { id: 'tda1', codigo: 'TDA', curso: 1, variante: null, ruta: '/curriculos-oficiales/tda1.csv', etiqueta: 'TDA · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Tecnologías Digitales Aplicadas' },
    { id: 'tda2', codigo: 'TDA', curso: 2, variante: null, ruta: '/curriculos-oficiales/tda2.csv', etiqueta: 'TDA · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Tecnologías Digitales Aplicadas' },
    { id: 'tegp2', codigo: 'TEGP', curso: 2, variante: null, ruta: '/curriculos-oficiales/tegp2.csv', etiqueta: 'TEGP · 2º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Técnicas de Expresión Gráfico-plástica' },
    { id: 'vol1', codigo: 'VOL', curso: 1, variante: null, ruta: '/curriculos-oficiales/vol1.csv', etiqueta: 'VOL · 1º Bachillerato', oficial: true, etapa: 'bachillerato' , materia: 'Volumen' },
];

export const CURRICULOS_PROPIOS: CurriculumPreset[] = [
    { id: 'act3_diver', codigo: 'ACT', curso: 3, variante: null, ruta: '/curriculos-propios/act3_diver.csv', etiqueta: 'ACT · 3º ESO (Diversificación)', oficial: false, etapa: 'eso' , materia: 'Ámbito Científico-Tecnológico' },
    { id: 'act4_diver', codigo: 'ACT', curso: 4, variante: null, ruta: '/curriculos-propios/act4_diver.csv', etiqueta: 'ACT · 4º ESO (Diversificación)', oficial: false, etapa: 'eso' , materia: 'Ámbito Científico-Tecnológico' },
    { id: 'tcb1', codigo: 'TCB', curso: 1, variante: null, ruta: '/curriculos-propios/tcb1.csv', etiqueta: 'TCB · 1º ESO (Taller de Competencias Básicas)', oficial: false, etapa: 'eso' , materia: 'Taller de Competencias Básicas' },
    { id: 'tcb2', codigo: 'TCB', curso: 2, variante: null, ruta: '/curriculos-propios/tcb2.csv', etiqueta: 'TCB · 2º ESO (Taller de Competencias Básicas)', oficial: false, etapa: 'eso' , materia: 'Taller de Competencias Básicas' },
];

export const TODOS_LOS_PRESETS: CurriculumPreset[] = [...CURRICULOS_OFICIALES, ...CURRICULOS_OFICIALES_BACHILLERATO, ...CURRICULOS_PROPIOS];

// ESO y Bachillerato comparten numeración de curso (1º-2º de Bachillerato
// solapan con 1º-2º de ESO) — filtrar solo por número mezclaría currículos
// de las dos etapas en el mismo desplegable, así que hace falta también la
// etapa del curso seleccionado. Compartido entre CurriculumManager.tsx
// (Gestionar Currículo) y CourseManager.tsx (añadir Materia).
export const filtrarPorCurso = (cursoNumero: number | null, etapa: 'eso' | 'bachillerato', presets: CurriculumPreset[]) =>
    presets.filter(p => p.etapa === etapa && (cursoNumero === null || p.curso === cursoNumero));

// Las 6 combinaciones reales curso+etapa que cubren los currículos
// oficiales -- usadas por CourseManager.tsx como lista cerrada de "Nivel
// Educativo" al añadir una Materia (más las variantes sin preset oficial,
// como PDC, que ese componente añade aparte).
export interface NivelOficial {
    curso: number;
    etapa: 'eso' | 'bachillerato';
    etiqueta: string;
}

export const NIVELES_OFICIALES: NivelOficial[] = [
    { curso: 1, etapa: 'eso', etiqueta: '1º ESO' },
    { curso: 2, etapa: 'eso', etiqueta: '2º ESO' },
    { curso: 3, etapa: 'eso', etiqueta: '3º ESO' },
    { curso: 4, etapa: 'eso', etiqueta: '4º ESO' },
    { curso: 1, etapa: 'bachillerato', etiqueta: '1º Bachillerato' },
    { curso: 2, etapa: 'bachillerato', etiqueta: '2º Bachillerato' },
];
