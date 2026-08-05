import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { JournalEntry, JournalEntryInput, JournalEntryPatch } from '../types/api';

const queryKey = (yearId: string) => ['journalEntries', yearId];

export function useJournalEntries(yearId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKey(yearId),
        queryFn: () => api.get<JournalEntry[]>(`/academic-years/${yearId}/journal-entries`),
        enabled: (options?.enabled ?? true) && !!yearId,
    });
}

// POST hace upsert por (classId, date, periodIndex) en el propio backend
// (ON CONFLICT ... DO UPDATE, ver services/journal_entries.py) — el
// consumidor no necesita distinguir "es nueva" de "ya existía", a
// diferencia del resto de entidades con create/update separados.
export function useSaveJournalEntry() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ yearId, data }: { yearId: string; data: JournalEntryInput }) =>
            api.post<JournalEntry>(`/academic-years/${yearId}/journal-entries`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}

export function useUpdateJournalEntry() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; yearId: string; data: JournalEntryPatch }) =>
            api.patch<JournalEntry>(`/journal-entries/${id}`, data),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}

export function useDeleteJournalEntry() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: string; yearId: string }) => api.delete(`/journal-entries/${id}`),
        onSuccess: (_, { yearId }) => queryClient.invalidateQueries({ queryKey: queryKey(yearId) }),
    });
}
