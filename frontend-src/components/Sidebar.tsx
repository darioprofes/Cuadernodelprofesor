import React, { useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { View } from '../types';
import {
    HomeIcon, ClockIcon, CalendarDaysIcon, BookOpenIcon, ClipboardDocumentIcon,
    UsersIcon, ClipboardDocumentCheckIcon, ChartBarIcon, SparklesIcon,
    StarIcon, ChevronRightIcon, ChevronDownIcon, Bars3Icon, XMarkIcon, ListBulletIcon, BeakerIcon,
} from './Icons';
import Logo from './Logo';
import { SEMANTIC } from '../theme/palette';
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
            // Antes solo se llegaba aquí escondido dentro de Ajustes o vía el
            // atajo de Herramientas IA -- se planifica durante todo el curso,
            // no solo al principio, así que merece acceso directo (petición
            // explícita del usuario).
            { view: 'planner', label: 'Planificación SA', icon: ListBulletIcon },
            { view: 'gradebook', label: 'Cuaderno', icon: BookOpenIcon },
            { view: 'journal', label: 'Diario', icon: ClipboardDocumentIcon },
        ],
    },
    {
        label: 'Evaluación',
        items: [
            { view: 'exams', label: 'Tareas evaluables', icon: ClipboardDocumentCheckIcon },
            // Antes solo se llegaba aquí escondido dentro de Ajustes -- se
            // usan durante todo el curso al calificar, así que merece acceso
            // directo (sigue disponible en Ajustes también).
            { view: 'evaluation-tools', label: 'Instrumentos Evaluación', icon: BeakerIcon },
        ],
    },
    {
        label: 'Comunicación',
        items: [
            { view: 'meetings', label: 'Reuniones', icon: UsersIcon },
            { view: 'criteria', label: 'Informes', icon: ChartBarIcon },
        ],
    },
    // Herramientas IA depende del backend Python (services/anonimizador.py) --
    // sin equivalente en escritorio (Tauri/Rust), mismo criterio ya aplicado a
    // la importación de horario en PDF (ImportScheduleModal.tsx::PDF_IMPORT_AVAILABLE).
    ...(isTauri() ? [] : [{
        label: 'Herramientas',
        items: [
            { view: 'ai-tools' as View, label: 'Herramientas IA', icon: SparklesIcon },
        ],
    }]),
];

// Un toque de color por sección (pedido explícito del profesor, mockup con
// captura de referencia) -- deliberadamente NO son las 5 claves de
// PALETTE (pensadas para cabeceras/acentos de página, ya usadas con otro
// significado en la propia app): aquí hacen falta 4 tonos bien
// diferenciados solo para esta fila de etiqueta, así que van sueltos.
const SECTION_COLOR: Record<string, string> = {
    'Enseñanza': '#0d9488',
    'Evaluación': '#e11d48',
    'Comunicación': '#d97706',
    'Herramientas': '#ea580c',
};

// Un mismo item del sidebar puede corresponder a varias "View" internas
// (p.ej. "Informes" engloba criteria/competences/key-competences/descriptors,
// que ya tienen su propia sub-tab-bar dentro de App.tsx). Se resalta activo
// si activeView cae en ese grupo.
const REPORT_VIEWS: View[] = ['criteria', 'competences', 'key-competences', 'descriptors'];

const isActive = (item: NavItem, activeView: View): boolean => {
    if (item.view === 'criteria') return REPORT_VIEWS.includes(activeView);
    return item.view === activeView;
};

// text-left es necesario a partir de aquí: el <button> del navegador
// centra su texto por defecto, algo invisible mientras la etiqueta cabe en
// una sola línea, pero que se nota en cuanto una etiqueta larga
// ("Instrumentos Evaluación") salta a dos líneas dentro del ancho fijo del
// Sidebar (w-56) -- sin esto, cada línea queda centrada en vez de alineada
// con el icono.
const navButtonClass = (active: boolean) =>
    `w-full flex items-center gap-2 px-2.5 py-1 rounded-lg text-sm font-medium text-left transition-colors leading-tight ${
        active ? 'font-semibold' : 'text-slate-600 hover:bg-slate-100'
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
        <div className="px-3 py-2 border-b border-slate-200 flex flex-col items-center gap-0 flex-shrink-0">
            <img src="/logo.png" alt="" className="w-24 h-24 flex-shrink-0 object-contain" />
            <div className="text-center -mt-1">
                <p className="lowercase leading-none" style={{ fontFamily: '"Baloo 2", sans-serif', fontWeight: 700, fontSize: '26px', color: '#2f5c99' }}>faro</p>
                <p className="lowercase leading-none mt-0.5" style={{ fontFamily: '"Baloo 2", sans-serif', fontWeight: 600, fontSize: '16px', color: '#5b8fd1' }}>docente</p>
                <p className="text-[10px] text-slate-400 leading-tight mt-1">La Marejada</p>
            </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {NAV_SECTIONS.map((section, i) => {
                const items = section.items.map(item => {
                    const Icon = item.icon;
                    const active = isActive(item, activeView);
                    return (
                        <button
                            key={item.view}
                            onClick={() => onNavigate(item.view)}
                            className={navButtonClass(active)}
                            style={active ? { backgroundColor: SEMANTIC.primary.soft, color: SEMANTIC.primary.softText } : undefined}
                        >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            {item.label}
                        </button>
                    );
                });

                // Sin etiqueta (Hoy/Horario/Agenda) no tiene sentido plegarla --
                // es la primera sección, siempre visible, no un grupo temático.
                if (!section.label) {
                    return <div key={`sec-${i}`} className="space-y-0.5">{items}</div>;
                }

                const color = SECTION_COLOR[section.label];
                return (
                    <details key={section.label} open className="group">
                        <summary
                            className="flex items-center gap-1.5 px-2.5 pt-0.5 pb-0.5 text-[11px] font-bold uppercase tracking-wide cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"
                            style={{ color }}
                        >
                            <ChevronDownIcon className="w-3 h-3 flex-shrink-0 opacity-60 transition-transform group-open:rotate-0 -rotate-90" />
                            {section.label}
                            <span className="flex-1 h-px ml-1" style={{ background: `linear-gradient(to right, ${color}80, transparent)` }} />
                        </summary>
                        <div className="space-y-0.5">{items}</div>
                    </details>
                );
            })}

            <div className="pt-1.5 border-t border-slate-200">
                <button
                    onClick={onOpenFavoritos}
                    className="w-full flex items-center gap-2 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700 transition-colors"
                >
                    <StarIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span className="flex-grow text-left">Favoritos</span>
                    <ChevronRightIcon className="w-4 h-4 text-slate-400" />
                </button>
            </div>
        </nav>
        <div className="px-4 py-2 border-t border-slate-200 flex-shrink-0 flex items-center justify-center gap-1.5">
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
                <span className="font-bold text-slate-800">Faro Docente</span>
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
