import React, { useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Textarea from './Textarea';
import { useApiStudents, useCreateStudent, useUpdateStudent } from '../hooks/useApiStudents';
import { useCurrentAcademicYear } from '../hooks/useAcademicYears';
import { parseSauceExcel, parseSauceText, matchSauceRow, type SauceRow, type SauceMatch } from '../services/sauceImport';

interface ImportSauceStudentsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Accion = 'crear' | 'actualizar' | 'omitir';

interface FilaRevision {
    fila: SauceRow;
    match: SauceMatch;
    accion: Accion;
}

// Crea/actualiza STUDENT (persona global) — no matricula en ninguna clase
// (matricular ya tiene su propio flujo, ExistingStudentPicker, que además
// usa el rastro que se deja aquí para filtrar por defecto al alumnado de
// este mismo curso académico, ver migración 0011). Cada persona importada
// se marca con el curso académico actual y su Curso/Unidad de SAUCE — ni
// uno ni otro matriculan por sí solos, un grupo-clase puede mezclar
// alumnado de varias Unidades.
const ImportSauceStudentsModal: React.FC<ImportSauceStudentsModalProps> = ({ isOpen, onClose }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [modo, setModo] = useState<'excel' | 'texto'>('excel');
    const [textoPegado, setTextoPegado] = useState('');
    const [cargando, setCargando] = useState(false);
    const [erroresParseo, setErroresParseo] = useState<string[]>([]);
    const [filas, setFilas] = useState<FilaRevision[] | null>(null);
    const [aplicando, setAplicando] = useState(false);
    const [resultado, setResultado] = useState<{ ok: number; error: { fila: SauceRow; motivo: string }[] } | null>(null);
    // Acción por defecto para las filas "posible duplicado por nombre" (sin
    // NIE que lo confirme). Por defecto "actualizar" — pedido explícito del
    // usuario: en su forma de trabajar, una coincidencia de nombre suele
    // ser la misma persona reimportada. Sigue siendo editable fila a fila,
    // y este selector cambia también las filas ya en pantalla, no solo las
    // futuras.
    const [defaultAccionNombre, setDefaultAccionNombre] = useState<Accion>('actualizar');

    const remoteStudents = useApiStudents();
    const currentYear = useCurrentAcademicYear();
    const yearId = currentYear.data?.id;
    const createStudentMutation = useCreateStudent();
    const updateStudentMutation = useUpdateStudent();

    const handleClose = () => {
        setTextoPegado('');
        setErroresParseo([]);
        setFilas(null);
        setResultado(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        onClose();
    };

    const construirRevision = (parseadas: SauceRow[]): FilaRevision[] => {
        const existentes = remoteStudents.data ?? [];
        return parseadas.map(fila => {
            const match = matchSauceRow(fila, existentes);
            // NIE (clave real) siempre fusiona directo. Sin NIE, se usa la
            // acción por defecto elegida arriba — editable fila a fila.
            const accion: Accion = match.kind === 'nie' ? 'actualizar' : match.kind === 'nombre' ? defaultAccionNombre : 'crear';
            return { fila, match, accion };
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCargando(true);
        setErroresParseo([]);
        setFilas(null);
        try {
            const buffer = await file.arrayBuffer();
            const result = await parseSauceExcel(buffer);
            setErroresParseo(result.errores);
            setFilas(construirRevision(result.filas));
        } catch (err) {
            setErroresParseo([err instanceof Error ? err.message : String(err)]);
        } finally {
            setCargando(false);
        }
    };

    const handleProcesarTexto = () => {
        const result = parseSauceText(textoPegado);
        setErroresParseo(result.errores);
        setFilas(construirRevision(result.filas));
    };

    const cambiarAccion = (index: number, accion: Accion) => {
        setFilas(prev => prev ? prev.map((f, i) => i === index ? { ...f, accion } : f) : prev);
    };

    // Cambia el criterio por defecto Y reaplica a las filas "por nombre" ya
    // en pantalla (no solo a las que se parseen después) — un ajuste hecho
    // arriba antes de revisar fila a fila no debería obligar a repetirlo en
    // cada una.
    const cambiarDefaultAccionNombre = (accion: Accion) => {
        setDefaultAccionNombre(accion);
        setFilas(prev => prev ? prev.map(f => f.match.kind === 'nombre' ? { ...f, accion } : f) : prev);
    };

    const hayCoincidenciasPorNombre = useMemo(() => (filas ?? []).some(f => f.match.kind === 'nombre'), [filas]);

    const resumen = useMemo(() => {
        if (!filas) return null;
        return {
            crear: filas.filter(f => f.accion === 'crear').length,
            actualizar: filas.filter(f => f.accion === 'actualizar').length,
            omitir: filas.filter(f => f.accion === 'omitir').length,
        };
    }, [filas]);

    const handleConfirmar = async () => {
        if (!filas) return;
        setAplicando(true);
        let ok = 0;
        const error: { fila: SauceRow; motivo: string }[] = [];

        for (const f of filas) {
            if (f.accion === 'omitir') continue;
            try {
                if (f.accion === 'crear') {
                    await createStudentMutation.mutateAsync({
                        nombre: f.fila.nombre,
                        primerApellido: f.fila.primerApellido,
                        segundoApellido: f.fila.segundoApellido || undefined,
                        nie: f.fila.nie || undefined,
                        dni: f.fila.dni || undefined,
                        fechaNacimiento: f.fila.fechaNacimiento || undefined,
                        nacionalidad: f.fila.nacionalidad || undefined,
                        importedAcademicYearId: yearId,
                        ultimoCursoSauce: f.fila.curso || undefined,
                        ultimaUnidadSauce: f.fila.unidad || undefined,
                    });
                } else if (f.match.student) {
                    await updateStudentMutation.mutateAsync({
                        id: f.match.student.id,
                        data: {
                            nombre: f.fila.nombre,
                            primerApellido: f.fila.primerApellido,
                            segundoApellido: f.fila.segundoApellido || undefined,
                            nie: f.fila.nie || undefined,
                            dni: f.fila.dni || undefined,
                            fechaNacimiento: f.fila.fechaNacimiento || undefined,
                            nacionalidad: f.fila.nacionalidad || undefined,
                            importedAcademicYearId: yearId,
                            ultimoCursoSauce: f.fila.curso || undefined,
                            ultimaUnidadSauce: f.fila.unidad || undefined,
                        },
                    });
                }
                ok += 1;
            } catch (err) {
                error.push({ fila: f.fila, motivo: err instanceof Error ? err.message : String(err) });
            }
        }

        setResultado({ ok, error });
        setAplicando(false);
    };

    const nombreCompleto = (f: SauceRow) => `${f.primerApellido} ${f.segundoApellido}, ${f.nombre}`.replace(/ ,/, ',');

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Importar alumnado de SAUCE" size="2xl">
            {resultado ? (
                <div className="space-y-3">
                    <p className="text-sm text-emerald-700 font-semibold">{resultado.ok} alumno/a(s) importado(s) correctamente.</p>
                    {resultado.error.length > 0 && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="font-semibold mb-1">{resultado.error.length} error(es):</p>
                            <ul className="list-disc list-inside space-y-0.5">
                                {resultado.error.map((e, i) => <li key={i}>{nombreCompleto(e.fila)}: {e.motivo}</li>)}
                            </ul>
                        </div>
                    )}
                    <div className="flex justify-end pt-2">
                        <Button type="button" variant="secondary" onClick={handleClose}>Cerrar</Button>
                    </div>
                </div>
            ) : filas ? (
                <div className="space-y-3">
                    {erroresParseo.length > 0 && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="font-semibold mb-1">{erroresParseo.length} fila(s) no se pudieron interpretar:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                                {erroresParseo.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                        </div>
                    )}
                    {resumen && (
                        <p className="text-xs text-slate-500">
                            {resumen.crear} nuevo(s), {resumen.actualizar} actualizará(n) un registro existente, {resumen.omitir} omitido(s).
                        </p>
                    )}
                    {hayCoincidenciasPorNombre && (
                        <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
                            <span className="text-amber-800">Para las posibles coincidencias por nombre (sin NIE que lo confirme):</span>
                            <select
                                value={defaultAccionNombre}
                                onChange={e => cambiarDefaultAccionNombre(e.target.value as Accion)}
                                className="text-xs border border-amber-300 rounded px-1 py-0.5 bg-white"
                            >
                                <option value="actualizar">Es la misma persona (actualizar)</option>
                                <option value="crear">Es distinta persona (crear)</option>
                                <option value="omitir">Omitir estas filas</option>
                            </select>
                        </div>
                    )}
                    <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 sticky top-0">
                                <tr>
                                    <th className="p-2 text-left">Alumno/a</th>
                                    <th className="p-2 text-left">NIE</th>
                                    <th className="p-2 text-left">Curso/Unidad</th>
                                    <th className="p-2 text-left">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filas.map((f, i) => (
                                    <tr key={i} className="border-t border-slate-100">
                                        <td className="p-2">{nombreCompleto(f.fila)}</td>
                                        <td className="p-2">{f.fila.nie ?? <span className="text-amber-600">sin NIE</span>}</td>
                                        <td className="p-2 text-slate-500">{[f.fila.curso, f.fila.unidad].filter(Boolean).join(' / ') || '—'}</td>
                                        <td className="p-2">
                                            {f.match.kind === 'nie' ? (
                                                <span className="text-blue-700">Actualiza por NIE a "{nombreCompleto2(f.match.student)}"</span>
                                            ) : f.match.kind === 'nombre' ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-amber-700">Posible duplicado de "{nombreCompleto2(f.match.student)}"</span>
                                                    <select
                                                        value={f.accion}
                                                        onChange={e => cambiarAccion(i, e.target.value as Accion)}
                                                        className="text-xs border border-slate-300 rounded px-1 py-0.5"
                                                    >
                                                        <option value="crear">Es distinta persona (crear)</option>
                                                        <option value="actualizar">Es la misma persona (actualizar)</option>
                                                        <option value="omitir">Omitir esta fila</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <span className="text-emerald-700">Nuevo</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                        <button type="button" onClick={() => { setFilas(null); setErroresParseo([]); }} className="text-xs text-slate-500 hover:text-slate-700">
                            ← Volver a empezar
                        </button>
                        <div className="flex gap-2">
                            <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
                            <Button type="button" variant="primary" onClick={handleConfirmar} disabled={aplicando || filas.length === 0}>
                                {aplicando ? 'Importando…' : `Importar ${filas.filter(f => f.accion !== 'omitir').length}`}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex gap-2 border-b border-slate-200">
                        <button
                            type="button"
                            onClick={() => setModo('excel')}
                            className={`px-3 py-2 text-sm font-medium border-b-2 ${modo === 'excel' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            Subir Excel de SAUCE
                        </button>
                        <button
                            type="button"
                            onClick={() => setModo('texto')}
                            className={`px-3 py-2 text-sm font-medium border-b-2 ${modo === 'texto' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            Pegar tabla
                        </button>
                    </div>

                    <p className="text-xs text-slate-500">
                        Columnas esperadas: Alumno/a, Nº Id. Escolar (NIE), DNI/Pasaporte, Fecha de nacimiento, Curso, Unidad, Nacionalidad.
                        El NIE es lo más importante: es el identificador único real de SAUCE (no todo el alumnado tiene DNI, pero sí NIE) —
                        con él, reimportar no duplica a nadie. Sin NIE, se compara por nombre y se avisa si hay una posible coincidencia.
                        {modo === 'texto' && ' Separa las columnas con "|" — no aparece nunca en nombres, fechas ni NIE, así que no hay ambigüedad al pegar o editar a mano (si pegas directo desde Excel con tabuladores reales, también funciona sin tocar nada).'}
                    </p>

                    {modo === 'excel' ? (
                        <div>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx" className="hidden" />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={cargando}
                                className="w-full text-center py-6 text-sm font-semibold text-blue-600 hover:bg-blue-50 bg-white rounded-lg border-2 border-dashed border-blue-300"
                            >
                                {cargando ? 'Leyendo…' : 'Seleccionar archivo .xlsx'}
                            </button>
                        </div>
                    ) : (
                        <div>
                            <Textarea
                                value={textoPegado}
                                onChange={e => setTextoPegado(e.target.value)}
                                placeholder={
                                    'Alumno/a | Nº Id. Escolar | Nº Expte. centro | DNI/Pasaporte | Fecha de nacimiento | Curso | Fecha de creación | Unidad | Nacionalidad\n' +
                                    'García López, Elena | 1234567 | 99 | 12345678A | 15/03/2012 | 1ESO | 01/09/2024 | A | Española'
                                }
                                className="min-h-[140px] font-mono text-xs"
                            />
                            <button
                                type="button"
                                onClick={handleProcesarTexto}
                                disabled={!textoPegado.trim()}
                                className="mt-2 bg-slate-100 text-slate-700 text-sm font-medium py-1.5 px-3 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Procesar tabla
                            </button>
                        </div>
                    )}

                    {erroresParseo.length > 0 && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                            {erroresParseo.map((e, i) => <p key={i}>{e}</p>)}
                        </div>
                    )}

                    <div className="flex justify-end pt-2 border-t">
                        <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

const nombreCompleto2 = (s: SauceMatch['student']): string =>
    s ? `${s.primerApellido || ''} ${s.segundoApellido || ''}, ${s.nombre || ''}`.replace(/ ,/, ',') : '';

export default ImportSauceStudentsModal;
