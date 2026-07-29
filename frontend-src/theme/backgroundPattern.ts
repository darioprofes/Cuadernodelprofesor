// Textura de fondo sutil para dar profundidad a la app: un patrón de
// dibujo lineal (solo trazo, sin relleno) con motivos de aula — libro
// abierto, lápiz, birrete, manzana — en un tono más oscuro que el fondo
// pero a muy baja opacidad, para que se note como textura y no compita
// con las tarjetas blancas ni con el texto. Es una tesela SVG que se
// repite (background-repeat), no una ilustración única.
const STROKE = '#94a3b8'; // slate-400: mismo tono que bg-slate-100 (app), un escalón más oscuro
const OPACITY = 0.16;

const PATTERN_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'>
  <g fill='none' stroke='${STROKE}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' opacity='${OPACITY}'>
    <!-- Libro abierto -->
    <g transform='translate(20,30) rotate(-6)'>
      <path d='M0,10 C0,5 5,3 12,4 L30,9 L30,48 L12,43 C5,41 0,38 0,33 Z' />
      <path d='M60,10 C60,5 55,3 48,4 L30,9 L30,48 L48,43 C55,41 60,38 60,33 Z' />
      <line x1='8' y1='16' x2='22' y2='19' />
      <line x1='8' y1='24' x2='22' y2='27' />
      <line x1='38' y1='19' x2='52' y2='16' />
      <line x1='38' y1='27' x2='52' y2='24' />
    </g>

    <!-- Lapiz -->
    <g transform='translate(230,40) rotate(35)'>
      <rect x='0' y='0' width='52' height='11' rx='2.5' />
      <path d='M52,0 L64,5.5 L52,11 Z' />
      <line x1='9' y1='0' x2='9' y2='11' />
    </g>

    <!-- Birrete -->
    <g transform='translate(30,220)'>
      <path d='M32,0 L64,14 L32,28 L0,14 Z' />
      <path d='M16,19 L16,34 C16,39 48,39 48,34 L48,19' />
      <line x1='64' y1='14' x2='64' y2='32' />
      <circle cx='64' cy='36' r='3.5' />
    </g>

    <!-- Manzana -->
    <g transform='translate(225,225)'>
      <path d='M28,14 C40,4 54,14 52,28 C50,42 38,50 28,50 C18,50 6,42 4,28 C2,14 16,4 28,14 Z' />
      <path d='M28,14 C27,8 27,4 24,0' />
      <path d='M27,3 C32,0 38,3 36,8 C33,11 28,8 27,3 Z' />
    </g>
  </g>
</svg>
`.trim();

export const backgroundPatternStyle = {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(PATTERN_SVG)}")`,
    backgroundRepeat: 'repeat' as const,
    backgroundSize: '320px 320px',
};
