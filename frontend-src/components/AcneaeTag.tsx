
import React from 'react';
import { ACNEAE_ORDER } from '../constants';
import { SEMANTIC } from '../theme/palette';

interface AcneaeTagProps {
  tags: string[];
}

// Helper to get the highest priority tag
const getPriorityTag = (tags: string[]): string | null => {
  if (!tags || tags.length === 0) {
    return null;
  }

  return tags.slice().sort((a, b) => {
    const aBase = a.split(' ')[0];
    const bBase = b.split(' ')[0];
    const aPriority = ACNEAE_ORDER[aBase as keyof typeof ACNEAE_ORDER] || 99;
    const bPriority = ACNEAE_ORDER[bBase as keyof typeof ACNEAE_ORDER] || 99;
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    return a.localeCompare(b);
  })[0];
};

// Color por prioridad, de los mismos tokens semánticos que el resto de la
// app (theme.ts) en vez de colores de Tailwind sueltos sin relación entre
// sí (rojo/azul/verde/gris/amarillo elegidos independientemente).
const getTagColor = (tag: string | null): string => {
    if (!tag) return 'transparent';
    const base = tag.split(' ')[0];
    switch (base) {
        case 'PAC':
        case 'PRE':
            return SEMANTIC.danger.base;
        case 'RE':
            return SEMANTIC.primary.base;
        case 'ACS':
            return SEMANTIC.success.base;
        case 'ABS':
            return SEMANTIC.neutral.base;
        default:
            return SEMANTIC.warning.base;
    }
}

const AcneaeTag: React.FC<AcneaeTagProps> = ({ tags }) => {
  const priorityTag = getPriorityTag(tags);

  if (!priorityTag) {
    return null;
  }
  
  return (
    <div
        className="w-4 h-4 rounded-full flex-shrink-0"
        style={{ backgroundColor: getTagColor(priorityTag) }}
        title={`ACNEAE: ${tags.join(', ')} (Prioritario: ${priorityTag})`}
    >
    </div>
  );
};

export default AcneaeTag;
