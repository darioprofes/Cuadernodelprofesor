// Exportar/importar una Situación de Aprendizaje COMPLETA como JSON, para
// compartirla con un compañero que tenga el MISMO currículo cargado en su
// propio curso. Separado de ProgrammingManager.tsx (que ya hacía demasiadas
// cosas) para poder tipar esto de verdad -- la primera versión vivía inline
// con varios `any` sueltos.
//
// Va por CÓDIGOS (no ids internos): un id de criterio/saber es un UUID
// interno de ESTA base de datos, no significa nada en la del compañero: el
// código ("1.1", "A.1") sí, porque es el mismo currículo oficial. Mismo
// criterio que el export/import de pesos de criterios en CurriculumManager.
//
// El examen/producto final puede llevar vinculado un EvaluationTool real
// (las preguntas y sus puntos viven ahí, no en la propia SA -- ver
// FinalExam/FinalProduct en types.ts), así que se exporta/importa también,
// o el examen llegaría sin sus preguntas.

import type { ProgrammingUnit, EvaluationCriterion, BasicKnowledge, SpecificCompetence, EvaluationTool, BaseEvaluationItem } from '../types';

export const FORMATO_EXPORT_SA = 'faro-docente-sa-v1';

type ConCodigo = { id: string; code: string };

const codigosDesdeIds = (ids: string[] | undefined, items: ConCodigo[]): string[] => {
    const porId = new Map(items.map(i => [i.id, i.code]));
    return (ids || []).map(id => porId.get(id)).filter((c): c is string => !!c);
};

const idsDesdeCodigos = (codes: string[] | undefined, items: ConCodigo[]): string[] => {
    const porCodigo = new Map(items.map(i => [i.code, i.id]));
    return (codes || []).map(c => porCodigo.get(c)).filter((id): id is string => !!id);
};

// ---------- Exportar ----------

export interface ExportedEvaluationItem extends Omit<BaseEvaluationItem, 'id' | 'linkedCriteriaIds'> {
    linkedCriteriaCodes: string[];
}

export type ExportedEvaluationTool = Omit<EvaluationTool, 'id' | 'courseId' | 'items'> & {
    items: ExportedEvaluationItem[];
};

export interface ExportedProgrammingUnit {
    formato: typeof FORMATO_EXPORT_SA;
    name: string;
    sessions: number;
    context?: string;
    linkedCriteriaCodes: string[];
    linkedBasicKnowledgeCodes: string[];
    linkedSpecificCompetenceCodes: string[];
    sessionDetails: {
        titulo?: string;
        actividades: (Omit<ProgrammingUnit['sessionDetails'][number]['actividades'][number], 'linkedCriteriaIds' | 'evaluationToolId'> & {
            linkedCriteriaCodes: string[];
        })[];
    }[];
    finalProduct?: {
        tipo?: string;
        descripcion?: string;
        linkedCriteriaCodes: string[];
        instrumento?: ExportedEvaluationTool;
    };
    finalExam?: {
        formato?: string;
        bloques: { descripcion: string; linkedCriteriaCodes: string[] }[];
        instrumento?: ExportedEvaluationTool;
    };
}

const exportarInstrumento = (tool: EvaluationTool | undefined, criteria: EvaluationCriterion[]): ExportedEvaluationTool | undefined => {
    if (!tool) return undefined;
    const { id: _id, courseId: _courseId, ...resto } = tool as EvaluationTool & { courseId?: string };
    return {
        ...resto,
        items: tool.items.map(item => {
            const { id: _itemId, linkedCriteriaIds, ...restoItem } = item;
            return { ...restoItem, linkedCriteriaCodes: codigosDesdeIds(linkedCriteriaIds, criteria) };
        }),
    } as ExportedEvaluationTool;
};

