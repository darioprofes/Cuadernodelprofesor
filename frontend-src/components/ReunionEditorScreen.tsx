import React, { Suspense, useMemo, useState } from 'react';
import type { Meeting } from '../types';
import { ChevronLeftIcon, TrashIcon } from './Icons';
import { formatFechaEs, TIPO_REUNION_LABEL as TIPO_LABEL } from '../utils';
import { PAGE_ACCENT } from '../theme/palette';
import { pageHeaderMinHeight, pageHeaderPaddingClassName } from '../theme/components/PageHeader';
import { headerPatternStyle } from '../theme/headerPattern';
import Input from './Input';
import IconButton from './IconButton';
import Tabs, { type TabItem } from './Tabs';

// BlockNote pesa ~280 KB gzip (ver RichTextEditor.tsx) -- cargado bajo
// demanda igual que antes en ReunionesView.tsx, reubicado aquí porque
// esta pantalla es ahora quien lo usa de verdad (Notas y Seguimiento).
const RichTextEditor = React.lazy(() => import('./RichTextEditor'));

const RICH_TEXT_FALLBACK = <div className="min-h-[50vh] animate-pulse bg-slate-50 rounded-lg" />;

type TabId = 'notas' | 'informacion' | 'seguimiento';

const TIPOS: Meeting['tipo'][] = ['tutoria', 'r_tutores', 'departamento', 'familia', 'otras'];

// Mismos colores que la fila de la lista (ReunionesView.tsx) para el pill
// del tipo en la pestaña Información -- si se toca uno, tocar el otro.
const TIPO_COLOR: Record<Meeting['tipo'], string> = {
    tutoria: 'bg-blue-100 text-blue-700',
    r_tutores: 'bg-amber-100 text-amber-700',
    departamento: 'bg-purple-100 text-purple-700',
    familia: 'bg-teal-100 text-teal-700',
    otras: 'bg-slate-100 text-slate-700',
};

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
// Deliberadamente SIN cambio de modelo de datos (decisión explícita del
// profesor): no hay campos nuevos (título propio, lugar, duración,
// participantes estructurados) ni listas estructuradas de acuerdos/
// seguimiento con responsable+fecha+estado -- Seguimiento reutiliza el
// mismo editor BlockNote de Notas, que ya trae de serie bloques de lista
// de tareas (checkbox), así que el profesor puede marcar pendientes/hechas
// sin ningún campo nuevo. "Convertir en tarea de la Agenda" (mencionado en
// el diseño original) queda fuera de esta primera versión.
const ReunionEditorScreen: React.FC<ReunionEditorScreenProps> = ({
    onClose, onDelete,
    fecha, onFechaChange, hora, onHoraChange, tipo, onTipoChange, conQuien, onConQuienChange, motivo, onMotivoChange,
    acuerdos, onAcuerdosChange, seguimiento, onSeguimientoChange,
}) => {
    const [activeTab, setActiveTab] = useState<TabId>('notas');

    const pendientes = useMemo(() => contarPendientes(seguimiento), [seguimiento]);

    const tabItems: TabItem<TabId>[] = [
        { id: 'notas', label: 'Notas' },
        { id: 'informacion', label: 'Información' },
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
                    <p className="text-sm text-white/80 mt-0.5 truncate">
                        {formatFechaEs(fecha)}{hora && ` · ${hora}`} · {TIPO_LABEL[tipo]}{conQuien && ` · ${conQuien}`}
                    </p>
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

            <div className="bg-white rounded-xl shadow-sm border p-4">
                <Tabs className="max-w-md mb-4" activeId={activeTab} onChange={setActiveTab} items={tabItems} accentColor={PAGE_ACCENT.reuniones} />

                {activeTab === 'notas' && (
                    <Suspense fallback={RICH_TEXT_FALLBACK}>
                        <RichTextEditor
                            bare
                            autoFocus
                            initialMarkdown={acuerdos}
                            onChangeMarkdown={onAcuerdosChange}
                            placeholder="Escribe aquí tus notas..."
                            className="min-h-[50vh]"
                        />
                    </Suspense>
                )}

                {activeTab === 'informacion' && (
                    <div className="max-w-xl space-y-5">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Título</label>
                            <Input type="text" value={motivo} onChange={e => onMotivoChange(e.target.value)} placeholder="Título de la reunión" className="w-full" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Tipo</label>
                            <div className="flex flex-wrap gap-1.5">
                                {TIPOS.map(t => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => onTipoChange(t)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${tipo === t ? `${TIPO_COLOR[t]} border-transparent` : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        {TIPO_LABEL[t]}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Fecha</label>
                                <Input type="date" value={fecha} onChange={e => onFechaChange(e.target.value)} className="w-full" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Hora</label>
                                <Input type="time" value={hora} onChange={e => onHoraChange(e.target.value)} className="w-full" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Con quién</label>
                            <Input type="text" value={conQuien} onChange={e => onConQuienChange(e.target.value)} placeholder="Familia de..., Claustro, Equipo docente..." className="w-full" />
                        </div>
                    </div>
                )}

                {activeTab === 'seguimiento' && (
                    <Suspense fallback={RICH_TEXT_FALLBACK}>
                        <RichTextEditor
                            bare
                            initialMarkdown={seguimiento}
                            onChangeMarkdown={onSeguimientoChange}
                            placeholder="Escribe '/' para insertar una lista de tareas y marcar lo pendiente..."
                            className="min-h-[50vh]"
                        />
                    </Suspense>
                )}
            </div>
        </div>
    );
};

export default ReunionEditorScreen;
