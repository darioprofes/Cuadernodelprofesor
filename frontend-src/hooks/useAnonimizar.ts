import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';

// Sin useQuery ni invalidación: no hay nada que cachear, es una operación
// puntual sin estado en el backend (services/anonimizador.py no persiste
// nada). El mapa código -> dato real que devuelve vive solo en el estado de
// React del componente que llama a este hook.
interface AnonimizarResponse {
    anonimizado: string;
    mapa: Record<string, string>;
}

export function useAnonimizar() {
    return useMutation({
        mutationFn: (texto: string) => api.post<AnonimizarResponse>('/ai-tools/anonimizar', { texto }),
    });
}
