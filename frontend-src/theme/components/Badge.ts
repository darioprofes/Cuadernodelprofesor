import { SEMANTIC, type SemanticKey } from '../palette';
import { RADIUS } from '../radius';

export type BadgeVariant = SemanticKey;

export const badgeClassName = `inline-flex items-center gap-1 px-2 py-0.5 ${RADIUS.pill} text-xs font-semibold`;

export const badgeColor = (variant: BadgeVariant) => SEMANTIC[variant];
