
import type { AcademicConfiguration, Shortcut } from './types';
import { isTauri } from '@tauri-apps/api/core';

// Constants for ACNEAE tags and their priority order
export const ACNEAE_TAGS = ['RE ACA', 'RE EC', 'RE', 'PRE ES1', 'PRE ES2', 'PRE ES3', 'PRE ES4', 'PAC', 'PAC EP1', 'PAC EP2', 'PAC EP3', 'PAC EP4', 'PAC EP5', 'PAC EP6', 'ACS', 'FPEX', 'NN', 'ABS'];
export const ACNEAE_ORDER = { 'PAC': 1, 'PRE': 1, 'ABS': 1, 'RE ACA': 2, 'RE EC': 2, 'RE': 3, 'ACS': 1 };

// Semilla: los mismos accesos directos que ya había en la sección "Trabajo"
// del panel (La Marejada), para no empezar desde cero. El usuario puede
// añadir/editar/borrar libremente desde aquí en adelante.
export const INITIAL_SHORTCUTS: Shortcut[] = [
    { id: 'sc-teams', label: 'Teams', url: 'https://teams.microsoft.com', icon: '/shortcut-icons/teams.svg' },
    { id: 'sc-onedrive', label: 'OneDrive', url: 'https://educastur-my.sharepoint.com/my', icon: '/shortcut-icons/onedrive.svg' },
    { id: 'sc-outlook', label: 'Outlook', url: 'https://outlook.office.com', icon: '/shortcut-icons/outlook.svg' },
    { id: 'sc-nube', label: 'Mi nube', url: 'https://nube.lamarejada.es/', icon: '/shortcut-icons/nextcloud.svg' },
    { id: 'sc-notas', label: 'Notas', url: 'https://nube.lamarejada.es/apps/notes/welcome', icon: '/shortcut-icons/notas.svg' },
    { id: 'sc-faltas', label: 'Faltas', url: 'https://profesorado.asturias.es', icon: '/shortcut-icons/faltas.svg' },
    { id: 'sc-sauce', label: 'SAUCE', url: 'https://sauce.asturias.es', icon: '/shortcut-icons/sauce.svg' },
    { id: 'sc-educastur', label: 'Educastur', url: 'https://www.educastur.es', icon: '/shortcut-icons/educastur.svg' },
    { id: 'sc-copilot', label: 'Copilot', url: 'https://copilot.microsoft.com/', icon: '/shortcut-icons/copilot.svg' },
];

// La versión de escritorio es una copia local independiente, sin ningún
// vínculo con la infraestructura propia (nube.lamarejada.es) — no tiene
// sentido sembrarla con accesos directos a esa infraestructura personal.
export const getInitialShortcuts = (): Shortcut[] =>
    isTauri() ? INITIAL_SHORTCUTS.filter(s => !s.url.includes('lamarejada.es')) : INITIAL_SHORTCUTS;

// ACADEMIC CONFIGURATION
// Calcula el año de inicio del curso académico en el momento de cargar la app:
// julio-diciembre → el curso arranca ESE año; enero-junio → arrancó el año anterior.
const _ahora = new Date();
const _añoInicio = _ahora.getMonth() >= 6 ? _ahora.getFullYear() : _ahora.getFullYear() - 1;
const _y = String(_añoInicio);
const _ny = String(_añoInicio + 1);

export const INITIAL_ACADEMIC_CONFIGURATION: AcademicConfiguration = {
    academicYearStart: `${_y}-09-09`,
    academicYearEnd: `${_ny}-06-20`,
    holidays: [
        { id: 'h-1', name: 'Vacaciones de Navidad', startDate: `${_y}-12-23`, endDate: `${_ny}-01-07` },
        { id: 'h-2', name: 'Semana Santa', startDate: `${_ny}-04-14`, endDate: `${_ny}-04-21` },
    ],
    evaluationPeriods: [
        { id: 'ep-1', name: '1ª Evaluación', startDate: `${_y}-09-09`, endDate: `${_y}-12-20` },
        { id: 'ep-2', name: '2ª Evaluación', startDate: `${_ny}-01-08`, endDate: `${_ny}-03-28` },
        { id: 'ep-3', name: '3ª Evaluación', startDate: `${_ny}-03-31`, endDate: `${_ny}-06-20` },
    ],
    evaluationPeriodWeights: {
        'ep-1': 1,
        'ep-2': 1,
        'ep-3': 1,
    },
    layoutMode: 'tablet',
    periods: [
        '1ª Hora (8:00-8:55)',
        '2ª Hora (8:55-9:50)',
        'Recreo (9:50-10:20)',
        '3ª Hora (10:20-11:15)',
        '4ª Hora (11:15-12:10)',
        'Recreo (12:10-12:40)',
        '5ª Hora (12:40-13:35)',
        '6ª Hora (13:35-14:30)',
    ],
    defaultStartView: 'hoy',
    defaultCalendarView: 'month',
    gradeScale: [
        { min: 9, color: 'emerald', label: 'Sobresaliente' },
        { min: 7, color: 'lime', label: 'Notable' },
        { min: 6, color: 'yellow', label: 'Bien' },
        { min: 5, color: 'orange', label: 'Suficiente' },
        { min: 0, color: 'red', label: 'Insuficiente' },
    ],
};