export const buildExportPayload = (
    unit: ProgrammingUnit,
    criteria: EvaluationCriterion[],
    basicKnowledge: BasicKnowledge[],
    specificCompetences: SpecificCompetence[],
    evaluationTools: EvaluationTool[],
): ExportedProgrammingUnit => ({
    formato: FORMATO_EXPORT_SA,
    name: unit.name,
    sessions: unit.sessions,
    context: unit.context,
    linkedCriteriaCodes: codigosDesdeIds(unit.linkedCriteriaIds, criteria),
    linkedBasicKnowledgeCodes: codigosDesdeIds(unit.linkedBasicKnowledgeIds, basicKnowledge),
    linkedSpecificCompetenceCodes: codigosDesdeIds(unit.linkedSpecificCompetenceIds, specificCompetences),
    sessionDetails: unit.sessionDetails.map(sd => ({
        titulo: sd.titulo,
        actividades: sd.actividades.map(a => {
            const { linkedCriteriaIds, evaluationToolId: _toolId, ...resto } = a;
            // Instrumentos por actividad no se exportan (demasiados para el
            // caso de uso de compartir con un compañero).
            return { ...resto, linkedCriteriaCodes: codigosDesdeIds(linkedCriteriaIds, criteria) };
        }),
    })),
    finalProduct: unit.finalProduct?.incluido ? {
        tipo: unit.finalProduct.tipo,
        descripcion: unit.finalProduct.descripcion,
        linkedCriteriaCodes: codigosDesdeIds(unit.finalProduct.linkedCriteriaIds, criteria),
        instrumento: exportarInstrumento(evaluationTools.find(t => t.id === unit.finalProduct?.evaluationToolId), criteria),
    } : undefined,
    finalExam: unit.finalExam?.incluido ? {
        formato: unit.finalExam.formato,
        bloques: (unit.finalExam.bloques || []).map(b => ({
            descripcion: b.descripcion,
            linkedCriteriaCodes: codigosDesdeIds(b.linkedCriteriaIds, criteria),
        })),
        instrumento: exportarInstrumento(evaluationTools.find(t => t.id === unit.finalExam?.evaluationToolId), criteria),
    } : undefined,
});

export const exportFilename = (unitName: string): string =>
    `sa-${unitName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;

// Exportar/importar UN instrumento de evaluación suelto (fuera del contexto
// de una SA) como JSON -- reemplaza a la antigua importación CSV de
// Instrumentos de Evaluación (EvaluationToolManager.tsx), que no tenía
// exportación ni sabía de exámenes criteriales. Mismo criterio de portar
// por códigos de criterio, no ids, que el export de una SA completa de
// arriba -- reutiliza exportarInstrumento/resolverInstrumento tal cual.
export const FORMATO_EXPORT_INSTRUMENTO = 'faro-docente-instrumento-v1';

export type ExportedInstrumento = ExportedEvaluationTool & { formato: typeof FORMATO_EXPORT_INSTRUMENTO };

export const buildInstrumentoExportPayload = (tool: EvaluationTool, criteria: EvaluationCriterion[]): ExportedInstrumento => ({
    formato: FORMATO_EXPORT_INSTRUMENTO,
    ...(exportarInstrumento(tool, criteria) as ExportedEvaluationTool),
});

export const instrumentoExportFilename = (toolName: string): string =>
    `instrumento-${toolName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;

// ---------- Importar ----------

// Se comprueba explícitamente la marca `formato` antes de tocar nada más
// del archivo -- sin esto, CUALQUIER .json que el profesor eligiera por
// error se procesaba igual, con los campos que faltasen llegando como
// `undefined` hasta el propio backend en vez de fallar aquí con un mensaje
// claro.
export function parseImportPayload(raw: unknown): ExportedProgrammingUnit {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('El archivo no contiene un objeto JSON válido.');
    }
    const data = raw as Record<string, unknown>;
    if (data.formato !== FORMATO_EXPORT_SA) {
        throw new Error(
            `Este archivo no es una SA exportada desde Faro Docente (falta o no coincide "formato": "${FORMATO_EXPORT_SA}"). `
            + 'Usa "Exportar JSON" en la SA de origen para generar un archivo válido.'
        );
    }
    if (typeof data.name !== 'string' || !data.name.trim()) {
        throw new Error('El archivo no tiene un nombre de SA válido ("name").');
    }
    if (!Array.isArray(data.sessionDetails)) {
        throw new Error('El archivo no tiene sesiones válidas ("sessionDetails").');
    }
    return data as unknown as ExportedProgrammingUnit;
}

