import React, { useEffect, useState } from 'react';
import Textarea from './Textarea';

// Mismo patrón que BufferedInput (desacopla la escritura del guardado,
// solo llama a onCommit al perder el foco) pero sin el blur-en-Enter: en un
// textarea multilínea Enter tiene que seguir insertando un salto de línea.
const BufferedTextarea: React.FC<
    { value: string; onCommit: (value: string) => void }
    & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur'>
> = ({ value, onCommit, ...rest }) => {
    const [local, setLocal] = useState(value);
    useEffect(() => { setLocal(value); }, [value]);
    return (
        <Textarea
            {...rest}
            value={local}
            onChange={e => setLocal(e.target.value)}
            onBlur={() => { if (local !== value) onCommit(local); }}
        />
    );
};

export default BufferedTextarea;
