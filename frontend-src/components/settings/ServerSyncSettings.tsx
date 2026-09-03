import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Card from '../Card';
import Button from '../Button';
import Alert from '../Alert';
import Input from '../Input';
import Modal from '../Modal';

interface ServerSyncConfig {
    repo?: string;
    github_token?: string;
    age_key_path?: string;
}

// invoke() rechaza con el propio objeto ApiError ({status, detail}) del
// lado Rust, no con una instancia de Error -- mismo criterio que
// ImportScheduleModal.tsx. Sin esto, cualquier error se veía como
// "[object Object]" en vez del mensaje real.
const describeError = (e: unknown): string => {
    if (e && typeof e === 'object' && 'detail' in e) {
        return String((e as { detail: unknown }).detail);
    }
    return e instanceof Error ? e.message : String(e);
};

const TABLA_LABEL: Record<string, string> = {
    students: 'Alumnado',
    classes: 'Clases',
    courses: 'Materias',
    enrollments: 'Matrículas',
    grades: 'Calificaciones',
    meetings: 'Reuniones',
    tasks: 'Tareas',
};

// Apagada por defecto -- esta app no habla con GitHub para nada salvo que
// el profesor configure esto a mano. Pensada para cuando el servidor web
// falla: trae la última copia automática cifrada (ver el cron del
// servidor, farodocente-backups) y la restaura aquí para poder seguir
// trabajando esos días, y para volver a subirla cuando la web vuelva a
// funcionar. El token de GitHub y la ruta a la clave privada viven en un
// fichero propio fuera del SQLite de dominio (services/server_sync.rs),
// nunca dentro de un backup normal.
const ServerSyncSettings: React.FC = () => {
    const [config, setConfig] = useState<ServerSyncConfig>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const [checking, setChecking] = useState(false);
    const [checkError, setCheckError] = useState<string | null>(null);
    const [remoteSummary, setRemoteSummary] = useState<Record<string, number> | null>(null);
    const [localSummary, setLocalSummary] = useState<Record<string, number> | null>(null);

    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importedOk, setImportedOk] = useState(false);

    const [isUploadConfirmOpen, setIsUploadConfirmOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadedOk, setUploadedOk] = useState(false);

    useEffect(() => {
        invoke<ServerSyncConfig>('server_sync_get_config')
            .then(setConfig)
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            await invoke('server_sync_set_config', { config });
        } catch (e) {
            setSaveError(describeError(e));
        } finally {
            setSaving(false);
        }
    };

    const handleCheck = async () => {
        setChecking(true);
        setCheckError(null);
        setRemoteSummary(null);
        setLocalSummary(null);
        try {
            const [remote, local] = await Promise.all([
                invoke<Record<string, number>>('server_sync_check'),
                invoke<Record<string, number>>('server_sync_summarize_local'),
            ]);
            setRemoteSummary(remote);
            setLocalSummary(local);
        } catch (e) {
            setCheckError(describeError(e));
        } finally {
            setChecking(false);
        }
    };

    const handleConfirmImport = async () => {
        setImporting(true);
        setImportError(null);
        try {
            await invoke('server_sync_confirm_import');
            setImportedOk(true);
            setIsConfirmOpen(false);
        } catch (e) {
            setImportError(describeError(e));
        } finally {
            setImporting(false);
        }
    };

    const handleUploadToServer = async () => {
        setUploading(true);
        setUploadError(null);
        try {
            await invoke('server_sync_upload_to_server');
            setUploadedOk(true);
            setIsUploadConfirmOpen(false);
        } catch (e) {
            setUploadError(describeError(e));
        } finally {
            setUploading(false);
        }
    };

    if (loading) return <p className="text-sm text-slate-500">Cargando...</p>;

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-bold text-slate-800">Sincronización con el servidor</h3>

            <Alert variant="warning" title="Solo para cuando el servidor web falla">
                Trae la última copia de seguridad automática (cifrada) desde tu repositorio privado de GitHub y la
                restaura aquí, sustituyendo TODO lo que haya en esta copia de escritorio; o, al terminar, sube esta
                copia de vuelta al servidor. Mientras no uses ninguna de las dos, esta app no contacta con GitHub
                para nada.
            </Alert>

            <Card>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-slate-600">Repositorio (usuario/nombre-repo)</label>
                        <Input
                            type="text"
                            value={config.repo ?? ''}
                            onChange={e => setConfig(c => ({ ...c, repo: e.target.value }))}
                            placeholder="darioprofes/farodocente-backups"
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Token de acceso de GitHub (lectura y escritura del repo)</label>
                        <Input
                            type="password"
                            value={config.github_token ?? ''}
                            onChange={e => setConfig(c => ({ ...c, github_token: e.target.value }))}
                            placeholder="ghp_..."
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Ruta al archivo de clave privada (rescue-key.txt)</label>
                        <Input
                            type="text"
                            value={config.age_key_path ?? ''}
                            onChange={e => setConfig(c => ({ ...c, age_key_path: e.target.value }))}
                            placeholder="C:\Users\...\rescue-key.txt"
                            className="mt-1"
                        />
                    </div>
                    {saveError && <Alert variant="danger">{saveError}</Alert>}
                    <div className="flex justify-end">
                        <Button variant="primary" onClick={handleSave} disabled={saving}>
                            {saving ? 'Guardando...' : 'Guardar configuración'}
                        </Button>
                    </div>
                </div>
            </Card>

            <Card>
                <div className="space-y-3">
                    <p className="font-bold text-slate-800">Comprobar copia del servidor</p>
                    <p className="text-sm text-slate-600">
                        Descarga y descifra la última copia sin tocar nada todavía -- solo para ver qué trae antes de decidir.
                    </p>
                    <Button variant="secondary" onClick={handleCheck} disabled={checking}>
                        {checking ? 'Comprobando...' : 'Comprobar copia del servidor'}
                    </Button>

                    {checkError && <Alert variant="danger">{checkError}</Alert>}

                    {remoteSummary && localSummary && (
                        <div className="mt-2 space-y-3">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-500">
                                        <th className="font-medium">Tabla</th>
                                        <th className="font-medium text-right">Ahora tienes</th>
                                        <th className="font-medium text-right">El servidor trae</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.keys(remoteSummary).map(tabla => (
                                        <tr key={tabla} className="border-t">
                                            <td className="py-1">{TABLA_LABEL[tabla] ?? tabla}</td>
                                            <td className="py-1 text-right">{localSummary[tabla] ?? 0}</td>
                                            <td className="py-1 text-right font-semibold">{remoteSummary[tabla]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="flex justify-end">
                                <Button variant="danger" onClick={() => setIsConfirmOpen(true)}>
                                    Restaurar esta copia (sustituye todo)
                                </Button>
                            </div>
                        </div>
                    )}

                    {importedOk && (
                        <Alert variant="success">Copia restaurada. Reinicia la aplicación para verla reflejada en todas las pantallas.</Alert>
                    )}
                </div>
            </Card>

            <Card>
                <div className="space-y-3">
                    <p className="font-bold text-slate-800">Volver al servidor</p>
                    <p className="text-sm text-slate-600">
                        Cuando el servidor web vuelva a funcionar y hayas terminado de trabajar aquí, sube esta copia de
                        escritorio para que sustituya lo que haya en el servidor. Se cifra y se sube a tu repositorio
                        privado de GitHub; el servidor se hace su propia copia de seguridad antes de sustituir nada, por si acaso.
                    </p>
                    <Button variant="secondary" onClick={() => setIsUploadConfirmOpen(true)}>
                        Subir esta copia al servidor
                    </Button>
                    {uploadedOk && (
                        <Alert variant="success">
                            Copia subida. El servidor la recogerá y la aplicará él solo en unos instantes -- comprueba luego en
                            Ajustes → Copia de seguridad si ha quedado alguna copia previa pendiente de confirmar.
                        </Alert>
                    )}
                </div>
            </Card>

            <Modal isOpen={isUploadConfirmOpen} onClose={() => setIsUploadConfirmOpen(false)} title="Confirmar subida al servidor" size="md">
                <div className="space-y-4">
                    <Alert variant="danger" title="Esto sustituirá TODO lo que hay en el servidor">
                        No se puede deshacer desde aquí (el servidor se hace una copia de seguridad propia antes, pero recuperarla
                        exige entrar a mano). Solo hazlo si esta copia de escritorio es la versión buena y más reciente.
                    </Alert>
                    {uploadError && <Alert variant="danger">{uploadError}</Alert>}
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsUploadConfirmOpen(false)}>Cancelar</Button>
                        <Button variant="danger" onClick={handleUploadToServer} disabled={uploading}>
                            {uploading ? 'Subiendo...' : 'Sí, subir y sustituir el servidor'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} title="Confirmar restauración" size="md">
                <div className="space-y-4">
                    <Alert variant="danger" title="Esto sustituye TODO lo que hay en esta copia de escritorio">
                        No se puede deshacer. Compara bien los números de arriba antes de continuar -- si "Ahora tienes" ya
                        parece más completo que "El servidor trae", probablemente no necesitas restaurar nada.
                    </Alert>
                    {importError && <Alert variant="danger">{importError}</Alert>}
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsConfirmOpen(false)}>Cancelar</Button>
                        <Button variant="danger" onClick={handleConfirmImport} disabled={importing}>
                            {importing ? 'Restaurando...' : 'Sí, restaurar y sustituir todo'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ServerSyncSettings;
