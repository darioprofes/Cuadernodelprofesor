import React, { Suspense, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { Meeting } from '../types';
import Button from './Button';
import Textarea from './Textarea';
import MarkdownResult from './MarkdownResult';
import TextoResaltado from './TextoResaltado';
import AnonimizarSeleccionButton from './AnonimizarSeleccionButton';
import { SparklesIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, CheckCircleIcon } from './Icons';
import { useAnonimizar } from '../hooks/useAnonimizar';
import { useIaLocalDisponible } from '../hooks/useIaLocalDisponible';
import { useGroqDisponible } from '../hooks/useGroqDisponible';
import { quitarCodigo, anonimizarManual, reintegrar } from '../services/anonimizadorEdicion';
import { generarActaConGroq, generarActaConIA, generarPromptActa } from '../services/generarActaReunion';

// Mismo criterio que RichTextEditor en ReunionEditorScreen.tsx -- cargado
// bajo demanda, con su propio Suspense aquí (este componente entero ya se
// carga bajo demanda desde ReunionEditorScreen, ver el comentario ahí).
const RichTextEditor = React.lazy(() => import('./RichTextEditor'));
const RICH_TEXT_FALLBACK = <div className="min-h-[50vh] animate-pulse bg-slate-50 rounded-lg" />;

type Via = 'groq' | 'local' | 'online';
type PasoAsistente = 'revisar' | 'via' | 'resultado';

const CopyButton: React.FC<{ texto: string }> = ({ texto }) => {
    const [copiado, setCopiado] = useState(false);
    const copiar = async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
    };
    return (
        <Button type="button" variant="secondary" onClick={copiar}>
            <ClipboardDocumentIcon className="w-4 h-4" />
            {copiado ? 'Copiado' : 'Copiar'}
        </Button>
    );
};

interface ActaReunionTabProps {
    // Las notas de la pestaña Notas (campo `acuerdos`) -- fuente de la que
    // se redacta el acta. Nunca se modifican desde aquí.
    notasMarkdown: string;
    tipo: Meeting['tipo'];
    acta: string;
    onActaChange: (value: string) => void;
}

