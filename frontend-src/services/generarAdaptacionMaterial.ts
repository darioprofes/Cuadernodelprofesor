// Mismo patrón de tres vías que generarInstrumentoIA.ts (Groq síncrono, IA
// local con job+polling, prompt para copiar/pegar online) pero mucho más
// simple: la respuesta es texto libre (el material adaptado), no JSON que
// validar contra criterios reales -- así que no hace falta un "validar"
// aparte para la vía online, la respuesta pegada por el profesor ES ya el
// resultado final (anonimizado), listo para reintegrar en el cliente igual
// que ya hace AiToolsView.tsx.

export interface GenerarAdaptacionParams {
    material: string;
    notasAlumno: string;
}

const INTERVALO_SONDEO_MS = 3000;
const MAX_INTENTOS_SONDEO = 150; // ~7,5 min de margen, mismo criterio que el instrumento

const extraerDetalle = async (response: Response): Promise<string> => {
    const data = await response.json().catch(() => null);
    return data?.detail || `Error HTTP ${response.status}`;
};

// Igual que generarInstrumentoConIA: el backend responde al instante con un
// jobId (la llamada real al ia-server puede tardar cerca de un minuto) y el
// frontend sondea el progreso -- ver la nota sobre por qué en
// routers/prompts.py.
export async function generarAdaptacionConIA(params: GenerarAdaptacionParams): Promise<string> {
    const response = await fetch('/api/prompts/adaptacion-material/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material: params.material, notas_alumno: params.notasAlumno }),
    });
    if (!response.ok) throw new Error(await extraerDetalle(response));
    const { jobId }: { jobId: string } = await response.json();

    for (let intento = 0; intento < MAX_INTENTOS_SONDEO; intento++) {
        await new Promise(resolve => setTimeout(resolve, INTERVALO_SONDEO_MS));

        const estadoResponse = await fetch(`/api/prompts/adaptacion-material/generar/${jobId}`);
        if (!estadoResponse.ok) throw new Error(`Error HTTP ${estadoResponse.status}`);
        const estado: { estado: string; resultado?: string; detail?: string } = await estadoResponse.json();

        if (estado.estado === 'listo') return estado.resultado!;
        if (estado.estado === 'error') throw new Error(estado.detail || 'Error adaptando el material.');
        if (estado.estado === 'cancelado') throw new Error('Cancelado.');
    }

    throw new Error('La generación está tardando demasiado. Inténtalo de nuevo más tarde.');
}

export async function generarAdaptacionConGroq(params: GenerarAdaptacionParams): Promise<string> {
    const response = await fetch('/api/prompts/adaptacion-material/generar-groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material: params.material, notas_alumno: params.notasAlumno }),
    });
    if (!response.ok) throw new Error(await extraerDetalle(response));
    const data: { resultado: string } = await response.json();
    return data.resultado;
}

export async function generarPromptAdaptacion(params: GenerarAdaptacionParams): Promise<string> {
    const response = await fetch('/api/prompts/adaptacion-material/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material: params.material, notas_alumno: params.notasAlumno }),
    });
    if (!response.ok) throw new Error(await extraerDetalle(response));
    const data: { prompt: string } = await response.json();
    return data.prompt;
}
