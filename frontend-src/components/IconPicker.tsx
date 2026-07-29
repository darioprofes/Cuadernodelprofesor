import React from 'react';
import { fileToDataUrl } from '../utils';

export interface IconPickerOption {
    key: string;
    label: string;
    render: (className: string) => React.ReactNode;
}

// Selector de icono genérico (vista previa + subir imagen propia + grid de
// opciones empaquetadas), antes reimplementado por separado en ClassModal y
// ShortcutModal con tamaños de botón ligeramente distintos por no compartir
// componente. `value` es la clave de una opción empaquetada, o un data URL
// (subida propia) si empieza por "data:".
const IconPicker: React.FC<{
    value?: string;
    onChange: (value: string | undefined) => void;
    options: IconPickerOption[];
    fallbackPreview?: React.ReactNode;
    uploadLabel?: string;
}> = ({ value, onChange, options, fallbackPreview, uploadLabel = 'Subir imagen propia' }) => {
    const isCustomImage = value?.startsWith('data:');
    const selectedOption = !isCustomImage ? options.find(o => o.key === value) : undefined;

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        onChange(await fileToDataUrl(file));
    };

    return (
        <div>
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0 bg-white">
                    {isCustomImage ? (
                        <img src={value} alt="" className="w-full h-full object-cover" />
                    ) : selectedOption ? (
                        selectedOption.render('w-5 h-5 text-slate-600')
                    ) : (
                        fallbackPreview ?? <span className="text-slate-300 text-xs">?</span>
                    )}
                </div>
                <label className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">
                    {uploadLabel}
                    <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                </label>
                {value && (
                    <button type="button" onClick={() => onChange(undefined)} className="text-xs text-red-500 hover:text-red-600">
                        Quitar
                    </button>
                )}
            </div>
            <div className="flex flex-wrap gap-2">
                {options.map(opt => (
                    <button
                        key={opt.key}
                        type="button"
                        onClick={() => onChange(opt.key)}
                        title={opt.label}
                        className={`w-9 h-9 flex-shrink-0 rounded-lg border flex items-center justify-center bg-white hover:bg-slate-50 ${value === opt.key ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200'}`}
                    >
                        {opt.render('w-4 h-4 text-slate-600')}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default IconPicker;
