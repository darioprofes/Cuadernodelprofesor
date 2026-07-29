import React from 'react';
import { inputClassName } from '../theme/components/Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    error?: boolean;
}

const Textarea: React.FC<TextareaProps> = ({ error = false, className = '', ...props }) => (
    <textarea {...props} className={`${inputClassName(error)} ${className}`} />
);

export default Textarea;
