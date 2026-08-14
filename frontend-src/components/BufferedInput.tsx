import React, { useEffect, useState } from 'react';
import Input from './Input';

// Bug real (2026-08-04, encontrado en AcademicConfigManager.tsx): campos que
// persisten en el servidor con una petición async por pulsación de tecla.
// Con un <input> controlado normal, mientras esa petición está en vuelo el
// valor sigue viniendo del último dato confirmado por el servidor — un
// re-render de por medio (incluida la propia respuesta tardía de una
// pulsación anterior) pisaba lo que se estaba tecleando. Para <input
// type="date"> esto era especialmente grave: el navegador compone un valor
// "válido" con cada dígito del año (p.ej. escribir solo "2" ya produce
// "0002-07-05"), así que cada dígito disparaba su propio guardado y su
// propio pisotón, dejando años tipo "0023" o el campo directamente vacío.
// BufferedInput desacopla la escritura del guardado: solo llama a onCommit
// al perder el foco (o con Enter), nunca en cada tecla. Compartido (no solo
// en AcademicConfigManager) porque el mismo patrón hace falta en cualquier
// input editado in situ contra el backend real (p.ej. franjas horarias en
// ScheduleManager.tsx).
const BufferedInput: React.FC<
    { value: string; onCommit: (value: string) => void }
    & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'>
> = ({ value, onCommit, ...rest }) => {
    const [local, setLocal] = useState(value);
    useEffect(() => { setLocal(value); }, [value]);
    return (
        <Input
            {...rest}
            value={local}
            onChange={e => setLocal(e.target.value)}
            onBlur={() => { if (local !== value) onCommit(local); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
    );
};

export default BufferedInput;
