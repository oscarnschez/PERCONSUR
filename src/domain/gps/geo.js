/*
 * Ubicación de destinos — reglas puras (sin red ni DOM).
 *   addrKey(texto)          clave estable de una dirección (sin acentos, mayúsculas ni signos) para guardar su ubicación
 *   coordsIn(texto)         coordenadas escritas o dentro de un link de Google Maps («19.05, -104.31», «…/@19.05,-104.31,15z»)
 *   geoQueries(dirección)   búsquedas a intentar, de la más precisa a la más general (dirección, C.P., municipio)
 *   precisionOf(resultado)  qué tan exacta es una respuesta del buscador de direcciones (OpenStreetMap / Nominatim)
 *   distanceKm, distanceText, directionsLink, PRECISION
 */
import { EDOS } from '../../config/reference.js';
import { destinoMunicipio } from '../shared/format.js';

const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const addrKey = (t) => fold(t).replace(/[^a-z0-9]+/g, ' ').trim();

/* Precisión de una ubicación (de más a menos confiable) */
export const PRECISION = {
  manual: { rank: 5, label: 'Ubicación fijada en el mapa', approx: false },
  link: { rank: 4, label: 'Ubicación del link de Google Maps', approx: false },
  address: { rank: 3, label: 'Ubicación según la dirección', approx: false },
  area: { rank: 2, label: 'Ubicación aproximada (colonia o C.P.)', approx: true },
  city: { rank: 1, label: 'Ubicación aproximada (municipio)', approx: true },
};
export const precisionLabel = (p) => (PRECISION[p] || {}).label || '';
export const isApprox = (p) => !!(PRECISION[p] || {}).approx;

const okLat = (v) => Number.isFinite(v) && v >= -90 && v <= 90;
const okLng = (v) => Number.isFinite(v) && v >= -180 && v <= 180;
const pair = (a, b) => { const lat = +a, lng = +b; return okLat(lat) && okLng(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null; };

/* Coordenadas escritas a mano o dentro de un link largo de Google Maps. Los links cortos (maps.app.goo.gl) no las traen. */
export function coordsIn(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const N = '(-?\\d{1,3}\\.\\d+)';
  const pats = [
    new RegExp(`!3d${N}!4d${N}`),                                   /* lugar marcado en Google Maps */
    new RegExp(`[?&](?:q|query|ll|destination|daddr)=${N}(?:,|%2C)\\s*${N}`, 'i'),
    new RegExp(`@${N},${N}`),                                       /* centro del mapa */
    new RegExp(`^${N}\\s*[,; ]\\s*${N}$`),                          /* «19.0523, -104.3141» */
  ];
  for (const re of pats) { const m = re.exec(s); if (m) { const p = pair(m[1], m[2]); if (p) return p; } }
  return null;
}

/* Dirección en una línea, sin abreviaturas que confunden al buscador */
export function cleanAddress(addr) {
  return String(addr || '')
    .replace(/\r?\n+/g, ', ')
    .replace(/\b(c\.?\s?p\.?|codigo postal|código postal)\s*:?\s*(\d{5})\b/gi, '$2')
    .replace(/\b(col\.?|colonia|fracc\.?|fraccionamiento)\s+/gi, '')
    .replace(/\b(no\.?|num\.?|núm\.?|número|numero)\s*(?=\d)/gi, '')
    .replace(/#\s*/g, '')
    .replace(/\bs\/n\b/gi, '')
    .replace(/\s*,\s*(,\s*)+/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
}

const EDO_NAME = new Map();
for (const [name, ab] of EDOS) if (!EDO_NAME.has(ab)) EDO_NAME.set(ab, name);
/* «Zapopan, JAL» → «Zapopan, Jalisco» */
export function cityOf(addr) {
  const m = destinoMunicipio(addr);
  if (!m) return '';
  const [mun, ab] = m.split(/,\s*/);
  const edo = ab ? (EDO_NAME.get(ab) || ab).replace(/(^|\s)(\p{L})/gu, (m, sp, ch) => sp + ch.toUpperCase()).replace(/ De /g, ' de ') : '';
  return [mun, edo].filter(Boolean).join(', ');
}

/*
 * Búsquedas a intentar para una dirección (se usa la primera que encuentre algo):
 *   { q, max }            texto libre; max = precisión máxima que se le reconoce a ese intento
 *   { postalcode, max }   solo el código postal
 */
export function geoQueries(addr) {
  const full = cleanAddress(addr);
  if (!full) return [];
  const out = [], seen = new Set();
  const add = (o) => { const k = JSON.stringify(o); if (!seen.has(k)) { seen.add(k); out.push(o); } };
  const withMx = (t) => (/\bm[eé]xico\b/i.test(t) ? t : `${t}, México`);
  add({ q: withMx(full), max: 'address' });
  /* sin la primera parte (calle y número mal escritos suelen impedir el resultado) */
  const parts = full.split(/\s*,\s*/).filter(Boolean);
  if (parts.length >= 3) add({ q: withMx(parts.slice(1).join(', ')), max: 'area' });
  const cp = /\b(\d{5})\b/.exec(full);
  if (cp) add({ postalcode: cp[1], max: 'area' });
  const city = cityOf(addr);
  if (city) add({ q: withMx(city), max: 'city' });
  return out;
}

/* Precisión de un resultado de Nominatim (place_rank: 30 casa, 26-27 calle, 17-25 colonia/C.P., ≤16 ciudad) */
export function precisionOf(r, max = 'address') {
  const rank = +((r && (r.place_rank ?? r.rank)) || 0);
  const p = rank >= 26 ? 'address' : rank >= 17 ? 'area' : 'city';
  return PRECISION[p].rank <= PRECISION[max].rank ? p : max;
}

/* Distancia en línea recta (km) */
export function distanceKm(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return null;
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function distanceText(km) {
  if (km == null) return '';
  if (km < 0.2) return 'en el lugar';
  if (km < 1) return `a ${Math.round(km * 1000 / 50) * 50} m`;
  return `a ${km < 10 ? km.toFixed(1).replace(/\.0$/, '') : Math.round(km)} km`;
}
/* Ruta en Google Maps desde la unidad hasta el destino */
export const directionsLink = (from, to) => (to && Number.isFinite(to.lat)
  ? `https://www.google.com/maps/dir/?api=1${from && Number.isFinite(from.lat) ? `&origin=${from.lat},${from.lng}` : ''}&destination=${to.lat},${to.lng}&travelmode=driving` : '');
