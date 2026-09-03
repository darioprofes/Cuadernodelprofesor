import React from 'react';

// Sí/No sin forzar una respuesta: ambos botones empiezan sin marcar
// (equivalente a las casillas ☐ Sí ☐ No en blanco del papel) hasta que se
// elige una; se puede volver a dejar sin especificar pulsando la ya activa.
// onChange emite `null` (nunca `undefined`) para "sin marcar" -- un patch
// que omite la clave significa "no tocar este campo", pero JSON.stringify
// tira cualquier valor `undefined` antes de llegar a la red, así que un
// "vuelve a dejarlo sin marcar" con `undefined` nunca llegaba al backend
// (bug real, encontrado 2026-09-03). `null` sí viaja en el JSON y tanto el
// backend web (Optional[bool] = None + exclude_unset) como el de escritorio
// (merge_object sobre el Value ya parseado) lo interpretan correctamente
// como "pon este campo a NULL".
const SiNoToggle: React.FC<{ value?: boolean | null; onChange: (v: boolean | null) => void }> = ({ value, onChange }) => (
    <div className="mt-1 flex items-center gap-2">
        <button
            type="button"
            onClick={() => onChange(value === true ? null : true)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${value === true ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
        >
            Sí
        </button>
        <button
            type="button"
            onClick={() => onChange(value === false ? null : false)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${value === false ? 'bg-slate-600 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
        >
            No
        </button>
    </div>
);

export default SiNoToggle;
