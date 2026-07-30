// Cliente HTTP mínimo para el backend granular nuevo (ver fase-0-ddl-y-api.md).
// Solo se usa en web: en escritorio, las entidades aún no migradas (ver
// hooks/use*.ts) siguen leyendo/escribiendo del blob local a través de
// dbAdapter.ts/useDatabase(), sin pasar por aquí — ver Fase 8 del plan.

const API_BASE = '/api';

export class ApiError extends Error {
    status: number;
    detail: string;
    current?: unknown;

    constructor(status: number, detail: string, current?: unknown) {
        super(detail);
        this.status = status;
        this.detail = detail;
        this.current = current;
    }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
    });

    if (response.status === 204) {
        return undefined as T;
    }

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ApiError(response.status, body.detail || `Error HTTP ${response.status}`, body.current);
    }

    return response.json();
}

export const api = {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, data: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
    patch: <T>(path: string, data: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (path: string) => request<void>(path, { method: 'DELETE' }),
};
