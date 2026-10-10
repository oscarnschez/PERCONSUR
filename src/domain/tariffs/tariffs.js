/*
 * Tarifas — reglas sin pantalla.
 * Un APARTADO (p. ej. «BAYER INBOUND 2026») pertenece a una división de PERCONSUR y agrupa rutas: una por ciudad de
 * origen y destino, con su zona y el importe de cada tipo de unidad en centavos. Solo se guardan rutas con al menos un
 * monto. Todos los importes son ANTES DE IMPUESTOS.
 *   División Campo:  destino = planta; unidades Tolva y Jaula (configuración sencilla)
 *   División Puerto: origen Manzanillo de forma predeterminada; destino = ciudad; un monto por ruta (Sencillo) y cargos
 *                    adicionales del apartado (sobrepeso, arrastres locales de vacíos y de llenos en Manzanillo)
 * Aquí viven la siembra inicial, la validación de lo capturado, los filtros y la agrupación por zona que usan la pantalla y el PDF.
 * La búsqueda ignora mayúsculas, acentos, espacios y signos: «san juan», «SanJuan» y «San Juan de Abajo, Nay.» coinciden.
 */
import { TARIFFS, TARIFF_CONFIG, TARIFF_SEED_SHEET } from '../../config/tariffs.js';

export const TAX_NOTE = 'Las tarifas son antes de impuestos.';
/* Cómo se captura y se muestra cada división */
export const DIVISIONS = {
  campo: { key: 'campo', label: 'División Campo', units: ['Tolva', 'Jaula'], unitLabel: (u) => `${u} sencilla`, destLabel: 'Planta destino', destKind: 'planta', defaultOrigin: '', icon: 'corn', summary: 'Tolva y Jaula sencillas' },
  puerto: { key: 'puerto', label: 'División Puerto', units: ['Sencillo'], unitLabel: () => 'Tarifa sencillo', destLabel: 'Ciudad destino', destKind: 'ciudad', defaultOrigin: 'Manzanillo', icon: 'ship', summary: 'Origen Manzanillo · transporte sencillo' },
};
export const divisionOf = (sheet) => DIVISIONS[sheet && sheet.division === 'puerto' ? 'puerto' : 'campo'];
/* Unidades de Campo (se conserva el nombre para la siembra y las pruebas) */
export const UNITS = DIVISIONS.campo.units;
/* Cargos adicionales con que nace un apartado de División Puerto (centavos) */
export const PUERTO_EXTRAS = [
  ['Sobrepeso', 300000],
  ['Arrastre local de vacíos en Manzanillo', 200000],
  ['Arrastre local de llenos en Manzanillo', 500000],
];
export const defaultExtras = (division) => (division === 'puerto' ? PUERTO_EXTRAS.map(([label, amount], i) => ({ id: 'x' + (i + 1), label, amount })) : []);

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
/* Apartado inicial (BAYER INBOUND 2026, División Campo) tal como venía en el tarifario de PERCONSUR */
export function seedSheet(now = Date.now()) {
  return { ...TARIFF_SEED_SHEET, division: 'campo', config: TARIFF_CONFIG, routes: routesFromRows(), extras: [], createdAt: now, updatedAt: now, source: 'seed' };
}
/* Apartado nuevo de la división elegida (Puerto trae sus cargos adicionales) */
export function newSheet({ id, name, division, now = Date.now() }) {
  const div = division === 'puerto' ? 'puerto' : 'campo';
  return { id, name, division: div, config: TARIFF_CONFIG, routes: [], extras: defaultExtras(div), createdAt: now, source: 'user' };
}

/* Zonas y destinos en el orden en que aparecen */
export const zonesOf = (routes) => [...new Set(routes.map((r) => r.zone))];
export const destinationsOf = (routes) => [...new Set(routes.map((r) => r.dest))];

/* Filtro: zona exacta (o todas), origen, destino y texto libre (origen o destino) por texto parcial sin acentos */
export function filterRoutes(routes, { zone = '', origin = '', dest = '', text = '' } = {}) {
  const o = searchKey(origin), d = searchKey(dest), t = searchKey(text);
  return routes.filter((r) => (!zone || r.zone === zone) && (!o || searchKey(r.origin).includes(o)) && (!d || searchKey(r.dest).includes(d))
    && (!t || searchKey(r.origin).includes(t) || searchKey(r.dest).includes(t)));
}

/*
 * Agrupación para la pantalla y el PDF: [{ zone, origins: [{ origin, routes }], routes }] por zona (orden de aparición),
 * orígenes en orden alfabético y destinos en el orden en que aparecen (plantas) o alfabético (ciudades).
 */
export function groupByZone(routes, all = routes, { alphaDest = false } = {}) {
  const zones = zonesOf(all), plants = destinationsOf(all);
  const byDest = alphaDest ? (a, b) => a.dest.localeCompare(b.dest, 'es', { sensitivity: 'base' }) : (a, b) => plants.indexOf(a.dest) - plants.indexOf(b.dest);
  return zones.map((zone) => {
    const rs = routes.filter((r) => r.zone === zone);
    const names = [...new Set(rs.map((r) => r.origin))].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    const origins = names.map((origin) => ({ origin, routes: rs.filter((r) => r.origin === origin).sort(byDest) }));
    return { zone, origins, routes: rs };
  }).filter((g) => g.routes.length);
}

