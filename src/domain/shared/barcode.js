/*
 * Código de barras del folio (Code 128-B), mismo algoritmo y proporciones que DOCGEN 3.1 (folioBarcode):
 * 1 módulo = 1 px de ancho, 10 módulos de zona en blanco a cada lado y 44 unidades de alto.
 * Se entrega como vector (rectángulos en una sola ruta) para que salga nítido en la hoja HTML, en la vista previa y en pdf-lib.
 */
const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232'.split(' ');
const QUIET = 10, H = 44;

/* { text, d (barras en coordenadas de módulos, alto 44), bars [[inicio, ancho]], mods (ancho total con zonas en blanco) } o null */
export function code128(text) {
  text = String(text || '').replace(/[^\x20-\x7E]/g, '');
  if (!text) return null;
  const vals = [104, ...[...text].map((ch) => ch.charCodeAt(0) - 32)];
  let sum = 104;
  for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
  vals.push(sum % 103);
  const widths = vals.map((v) => C128[v]).join('') + '2331112';
  let pos = QUIET, bar = true, d = '';
  const bars = [];
  for (const w of widths) { const n = +w; if (bar) { d += `M${pos} 0h${n}v${H}h-${n}z`; bars.push([pos, n]); } pos += n; bar = !bar; }
  return { text, d, bars, mods: pos + QUIET, h: H };
}

/* SVG para la hoja: ancho = módulos en px y alto fijo (DOCGEN: 26 px en el encabezado de la nota) */
export function barcodeSVG(text, { height = 26, color = '#1A2233', cls = 'bc' } = {}) {
  const b = code128(text);
  if (!b) return '';
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b.mods} ${b.h}" width="${b.mods}" height="${height}" preserveAspectRatio="none" role="img" aria-label="Código de barras del folio ${b.text.replace(/[<>&"]/g, '')}"><rect width="${b.mods}" height="${b.h}" fill="#fff"/><path d="${b.d}" fill="${color}"/></svg>`;
}
