import React from 'react';
import {
    emptyStateActionWrapperClassName,
    emptyStateIconWrapperClassName,
    emptyStateMessageClassName,
    emptyStateTitleClassName,
    emptyStateWrapperClassName,
} from '../theme/components/EmptyState';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    message?: string;
    action?: React.ReactNode;
    className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, message, action, className = '' }) => (
    <div className={`${emptyStateWrapperClassName} ${className}`}>
        {icon && <div className={emptyStateIconWrapperClassName}>{icon}</div>}
        <p className={emptyStateTitleClassName}>{title}</p>
        {message && <p className={emptyStateMessageClassName}>{message}</p>}
        {action && <div className={emptyStateActionWrapperClassName}>{action}</div>}
    </div>
);

export default EmptyState;
