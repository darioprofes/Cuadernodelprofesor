import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { SpecificCompetence, SpecificCompetenceInput } from '../types/api';

const queryKey = (courseId: string) => ['specificCompetences', courseId];

export function useSpecificCompetences(courseId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(courseId),
        queryFn: () => api.get<SpecificCompetence[]>(`/courses/${courseId}/competences`),
        enabled: (options?.enabled ?? true) && !!courseId,
    });
}

// Para consumidores que necesitan las competencias de TODAS las materias a
// la vez (App.tsx, bloque 7) — ver useEvaluationCriteriaForCourses.
export function useSpecificCompetencesForCourses(courseIds: string[], options?: { enabled?: boolean }) {
    return useQueries({
        queries: courseIds.map(courseId => ({
            queryKey: queryKey(courseId),
            queryFn: () => api.get<SpecificCompetence[]>(`/courses/${courseId}/competences`),
            enabled: (options?.enabled ?? true) && !!courseId,
        })),
    });
}

export function useCreateSpecificCompetence() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ courseId, data }: { courseId: string; data: SpecificCompetenceInput }) =>
            api.post<SpecificCompetence>(`/courses/${courseId}/competences`, data),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}

export function useUpdateSpecificCompetence() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; courseId: string; data: Partial<SpecificCompetenceInput> }) =>
            api.patch<SpecificCompetence>(`/competences/${id}`, data),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}

export function useDeleteSpecificCompetence() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; courseId: string }) => api.delete(`/competences/${id}`),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}

export function useLinkDescriptor() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ competenceId, descriptorId }: { competenceId: string; courseId: string; descriptorId: string }) =>
            api.post(`/competences/${competenceId}/descriptors`, { descriptorId }),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}

export function useUnlinkDescriptor() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ competenceId, descriptorId }: { competenceId: string; courseId: string; descriptorId: string }) =>
            api.delete(`/competences/${competenceId}/descriptors/${descriptorId}`),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}
