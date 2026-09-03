import React, { useState, useRef, useMemo } from 'react';
import { ChevronDownIcon } from '../Icons';
import { runHealthCheck, type HealthCheckIssue } from '../../services/healthCheck';
import Card from '../Card';
import Button from '../Button';
import Alert from '../Alert';
import Badge from '../Badge';
import Modal from '../Modal';
import { TYPOGRAPHY } from '../../theme/typography';
import type { SettingsModalProps } from '../SettingsModal';
import { openExternalLink } from '../../utils';
import { usePendingRestores, useDismissPendingRestore, useRestorePendingRestore } from '../../hooks/usePendingRestores';

type BackupManagerProps = Pick<SettingsModalProps,
    | 'importDatabase' | 'exportDatabase' | 'resetDatabase' | 'onOpenExportModal'
    | 'classes' | 'courses' | 'evaluationCriteria' | 'specificCompetences'
    | 'keyCompetences' | 'basicKnowledge' | 'programmingUnits'
    | 'academicConfiguration' | 'evaluationTools'
>;

const BackupManager: React.FC<BackupManagerProps> = (props) => {
    const { importDatabase, exportDatabase, resetDatabase, onOpenExportModal } = props;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [healthIssues, setHealthIssues] = useState<HealthCheckIssue[] | null>(null);

    // Copias que el servidor se hizo a sí mismo justo antes de una
    // restauración automática desde escritorio (ver /root/scripts/
    // restore_from_desktop.sh) -- se quedan pendientes de que el profesor
    // confirme que todo está bien y las borre, o las use para deshacer si
    // algo salió mal. Mismo aviso que la chip de "Avisos" en HoyView.tsx.
    const { data: pendingRestores = [] } = usePendingRestores();
    const dismissMutation = useDismissPendingRestore();
    const restoreMutation = useRestorePendingRestore();
    const [confirmRestoreFilename, setConfirmRestoreFilename] = useState<string | null>(null);
    const [restoreError, setRestoreError] = useState<string | null>(null);
    const [restoredOk, setRestoredOk] = useState(false);

    const handleDismissPendingRestore = async (filename: string) => {
        try {
            await dismissMutation.mutateAsync(filename);
        } catch (e) {
            alert(`No se pudo borrar: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleConfirmRestore = async () => {
        if (!confirmRestoreFilename) return;
        setRestoreError(null);
        try {
            await restoreMutation.mutateAsync(confirmRestoreFilename);
            setConfirmRestoreFilename(null);
            setRestoredOk(true);
        } catch (e) {
            setRestoreError(e instanceof Error ? e.message : String(e));
        }
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleHealthCheck = () => {
        setHealthIssues(runHealthCheck({
            classes: props.classes,
            courses: props.courses,
            criteria: props.evaluationCriteria,
            competences: props.specificCompetences,
            keyCompetences: props.keyCompetences,
            basicKnowledge: props.basicKnowledge,
            programmingUnits: props.programmingUnits,
            academicConfiguration: props.academicConfiguration,
            evaluationTools: props.evaluationTools,
        }));
    };

    const issuesByArea = useMemo(() => {
        if (!healthIssues) return [];
        const map = new Map<string, HealthCheckIssue[]>();
        healthIssues.forEach(issue => {
            if (!map.has(issue.area)) map.set(issue.area, []);
            map.get(issue.area)!.push(issue);
        });
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'));
    }, [healthIssues]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const buffer = await file.arrayBuffer();
        await importDatabase(buffer);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Mismo formato en ambas plataformas desde la Fase 7 (bloque 8): un
    // volcado JSON de todas las tablas (services/backup.py en web,
    // services/backup.rs en escritorio) — mismo botón, mismo flujo de
    // descarga/subida, mismo contenido por dentro.
    const backupExtension = 'json';
    const backupMimeType = 'application/json';

    const handleExportClick = async () => {
        try {
            const data = await exportDatabase();
            const blob = new Blob([data], { type: backupMimeType });
            const url = URL.createObjectURL(blob);
            const filename = `cuaderno_backup_${new Date().toISOString().split('T')[0]}.${backupExtension}`;
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            // Sin esto, la descarga sucede sin ningún indicio visible (el
            // navegador/WebView no muestra nada por sí solo) — el usuario no
            // sabe si ha ido bien hasta que revisa a mano su carpeta de
            // Descargas.
            alert(`Copia de seguridad descargada con éxito: "${filename}", en tu carpeta de Descargas.`);
        } catch (e) {
            console.error(e);
            alert(`Error al generar la copia de seguridad: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-bold text-slate-800">Copia de Seguridad y Datos</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <h4 className="font-bold text-slate-800 mb-2">Exportar Copia de Seguridad</h4>
                    <p className="text-sm text-slate-600 mb-4">Descarga un archivo .{backupExtension} con TODOS tus datos (clases, notas, configuración...).</p>
                    <Button variant="primary" onClick={handleExportClick} className="w-full">Descargar Copia (.{backupExtension})</Button>
                </Card>

                <Card>
                    <h4 className="font-bold text-slate-800 mb-2">Restaurar Copia</h4>
                    <p className="text-sm text-slate-600 mb-4">Sube un archivo .{backupExtension} previamente exportado para restaurar tus datos.</p>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
                    <Button variant="success" onClick={handleImportClick} className="w-full">Subir Archivo (.{backupExtension})</Button>
                </Card>

                <Card>
                    <h4 className="font-bold text-slate-800 mb-2">Informes CSV</h4>
                    <p className="text-sm text-slate-600 mb-4">Exporta las calificaciones e informes a hojas de cálculo (Excel/CSV).</p>
                    <Button variant="secondary" onClick={onOpenExportModal} className="w-full">Generar Informes</Button>
                </Card>
            </div>

            <div className="pt-6 border-t mt-8">
                <div className="flex items-center justify-between mb-2">
                    <h4 className={TYPOGRAPHY.sectionTitle}>Comprobar integridad de los datos</h4>
                    <Button variant="secondary" onClick={handleHealthCheck}>Comprobar ahora</Button>
                </div>
                <p className="text-sm text-slate-500 mb-3">
                    Revisa referencias rotas (tareas apuntando a categorías borradas, criterios inexistentes...) e ids duplicados. No corrige nada por sí solo, solo informa.
                </p>
                {healthIssues !== null && (
                    healthIssues.length === 0 ? (
                        <Alert variant="success">No se ha detectado ningún problema.</Alert>
                    ) : (
                        <div className="space-y-1.5">
                            {issuesByArea.map(([area, areaIssues]) => {
                                const errorCount = areaIssues.filter(i => i.severity === 'error').length;
                                const warningCount = areaIssues.length - errorCount;
                                return (
                                    <details key={area} className="border border-slate-200 rounded-lg group">
                                        <summary className="flex items-center justify-between gap-2 p-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                                            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                                <ChevronDownIcon className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
                                                {area}
                                            </span>
                                            <span className="flex items-center gap-1.5 flex-shrink-0">
                                                {errorCount > 0 && <Badge variant="danger">{errorCount} error{errorCount !== 1 ? 'es' : ''}</Badge>}
                                                {warningCount > 0 && <Badge variant="warning">{warningCount} aviso{warningCount !== 1 ? 's' : ''}</Badge>}
                                            </span>
                                        </summary>
                                        <ul className="px-3 pb-2.5 pt-1 space-y-1 border-t border-slate-100">
                                            {areaIssues.map((issue, i) => (
                                                <li key={i} className={`text-xs ${issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                                                    {issue.message}
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                );
                            })}
                        </div>
                    )
                )}
            </div>

            {pendingRestores.length > 0 && (
                <div className="pt-6 border-t border-amber-200 mt-8">
                    <h4 className="text-lg font-semibold text-amber-800 mb-2">Copias pendientes de confirmar</h4>
                    <p className="text-sm text-slate-600 mb-3">
                        El servidor se restauró automáticamente desde la app de escritorio y se guardó a sí mismo antes de
                        sustituir sus datos, por si algo saliera mal. Comprueba que todo está bien; si no lo está, puedes
                        volver a esta copia. Bórrala cuando ya no la necesites.
                    </p>
                    {restoredOk && <Alert variant="success">Restaurado. El servidor vuelve a tener los datos de justo antes de la restauración automática.</Alert>}
                    <div className="space-y-2">
                        {pendingRestores.map(p => (
                            <Alert key={p.filename} variant="warning">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="font-bold">{p.filename}</p>
                                        <p className="text-xs">{new Date(p.created_at).toLocaleString('es-ES')} · {(p.size_bytes / 1024).toFixed(0)} KB</p>
                                    </div>
                                    <div className="flex gap-2 flex-shrink-0">
                                        <Button variant="danger" onClick={() => setConfirmRestoreFilename(p.filename)}>
                                            Restaurar esta copia
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            onClick={() => handleDismissPendingRestore(p.filename)}
                                            disabled={dismissMutation.isPending}
                                        >
                                            {dismissMutation.isPending ? 'Borrando...' : 'Confirmar y borrar'}
                                        </Button>
                                    </div>
                                </div>
                            </Alert>
                        ))}
                    </div>
                </div>
            )}

            <Modal isOpen={confirmRestoreFilename !== null} onClose={() => setConfirmRestoreFilename(null)} title="Confirmar vuelta atrás" size="md">
                <div className="space-y-4">
                    <Alert variant="danger" title="Esto sustituirá TODO lo que hay ahora en el servidor">
                        Vuelve a dejar la base de datos como estaba justo antes de la restauración automática desde
                        escritorio -- lo que se importó entonces se pierde. Solo hazlo si esa restauración salió mal.
                    </Alert>
                    {restoreError && <Alert variant="danger">{restoreError}</Alert>}
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setConfirmRestoreFilename(null)}>Cancelar</Button>
                        <Button variant="danger" onClick={handleConfirmRestore} disabled={restoreMutation.isPending}>
                            {restoreMutation.isPending ? 'Restaurando...' : 'Sí, volver a esta copia'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <div className="pt-6 border-t border-red-200 mt-8">
                <h4 className="text-lg font-semibold text-red-800 mb-2">Zona de Peligro</h4>
                <Alert variant="danger">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="font-bold">Borrar todos los datos</p>
                            <p>Esta acción no se puede deshacer. Se eliminará todo el contenido de la aplicación.</p>
                        </div>
                        <Button variant="danger" onClick={resetDatabase} className="flex-shrink-0">Restablecer Aplicación</Button>
                    </div>
                </Alert>
            </div>

            <p className="text-xs text-slate-400 pt-4 border-t">
                Basado en{' '}
                <a href="https://github.com/elCordones/CuadernMestre-v1.0" target="_blank" rel="noopener noreferrer" onClick={(e) => openExternalLink(e, 'https://github.com/elCordones/CuadernMestre-v1.0')} className="underline hover:text-slate-600">
                    CuadernMestre v1.0
                </a>
                {' '}de elCordones, licencia{' '}
                <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener noreferrer" onClick={(e) => openExternalLink(e, 'https://creativecommons.org/licenses/by-nc/4.0/')} className="underline hover:text-slate-600">
                    CC BY-NC 4.0
                </a>
                . Modificado para guardar los datos en servidor propio e importar el horario desde PDF.
            </p>
        </div>
    );
};

export default BackupManager;
