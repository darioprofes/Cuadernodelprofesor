import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { KeyCompetence, KeyCompetenceInput, OperationalDescriptorInput } from '../types/api';

const QUERY_KEY = ['keyCompetences'];

export function useKeyCompetences(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: QUERY_KEY,
        queryFn: () => api.get<KeyCompetence[]>('/key-competences'),
        enabled: options?.enabled ?? true,
    });
}

export function useCreateKeyCompetence() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: KeyCompetenceInput) => api.post<KeyCompetence>('/key-competences', data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useUpdateKeyCompetence() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<KeyCompetenceInput> }) =>
            api.patch<KeyCompetence>(`/key-competences/${id}`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useDeleteKeyCompetence() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete(`/key-competences/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useCreateDescriptor() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ keyCompetenceId, data }: { keyCompetenceId: string; data: OperationalDescriptorInput }) =>
            api.post(`/key-competences/${keyCompetenceId}/descriptors`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useDeleteDescriptor() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (descriptorId: string) => api.delete(`/key-competences/descriptors/${descriptorId}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}
