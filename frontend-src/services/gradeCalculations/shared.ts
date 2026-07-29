import type { GradeScaleRule } from '../../types';

// Helper to determine color based on configuration
export const getGradeColorClass = (grade: number | null, scale?: GradeScaleRule[]): string => {
    if (grade === null || grade === undefined) return 'bg-transparent text-slate-500';

    // Default fallback if no scale provided or empty (Expanded Gradation)
    if (!scale || scale.length === 0) {
        if (grade < 5) return 'bg-red-100 text-red-800';
        if (grade < 6) return 'bg-orange-100 text-orange-800';
        if (grade < 7) return 'bg-yellow-100 text-yellow-800';
        if (grade < 9) return 'bg-lime-100 text-lime-800';
        return 'bg-emerald-100 text-emerald-800';
    }

    // Sort scale descending by min value to find the first match from top down
    // (e.g. >= 9, then >= 7, then >= 5...)
    const sortedScale = [...scale].sort((a, b) => b.min - a.min);

    for (const rule of sortedScale) {
        if (grade >= rule.min) {
             switch(rule.color) {
                 case 'red': return 'bg-red-100 text-red-800';
                 case 'orange': return 'bg-orange-100 text-orange-800';
                 case 'yellow': return 'bg-yellow-100 text-yellow-800';
                 case 'lime': return 'bg-lime-100 text-lime-800';
                 case 'green': return 'bg-green-100 text-green-800';
                 case 'emerald': return 'bg-emerald-100 text-emerald-800';
                 case 'teal': return 'bg-teal-100 text-teal-800';
                 case 'blue': return 'bg-blue-100 text-blue-800';
                 case 'indigo': return 'bg-indigo-100 text-indigo-800';
                 case 'violet': return 'bg-violet-100 text-violet-800';
                 case 'gray': return 'bg-slate-100 text-slate-800';
                 default: return 'bg-slate-100 text-slate-500';
             }
        }
    }
    // Fallback if grade is lower than the lowest defined range (shouldn't happen if 0 is defined)
    return 'bg-red-50 text-red-900';
}
