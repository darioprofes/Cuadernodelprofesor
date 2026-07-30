import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Shortcut } from '../types';

const QUERY_KEY = ['shortcuts'];

export function useShortcuts(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: QUERY_KEY,
        queryFn: () => api.get<Shortcut[]>('/shortcuts'),
        enabled: options?.enabled ?? true,
    });
}

export function useCreateShortcut() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: Omit<Shortcut, 'id'>) => api.post<Shortcut>('/shortcuts', data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useUpdateShortcut() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Omit<Shortcut, 'id'>> }) =>
            api.patch<Shortcut>(`/shortcuts/${id}`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useDeleteShortcut() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete(`/shortcuts/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}
