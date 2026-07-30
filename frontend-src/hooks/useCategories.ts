import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
        onSuccess: (_, { classId }) => queryClient.invalidateQueries({ queryKey: queryKey(classId) }),
    });
}
