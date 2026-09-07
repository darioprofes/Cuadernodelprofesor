import { PATRON_CODIGO } from '../components/TextoResaltado';

// Edición manual del resultado del Anonimizador (paso de revisión): quitar un
// código puesto por error o anonimizar a mano una palabra que el detector
// automático (spaCy + regex, ver api/app/services/anonimizador.py) no cogió.
// Funciones puras -- el estado ({texto, mapa}) vive en cada componente que
// las usa (AiToolsView.tsx, AdaptarMaterialView.tsx, ActaReunionTab.tsx).

interface ResultadoAnonimizacion {
    texto: string;
    mapa: Record<string, string>;
}

// Mismo formato que el backend (secrets.token_hex(3).upper() -> 6 hex
// mayúsculas). Reintenta si el azar produce un código que ya existe en el
// mapa -- muy improbable, pero gratis de cubrir.
export const generarCodigoAnonimizacion = (
    prefijo: 'PERS' | 'GRUPO',
    mapaExistente: Record<string, string>,
): string => {
    let codigo: string;
    do {
        const bytes = new Uint8Array(3);
        crypto.getRandomValues(bytes);
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        codigo = `${prefijo}_${hex}`;
    } while (codigo in mapaExistente);
    return codigo;
};

// Quita la anonimización de un código: lo sustituye por el dato real en todo
// el texto y borra la entrada del mapa -- si el detector se equivocó y marcó
// algo que no era un dato personal.
export const quitarCodigo = (
    texto: string,
    mapa: Record<string, string>,
    codigo: string,
): ResultadoAnonimizacion => {
    const real = mapa[codigo];
    if (real === undefined) return { texto, mapa };
    const { [codigo]: _omitido, ...mapaSinCodigo } = mapa;
    return { texto: texto.split(codigo).join(real), mapa: mapaSinCodigo };
};

// Anonimiza a mano un fragmento de texto que el detector automático no cogió.
// `seleccion` es lo que el profesor ha seleccionado con el ratón en el propio
// texto ya anonimizado -- por eso, si de verdad hace falta, aparece ahí
// literal (no se ha sustituido por ningún código). Devuelve `null` cuando no
// hay nada razonable que hacer: selección vacía, ya es un código, o ya no
// aparece en el texto (p.ej. selección obsoleta tras otro cambio).
export const anonimizarManual = (
    texto: string,
    mapa: Record<string, string>,
    seleccion: string,
): ResultadoAnonimizacion | null => {
    const recortada = seleccion.trim();
    if (!recortada) return null;
    PATRON_CODIGO.lastIndex = 0;
    if (PATRON_CODIGO.test(recortada)) return null;
    if (!texto.includes(recortada)) return null;

    const codigo = generarCodigoAnonimizacion('PERS', mapa);
    return {
        texto: texto.split(recortada).join(codigo),
        mapa: { ...mapa, [codigo]: recortada },
    };
};

// Sustituye cada código PERS_/GRUPO_ del texto por su dato real -- mismo
// criterio que ya usaban AiToolsView.tsx (handleRestituir) y
// AdaptarMaterialView.tsx (reintegrar), unificado aquí para no duplicarlo en
// un tercer sitio (ActaReunionTab.tsx).
export const reintegrar = (texto: string, mapa: Record<string, string>): string => {
    let out = texto;
    for (const [codigo, real] of Object.entries(mapa)) out = out.split(codigo).join(real);
    return out;
};
