import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ProgrammingUnit, ProgrammingUnitInput } from '../types/api';

const queryKey = (courseId: string) => ['programmingUnits', courseId];

export function useProgrammingUnits(courseId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(courseId),
        queryFn: () => api.get<ProgrammingUnit[]>(`/courses/${courseId}/programming-units`),
        enabled: (options?.enabled ?? true) && !!courseId,
    });
}

export function useCreateProgrammingUnit() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ courseId, data }: { courseId: string; data: ProgrammingUnitInput }) =>
            api.post<ProgrammingUnit>(`/courses/${courseId}/programming-units`, data),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}

export function useUpdateProgrammingUnit() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; courseId: string; data: Partial<ProgrammingUnitInput> }) =>
            api.patch<ProgrammingUnit>(`/programming-units/${id}`, data),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}

export function useDeleteProgrammingUnit() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; courseId: string }) => api.delete(`/programming-units/${id}`),
        onSuccess: (_, { courseId }) => queryClient.invalidateQueries({ queryKey: queryKey(courseId) }),
    });
}
