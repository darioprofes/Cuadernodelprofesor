import React from 'react';
import { inputClassName } from '../theme/components/Input';

// Campo de texto/número/fecha estándar — ver theme/components/Input.ts
// para el razonamiento del estilo. `error` activa el borde/foco rojo sin
// que cada formulario tenga que construirlo a mano.
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    error?: boolean;
}

const Input: React.FC<InputProps> = ({ error = false, className = '', ...props }) => (
    <input {...props} className={`${inputClassName(error)} ${className}`} />
);

export default Input;
