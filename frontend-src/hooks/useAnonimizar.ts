import { useMutation } from '@tanstack/react-query';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { api } from '../services/api';

// Sin useQuery ni invalidación: no hay nada que cachear, es una operación
// puntual sin estado en el backend (services/anonimizador.py no persiste
// nada). El mapa código -> dato real que devuelve vive solo en el estado de
// React del componente que llama a este hook.
interface AnonimizarResponse {
    anonimizado: string;
    mapa: Record<string, string>;
}

// En escritorio va al sidecar Python (services/anonimizador.py, copia
// manual del backend web -- ver python-helper/README.md) en vez de al
// backend web -- mismo criterio que useAnonimizar aparte de api.ts para
// ImportScheduleModal.tsx con el horario en PDF.
export function useAnonimizar() {
    return useMutation({
        mutationFn: (texto: string) => isTauri()
            ? invoke<AnonimizarResponse>('anonimizar_texto', { texto })
            : api.post<AnonimizarResponse>('/ai-tools/anonimizar', { texto }),
    });
}
