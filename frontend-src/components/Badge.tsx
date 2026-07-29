import React from 'react';
import { badgeClassName, badgeColor, type BadgeVariant } from '../theme/components/Badge';

export type { BadgeVariant };

// Etiqueta/chip de estado (ACNEAE, categoría de una tarea, resultado de la
// comprobación de integridad...) — antes cada sitio construía su propio
// `<span className="px-2 py-0.5 rounded-full bg-X-100 text-X-700">` con un
// color de Tailwind suelto. Aquí el color sale de SEMANTIC (mismos tokens
// que Button/Alert), y `neutral` cubre los casos sin carga semántica
// (categorías, grupos) donde antes se usaba un gris de Tailwind cualquiera.
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
    children: React.ReactNode;
}

const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', children, className = '', ...props }) => {
    const color = badgeColor(variant);
    return (
        <span
            {...props}
            className={`${badgeClassName} ${className}`}
            style={{ backgroundColor: color.soft, color: color.softText }}
        >
            {children}
        </span>
    );
};

export default Badge;
