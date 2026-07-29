import { RADIUS } from '../radius';
import { SHADOW } from '../shadows';
import { SPACING } from '../spacing';
import { TYPOGRAPHY } from '../typography';

export type ModalSize = 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

export const MODAL_SIZE_CLASSES: Record<ModalSize, string> = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
};

export const modalOverlayClassName = 'fixed inset-0 bg-black/30 z-50 flex justify-center items-center overflow-hidden';

export const modalPanelClassName = `bg-white ${RADIUS.container} ${SHADOW.md} w-full m-4 relative flex flex-col max-h-[90vh]`;

export const modalHeaderClassName = 'flex-shrink-0 flex justify-between items-center p-4 border-b border-slate-200 cursor-move bg-slate-50 select-none rounded-t-xl';

export const modalTitleClassName = `${TYPOGRAPHY.sectionTitle} pointer-events-none`;

export const modalBodyClassName = `${SPACING.modal} overflow-y-auto`;
