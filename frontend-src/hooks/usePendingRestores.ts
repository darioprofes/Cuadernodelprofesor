import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isTauri } from '@tauri-apps/api/core';
import { api } from '../services/api';

export interface PendingRestore {
    filename: string;
    created_at: string;
    size_bytes: number;
}

const PENDING_RESTORES_QUERY_KEY = ['pendingRestores'];

// Copias que el servidor se hace a sí mismo justo antes de sustituir sus
// datos por una restauración automática desde escritorio (ver
// /root/scripts/restore_from_desktop.sh) -- solo existen en el backend
// web, la app de escritorio no tiene forma de consultarlas (profe-api
// está detrás de Authentik, ver "Volver al servidor" en
// ServerSyncSettings.tsx).
export function usePendingRestores() {
    return useQuery({
        queryKey: PENDING_RESTORES_QUERY_KEY,
        queryFn: () => api.get<PendingRestore[]>('/backup/pending-restores'),
        enabled: !isTauri(),
        refetchInterval: 60000,
    });
}

export function useDismissPendingRestore() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (filename: string) => api.delete(`/backup/pending-restores/${encodeURIComponent(filename)}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_RESTORES_QUERY_KEY }),
    });
}

// Deshace la restauración automática: vuelve a dejar el servidor como
// estaba justo antes de ella. No borra el archivo (por si hiciera falta
// repetirlo) -- eso lo decide el profesor aparte, con "Confirmar y borrar".
export function useRestorePendingRestore() {
    return useMutation({
        mutationFn: (filename: string) => api.post(`/backup/pending-restores/${encodeURIComponent(filename)}/restore`, {}),
    });
}
