import React, { useRef } from 'react';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { StarterKit } from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TextAlign } from '@tiptap/extension-text-align';
import { Typography } from '@tiptap/extension-typography';
import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { Selection } from '@tiptap/extensions';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';

// tiptap-markdown no trae sus propios tipos para editor.storage.markdown
// (su README solo documenta el uso en JS puro) -- se amplía aquí el tipo
// `Storage` de @tiptap/core con lo mínimo que se usa de verdad.
declare module '@tiptap/core' {
    interface Storage {
        markdown: { getMarkdown(): string };
    }
}

import { Toolbar, ToolbarGroup, ToolbarSeparator } from './tiptap-ui-primitive/toolbar';
import { Spacer } from './tiptap-ui-primitive/spacer';
import { HeadingDropdownMenu } from './tiptap-ui/heading-dropdown-menu';
import { ListDropdownMenu } from './tiptap-ui/list-dropdown-menu';
import { BlockquoteButton } from './tiptap-ui/blockquote-button';
import { CodeBlockButton } from './tiptap-ui/code-block-button';
import { ColorHighlightPopover } from './tiptap-ui/color-highlight-popover';
import { LinkPopover } from './tiptap-ui/link-popover';
import { MarkButton } from './tiptap-ui/mark-button';
import { TextAlignButton } from './tiptap-ui/text-align-button';
import { UndoRedoButton } from './tiptap-ui/undo-redo-button';

import './tiptap-node/blockquote-node/blockquote-node.scss';
import './tiptap-node/code-block-node/code-block-node.scss';
import './tiptap-node/horizontal-rule-node/horizontal-rule-node.scss';
import './tiptap-node/list-node/list-node.scss';
import './tiptap-node/heading-node/heading-node.scss';
import './tiptap-node/paragraph-node/paragraph-node.scss';
import './tiptap-templates/simple/simple-editor.scss';

interface RichTextEditorProps {
    // No es un valor controlado -- solo sirve para sembrar el editor UNA
    // VEZ al montar (ver `content` más abajo, leído solo en la creación).
    // Si `initialMarkdown` cambiara en el padre por cada pulsación (como ya
    // hace `onChangeMarkdown`) y este componente lo releyera, el cursor
    // saltaría al principio en cada letra. Igual que Modal.tsx desmonta sus
    // hijos al cerrar, cada apertura de un formulario distinto crea una
    // instancia nueva de este componente con el `initialMarkdown`
    // correcto -- no hace falta resincronizar en caliente.
    initialMarkdown: string;
    onChangeMarkdown: (markdown: string) => void;
    autoFocus?: boolean;
    placeholder?: string;
    className?: string;
    // Sin borde/sombra de tarjeta -- para cuando el propio editor ocupa
    // toda la pantalla y debe sentirse como la hoja en sí (p.ej. la
    // pestaña Notas de una reunión), no como un campo de formulario más.
    bare?: boolean;
}

