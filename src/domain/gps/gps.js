/*
 * GPS — reglas puras (sin red ni DOM).
 * Las posiciones vienen del intermediario (gps-proxy) ya normalizadas:
 *   { imei, name, lat, lng, gpsTime, signalTime, speed, course, acc, address }   (tiempos en ms; lo que falta = null)
 * Nunca se presenta una posición antigua como si fuera en tiempo real.
 */

/* Sin señal del equipo durante más de esto → «Señal GPS sin actualización reciente» */
export const STALE_MS = 10 * 60 * 1000;

const p2 = (n) => String(n).padStart(2, '0');
export const hm = (ts) => { const d = new Date(ts); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const dayHm = (ts, now = Date.now()) => {
  const d = new Date(ts), n = new Date(now);
  const same = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return same ? hm(ts) : `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${hm(ts)}`;
};
/* «hace 24 s», «hace 3 min», «hace 2 h» */
export function ageText(ts, now = Date.now()) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

export const hasFix = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/*
 * Frescura de una posición:
 *   live    el equipo reporta y la posición es reciente → «Actualizado hace 24 s»
 *   parked  el equipo sigue reportando pero la posición no cambia desde hace rato (detenida) → «Detenida · última posición 03:13»
 *   stale   sin señal reciente → «Señal GPS sin actualización reciente»
 *   none    sin coordenadas
 */
export function freshness(p, now = Date.now()) {
  if (!hasFix(p)) return { state: 'none', label: 'Ubicación GPS no disponible' };
  const pos = p.gpsTime || null, sig = Math.max(p.signalTime || 0, pos || 0) || null;
  if (!sig || now - sig > STALE_MS) return { state: 'stale', label: 'Señal GPS sin actualización reciente', since: pos || sig };
  if (pos && now - pos > STALE_MS) return { state: 'parked', label: `Detenida · última posición ${dayHm(pos, now)}`, since: pos };
  return { state: 'live', label: `Actualizado ${ageText(pos || sig, now)}`, since: pos || sig };
}

export const speedText = (p) => (p && Number.isFinite(p.speed) ? `${Math.round(p.speed)} km/h` : '');
export const coordText = (v) => (Number.isFinite(v) ? v.toFixed(6) : '');
export const mapsLink = (p) => (hasFix(p) ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : '');

/*
 * Sugerencia de vínculo dispositivo GPS → unidad del catálogo a partir del nombre del dispositivo en IOPGPS
 * (p. ej. «U12 60-BN-4J»): primero por placas, después por número económico. Solo es una sugerencia; el usuario confirma.
 * units: [{ id, eco, placas }]
 */
const alnum = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function suggestUnit(deviceName, units) {
  const n = alnum(deviceName);
  if (!n) return null;
  const byPlacas = units.find((u) => alnum(u.placas).length >= 5 && n.includes(alnum(u.placas)));
  if (byPlacas) return byPlacas;
  const m = /(?:^|[^A-Z0-9])U[\s-]?0*(\d{1,4})(?![0-9])/i.exec(String(deviceName || ''));
  if (m) { const eco = m[1]; return units.find((u) => String(u.eco).replace(/^0+/, '') === eco) || null; }
  return null;
}
