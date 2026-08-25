import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isTauri } from '@tauri-apps/api/core';
import { api } from '../services/api';
import type { EducasturSettings, SincronizarEducasturInput, SincronizarEducasturResult } from '../types/api';

// Sin GET de estado ni vínculo persistente a propósito (ver
// integracion-educastur-faltas.md): cada sincronización es login->push->
// logout autocontenido, no hay "sesión activa" que consultar entre medias.
export function useSincronizarEducastur() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: SincronizarEducasturInput) =>
            api.post<SincronizarEducasturResult>('/educastur/sincronizar', data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['absences'] }),
    });
}

// Activación + aviso de responsabilidad -- solo existe en escritorio (ver
// EducasturSettings en types/api.ts). En web la ruta ni siquiera existe,
// así que la query se desactiva del todo con isTauri() en vez de dejar que
// falle un fetch a una ruta inexistente.
export function useEducasturSettings() {
    return useQuery({
        queryKey: ['educastur-settings'],
        queryFn: () => api.get<EducasturSettings>('/educastur/settings'),
        enabled: isTauri(),
        staleTime: 10_000,
    });
}

export function useUpdateEducasturSettings() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { enabled: boolean; acceptDisclaimer?: boolean }) =>
            api.put<EducasturSettings>('/educastur/settings', data),
        onSuccess: (data) => queryClient.setQueryData(['educastur-settings'], data),
    });
}
