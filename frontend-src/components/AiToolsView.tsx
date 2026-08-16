import React, { useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PageHeader from './PageHeader';
import Button from './Button';
import Textarea from './Textarea';
import { SparklesIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, CheckCircleIcon, ArrowUpTrayIcon, ArrowDownTrayIcon } from './Icons';
import { useAnonimizar } from '../hooks/useAnonimizar';
import { PALETTE } from '../theme/palette';

// La respuesta de la IA online suele venir en Markdown (negrita, títulos,
// listas, tablas si el documento original tenía alguna). El botón "Copiar"
// sigue copiando el texto fuente tal cual (por si se pega en un sitio que
// también entiende Markdown); esto es solo para que no se vean asteriscos,
// almohadillas y barras verticales sueltos en la vista previa.
const markdownClassName =
    '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1 ' +
    '[&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1 ' +
    '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 ' +
    '[&_p]:mb-2 [&_strong]:font-semibold [&_em]:italic ' +
    '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 ' +
    '[&_li]:mb-0.5 [&_hr]:my-3 [&_hr]:border-slate-200 ' +
    '[&_table]:border-collapse [&_table]:mb-2 ' +
    '[&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:p-1.5 [&_th]:text-left ' +
    '[&_td]:border [&_td]:border-slate-300 [&_td]:p-1.5';

type Paso = 1 | 2 | 3 | 4;

const PASOS: { paso: Paso; label: string }[] = [
    { paso: 1, label: 'Documento original' },
    { paso: 2, label: 'Documento anonimizado' },
    { paso: 3, label: 'Respuesta de la IA' },
    { paso: 4, label: 'Documento final' },
];

const PATRON_CODIGO = /\b(?:PERS|GRUPO)_[0-9A-F]{6}\b/g;

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
                    style={paso === pasoActual ? { backgroundColor: PALETTE.sand.header } : undefined}
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

const DownloadDocxButton: React.FC<{ blob: Blob; filename?: string }> = ({ blob, filename = 'documento-final.docx' }) => {
    const descargar = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Button type="button" onClick={descargar}>
            <ArrowDownTrayIcon className="w-4 h-4" />
            Descargar .docx
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
    const [resultadoDocxOriginal, setResultadoDocxOriginal] = useState<{ blob: Blob; mapa: Record<string, string> } | null>(null);
    const [respuestaIA, setRespuestaIA] = useState('');
    const [documentoFinal, setDocumentoFinal] = useState('');
    const [docxFinal, setDocxFinal] = useState<{ blob: Blob; sobrantes: string[] } | null>(null);
    const [extrayendoDocx, setExtrayendoDocx] = useState(false);
    const [errorExtraccion, setErrorExtraccion] = useState<string | null>(null);
    const [anonimizandoDocx, setAnonimizandoDocx] = useState(false);
    const [errorAnonimizacionDocx, setErrorAnonimizacionDocx] = useState<string | null>(null);
    const [restituyendoDocx, setRestituyendoDocx] = useState(false);
    const [errorRestitucionDocx, setErrorRestitucionDocx] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const docxOriginalInputRef = useRef<HTMLInputElement>(null);
    const docxRespuestaInputRef = useRef<HTMLInputElement>(null);

    const anonimizarMutation = useAnonimizar();

    // Mapa código -> dato real activo, venga del camino de texto o del de
    // .docx (los dos son mutuamente excluyentes: solo uno de los dos
    // resultados de paso 2 está poblado a la vez).
    const mapaActivo = resultado?.mapa ?? resultadoDocxOriginal?.mapa ?? null;

    // Extracción de .docx a Markdown (services/extraccion_docx.py): las
    // tablas llegan como tabla Markdown, no como texto suelto, para que la
    // IA online (y el paso 4 de aquí mismo) las entienda como tabla. Fuera
    // de useAnonimizar/api.post porque es multipart, no JSON -- mismo
    // patrón que la importación de horario en PDF (ImportScheduleModal.tsx).
    const handleSubirDocx = async (file: File) => {
        setExtrayendoDocx(true);
        setErrorExtraccion(null);
        try {
            const formData = new FormData();
            formData.append('archivo', file);
            const response = await fetch('/api/ai-tools/extraer-docx', { method: 'POST', body: formData });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const data: { texto: string } = await response.json();
            setDocumentoOriginal(data.texto);
        } catch (err) {
            setErrorExtraccion(err instanceof Error ? err.message : String(err));
        } finally {
            setExtrayendoDocx(false);
        }
    };

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
    // sustitución run por run en services/anonimizador.py::anonimizar_docx,
    // igual que reintegrar_docx pero en sentido contrario. El paso 2 pasa a
    // ofrecer descargar el .docx en vez de una vista previa de texto: no
    // tiene sentido "editar" un documento con formato en una textarea.
    const handleAnonimizarDocxOriginal = async (file: File) => {
        setAnonimizandoDocx(true);
        setErrorAnonimizacionDocx(null);
        try {
            const formData = new FormData();
            formData.append('archivo', file);
            const response = await fetch('/api/ai-tools/anonimizar-docx', { method: 'POST', body: formData });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Error HTTP ${response.status}`);
            }
            const data: { anonimizado_docx_base64: string; mapa: Record<string, string> } = await response.json();
            setResultado(null);
            setResultadoDocxOriginal({ blob: base64ToBlob(data.anonimizado_docx_base64, DOCX_MIME), mapa: data.mapa });
            setPaso(2);
        } catch (err) {
            setErrorAnonimizacionDocx(err instanceof Error ? err.message : String(err));
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
            setDocumentoFinal('');
            setPaso(4);
        } catch (err) {
            setErrorRestitucionDocx(err instanceof Error ? err.message : String(err));
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
        setErrorExtraccion(null);
        setErrorAnonimizacionDocx(null);
        setErrorRestitucionDocx(null);
        anonimizarMutation.reset();
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <PageHeader
                title="Herramientas IA"
                subtitle="Anonimizador de documentos"
                accent="sand"
                icon={<SparklesIcon className="w-6 h-6" />}
            />

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
                                ref={fileInputRef}
                                type="file"
                                accept=".docx"
                                className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleSubirDocx(file);
                                    e.target.value = '';
                                }}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={extrayendoDocx}
                            >
                                <ArrowUpTrayIcon className="w-4 h-4" />
                                {extrayendoDocx ? 'Extrayendo texto...' : 'Subir .docx (editar texto)'}
                            </Button>
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
                                {anonimizandoDocx ? 'Anonimizando...' : 'Subir .docx (mantener formato)'}
                            </Button>
                        </div>
                        <p className="text-xs text-slate-400 -mt-1">
                            "Editar texto" extrae el contenido para revisarlo abajo antes de anonimizar (las tablas
                            se convierten a tabla, para que la IA las entienda como tal). "Mantener formato" anonimiza
                            el propio .docx sin pasar por texto, para descargarlo igual que estaba.
                        </p>
                        <Textarea
                            value={documentoOriginal}
                            onChange={e => setDocumentoOriginal(e.target.value)}
                            rows={14}
                            placeholder="Pega aquí el documento original..."
                            className="font-mono text-sm flex-1"
                        />
                        {errorExtraccion && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {errorExtraccion}
                            </p>
                        )}
                        {errorAnonimizacionDocx && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {errorAnonimizacionDocx}
                            </p>
                        )}
                        {anonimizarMutation.isError && (
                            <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                {(anonimizarMutation.error as Error).message}
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
                            Se han detectado y sustituido <strong>{Object.keys(mapaActivo ?? {}).length}</strong> dato(s).
                            Revisa el documento antes de enviarlo: una combinación de datos (p.ej. curso + fecha + número
                            de incidencias) puede seguir identificando a alguien aunque no aparezca ningún nombre.
                        </p>
                        {resultadoDocxOriginal ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-slate-500 border rounded-lg p-4 bg-slate-50">
                                <ArrowDownTrayIcon className="w-8 h-8 text-slate-400" />
                                Documento .docx anonimizado, con el formato original conservado.
                            </div>
                        ) : (
                            <Textarea
                                value={resultado!.anonimizado}
                                readOnly
                                rows={16}
                                className="font-mono text-sm flex-1 bg-slate-50"
                            />
                        )}
                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(1)}>Atrás</Button>
                            <div className="flex gap-2">
                                {resultadoDocxOriginal
                                    ? <DownloadDocxButton blob={resultadoDocxOriginal.blob} filename="documento-anonimizado.docx" />
                                    : <CopyButton texto={resultado!.anonimizado} />}
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
                                <div className={`flex-1 overflow-auto text-sm border rounded-lg p-4 bg-slate-50 ${markdownClassName}`}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{documentoFinal}</ReactMarkdown>
                                </div>
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
