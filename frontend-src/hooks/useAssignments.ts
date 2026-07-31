import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Assignment, AssignmentInput, AssignmentPatch } from '../types/api';

const queryKey = (classId: string) => ['assignments', classId];

export function useAssignments(classId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(classId),
        queryFn: () => api.get<Assignment[]>(`/classes/${classId}/assignments`),
        enabled: (options?.enabled ?? true) && !!classId,
    });
}

// Para hidratar varias clases a la vez (App.tsx, ver bloque 6) — mismo
// patrón que useEnrollmentsForClasses (bloque 5).
export function useAssignmentsForClasses(classIds: string[], options?: { enabled?: boolean }) {
    return useQueries({
        queries: classIds.map(classId => ({
            queryKey: queryKey(classId),
            queryFn: () => api.get<Assignment[]>(`/classes/${classId}/assignments`),
            enabled: (options?.enabled ?? true) && !!classId,
        })),
    });
}

export function useCreateAssignment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ classId, data }: { classId: string; data: AssignmentInput }) =>
            api.post<Assignment>(`/classes/${classId}/assignments`, data),
        onSuccess: (_, { classId }) => queryClient.invalidateQueries({ queryKey: queryKey(classId) }),
    });
}

export function useUpdateAssignment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; classId: string; data: AssignmentPatch }) =>
            api.patch<Assignment>(`/assignments/${id}`, data),
        onSuccess: (_, { classId }) => queryClient.invalidateQueries({ queryKey: queryKey(classId) }),
    });
}

export function useDeleteAssignment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; classId: string }) => api.delete(`/assignments/${id}`),
        // assignment_id es ON DELETE CASCADE en grades — sin invalidar esa
        // caché también, las notas de la tarea borrada se quedan visibles.
        onSuccess: (_, { classId }) => {
            queryClient.invalidateQueries({ queryKey: queryKey(classId) });
            queryClient.invalidateQueries({ queryKey: ['grades', classId] });
        },
    });
}
