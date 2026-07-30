import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Student, StudentInput, StudentPatch } from '../types/api';

// "useApiStudents" (no "useStudents") a propósito: durante la transición
// convive con el Student embebido por clase de ../types.ts en varios
// ficheros a la vez (ver plan, bloque 5).
const QUERY_KEY = ['students'];

export function useApiStudents(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: QUERY_KEY,
        queryFn: () => api.get<Student[]>('/students'),
        enabled: options?.enabled ?? true,
    });
}

export function useCreateStudent() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: StudentInput) => api.post<Student>('/students', data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useUpdateStudent() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: StudentPatch }) => api.patch<Student>(`/students/${id}`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useDeleteStudent() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete(`/students/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}
