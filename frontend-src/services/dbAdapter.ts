import type { Database } from 'sql.js';
import { isTauri, invoke } from '@tauri-apps/api/core';
import type { ClassData } from '../types';
import { extractPhotos, stripPhotos, mergePhotos } from '../utils';

// Punto único donde useDatabase() (App.tsx) conoce que existen dos destinos
// de persistencia: el servidor propio (web, detrás de Authentik) y un
// fichero local (escritorio, Tauri — ver src-tauri/src/lib.rs). El resto de
// la app no debe volver a preguntarse "¿estamos en escritorio?": cada
// adaptador resuelve sus propias diferencias (fotos aparte vs. inline,
// control de versión optimista vs. ninguno) detrás de la misma interfaz.

export class VersionConflictError extends Error {}

export interface RawDb {
    data: Uint8Array;
    version: number | null;
}

export interface DbAdapter {
    get(): Promise<RawDb | undefined>;
    set(data: Uint8Array, expectedVersion: number | null): Promise<number | null>;
    // Fotos (Student.foto, data URL): en la web viven aparte del blob para
    // no resubirlas en cada autoguardado (ver comentario histórico en
    // schema.sql); en escritorio no hay ese coste de red, así que viajan
    // siempre dentro. Estos métodos son el único sitio que necesita saberlo.
    stripPhotosForStorage(classes: ClassData[]): ClassData[];
    hydratePhotosOnLoad(classes: ClassData[]): Promise<ClassData[]>;
    syncPhotosAfterSave(classes: ClassData[]): Promise<void>;
    syncPhotosForImport(classes: ClassData[]): Promise<void>;
    resetPhotos(): Promise<void>;
    embedPhotosForExport(db: Database): Promise<void>;
}

// ---- Web: servidor propio (fetch a /api/db, /api/photos) ----

class RemoteDbAdapter implements DbAdapter {
    // Últimas fotos que sabemos que ya están en el servidor, para solo subir
    // las que de verdad han cambiado en vez de resubirlas todas en cada
    // autoguardado.
    private photosCache: Record<string, string> = {};

    async get(): Promise<RawDb | undefined> {
        const response = await fetch('/api/db');
        if (response.status === 204) return undefined;
        if (!response.ok) {
            throw new Error(`No se pudo cargar la base de datos del servidor (HTTP ${response.status}).`);
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength === 0) return undefined;
        const versionHeader = response.headers.get('X-Blob-Version');
        return { data: new Uint8Array(buffer), version: versionHeader ? parseInt(versionHeader, 10) : 1 };
    }

    async set(data: Uint8Array, expectedVersion: number | null): Promise<number> {
        const headers: Record<string, string> = {};
        if (expectedVersion !== null) headers['X-Blob-Version'] = String(expectedVersion);
        const response = await fetch('/api/db', { method: 'PUT', body: data, headers });
        if (response.status === 409) {
            const body = await response.json().catch(() => ({}));
            throw new VersionConflictError(body.detail || 'La base de datos se ha modificado desde otra pestaña o dispositivo. Recarga la página antes de seguir editando.');
        }
        if (!response.ok) {
            throw new Error(`No se pudo guardar la base de datos en el servidor (HTTP ${response.status}).`);
        }
        const result = await response.json();
        return result.version;
    }

    stripPhotosForStorage(classes: ClassData[]): ClassData[] {
        return stripPhotos(classes);
    }

    async hydratePhotosOnLoad(classes: ClassData[]): Promise<ClassData[]> {
        const photos = await this.fetchAllPhotos();
        this.photosCache = photos;
        return mergePhotos(classes, photos);
    }

    async syncPhotosAfterSave(classes: ClassData[]): Promise<void> {
        const currentPhotos = extractPhotos(classes);
        await this.diffAndSync(currentPhotos, this.photosCache);
        this.photosCache = currentPhotos;
    }

