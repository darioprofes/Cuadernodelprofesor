import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { AcademicYear, AcademicYearInput, AcademicYearPatch, EvaluationPeriod, EvaluationPeriodInput, EvaluationPeriodPatch } from '../types/api';

const QUERY_KEY = ['academicYears'];
const periodsQueryKey = (yearId: string) => ['evaluationPeriods', yearId];

export function useAcademicYears(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: QUERY_KEY,
        queryFn: () => api.get<AcademicYear[]>('/academic-years'),
        enabled: options?.enabled ?? true,
    });
}

export function useCreateAcademicYear() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: AcademicYearInput) => api.post<AcademicYear>('/academic-years', data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useUpdateAcademicYear() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: AcademicYearPatch }) => api.patch<AcademicYear>(`/academic-years/${id}`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useActivateAcademicYear() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.post<AcademicYear>(`/academic-years/${id}/activate`, {}),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useDeleteAcademicYear() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete(`/academic-years/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

// Wrapper de conveniencia sobre useAcademicYears(): el curso académico
// `isCurrent` es lo que necesitan classes/enrollments/... (bloque 4 en
// adelante) para saber a qué academic_year_id colgar sus altas.
export function useCurrentAcademicYear(options?: { enabled?: boolean }) {
    const query = useAcademicYears(options);
    return { ...query, data: query.data?.find(y => y.isCurrent) };
}

export function useEvaluationPeriods(yearId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: periodsQueryKey(yearId),
        queryFn: () => api.get<EvaluationPeriod[]>(`/academic-years/${yearId}/evaluation-periods`),
        enabled: (options?.enabled ?? true) && !!yearId,
    });
}

export function useCreateEvaluationPeriod() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ yearId, data }: { yearId: string; data: EvaluationPeriodInput }) =>
            api.post<EvaluationPeriod>(`/academic-years/${yearId}/evaluation-periods`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: periodsQueryKey(yearId) }),
    });
}

export function useUpdateEvaluationPeriod() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; yearId: string; data: EvaluationPeriodPatch }) =>
            api.patch<EvaluationPeriod>(`/academic-years/evaluation-periods/${id}`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: periodsQueryKey(yearId) }),
    });
}

export function useDeleteEvaluationPeriod() {
    const queryClient = useQueryClient();
    return useMutation({
        // Ojo: la ruta cuelga del router /academic-years (ver
        // routers/academic_years.py), no de /evaluation-periods a secas —
        // bug real encontrado aquí (bloque 6, nunca antes probado porque
        // esta UI no existía todavía).
        mutationFn: ({ id }: { id: string; yearId: string }) => api.delete(`/academic-years/evaluation-periods/${id}`),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: periodsQueryKey(yearId) }),
    });
}
