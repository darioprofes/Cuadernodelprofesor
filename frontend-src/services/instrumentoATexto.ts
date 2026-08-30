import type { EvaluationTool } from '../types';

const ETIQUETA_TIPO: Record<EvaluationTool['type'], string> = {
    checklist: 'Lista de cotejo',
    rating_scale: 'Escala de valoración',
    rubric: 'Rúbrica',
    criterial_exam: 'Examen criterial',
};

// Convierte un instrumento de evaluación ya creado en texto plano, para
// usarlo como "material de origen" al adaptarlo para un alumno concreto
// (ver AdaptarMaterialView.tsx) -- no existía ningún serializador de este
// tipo en el resto de la app, solo renderizado visual dentro del editor.
export function instrumentoATexto(tool: EvaluationTool): string {
    const lineas = [`${ETIQUETA_TIPO[tool.type]}: ${tool.name}`, ''];

    if (tool.type === 'rating_scale' || tool.type === 'rubric') {
        lineas.push(`Niveles: ${tool.levels.map(l => l.name).join(', ')}`, '');
    }

    if (tool.type === 'rubric') {
        tool.items.forEach((item, i) => {
            lineas.push(`${i + 1}. ${item.description}`);
            for (const nivel of tool.levels) {
                const descripcion = item.levelDescriptions[nivel.id];
                if (descripcion) lineas.push(`   - ${nivel.name}: ${descripcion}`);
            }
        });
    } else {
        tool.items.forEach((item, i) => {
            const puntos = tool.type === 'criterial_exam' ? ` (${item.weight} puntos)` : '';
            lineas.push(`${i + 1}. ${item.description}${puntos}`);
        });
    }

    return lineas.join('\n');
}
