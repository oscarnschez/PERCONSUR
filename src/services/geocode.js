/*
 * Ubicación en el mapa de direcciones escritas (destino de la nota, patios, terminales, plantas, destinos del catálogo).
 * Se busca una sola vez en el buscador de direcciones de OpenStreetMap (Nominatim: gratuito, sin clave, máximo una consulta
 * por segundo) y el resultado se guarda en el store «geocodes». Si el punto no es exacto, se ajusta a mano en el mapa
 * (precision 'manual') y ese ajuste se reutiliza en toda nota con la misma dirección; nunca se sobrescribe solo.
 * Registro: { key, address, lat, lng, precision: manual|address|area|city|none, label, at, by }
 * Un registro de catálogo puede traer su propio punto: pin {lat,lng} (fijado en el mapa) o un link largo de Google Maps.
 */
import * as db from './db.js';
import { addrKey, coordsIn, geoQueries, precisionOf } from '../domain/gps/geo.js';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const RETRY_FAILED_MS = 24 * 3600 * 1000;
const GAP_MS = 1100;

let cache = null, loading = null;
const pending = new Map();
let lastCall = 0, chain = Promise.resolve();

export async function loadGeocodes(force = false) {
  if (cache && !force) return cache;
  if (!loading) loading = db.all(db.S.geocodes).then((rows) => { cache = new Map(rows.map((r) => [r.key, r])); loading = null; return cache; });
  return loading;
}
const EVT = 'geo:change';
const changed = () => window.dispatchEvent(new CustomEvent(EVT));
export function onGeoChange(fn) { window.addEventListener(EVT, fn); return () => window.removeEventListener(EVT, fn); }
function actor() { try { const s = JSON.parse(sessionStorage.getItem('pcs-session') || 'null'); return (s && s.user) || 'local'; } catch (e) { return 'local'; } }

/* Ubicación ya conocida de una dirección (sin consultar la red) */
export function cached(address) {
  const k = addrKey(address);
  const r = k && cache ? cache.get(k) : null;
  return r && r.precision !== 'none' && Number.isFinite(r.lat) ? r : null;
}
/* ¿La búsqueda ya falló hace poco? (para decir «no se pudo ubicar» en lugar de «buscando…») */
export function failed(address) { const r = cache && cache.get(addrKey(address)); return !!(r && r.precision === 'none' && Date.now() - (r.at || 0) < RETRY_FAILED_MS); }

/* Una consulta a la vez, separadas al menos 1.1 s (política de uso de Nominatim) */
function throttled(fn) {
  const run = chain.then(async () => {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}
async function search(query) {
  const p = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'mx', 'accept-language': 'es' });
  if (query.postalcode) { p.set('postalcode', query.postalcode); p.set('country', 'México'); } else p.set('q', query.q);
  return throttled(async () => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(`${ENDPOINT}?${p}`, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`El buscador de direcciones respondió ${r.status}`);
      const arr = await r.json();
      return Array.isArray(arr) && arr[0] ? arr[0] : null;
    } finally { clearTimeout(t); }
  });
}

/* Ubicación de una dirección: guardada o buscada (una vez). null si no se encuentra. Lanza error solo sin conexión. */
export async function locate(address) {
  await loadGeocodes();
  const key = addrKey(address);
  if (!key) return null;
  const cur = cache.get(key);
  if (cur && cur.precision !== 'none') return cur;
  if (cur && Date.now() - (cur.at || 0) < RETRY_FAILED_MS) return null;
  const direct = coordsIn(address);
  if (direct) return put({ key, address, ...direct, precision: 'link', label: '', at: Date.now(), by: 'auto' });
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    for (const q of geoQueries(address)) {
      const hit = await search(q);
      if (hit && Number.isFinite(+hit.lat) && Number.isFinite(+hit.lon)) {
        return put({ key, address: String(address).trim(), lat: +hit.lat, lng: +hit.lon, precision: precisionOf(hit, q.max), label: hit.display_name || '', at: Date.now(), by: 'auto' });
      }
    }
    await put({ key, address: String(address).trim(), lat: null, lng: null, precision: 'none', label: '', at: Date.now(), by: 'auto' });
    return null;
  })().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
async function put(rec) {
  await loadGeocodes();
  const cur = cache.get(rec.key);
  if (cur && cur.precision === 'manual' && rec.precision !== 'manual') return cur;
  await db.put(db.S.geocodes, rec);
  cache.set(rec.key, rec);
  changed();
  return rec;
}
/* Punto fijado a mano para una dirección (se reutiliza en toda nota con la misma dirección) */
export async function setManual(address, { lat, lng }) {
  const key = addrKey(address);
  if (!key) return null;
  return put({ key, address: String(address).trim(), lat, lng, precision: 'manual', label: '', at: Date.now(), by: actor() });
}
/* Quita el punto fijado: la próxima vez se vuelve a buscar la dirección */
export async function clearManual(address) {
  const key = addrKey(address);
  await loadGeocodes();
  if (!key || !cache.has(key)) return;
  await db.del(db.S.geocodes, key); cache.delete(key); changed();
}

/* ===== Registros de catálogo (patios, terminales, plantas, destinos) ===== */
/* Ubicación conocida: punto fijado en el mapa > link largo de Google Maps > dirección ya buscada */
export function placeLoc(rec) {
  if (!rec) return null;
  if (rec.pin && Number.isFinite(rec.pin.lat)) return { lat: rec.pin.lat, lng: rec.pin.lng, precision: 'manual' };
  const c = coordsIn(rec.maps);
  if (c) return { ...c, precision: 'link' };
  const g = rec.address ? cached(rec.address) : null;
  return g ? { lat: g.lat, lng: g.lng, precision: g.precision } : null;
}
export async function locatePlace(rec) {
  const known = placeLoc(rec);
  if (known || !rec || !rec.address) return known;
  const g = await locate(rec.address);
  return g ? { lat: g.lat, lng: g.lng, precision: g.precision } : null;
}

/* Búsqueda libre para el selector de ubicación («SSA Manzanillo», «Zapopan»): no se guarda */
export async function findPlace(text) {
  const direct = coordsIn(text);
  if (direct) return { ...direct, label: '' };
  const t = String(text || '').trim();
  if (!t) return null;
  const hit = await search({ q: /\bm[eé]xico\b/i.test(t) ? t : `${t}, México` });
  return hit ? { lat: +hit.lat, lng: +hit.lon, label: hit.display_name || '' } : null;
}
