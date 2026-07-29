import React from 'react';

// Icono de La Marejada (mismo que usa el panel personal, "ola-2563eb.svg"),
// en vez del logo original de CuadernMestre.
const Logo = ({ className = "w-8 h-8" }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M2 6c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
        <path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
        <path d="M2 18c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
    </svg>
);

export default Logo;
