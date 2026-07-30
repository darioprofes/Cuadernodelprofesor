import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ClassData, ClassInput, ClassPatch } from '../types/api';

// Nombre "useApiClasses" (no "useClasses") a propósito: durante la
// transición convive con classes-en-el-blob-viejo en varios ficheros a la
// vez (ver plan, bloque 4) — evita colisión de nombres con lo existente.
const queryKey = (yearId: string) => ['classes', yearId];

export function useApiClasses(yearId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(yearId),
        queryFn: () => api.get<ClassData[]>(`/academic-years/${yearId}/classes`),
        enabled: (options?.enabled ?? true) && !!yearId,
    });
}

export function useCreateClass() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ yearId, data }: { yearId: string; data: ClassInput }) =>
            api.post<ClassData>(`/academic-years/${yearId}/classes`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}

export function useUpdateClass() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; yearId: string; data: ClassPatch }) =>
            api.patch<ClassData>(`/classes/${id}`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}

export function useDeleteClass() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; yearId: string }) => api.delete(`/classes/${id}`),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}
