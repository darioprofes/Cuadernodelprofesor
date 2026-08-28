import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import { CheckCircleIcon, ClockIcon, ExclamationTriangleIcon, SparklesIcon, TrashIcon, XMarkIcon } from './Icons';
import type { TrabajoIA, ResultadoTrabajoSA, ResultadoTrabajoInstrumento } from '../hooks/useTrabajosIA';
import { useCancelarTrabajoIA } from '../hooks/useTrabajosIA';
import { api } from '../services/api';

interface TrabajosIAPanelProps {
    isOpen: boolean;
    onClose: () => void;
    trabajos: TrabajoIA[];
    onDescartar: (jobId: string) => void;
    onDescartarTerminados: () => void;
    // Ninguno de los dos guarda nada por sí solo -- piden el resultado
    // completo del trabajo y lo entregan al editor de revisión de siempre
    // (mismo formulario que crear/editar a mano), igual que cuando el modal
    // que lanzó la generación sigue abierto y la recibe él mismo. Ver
    // App.tsx (dueño de la navegación) y GenerarSituacionAprendizajeModal.tsx
    // / EvaluationToolManager.tsx (dueños del formulario de revisión).
    onAbrirBorradorSA: (courseId: string, resultado: ResultadoTrabajoSA) => void;
    onAbrirBorradorInstrumento: (courseId: string, resultado: ResultadoTrabajoInstrumento) => void;
}

const ESTADO_LABEL: Record<TrabajoIA['estado'], string> = {
    en_progreso: 'En curso',
    listo: 'Listo',
    error: 'Error',
    cancelado: 'Cancelado',
};

const ESTADO_ICONO: Record<TrabajoIA['estado'], React.FC<{ className?: string }>> = {
    en_progreso: SparklesIcon,
    listo: CheckCircleIcon,
    error: ExclamationTriangleIcon,
    cancelado: XMarkIcon,
};

const ESTADO_COLOR: Record<TrabajoIA['estado'], string> = {
    en_progreso: 'text-sky-700 bg-sky-50',
    listo: 'text-emerald-700 bg-emerald-50',
    error: 'text-red-700 bg-red-50',
    cancelado: 'text-slate-600 bg-slate-100',
};

// Tiempo transcurrido en texto corto -- suficiente para saber "esto lleva
// un rato" sin necesitar la hora exacta (que ya se puede leer del propio
// reloj del sistema si hiciera falta).
const formatearTranscurrido = (iniciadoSegundos: number): string => {
    const transcurridoS = Math.max(0, Date.now() / 1000 - iniciadoSegundos);
    if (transcurridoS < 60) return 'hace un momento';
    const minutos = Math.floor(transcurridoS / 60);
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;
    return `hace ${horas}h ${minutosRestantes}min`;
};

// Cuenta atrás real ("2:34") en vez de un texto estático con el segundero
// parado -- `esperaHastaSegundos` es un instante fijo (época Unix) que
// manda el backend, `ahoraMs` es el reloj local que se va actualizando
// cada segundo (ver el useEffect de más abajo) para recalcularla en vivo.
const formatearCuentaAtras = (esperaHastaSegundos: number, ahoraMs: number): string => {
    const restanteS = Math.max(0, esperaHastaSegundos - ahoraMs / 1000);
    const minutos = Math.floor(restanteS / 60);
    const segundos = Math.floor(restanteS % 60);
    return `${minutos}:${String(segundos).padStart(2, '0')}`;
};

