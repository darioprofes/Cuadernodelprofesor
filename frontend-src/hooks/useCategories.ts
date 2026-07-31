import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Category, CategoryInput, CategoryPatch } from '../types/api';

const queryKey = (classId: string) => ['categories', classId];

export function useCategories(classId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(classId),
        queryFn: () => api.get<Category[]>(`/classes/${classId}/categories`),
        enabled: (options?.enabled ?? true) && !!classId,
    });
}

// Para hidratar varias clases a la vez (App.tsx, ver bloque 6) — mismo
// patrón que useEnrollmentsForClasses (bloque 5): no hay endpoint "todas
// las categorías del curso académico" en el contrato.
export function useCategoriesForClasses(classIds: string[], options?: { enabled?: boolean }) {
    return useQueries({
        queries: classIds.map(classId => ({
            queryKey: queryKey(classId),
            queryFn: () => api.get<Category[]>(`/classes/${classId}/categories`),
            enabled: (options?.enabled ?? true) && !!classId,
        })),
    });
}

export function useCreateCategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ classId, data }: { classId: string; data: CategoryInput }) =>
            api.post<Category>(`/classes/${classId}/categories`, data),
        onSuccess: (_, { classId }) => queryClient.invalidateQueries({ queryKey: queryKey(classId) }),
    });
}

export function useUpdateCategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; classId: string; data: CategoryPatch }) =>
            api.patch<Category>(`/categories/${id}`, data),
        onSuccess: (_, { classId }) => queryClient.invalidateQueries({ queryKey: queryKey(classId) }),
    });
}

export function useDeleteCategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; classId: string }) => api.delete(`/categories/${id}`),
        // category_id es ON DELETE CASCADE en assignments (y transitivamente
        // en grades) — sin invalidar esas dos, la caché se queda con tareas y
        // notas que el servidor ya borró.
        onSuccess: (_, { classId }) => {
            queryClient.invalidateQueries({ queryKey: queryKey(classId) });
            queryClient.invalidateQueries({ queryKey: ['assignments', classId] });
            queryClient.invalidateQueries({ queryKey: ['grades', classId] });
        },
    });
}
