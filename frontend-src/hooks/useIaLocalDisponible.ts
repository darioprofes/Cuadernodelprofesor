import { useQuery } from '@tanstack/react-query';

// Comprobación barata de si el ia-server responde ahora mismo -- para
// desactivar los botones de "Generar con IA local" en vez de dejar que el
// profesor espere hasta un minuto para enterarse de que está caído (ver
// api/app/routers/prompts.py::estado_ia_local). Se refresca solo cada
// cierto tiempo, no en cada render -- no es un dato crítico, con que esté
// razonablemente al día vale.
export function useIaLocalDisponible() {
    const query = useQuery({
        queryKey: ['ia-local-estado'],
        queryFn: async () => {
            const res = await fetch('/api/prompts/ia-local/estado');
            if (!res.ok) return { disponible: false };
            return res.json() as Promise<{ disponible: boolean }>;
        },
        staleTime: 20_000,
        refetchInterval: 30_000,
    });
    // Mientras carga la primera vez, se asume disponible (optimista) para no
    // hacer parpadear los botones -- si de verdad no responde, el propio
    // intento de generar ya lo dirá con un error claro.
    return query.data?.disponible ?? true;
}
