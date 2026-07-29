import { RADIUS } from '../radius';
import { SHADOW } from '../shadows';
import { SPACING } from '../spacing';

export type CardPadding = 'none' | 'sm' | 'md';

export const cardBaseClassName = `bg-white border border-slate-200 ${RADIUS.container} ${SHADOW.sm}`;

export const cardPaddingClassName = (padding: CardPadding): string =>
    padding === 'none' ? '' : padding === 'sm' ? SPACING.field : SPACING.card;
