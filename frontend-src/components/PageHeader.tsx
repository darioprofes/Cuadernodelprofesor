import React from 'react';
import { pageHeaderMinHeight, pageHeaderPaddingClassName } from '../theme/components/PageHeader';
import { headerPatternStyle } from '../theme/headerPattern';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    // Color hex directo (típicamente PAGE_ACCENT.xxx de theme/palette.ts)
    // en vez de una PaletteKey -- cada página de una misma sección del
    // Sidebar necesita su propio tono dentro de la misma familia de color
    // (Enseñanza=azules, Evaluación=rojos...), algo que las 5 claves fijas
    // de PALETTE no podían expresar.
    accent: string;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
}

// Cabecera de página en el tono intenso de PAGE_ACCENT, con texto en
// blanco: el pastel daba poco contraste con el texto oscuro. Reutilizada
// en las vistas que solo necesitan título + subtítulo opcional + acciones
// a la derecha. Horario y Agenda tienen su propia barra de navegación más
// compleja (mes/semana, prev/next...) y retiñen directamente su contenedor
// en vez de usar este componente.
const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, accent, icon, actions }) => {
    return (
        <div
            className={`rounded-xl ${pageHeaderPaddingClassName} ${pageHeaderMinHeight} flex items-center justify-between flex-wrap gap-3`}
            style={{ backgroundColor: accent, ...headerPatternStyle }}
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
