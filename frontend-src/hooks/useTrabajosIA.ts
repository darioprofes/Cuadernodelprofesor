import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isTauri } from '@tauri-apps/api/core';
import { api } from '../services/api';
import type { EvaluationTool, SessionDetail, FinalProduct, FinalExam } from '../types';

export type EstadoTrabajoIA = 'en_progreso' | 'listo' | 'error' | 'cancelado';
export type TipoTrabajoIA = 'sa' | 'instrumento';

export interface TrabajoIA {
    jobId: string;
    tipo: TipoTrabajoIA;
    estado: EstadoTrabajoIA;
    titulo: string;
    // Segundos desde época Unix (time.time() en el backend) -- no
    // time.monotonic(), que no significa nada fuera del proceso que lo generó.
    iniciado: number;
    mensaje?: string;
    detail?: string;
    // Segundos desde época Unix -- si está presente, `mensaje` es una
    // espera real (cupo de Groq, o espaciado entre llamadas) y el panel
    // puede pintar una cuenta atrás en vivo hasta este instante en vez de
    // un texto estático con el segundero parado (ver TrabajosIAPanel.tsx).
    // Ausente o null en cualquier mensaje que no sea una espera.
    esperaHasta?: number | null;
    // Solo en trabajos de tipo "sa" -- para poder guardar el resultado como
    // unidad de programación de ese curso directamente desde el panel de
    // trabajos, sin tener que navegar antes a él (ver TrabajosIAPanel.tsx).
    courseId?: string;
}

// Misma forma que devuelve GET .../generar-groq-por-partes/{jobId} -- ver
// procesar_respuesta() en situacion_aprendizaje.py, que ya resuelve los
// códigos curriculares contra ESTE curso (a diferencia de la importación de
// JSON de programmingUnitShare.ts, que va por códigos porque puede venir de
// OTRO curso -- aquí los ids ya son válidos tal cual, sin traducir nada).
// Tipado igual que el parámetro de entregarUnidadGenerada en
// GenerarSituacionAprendizajeModal.tsx -- "resumir" un trabajo desde la cola
// (ver TrabajosIAPanel.tsx) reutiliza esa misma función tal cual.
export interface ResultadoTrabajoSA {
    unidad: {
        name: string;
        context: string;
        sessions: number;
        sessionDetails: SessionDetail[];
        finalProduct: FinalProduct;
        finalExam: FinalExam;
        linkedBasicKnowledgeIds: string[];
        linkedCriteriaIds: string[];
        linkedSpecificCompetenceIds: string[];
    };
    codigosDescartados: string[];
}

// Misma forma que devuelve GET .../instrumento-evaluacion/generar/{jobId} --
// a diferencia de ResultadoTrabajoSA.unidad, este "instrumento" NO trae
// courseId (lo añade el frontend al abrirlo para revisar, ver
// EvaluationToolManager.tsx) porque procesar_respuesta() en
// instrumento_evaluacion.py lo deja así deliberadamente, pensado para
// abrirse en el formulario de edición antes de guardar.
export interface ResultadoTrabajoInstrumento {
    instrumento: Omit<EvaluationTool, 'id' | 'courseId'>;
    codigosDescartados: string[];
}

const TRABAJOS_QUERY_KEY = ['trabajosIA'];

// La cola de trabajos en segundo plano (SA por partes vía Groq, instrumento
// vía IA local) solo existe en el backend web -- en escritorio la IA es
// solo copiar/pegar (ver CLAUDE.md, "Alcance de IA en Tauri"), sin
// generación en segundo plano que consultar.
export function useTrabajosIA() {
    return useQuery({
        queryKey: TRABAJOS_QUERY_KEY,
        queryFn: () => api.get<{ trabajos: TrabajoIA[] }>('/prompts/trabajos').then(r => r.trabajos),
        enabled: !isTauri(),
        refetchInterval: 8000,
    });
}

export function useCancelarTrabajoIA() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (jobId: string) => api.post<{ estado: string }>(`/prompts/trabajos/${jobId}/cancelar`, {}),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: TRABAJOS_QUERY_KEY }),
    });
}
