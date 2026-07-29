import React from 'react';
import { cardBaseClassName, cardPaddingClassName, type CardPadding } from '../theme/components/Card';

// Contenedor de tarjeta/panel genérico — mismo radio/sombra/borde en toda
// la app (antes cada pantalla repetía "bg-white rounded-xl shadow-sm
// border border-slate-200 p-4" con pequeñas variaciones). `padding="none"`
// para cuando el contenido (una tabla, por ejemplo) necesita llegar al
// borde.
const Card: React.FC<{
    children: React.ReactNode;
    className?: string;
    padding?: CardPadding;
}> = ({ children, className = '', padding = 'md' }) => (
    <div className={`${cardBaseClassName} ${cardPaddingClassName(padding)} ${className}`}>
        {children}
    </div>
);

export default Card;
