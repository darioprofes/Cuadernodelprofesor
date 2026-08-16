import React, { useMemo, useState } from 'react';
import PageHeader from './PageHeader';
import Button from './Button';
import Textarea from './Textarea';
import { SparklesIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, CheckCircleIcon } from './Icons';
import { useAnonimizar } from '../hooks/useAnonimizar';
import { PALETTE } from '../theme/palette';

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
    const [respuestaIA, setRespuestaIA] = useState('');
    const [documentoFinal, setDocumentoFinal] = useState('');

    const anonimizarMutation = useAnonimizar();

    const codigosSinResolver = useMemo(() => {
        if (paso !== 4) return [];
        return Array.from(new Set(documentoFinal.match(PATRON_CODIGO) ?? []));
    }, [paso, documentoFinal]);

    const handleAnonimizar = async () => {
        const data = await anonimizarMutation.mutateAsync(documentoOriginal);
        setResultado(data);
        setPaso(2);
    };

    const handleRestituir = () => {
        if (!resultado) return;
        let texto = respuestaIA;
        for (const [codigo, real] of Object.entries(resultado.mapa)) {
            texto = texto.split(codigo).join(real);
        }
        setDocumentoFinal(texto);
        setPaso(4);
    };

    const empezarDeNuevo = () => {
        setPaso(1);
        setDocumentoOriginal('');
        setResultado(null);
        setRespuestaIA('');
        setDocumentoFinal('');
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
                            Pega aquí el documento con datos personales (acta de evaluación, informe...).
                            Se detectarán nombres, DNI, direcciones, centro, cargos y nivel/grupo, y se
                            sustituirán por códigos antes de que salga de este servidor.
                        </p>
                        <Textarea
                            value={documentoOriginal}
                            onChange={e => setDocumentoOriginal(e.target.value)}
                            rows={16}
                            placeholder="Pega aquí el documento original..."
                            className="font-mono text-sm flex-1"
                        />
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

                {paso === 2 && resultado && (
                    <div className="flex flex-col gap-3 flex-1">
                        <p className="text-sm text-slate-600">
                            Se han detectado y sustituido <strong>{Object.keys(resultado.mapa).length}</strong> dato(s).
                            Revisa el texto antes de enviarlo: una combinación de datos (p.ej. curso + fecha + número
                            de incidencias) puede seguir identificando a alguien aunque no aparezca ningún nombre.
                        </p>
                        <Textarea
                            value={resultado.anonimizado}
                            readOnly
                            rows={16}
                            className="font-mono text-sm flex-1 bg-slate-50"
                        />
                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(1)}>Atrás</Button>
                            <div className="flex gap-2">
                                <CopyButton texto={resultado.anonimizado} />
                                <Button type="button" onClick={() => setPaso(3)}>Siguiente</Button>
                            </div>
                        </div>
                    </div>
                )}

                {paso === 3 && (
                    <div className="flex flex-col gap-3 flex-1">
                        <p className="text-sm text-slate-600">
                            Pega aquí la respuesta de la IA online, con los códigos PERS_/GRUPO_ intactos.
                        </p>
                        <Textarea
                            value={respuestaIA}
                            onChange={e => setRespuestaIA(e.target.value)}
                            rows={16}
                            placeholder="Pega aquí la respuesta de la IA..."
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

                {paso === 4 && (
                    <div className="flex flex-col gap-3 flex-1">
                        {codigosSinResolver.length > 0 ? (
                            <p className="text-sm text-amber-700 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                Quedan códigos sin resolver ({codigosSinResolver.join(', ')}): puede que la IA los
                                haya alterado. Revisa el texto antes de usarlo.
                            </p>
                        ) : (
                            <p className="text-sm text-emerald-700 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                                Todos los códigos se han resuelto correctamente.
                            </p>
                        )}
                        <Textarea
                            value={documentoFinal}
                            readOnly
                            rows={16}
                            className="font-mono text-sm flex-1 bg-slate-50"
                        />
                        <div className="flex justify-between">
                            <Button type="button" variant="secondary" onClick={() => setPaso(3)}>Atrás</Button>
                            <div className="flex gap-2">
                                <CopyButton texto={documentoFinal} />
                                <Button type="button" onClick={empezarDeNuevo}>Empezar de nuevo</Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AiToolsView;
