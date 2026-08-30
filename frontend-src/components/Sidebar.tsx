import React, { useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { View } from '../types';
import {
    HomeIcon, ClockIcon, CalendarDaysIcon, BookOpenIcon, ClipboardDocumentIcon,
    UsersIcon, ClipboardDocumentCheckIcon, ChartBarIcon, SparklesIcon,
    StarIcon, ChevronRightIcon, ChevronDownIcon, Bars3Icon, XMarkIcon, ListBulletIcon, BeakerIcon,
    TableCellsIcon, AcademicCapIcon, MagnifyingGlassIcon,
} from './Icons';
import Logo from './Logo';
import { PALETTE, SEMANTIC, SIDEBAR_BG } from '../theme/palette';
import { openExternalLink } from '../utils';

interface NavItem {
    view: View;
    label: string;
    icon: React.FC<{ className?: string }>;
}

// Agrupado por frecuencia de uso y contexto, no por tipo de funcionalidad
// (petición explícita del usuario, 2026-08-30) -- p.ej. Tareas evaluables/
// Instrumentos Evaluación pasan a vivir junto a Planificación SA en
// "Enseñanza" en vez de en su propia sección "Evaluación", y Calendario/
// Agenda/Horario (antes sueltos sin etiqueta) ganan su propia sección
// "Organización".
interface NavSection {
    label: string;
    items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
    {
        label: 'Principal',
        items: [
            { view: 'hoy', label: 'Hoy', icon: HomeIcon },
            { view: 'gradebook', label: 'Cuaderno', icon: BookOpenIcon },
            { view: 'journal', label: 'Diario', icon: ClipboardDocumentIcon },
        ],
    },
    {
        label: 'Organización',
        items: [
            { view: 'annual-calendar', label: 'Calendario', icon: TableCellsIcon },
            { view: 'calendar', label: 'Agenda', icon: CalendarDaysIcon },
            { view: 'horario', label: 'Horario', icon: ClockIcon },
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
    // Depende del backend Python (services/anonimizador.py) -- sin
    // equivalente en escritorio (Tauri/Rust), mismo criterio ya aplicado a
    // la importación de horario en PDF (ImportScheduleModal.tsx::PDF_IMPORT_AVAILABLE).
    // "Anonimizador", no "Herramientas IA" genérico -- eso es lo que hay
    // hoy de verdad; cuando se añadan más generadores (ver hoja de ruta),
    // cada uno gana su propia entrada aquí en vez de esconderse todos
    // detrás de un nombre paraguas.
    ...(isTauri() ? [] : [{
        label: 'Herramientas',
        items: [
            { view: 'ai-tools' as View, label: 'Anonimizador', icon: SparklesIcon },
            { view: 'adaptar-material' as View, label: 'Adaptar material NEAE', icon: AcademicCapIcon },
            { view: 'deteccion-curricular' as View, label: 'Detección curricular', icon: MagnifyingGlassIcon },
        ],
    }]),
];

// Solo "Herramientas" arranca plegada -- pedido explícito (de momento
// tiene un único elemento, menos prioritaria que el resto de secciones
// para tenerla siempre a la vista).
const COLLAPSED_BY_DEFAULT = new Set(['Herramientas']);

// Un toque de color por sección -- ya no coincide 1:1 con PAGE_ACCENT
// (esas cabeceras de página siguen agrupadas por tipo de funcionalidad,
// p.ej. Tareas evaluables/Instrumentos Evaluación siguen en rojo aunque
// aquí vivan dentro de "Enseñanza"; el reagrupado de 2026-08-30 solo
// afecta a este menú). `base` de PALETTE para azul/amarillo/morado
// (curiosamente esas 3 claves de PALETTE ya son ese color); "Evaluación"
// quedó sin sección propia (fusionada en Enseñanza), así que su rojo
// (SEMANTIC.danger, la única familia sin clave propia en PALETTE) pasa a
// "Organización" -- verde (PALETTE.green) es la única familia de PALETTE
// que quedaba libre para "Principal".
const SECTION_COLOR: Record<string, string> = {
    'Principal': PALETTE.green.base,
    'Organización': SEMANTIC.danger.base,
    'Enseñanza': PALETTE.blue.base,
    'Comunicación': PALETTE.sand.base,
    'Herramientas': PALETTE.teal.base,
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
    `w-full flex items-center gap-2.5 pl-2 pr-2.5 py-1.5 rounded-lg text-sm font-medium text-left transition-colors leading-tight border-l-[3px] ${
        active ? 'text-white font-semibold' : 'text-white/70 border-transparent hover:bg-white/10 hover:text-white'
    }`;

interface SidebarProps {
    activeView: View;
    setActiveView: (view: View) => void;
    onOpenFavoritos: () => void;
    // Oculta la columna de escritorio (pedido explícito, "quiero poder
    // ocultar el menú lateral y la barra superior") -- no afecta a la
    // cabecera/panel de móvil, que ya se abre/cierra por su cuenta.
    hidden?: boolean;
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
        <div className="px-3 py-2 border-b border-white/10 flex flex-col items-center gap-0 flex-shrink-0">
            <img src="/logo.png" alt="" className="w-24 h-24 flex-shrink-0 object-contain drop-shadow-lg" />
            <div className="text-center -mt-1">
                <p className="lowercase leading-none" style={{ fontFamily: '"Baloo 2", sans-serif', fontWeight: 700, fontSize: '26px', color: '#ffffff' }}>faro</p>
                <p className="lowercase leading-none mt-0.5" style={{ fontFamily: '"Baloo 2", sans-serif', fontWeight: 600, fontSize: '16px', color: PALETTE.blue.base }}>docente</p>
            </div>
        </div>
        <nav className="flex-1 p-2 space-y-1.5">
            {NAV_SECTIONS.map(section => {
                const color = SECTION_COLOR[section.label];
                const items = section.items.map(item => {
                    const Icon = item.icon;
                    const active = isActive(item, activeView);
                    return (
                        <button
                            key={item.view}
                            onClick={() => onNavigate(item.view)}
                            className={navButtonClass(active)}
                            style={active ? { backgroundColor: 'rgba(255,255,255,0.1)', borderLeftColor: color } : undefined}
                        >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            {item.label}
                        </button>
                    );
                });

                return (
                    <details key={section.label} open={!COLLAPSED_BY_DEFAULT.has(section.label)} className="group">
                        <summary
                            className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wide cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"
                            style={{ color }}
                        >
                            <ChevronDownIcon className="w-3 h-3 flex-shrink-0 opacity-60 transition-transform group-open:rotate-0 -rotate-90" />
                            {section.label}
                            <span className="flex-1 h-px ml-1" style={{ background: `linear-gradient(to right, ${color}80, transparent)` }} />
                        </summary>
                        <div className="space-y-1">{items}</div>
                    </details>
                );
            })}

            <div className="pt-2 border-t border-white/10">
                <button
                    onClick={onOpenFavoritos}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-medium text-slate-200 transition-colors"
                >
                    <StarIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span className="flex-grow text-left">Favoritos</span>
                    <ChevronRightIcon className="w-4 h-4 text-white/40" />
                </button>
            </div>
        </nav>
        <div className="px-4 py-2 border-t border-white/10 flex-shrink-0 flex items-center justify-center gap-1.5">
            <Logo className="w-4 h-4 text-white/30 flex-shrink-0" />
            <a
                href="http://creativecommons.org/licenses/by-nc/4.0/"
                rel="license"
                target="_blank"
                onClick={(e) => openExternalLink(e, 'http://creativecommons.org/licenses/by-nc/4.0/')}
                className="text-[10px] font-semibold text-white/40 hover:text-white/70 transition-colors"
            >
                La Marejada · CC BY-NC
            </a>
        </div>
    </>
);

const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, onOpenFavoritos, hidden = false }) => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleNavigateDesktop = (view: View) => setActiveView(view);
    const handleNavigateMobile = (view: View) => {
        setActiveView(view);
        setMobileMenuOpen(false);
    };

    return (
        <>
            {/* Escritorio: columna fija lateral */}
            {!hidden && (
                <aside className="hidden md:flex flex-col w-56 flex-shrink-0 border-r border-white/10 sticky top-0 min-h-screen" style={{ backgroundColor: SIDEBAR_BG }}>
                    <SidebarContent activeView={activeView} onNavigate={handleNavigateDesktop} onOpenFavoritos={onOpenFavoritos} />
                </aside>
            )}

            {/* Móvil: barra superior con botón de menú (demasiadas secciones para una barra inferior) */}
            <header className="flex md:hidden items-center gap-2 px-4 py-3 border-b border-white/10 fixed top-0 left-0 right-0 z-30" style={{ backgroundColor: SIDEBAR_BG }}>
                <button onClick={() => setMobileMenuOpen(true)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10" title="Abrir menú">
                    <Bars3Icon className="w-6 h-6 text-white" />
                </button>
                <img src="/logo.png" alt="" className="w-7 h-7 rounded-lg flex-shrink-0 object-cover" />
                <span className="font-bold text-white">Faro Docente</span>
            </header>

            {mobileMenuOpen && (
                <div className="fixed inset-0 z-50 flex md:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
                    <div className="relative w-72 max-w-[85vw] h-full flex flex-col shadow-xl" style={{ backgroundColor: SIDEBAR_BG }}>
                        <button
                            onClick={() => setMobileMenuOpen(false)}
                            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/10 z-10"
                            title="Cerrar menú"
                        >
                            <XMarkIcon className="w-5 h-5 text-white/70" />
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
