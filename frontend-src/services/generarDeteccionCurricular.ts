import { api } from './api';

export interface ElementoDetectado {
    id: string;
    code: string;
    description: string;
}

export interface ResultadoDeteccion {
    documentoAnotado: string;
    elementos: Record<string, ElementoDetectado[]>;
    codigosDescartados: string[];
}

export interface DetectarElementosParams {
    courseId: string;
    documento: string;
    tipos: string[];
}

const INTERVALO_SONDEO_MS = 3000;
const MAX_INTENTOS_SONDEO = 150; // ~7,5 min de margen, mismo criterio que el resto de generadores

const extraerDetalle = async (response: Response): Promise<string> => {
    const data = await response.json().catch(() => null);
    return data?.detail || `Error HTTP ${response.status}`;
};

const cuerpo = (params: DetectarElementosParams) => JSON.stringify({
    course_id: params.courseId,
    documento: params.documento,
    tipos: params.tipos,
});

// Igual que generarInstrumentoConIA: el backend responde al instante con un
// jobId (la llamada real al ia-server puede tardar) y el frontend sondea el
// progreso -- ver la nota sobre por qué en routers/prompts.py.
export async function detectarElementosConIA(params: DetectarElementosParams): Promise<ResultadoDeteccion> {
    const response = await fetch('/api/prompts/deteccion-curricular/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo(params),
    });
    if (!response.ok) throw new Error(await extraerDetalle(response));
    const { jobId }: { jobId: string } = await response.json();

    for (let intento = 0; intento < MAX_INTENTOS_SONDEO; intento++) {
        await new Promise(resolve => setTimeout(resolve, INTERVALO_SONDEO_MS));

        const estadoResponse = await fetch(`/api/prompts/deteccion-curricular/generar/${jobId}`);
        if (!estadoResponse.ok) throw new Error(`Error HTTP ${estadoResponse.status}`);
        const estado: ResultadoDeteccion & { estado: string; detail?: string } = await estadoResponse.json();

        if (estado.estado === 'listo') return estado;
        if (estado.estado === 'error') throw new Error(estado.detail || 'Error detectando elementos curriculares.');
        if (estado.estado === 'cancelado') throw new Error('Cancelado.');
    }

    throw new Error('La generación está tardando demasiado. Inténtalo de nuevo más tarde.');
}

export async function detectarElementosConGroq(params: DetectarElementosParams): Promise<ResultadoDeteccion> {
    const response = await fetch('/api/prompts/deteccion-curricular/generar-groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo(params),
    });
    if (!response.ok) throw new Error(await extraerDetalle(response));
    return await response.json();
}

export async function generarPromptDeteccion(params: DetectarElementosParams): Promise<string> {
    const data = await api.post<{ prompt: string }>('/prompts/deteccion-curricular/prompt', {
        course_id: params.courseId,
        documento: params.documento,
        tipos: params.tipos,
    });
    return data.prompt;
}

export async function validarRespuestaDeteccion(courseId: string, tipos: string[], respuesta: string): Promise<ResultadoDeteccion> {
    return api.post<ResultadoDeteccion>('/prompts/deteccion-curricular/validar', { course_id: courseId, tipos, respuesta });
}
