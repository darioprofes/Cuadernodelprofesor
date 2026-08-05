import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Preferences, PreferencesInput } from '../types/api';

const queryKey = ['preferences'];

export function usePreferences(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey,
        queryFn: () => api.get<Preferences>('/preferences'),
        enabled: options?.enabled ?? true,
    });
}

export function useUpdatePreferences() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: PreferencesInput) => api.put<Preferences>('/preferences', data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });
}
