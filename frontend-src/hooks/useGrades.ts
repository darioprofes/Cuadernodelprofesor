import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Grade, GradeInput } from '../types/api';

const queryKey = (classId: string) => ['grades', classId];

export function useGrades(classId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(classId),
        queryFn: () => api.get<Grade[]>(`/classes/${classId}/grades`),
        enabled: (options?.enabled ?? true) && !!classId,
    });
}

// Para hidratar varias clases a la vez (App.tsx, ver bloque 6) — mismo
// patrón que useEnrollmentsForClasses (bloque 5).
export function useGradesForClasses(classIds: string[], options?: { enabled?: boolean }) {
    return useQueries({
        queries: classIds.map(classId => ({
            queryKey: queryKey(classId),
            queryFn: () => api.get<Grade[]>(`/classes/${classId}/grades`),
            enabled: (options?.enabled ?? true) && !!classId,
        })),
    });
}

// Sin expectedUpdatedAt (última escritura gana, a propósito — ver plan
// principal, sección GRADE). classId solo se usa para invalidar la cache de
// lectura en bloque de esa clase, no forma parte de la ruta.
export function usePutGrade() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ assignmentId, enrollmentId, data }: { assignmentId: string; enrollmentId: string; classId: string; data: GradeInput }) =>
            api.put<Grade>(`/assignments/${assignmentId}/grades/${enrollmentId}`, data),
        onSuccess: (_, { classId }) => queryClient.invalidateQueries({ queryKey: queryKey(classId) }),
    });
}

export function useDeleteGrade() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ assignmentId, enrollmentId }: { assignmentId: string; enrollmentId: string; classId: string }) =>
            api.delete(`/assignments/${assignmentId}/grades/${enrollmentId}`),
        onSuccess: (_, { classId }) => queryClient.invalidateQueries({ queryKey: queryKey(classId) }),
    });
}
