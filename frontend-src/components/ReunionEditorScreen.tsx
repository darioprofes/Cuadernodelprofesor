import React, { Suspense, useMemo, useState } from 'react';
import type { Meeting } from '../types';
import { ChevronLeftIcon, TrashIcon } from './Icons';
import { TIPO_REUNION_LABEL as TIPO_LABEL } from '../utils';
import { PAGE_ACCENT } from '../theme/palette';
import { pageHeaderMinHeight, pageHeaderPaddingClassName } from '../theme/components/PageHeader';
import { headerPatternStyle } from '../theme/headerPattern';
import IconButton from './IconButton';
import Tabs, { type TabItem } from './Tabs';

// BlockNote pesa ~280 KB gzip (ver RichTextEditor.tsx) -- cargado bajo
// demanda igual que antes en ReunionesView.tsx, reubicado aquí porque
// esta pantalla es ahora quien lo usa de verdad (Notas y Seguimiento).
const RichTextEditor = React.lazy(() => import('./RichTextEditor'));
// Trae consigo el flujo de Anonimizador + IA (más pesado aún) -- cargado
// bajo demanda igual que RichTextEditor, solo cuando se abre la pestaña
// Acta.
const ActaReunionTab = React.lazy(() => import('./ActaReunionTab'));

const RICH_TEXT_FALLBACK = <div className="min-h-[50vh] animate-pulse bg-slate-50 rounded-lg" />;

type TabId = 'notas' | 'acta' | 'seguimiento';

const TIPOS: Meeting['tipo'][] = ['tutoria', 'r_tutores', 'departamento', 'familia', 'otras'];

// Cuenta líneas de checklist Markdown ("- [ ] ..." / "- [x] ...") sin
// parsear el documento entero -- solo para el indicador (N) de la pestaña
// Seguimiento, igual que ACUERDOS (N)/SEGUIMIENTO (N) del diseño original.
const _PATRON_CHECKLIST = /^[-*]\s\[[ xX]\]/gm;
const contarPendientes = (markdown: string): number => (markdown.match(_PATRON_CHECKLIST) || []).length;

interface ReunionEditorScreenProps {
    onClose: () => void;
    // Ausente al crear una reunión nueva -- no hay nada que borrar todavía.
    onDelete?: () => void;
    fecha: string;
    onFechaChange: (value: string) => void;
    hora: string;
    onHoraChange: (value: string) => void;
    tipo: Meeting['tipo'];
    onTipoChange: (value: Meeting['tipo']) => void;
    conQuien: string;
    onConQuienChange: (value: string) => void;
    motivo: string;
    onMotivoChange: (value: string) => void;
    // "Acuerdos" en la base de datos -- aquí se presenta como Notas (ver
    // conversación sobre el rediseño: es donde ya vive de facto todo lo
    // hablado y acordado en una reunión real, no tiene sentido un campo
    // "Acuerdos" aparte sin estructura propia).
    acuerdos: string;
    onAcuerdosChange: (value: string) => void;
    seguimiento: string;
    onSeguimientoChange: (value: string) => void;
    acta: string;
    onActaChange: (value: string) => void;
}

