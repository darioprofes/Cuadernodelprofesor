import React, { useEffect, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { es as esLocale } from '@blocknote/core/locales';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';

interface RichTextEditorProps {
    // No es un valor controlado -- solo sirve para sembrar el editor UNA
    // VEZ al montar (ver el useState perezoso más abajo). A partir de ahí
    // el propio editor de BlockNote es la fuente de verdad; si `value`
    // cambiara en el padre por cada pulsación (como ya hace `onChangeMarkdown`
    // más abajo) y este componente lo releyera, el cursor saltaría al
    // principio en cada letra. Igual que Modal.tsx desmonta sus hijos al
    // cerrar (`if (!isOpen) return null`), cada apertura de un formulario
    // distinto crea una instancia nueva de este componente con el
    // `initialMarkdown` correcto -- no hace falta resincronizar en caliente.
    initialMarkdown: string;
    onChangeMarkdown: (markdown: string) => void;
    autoFocus?: boolean;
    placeholder?: string;
    className?: string;
}

// Editor de texto enriquecido (BlockNote, sobre ProseMirror/Tiptap -- ver
// investigación de la conversación) para las notas de Reuniones: admite
// pegar Markdown ya formateado (p.ej. un acta generada por una IA) y
// aplicar formato mientras se teclea (negrita, cursiva, subrayado,
// resaltado... con la barra flotante que aparece al seleccionar texto,
// de serie en BlockNote, sin montar nada a mano). El dato en la base de
// datos sigue siendo un TEXT plano en formato Markdown (mismo campo
// `acuerdos` de siempre) -- BlockNote solo se usa como vista/edición,
// nunca cambia lo que se guarda.
const RichTextEditor: React.FC<RichTextEditorProps> = ({ initialMarkdown, onChangeMarkdown, autoFocus, placeholder, className = '' }) => {
    const editor = useCreateBlockNote({
        dictionary: placeholder
            ? { ...esLocale, placeholders: { ...esLocale.placeholders, default: placeholder } }
            : esLocale,
    });

    // Siembra síncrona (tryParseMarkdownToBlocks/replaceBlocks no son
    // async en esta versión de BlockNote) dentro del inicializador
    // perezoso de useState -- corre una sola vez, antes del primer pintado,
    // así que nunca hay un parpadeo de editor vacío seguido del contenido
    // real apareciendo un instante después.
    useState(() => {
        if (initialMarkdown.trim()) {
            const blocks = editor.tryParseMarkdownToBlocks(initialMarkdown);
            editor.replaceBlocks(editor.document, blocks);
        }
        return true;
    });

    useEffect(() => {
        if (autoFocus) editor.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={`rounded-lg border border-slate-300 shadow-sm focus-within:ring-2 focus-within:ring-[var(--color-primary)]/30 focus-within:border-[var(--color-primary)] overflow-y-auto ${className}`}>
            <BlockNoteView
                editor={editor}
                theme="light"
                onChange={() => onChangeMarkdown(editor.blocksToMarkdownLossy())}
            />
        </div>
    );
};

export default RichTextEditor;