// Editor de texto enriquecido para las notas de Reuniones -- Tiptap UI
// Components (plantilla "Simple Editor" oficial de Tiptap, MIT, instalada
// como código propio con `npx @tiptap/cli add simple-editor`, ver
// components/tiptap-*), NO BlockNote (primer intento, revertido: su marcado
// de negrita/subrayado/color no se acotaba al fragmento seleccionado, se
// aplicaba a todo el bloque -- comportamiento de su capa de "bloques" tipo
// Notion, no del motor Tiptap/ProseMirror en sí). Aquí se usa Tiptap
// directamente, sin esa capa, con el mismo `toggleMark` estándar de
// ProseMirror que si acota bien el marcado al trozo seleccionado.
//
// tiptap-markdown (aparte, no viene con la plantilla) hace de puente con
// el TEXT en Markdown que sigue guardando la base de datos (mismo campo
// `acuerdos`/`seguimiento` de siempre): pasa el Markdown tal cual como
// `content` inicial (lo parsea solo, la extensión Markdown lo intercepta)
// y `editor.storage.markdown.getMarkdown()` lo serializa de vuelta en cada
// cambio.
//
// Recortado respecto a la plantilla original: sin subida de imágenes (no
// hay endpoint para eso) ni selector de tema claro/oscuro (la app no tiene
// modo oscuro). El resto de la barra (deshacer/rehacer, encabezados,
// listas, cita, código, negrita/cursiva/tachado/código/subrayado,
// resaltado en color, enlace, super/subíndice, alineación) se mantiene tal
// cual de la plantilla oficial.
//
// Añadido aparte (no viene en la plantilla): un BubbleMenu -- el menú
// contextual que aparece junto al texto seleccionado, estés donde estés
// del documento. La plantilla original solo trae la barra fija de arriba,
// pensada para una página normal donde esa barra siempre está a la vista;
// aquí, dentro de una tarjeta que se desplaza con el resto de la pantalla,
// una reunión larga (un acta de varias páginas) dejaba la barra fuera de
// vista al bajar, sin ninguna forma de aplicar formato -- confirmado en
// real (2026-09-07). El wrapper tampoco lleva ya overflow-y-auto (sí lo
// llevaba antes) -- con eso puesto, la barra fija (position: sticky) no
// tenía a qué pegarse (creaba su propio contexto de scroll en vez de dejar
// que se pegara a la página real), así que tampoco se quedaba visible al
// bajar. Quitarlo hace que la barra de arriba también se comporte bien.
const RichTextEditor: React.FC<RichTextEditorProps> = ({ initialMarkdown, onChangeMarkdown, autoFocus, placeholder, className = '', bare = false }) => {
    const toolbarRef = useRef<HTMLDivElement>(null);

    const editor = useEditor({
        immediatelyRender: false,
        autofocus: autoFocus ? 'end' : false,
        editorProps: {
            attributes: {
                autocomplete: 'off',
                autocorrect: 'off',
                autocapitalize: 'off',
                class: 'simple-editor',
                // .tiptap.ProseMirror.simple-editor trae "padding: 3rem 3rem
                // 30vh" de serie (pensado para una página a pantalla
                // completa, con mucho hueco debajo) -- se recorta aquí para
                // una tarjeta, no una página entera.
                style: 'padding: 2rem;',
            },
        },
        extensions: [
            StarterKit.configure({
                horizontalRule: false,
                link: { openOnClick: false, enableClickSelection: true },
            }),
            HorizontalRule,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            TaskList,
            TaskItem.configure({ nested: true }),
            Highlight.configure({ multicolor: true }),
            Typography,
            Superscript,
            Subscript,
            Selection,
            Placeholder.configure({ placeholder: placeholder || '' }),
            Markdown.configure({ breaks: true }),
        ],
        content: initialMarkdown,
        onUpdate: ({ editor }) => onChangeMarkdown(editor.storage.markdown.getMarkdown()),
    });

    const chromeClassName = bare
        ? ''
        : 'rounded-lg border border-slate-300 shadow-sm focus-within:ring-2 focus-within:ring-[var(--color-primary)]/30 focus-within:border-[var(--color-primary)]';

    return (
        <div className={`${chromeClassName} ${className}`}>
            <EditorContext.Provider value={{ editor }}>
                <Toolbar ref={toolbarRef} variant="fixed">
                    <ToolbarGroup>
                        <UndoRedoButton action="undo" />
                        <UndoRedoButton action="redo" />
                    </ToolbarGroup>
                    <ToolbarSeparator />
                    <ToolbarGroup>
                        <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
                        <ListDropdownMenu modal={false} types={['bulletList', 'orderedList', 'taskList']} />
                        <BlockquoteButton />
                        <CodeBlockButton />
                    </ToolbarGroup>
                    <ToolbarSeparator />
                    <ToolbarGroup>
                        <MarkButton type="bold" />
                        <MarkButton type="italic" />
                        <MarkButton type="strike" />
                        <MarkButton type="code" />
                        <MarkButton type="underline" />
                        <ColorHighlightPopover />
                        <LinkPopover />
                    </ToolbarGroup>
                    <ToolbarSeparator />
                    <ToolbarGroup>
                        <MarkButton type="superscript" />
                        <MarkButton type="subscript" />
                    </ToolbarGroup>
                    <ToolbarSeparator />
                    <ToolbarGroup>
                        <TextAlignButton align="left" />
                        <TextAlignButton align="center" />
                        <TextAlignButton align="right" />
                        <TextAlignButton align="justify" />
                    </ToolbarGroup>
                    <Spacer />
                </Toolbar>
                {/* .simple-editor-content trae max-width:648px + margin:0 auto de
                    serie (pensado para una página a pantalla completa) -- se anula
                    aquí para que ocupe todo el ancho de la tarjeta que la contiene. */}
                <EditorContent editor={editor} role="presentation" className="simple-editor-content" style={{ maxWidth: 'none', margin: 0 }} />
                {editor && (
                    <BubbleMenu editor={editor}>
                        <Toolbar variant="floating">
                            <ToolbarGroup>
                                <MarkButton type="bold" />
                                <MarkButton type="italic" />
                                <MarkButton type="underline" />
                                <MarkButton type="strike" />
                                <ColorHighlightPopover />
                                <LinkPopover />
                            </ToolbarGroup>
                        </Toolbar>
                    </BubbleMenu>
                )}
            </EditorContext.Provider>
        </div>
    );
};

export default RichTextEditor;