    async syncPhotosForImport(classes: ClassData[]): Promise<void> {
        // El .db importado puede traer fotos embebidas (si viene de
        // exportDatabase, que las incluye para que la copia sea
        // autocontenida) — se tratan como la verdad definitiva de la
        // restauración: se sincroniza el servidor para que coincida
        // exactamente con ellas, no solo se añaden.
        const importedPhotos = extractPhotos(classes);
        const serverPhotos = await this.fetchAllPhotos();
        await this.diffAndSync(importedPhotos, serverPhotos);
        this.photosCache = importedPhotos;
    }

    async resetPhotos(): Promise<void> {
        await fetch('/api/photos', { method: 'DELETE' });
        this.photosCache = {};
    }

    // Async porque la copia de seguridad manual debe ser autocontenida: se
    // embeben las fotos actuales del servidor en la fila 'main' del propio
    // fichero .db exportado (que normalmente se guarda sin ellas), para
    // poder restaurar sin depender de que sigan existiendo en Postgres.
    async embedPhotosForExport(db: Database): Promise<void> {
        try {
            const res = db.exec("SELECT data FROM app_data WHERE key = 'main'");
            if (res.length > 0 && res[0].values.length > 0) {
                // data es TEXT en el esquema de app_data (siempre JSON.stringify
                // al guardar), sql.js solo lo tipa como SqlValue en general.
                const currentMain = JSON.parse(res[0].values[0][0] as string);
                const photos = await this.fetchAllPhotos();
                const withPhotos = { ...currentMain, classes: mergePhotos(currentMain.classes, photos) };
                db.exec("INSERT OR REPLACE INTO app_data (key, data) VALUES ('main', ?)", [JSON.stringify(withPhotos)]);
            }
        } catch (e) {
            console.error("No se pudieron incrustar las fotos en la copia de seguridad, se exporta sin ellas:", e);
        }
    }

    private async fetchAllPhotos(): Promise<Record<string, string>> {
        const response = await fetch('/api/photos');
        if (!response.ok) return {};
        return response.json();
    }

    private async diffAndSync(target: Record<string, string>, baseline: Record<string, string>): Promise<void> {
        const ops: Promise<void>[] = [];
        Object.entries(target).forEach(([studentId, foto]) => {
            if (baseline[studentId] !== foto) {
                ops.push(fetch(`/api/photos/${studentId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dataUrl: foto }),
                }).then(() => undefined));
            }
        });
        Object.keys(baseline).forEach(studentId => {
            if (!(studentId in target)) {
                ops.push(fetch(`/api/photos/${studentId}`, { method: 'DELETE' }).then(() => undefined));
            }
        });
        if (ops.length > 0) await Promise.all(ops);
    }
}

// ---- Escritorio: fichero local (Tauri, ver src-tauri/src/lib.rs) ----

class LocalDbAdapter implements DbAdapter {
    async get(): Promise<RawDb | undefined> {
        const bytes = await invoke<number[] | null>('load_db');
        return bytes ? { data: new Uint8Array(bytes), version: null } : undefined;
    }

    async set(data: Uint8Array): Promise<null> {
        await invoke('save_db', { bytes: Array.from(data) });
        return null;
    }

    // Sin segundo almacén de fotos en escritorio: viajan siempre dentro del
    // blob, así que todo lo de abajo es identidad/no-op.
    stripPhotosForStorage(classes: ClassData[]): ClassData[] {
        return classes;
    }

    async hydratePhotosOnLoad(classes: ClassData[]): Promise<ClassData[]> {
        return classes;
    }

    async syncPhotosAfterSave(): Promise<void> {
        // no-op
    }

    async syncPhotosForImport(): Promise<void> {
        // no-op
    }

    async resetPhotos(): Promise<void> {
        // no-op
    }

    async embedPhotosForExport(): Promise<void> {
        // no-op: la fila 'main' ya tiene las fotos embebidas siempre
    }
}

export const dbAdapter: DbAdapter = isTauri() ? new LocalDbAdapter() : new RemoteDbAdapter();
