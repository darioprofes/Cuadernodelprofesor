import React from 'react';

// Ilustración vectorial propia (no una imagen importada) para el banner de
// "Hoy": un faro sobre la costa, pensada para estirarse a lo ancho de
// cualquier banner sin perder nitidez ni deformarse (viewBox panorámico +
// preserveAspectRatio "slice" recorta por los lados en vez de estirar).
const BannerCostero: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 1600 260"
        preserveAspectRatio="xMidYMax slice"
        className={className}
        aria-hidden="true"
    >
        {/* Montañas lejanas */}
        <path
            d="M0,190 Q150,150 320,175 T650,165 T980,175 T1320,160 T1600,180 L1600,260 L0,260 Z"
            fill="#c3d6ec"
            opacity="0.55"
        />
        {/* Colina verde donde se asienta el faro */}
        <path
            d="M720,215 Q900,165 1080,190 T1440,195 L1600,215 L1600,260 L700,260 Z"
            fill="#9cc49a"
            opacity="0.6"
        />

        {/* Mar */}
        <path
            d="M0,222 Q100,213 210,222 T430,219 T650,225 T870,217 T1090,223 T1310,215 T1600,221 L1600,260 L0,260 Z"
            fill="#bfe0f5"
        />
        <path
            d="M0,235 Q150,229 300,235 T600,233 T900,237 T1200,232 T1600,236"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.6"
            strokeWidth="3"
        />

        {/* Playa */}
        <path
            d="M1280,236 Q1420,220 1600,232 L1600,260 L1250,260 Z"
            fill="#f2e2bd"
            opacity="0.85"
        />

        {/* Pájaros */}
        <g stroke="#6b89b3" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7">
            <path d="M120,70 q12,-14 24,0 q12,-14 24,0" />
            <path d="M210,100 q10,-12 20,0 q10,-12 20,0" />
            <path d="M980,55 q10,-12 20,0 q10,-12 20,0" />
        </g>

        {/* Montículo del faro */}
        <ellipse cx="1232" cy="222" rx="95" ry="30" fill="#7aab74" opacity="0.55" />
        <ellipse cx="1225" cy="218" rx="88" ry="26" fill="#9cc49a" />

        {/* Torre del faro */}
        <path d="M1213,205 L1247,205 L1241,108 L1219,108 Z" fill="#eef4fb" stroke="#c8d8ec" strokeWidth="1.5" />
        <rect x="1216" y="150" width="28" height="10" fill="#5b8fd1" />
        <rect x="1218" y="180" width="24" height="10" fill="#5b8fd1" />
        {/* Sala de luz + tejado */}
        <rect x="1208" y="90" width="44" height="20" rx="2" fill="#eef4fb" stroke="#5b8fd1" strokeWidth="2" />
        <path d="M1204,90 L1230,64 L1256,90 Z" fill="#2f5c99" />
        <circle cx="1230" cy="60" r="3" fill="#2f5c99" />
        <circle cx="1230" cy="99" r="6" fill="#ffe9a8" opacity="0.85" />
    </svg>
);

export default BannerCostero;
