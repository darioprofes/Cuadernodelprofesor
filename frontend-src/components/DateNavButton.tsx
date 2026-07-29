import React, { useRef, ReactNode } from 'react';

interface DateNavButtonProps {
    value: string; // YYYY-MM-DD: fecha con la que se abre/pre-selecciona el calendario nativo
    label: ReactNode; // texto visible del botón — lo decide quien lo usa ("Hoy"/fecha, rango de semana...)
    onChange: (date: string) => void;
    className?: string;
    title?: string;
}

// Botón-etiqueta que abre el selector de fecha nativo del navegador al
// pulsarlo, para saltar directamente a cualquier fecha en vez de solo poder
// avanzar/retroceder de uno en uno. `label` decide qué texto mostrar (p.ej.
// "Hoy" vs la fecha, o un rango de semana) — este componente solo se ocupa
// de abrir el calendario.
//
// El <input type="date"> real vive oculto: un input superpuesto y
// transparente NO sirve porque el hueco que de verdad abre el calendario en
// los navegadores basados en Chromium es solo el icono nativo, pegado al
// borde derecho del control — clicar en el resto del input solo mueve el
// cursor de edición del día/mes/año sin abrir nada. showPicker() abre el
// selector desde cualquier punto del botón visible.
const DateNavButton: React.FC<DateNavButtonProps> = ({ value, label, onChange, className, title = 'Elegir fecha' }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const openPicker = () => {
        const input = inputRef.current;
        if (!input) return;
        if (typeof input.showPicker === 'function') {
            input.showPicker();
        } else {
            input.focus();
        }
    };

    return (
        <div className="relative inline-flex">
            <button
                type="button"
                onClick={openPicker}
                title={title}
                className={`select-none whitespace-nowrap ${className ?? ''}`}
            >
                {label}
            </button>
            <input
                ref={inputRef}
                type="date"
                value={value}
                onChange={e => e.target.value && onChange(e.target.value)}
                tabIndex={-1}
                aria-hidden="true"
                className="absolute inset-0 w-px h-px opacity-0 pointer-events-none"
            />
        </div>
    );
};

export default DateNavButton;
