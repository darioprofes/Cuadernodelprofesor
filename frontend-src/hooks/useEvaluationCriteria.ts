import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { EvaluationCriterion, EvaluationCriterionInput } from '../types/api';

const queryKey = (courseId: string) => ['evaluationCriteria', courseId];

export function useEvaluationCriteria(courseId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(courseId),
        queryFn: () => api.get<EvaluationCriterion[]>(`/courses/${courseId}/criteria`),
        enabled: (options?.enabled ?? true) && !!courseId,
    });
}

// Para consumidores que necesitan los criterios de TODAS las materias a la
// vez (App.tsx, bloque 7) — no hay endpoint "todos los criterios", igual
// que useCategoriesForClasses/useEnrollmentsForClasses.
export function useEvaluationCriteriaForCourses(courseIds: string[], options?: { enabled?: boolean }) {
    return useQueries({
        queries: courseIds.map(courseId => ({
            queryKey: queryKey(courseId),
            queryFn: () => api.get<EvaluationCriterion[]>(`/courses/${courseId}/criteria`),
            enabled: (options?.enabled ?? true) && !!courseId,
        })),
    });
}

export function useCreateCriterion() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ courseId, data }: { courseId: string; data: EvaluationCriterionInput }) =>
            api.post<EvaluationCriterion>(`/courses/${courseId}/criteria`, data),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}

export function useUpdateCriterion() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; courseId: string; data: Partial<EvaluationCriterionInput> }) =>
            api.patch<EvaluationCriterion>(`/criteria/${id}`, data),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}

export function useDeleteCriterion() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; courseId: string }) => api.delete(`/criteria/${id}`),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}
