import React from 'react';
import {
    AcademicCapIcon, BeakerIcon, BookOpenIcon, ComputerDesktopIcon,
    GlobeIcon, CalculatorIcon, MusicNoteIcon, PaletteIcon, DumbbellIcon, LeafIcon,
} from './components/Icons';

export interface ClassIconOption {
    key: string;
    label: string;
    Icon: React.FC<{ className?: string }>;
}

// Icono de la tarjeta de cada clase: un pequeño catálogo propio (en vez de
// depender de iconos externos como en el panel) más la opción de subir una
// imagen propia (se elige desde Ajustes → Clases y Alumnado, en ClassModal)
// — mismo patrón de elegir entre "empaquetados" o "subido por el usuario"
// que los accesos directos.
export const CLASS_ICON_OPTIONS: ClassIconOption[] = [
    { key: 'academic-cap', label: 'General', Icon: AcademicCapIcon },
    { key: 'beaker', label: 'Ciencias', Icon: BeakerIcon },
    { key: 'leaf', label: 'Biología/Naturaleza', Icon: LeafIcon },
    { key: 'calculator', label: 'Matemáticas', Icon: CalculatorIcon },
    { key: 'globe', label: 'Geografía/Idiomas', Icon: GlobeIcon },
    { key: 'book-open', label: 'Lengua/Literatura', Icon: BookOpenIcon },
    { key: 'palette', label: 'Plástica/Arte', Icon: PaletteIcon },
    { key: 'music', label: 'Música', Icon: MusicNoteIcon },
    { key: 'dumbbell', label: 'Educación Física', Icon: DumbbellIcon },
    { key: 'computer', label: 'Tecnología/Digital', Icon: ComputerDesktopIcon },
];

export const getClassIconComponent = (icono?: string): React.FC<{ className?: string }> | null => {
    if (!icono || icono.startsWith('data:')) return null;
    return CLASS_ICON_OPTIONS.find(o => o.key === icono)?.Icon || null;
};
