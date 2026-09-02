import type { EvaluationTool } from '../types';
import { api } from './api';

export interface GenerarInstrumentoParams {
    courseId: string;
    criterionIds: string[];
    toolType: string;
    contexto?: string;
    numNiveles?: number;
    // Texto (pegado o extraído de un documento) de lo que se ha visto de
    // verdad en clase -- opcional, ver nota en el backend.
    documento?: string;
}

export interface GenerarInstrumentoResultado {
    instrumento: Omit<EvaluationTool, 'id'>;
    codigosDescartados: string[];
}

const INTERVALO_SONDEO_MS = 3000;
const MAX_INTENTOS_SONDEO = 150; // ~7,5 min de margen -- la generación real ronda el minuto

const extraerDetalle = async (response: Response): Promise<string> => {
    const data = await response.json().catch(() => null);
    return data?.detail || `Error HTTP ${response.status}`;
};

// El backend responde al instante con un jobId y hace la generación real
// (llamada al ia-server, puede tardar cerca de un minuto) en segundo plano
// -- ver la nota en routers/prompts.py sobre por qué se abandonó la
// respuesta en streaming de una sola conexión larga (Authentik/NPM la
// cortaban con un 502 antes de tiempo). Cada petición de aquí dura como
// mucho un segundo, así que ningún proxy intermedio tiene motivo para
// cortarla.
export async function generarInstrumentoConIA(params: GenerarInstrumentoParams): Promise<GenerarInstrumentoResultado> {
    const response = await fetch('/api/prompts/instrumento-evaluacion/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            course_id: params.courseId,
            criterion_ids: params.criterionIds,
            tool_type: params.toolType,
            contexto: params.contexto,
            num_niveles: params.numNiveles,
            documento: params.documento,
        }),
    });
    if (!response.ok) throw new Error(await extraerDetalle(response));
    const { jobId }: { jobId: string } = await response.json();

    for (let intento = 0; intento < MAX_INTENTOS_SONDEO; intento++) {
        await new Promise(resolve => setTimeout(resolve, INTERVALO_SONDEO_MS));

        const estadoResponse = await fetch(`/api/prompts/instrumento-evaluacion/generar/${jobId}`);
        if (!estadoResponse.ok) throw new Error(`Error HTTP ${estadoResponse.status}`);
        const estado: { estado: string; instrumento?: Omit<EvaluationTool, 'id'>; codigosDescartados?: string[]; detail?: string } = await estadoResponse.json();

        if (estado.estado === 'listo') {
            return { instrumento: estado.instrumento!, codigosDescartados: estado.codigosDescartados! };
        }
        if (estado.estado === 'error') {
            throw new Error(estado.detail || 'Error generando el instrumento.');
        }
    }

    throw new Error('La generación está tardando demasiado. Inténtalo de nuevo más tarde.');
}

// Vía Groq -- rápida (segundos, no minuto) y gratuita/casi gratuita, con
// retención cero activada en el panel de Groq. Petición síncrona normal,
// sin el patrón job+polling que sí hace falta con el ia-server local.
export async function generarInstrumentoConGroq(params: GenerarInstrumentoParams): Promise<GenerarInstrumentoResultado> {
    const response = await fetch('/api/prompts/instrumento-evaluacion/generar-groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            course_id: params.courseId,
            criterion_ids: params.criterionIds,
            tool_type: params.toolType,
            contexto: params.contexto,
            num_niveles: params.numNiveles,
            documento: params.documento,
        }),
    });
    if (!response.ok) throw new Error(await extraerDetalle(response));
    return await response.json();
}

// Vía alternativa a la IA local -- por si va lenta o no está disponible:
// mismo prompt de siempre, pero para copiar y pegar en cualquier IA
// online (como ya hace el generador de Situación de Aprendizaje), en vez
// de llamar al ia-server.
export async function generarPromptInstrumento(params: GenerarInstrumentoParams): Promise<string> {
    const data = await api.post<{ prompt: string }>('/prompts/instrumento-evaluacion/prompt', {
        course_id: params.courseId,
        criterion_ids: params.criterionIds,
        tool_type: params.toolType,
        contexto: params.contexto,
        num_niveles: params.numNiveles,
        documento: params.documento,
    });
    return data.prompt;
}

export interface SugerenciaCriterios {
    criterionIds: string[];
    codigosDescartados: string[];
}

// Paso previo opcional a generar el instrumento: el profesor describe qué
// quiere evaluar (sin elegir criterios de antemano) y esto propone cuáles
// del curso encajan, para revisarlos/ajustarlos en el selector de criterios
// de siempre antes de generar. Solo por Groq (rápido) -- ver la nota en
// instrumento_evaluacion.py::sugerir_criterios_groq.
export async function sugerirCriteriosConGroq(courseId: string, descripcion: string, documento?: string): Promise<SugerenciaCriterios> {
    const response = await fetch('/api/prompts/instrumento-evaluacion/sugerir-criterios-groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: courseId, descripcion, documento }),
    });
    if (!response.ok) throw new Error(await extraerDetalle(response));
    return await response.json();
}

export async function validarRespuestaInstrumento(courseId: string, toolType: string, respuesta: string): Promise<GenerarInstrumentoResultado> {
    return api.post<GenerarInstrumentoResultado>('/prompts/instrumento-evaluacion/validar', { course_id: courseId, tool_type: toolType, respuesta });
}
