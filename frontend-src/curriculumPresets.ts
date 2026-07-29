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
}

export const CURRICULOS_OFICIALES: CurriculumPreset[] = [
    { id: 'bg1', codigo: 'BG', curso: 1, variante: null, ruta: '/curriculos-oficiales/bg1.csv', etiqueta: 'BG · 1º ESO', oficial: true },
    { id: 'bg3', codigo: 'BG', curso: 3, variante: null, ruta: '/curriculos-oficiales/bg3.csv', etiqueta: 'BG · 3º ESO', oficial: true },
    { id: 'bg4', codigo: 'BG', curso: 4, variante: null, ruta: '/curriculos-oficiales/bg4.csv', etiqueta: 'BG · 4º ESO', oficial: true },
    { id: 'cc2', codigo: 'CC', curso: 2, variante: null, ruta: '/curriculos-oficiales/cc2.csv', etiqueta: 'CC · 2º ESO', oficial: true },
    { id: 'dig4', codigo: 'DIG', curso: 4, variante: null, ruta: '/curriculos-oficiales/dig4.csv', etiqueta: 'DIG · 4º ESO', oficial: true },
    { id: 'diga1', codigo: 'DIGA', curso: 1, variante: null, ruta: '/curriculos-oficiales/diga1.csv', etiqueta: 'DIGA · 1º ESO', oficial: true },
    { id: 'eart4', codigo: 'EART', curso: 4, variante: null, ruta: '/curriculos-oficiales/eart4.csv', etiqueta: 'EART · 4º ESO', oficial: true },
    { id: 'eco4', codigo: 'ECO', curso: 4, variante: null, ruta: '/curriculos-oficiales/eco4.csv', etiqueta: 'ECO · 4º ESO', oficial: true },
    { id: 'ef1', codigo: 'EF', curso: 1, variante: null, ruta: '/curriculos-oficiales/ef1.csv', etiqueta: 'EF · 1º ESO', oficial: true },
    { id: 'ef2', codigo: 'EF', curso: 2, variante: null, ruta: '/curriculos-oficiales/ef2.csv', etiqueta: 'EF · 2º ESO', oficial: true },
    { id: 'ef3', codigo: 'EF', curso: 3, variante: null, ruta: '/curriculos-oficiales/ef3.csv', etiqueta: 'EF · 3º ESO', oficial: true },
    { id: 'ef4', codigo: 'EF', curso: 4, variante: null, ruta: '/curriculos-oficiales/ef4.csv', etiqueta: 'EF · 4º ESO', oficial: true },
    { id: 'epva1', codigo: 'EPVA', curso: 1, variante: null, ruta: '/curriculos-oficiales/epva1.csv', etiqueta: 'EPVA · 1º ESO', oficial: true },
    { id: 'epva3', codigo: 'EPVA', curso: 3, variante: null, ruta: '/curriculos-oficiales/epva3.csv', etiqueta: 'EPVA · 3º ESO', oficial: true },
    { id: 'evce3', codigo: 'EVCE', curso: 3, variante: null, ruta: '/curriculos-oficiales/evce3.csv', etiqueta: 'EVCE · 3º ESO', oficial: true },
    { id: 'fil4', codigo: 'FIL', curso: 4, variante: null, ruta: '/curriculos-oficiales/fil4.csv', etiqueta: 'FIL · 4º ESO', oficial: true },
    { id: 'fopp4', codigo: 'FOPP', curso: 4, variante: null, ruta: '/curriculos-oficiales/fopp4.csv', etiqueta: 'FOPP · 4º ESO', oficial: true },
    { id: 'fq2', codigo: 'FQ', curso: 2, variante: null, ruta: '/curriculos-oficiales/fq2.csv', etiqueta: 'FQ · 2º ESO', oficial: true },
    { id: 'fq3', codigo: 'FQ', curso: 3, variante: null, ruta: '/curriculos-oficiales/fq3.csv', etiqueta: 'FQ · 3º ESO', oficial: true },
    { id: 'fq4', codigo: 'FQ', curso: 4, variante: null, ruta: '/curriculos-oficiales/fq4.csv', etiqueta: 'FQ · 4º ESO', oficial: true },
    { id: 'gh1', codigo: 'GH', curso: 1, variante: null, ruta: '/curriculos-oficiales/gh1.csv', etiqueta: 'GH · 1º ESO', oficial: true },
    { id: 'gh2', codigo: 'GH', curso: 2, variante: null, ruta: '/curriculos-oficiales/gh2.csv', etiqueta: 'GH · 2º ESO', oficial: true },
    { id: 'gh3', codigo: 'GH', curso: 3, variante: null, ruta: '/curriculos-oficiales/gh3.csv', etiqueta: 'GH · 3º ESO', oficial: true },
    { id: 'gh4', codigo: 'GH', curso: 4, variante: null, ruta: '/curriculos-oficiales/gh4.csv', etiqueta: 'GH · 4º ESO', oficial: true },
    { id: 'lal1', codigo: 'LAL', curso: 1, variante: null, ruta: '/curriculos-oficiales/lal1.csv', etiqueta: 'LAL · 1º ESO', oficial: true },
    { id: 'lal2', codigo: 'LAL', curso: 2, variante: null, ruta: '/curriculos-oficiales/lal2.csv', etiqueta: 'LAL · 2º ESO', oficial: true },
    { id: 'lal3', codigo: 'LAL', curso: 3, variante: null, ruta: '/curriculos-oficiales/lal3.csv', etiqueta: 'LAL · 3º ESO', oficial: true },
    { id: 'lal4', codigo: 'LAL', curso: 4, variante: null, ruta: '/curriculos-oficiales/lal4.csv', etiqueta: 'LAL · 4º ESO', oficial: true },
    { id: 'lat4', codigo: 'LAT', curso: 4, variante: null, ruta: '/curriculos-oficiales/lat4.csv', etiqueta: 'LAT · 4º ESO', oficial: true },
    { id: 'lcl1', codigo: 'LCL', curso: 1, variante: null, ruta: '/curriculos-oficiales/lcl1.csv', etiqueta: 'LCL · 1º ESO', oficial: true },
    { id: 'lcl2', codigo: 'LCL', curso: 2, variante: null, ruta: '/curriculos-oficiales/lcl2.csv', etiqueta: 'LCL · 2º ESO', oficial: true },
    { id: 'lcl3', codigo: 'LCL', curso: 3, variante: null, ruta: '/curriculos-oficiales/lcl3.csv', etiqueta: 'LCL · 3º ESO', oficial: true },
    { id: 'lcl4', codigo: 'LCL', curso: 4, variante: null, ruta: '/curriculos-oficiales/lcl4.csv', etiqueta: 'LCL · 4º ESO', oficial: true },
    { id: 'le1', codigo: 'LE', curso: 1, variante: null, ruta: '/curriculos-oficiales/le1.csv', etiqueta: 'LE · 1º ESO', oficial: true },
    { id: 'le2', codigo: 'LE', curso: 2, variante: null, ruta: '/curriculos-oficiales/le2.csv', etiqueta: 'LE · 2º ESO', oficial: true },
    { id: 'le3', codigo: 'LE', curso: 3, variante: null, ruta: '/curriculos-oficiales/le3.csv', etiqueta: 'LE · 3º ESO', oficial: true },
    { id: 'le4', codigo: 'LE', curso: 4, variante: null, ruta: '/curriculos-oficiales/le4.csv', etiqueta: 'LE · 4º ESO', oficial: true },
    { id: 'mat1', codigo: 'MAT', curso: 1, variante: null, ruta: '/curriculos-oficiales/mat1.csv', etiqueta: 'MAT · 1º ESO', oficial: true },
    { id: 'mat2', codigo: 'MAT', curso: 2, variante: null, ruta: '/curriculos-oficiales/mat2.csv', etiqueta: 'MAT · 2º ESO', oficial: true },
    { id: 'mat3', codigo: 'MAT', curso: 3, variante: null, ruta: '/curriculos-oficiales/mat3.csv', etiqueta: 'MAT · 3º ESO', oficial: true },
    { id: 'mat4a', codigo: 'MAT', curso: 4, variante: "A", ruta: '/curriculos-oficiales/mat4a.csv', etiqueta: 'MAT · 4º ESO (A)', oficial: true },
    { id: 'mat4b', codigo: 'MAT', curso: 4, variante: "B", ruta: '/curriculos-oficiales/mat4b.csv', etiqueta: 'MAT · 4º ESO (B)', oficial: true },
    { id: 'mus1', codigo: 'MUS', curso: 1, variante: null, ruta: '/curriculos-oficiales/mus1.csv', etiqueta: 'MUS · 1º ESO', oficial: true },
    { id: 'mus2', codigo: 'MUS', curso: 2, variante: null, ruta: '/curriculos-oficiales/mus2.csv', etiqueta: 'MUS · 2º ESO', oficial: true },
    { id: 'mus4', codigo: 'MUS', curso: 4, variante: null, ruta: '/curriculos-oficiales/mus4.csv', etiqueta: 'MUS · 4º ESO', oficial: true },
    { id: 'pese3', codigo: 'PESE', curso: 3, variante: null, ruta: '/curriculos-oficiales/pese3.csv', etiqueta: 'PESE · 3º ESO', oficial: true },
    { id: 'sle1', codigo: 'SLE', curso: 1, variante: null, ruta: '/curriculos-oficiales/sle1.csv', etiqueta: 'SLE · 1º ESO', oficial: true },
    { id: 'sle2', codigo: 'SLE', curso: 2, variante: null, ruta: '/curriculos-oficiales/sle2.csv', etiqueta: 'SLE · 2º ESO', oficial: true },
    { id: 'sle3', codigo: 'SLE', curso: 3, variante: null, ruta: '/curriculos-oficiales/sle3.csv', etiqueta: 'SLE · 3º ESO', oficial: true },
    { id: 'sle4', codigo: 'SLE', curso: 4, variante: null, ruta: '/curriculos-oficiales/sle4.csv', etiqueta: 'SLE · 4º ESO', oficial: true },
    { id: 'tea4', codigo: 'TEA', curso: 4, variante: null, ruta: '/curriculos-oficiales/tea4.csv', etiqueta: 'TEA · 4º ESO', oficial: true },
    { id: 'tec4', codigo: 'TEC', curso: 4, variante: null, ruta: '/curriculos-oficiales/tec4.csv', etiqueta: 'TEC · 4º ESO', oficial: true },
    { id: 'tyd2', codigo: 'TYD', curso: 2, variante: null, ruta: '/curriculos-oficiales/tyd2.csv', etiqueta: 'TYD · 2º ESO', oficial: true },
    { id: 'tyd3', codigo: 'TYD', curso: 3, variante: null, ruta: '/curriculos-oficiales/tyd3.csv', etiqueta: 'TYD · 3º ESO', oficial: true },
];

export const CURRICULOS_PROPIOS: CurriculumPreset[] = [
    { id: 'act3_diver', codigo: 'ACT', curso: 3, variante: null, ruta: '/curriculos-propios/act3_diver.csv', etiqueta: 'ACT · 3º ESO (Diversificación)', oficial: false },
    { id: 'act4_diver', codigo: 'ACT', curso: 4, variante: null, ruta: '/curriculos-propios/act4_diver.csv', etiqueta: 'ACT · 4º ESO (Diversificación)', oficial: false },
    { id: 'tcb1', codigo: 'TCB', curso: 1, variante: null, ruta: '/curriculos-propios/tcb1.csv', etiqueta: 'TCB · 1º ESO (Taller de Competencias Básicas)', oficial: false },
    { id: 'tcb2', codigo: 'TCB', curso: 2, variante: null, ruta: '/curriculos-propios/tcb2.csv', etiqueta: 'TCB · 2º ESO (Taller de Competencias Básicas)', oficial: false },
];

export const TODOS_LOS_PRESETS: CurriculumPreset[] = [...CURRICULOS_OFICIALES, ...CURRICULOS_PROPIOS];
