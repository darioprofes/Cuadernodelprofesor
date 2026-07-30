import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Enrollment, EnrollmentInput, EnrollmentPatch } from '../types/api';

const queryKey = (classId: string) => ['enrollments', classId];

export function useEnrollments(classId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(classId),
        queryFn: () => api.get<Enrollment[]>(`/classes/${classId}/enrollments`),
        enabled: (options?.enabled ?? true) && !!classId,
    });
}

// Para vistas que muestran varias clases a la vez (p.ej. ClasesView, la
// rejilla de tarjetas) — no existe un endpoint "todas las matrículas del
// curso académico" en el contrato, así que se pide una consulta por clase
// vía useQueries (react-query las cachea/comparte igual que useEnrollments).
export function useEnrollmentsForClasses(classIds: string[], options?: { enabled?: boolean }) {
    return useQueries({
        queries: classIds.map(classId => ({
            queryKey: queryKey(classId),
            queryFn: () => api.get<Enrollment[]>(`/classes/${classId}/enrollments`),
            enabled: (options?.enabled ?? true) && !!classId,
        })),
    });
}

export function useCreateEnrollment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ classId, data }: { classId: string; data: EnrollmentInput }) =>
            api.post<Enrollment>(`/classes/${classId}/enrollments`, data),
        onSuccess: (_, { classId }) => {
            queryClient.invalidateQueries({ queryKey: queryKey(classId) });
            // `newStudent` da de alta una persona nueva en el mismo paso — la
            // lista global de alumnado (useApiStudents) también queda
            // desactualizada, no solo la matrícula de esta clase.
            queryClient.invalidateQueries({ queryKey: ['students'] });
        },
    });
}

export function useUpdateEnrollment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; classId: string; data: EnrollmentPatch }) =>
            api.patch<Enrollment>(`/enrollments/${id}`, data),
        onSuccess: (_, { classId }) => queryClient.invalidateQueries({ queryKey: queryKey(classId) }),
    });
}

export function useDeleteEnrollment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; classId: string }) => api.delete(`/enrollments/${id}`),
        onSuccess: (_, { classId }) => queryClient.invalidateQueries({ queryKey: queryKey(classId) }),
    });
}
