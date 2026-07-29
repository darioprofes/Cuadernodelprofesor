import React from 'react';
import type { ClassData, Course } from '../types';
import { getMateria, getSiglas } from '../utils';

// Muestra el grupo (p.ej. "S4BD") como una etiqueta separada de la materia,
// en vez de un único texto fusionado. Solo sirve donde se admite JSX (no en
// <option> de un <select>, que solo acepta texto plano — ahí se usa
// formatClassLabel de utils.ts en su lugar).
const ClassLabel: React.FC<{ classData: ClassData; courses: Course[]; className?: string; grupoClassName?: string; grupoStyle?: React.CSSProperties; useSiglas?: boolean }> = ({ classData, courses, className, grupoClassName, grupoStyle, useSiglas }) => {
    const materia = getMateria(classData, courses);
    const materiaMostrada = useSiglas ? getSiglas(materia) : materia;

    return (
        <span className={className} title={useSiglas ? materia : undefined}>
            {classData.grupo && (
                <span
                    className={grupoClassName || 'inline-block px-2 py-0.5 mr-1.5 rounded bg-slate-200 text-slate-700 text-xs font-mono font-semibold align-middle'}
                    style={grupoStyle}
                >
                    {classData.grupo}
                </span>
            )}
            <span className="align-middle">{materiaMostrada}</span>
        </span>
    );
};

export default ClassLabel;