const TrabajosIAPanel: React.FC<TrabajosIAPanelProps> = ({ isOpen, onClose, trabajos, onDescartar, onDescartarTerminados, onAbrirBorradorSA, onAbrirBorradorInstrumento }) => {
    const cancelarMutation = useCancelarTrabajoIA();
    const [cancelandoId, setCancelandoId] = useState<string | null>(null);
    const [guardandoId, setGuardandoId] = useState<string | null>(null);

    // Reloj local para las cuentas atrás -- solo ticka (cada segundo) si
    // ALGÚN trabajo tiene una espera real en marcha, para no forzar un
    // re-render por segundo cuando no hay ninguna cuenta atrás que mostrar.
    const [ahoraMs, setAhoraMs] = useState(() => Date.now());
    const hayEsperaEnMarcha = trabajos.some(t => t.estado === 'en_progreso' && !!t.esperaHasta);
    useEffect(() => {
        if (!hayEsperaEnMarcha) return;
        const id = setInterval(() => setAhoraMs(Date.now()), 1000);
        return () => clearInterval(id);
    }, [hayEsperaEnMarcha]);

    // "listo" queda fuera -- ver nota junto a descartarTrabajosTerminados en
    // HoyView.tsx, ese botón no debe poder tirar contenido sin guardar.
    const hayTerminados = trabajos.some(t => t.estado === 'error' || t.estado === 'cancelado');

    const handleCancelar = async (jobId: string) => {
        setCancelandoId(jobId);
        try {
            await cancelarMutation.mutateAsync(jobId);
        } catch {
            // La cola se refresca sola cada 8s -- si el trabajo ya había
            // terminado (404/estado ya no "en_progreso") no hace falta
            // avisar con un error, el propio refresco lo reflejará.
        } finally {
            setCancelandoId(null);
        }
    };

    // Pide el resultado completo del trabajo y lo entrega al editor de
    // revisión de siempre (mismo formulario que crear/editar a mano, con su
    // propio paso de revisar el instrumento del examen final si lo hay) --
    // navega hasta la materia del trabajo y cierra este panel para que se
    // vea. Sin esto, un trabajo "listo" con el modal que lo lanzó ya cerrado
    // no llega a ninguna parte: la generación termina pero nunca se llega a
    // revisar ni guardar.
    const handleAbrir = async (trabajo: TrabajoIA) => {
        if (!trabajo.courseId) return;
        setGuardandoId(trabajo.jobId);
        try {
            const resultado = await api.get<ResultadoTrabajoSA>(`/prompts/unidad-programacion/generar-groq-por-partes/${trabajo.jobId}`);
            onAbrirBorradorSA(trabajo.courseId, resultado);
            onDescartar(trabajo.jobId);
            onClose();
        } catch (err) {
            console.error('Error abriendo la SA generada:', err);
            alert('No se ha podido cargar el resultado generado. El trabajo se queda en la cola -- vuelve a intentarlo desde aquí.');
        } finally {
            setGuardandoId(null);
        }
    };

    const handleAbrirInstrumento = async (trabajo: TrabajoIA) => {
        if (!trabajo.courseId) return;
        setGuardandoId(trabajo.jobId);
        try {
            const resultado = await api.get<ResultadoTrabajoInstrumento>(`/prompts/instrumento-evaluacion/generar/${trabajo.jobId}`);
            onAbrirBorradorInstrumento(trabajo.courseId, resultado);
            onDescartar(trabajo.jobId);
            onClose();
        } catch (err) {
            console.error('Error abriendo el instrumento generado:', err);
            alert('No se ha podido cargar el resultado generado. El trabajo se queda en la cola -- vuelve a intentarlo desde aquí.');
        } finally {
            setGuardandoId(null);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Trabajos de IA en segundo plano" size="xl">
            {trabajos.length === 0 ? (
                <p className="text-sm text-slate-500">No hay ningún trabajo de IA en curso ni reciente.</p>
            ) : (
                <div className="space-y-3">
                    {trabajos.map(trabajo => {
                        const Icono = ESTADO_ICONO[trabajo.estado];
                        const esSAListaParaGuardar = trabajo.tipo === 'sa' && trabajo.estado === 'listo' && !!trabajo.courseId;
                        const esInstrumentoListoParaGuardar = trabajo.tipo === 'instrumento' && trabajo.estado === 'listo' && !!trabajo.courseId;
                        return (
                            <div key={trabajo.jobId} className="border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_COLOR[trabajo.estado]}`}>
                                            <Icono className="w-3.5 h-3.5" /> {ESTADO_LABEL[trabajo.estado]}
                                        </span>
                                        <span className="text-sm font-semibold text-slate-800 truncate">{trabajo.titulo}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                        <ClockIcon className="w-3.5 h-3.5" /> {formatearTranscurrido(trabajo.iniciado)}
                                    </p>
                                    {trabajo.estado === 'en_progreso' && trabajo.mensaje && (
                                        <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                                            <span>{trabajo.mensaje}</span>
                                            {trabajo.esperaHasta && (
                                                <span className="font-mono font-semibold text-slate-500 flex-shrink-0">
                                                    ({formatearCuentaAtras(trabajo.esperaHasta, ahoraMs)})
                                                </span>
                                            )}
                                        </p>
                                    )}
                                    {trabajo.estado === 'error' && trabajo.detail && (
                                        <p className="text-xs text-red-600 mt-1">{trabajo.detail}</p>
                                    )}
                                    {esSAListaParaGuardar && (
                                        <p className="text-xs text-emerald-700 mt-1">Todavía no se ha guardado -- pulsa "Revisar y guardar" para abrirla en el editor de este curso.</p>
                                    )}
                                    {esInstrumentoListoParaGuardar && (
                                        <p className="text-xs text-emerald-700 mt-1">Todavía no se ha guardado -- pulsa "Revisar y guardar" para abrirlo en el editor de este curso.</p>
                                    )}
                                </div>
                                <div className="flex-shrink-0 flex items-center gap-2">
                                    {trabajo.estado === 'en_progreso' && (
                                        <Button
                                            variant="danger"
                                            className="!py-1 !px-3 !text-xs"
                                            disabled={cancelandoId === trabajo.jobId}
                                            onClick={() => handleCancelar(trabajo.jobId)}
                                        >
                                            {cancelandoId === trabajo.jobId ? 'Cancelando...' : 'Cancelar'}
                                        </Button>
                                    )}
                                    {esSAListaParaGuardar && (
                                        <Button
                                            variant="success"
                                            className="!py-1 !px-3 !text-xs"
                                            disabled={guardandoId === trabajo.jobId}
                                            onClick={() => handleAbrir(trabajo)}
                                        >
                                            {guardandoId === trabajo.jobId ? 'Abriendo...' : 'Revisar y guardar'}
                                        </Button>
                                    )}
                                    {esInstrumentoListoParaGuardar && (
                                        <Button
                                            variant="success"
                                            className="!py-1 !px-3 !text-xs"
                                            disabled={guardandoId === trabajo.jobId}
                                            onClick={() => handleAbrirInstrumento(trabajo)}
                                        >
                                            {guardandoId === trabajo.jobId ? 'Abriendo...' : 'Revisar y guardar'}
                                        </Button>
                                    )}
                                    {trabajo.estado !== 'en_progreso' && (
                                        <Button
                                            variant="secondary"
                                            className="!py-1 !px-3 !text-xs"
                                            disabled={guardandoId === trabajo.jobId}
                                            onClick={() => onDescartar(trabajo.jobId)}
                                        >
                                            Descartar
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {hayTerminados && (
                <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
                    <Button variant="secondary" className="!py-1.5 !px-3 !text-xs" onClick={onDescartarTerminados}>
                        <TrashIcon className="w-3.5 h-3.5" /> Descartar todos los terminados
                    </Button>
                </div>
            )}
        </Modal>
    );
};

export default TrabajosIAPanel;
