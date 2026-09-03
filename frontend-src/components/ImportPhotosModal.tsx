import React, { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Modal from './Modal';
import Button from './Button';
import { ArrowUpTrayIcon, ArrowDownTrayIcon } from './Icons';
import { checkboxClassName } from '../theme/components/Input';
import { syncStudentPhoto } from '../services/apiAdapters';

interface FotoDetectada {
    codigo: string;
    imagenBase64: string;
    studentId: string | null;
    nombreCompleto: string | null;
    yaTieneFoto: boolean;
}

interface ImportPhotosModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const downloadBase64 = (base64: string, filename: string) => {
    const a = document.createElement('a');
    a.href = `data:image/jpeg;base64,${base64}`;
    a.download = filename;
    a.click();
};

// Importa las fotos de un PDF tipo "Fotografías del alumnado por unidad"
// (Educastur): el backend recorta cada foto y la empareja por NIE contra
// el alumnado ya dado de alta (services/fotos_pdf.py), sin subir nada por
// su cuenta -- aquí se revisa y se elige, foto a foto o por categoría
// entera, antes de aplicar. Solo web: depende de poppler/pdf2image en el
// backend Python, sin equivalente en escritorio (mismo motivo que excluye
// la importación de horario en PDF de Tauri).
const ImportPhotosModal: React.FC<ImportPhotosModalProps> = ({ isOpen, onClose }) => {
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<FotoDetectada[]>([]);
    const [sinCodigo, setSinCodigo] = useState(0);
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [applying, setApplying] = useState(false);
    const [resultado, setResultado] = useState<{ ok: number; error: number } | null>(null);

    const reset = () => {
        setItems([]);
        setSinCodigo(0);
        setSelected({});
        setError(null);
        setResultado(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        reset();
        setLoading(true);

        try {
            const formData = new FormData();
            formData.append('archivo', file);
            const response = await fetch('/api/photos/importar-pdf', { method: 'POST', body: formData });

            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.detail || `El servidor respondió con un error (HTTP ${response.status}).`);
            }

            const data = await response.json();
            const nuevosItems: FotoDetectada[] = (data.items || []).map((it: any) => ({
                codigo: it.codigo,
                imagenBase64: it.imagen_base64,
                studentId: it.student_id,
                nombreCompleto: it.nombre_completo,
                yaTieneFoto: it.ya_tiene_foto,
            }));
            setItems(nuevosItems);
            setSinCodigo(data.sin_codigo || 0);
            // Por defecto solo se marcan las coincidencias sin foto previa --
            // sobrescribir una foto ya existente o quedarse con fotos sin
            // alumno encontrado es una decisión que debe tomar el profesor.
            const seleccionInicial: Record<string, boolean> = {};
            for (const it of nuevosItems) {
                if (it.studentId && !it.yaTieneFoto) seleccionInicial[it.codigo] = true;
            }
            setSelected(seleccionInicial);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se ha podido procesar el PDF.');
        } finally {
            setLoading(false);
        }
    };

    const { conMatch, conFotoPrevia, sinMatch } = useMemo(() => {
        const conMatch = items.filter(it => it.studentId && !it.yaTieneFoto);
        const conFotoPrevia = items.filter(it => it.studentId && it.yaTieneFoto);
        const sinMatch = items.filter(it => !it.studentId);
        return { conMatch, conFotoPrevia, sinMatch };
    }, [items]);

    const setCategorySelection = (categoria: FotoDetectada[], value: boolean) => {
        setSelected(prev => {
            const next = { ...prev };
            for (const it of categoria) next[it.codigo] = value;
            return next;
        });
    };

    const totalSeleccionadasParaAplicar = items.filter(it => it.studentId && selected[it.codigo]).length;
    const totalSeleccionadasParaDescargar = sinMatch.filter(it => selected[it.codigo]).length;

    const handleAplicar = async () => {
        const aplicar = items.filter(it => it.studentId && selected[it.codigo]);
        if (aplicar.length === 0) return;

        setApplying(true);
        let ok = 0;
        let errores = 0;
        for (const it of aplicar) {
            try {
                await syncStudentPhoto(it.studentId as string, `data:image/jpeg;base64,${it.imagenBase64}`);
                ok++;
            } catch {
                errores++;
            }
        }
        queryClient.invalidateQueries({ queryKey: ['students'] });
        setApplying(false);
        setResultado({ ok, error: errores });
        // Se quitan de la lista las que ya se aplicaron correctamente, para
        // poder revisar el resto (fotos sin alumno, o alguna con error) sin
        // tener que volver a subir el PDF entero.
        setItems(prev => prev.filter(it => !(it.studentId && selected[it.codigo])));
    };

    const handleDescargarSinMatch = () => {
        const descargar = sinMatch.filter(it => selected[it.codigo]);
        for (const it of descargar) downloadBase64(it.imagenBase64, `${it.codigo}.jpg`);
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Importar fotos desde PDF" size="xl">
            <div className="space-y-4">
                <p className="text-sm text-slate-500">
                    Sube el PDF de "Fotografías del alumnado por unidad" (Educastur). Se recorta cada foto y se
                    empareja con el alumnado ya dado de alta por su NIE — nada se guarda hasta que lo confirmes.
                </p>

                <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                    <ArrowUpTrayIcon className="w-4 h-4 mr-1.5 inline" />
                    {loading ? 'Procesando PDF...' : 'Elegir PDF'}
                </Button>

                {error && <p className="text-sm text-red-600">{error}</p>}

                {resultado && (
                    <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        Aplicadas {resultado.ok} fotos{resultado.error > 0 && `, ${resultado.error} con error`}.
                    </p>
                )}

                {items.length > 0 && (
                    <div className="space-y-5 max-h-[55vh] overflow-y-auto pr-1">
                        <Categoria
                            titulo="Coincidencia encontrada"
                            items={conMatch}
                            selected={selected}
                            onToggleItem={codigo => setSelected(prev => ({ ...prev, [codigo]: !prev[codigo] }))}
                            onSelectAll={v => setCategorySelection(conMatch, v)}
                        />
                        <Categoria
                            titulo="Coincidencia encontrada — el alumno ya tiene foto"
                            subtitulo="Se sobrescribirá la foto actual de los que marques."
                            items={conFotoPrevia}
                            selected={selected}
                            onToggleItem={codigo => setSelected(prev => ({ ...prev, [codigo]: !prev[codigo] }))}
                            onSelectAll={v => setCategorySelection(conFotoPrevia, v)}
                        />
                        <Categoria
                            titulo="Sin alumno con ese NIE en la base de datos"
                            subtitulo="No se pueden aplicar — puedes descargarlas para revisarlas a mano."
                            items={sinMatch}
                            selected={selected}
                            onToggleItem={codigo => setSelected(prev => ({ ...prev, [codigo]: !prev[codigo] }))}
                            onSelectAll={v => setCategorySelection(sinMatch, v)}
                        />
                        {sinCodigo > 0 && (
                            <p className="text-xs text-amber-600">
                                {sinCodigo} foto{sinCodigo !== 1 ? 's' : ''} del PDF sin código legible debajo — no se han podido emparejar.
                            </p>
                        )}
                    </div>
                )}

                {items.length > 0 && (
                    <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                        <Button
                            variant="secondary"
                            onClick={handleDescargarSinMatch}
                            disabled={totalSeleccionadasParaDescargar === 0}
                        >
                            <ArrowDownTrayIcon className="w-4 h-4 mr-1.5 inline" />
                            Descargar {totalSeleccionadasParaDescargar || ''} sin alumno
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleAplicar}
                            disabled={applying || totalSeleccionadasParaAplicar === 0}
                        >
                            {applying ? 'Aplicando...' : `Aplicar ${totalSeleccionadasParaAplicar} foto${totalSeleccionadasParaAplicar !== 1 ? 's' : ''}`}
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    );
};

const Categoria: React.FC<{
    titulo: string;
    subtitulo?: string;
    items: FotoDetectada[];
    selected: Record<string, boolean>;
    onToggleItem: (codigo: string) => void;
    onSelectAll: (value: boolean) => void;
}> = ({ titulo, subtitulo, items, selected, onToggleItem, onSelectAll }) => {
    if (items.length === 0) return null;
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{titulo} ({items.length})</p>
                    {subtitulo && <p className="text-xs text-slate-400">{subtitulo}</p>}
                </div>
                <div className="flex gap-2 text-xs">
                    <button type="button" className="text-blue-600 hover:underline" onClick={() => onSelectAll(true)}>Todos</button>
                    <button type="button" className="text-slate-500 hover:underline" onClick={() => onSelectAll(false)}>Ninguno</button>
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                {items.map(it => (
                    <label key={it.codigo} className="flex items-center gap-2 text-xs bg-white rounded-md border border-slate-200 p-1.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!selected[it.codigo]}
                            onChange={() => onToggleItem(it.codigo)}
                            className={`${checkboxClassName} flex-shrink-0`}
                        />
                        <img src={`data:image/jpeg;base64,${it.imagenBase64}`} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        <span className="min-w-0 truncate">
                            {it.nombreCompleto || <span className="font-mono text-slate-400">{it.codigo}</span>}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );
};

export default ImportPhotosModal;
