import type { EvaluationTool } from '../types';

export interface GenerarInstrumentoParams {
    courseId: string;
    criterionIds: string[];
    toolType: string;
    contexto?: string;
    numNiveles?: number;
}

export interface GenerarInstrumentoResultado {
    instrumento: Omit<EvaluationTool, 'id'>;
    codigosDescartados: string[];
}

const INTERVALO_SONDEO_MS = 3000;
const MAX_INTENTOS_SONDEO = 150; // ~7,5 min de margen -- la generación real ronda el minuto

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
        }),
    });
    if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
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