// Pantalla de creación/edición de una reunión, pensada para sentirse como
// una libreta en la que se empieza a escribir de inmediato, no como un
// formulario administrativo (rediseño pedido explícitamente, conversación
// 2026-09-07): cabecera con título editable + pestañas Notas/Información/
// Seguimiento, en vez de mostrar todos los campos a la vez.
//
// A diferencia del primer intento (retirado tras feedback directo: "parece
// que te has ido de la aplicación"), esto NO es una superposición a
// pantalla completa -- vive dentro del <main> de siempre, con la cabecera
// de color de PageHeader (mismo PAGE_ACCENT.reuniones que la propia lista)
// y tarjetas blancas redondeadas, igual que el resto de la app. El
// sidebar y la barra superior nunca desaparecen.
//
// Deliberadamente SIN cambio de modelo de datos para Notas/Información/
// Seguimiento (decisión explícita del profesor en el rediseño original): no
// hay campos nuevos de estructura (lugar, duración, participantes
// estructurados) ni listas estructuradas de acuerdos/seguimiento con
// responsable+fecha+estado -- Seguimiento reutiliza el mismo editor de
// Notas, que ya trae de serie bloques de lista de tareas (checkbox), así
// que el profesor puede marcar pendientes/hechas sin ningún campo nuevo.
// "Convertir en tarea de la Agenda" (mencionado en el diseño original) queda
// fuera de esta primera versión. El campo `acta` (conversación 2026-09-07)
// SÍ es una excepción deliberada a "sin cambio de modelo": el acta
// redactada con IA es contenido nuevo, no una reorganización de lo que ya
// había, así que necesita su propia columna (ver ActaReunionTab.tsx).
const ReunionEditorScreen: React.FC<ReunionEditorScreenProps> = ({
    onClose, onDelete,
    fecha, onFechaChange, hora, onHoraChange, tipo, onTipoChange, conQuien, onConQuienChange, motivo, onMotivoChange,
    acuerdos, onAcuerdosChange, seguimiento, onSeguimientoChange, acta, onActaChange,
}) => {
    // Pestaña de arranque: si ya hay acta redactada, esa es la que
    // interesa ver primero (Notas ya ha cumplido su función); si no hay
    // acta todavía, Notas sigue siendo la de entrada por defecto. Se
    // calcula una sola vez al montar -- esta pantalla se desmonta y
    // vuelve a montar en cada apertura de reunión (ver isFormOpen en
    // ReunionesView.tsx), así que siempre parte del valor de `acta` real
    // de esa reunión concreta, no de una anterior.
    const [activeTab, setActiveTab] = useState<TabId>(() => (acta.trim() ? 'acta' : 'notas'));

    const pendientes = useMemo(() => contarPendientes(seguimiento), [seguimiento]);

    const tabItems: TabItem<TabId>[] = [
        { id: 'notas', label: 'Notas' },
        { id: 'acta', label: 'Acta' },
        { id: 'seguimiento', label: pendientes > 0 ? `Seguimiento (${pendientes})` : 'Seguimiento' },
    ];

    return (
        <div className="space-y-4">
            <div
                className={`rounded-xl ${pageHeaderPaddingClassName} ${pageHeaderMinHeight} flex items-start gap-3`}
                style={{ backgroundColor: PAGE_ACCENT.reuniones, ...headerPatternStyle }}
            >
                <IconButton
                    label="Volver a Reuniones"
                    onClick={onClose}
                    className="text-white/80 hover:text-white hover:bg-white/10 flex-shrink-0"
                >
                    <ChevronLeftIcon className="w-5 h-5" />
                </IconButton>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-white/70 uppercase tracking-wide">Reunión</p>
                    <input
                        type="text"
                        value={motivo}
                        onChange={e => onMotivoChange(e.target.value)}
                        placeholder="Título de la reunión"
                        className="block w-full text-xl font-bold text-white bg-transparent border-none outline-none focus:ring-0 p-0 placeholder-white/50 truncate"
                    />
                    {/* Fecha/hora/tipo editables aquí mismo, no solo en la pestaña
                        Información -- pedido explícito (conversación 2026-09-07).
                        [color-scheme:dark] hace que el icono del selector nativo de
                        fecha/hora y la flecha del <select> se vean en blanco, a
                        juego con el fondo de color en vez del negro por defecto. */}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-sm text-white/90">
                        <input
                            type="date"
                            value={fecha}
                            onChange={e => onFechaChange(e.target.value)}
                            className="bg-transparent border-none outline-none focus:ring-0 p-0 [color-scheme:dark] cursor-pointer"
                        />
                        <span className="text-white/50">·</span>
                        <input
                            type="time"
                            value={hora}
                            onChange={e => onHoraChange(e.target.value)}
                            className="bg-transparent border-none outline-none focus:ring-0 p-0 [color-scheme:dark] cursor-pointer"
                        />
                        <span className="text-white/50">·</span>
                        <select
                            value={tipo}
                            onChange={e => onTipoChange(e.target.value as Meeting['tipo'])}
                            className="bg-transparent border-none outline-none focus:ring-0 p-0 [color-scheme:dark] cursor-pointer"
                        >
                            {TIPOS.map(t => (
                                <option key={t} value={t} className="text-slate-800">{TIPO_LABEL[t]}</option>
                            ))}
                        </select>
                        <span className="text-white/50">·</span>
                        <input
                            type="text"
                            value={conQuien}
                            onChange={e => onConQuienChange(e.target.value)}
                            placeholder="Con quién (familia de..., claustro...)"
                            className="bg-transparent border-none outline-none focus:ring-0 p-0 placeholder-white/50 flex-1 min-w-[8rem]"
                        />
                    </div>
                </div>
                {onDelete && (
                    <IconButton
                        label="Eliminar reunión"
                        onClick={onDelete}
                        className="text-white/80 hover:text-white hover:bg-white/10 flex-shrink-0"
                    >
                        <TrashIcon className="w-5 h-5" />
                    </IconButton>
                )}
            </div>

            {/* max-height + overflow-y-auto AQUÍ (no en RichTextEditor) a
                propósito: es el <main> de la app entera el que hace scroll de
                página, no un contenedor interno -- así que la barra fija
                (position: sticky) del editor no tenía a qué pegarse (ver
                RichTextEditor.tsx) y se iba con el resto al bajar. Acotando la
                altura de esta tarjeta y dándole su propio scroll, la barra sí
                encuentra un contenedor real que se desplaza y se queda fija de
                verdad. Las pestañas quedan fuera de esa zona con scroll propio
                (flex-shrink-0), siempre a la vista. */}
            <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                <Tabs className="max-w-md mb-4 flex-shrink-0" activeId={activeTab} onChange={setActiveTab} items={tabItems} accentColor={PAGE_ACCENT.reuniones} />

                <div className="flex-1 min-h-0 overflow-y-auto">
                    {activeTab === 'notas' && (
                        <Suspense fallback={RICH_TEXT_FALLBACK}>
                            <RichTextEditor
                                bare
                                autoFocus
                                initialMarkdown={acuerdos}
                                onChangeMarkdown={onAcuerdosChange}
                                placeholder="Escribe aquí tus notas..."
                                className="min-h-full"
                            />
                        </Suspense>
                    )}

                    {activeTab === 'acta' && (
                        <Suspense fallback={RICH_TEXT_FALLBACK}>
                            <ActaReunionTab
                                notasMarkdown={acuerdos}
                                tipo={tipo}
                                acta={acta}
                                onActaChange={onActaChange}
                            />
                        </Suspense>
                    )}

                    {activeTab === 'seguimiento' && (
                        <Suspense fallback={RICH_TEXT_FALLBACK}>
                            <RichTextEditor
                                bare
                                initialMarkdown={seguimiento}
                                onChangeMarkdown={onSeguimientoChange}
                                placeholder="Escribe '/' para insertar una lista de tareas y marcar lo pendiente..."
                                className="min-h-full"
                            />
                        </Suspense>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReunionEditorScreen;
