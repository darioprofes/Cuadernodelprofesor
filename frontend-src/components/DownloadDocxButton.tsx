import React from 'react';
import Button from './Button';
import { ArrowDownTrayIcon } from './Icons';

// Extraído de AiToolsView.tsx para reutilizarlo tal cual en cualquier otro
// resultado descargable en .docx -- AdaptarMaterialView.tsx es el segundo
// caso real.
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

export default DownloadDocxButton;
