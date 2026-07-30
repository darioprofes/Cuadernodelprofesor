import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Course, CourseInput, CoursePatch } from '../types/api';

const QUERY_KEY = ['courses'];

export function useCourses(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: QUERY_KEY,
        queryFn: () => api.get<Course[]>('/courses'),
        enabled: options?.enabled ?? true,
    });
}

export function useCreateCourse() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CourseInput) => api.post<Course>('/courses', data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useUpdateCourse() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: CoursePatch }) => api.patch<Course>(`/courses/${id}`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useDeleteCourse() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete(`/courses/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}
