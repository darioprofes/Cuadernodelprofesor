import { useQuery } from '@tanstack/react-query';

// Igual que useIaLocalDisponible(), pero para Groq -- aquí "disponible"
// solo comprueba que el servidor tiene la clave configurada (ver
// api/app/routers/prompts.py::estado_groq), no hace una llamada real a
// Groq (para no gastar cuota de peticiones/minuto en una simple
// comprobación de estado).
export function useGroqDisponible() {
    const query = useQuery({
        queryKey: ['groq-estado'],
        queryFn: async () => {
            const res = await fetch('/api/prompts/groq/estado');
            if (!res.ok) return { disponible: false };
            return res.json() as Promise<{ disponible: boolean }>;
        },
        staleTime: 20_000,
        refetchInterval: 30_000,
    });
    return query.data?.disponible ?? true;
}
