import React, { useState } from 'react';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { useQueryClient } from '@tanstack/react-query';
import type { AcademicConfiguration } from '../../types';
import { UserCircleIcon } from '../Icons';
import Input from '../Input';
import Button from '../Button';
import BufferedInput from '../BufferedInput';
import BufferedTextarea from '../BufferedTextarea';
import { preferencesQueryKey } from '../../hooks/usePreferences';

// Rasgos de estilo docente habituales -- se inyectan en el prompt de cada
// SA generada con IA (ver services/prompts/situacion_aprendizaje.py) para que
// escriba coherente con cómo enseña este profesor, no con un "eres un
// profesor" genérico. Se guardan una sola vez aquí y se reutilizan siempre,
// sin repreguntarse en cada wizard -- mismo patrón que
// CARACTERISTICAS_HABITUALES en ClassModal.tsx.
export const RASGOS_DOCENTE_HABITUALES = [
    'Cercano y motivador', 'Exigente y riguroso', 'Prioriza la práctica sobre la teoría',
    'Prioriza la teoría bien explicada', 'Fomenta la autonomía del alumnado',
    'Explica paso a paso, muy guiado', 'Con humor', 'Estructurado y metódico',
    'Flexible, se adapta sobre la marcha',
];

// Foto de perfil del profesor: en web, endpoint binario dedicado (GET/PUT/
// DELETE /preferences/photo), mismo patrón que las fotos de alumnado
// (routers/photos.py) pero sobre la fila única de preferencias -- fuera de
// api.ts (que es JSON puro) igual que syncStudentPhoto en apiAdapters.ts. En
// Tauri, mismo criterio que StudentPhotoAvatar.tsx: comandos dedicados
// (set_teacher_photo/delete_teacher_photo) para subir/borrar y el protocolo
// teacherphoto:// (ver lib.rs) para servirla a un <img>, sin id porque solo
// hay una.
const PersonalDataCard: React.FC<{
    academicConfiguration: AcademicConfiguration;
    setAcademicConfiguration: (updater: React.SetStateAction<AcademicConfiguration>) => void;
}> = ({ academicConfiguration, setAcademicConfiguration }) => {
    const [subiendoFoto, setSubiendoFoto] = useState(false);
    const [photoVersion, setPhotoVersion] = useState(0);
    const tienefoto = academicConfiguration.teacherHasPhoto ?? false;
    const queryClient = useQueryClient();

    // teacherHasPhoto es un campo calculado por el backend (teacher_photo IS
    // NOT NULL), no algo que setAcademicConfiguration pueda persistir -- el
    // callback de App.tsx solo manda a /preferences los campos que conoce
    // (gradeScale, teacherProfile...), así que un PATCH optimista con
    // teacherHasPhoto no hacía nada y la miniatura no se actualizaba hasta
    // que otra cosa disparaba un refetch de /preferences (p.ej. cerrar y
    // reabrir el modal). Invalidar la query aquí es lo que de verdad refleja
    // el cambio.
    const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setSubiendoFoto(true);
        try {
            if (isTauri()) {
                const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
                await invoke('set_teacher_photo', { bytes, contentType: file.type || 'application/octet-stream' });
            } else {
                await fetch('/api/preferences/photo', {
                    method: 'PUT',
                    body: file,
                    headers: { 'Content-Type': file.type || 'application/octet-stream' },
                });
            }
            await queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
            setPhotoVersion(v => v + 1);
        } finally {
            setSubiendoFoto(false);
        }
    };

    const handleQuitarFoto = async () => {
        if (isTauri()) {
            await invoke('delete_teacher_photo');
        } else {
            await fetch('/api/preferences/photo', { method: 'DELETE' });
        }
        await queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
        setPhotoVersion(v => v + 1);
    };

    return (
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
                <UserCircleIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <h4 className="font-semibold text-slate-700">Datos personales</h4>
            </div>
            <div className="flex items-center gap-4">
                {tienefoto ? (
                    <img
                        // http://teacherphoto.localhost/... , no teacherphoto://... : WebView2
                        // (Windows) exige esa forma para que un protocolo custom funcione como
                        // src de un <img> -- mismo criterio que studentPhotoUrl en apiAdapters.ts.
                        src={isTauri() ? `http://teacherphoto.localhost/1?v=${photoVersion}` : `/api/preferences/photo?v=${photoVersion}`}
                        alt=""
                        className="w-16 h-16 rounded-full object-cover border border-slate-200 flex-shrink-0"
                    />
                ) : (
                    <UserCircleIcon className="w-16 h-16 text-slate-300 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0 space-y-2">
                    <div>
                        <label htmlFor="teacher-name" className="block text-xs text-slate-500 mb-0.5">Nombre</label>
                        <BufferedInput
                            id="teacher-name"
                            type="text"
                            value={academicConfiguration.teacherName ?? ''}
                            onCommit={v => setAcademicConfiguration(prev => ({ ...prev, teacherName: v }))}
                            placeholder="Tu nombre"
                            className="w-full text-sm"
                        />
                    </div>
                    <label className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">
                        {subiendoFoto ? 'Subiendo…' : tienefoto ? 'Cambiar foto' : 'Subir foto'}
                        <input type="file" accept="image/*" onChange={handleFotoChange} className="hidden" disabled={subiendoFoto} />
                    </label>
                    {tienefoto && (
                        <button type="button" onClick={handleQuitarFoto} className="ml-2 text-xs text-red-500 hover:text-red-600">
                            Quitar foto
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// Independiente de "Configuración del Curso Académico" a propósito: cómo
// enseña el profesor no cambia de un curso académico a otro (vive en
// app_preferences, no en academic_years), así que antes de esta extracción
// vivía anidado dentro de esa sección dando la falsa impresión de ser un
// ajuste "de este curso" -- pedido explícito del usuario para sacarlo de ahí.
const TeacherProfileManager: React.FC<{
    academicConfiguration: AcademicConfiguration;
    setAcademicConfiguration: (updater: React.SetStateAction<AcademicConfiguration>) => void;
}> = ({ academicConfiguration, setAcademicConfiguration }) => {
    const [nuevoRasgoDocente, setNuevoRasgoDocente] = useState('');
    const teacherProfile = Array.isArray(academicConfiguration.teacherProfile) ? academicConfiguration.teacherProfile : [];

    const toggleRasgoDocente = (rasgo: string) => {
        const nuevos = teacherProfile.includes(rasgo)
            ? teacherProfile.filter(r => r !== rasgo)
            : [...teacherProfile, rasgo];
        setAcademicConfiguration(prev => ({ ...prev, teacherProfile: nuevos }));
    };

    const anadirRasgoDocenteLibre = () => {
        const rasgo = nuevoRasgoDocente.trim();
        if (!rasgo || teacherProfile.includes(rasgo)) return;
        setAcademicConfiguration(prev => ({ ...prev, teacherProfile: [...teacherProfile, rasgo] }));
        setNuevoRasgoDocente('');
    };

    return (
        <div className="space-y-4">
            {!isTauri() && (
                <PersonalDataCard academicConfiguration={academicConfiguration} setAcademicConfiguration={setAcademicConfiguration} />
            )}

            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center gap-2">
                    <UserCircleIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    <label className="block text-sm font-semibold text-slate-700">Tu perfil como docente</label>
                </div>
                <p className="text-xs text-slate-500">
                    Se guarda una sola vez aquí y se reutiliza en todas las Situaciones de Aprendizaje que generes con
                    IA, para que el resultado encaje con cómo enseñas -- no hace falta repetirlo cada vez.
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {RASGOS_DOCENTE_HABITUALES.map(rasgo => (
                        <button
                            key={rasgo}
                            type="button"
                            onClick={() => toggleRasgoDocente(rasgo)}
                            className={`text-xs font-medium px-2 py-1 rounded-full border transition-colors ${
                                teacherProfile.includes(rasgo)
                                    ? 'bg-slate-700 text-white border-slate-700'
                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                            }`}
                        >
                            {rasgo}
                        </button>
                    ))}
                </div>
                {teacherProfile.filter(r => !RASGOS_DOCENTE_HABITUALES.includes(r)).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {teacherProfile.filter(r => !RASGOS_DOCENTE_HABITUALES.includes(r)).map(rasgo => (
                            <span key={rasgo} className="text-xs font-medium px-2 py-1 rounded-full bg-slate-700 text-white inline-flex items-center gap-1">
                                {rasgo}
                                <button type="button" onClick={() => toggleRasgoDocente(rasgo)} className="hover:text-red-200" title="Quitar">&times;</button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="flex gap-1.5">
                    <Input
                        type="text"
                        value={nuevoRasgoDocente}
                        onChange={e => setNuevoRasgoDocente(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); anadirRasgoDocenteLibre(); } }}
                        placeholder="Otro rasgo..."
                    />
                    <Button type="button" variant="secondary" onClick={anadirRasgoDocenteLibre}>Añadir</Button>
                </div>

                <div className="pt-2 border-t border-slate-100">
                    <label htmlFor="teacher-notes" className="block text-sm font-medium text-slate-700 mb-1">
                        Cómo te gusta el material que genera la IA
                    </label>
                    <p className="text-xs text-slate-500 mb-1.5">
                        Formato, extensión, tono, tipo de ejemplos... cualquier preferencia que quieras que la IA tenga en cuenta al generar contenido.
                    </p>
                    <BufferedTextarea
                        id="teacher-notes"
                        value={academicConfiguration.teacherNotes ?? ''}
                        onCommit={v => setAcademicConfiguration(prev => ({ ...prev, teacherNotes: v }))}
                        rows={3}
                        className="w-full text-sm"
                        placeholder="Ej: actividades cortas y variadas, con ejemplos cercanos al día a día del alumnado y sin párrafos largos de texto."
                    />
                </div>
            </div>
        </div>
    );
};

export default TeacherProfileManager;