// Mismo criterio de comprobación explícita de `formato` que parseImportPayload
// de arriba, para un instrumento suelto.
export function parseInstrumentoImportPayload(raw: unknown): ExportedEvaluationTool {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('El archivo no contiene un objeto JSON válido.');
    }
    const data = raw as Record<string, unknown>;
    if (data.formato !== FORMATO_EXPORT_INSTRUMENTO) {
        throw new Error(
            `Este archivo no es un instrumento exportado desde Faro Docente (falta o no coincide "formato": "${FORMATO_EXPORT_INSTRUMENTO}"). `
            + 'Usa "Exportar JSON" en el instrumento de origen para generar un archivo válido.'
        );
    }
    if (typeof data.name !== 'string' || !data.name.trim()) {
        throw new Error('El archivo no tiene un nombre de instrumento válido ("name").');
    }
    if (!Array.isArray(data.items)) {
        throw new Error('El archivo no tiene ítems válidos ("items").');
    }
    return data as unknown as ExportedEvaluationTool;
}

interface InstrumentoResuelto {
    data: Omit<EvaluationTool, 'id'>;
}

const resolverInstrumento = (instrumento: ExportedEvaluationTool | undefined, courseId: string, criteria: EvaluationCriterion[]): InstrumentoResuelto | undefined => {
    if (!instrumento) return undefined;
    return {
        data: {
            ...instrumento,
            courseId,
            items: instrumento.items.map(item => {
                const { linkedCriteriaCodes, ...resto } = item;
                return { ...resto, linkedCriteriaIds: idsDesdeCodigos(linkedCriteriaCodes, criteria) };
            }),
        } as Omit<EvaluationTool, 'id'>,
    };
};

// Construye los datos de la unidad SIN evaluationToolId todavía -- el
// instrumento (si lo hay) se crea aparte y se enlaza con un PATCH posterior
// (ver handleImportarSAFile en ProgrammingManager.tsx). Antes se creaba el
// instrumento primero y la unidad después: si la creación de la unidad
// fallaba, el instrumento ya creado quedaba huérfano en la base de datos,
// sin ninguna SA que lo referenciara. Creando la unidad primero, un fallo
// posterior deja como mucho una SA sin instrumento vinculado -- visible y
// arreglable a mano, no un instrumento fantasma en la lista.
export function buildUnitInput(data: ExportedProgrammingUnit, courseId: string, criteria: EvaluationCriterion[], basicKnowledge: BasicKnowledge[], specificCompetences: SpecificCompetence[]) {
    return {
        name: data.name,
        sessions: data.sessions,
        context: data.context,
        linkedCriteriaIds: idsDesdeCodigos(data.linkedCriteriaCodes, criteria),
        linkedBasicKnowledgeIds: idsDesdeCodigos(data.linkedBasicKnowledgeCodes, basicKnowledge),
        linkedSpecificCompetenceIds: idsDesdeCodigos(data.linkedSpecificCompetenceCodes, specificCompetences),
        sessionDetails: (data.sessionDetails || []).map(sd => ({
            titulo: sd.titulo,
            actividades: (sd.actividades || []).map(a => {
                const { linkedCriteriaCodes, ...resto } = a;
                return { ...resto, linkedCriteriaIds: idsDesdeCodigos(linkedCriteriaCodes, criteria) };
            }),
        })),
        finalProduct: data.finalProduct ? {
            incluido: true,
            tipo: data.finalProduct.tipo,
            descripcion: data.finalProduct.descripcion,
            linkedCriteriaIds: idsDesdeCodigos(data.finalProduct.linkedCriteriaCodes, criteria),
        } : { incluido: false },
        finalExam: data.finalExam ? {
            incluido: true,
            formato: data.finalExam.formato,
            bloques: (data.finalExam.bloques || []).map(b => ({
                descripcion: b.descripcion,
                linkedCriteriaIds: idsDesdeCodigos(b.linkedCriteriaCodes, criteria),
            })),
        } : { incluido: false },
    };
}

