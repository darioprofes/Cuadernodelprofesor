import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { AgendaNote, AgendaNoteInput, AgendaNotePatch } from '../types/api';

const queryKey = (yearId: string) => ['agendaNotes', yearId];

export function useAgendaNotes(yearId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(yearId),
        queryFn: () => api.get<AgendaNote[]>(`/academic-years/${yearId}/agenda-notes`),
        enabled: (options?.enabled ?? true) && !!yearId,
    });
}

export function useCreateAgendaNote() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ yearId, data }: { yearId: string; data: AgendaNoteInput }) =>
            api.post<AgendaNote>(`/academic-years/${yearId}/agenda-notes`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}

export function useUpdateAgendaNote() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; yearId: string; data: AgendaNotePatch }) =>
            api.patch<AgendaNote>(`/agenda-notes/${id}`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}

export function useDeleteAgendaNote() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; yearId: string }) => api.delete(`/agenda-notes/${id}`),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}
