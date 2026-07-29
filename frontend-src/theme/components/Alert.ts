import { SEMANTIC } from '../palette';
import { RADIUS } from '../radius';

export type AlertVariant = 'success' | 'warning' | 'danger' | 'primary';

export const alertBaseClassName = `flex items-start gap-2.5 p-3 border ${RADIUS.container} text-sm`;

export const alertColor = (variant: AlertVariant) => SEMANTIC[variant];
