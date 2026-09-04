import React, { useMemo, useRef, useState } from 'react';
import { isTauri, invoke } from '@tauri-apps/api/core';
import PageHeader from './PageHeader';
import Button from './Button';
import Textarea from './Textarea';
import MarkdownResult from './MarkdownResult';
import DownloadDocxButton from './DownloadDocxButton';
import TextoResaltado, { PATRON_CODIGO } from './TextoResaltado';
import { SparklesIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, CheckCircleIcon, ArrowUpTrayIcon, ArrowDownTrayIcon } from './Icons';
import { useAnonimizar } from '../hooks/useAnonimizar';
import { PAGE_ACCENT } from '../theme/palette';

type Paso = 1 | 2 | 3 | 4;

const PASOS: { paso: Paso; label: string }[] = [
    { paso: 1, label: 'Documento original' },
    { paso: 2, label: 'Documento anonimizado' },
    { paso: 3, label: 'Respuesta de la IA' },
    { paso: 4, label: 'Documento final' },
];

const StepBar: React.FC<{ pasoActual: Paso }> = ({ pasoActual }) => (
    <div className="flex items-center gap-2 flex-wrap">
        {PASOS.map(({ paso, label }, i) => (
            <React.Fragment key={paso}>
                <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                        paso === pasoActual
                            ? 'text-white'
                            : paso < pasoActual
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-slate-50 text-slate-400'
                    }`}
                    style={paso === pasoActual ? { backgroundColor: PAGE_ACCENT.herramientasIA } : undefined}
                >
                    <span className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-xs font-bold">{paso}</span>
                    {label}
                </div>
                {i < PASOS.length - 1 && <span className="text-slate-300">→</span>}
            </React.Fragment>
        ))}
    </div>
);

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

const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const bytes = atob(base64);
    const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
    return new Blob([array], { type: mimeType });
};

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// invoke() rechaza con el propio objeto ApiError ({status, detail}) del
// lado Rust, no con una instancia de Error -- mismo criterio que
// ImportScheduleModal.tsx.
const describeError = (e: unknown): string => {
    if (e && typeof e === 'object' && 'detail' in e) {
        return String((e as { detail: unknown }).detail);
    }
    return e instanceof Error ? e.message : String(e);
};

// Anonimizador de documentos: pide el texto, lo anonimiza en el backend
// (spaCy + regex, sin IA), espera a que el profesor pegue la respuesta de
// una IA online (Claude, ChatGPT...) y reintegra los datos reales -- todo en
// memoria del navegador. El mapa código -> dato real NUNCA se persiste (ni
// en Postgres ni en localStorage): si se recarga la página o se pulsa
// "Empezar de nuevo", se pierde para siempre, a propósito.
const AiToolsView: React.FC = () => {
    const [paso, setPaso] = useState<Paso>(1);
    const [documentoOriginal, setDocumentoOriginal] = useState('');
    const [resultado, setResultado] = useState<{ anonimizado: string; mapa: Record<string, string> } | null>(null);
    const [resultadoDocxOriginal, setResultadoDocxOriginal] = useState<{ blob: Blob; texto: string; mapa: Record<string, string> } | null>(null);
    const [respuestaIA, setRespuestaIA] = useState('');
    const [documentoFinal, setDocumentoFinal] = useState('');
    const [docxFinal, setDocxFinal] = useState<{ blob: Blob; sobrantes: string[] } | null>(null);
    const [anonimizandoDocx, setAnonimizandoDocx] = useState(false);
    const [errorAnonimizacionDocx, setErrorAnonimizacionDocx] = useState<string | null>(null);
    const [restituyendoDocx, setRestituyendoDocx] = useState(false);
    const [errorRestitucionDocx, setErrorRestitucionDocx] = useState<string | null>(null);
    const docxOriginalInputRef = useRef<HTMLInputElement>(null);
    const docxRespuestaInputRef = useRef<HTMLInputElement>(null);

    const anonimizarMutation = useAnonimizar();

    // Mapa código -> dato real activo, venga del camino de texto o del de
    // .docx (los dos son mutuamente excluyentes: solo uno de los dos
    // resultados de paso 2 está poblado a la vez).
    const mapaActivo = resultado?.mapa ?? resultadoDocxOriginal?.mapa ?? null;

    const codigosSinResolver = useMemo(() => {
        if (paso !== 4 || docxFinal) return [];
        return Array.from(new Set(documentoFinal.match(PATRON_CODIGO) ?? []));
    }, [paso, documentoFinal, docxFinal]);

    const handleAnonimizar = async () => {
        const data = await anonimizarMutation.mutateAsync(documentoOriginal);
        setResultadoDocxOriginal(null);
        setResultado(data);
        setPaso(2);
    };

    // Anonimiza el propio .docx sin pasar por texto en ningún momento --
    // sustitución run por run en services/anonimizador.py::anonimizar_docx.
    // El backend también devuelve el texto extraído del PROPIO .docx ya
    // anonimizado (no una detección aparte), así el paso 2 puede ofrecer a
    // la vez copiar el texto y descargar el .docx con las MISMAS códigos
    // en los dos, sin arriesgarse a que salgan distintos.
    const handleAnonimizarDocxOriginal = async (file: File) => {
        setAnonimizandoDocx(true);
        setErrorAnonimizacionDocx(null);
        try {
            let data: { anonimizado_docx_base64: string; anonimizado_texto: string; mapa: Record<string, string> };
            if (isTauri()) {
                // Mismo patrón que ImportScheduleModal.tsx con el horario en
                // PDF -- bytes crudos al sidecar Python en vez de al backend
                // web (ver services/python_helper.rs).
                const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
                data = await invoke('anonimizar_docx', { bytes });
            } else {
                const formData = new FormData();
                formData.append('archivo', file);
                const response = await fetch('/api/ai-tools/anonimizar-docx', { method: 'POST', body: formData });
                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error(body.detail || `Error HTTP ${response.status}`);
                }
                data = await response.json();
            }
            setResultado(null);
            setResultadoDocxOriginal({
                blob: base64ToBlob(data.anonimizado_docx_base64, DOCX_MIME),
                texto: data.anonimizado_texto,
                mapa: data.mapa,
            });
            setPaso(2);
        } catch (err) {
            setErrorAnonimizacionDocx(describeError(err));
        } finally {
            setAnonimizandoDocx(false);
        }
    };

    const handleRestituir = () => {
        if (!mapaActivo) return;
        let texto = respuestaIA;
        for (const [codigo, real] of Object.entries(mapaActivo)) {
            texto = texto.split(codigo).join(real);
        }
        setDocxFinal(null);
        setDocumentoFinal(texto);
        setPaso(4);
    };

    // La respuesta en .docx no pasa por texto en ningún momento: se manda
    // tal cual al backend junto con el mapa (services/anonimizador.py::
    // reintegrar_docx), que sustituye run por run dentro del propio .docx
    // para conservar el formato que le haya dado la IA -- un find/replace
    // en texto plano perdería negrita, tablas, etc.
    const handleSubirRespuestaDocx = async (file: File) => {
        if (!mapaActivo) return;
        setRestituyendoDocx(true);
        setErrorRestitucionDocx(null);
        try {
            if (isTauri()) {
                // El sidecar no tiene HTTP de por medio (ver
                // services/python_helper.rs), así que devuelve JSON con el
                // .docx en base64 y los sobrantes en el propio JSON, no en
                // una cabecera como hace la web.
                const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
                const data: { docx_base64: string; sobrantes: string[] } = await invoke('reintegrar_docx', { bytes, mapa: mapaActivo });
                setDocxFinal({ blob: base64ToBlob(data.docx_base64, DOCX_MIME), sobrantes: data.sobrantes });
            } else {
                const formData = new FormData();
                formData.append('archivo', file);
                formData.append('mapa', JSON.stringify(mapaActivo));
                const response = await fetch('/api/ai-tools/reintegrar-docx', { method: 'POST', body: formData });
                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error(body.detail || `Error HTTP ${response.status}`);
                }
                const sobrantesHeader = response.headers.get('X-Codigos-Sin-Resolver') ?? '';
                const blob = await response.blob();
                setDocxFinal({ blob, sobrantes: sobrantesHeader ? sobrantesHeader.split(',') : [] });
            }
            setDocumentoFinal('');
            setPaso(4);
        } catch (err) {
            setErrorRestitucionDocx(describeError(err));
        } finally {
            setRestituyendoDocx(false);
        }
    };

    const empezarDeNuevo = () => {
        setPaso(1);
        setDocumentoOriginal('');
        setResultado(null);
        setResultadoDocxOriginal(null);
        setRespuestaIA('');
        setDocumentoFinal('');
        setDocxFinal(null);
        setErrorAnonimizacionDocx(null);
        setErrorRestitucionDocx(null);
        anonimizarMutation.reset();
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <PageHeader
                title="Anonimizador"
                subtitle="Quita datos personales de un documento antes de pasarlo a una IA online"
                accent={PAGE_ACCENT.herramientasIA}
                icon={<SparklesIcon className="w-6 h-6" />}
            />

            <p className="text-sm text-slate-600 bg-white rounded-xl shadow-sm border p-4">
                Te permite aprovechar una IA online (ChatGPT, Claude...) sobre documentos con datos de
                alumnado sin que esos datos salgan nunca de este servidor: sustituye nombres, DNI, centro...
                por códigos, tú pegas el texto ya anonimizado en la IA que prefieras, y al terminar reintegra
                aquí los datos reales en la respuesta que te dé.
            </p>

            <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col gap-5 flex-1 overflow-y-auto">
                <StepBar pasoActual={paso} />

                {paso === 1 && (
                    <div className="flex flex-col gap-3 flex-1">
                        <p className="text-sm text-slate-600">
                            Pega aquí el documento con datos personales (acta de evaluación, informe...) o sube
                            un .docx. Se detectarán nombres, DNI, direcciones, centro, cargos y nivel/grupo, y
                            se sustituirán por códigos antes de que salga de este servidor.
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <input
                                ref={docxOriginalInputRef}
                                type="file"
                                accept=".docx"
                                className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleAnonimizarDocxOriginal(file);
                                    e.target.value = '';
                                }}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => docxOriginalInputRef.current?.click()}
                                disabled={anonimizandoDocx}
                            >
                                <ArrowUpTrayIcon className="w-4 h-4" />
                                {anonimizandoDocx ? 'Anonimizando...' : 'Subir .docx'}
                            </Button>
                            <span className="text-xs text-slate-400">
                                Anonimiza el documento entero (con sus tablas y formato) y en el siguiente paso podrás
                                tanto copiar el texto como descargar el .docx.
                            </span>
                        </div>
                        <Textarea
                            value={documentoOriginal}
                            onChange={e => setDocumentoOriginal(e.target.value)}
                            rows={14}
                            placeholder="...o pega aquí el documento original en texto"
                            className="font-mono text-sm flex-1"
                        />
                        {errorAnonimizacionDocx && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {errorAnonimizacionDocx}
                            </p>
                        )}
                        {anonimizarMutation.isError && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {describeError(anonimizarMutation.error)}
                            </p>
                        )}
                        <div className="flex justify-end">
                            <Button
                                type="button"
                                onClick={handleAnonimizar}
                                disabled={!documentoOriginal.trim() || anonimizarMutation.isPending}
                            >
                                {anonimizarMutation.isPending ? 'Anonimizando...' : 'Anonimizar'}
                            </Button>
                        </div>
                    </div>
                )}

                {paso === 2 && (resultado || resultadoDocxOriginal) && (
                    <div className="flex flex-col gap-3 flex-1">
                        <p className="text-sm text-slate-600">
                            Se han detectado y sustituido <strong>{Object.keys(mapaActivo ?? {}).length}</strong> dato(s)
                            (pasa el ratón por encima de un código para ver el dato real). Revisa el documento antes de
                            enviarlo: una combinación de datos (p.ej. curso + fecha + número de incidencias) puede seguir
                            identificando a alguien aunque no aparezca ningún nombre.
                        </p>
                        <TextoResaltado
                            texto={resultadoDocxOriginal ? resultadoDocxOriginal.texto : resultado!.anonimizado}
                            mapa={mapaActivo ?? {}}
                            className="flex-1 bg-slate-50 border rounded-lg p-3 overflow-auto"
                        />
                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(1)}>Atrás</Button>
                            <div className="flex gap-2">
                                <CopyButton texto={resultadoDocxOriginal ? resultadoDocxOriginal.texto : resultado!.anonimizado} />
                                {resultadoDocxOriginal && (
                                    <DownloadDocxButton blob={resultadoDocxOriginal.blob} filename="documento-anonimizado.docx" />
                                )}
                                <Button type="button" onClick={() => setPaso(3)}>Siguiente</Button>
                            </div>
                        </div>
                    </div>
                )}

                {paso === 3 && (
                    <div className="flex flex-col gap-3 flex-1">
                        <p className="text-sm text-slate-600">
                            Si la IA te ha dado la respuesta como archivo .docx, súbelo aquí para conservar su
                            formato (negrita, tablas...). Si prefieres, pega el texto abajo -- los códigos
                            PERS_/GRUPO_ deben quedar intactos en cualquiera de los dos casos.
                        </p>
                        <div className="flex items-center gap-2">
                            <input
                                ref={docxRespuestaInputRef}
                                type="file"
                                accept=".docx"
                                className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleSubirRespuestaDocx(file);
                                    e.target.value = '';
                                }}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => docxRespuestaInputRef.current?.click()}
                                disabled={restituyendoDocx}
                            >
                                <ArrowUpTrayIcon className="w-4 h-4" />
                                {restituyendoDocx ? 'Procesando .docx...' : 'Subir .docx de la respuesta'}
                            </Button>
                        </div>
                        {errorRestitucionDocx && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {errorRestitucionDocx}
                            </p>
                        )}
                        <Textarea
                            value={respuestaIA}
                            onChange={e => setRespuestaIA(e.target.value)}
                            rows={14}
                            placeholder="...o pega aquí la respuesta de la IA en texto"
                            className="font-mono text-sm flex-1"
                        />
                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(2)}>Atrás</Button>
                            <Button type="button" onClick={handleRestituir} disabled={!respuestaIA.trim()}>
                                Restituir datos reales
                            </Button>
                        </div>
                    </div>
                )}

                {paso === 4 && (() => {
                    const sobrantes = docxFinal ? docxFinal.sobrantes : codigosSinResolver;
                    return (
                        <div className="flex flex-col gap-3 flex-1">
                            {sobrantes.length > 0 ? (
                                <p className="text-sm text-amber-700 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    Quedan códigos sin resolver ({sobrantes.join(', ')}): puede que la IA los haya
                                    alterado{docxFinal ? ', o hayan quedado partidos entre dos estilos distintos dentro del .docx' : ''}.
                                    Revisa el documento antes de usarlo.
                                </p>
                            ) : (
                                <p className="text-sm text-emerald-700 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                    <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                                    Todos los códigos se han resuelto correctamente.
                                </p>
                            )}
                            {docxFinal ? (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-slate-500 border rounded-lg p-4 bg-slate-50">
                                    <ArrowDownTrayIcon className="w-8 h-8 text-slate-400" />
                                    Documento .docx listo, con el formato de la IA conservado.
                                </div>
                            ) : (
                                <MarkdownResult texto={documentoFinal} className="flex-1 overflow-auto text-sm border rounded-lg p-4 bg-slate-50" />
                            )}
                            <div className="flex justify-between">
                                <Button type="button" variant="secondary" onClick={() => setPaso(3)}>Atrás</Button>
                                <div className="flex gap-2">
                                    {docxFinal ? <DownloadDocxButton blob={docxFinal.blob} /> : <CopyButton texto={documentoFinal} />}
                                    <Button type="button" onClick={empezarDeNuevo}>Empezar de nuevo</Button>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};

export default AiToolsView;
