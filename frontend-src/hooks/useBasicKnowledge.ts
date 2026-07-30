import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { BasicKnowledge, BasicKnowledgeInput } from '../types/api';

const queryKey = (courseId: string) => ['basicKnowledge', courseId];

export function useBasicKnowledge(courseId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(courseId),
        queryFn: () => api.get<BasicKnowledge[]>(`/courses/${courseId}/basic-knowledge`),
        enabled: (options?.enabled ?? true) && !!courseId,
    });
}

export function useCreateBasicKnowledge() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ courseId, data }: { courseId: string; data: BasicKnowledgeInput }) =>
            api.post<BasicKnowledge>(`/courses/${courseId}/basic-knowledge`, data),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}

export function useUpdateBasicKnowledge() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; courseId: string; data: Partial<BasicKnowledgeInput> }) =>
            api.patch<BasicKnowledge>(`/basic-knowledge/${id}`, data),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}

export function useDeleteBasicKnowledge() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; courseId: string }) => api.delete(`/basic-knowledge/${id}`),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}
