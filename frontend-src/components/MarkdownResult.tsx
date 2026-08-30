import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Extraído de AiToolsView.tsx (renderizaba el resultado final del
// Anonimizador) para reutilizarlo tal cual en cualquier otro resultado de
// IA en Markdown -- AdaptarMaterialView.tsx es el segundo caso real.
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

const MarkdownResult: React.FC<{ texto: string; className?: string }> = ({ texto, className = '' }) => (
    <div className={`${markdownClassName} ${className}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{texto}</ReactMarkdown>
    </div>
);

export default MarkdownResult;
