import React from 'react';
import { buttonBaseClassName, buttonSecondaryClassName, buttonSolidClassName, buttonSolidColor, type ButtonVariant } from '../theme/components/Button';

export type { ButtonVariant };

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
}

const Button: React.FC<ButtonProps> = ({ variant = 'primary', className = '', style, children, ...props }) => {
    if (variant === 'secondary') {
        return (
            <button
                {...props}
                className={`${buttonBaseClassName} ${buttonSecondaryClassName} ${className}`}
                style={style}
            >
                {children}
            </button>
        );
    }

    const color = buttonSolidColor(variant);
    return (
        <button
            {...props}
            className={`${buttonBaseClassName} ${buttonSolidClassName} ${className}`}
            style={{ backgroundColor: color.base, color: color.text, ...style }}
        >
            {children}
        </button>
    );
};

export default Button;
