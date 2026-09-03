import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Card from '../Card';
import Button from '../Button';
import Alert from '../Alert';
import Input from '../Input';
import Modal from '../Modal';

interface RescueConfig {
    repo?: string;
    github_token?: string;
    age_key_path?: string;
}

const TABLA_LABEL: Record<string, string> = {
    students: 'Alumnado',
    classes: 'Clases',
    courses: 'Materias',
    enrollments: 'Matrículas',
    grades: 'Calificaciones',
    meetings: 'Reuniones',
    tasks: 'Tareas',
};

// Apagado por defecto -- esta app no habla con GitHub para nada salvo que
// el profesor configure esto a mano. Pensado para cuando el servidor web
// falla: trae la última copia automática cifrada (ver el cron del
// servidor, farodocente-backups) y la restaura aquí para poder seguir
// trabajando esos días. El token de GitHub y la ruta a la clave privada
// viven en un fichero propio fuera del SQLite de dominio (services/
// rescue.rs), nunca dentro de un backup normal.
const RescueSettings: React.FC = () => {
    const [config, setConfig] = useState<RescueConfig>({});
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

    useEffect(() => {
        invoke<RescueConfig>('rescue_get_config')
            .then(setConfig)
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            await invoke('rescue_set_config', { config });
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : String(e));
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
                invoke<Record<string, number>>('rescue_check'),
                invoke<Record<string, number>>('rescue_summarize_local'),
            ]);
            setRemoteSummary(remote);
            setLocalSummary(local);
        } catch (e) {
            setCheckError(e instanceof Error ? e.message : String(e));
        } finally {
            setChecking(false);
        }
    };

    const handleConfirmImport = async () => {
        setImporting(true);
        setImportError(null);
        try {
            await invoke('rescue_confirm_import');
            setImportedOk(true);
            setIsConfirmOpen(false);
        } catch (e) {
            setImportError(e instanceof Error ? e.message : String(e));
        } finally {
            setImporting(false);
        }
    };

    if (loading) return <p className="text-sm text-slate-500">Cargando...</p>;

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-bold text-slate-800">Modo rescate</h3>

            <Alert variant="warning" title="Solo para cuando el servidor web falla">
                Trae la última copia de seguridad automática (cifrada) desde tu repositorio privado de GitHub y la
                restaura aquí, sustituyendo TODO lo que haya en esta copia de escritorio. Mientras no lo uses, esta
                app no contacta con GitHub para nada.
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
                        <label className="text-xs font-medium text-slate-600">Token de acceso de GitHub (lectura del repo)</label>
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
                    <p className="font-bold text-slate-800">Comprobar copia de rescate</p>
                    <p className="text-sm text-slate-600">
                        Descarga y descifra la última copia sin tocar nada todavía -- solo para ver qué trae antes de decidir.
                    </p>
                    <Button variant="secondary" onClick={handleCheck} disabled={checking}>
                        {checking ? 'Comprobando...' : 'Comprobar copia de rescate'}
                    </Button>

                    {checkError && <Alert variant="danger">{checkError}</Alert>}

                    {remoteSummary && localSummary && (
                        <div className="mt-2 space-y-3">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-500">
                                        <th className="font-medium">Tabla</th>
                                        <th className="font-medium text-right">Ahora tienes</th>
                                        <th className="font-medium text-right">La copia de rescate trae</th>
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
                        <Alert variant="success">Copia de rescate restaurada. Reinicia la aplicación para verla reflejada en todas las pantallas.</Alert>
                    )}
                </div>
            </Card>

            <Modal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} title="Confirmar restauración" size="md">
                <div className="space-y-4">
                    <Alert variant="danger" title="Esto sustituye TODO lo que hay en esta copia de escritorio">
                        No se puede deshacer. Compara bien los números de arriba antes de continuar -- si "Ahora tienes" ya
                        parece más completo que "La copia de rescate trae", probablemente no necesitas restaurar nada.
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

export default RescueSettings;
