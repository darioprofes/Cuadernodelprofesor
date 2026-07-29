import React from 'react';
import { UserCircleIcon } from './Icons';

// Foto del alumno si la tiene, si no un icono genérico neutro — reutilizado
// donde se necesita ese aspecto "sin acento de color" (ficha resumen, ficha
// personal). Distinto del StudentAvatar de ClasesView (iniciales sobre el
// color de la clase) y del avatar del Plano de Clase (emoji sobre el color
// elegido para el alumno): son estilos deliberadamente distintos, no la
// misma pieza reutilizada tres veces.
const StudentPhotoAvatar: React.FC<{ foto?: string; size?: string }> = ({ foto, size = 'w-24 h-24' }) => (
    foto ? (
        <img src={foto} alt="" className={`${size} rounded-full object-cover border border-slate-200`} />
    ) : (
        <UserCircleIcon className={`${size} text-slate-300`} />
    )
);

export default StudentPhotoAvatar;
