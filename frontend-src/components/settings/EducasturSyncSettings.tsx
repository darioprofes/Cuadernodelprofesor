import React, { useState } from 'react';
import Card from '../Card';
import Button from '../Button';
import Alert from '../Alert';
import Modal from '../Modal';
import { useEducasturSettings, useUpdateEducasturSettings } from '../../hooks/useEducastur';

// Solo se monta en escritorio (ver SettingsModal.tsx) -- en web la
// sincronización con Educastur ya lleva tiempo en producción sin este
// aviso, no hace falta repetirlo ahí. Aquí sí: el sidecar Python +
// orquestación en Rust (services/educastur.rs) es una pieza nueva, sin
// verificar todavía con uso real, y habla con Educastur por su web normal
// (no una API publicada) -- puede dejar de funcionar sin más si Educastur
// cambia algo, y nadie garantiza que siga funcionando indefinidamente.
const EducasturSyncSettings: React.FC = () => {
    const { data: settings, isLoading } = useEducasturSettings();
    const updateSettings = useUpdateEducasturSettings();
    const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
    const [hasReadDisclaimer, setHasReadDisclaimer] = useState(false);

    const enabled = settings?.enabled ?? false;

    const handleToggleOff = () => {
        updateSettings.mutate({ enabled: false });
    };

    const handleOpenDisclaimer = () => {
        setHasReadDisclaimer(false);
        setIsDisclaimerOpen(true);
    };

    const handleAccept = () => {
        updateSettings.mutate(
            { enabled: true, acceptDisclaimer: true },
            { onSuccess: () => setIsDisclaimerOpen(false) },
        );
    };

    const acceptedAtLabel = settings?.disclaimerAcceptedAt
        ? new Date(settings.disclaimerAcceptedAt).toLocaleString('es-ES')
        : null;

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-bold text-slate-800">Sincronización con Educastur (experimental)</h3>

            <Card>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="font-bold text-slate-800">
                            {isLoading ? 'Comprobando estado...' : enabled ? 'Activada' : 'Desactivada'}
                        </p>
                        <p className="text-sm text-slate-600">
                            Permite subir las faltas del cuaderno a Educastur directamente desde la aplicación de escritorio.
                        </p>
                        {acceptedAtLabel && (
                            <p className="text-xs text-slate-400 mt-1">Aviso aceptado por última vez: {acceptedAtLabel}.</p>
                        )}
                    </div>
                    {enabled ? (
                        <Button variant="secondary" onClick={handleToggleOff} disabled={updateSettings.isPending} className="flex-shrink-0">
                            Desactivar
                        </Button>
                    ) : (
                        <Button variant="primary" onClick={handleOpenDisclaimer} disabled={isLoading} className="flex-shrink-0">
                            Activar...
                        </Button>
                    )}
                </div>
            </Card>

            {!enabled && (
                <p className="text-sm text-slate-500">
                    Mientras esté desactivada, el botón "Subir a Educastur" del cuaderno de notas no aparece.
                </p>
            )}

            <Modal isOpen={isDisclaimerOpen} onClose={() => setIsDisclaimerOpen(false)} title="Aviso antes de activar" size="md">
                <div className="space-y-4">
                    <Alert variant="warning" title="Es un script sin relación oficial con Educastur">
                        Esta función automatiza el mismo formulario web que usarías a mano (inicio de sesión, búsqueda del
                        alumnado y registro de la falta), imitando esos pasos por su cuenta. No usa ninguna API publicada ni
                        cuenta con el visto bueno de Educastur ni de la Consejería — puede dejar de funcionar sin previo aviso
                        si cambian su web, y su uso es responsabilidad exclusiva de quien lo activa.
                    </Alert>

                    <div className="text-sm text-slate-700 space-y-2">
                        <p className="font-semibold">Medidas tomadas para reducir el riesgo:</p>
                        <ul className="list-disc list-inside space-y-1 text-slate-600">
                            <li>El usuario y la contraseña se escriben cada vez que sincronizas; nunca se guardan en el ordenador ni se envían a ningún sitio salvo al propio Educastur.</li>
                            <li>Solo se envían las faltas pendientes de ese momento — nunca se borra ni modifica nada más en Educastur.</li>
                            <li>Los días festivos o sin horario asignado se descartan antes de intentar nada, para no mandar faltas que no tengan sentido.</li>
                            <li>Si algo falla a mitad de camino, la falta queda marcada con el error concreto en el cuaderno, sin quedar en un estado ambiguo.</li>
                        </ul>
                    </div>

                    <label className="flex items-start gap-2 text-sm text-slate-700 pt-2 border-t">
                        <input
                            type="checkbox"
                            checked={hasReadDisclaimer}
                            onChange={e => setHasReadDisclaimer(e.target.checked)}
                            className="mt-0.5"
                        />
                        He leído y entiendo que esta función no es oficial, que puede dejar de funcionar en cualquier momento, y que su uso es bajo mi propia responsabilidad.
                    </label>

                    {updateSettings.isError && (
                        <Alert variant="danger">
                            {updateSettings.error instanceof Error ? updateSettings.error.message : 'No se pudo activar la sincronización.'}
                        </Alert>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setIsDisclaimerOpen(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleAccept} disabled={!hasReadDisclaimer || updateSettings.isPending}>
                            {updateSettings.isPending ? 'Activando...' : 'Activar sincronización'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default EducasturSyncSettings;