// ---------- Listar elementos importables/generables de una SA ----------
//
// Un "elemento" es una actividad de sesión, el producto final, o el examen
// final (como un único bloque -- ver nota en construirItems original, ahora
// aquí). Usado en dos sitios: al añadir una columna al cuaderno de notas
// (ImportarDesdeSAModal.tsx) y al generar un instrumento con IA a partir de
// un elemento de una SA (SeleccionarActividadSAModal.tsx) -- de ahí vivir
// aquí, en vez de duplicado en los dos.

export type UbicacionItemSA =
    | { tipo: 'actividad'; sessionIndex: number; activityIndex: number }
    | { tipo: 'producto' }
    | { tipo: 'examen' };

export interface ItemSA {
    key: string;
    // Sesión + algo corto, nunca el párrafo entero de la descripción --
    // sirve tanto de nombre por defecto de una columna del cuaderno como de
    // etiqueta en un selector.
    label: string;
    linkedCriteriaIds: string[];
    // Texto de contexto para la IA (la descripción del elemento) -- más
    // largo que `label` a propósito, no se usa como etiqueta visible.
    contexto: string;
    evaluationToolId?: string;
    ubicacion: UbicacionItemSA;
}

const acortarDescripcion = (texto: string, max = 60): string => {
    const limpio = texto.trim().replace(/\s+/g, ' ');
    return limpio.length > max ? `${limpio.slice(0, max).trimEnd()}…` : limpio;
};

export function listarItemsImportablesSA(unit: ProgrammingUnit): ItemSA[] {
    const items: ItemSA[] = [];

    (unit.sessionDetails || []).forEach((sesion, sIndex) => {
        (sesion.actividades || []).forEach((act, aIndex) => {
            // Si la actividad no tiene título propio, se acorta la
            // descripción en vez de caer en el genérico "Actividad" -- con
            // varias actividades sin título en la misma sesión, todas se
            // verían igual de no hacerlo.
            const corto = act.titulo?.trim() || acortarDescripcion(act.descripcion || 'Actividad');
            items.push({
                key: `s${sIndex}-a${aIndex}`,
                label: `${sesion.titulo || `Sesión ${sIndex + 1}`} · ${corto}`,
                linkedCriteriaIds: act.linkedCriteriaIds || [],
                contexto: act.descripcion || act.titulo || '',
                evaluationToolId: act.evaluationToolId,
                ubicacion: { tipo: 'actividad', sessionIndex: sIndex, activityIndex: aIndex },
            });
        });
    });

    if (unit.finalProduct?.incluido) {
        items.push({
            key: 'producto',
            label: `Producto final${unit.finalProduct.tipo ? `: ${unit.finalProduct.tipo}` : ''}`,
            linkedCriteriaIds: unit.finalProduct.linkedCriteriaIds || [],
            contexto: unit.finalProduct.descripcion || unit.finalProduct.tipo || '',
            evaluationToolId: unit.finalProduct.evaluationToolId,
            ubicacion: { tipo: 'producto' },
        });
    }

    // El examen entero es UN elemento, no uno por bloque -- los criterios de
    // todos sus bloques se combinan (ver nota histórica en
    // ImportarDesdeSAModal.tsx: una tarea de calificación directa con más de
    // un criterio vinculado ya pide una nota POR criterio, así que no hace
    // falta modelar los bloques como columnas separadas).
    if (unit.finalExam?.incluido) {
        const criteriosExamen = Array.from(new Set((unit.finalExam.bloques || []).flatMap(b => b.linkedCriteriaIds || [])));
        items.push({
            key: 'examen',
            label: `Examen final${unit.finalExam.formato ? `: ${unit.finalExam.formato}` : ''}`,
            linkedCriteriaIds: criteriosExamen,
            contexto: unit.finalExam.formato ? `Examen final: ${unit.finalExam.formato}` : 'Examen final',
            evaluationToolId: unit.finalExam.evaluationToolId,
            ubicacion: { tipo: 'examen' },
        });
    }

    return items;
}

export { resolverInstrumento, idsDesdeCodigos, codigosDesdeIds };
