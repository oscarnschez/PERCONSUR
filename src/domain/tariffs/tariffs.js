/*
 * Tarifario de transporte sencillo — reglas sin pantalla.
 * Convierte los renglones de config/tariffs.js en rutas (una por ciudad de origen y planta destino, con el importe de
 * cada tipo de unidad), las filtra por zona, origen y destino y las agrupa por zona para mostrarlas.
 * La búsqueda ignora mayúsculas, acentos, espacios y signos: «san juan», «SanJuan» y «San Juan de Abajo, Nay.» coinciden.
 */
import { TARIFFS } from '../../config/tariffs.js';

export const UNITS = ['Tolva', 'Jaula'];

/* Clave de búsqueda: «San Juan de Abajo, Nay.» → «sanjuandeabajonay» */
export const searchKey = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/* Nombre corto de la planta: «Planta Villagrán» → «Villagrán» */
export const plantShort = (name) => String(name || '').replace(/^Planta\s+/i, '');

/* Rutas en el orden del tarifario: { zone, origin, dest, rates: { Tolva: centavos, Jaula: centavos } } */
export function tariffRoutes(rows = TARIFFS) {
  const map = new Map();
  for (const [zone, origin, dest, unit, pesos] of rows) {
    const k = `${origin}|${dest}`;
    if (!map.has(k)) map.set(k, { zone, origin, dest, rates: {} });
    map.get(k).rates[unit] = Math.round(pesos * 100);
  }
  return [...map.values()];
}

/* Zonas y plantas en el orden en que aparecen en el tarifario */
export const zonesOf = (routes) => [...new Set(routes.map((r) => r.zone))];
export const destinationsOf = (routes) => [...new Set(routes.map((r) => r.dest))];

/* Filtro: zona exacta (o todas), origen y destino por texto (parcial, sin acentos) */
export function filterRoutes(routes, { zone = '', origin = '', dest = '' } = {}) {
  const o = searchKey(origin), d = searchKey(dest);
  return routes.filter((r) => (!zone || r.zone === zone) && (!o || searchKey(r.origin).includes(o)) && (!d || searchKey(r.dest).includes(d)));
}

/*
 * Agrupación para la pantalla: [{ zone, origins: [{ origin, routes }], routes }] por zona (orden del tarifario),
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

/* Resumen para la tarjeta de Administración y el encabezado */
export function tariffStats(routes) {
  return { routes: routes.length, origins: new Set(routes.map((r) => r.origin)).size, zones: zonesOf(routes).length, rates: routes.reduce((a, r) => a + Object.keys(r.rates).length, 0) };
}
