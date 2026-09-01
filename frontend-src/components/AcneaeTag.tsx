
import React from 'react';
import { ACNEAE_ORDER, ACNEAE_LABELS } from '../constants';
import { SEMANTIC } from '../theme/palette';

interface AcneaeTagProps {
  tags: string[];
}

// Familia de una categoría (p.ej. "ACNEE-TEA" -> "ACNEE") -- los códigos
// oficiales de SAUCE siempre van PREFIJO-SUFIJO, a diferencia del listado
// ad-hoc anterior (con variantes separadas por espacio, "PAC EP1").
const familia = (tag: string): string => tag.split('-')[0];

// Helper to get the highest priority tag
const getPriorityTag = (tags: string[]): string | null => {
  if (!tags || tags.length === 0) {
    return null;
  }

  return tags.slice().sort((a, b) => {
    const aPriority = ACNEAE_ORDER[familia(a)] ?? 99;
    const bPriority = ACNEAE_ORDER[familia(b)] ?? 99;

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    return a.localeCompare(b);
  })[0];
};

// Color por familia, de los mismos tokens semánticos que el resto de la
// app (theme.ts): ACNEE (NEE) en rojo -- mayor necesidad de apoyo --, OTRAS
// (resto de NEAE) en dorado, ESPEC (altas capacidades) en azul -- categoría
// distinta, no una necesidad de apoyo en ese sentido.
const getTagColor = (tag: string | null): string => {
    if (!tag) return 'transparent';
    switch (familia(tag)) {
        case 'ACNEE':
            return SEMANTIC.danger.base;
        case 'OTRAS':
            return SEMANTIC.warning.base;
        case 'ESPEC':
            return SEMANTIC.primary.base;
        default:
            return SEMANTIC.neutral.base;
    }
}

const AcneaeTag: React.FC<AcneaeTagProps> = ({ tags }) => {
  const priorityTag = getPriorityTag(tags);

  if (!priorityTag) {
    return null;
  }

  // "ACNEE-TEA (Trastorno del espectro autista)" en vez del código a
  // secas -- los códigos oficiales no son autoexplicativos.
  const conGlosa = (t: string) => ACNEAE_LABELS[t] ? `${t} (${ACNEAE_LABELS[t]})` : t;

  return (
    <div
        className="w-4 h-4 rounded-full flex-shrink-0"
        style={{ backgroundColor: getTagColor(priorityTag) }}
        title={`ACNEAE: ${tags.map(conGlosa).join(', ')} (Prioritario: ${conGlosa(priorityTag)})`}
    >
    </div>
  );
};

export default AcneaeTag;