// Pestaña "Acta": redacta con IA el acta formal de la reunión a partir de
// las notas de la pestaña Notas, pasándolas antes por el Anonimizador --
// mismo espíritu que AdaptarMaterialView.tsx (anonimizar -> elegir vía
// Groq/IA local/online -> reintegrar), pero de un solo documento, sin el
// bucle por alumno. Una vez hay acta, se edita como Notas/Seguimiento
// (RichTextEditor, autoguardado por ReunionesView.tsx igual que el resto de
// campos) -- "Regenerar con IA" reabre el asistente sin tocar el acta actual
// hasta que el profesor acepte el nuevo resultado.
const ActaReunionTab: React.FC<ActaReunionTabProps> = ({ notasMarkdown, tipo, acta, onActaChange }) => {
    // Permite escribir el acta directamente a mano, sin pasar por el
    // asistente de IA -- "Escribir a mano" en la pantalla de arranque. Una
    // vez el acta tiene contenido (`acta.trim()`) ya no hace falta este
    // flag para mantener visible el editor, pero se necesita ANTES de la
    // primera pulsación (acta todavía vacía) para no volver a la pantalla
    // de arranque con cada carácter borrado.
    const [modoManual, setModoManual] = useState(false);
    const [mostrarAsistente, setMostrarAsistente] = useState(false);
    const [paso, setPaso] = useState<PasoAsistente>('revisar');
    const [textoAnonimizado, setTextoAnonimizado] = useState('');
    const [mapaActivo, setMapaActivo] = useState<Record<string, string> | null>(null);
    const [editandoManualmente, setEditandoManualmente] = useState(false);
    const [via, setVia] = useState<Via>(isTauri() ? 'online' : 'groq');
    const [generando, setGenerando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [promptOnline, setPromptOnline] = useState<string | null>(null);
    const [respuestaPegada, setRespuestaPegada] = useState('');
    const [resultadoFinal, setResultadoFinal] = useState<string | null>(null);

    const anonimizarMutation = useAnonimizar();
    const iaLocalDisponible = useIaLocalDisponible();
    const groqDisponible = useGroqDisponible();

    const iniciarAsistente = async () => {
        setMostrarAsistente(true);
        setPaso('revisar');
        setError(null);
        setResultadoFinal(null);
        setPromptOnline(null);
        setRespuestaPegada('');
        setEditandoManualmente(false);
        // En escritorio no hay Anonimizador (depende de spaCy, sin
        // equivalente en Rust) -- mismo criterio que AdaptarMaterialView.tsx
        // en modo Tauri: el texto se deja tal cual, ya editable, para que el
        // profesor quite a mano cualquier dato identificativo antes de
        // continuar.
        if (isTauri()) {
            setTextoAnonimizado(notasMarkdown);
            setMapaActivo({});
            setEditandoManualmente(true);
            return;
        }
        try {
            const data = await anonimizarMutation.mutateAsync(notasMarkdown);
            setTextoAnonimizado(data.anonimizado);
            setMapaActivo(data.mapa);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    const handleGenerarOregenerar = () => {
        // Sin confirmación si todavía no hay nada escrito -- no hay nada
        // que perder. Con contenido (escrito a mano o de una generación
        // anterior), confirma antes: el asistente no pisa `acta` hasta que
        // se acepte el resultado, pero conviene que quede claro que se va a
        // reemplazar si se acepta.
        if (acta.trim() && !window.confirm('¿Generar el acta con IA? El acta actual no se pierde hasta que aceptes el nuevo resultado.')) return;
        iniciarAsistente();
    };

    const handleQuitarCodigo = (codigo: string) => {
        if (!mapaActivo) return;
        const { texto, mapa } = quitarCodigo(textoAnonimizado, mapaActivo, codigo);
        setTextoAnonimizado(texto);
        setMapaActivo(mapa);
    };

    const handleAnonimizarSeleccion = (seleccion: string) => {
        if (!mapaActivo) return;
        const res = anonimizarManual(textoAnonimizado, mapaActivo, seleccion);
        if (res) {
            setTextoAnonimizado(res.texto);
            setMapaActivo(res.mapa);
        }
    };

    const handleGenerar = async () => {
        if (!mapaActivo) return;
        setGenerando(true);
        setError(null);
        try {
            const params = { tipo, notas: textoAnonimizado };
            const resultadoAnon =
                via === 'groq' ? await generarActaConGroq(params) :
                via === 'local' ? await generarActaConIA(params) :
                null;
            if (resultadoAnon !== null) {
                setResultadoFinal(reintegrar(resultadoAnon, mapaActivo));
                setPaso('resultado');
            } else {
                const prompt = await generarPromptActa(params);
                setPromptOnline(prompt);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerando(false);
        }
    };

    const handleProcesarRespuestaOnline = () => {
        if (!mapaActivo) return;
        setResultadoFinal(reintegrar(respuestaPegada, mapaActivo));
        setPaso('resultado');
    };

    const handleUsarActa = () => {
        if (resultadoFinal === null) return;
        onActaChange(resultadoFinal);
        setMostrarAsistente(false);
    };

    if (!mostrarAsistente) {
        if (acta.trim() || modoManual) {
            return (
                <div className="flex flex-col gap-3 h-full">
                    <div className="flex justify-end flex-shrink-0">
                        <Button type="button" variant="secondary" onClick={handleGenerarOregenerar}>
                            <SparklesIcon className="w-4 h-4" /> {acta.trim() ? 'Regenerar con IA' : 'Generar con IA'}
                        </Button>
                    </div>
                    <Suspense fallback={RICH_TEXT_FALLBACK}>
                        <RichTextEditor
                            bare
                            autoFocus={modoManual && !acta.trim()}
                            initialMarkdown={acta}
                            onChangeMarkdown={onActaChange}
                            placeholder="Escribe aquí el acta..."
                            className="min-h-full flex-1"
                        />
                    </Suspense>
                </div>
            );
        }
        return (
            <div className="flex flex-col items-center justify-center gap-3 text-center h-full py-10">
                <SparklesIcon className="w-8 h-8 text-slate-300" />
                <p className="text-sm text-slate-500 max-w-sm">
                    Redacta el acta formal de esta reunión con IA a partir de la pestaña Notas -- pasan primero
                    por el Anonimizador para que revises qué se manda antes de generar nada. O escríbela tú
                    mismo directamente.
                </p>
                <div className="flex gap-2">
                    <Button type="button" onClick={iniciarAsistente} disabled={!notasMarkdown.trim()}>
                        Generar acta con IA
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setModoManual(true)}>
                        Escribir a mano
                    </Button>
                </div>
                {!notasMarkdown.trim() && (
                    <p className="text-xs text-slate-400">Escribe algo en la pestaña Notas primero si quieres usar la IA.</p>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 h-full overflow-y-auto">
            {paso === 'revisar' && (
                <div className="flex flex-col gap-3">
                    {anonimizarMutation.isPending && <p className="text-sm text-slate-500">Anonimizando...</p>}
                    {!anonimizarMutation.isPending && mapaActivo && (
                        <>
                            {isTauri() ? (
                                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    La versión de escritorio no tiene Anonimizador automático (necesita un servidor).
                                    Revisa y quita a mano cualquier dato que identifique a alguien antes de continuar
                                    -- esto es lo único que va a salir hacia la IA online junto con el tipo de reunión.
                                </p>
                            ) : (
                                <p className="text-sm text-slate-600">
                                    Se han sustituido <strong>{Object.keys(mapaActivo).length}</strong> dato(s) por
                                    códigos (pasa el ratón por encima de uno para ver el dato real, o pulsa uno para
                                    quitarle la anonimización). Revisa antes de continuar -- esto es lo único que
                                    sale{via === 'online' ? ' hacia la IA online' : via === 'groq' ? ' hacia Groq' : ' hacia la IA local'},
                                    junto con el tipo de reunión (nunca la fecha ni con quién).
                                </p>
                            )}
                            {editandoManualmente || isTauri() ? (
                                <Textarea
                                    value={textoAnonimizado}
                                    onChange={e => setTextoAnonimizado(e.target.value)}
                                    rows={14}
                                    className="font-mono text-sm"
                                />
                            ) : (
                                <TextoResaltado
                                    texto={textoAnonimizado}
                                    mapa={mapaActivo}
                                    className="bg-slate-50 border rounded-lg p-3 max-h-[20rem] overflow-auto"
                                    editable
                                    onQuitarCodigo={handleQuitarCodigo}
                                />
                            )}
                            <div className="flex justify-between">
                                <div className="flex gap-2">
                                    {!isTauri() && (
                                        <Button type="button" variant="secondary" onClick={() => setEditandoManualmente(v => !v)}>
                                            {editandoManualmente ? 'Ver con códigos resaltados' : 'Editar manualmente'}
                                        </Button>
                                    )}
                                    {!isTauri() && !editandoManualmente && (
                                        <AnonimizarSeleccionButton onAnonimizar={handleAnonimizarSeleccion} />
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <Button type="button" variant="secondary" onClick={() => setMostrarAsistente(false)}>Cancelar</Button>
                                    <Button type="button" onClick={() => setPaso('via')}>Siguiente</Button>
                                </div>
                            </div>
                        </>
                    )}
                    {error && (
                        <p className="text-sm text-red-600 flex items-center gap-1.5">
                            <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </p>
                    )}
                </div>
            )}

            {paso === 'via' && (
                <div className="flex flex-col gap-3">
                    {!isTauri() && (
                        <div className="flex gap-1.5">
                            {([
                                { value: 'groq', label: 'Groq (rápido)' },
                                { value: 'local', label: 'IA local' },
                                { value: 'online', label: 'IA online (última opción)' },
                            ] as { value: Via; label: string }[]).map(v => (
                                <button
                                    key={v.value}
                                    type="button"
                                    onClick={() => { setVia(v.value); setPromptOnline(null); }}
                                    className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${via === v.value ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {via === 'local' && !iaLocalDisponible && (
                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                            El servidor de IA local no está disponible ahora mismo -- usa Groq o la IA online.
                        </p>
                    )}
                    {via === 'groq' && !groqDisponible && (
                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                            Groq no está configurado en el servidor todavía -- usa la IA local o la IA online.
                        </p>
                    )}

                    {via === 'online' && promptOnline !== null && (
                        <>
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-sm font-semibold text-slate-700">1. Copia el prompt y pégalo en tu IA online</p>
                                    <CopyButton texto={promptOnline} />
                                </div>
                                <Textarea value={promptOnline} readOnly rows={8} className="text-xs font-mono bg-slate-50" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-1.5">2. Pega aquí la respuesta de la IA</p>
                                <Textarea
                                    value={respuestaPegada}
                                    onChange={e => setRespuestaPegada(e.target.value)}
                                    rows={8}
                                    placeholder="...pega aquí el acta que te haya devuelto la IA"
                                    className="text-xs font-mono"
                                />
                            </div>
                        </>
                    )}

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    <div className="flex justify-between pt-2 border-t">
                        <div className="flex gap-2">
                            <Button type="button" variant="secondary" onClick={() => setPaso('revisar')}>Atrás</Button>
                            <Button type="button" variant="secondary" onClick={() => setMostrarAsistente(false)}>Cancelar</Button>
                        </div>
                        {via === 'online' && promptOnline !== null ? (
                            <Button type="button" onClick={handleProcesarRespuestaOnline} disabled={!respuestaPegada.trim()}>
                                Restituir datos reales
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={handleGenerar}
                                disabled={generando || (via === 'local' && !iaLocalDisponible) || (via === 'groq' && !groqDisponible)}
                            >
                                {generando ? 'Generando...' : via === 'online' ? 'Generar prompt' : 'Generar'}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {paso === 'resultado' && resultadoFinal !== null && (
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-emerald-700 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                        Acta redactada. Revísala antes de guardarla -- podrás seguir editándola después como el resto de pestañas.
                    </p>
                    <MarkdownResult texto={resultadoFinal} className="max-h-[28rem] overflow-auto text-sm border rounded-lg p-4 bg-slate-50" />
                    <div className="flex justify-between">
                        <Button type="button" variant="secondary" onClick={() => setPaso('via')}>Descartar y volver a intentar</Button>
                        <Button type="button" onClick={handleUsarActa}>Usar este acta</Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActaReunionTab;
