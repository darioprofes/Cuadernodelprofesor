// Cliente único para el backend granular nuevo (ver fase-0-ddl-y-api.md).
// En web habla por fetch() con el backend FastAPI real; en escritorio
// (isTauri()) el mismo contrato de rutas/verbos se despacha al comando Rust
// api_request (ver src-tauri/src/routers/mod.rs), que sirve el mismo JSON
// desde un SQLite local en vez de Postgres. Este es el único fichero que
// necesita saber cuál de los dos es — ningún hook de hooks/use*.ts cambia.

import { isTauri, invoke } from '@tauri-apps/api/core';

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

interface DesktopApiError {
    status: number;
    detail: string;
}

function isDesktopApiError(err: unknown): err is DesktopApiError {
    return typeof err === 'object' && err !== null && 'status' in err && 'detail' in err;
}

async function requestDesktop<T>(path: string, options: RequestInit): Promise<T> {
    const method = (options.method ?? 'GET').toUpperCase();
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : undefined;

    try {
        // La copia de seguridad no pasa por api_request en escritorio: import
        // necesita una transacción real (&mut Connection), que ese router
        // genérico -- pensado para operaciones sueltas -- no ofrece (ver
        // comentario en src-tauri/src/lib.rs junto a backup_export/backup_import).
        if (path === '/backup/export' && method === 'GET') {
            return (await invoke<unknown>('backup_export')) as T;
        }
        if (path === '/backup/import' && method === 'POST') {
            return (await invoke<unknown>('backup_import', { dump: body })) as T;
        }
        const result = await invoke<unknown>('api_request', { method, path, body });
        return result as T;
    } catch (err) {
        if (isDesktopApiError(err)) {
            throw new ApiError(err.status, err.detail);
        }
        throw new ApiError(500, String(err));
    }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (isTauri()) {
        return requestDesktop<T>(path, options);
    }

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
    put: <T>(path: string, data: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (path: string) => request<void>(path, { method: 'DELETE' }),
};
