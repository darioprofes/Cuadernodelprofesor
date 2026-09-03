import React from 'react';
import type { Student } from '../types';
import { getNombreCompleto } from '../utils';

const getInitials = (student: Student): string => {
    if (student.nombre && student.primerApellido)
        return (student.nombre[0] + student.primerApellido[0]).toUpperCase();
    const name = getNombreCompleto(student);
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
};

// Foto si la tiene, si no iniciales sobre un color de fondo — compartido
// entre el panel de alumnado del Cuaderno y (antes) ClasesView. hideFoto
// fuerza las iniciales aunque haya foto -- modo privacidad del Cuaderno,
// para cuando alguien mira la pantalla por encima del hombro.
const StudentAvatar: React.FC<{ student: Student; bgColor: string; className?: string; hideFoto?: boolean }> = ({ student, bgColor, className = 'w-6 h-6 text-[10px]', hideFoto = false }) => (
    <span className={`${className} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`} style={{ backgroundColor: bgColor }}>
        {student.foto && !hideFoto ? <img src={student.foto} alt="" className="w-full h-full object-cover" /> : getInitials(student)}
    </span>
);

export default StudentAvatar;
