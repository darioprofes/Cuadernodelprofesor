import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
    onAnonimizar?: (seleccion: string) => void;
}> = ({ texto, mapa, patron = PATRON_CODIGO, extraerCodigo = c => c, className = '', editable = false, onQuitarCodigo, onAnonimizar }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [menu, setMenu] = useState<{ texto: string; x: number; y: number } | null>(null);
    const seleccionLocal = useCallback(() => {
        const selection = window.getSelection();
        if (!selection?.rangeCount || !containerRef.current?.contains(selection.anchorNode) || !containerRef.current.contains(selection.focusNode)) return '';
        const selected = selection.toString().trim();
        return new RegExp(PATRON_CODIGO.source).test(selected) ? '' : selected;
    }, []);
    useEffect(() => {
        if (!editable || !onAnonimizar) return;
        const shortcut = (event: KeyboardEvent) => {
            if (!event.ctrlKey || !event.altKey || event.metaKey || event.shiftKey || event.key.toLowerCase() !== 'a' || event.repeat) return;
            const selected = seleccionLocal();
            if (!selected) return;
            event.preventDefault();
            setMenu(null);
            onAnonimizar(selected);
            window.getSelection()?.removeAllRanges();
        };
        document.addEventListener('keydown', shortcut);
        return () => document.removeEventListener('keydown', shortcut);
    }, [editable, onAnonimizar, seleccionLocal]);
    useEffect(() => { setMenu(null); }, [texto]);
    useEffect(() => {
        if (!menu) return;
        const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === 'Tab') setMenu(null); };
        const close = () => setMenu(null);
        document.addEventListener('pointerdown', dismiss);
        document.addEventListener('keydown', escape);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        menuRef.current?.querySelector('button')?.focus({ preventScroll: true });
        return () => {
            document.removeEventListener('pointerdown', dismiss);
            document.removeEventListener('keydown', escape);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [menu]);
    const partes = texto.split(patron);
    const coincidencias = texto.match(patron) ?? [];
    return (
        <div ref={containerRef} className={`font-mono text-sm whitespace-pre-wrap ${className}`}
            onContextMenu={event => {
                if (!editable || !onAnonimizar) return;
                const selected = seleccionLocal();
                if (!selected) return;
                event.preventDefault();
                const rect = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
                setMenu({ texto: selected, x: Math.max(8, Math.min(event.clientX || rect?.left || 8, window.innerWidth - 288)), y: Math.max(8, Math.min(event.clientY || rect?.bottom || 8, window.innerHeight - 64)) });
            }}>
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
            {menu && createPortal(<div ref={menuRef} role="menu" aria-label="Acciones sobre el texto seleccionado" className="fixed z-[9999] rounded-lg border border-slate-200 bg-white p-1 shadow-lg w-[280px] max-w-[calc(100vw-16px)]" style={{ left: menu.x, top: menu.y }}>
                <button type="button" role="menuitem" className="w-full rounded px-3 py-2 text-left text-sm text-slate-800 hover:bg-blue-50 focus:bg-blue-50" onMouseDown={e => e.preventDefault()} onClick={() => {
                    onAnonimizar?.(menu.texto);
                    setMenu(null);
                    window.getSelection()?.removeAllRanges();
                }}>Anonimizar selección <span className="ml-2 text-xs text-slate-500">Ctrl+Alt+A</span></button>
            </div>, document.body)}
        </div>
    );
};

export default TextoResaltado;
