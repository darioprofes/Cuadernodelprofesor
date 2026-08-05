import React, { useState, useRef, useMemo } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { ChevronDownIcon } from '../Icons';
import { runHealthCheck, type HealthCheckIssue } from '../../services/healthCheck';
import Card from '../Card';
import Button from '../Button';
import Alert from '../Alert';
import Badge from '../Badge';
import { TYPOGRAPHY } from '../../theme/typography';
import type { SettingsModalProps } from '../SettingsModal';

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

    // En escritorio la copia es un fichero SQLite (.db); en web (Fase 6) es
    // un volcado JSON de todas las tablas (services/backup.py) — mismo
    // botón, mismo flujo de descarga/subida, distinto contenido por dentro.
    const isDesktop = isTauri();
    const backupExtension = isDesktop ? 'db' : 'json';
    const backupMimeType = isDesktop ? 'application/x-sqlite3' : 'application/json';

    const handleExportClick = async () => {
        const data = await exportDatabase();
        if (data) {
            const blob = new Blob([data], { type: backupMimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cuaderno_backup_${new Date().toISOString().split('T')[0]}.${backupExtension}`;
            a.click();
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
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept={isDesktop ? '.db,.sqlite' : '.json'} className="hidden" />
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
                <a href="https://github.com/elCordones/CuadernMestre-v1.0" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">
                    CuadernMestre v1.0
                </a>
                {' '}de elCordones, licencia{' '}
                <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">
                    CC BY-NC 4.0
                </a>
                . Modificado para guardar los datos en servidor propio e importar el horario desde PDF.
            </p>
        </div>
    );
};

export default BackupManager;
