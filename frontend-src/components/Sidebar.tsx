import React, { useState } from 'react';
import type { View } from '../types';
import {
    HomeIcon, ClockIcon, CalendarDaysIcon, BookOpenIcon, ClipboardDocumentIcon,
    UsersIcon, ClipboardDocumentCheckIcon, ChartBarIcon,
    StarIcon, ChevronRightIcon, Bars3Icon, XMarkIcon,
} from './Icons';
import Logo from './Logo';
import { PALETTE } from '../theme/palette';
import { openExternalLink } from '../utils';

interface NavItem {
    view: View;
    label: string;
    icon: React.FC<{ className?: string }>;
}

// Agrupado en secciones (con o sin etiqueta), igual que en el mockup: los
// cuatro primeros van sueltos, luego "Enseñanza" y "Comunicación".
interface NavSection {
    label: string | null;
    items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
    {
        label: null,
        items: [
            { view: 'hoy', label: 'Hoy', icon: HomeIcon },
            { view: 'horario', label: 'Horario', icon: ClockIcon },
            { view: 'calendar', label: 'Agenda', icon: CalendarDaysIcon },
        ],
    },
    {
        label: 'Enseñanza',
        items: [
            { view: 'gradebook', label: 'Cuaderno', icon: BookOpenIcon },
            { view: 'journal', label: 'Diario', icon: ClipboardDocumentIcon },
            { view: 'exams', label: 'Tareas evaluables', icon: ClipboardDocumentCheckIcon },
        ],
    },
    {
        label: 'Comunicación',
        items: [
            { view: 'meetings', label: 'Reuniones', icon: UsersIcon },
            { view: 'criteria', label: 'Informes', icon: ChartBarIcon },
        ],
    },
];

// Un mismo item del sidebar puede corresponder a varias "View" internas
// (p.ej. "Informes" engloba criteria/competences/key-competences/descriptors,
// que ya tienen su propia sub-tab-bar dentro de App.tsx). Se resalta activo
// si activeView cae en ese grupo.
const REPORT_VIEWS: View[] = ['criteria', 'competences', 'key-competences', 'descriptors'];

const isActive = (item: NavItem, activeView: View): boolean => {
    if (item.view === 'criteria') return REPORT_VIEWS.includes(activeView);
    return item.view === activeView;
};

const navButtonClass = (active: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
    }`;

interface SidebarProps {
    activeView: View;
    setActiveView: (view: View) => void;
    onOpenFavoritos: () => void;
}

// Contenido compartido por la columna de escritorio y el panel deslizante de
// móvil: cabecera, secciones de navegación, Favoritos y la licencia. Recibe
// "onNavigate" para que en móvil, además de cambiar de vista, se cierre el
// panel.
const SidebarContent: React.FC<{
    activeView: View;
    onNavigate: (view: View) => void;
    onOpenFavoritos: () => void;
}> = ({ activeView, onNavigate, onOpenFavoritos }) => (
    <>
        <div className="px-4 py-4 border-b border-slate-200 flex items-center gap-2 flex-shrink-0">
            <img src="/logo.png" alt="" className="w-9 h-9 rounded-lg flex-shrink-0 object-cover" />
            <div className="min-w-0">
                <p className="font-bold text-base text-slate-800 leading-tight break-words">Cuaderno Docente</p>
                <p className="text-xs text-slate-400 leading-tight">La Marejada</p>
            </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-4">
            {NAV_SECTIONS.map((section, i) => (
                <div key={section.label ?? `sec-${i}`} className="space-y-1">
                    {section.label && (
                        <p className="px-3 pt-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{section.label}</p>
                    )}
                    {section.items.map(item => {
                        const Icon = item.icon;
                        const active = isActive(item, activeView);
                        return (
                            <button
                                key={item.view}
                                onClick={() => onNavigate(item.view)}
                                className={navButtonClass(active)}
                                style={active ? { backgroundColor: PALETTE.navy.header } : undefined}
                            >
                                <Icon className="w-5 h-5 flex-shrink-0" />
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            ))}

            <div className="pt-2 border-t border-slate-200">
                <button
                    onClick={onOpenFavoritos}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700 transition-colors"
                >
                    <StarIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    <span className="flex-grow text-left">Favoritos</span>
                    <ChevronRightIcon className="w-4 h-4 text-slate-400" />
                </button>
            </div>
        </nav>
        <div className="px-4 py-3 border-t border-slate-200 flex-shrink-0 flex items-center justify-center gap-1.5">
            <Logo className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <a
                href="http://creativecommons.org/licenses/by-nc/4.0/"
                rel="license"
                target="_blank"
                onClick={(e) => openExternalLink(e, 'http://creativecommons.org/licenses/by-nc/4.0/')}
                className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
                La Marejada · CC BY-NC
            </a>
        </div>
    </>
);

const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, onOpenFavoritos }) => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleNavigateDesktop = (view: View) => setActiveView(view);
    const handleNavigateMobile = (view: View) => {
        setActiveView(view);
        setMobileMenuOpen(false);
    };

    return (
        <>
            {/* Escritorio: columna fija lateral */}
            <aside className="hidden md:flex flex-col w-56 flex-shrink-0 border-r border-slate-200 bg-white sticky top-0 h-screen">
                <SidebarContent activeView={activeView} onNavigate={handleNavigateDesktop} onOpenFavoritos={onOpenFavoritos} />
            </aside>

            {/* Móvil: barra superior con botón de menú (demasiadas secciones para una barra inferior) */}
            <header className="flex md:hidden items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white fixed top-0 left-0 right-0 z-30">
                <button onClick={() => setMobileMenuOpen(true)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100" title="Abrir menú">
                    <Bars3Icon className="w-6 h-6 text-slate-700" />
                </button>
                <img src="/logo.png" alt="" className="w-7 h-7 rounded-lg flex-shrink-0 object-cover" />
                <span className="font-bold text-slate-800">Cuaderno Docente</span>
            </header>

            {mobileMenuOpen && (
                <div className="fixed inset-0 z-50 flex md:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
                    <div className="relative w-72 max-w-[85vw] h-full bg-white flex flex-col shadow-xl">
                        <button
                            onClick={() => setMobileMenuOpen(false)}
                            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100 z-10"
                            title="Cerrar menú"
                        >
                            <XMarkIcon className="w-5 h-5 text-slate-500" />
                        </button>
                        <SidebarContent
                            activeView={activeView}
                            onNavigate={handleNavigateMobile}
                            onOpenFavoritos={() => { setMobileMenuOpen(false); onOpenFavoritos(); }}
                        />
                    </div>
                </div>
            )}
        </>
    );
};

export default Sidebar;
