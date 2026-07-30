import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { EvaluationTool } from '../types';

const QUERY_KEY = ['evaluationTools'];

export function useEvaluationTools(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: QUERY_KEY,
        queryFn: () => api.get<EvaluationTool[]>('/evaluation-tools'),
        enabled: options?.enabled ?? true,
    });
}

export function useCreateEvaluationTool() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: Omit<EvaluationTool, 'id'>) => api.post<EvaluationTool>('/evaluation-tools', data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useUpdateEvaluationTool() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Omit<EvaluationTool, 'id'>> }) =>
            api.patch<EvaluationTool>(`/evaluation-tools/${id}`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useDeleteEvaluationTool() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete(`/evaluation-tools/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}
