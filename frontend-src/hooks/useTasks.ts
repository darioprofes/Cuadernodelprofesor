import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Task, TaskInput, TaskPatch } from '../types/api';

const queryKey = (yearId: string) => ['tasks', yearId];

export function useTasks(yearId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(yearId),
        queryFn: () => api.get<Task[]>(`/academic-years/${yearId}/tasks`),
        enabled: (options?.enabled ?? true) && !!yearId,
    });
}

export function useCreateTask() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ yearId, data }: { yearId: string; data: TaskInput }) =>
            api.post<Task>(`/academic-years/${yearId}/tasks`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}

export function useUpdateTask() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; yearId: string; data: TaskPatch }) =>
            api.patch<Task>(`/tasks/${id}`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}

export function useDeleteTask() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; yearId: string }) => api.delete(`/tasks/${id}`),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}
