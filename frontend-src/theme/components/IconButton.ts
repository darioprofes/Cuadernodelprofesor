import { SEMANTIC } from '../palette';

export type IconButtonTone = 'neutral' | 'danger' | 'primary' | 'success';

export const GHOST_TONE_CLASSES: Record<IconButtonTone, string> = {
    neutral: 'text-slate-400 hover:text-slate-700 hover:bg-slate-100',
    danger: 'text-slate-400 hover:text-red-600 hover:bg-red-50',
    primary: 'text-slate-400 hover:text-blue-600 hover:bg-blue-50',
    success: 'text-slate-400 hover:text-green-600 hover:bg-green-50',
};

export const iconButtonSizeClassName = (size: 'sm' | 'md'): string => (size === 'sm' ? 'p-1' : 'p-2');

export const iconButtonSolidClassName = 'inline-flex items-center justify-center rounded-full shadow-sm hover:brightness-110 transition-[filter] disabled:opacity-40 disabled:pointer-events-none';

export const iconButtonGhostClassName = 'inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-40 disabled:pointer-events-none';

export const iconButtonSolidColor = (tone: IconButtonTone) => SEMANTIC[tone];
