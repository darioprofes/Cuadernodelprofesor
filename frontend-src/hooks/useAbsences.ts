import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Absence, AbsenceInput } from '../types/api';

const queryKey = (classId: string) => ['absences', classId];

export function useAbsences(classId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(classId),
        queryFn: () => api.get<Absence[]>(`/classes/${classId}/absences`),
        enabled: (options?.enabled ?? true) && !!classId,
    });
}

// Upsert por (enrollment_id, date, periodIndex) — mismo criterio que grades:
// última escritura gana, sin control de concurrencia (una única persona
// marcando su propia clase).
export function usePutAbsence() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ enrollmentId, data }: { enrollmentId: string; classId: string; data: AbsenceInput }) =>
            api.put<Absence>(`/enrollments/${enrollmentId}/absences`, data),
        onSuccess: (_, { classId }) => queryClient.invalidateQueries({ queryKey: queryKey(classId) }),
    });
}

export function useDeleteAbsence() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ enrollmentId, date, periodIndex }: { enrollmentId: string; classId: string; date: string; periodIndex: number }) =>
            api.delete(`/enrollments/${enrollmentId}/absences?date=${date}&period_index=${periodIndex}`),
        onSuccess: (_, { classId }) => queryClient.invalidateQueries({ queryKey: queryKey(classId) }),
    });
}
