// Textura sutil para las cabeceras de sección: versión simplificada, solo
// de línea y en blanco, del faro/colina/mar/pájaros del héroe de "Hoy".
//
// Primer intento: una única ilustración ancha estirada con
// preserveAspectRatio="slice" (como BannerCostero). No funciona bien aquí
// porque las cabeceras son mucho más anchas que altas y su proporción
// varía con el ancho de pantalla — "slice" la escala hasta cubrir el
// ancho, y en pantallas anchas eso hace que sobresalga por arriba/abajo y
// se recorte (el faro, al no estar centrado, era lo primero en desaparecer).
//
// Solución: en vez de una escena única que se estira, una tesela CSS que
// se repite en horizontal (`repeat-x`) a una altura fija que coincide
// exactamente con la altura mínima de la cabecera (pageHeaderMinHeight,
// 5.5rem/88px) — así nunca hace falta escalarla verticalmente y no hay
// nada que recortar, sea cual sea el ancho de la cabecera.
//
// Las curvas de colina/mar empiezan y terminan en la MISMA altura (mismo
// valor de Y en x=0 y en x=TILE_WIDTH): así, al repetirse la tesela una
// junto a otra, la línea continúa sin salto en la costura en vez de dar un
// pequeño escalón cada vez que empieza una tesela nueva.
const STROKE = '#ffffff';
const TILE_HEIGHT = 88; // debe coincidir con pageHeaderMinHeight (5.5rem)
const TILE_WIDTH = 260;

const PATTERN_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='${TILE_WIDTH}' height='${TILE_HEIGHT}' viewBox='0 0 ${TILE_WIDTH} ${TILE_HEIGHT}'>
  <g fill='none' stroke='${STROKE}' stroke-linecap='round' stroke-linejoin='round'>
    <path d='M0,50 Q70,36 140,50 T260,50' stroke-width='2' opacity='0.09' />
    <path d='M0,66 Q65,60 130,66 T260,66' stroke-width='2' opacity='0.07' />
    <path d='M0,76 Q65,72 130,76 T260,76' stroke-width='2' opacity='0.06' />
    <path d='M25,18 q8,-9 16,0 q8,-9 16,0' stroke-width='2' opacity='0.09' />
    <g transform='translate(195,15)' opacity='0.11'>
      <path d='M7,50 L19,50 L16,8 L10,8 Z' stroke-width='2' />
      <line x1='8' y1='26' x2='18' y2='26' stroke-width='2' />
      <line x1='8' y1='36' x2='18' y2='36' stroke-width='2' />
      <path d='M5,8 L13,0 L21,8 Z' stroke-width='2' />
      <circle cx='13' cy='2' r='2' stroke-width='1.5' />
    </g>
  </g>
</svg>
`.trim();

export const headerPatternStyle = {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(PATTERN_SVG)}")`,
    backgroundRepeat: 'repeat-x' as const,
    backgroundSize: `${TILE_WIDTH}px ${TILE_HEIGHT}px`,
    backgroundPosition: 'left top' as const,
};
