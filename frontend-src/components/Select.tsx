import React from 'react';
import { inputClassName } from '../theme/components/Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    error?: boolean;
}

const Select: React.FC<SelectProps> = ({ error = false, className = '', children, ...props }) => (
    <select {...props} className={`${inputClassName(error)} ${className}`}>
        {children}
    </select>
);

export default Select;
