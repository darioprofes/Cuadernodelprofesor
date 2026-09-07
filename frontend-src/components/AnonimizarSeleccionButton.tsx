import React, { useEffect, useState } from 'react';
import Button from './Button';

// Botón compartido por los tres pasos de revisión del Anonimizador
// (AiToolsView.tsx, AdaptarMaterialView.tsx, ActaReunionTab.tsx): habilitado
// solo mientras haya texto seleccionado en la página (para anonimizar a mano
// una palabra que el detector automático no cogió), deshabilitado el resto
// del tiempo -- se seguía la selección con el evento nativo selectionchange
// en vez de onMouseUp/onClick del propio texto, porque la selección puede
// terminar de arrastrar el ratón fuera del contenedor.
const AnonimizarSeleccionButton: React.FC<{ onAnonimizar: (seleccion: string) => void }> = ({ onAnonimizar }) => {
    const [seleccion, setSeleccion] = useState('');

    useEffect(() => {
        const actualizar = () => setSeleccion(window.getSelection()?.toString() ?? '');
        document.addEventListener('selectionchange', actualizar);
        return () => document.removeEventListener('selectionchange', actualizar);
    }, []);

    return (
        <Button
            type="button"
            variant="secondary"
            disabled={!seleccion.trim()}
            onClick={() => onAnonimizar(window.getSelection()?.toString() ?? '')}
        >
            Anonimizar selección
        </Button>
    );
};

export default AnonimizarSeleccionButton;
