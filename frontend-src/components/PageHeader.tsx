import React from 'react';
import { PALETTE, type PaletteKey } from '../theme/palette';
import { pageHeaderMinHeight, pageHeaderPaddingClassName } from '../theme/components/PageHeader';
import { headerPatternStyle } from '../theme/headerPattern';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    accent: PaletteKey;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
}

// Cabecera de página en el tono intenso de la paleta (fondo `header`, el
// mismo que las cabeceras de tarjeta de Hoy) con texto en blanco: el pastel
// (`soft`) daba poco contraste con el texto oscuro. Reutilizada en las
// vistas que solo necesitan título + subtítulo opcional + acciones a la
// derecha. Horario y Agenda tienen su propia barra de navegación más
// compleja (mes/semana, prev/next...) y retiñen directamente su contenedor
// en vez de usar este componente.
const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, accent, icon, actions }) => {
    const c = PALETTE[accent];
    return (
        <div
            className={`rounded-xl ${pageHeaderPaddingClassName} ${pageHeaderMinHeight} flex items-center justify-between flex-wrap gap-3`}
            style={{ backgroundColor: c.header, ...headerPatternStyle }}
        >
            <div className="flex items-center gap-3 min-w-0">
                {icon && <span className="flex-shrink-0 text-white/90">{icon}</span>}
                <div className="min-w-0">
                    <h2 className="text-xl font-bold text-white truncate">{title}</h2>
                    {subtitle && <p className="text-sm text-white/80 truncate">{subtitle}</p>}
                </div>
            </div>
            {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
    );
};

export default PageHeader;
