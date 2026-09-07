// Mismo patrón de tres vías que generarAdaptacionMaterial.ts (Groq síncrono,
// IA local con job+polling, prompt para copiar/pegar online) -- la
// respuesta es texto/Markdown libre (el acta redactada), no hace falta un
// "validar" aparte para la vía online, la respuesta pegada por el profesor
// ES ya el resultado final (anonimizado), listo para reintegrar en el
// cliente igual que ya hace AdaptarMaterialView.tsx.

import { api } from './api';
import type { Meeting } from '../types';

export interface GenerarActaParams {
    tipo: Meeting['tipo'];
    notas: string;
}

const INTERVALO_SONDEO_MS = 3000;
const MAX_INTENTOS_SONDEO = 150; // ~7,5 min de margen, mismo criterio que adaptación de material

const extraerDetalle = async (response: Response): Promise<string> => {
    const data = await response.json().catch(() => null);
    return data?.detail || `Error HTTP ${response.status}`;
};

export async function generarActaConIA(params: GenerarActaParams): Promise<string> {
    const response = await fetch('/api/prompts/reuniones/acta/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: params.tipo, notas: params.notas }),
    });
    if (!response.ok) throw new Error(await extraerDetalle(response));
    const { jobId }: { jobId: string } = await response.json();

    for (let intento = 0; intento < MAX_INTENTOS_SONDEO; intento++) {
        await new Promise(resolve => setTimeout(resolve, INTERVALO_SONDEO_MS));

        const estadoResponse = await fetch(`/api/prompts/reuniones/acta/generar/${jobId}`);
        if (!estadoResponse.ok) throw new Error(`Error HTTP ${estadoResponse.status}`);
        const estado: { estado: string; resultado?: string; detail?: string } = await estadoResponse.json();

        if (estado.estado === 'listo') return estado.resultado!;
        if (estado.estado === 'error') throw new Error(estado.detail || 'Error redactando el acta.');
        if (estado.estado === 'cancelado') throw new Error('Cancelado.');
    }

    throw new Error('La generación está tardando demasiado. Inténtalo de nuevo más tarde.');
}

export async function generarActaConGroq(params: GenerarActaParams): Promise<string> {
    const response = await fetch('/api/prompts/reuniones/acta/generar-groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: params.tipo, notas: params.notas }),
    });
    if (!response.ok) throw new Error(await extraerDetalle(response));
    const data: { resultado: string } = await response.json();
    return data.resultado;
}

export async function generarPromptActa(params: GenerarActaParams): Promise<string> {
    const data = await api.post<{ prompt: string }>('/prompts/reuniones/acta/prompt', {
        tipo: params.tipo,
        notas: params.notas,
    });
    return data.prompt;
}
