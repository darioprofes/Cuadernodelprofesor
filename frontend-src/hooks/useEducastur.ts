import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { SincronizarEducasturInput, SincronizarEducasturResult } from '../types/api';

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
