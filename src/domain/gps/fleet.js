/*
 * Centro de Monitoreo GPS — reglas puras (sin red ni DOM), para probarlas por separado.
 *
 * Dos cosas distintas que NUNCA se mezclan:
 *   - Estado operativo de Logística (En ruta a destino, Descargando, Vacío…): lo captura el usuario.
 *   - Movimiento reportado por el GPS (en movimiento, detenida, sin señal): lo calcula esta regla.
 * Una unidad detenida físicamente no cambia por eso a Descargando ni a Inactiva.
 *
 * Fila del monitor (la arma la pantalla con los catálogos y Logística):
 *   { id, vehicleId, imei, label, placas, operator, division, status, op, operating, trailerType, origin, destination,
 *     reference, deliveryPlace, deviceName, pos, motion, linked }
 */
import { freshness, hasFix } from './gps.js';
import { distanceKm } from './geo.js';

/* A partir de esta velocidad la unidad se considera en movimiento */
export const MOVING_KMH = 5;
export const MOTIONS = {
  moving: { label: 'En movimiento', short: 'En movimiento' },
  stopped: { label: 'Detenida', short: 'Detenida' },
  nosignal: { label: 'Sin señal reciente', short: 'Sin señal' },
};

/*
 * Movimiento según el GPS:
 *   nosignal  sin coordenadas o sin señal del equipo en los últimos 10 min (la posición no es actual)
 *   stopped   el equipo reporta pero la posición no cambia (o velocidad < 5 km/h)
 *   moving    velocidad ≥ 5 km/h; si IOPGPS no entrega velocidad, desplazamiento ≥ 80 m entre dos lecturas recientes
 * prev = lectura anterior de la misma unidad (opcional)
 */
export function motionOf(p, prev = null, now = Date.now()) {
  const f = freshness(p, now);
  if (f.state === 'none' || f.state === 'stale') return 'nosignal';
  if (f.state === 'parked') return 'stopped';
  if (Number.isFinite(p.speed)) return p.speed >= MOVING_KMH ? 'moving' : 'stopped';
  if (prev && hasFix(prev) && p.gpsTime && prev.gpsTime && p.gpsTime > prev.gpsTime && p.gpsTime - prev.gpsTime <= 5 * 60 * 1000 && distanceKm(prev, p) >= 0.08) return 'moving';
  return 'stopped';
}

/* Indicadores generales. «En operación» = misma regla que Inicio (estado ≠ Inactiva y ≠ Vacío). */
export function fleetKpis(rows) {
  const k = { monitored: rows.length, operating: 0, moving: 0, stopped: 0, nosignal: 0 };
  rows.forEach((r) => { if (r.operating) k.operating += 1; k[r.motion] = (k[r.motion] || 0) + 1; });
  return k;
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const alnum = (s) => fold(s).replace(/[^a-z0-9]/g, '');

/*
 * Filtros: f = { gps: all|moving|stopped|nosignal, operating: bool, division: all|puerto|campo, status: all|<estado>,
 *               type: all|chasis|jaula|tolva, text }
 * Buscador: número económico, placas, operador y referencia (también nombre del equipo GPS).
 */
export function filterRows(rows, f = {}) {
  const words = fold(f.text).trim().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (f.gps && f.gps !== 'all' && r.motion !== f.gps) return false;
    if (f.operating && !r.operating) return false;
    if (f.division && f.division !== 'all' && r.division !== f.division) return false;
    if (f.status && f.status !== 'all' && r.status !== f.status) return false;
    if (f.type && f.type !== 'all' && r.trailerType !== f.type) return false;
    if (!words.length) return true;
    const hay = [r.label, r.placas, r.operator, r.reference, r.deviceName].map(fold).join('\u0001');
    const hayAl = [r.label, r.placas, r.reference].map(alnum).join('\u0001');
    return words.every((w) => hay.includes(w) || (alnum(w) && hayAl.includes(alnum(w))));
  });
}

/* Orden de la lista: en operación primero (por estado), luego en movimiento, detenidas y sin señal; después por número */
const MOTION_RANK = { moving: 0, stopped: 1, nosignal: 2 };
export function sortRows(rows, rankOf = () => 9) {
  const num = (s) => String(s || '').replace(/^\D+/, '');
  return [...rows].sort((a, b) => (b.operating - a.operating) || (a.operating ? rankOf(a.status) - rankOf(b.status) : 0)
    || (MOTION_RANK[a.motion] - MOTION_RANK[b.motion]) || String(a.label).localeCompare(String(b.label), 'es', { numeric: true }) || num(a.label) - num(b.label));
}
