import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Meeting, MeetingInput, MeetingPatch } from '../types/api';

const queryKey = (yearId: string) => ['meetings', yearId];

export function useMeetings(yearId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(yearId),
        queryFn: () => api.get<Meeting[]>(`/academic-years/${yearId}/meetings`),
        enabled: (options?.enabled ?? true) && !!yearId,
    });
}

export function useCreateMeeting() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ yearId, data }: { yearId: string; data: MeetingInput }) =>
            api.post<Meeting>(`/academic-years/${yearId}/meetings`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}

export function useUpdateMeeting() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; yearId: string; data: MeetingPatch }) =>
            api.patch<Meeting>(`/meetings/${id}`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}

export function useDeleteMeeting() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; yearId: string }) => api.delete(`/meetings/${id}`),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}
