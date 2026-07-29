import React from 'react';
import { alertBaseClassName, alertColor, type AlertVariant } from '../theme/components/Alert';
import { CheckCircleIcon, ExclamationTriangleIcon } from './Icons';

export type { AlertVariant };

// Franja informativa (éxito/aviso/peligro/info) — antes cada pantalla
// montaba su propio div de color a mano (la tarjeta "Exportar copia" de
// BackupManager, el aviso verde de "sin problemas" del health check, la
// "Zona de Peligro" del reset...). Un único sitio para ese patrón, con el
// mismo icono por severidad en todos.
const ICONS: Partial<Record<AlertVariant, React.FC<{ className?: string }>>> = {
    success: CheckCircleIcon,
    warning: ExclamationTriangleIcon,
    danger: ExclamationTriangleIcon,
};

const Alert: React.FC<{
    variant?: AlertVariant;
    title?: string;
    children: React.ReactNode;
    className?: string;
}> = ({ variant = 'primary', title, children, className = '' }) => {
    const color = alertColor(variant);
    const Icon = ICONS[variant];
    return (
        <div
            className={`${alertBaseClassName} ${className}`}
            style={{ backgroundColor: color.soft, borderColor: color.base, color: color.softText }}
        >
            {Icon && <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />}
            <div className="min-w-0">
                {title && <p className="font-semibold mb-0.5">{title}</p>}
                <div>{children}</div>
            </div>
        </div>
    );
};

export default Alert;
