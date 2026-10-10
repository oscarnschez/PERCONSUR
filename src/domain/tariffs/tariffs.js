/*
 * Tarifas — reglas sin pantalla.
 * Un APARTADO (p. ej. «BAYER INBOUND 2026») agrupa rutas: una por ciudad de origen y planta destino, con su zona y el
 * importe de cada tipo de unidad en centavos ({ Tolva, Jaula }, configuración de transporte sencillo). Solo se guardan
 * rutas con al menos un monto. Aquí viven la siembra inicial, la validación de lo capturado, los filtros y la agrupación
 * por zona que usan la pantalla y el PDF.
 * La búsqueda ignora mayúsculas, acentos, espacios y signos: «san juan», «SanJuan» y «San Juan de Abajo, Nay.» coinciden.
 */
import { TARIFFS, TARIFF_CONFIG, TARIFF_SEED_SHEET } from '../../config/tariffs.js';

export const UNITS = ['Tolva', 'Jaula'];

/* Clave de búsqueda: «San Juan de Abajo, Nay.» → «sanjuandeabajonay» */
export const searchKey = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/* Nombre corto de la planta: «Planta Villagrán» → «Villagrán» */
export const plantShort = (name) => String(name || '').replace(/^Planta\s+/i, '');
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/* Rutas a partir de renglones [zona, origen, planta, unidad, pesos] (siembra), en el orden del tarifario */
export function routesFromRows(rows = TARIFFS) {
  const map = new Map();
  for (const [zone, origin, dest, unit, pesos] of rows) {
    const k = `${origin}|${dest}`;
    if (!map.has(k)) map.set(k, { id: 'r' + (map.size + 1), zone, origin, dest, rates: {} });
    map.get(k).rates[unit] = Math.round(pesos * 100);
  }
  return [...map.values()];
}
/* Apartado inicial (BAYER INBOUND 2026) tal como venía en el tarifario de PERCONSUR */
export function seedSheet(now = Date.now()) {
  return { ...TARIFF_SEED_SHEET, config: TARIFF_CONFIG, routes: routesFromRows(), createdAt: now, updatedAt: now, source: 'seed' };
}

/* Zonas y plantas en el orden en que aparecen */
export const zonesOf = (routes) => [...new Set(routes.map((r) => r.zone))];
export const destinationsOf = (routes) => [...new Set(routes.map((r) => r.dest))];

/* Filtro: zona exacta (o todas), origen y destino por texto (parcial, sin acentos) */
export function filterRoutes(routes, { zone = '', origin = '', dest = '' } = {}) {
  const o = searchKey(origin), d = searchKey(dest);
  return routes.filter((r) => (!zone || r.zone === zone) && (!o || searchKey(r.origin).includes(o)) && (!d || searchKey(r.dest).includes(d)));
}

/*
 * Agrupación para la pantalla y el PDF: [{ zone, origins: [{ origin, routes }], routes }] por zona (orden de aparición),
 * orígenes en orden alfabético y destinos en el orden de las plantas.
 */
export function groupByZone(routes, all = routes) {
  const zones = zonesOf(all), plants = destinationsOf(all);
  return zones.map((zone) => {
    const rs = routes.filter((r) => r.zone === zone);
    const names = [...new Set(rs.map((r) => r.origin))].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    const origins = names.map((origin) => ({ origin, routes: rs.filter((r) => r.origin === origin).sort((a, b) => plants.indexOf(a.dest) - plants.indexOf(b.dest)) }));
    return { zone, origins, routes: rs };
  }).filter((g) => g.routes.length);
}

/* Resumen de un apartado */
export function tariffStats(routes) {
  return { routes: routes.length, origins: new Set(routes.map((r) => r.origin)).size, zones: zonesOf(routes).length, rates: routes.reduce((a, r) => a + Object.keys(r.rates).length, 0) };
}

/*
 * Ruta capturada: input = { zone, origin, dest, rates: { Tolva: centavos|null, Jaula: centavos|null } }.
 * Devuelve { route } lista para guardar o { errors: { zone|origin|dest|rates: mensaje } }.
 * No se permite repetir ciudad de origen + planta destino dentro del mismo apartado (sin importar acentos ni mayúsculas).
 */
export function checkRoute(input, routes, id = null) {
  const zone = clean(input.zone), origin = clean(input.origin), dest = clean(input.dest), errors = {};
  if (!zone) errors.zone = 'Escribe la zona.';
  if (!origin) errors.origin = 'Escribe la ciudad de origen.';
  if (!dest) errors.dest = 'Escribe la planta destino.';
  const rates = {};
  for (const u of UNITS) { const c = input.rates && input.rates[u]; if (Number.isFinite(c) && c > 0) rates[u] = Math.round(c); }
  if (!Object.keys(rates).length) errors.rates = 'Captura al menos un monto (Tolva o Jaula).';
  const twin = origin && dest && routes.find((r) => r.id !== id && searchKey(r.origin) === searchKey(origin) && searchKey(r.dest) === searchKey(dest));
  if (twin) errors.dest = `Ya existe la ruta ${twin.origin} → ${plantShort(twin.dest)} en este apartado.`;
  return Object.keys(errors).length ? { errors } : { route: { id, zone, origin, dest, rates } };
}
/* Agrega o reemplaza una ruta (conserva su lugar en la lista) */
export function upsertRoute(routes, route) {
  const i = routes.findIndex((r) => r.id === route.id);
  if (i < 0) return [...routes, route];
  const out = [...routes]; out[i] = route; return out;
}

/* Nombre de apartado: obligatorio y sin repetir (sin importar acentos ni mayúsculas) */
export function checkSheetName(name, sheets, id = null) {
  const n = clean(name);
  if (!n) return { error: 'Escribe el nombre del apartado.' };
  if (n.length > 60) return { error: 'El nombre puede tener hasta 60 caracteres.' };
  if (sheets.some((s) => s.id !== id && searchKey(s.name) === searchKey(n))) return { error: `Ya existe el apartado «${n}».` };
  return { name: n };
}

/* Apartado recibido de un respaldo o de otro dispositivo: solo campos con la forma esperada */
export function sanitizeSheet(s) {
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !clean(s.name)) return null;
  const routes = (Array.isArray(s.routes) ? s.routes : []).map((r) => {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string') return null;
    const rates = {};
    for (const u of UNITS) { const c = Number(r.rates && r.rates[u]); if (Number.isFinite(c) && c > 0) rates[u] = Math.round(c); }
    const route = { id: r.id, zone: clean(r.zone), origin: clean(r.origin), dest: clean(r.dest), rates };
    return route.zone && route.origin && route.dest && Object.keys(rates).length ? route : null;
  }).filter(Boolean);
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return { id: s.id, name: clean(s.name).slice(0, 60), config: TARIFF_CONFIG, routes, createdAt: num(s.createdAt, Date.now()), updatedAt: num(s.updatedAt, 0), source: s.source === 'seed' ? 'seed' : 'user' };
}
