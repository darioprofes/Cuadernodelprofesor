import React from 'react';
import {
    GHOST_TONE_CLASSES,
    iconButtonGhostClassName,
    iconButtonSizeClassName,
    iconButtonSolidClassName,
    iconButtonSolidColor,
    type IconButtonTone,
} from '../theme/components/IconButton';

export type { IconButtonTone };

// Botón que solo lleva un icono (editar/borrar/reordenar en filas de
// tabla, cerrar un modal...) — antes cada sitio montaba su propio
// `<button className="p-1 hover:bg-slate-100 rounded-full">` suelto, sin
// aria-label (invisible para lector de pantalla). `label` es obligatorio a
// propósito: no se puede crear uno sin accesibilidad básica por omisión.
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
    tone?: IconButtonTone;
    size?: 'sm' | 'md';
    /** Fondo de color siempre visible (no solo al pasar el ratón) — para
     * acciones de crear que necesitan destacar más que un icono de fila
     * (p.ej. "+ Nueva categoría" flotante sobre una cabecera de tabla). */
    solid?: boolean;
}

const IconButton: React.FC<IconButtonProps> = ({ label, tone = 'neutral', size = 'md', solid = false, className = '', style, children, ...props }) => {
    const sizeClass = iconButtonSizeClassName(size);

    if (solid && tone !== 'neutral') {
        const color = iconButtonSolidColor(tone);
        return (
            <button
                {...props}
                aria-label={label}
                title={props.title ?? label}
                className={`${iconButtonSolidClassName} ${sizeClass} ${className}`}
                style={{ backgroundColor: color.base, color: color.text, ...style }}
            >
                {children}
            </button>
        );
    }

    return (
        <button
            {...props}
            aria-label={label}
            title={props.title ?? label}
            className={`${iconButtonGhostClassName} ${sizeClass} ${GHOST_TONE_CLASSES[tone]} ${className}`}
            style={style}
        >
            {children}
        </button>
    );
};

export default IconButton;