/* Resumen de un apartado */
export function tariffStats(routes) {
  return { routes: routes.length, origins: new Set(routes.map((r) => r.origin)).size, dests: new Set(routes.map((r) => r.dest)).size, zones: zonesOf(routes).length, rates: routes.reduce((a, r) => a + Object.keys(r.rates).length, 0) };
}

/*
 * Ruta capturada: input = { zone, origin, dest, rates: { <unidad>: centavos|null } } con las unidades de la división.
 * Devuelve { route } lista para guardar o { errors: { zone|origin|dest|rates: mensaje } }.
 * No se permite repetir origen + destino dentro del mismo apartado (sin importar acentos ni mayúsculas).
 */
export function checkRoute(input, routes, id = null, division = 'campo') {
  const D = DIVISIONS[division] || DIVISIONS.campo;
  const zone = clean(input.zone), origin = clean(input.origin), dest = clean(input.dest), errors = {};
  if (!zone) errors.zone = 'Escribe la zona.';
  if (!origin) errors.origin = 'Escribe la ciudad de origen.';
  if (!dest) errors.dest = D.destKind === 'planta' ? 'Escribe la planta destino.' : 'Escribe la ciudad destino.';
  const rates = {};
  for (const u of D.units) { const c = input.rates && input.rates[u]; if (Number.isFinite(c) && c > 0) rates[u] = Math.round(c); }
  if (!Object.keys(rates).length) errors.rates = D.units.length > 1 ? `Captura al menos un monto (${D.units.join(' o ')}).` : 'Captura el monto de la tarifa.';
  const twin = origin && dest && routes.find((r) => r.id !== id && searchKey(r.origin) === searchKey(origin) && searchKey(r.dest) === searchKey(dest));
  if (twin) errors.dest = `Ya existe la ruta ${twin.origin} → ${plantShort(twin.dest)} en este apartado.`;
  return Object.keys(errors).length ? { errors } : { route: { id, zone, origin, dest, rates } };
}
/* Agrega o reemplaza un registro por id (conserva su lugar en la lista) */
export function upsertRoute(list, item) {
  const i = list.findIndex((r) => r.id === item.id);
  if (i < 0) return [...list, item];
  const out = [...list]; out[i] = item; return out;
}

/* Cargo adicional: concepto obligatorio y sin repetir, monto mayor a cero */
export function checkExtra(input, extras, id = null) {
  const label = clean(input.label), errors = {};
  const twin = label && extras.find((x) => x.id !== id && searchKey(x.label) === searchKey(label));
  if (!label) errors.label = 'Escribe el concepto del cargo.';
  else if (twin) errors.label = `Ya existe el cargo «${twin.label}».`;
  if (!(Number.isFinite(input.amount) && input.amount > 0)) errors.amount = 'Captura el monto del cargo.';
  return Object.keys(errors).length ? { errors } : { extra: { id, label, amount: Math.round(input.amount) } };
}

/* Nombre de apartado: obligatorio y sin repetir (sin importar acentos ni mayúsculas) */
export function checkSheetName(name, sheets, id = null) {
  const n = clean(name);
  if (!n) return { error: 'Escribe el nombre del apartado.' };
  if (n.length > 60) return { error: 'El nombre puede tener hasta 60 caracteres.' };
  if (sheets.some((s) => s.id !== id && searchKey(s.name) === searchKey(n))) return { error: `Ya existe el apartado «${n}».` };
  return { name: n };
}

/* Apartado guardado, recibido de un respaldo o de otro dispositivo: solo campos con la forma esperada.
   Los apartados de la versión 1.22 (sin división ni cargos) quedan en División Campo. */
export function sanitizeSheet(s) {
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !clean(s.name)) return null;
  const division = s.division === 'puerto' ? 'puerto' : 'campo', units = DIVISIONS[division].units;
  const routes = (Array.isArray(s.routes) ? s.routes : []).map((r) => {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string') return null;
    const rates = {};
    for (const u of units) { const c = Number(r.rates && r.rates[u]); if (Number.isFinite(c) && c > 0) rates[u] = Math.round(c); }
    const route = { id: r.id, zone: clean(r.zone), origin: clean(r.origin), dest: clean(r.dest), rates };
    return route.zone && route.origin && route.dest && Object.keys(rates).length ? route : null;
  }).filter(Boolean);
  const extras = (Array.isArray(s.extras) ? s.extras : []).map((x) => {
    const amount = Number(x && x.amount);
    return x && typeof x.id === 'string' && clean(x.label) && Number.isFinite(amount) && amount > 0 ? { id: x.id, label: clean(x.label).slice(0, 80), amount: Math.round(amount) } : null;
  }).filter(Boolean);
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return { id: s.id, name: clean(s.name).slice(0, 60), division, config: TARIFF_CONFIG, routes, extras, createdAt: num(s.createdAt, Date.now()), updatedAt: num(s.updatedAt, 0), source: s.source === 'seed' ? 'seed' : 'user' };
}
