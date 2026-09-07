import React from 'react';

export const PATRON_CODIGO = /\b(?:PERS|GRUPO)_[0-9A-F]{6}\b/g;
// Anotaciones de elementos curriculares ([[2.3]]) -- doble corchete a
// propósito, para no chocar con la sintaxis de enlaces de Markdown. Sin
// grupo de captura (igual que PATRON_CODIGO) para que el recorte por
// split()/match() interfoliado funcione igual en los dos casos -- el
// código sin corchetes se obtiene aparte con extraerCodigo.
export const PATRON_ANOTACION = /\[\[[^[\]]+\]\]/g;

// Vista de un texto con códigos resaltados -- pasar el ratón por encima de
// uno muestra su significado (tooltip nativo del navegador vía title, sin
// lógica de posicionamiento propia). Pensado para el paso de revisión de
// cualquier generador que anote un texto con códigos: el Anonimizador/
// Adaptar material/Acta de reunión (PATRON_CODIGO, código -> dato real) y la
// Detección de elementos curriculares (PATRON_ANOTACION, código ->
// descripción del elemento) comparten este mismo componente -- con el
// significado a un hover de distancia no hace falta enseñar el original y el
// anotado a la vez.
//
// `editable`/`onQuitarCodigo` (opcionales, solo los usa el paso de revisión
// del Anonimizador -- AiToolsView.tsx, AdaptarMaterialView.tsx,
// ActaReunionTab.tsx) convierten cada código en un botón clicable para
// desanonimizarlo por error de detección; sin `editable` el componente se
// comporta exactamente igual que antes (Detección Curricular no lo activa).
const TextoResaltado: React.FC<{
    texto: string;
    mapa: Record<string, string>;
    patron?: RegExp;
    extraerCodigo?: (coincidencia: string) => string;
    className?: string;
    editable?: boolean;
    onQuitarCodigo?: (codigo: string) => void;
}> = ({ texto, mapa, patron = PATRON_CODIGO, extraerCodigo = c => c, className = '', editable = false, onQuitarCodigo }) => {
    const partes = texto.split(patron);
    const coincidencias = texto.match(patron) ?? [];
    return (
        <div className={`font-mono text-sm whitespace-pre-wrap ${className}`}>
            {partes.map((parte, i) => {
                const coincidencia = coincidencias[i];
                const codigo = coincidencia ? extraerCodigo(coincidencia) : undefined;
                const real = codigo ? mapa[codigo] : undefined;
                return (
                    <React.Fragment key={i}>
                        {parte}
                        {codigo && editable && onQuitarCodigo ? (
                            <button
                                type="button"
                                onClick={() => {
                                    if (window.confirm(`¿Quitar la anonimización de "${real ?? codigo}"? Se restaurará el texto original.`)) {
                                        onQuitarCodigo(codigo);
                                    }
                                }}
                                className="bg-amber-200 text-amber-900 rounded px-0.5 font-semibold font-mono cursor-pointer hover:bg-amber-300"
                                title={`${real ?? '(código sin resolver)'} -- clic para quitar la anonimización`}
                            >
                                {codigo}
                            </button>
                        ) : codigo && (
                            <span
                                className="bg-amber-200 text-amber-900 rounded px-0.5 font-semibold cursor-help"
                                title={real ?? '(código sin resolver)'}
                            >
                                {codigo}
                            </span>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default TextoResaltado;
