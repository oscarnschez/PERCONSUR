/*
 * Taller — reglas (sin navegador; ver tests/maintenance_unit.mjs).
 * Fuente de verdad: los registros capturados (orden, trabajos, intervenciones por componente, fallas, aceite, llantas).
 * Todo lo derivado (tiempo en taller, color de cada componente, próximo cambio de aceite, disponibilidad, alertas) se
 * calcula aquí y no se guarda. Nunca se inventan kilómetros, intervalos ni posiciones de llantas.
 */
import { SEVERITY_RANK, isOpenStatus, componentsOf } from './catalog.js';

const p2 = (n) => String(n).padStart(2, '0');
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const DAY = 86400000;

/* ===== Fechas ===== */
export const isDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(s + 'T00:00:00').getTime());
export const isTimeStr = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
/* Fecha y hora locales (como las captura el usuario) → milisegundos */
export function toTs(date, time = '00:00') {
  if (!isDateStr(date)) return NaN;
  const [y, m, d] = date.split('-').map(Number), [hh, mm] = (isTimeStr(time) ? time : '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}
export function splitTs(ts) {
  if (!Number.isFinite(ts)) return { date: '', time: '' };
  const d = new Date(ts);
  return { date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, time: `${p2(d.getHours())}:${p2(d.getMinutes())}` };
}
export const ymd = (ts) => splitTs(ts).date.replace(/-/g, '');
/* 08/10/2026 · 09:30 */
export function fmtDT(ts) {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export function fmtD(ts) { if (!Number.isFinite(ts)) return ''; const d = new Date(ts); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; }
export const nf = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const kmText = (n) => (n == null ? '—' : `${nf(n)} km`);

/* ===== Tiempo en taller ===== */
export function durationParts(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  return { days: Math.floor(m / 1440), hours: Math.floor((m % 1440) / 60), minutes: m % 60 };
}
/* «2 días, 6 horas y 30 minutos» (se omiten las partes en cero) */
export function durationText(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const { days, hours, minutes } = durationParts(ms);
  const parts = [];
  if (days) parts.push(`${days} día${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hora${hours === 1 ? '' : 's'}`);
  if (minutes || !parts.length) parts.push(`${minutes} minuto${minutes === 1 ? '' : 's'}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
}
/* Tiempo de una orden: cerrada (salida − ingreso) o en curso (ahora − ingreso) */
export function orderDuration(o, now = Date.now()) {
  if (!o || !Number.isFinite(o.inAt)) return null;
  const end = Number.isFinite(o.outAt) ? o.outAt : isOpenStatus(o.status) ? now : null;
  if (end == null) return null;
  return { ms: end - o.inAt, running: !Number.isFinite(o.outAt), text: durationText(end - o.inAt) };
}

/* ===== Folio ===== */
/* Código del equipo en el folio: U21 para la unidad 21; las placas (sin espacios ni guiones) para un remolque */
export function equipmentCode(eq) {
  if (!eq) return 'EQ';
  if (eq.type === 'vehicle') return 'U' + String(eq.eco || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').padStart(2, '0');
  const p = String(eq.placas || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return p || 'R' + String(eq.id || '').slice(-4).toUpperCase();
}
export const folioOf = (code, day, n) => `MTTO-${code}-${day}-${String(n).padStart(3, '0')}`;

/* ===== Validación de la orden ===== */
export function validateOrder(o) {
  const err = {};
  if (!o.equipmentType || !(o.vehicleId || o.trailerId)) err.equipment = 'Elige el equipo (unidad o remolque del catálogo).';
  if (o.equipmentType === 'vehicle' && o.trailerId) err.equipment = 'Una orden de tractocamión no puede llevar remolque.';
  if (o.equipmentType === 'trailer' && o.vehicleId) err.equipment = 'Una orden de remolque no puede llevar unidad.';
  if (!Number.isFinite(o.inAt)) err.inAt = 'Escribe la fecha y hora de ingreso al taller.';
  if (o.outAt != null && !Number.isFinite(o.outAt)) err.outAt = 'La fecha de salida no es válida.';
  if (Number.isFinite(o.inAt) && Number.isFinite(o.outAt) && o.outAt < o.inAt) err.outAt = 'La salida no puede ser anterior al ingreso.';
  if (o.status === 'finalizado' && !Number.isFinite(o.outAt)) err.outAt = 'Para finalizar, registra la fecha y hora de salida.';
  if (o.odometer != null && (!Number.isFinite(o.odometer) || o.odometer < 0)) err.odometer = 'El kilometraje no puede ser negativo.';
  if (o.odometer != null && o.equipmentType === 'trailer') err.odometer = 'Los remolques no llevan kilometraje en el taller.';
  return err;
}
/* Kilometraje escrito → número entero (sin comas). NaN si no es válido; null si está vacío. */
export function parseKm(v) {
  const t = String(v ?? '').replace(/[,\s]/g, '');
  if (!t) return null;
  if (/^-/.test(t)) return NaN;
  return /^\d{1,7}$/.test(t) ? +t : NaN;
}
export function parseCount(v) {
  const t = String(v ?? '').trim();
  if (/^-/.test(t)) return NaN;
  return /^\d{1,2}$/.test(t) && +t > 0 ? +t : NaN;
}

/* ===== Odómetro: lecturas conocidas (combustible y taller) ===== */
/* readings: [{ ts, km, source: 'combustible'|'taller'|'aceite', ref }] → la más reciente (por fecha) */
export function latestReading(readings, beforeTs = Infinity) {
  return (readings || []).filter((r) => r && Number.isFinite(r.km) && r.km >= 0 && Number.isFinite(r.ts) && r.ts <= beforeTs)
    .sort((a, b) => b.ts - a.ts || b.km - a.km)[0] || null;
}
export const STALE_DAYS = 15;
export function readingAge(r, now = Date.now()) {
  if (!r) return null;
  const days = Math.max(0, Math.floor((now - r.ts) / DAY));
  return { days, stale: days > STALE_DAYS, text: days === 0 ? 'hoy' : days === 1 ? 'hace 1 día' : `hace ${days} días` };
}
/* ¿El kilometraje capturado es menor que la última lectura anterior a esa fecha? */
export function odometerCheck(km, readings, atTs, excludeRef = null) {
  const prev = latestReading((readings || []).filter((r) => r.ref !== excludeRef), atTs);
  return { prev, lower: !!(prev && Number.isFinite(km) && km < prev.km) };
}

/* ===== Estado de cada componente (diagrama) ===== */
export const STATE_KEYS = ['none', 'leve', 'moderado', 'total', 'reemplazado'];
export const STATE_COLORS = { none: '#C4CAD4', leve: '#FACC15', moderado: '#F97316', total: '#DC2626', reemplazado: '#2563EB' };
export const STATE_LABELS = { none: 'Sin daño registrado', leve: 'Daño leve', moderado: 'Daño moderado', total: 'Daño total', reemplazado: 'Componente reemplazado' };
/* Texto oscuro o claro sobre cada color (contraste) */
export const STATE_INK = { none: '#1A2233', leve: '#1A2233', moderado: '#1A2233', total: '#FFFFFF', reemplazado: '#FFFFFF' };
/*
 * records: intervenciones { componentId, severity, action, replaced, ... } de una orden (o de varias en un reporte).
 * Prioridad: reemplazado → azul; si no, la gravedad más alta; sin gravedad → gris (intervenido sin daño registrado).
 * Devuelve Map componentId → { state, severity (más alta), replaced, items[] } sin perder el desglose.
 */
export function componentStates(records) {
  const out = new Map();
  for (const r of records || []) {
    if (!r || !r.componentId || r.deletedAt) continue;
    const cur = out.get(r.componentId) || { componentId: r.componentId, severity: '', replaced: false, items: [] };
    cur.items.push(r);
    if (r.replaced || r.action === 'reemplazado') cur.replaced = true;
    if ((SEVERITY_RANK[r.severity] || 0) > (SEVERITY_RANK[cur.severity] || 0)) cur.severity = r.severity;
    out.set(r.componentId, cur);
  }
  for (const v of out.values()) v.state = v.replaced ? 'reemplazado' : v.severity || 'none';
  return out;
}
/* Numeración estable de los componentes intervenidos (para etiquetas del diagrama y del PDF): orden del catálogo */
export function numbering(states, kind, custom = []) {
  const order = componentsOf(kind, custom, { withLegacy: true }).map((c) => c.id), n = new Map();
  [...states.keys()].sort((a, b) => (order.indexOf(a) === -1 ? 999 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 999 : order.indexOf(b))).forEach((id, i) => n.set(id, i + 1));
  return n;
}

/* ===== Aceite ===== */
/*
 * changes: cambios de aceite de la unidad { ts, odometer }; plan: { oilKm, oilDays } de la unidad (sin intervalo no hay
 * cálculo); current: lectura de odómetro más reciente (combustible o taller).
 *   próximo cambio (km) = odómetro del último cambio + intervalo
 */
export function oilStatus({ changes = [], plan = {}, current = null, now = Date.now() }) {
  const last = [...changes].filter((c) => c && !c.deletedAt && Number.isFinite(c.ts)).sort((a, b) => b.ts - a.ts)[0] || null;
  const km = Number(plan.oilKm) > 0 ? Number(plan.oilKm) : null, days = Number(plan.oilDays) > 0 ? Number(plan.oilDays) : null;
  const out = { last, intervalKm: km, intervalDays: days, nextKm: null, remainingKm: null, dueTs: null, remainingDays: null, current: null, staleCurrent: false, state: 'ok' };
  if (!last) { out.state = 'sin_registro'; return out; }
  if (!km && !days) { out.state = 'sin_intervalo'; return out; }
  const states = [];
  if (km && Number.isFinite(last.odometer)) {
    out.nextKm = last.odometer + km;
    const cur = current && current.ts >= last.ts && Number.isFinite(current.km) ? current : { ts: last.ts, km: last.odometer, source: 'aceite' };
    out.current = cur;
    out.staleCurrent = readingAge(cur, now).stale;
    out.remainingKm = out.nextKm - cur.km;
    const soon = Math.max(1000, Math.round(km * 0.1));
    states.push(out.remainingKm <= 0 ? 'vencido' : out.remainingKm <= soon ? 'proximo' : 'ok');
  } else if (km) states.push('desconocido');
  if (days) {
    out.dueTs = last.ts + days * DAY;
    out.remainingDays = Math.ceil((out.dueTs - now) / DAY);
    const soonD = Math.max(7, Math.round(days * 0.1));
    states.push(out.remainingDays <= 0 ? 'vencido' : out.remainingDays <= soonD ? 'proximo' : 'ok');
  }
  const rank = { ok: 0, desconocido: 1, proximo: 2, vencido: 3 };
  out.state = states.sort((a, b) => rank[b] - rank[a])[0] || 'ok';
  return out;
}
export const OIL_STATE_TEXT = { sin_registro: 'Sin cambio de aceite registrado', sin_intervalo: 'Intervalo sin configurar', ok: 'Al corriente', proximo: 'Próximo cambio de aceite', vencido: 'Cambio de aceite pendiente', desconocido: 'Sin odómetro del último cambio' };
export function oilLine(st) {
  if (!st) return '';
  const parts = [];
  if (st.nextKm != null) parts.push(st.remainingKm > 0 ? `Restan aproximadamente ${nf(st.remainingKm)} km` : st.remainingKm === 0 ? 'Llegó al kilometraje del cambio' : `Excedido por ${nf(-st.remainingKm)} km`);
  if (st.dueTs != null) parts.push(st.remainingDays > 0 ? `${st.remainingDays} día${st.remainingDays === 1 ? '' : 's'} para la fecha límite` : 'Fecha límite cumplida');
  return parts.join(' · ');
}

/* ===== Llantas: ejes y posiciones ===== */
/* Configuraciones de ejes (se elige y guarda por equipo; nunca se supone) */
export const TIRE_LAYOUTS = {
  t6x4: { label: 'Tractocamión 6×4 (3 ejes: direccional + 2 de tracción)', for: 'tractor', axles: [{ kind: 'dir', dual: false }, { kind: 'trac', dual: true }, { kind: 'trac', dual: true }] },
  t4x2: { label: 'Tractocamión 4×2 (2 ejes: direccional + tracción)', for: 'tractor', axles: [{ kind: 'dir', dual: false }, { kind: 'trac', dual: true }] },
  r1d: { label: '1 eje con llantas dobles', for: 'trailer', axles: [{ kind: 'carga', dual: true }] },
  r2d: { label: '2 ejes con llantas dobles', for: 'trailer', axles: [{ kind: 'carga', dual: true }, { kind: 'carga', dual: true }] },
  r3d: { label: '3 ejes con llantas dobles', for: 'trailer', axles: [{ kind: 'carga', dual: true }, { kind: 'carga', dual: true }, { kind: 'carga', dual: true }] },
  r2s: { label: '2 ejes con llanta sencilla (súper single)', for: 'trailer', axles: [{ kind: 'carga', dual: false }, { kind: 'carga', dual: false }] },
  r3s: { label: '3 ejes con llanta sencilla (súper single)', for: 'trailer', axles: [{ kind: 'carga', dual: false }, { kind: 'carga', dual: false }, { kind: 'carga', dual: false }] },
};
export const layoutsFor = (equipmentType) => Object.entries(TIRE_LAYOUTS).filter(([, l]) => l.for === (equipmentType === 'vehicle' ? 'tractor' : 'trailer'));
const AXLE_KIND = { dir: 'direccional', trac: 'de tracción', carga: '' };
const SIDE = { I: 'izquierda', D: 'derecha' };
const POS = { E: 'exterior', I: 'interior' };
/* Posiciones de una configuración: E2-IE = eje 2, izquierda exterior; E1-D = eje 1 derecha (sencilla) */
export function positionsOf(layoutKey) {
  const l = TIRE_LAYOUTS[layoutKey];
  if (!l) return [];
  const out = [];
  l.axles.forEach((a, i) => {
    const n = i + 1;
    const ids = a.dual ? [`E${n}-IE`, `E${n}-II`, `E${n}-DI`, `E${n}-DE`] : [`E${n}-I`, `E${n}-D`];
    ids.forEach((id) => out.push({ id, axle: n, axleKind: a.kind, dual: a.dual, label: positionLabel(id, a.kind) }));
  });
  return out;
}
export function positionLabel(id, axleKind = '') {
  const m = /^E(\d)-([ID])([EI]?)$/.exec(String(id || ''));
  if (!m) return String(id || '');
  const k = AXLE_KIND[axleKind] ? ` (${AXLE_KIND[axleKind]})` : '';
  return `Eje ${m[1]}${k} · ${SIDE[m[2]]}${m[3] ? ' ' + POS[m[3]] : ''}`;
}
export const isPosition = (layoutKey, id) => positionsOf(layoutKey).some((p) => p.id === id);
/* Validación del reemplazo: cantidad ≥ 1; posiciones válidas, sin repetir y no más que la cantidad */
export function validateTires({ quantity, positions = [], layout }) {
  const err = {};
  if (!Number.isInteger(quantity) || quantity < 1) err.quantity = 'Escribe cuántas llantas se reemplazaron (1 o más).';
  if (quantity > 24) err.quantity = 'La cantidad es mayor que las posiciones de cualquier configuración.';
  if (positions.length) {
    if (!layout || !TIRE_LAYOUTS[layout]) err.positions = 'Configura los ejes del equipo para marcar posiciones.';
    else if (positions.some((p) => !isPosition(layout, p))) err.positions = 'Hay posiciones que no existen en la configuración del equipo.';
    if (new Set(positions).size !== positions.length) err.positions = 'Hay posiciones repetidas.';
    if (Number.isInteger(quantity) && positions.length > quantity) err.positions = `Marcaste ${positions.length} posiciones, pero la cantidad es ${quantity}.`;
  }
  return err;
}
/* Posiciones pendientes de especificar */
export const pendingPositions = (t) => Math.max(0, (t.quantity || 0) - (t.positions || []).length);

/* ===== Disponibilidad (independiente del estado del viaje) ===== */
export const equipmentKey = (type, id) => (type === 'vehicle' ? 'v:' : 't:') + id;
export const keyOfOrder = (o) => equipmentKey(o.equipmentType, o.equipmentType === 'vehicle' ? o.vehicleId : o.trailerId);
export const isOpenOrder = (o) => !!o && !o.deletedAt && isOpenStatus(o.status);
/* En taller = tiene una orden abierta marcada «fuera de servicio» */
export function availabilityOf(orders, key) {
  const open = (orders || []).filter((o) => isOpenOrder(o) && keyOfOrder(o) === key).sort((a, b) => b.inAt - a.inAt);
  const blocking = open.find((o) => o.outOfService !== false) || null;
  return { inShop: !!blocking, order: blocking, open };
}

/* ===== Búsqueda y filtros ===== */
export function matchOrder(o, text, ctx = {}) {
  const q = fold(text);
  if (!q) return true;
  const comps = (ctx.componentNames || []).join(' ');
  const hay = fold([o.folio, ctx.label, ctx.placas, o.reason, o.description, o.notes, comps, fmtD(o.inAt), fmtD(o.outAt), splitTs(o.inAt).date].join(' '));
  return q.split(/\s+/).every((w) => hay.includes(w));
}
/* Órdenes de un periodo (por fecha de ingreso), tipos y estados elegidos */
export function filterOrders(orders, { from = '', to = '', types = null, statuses = null } = {}) {
  const a = isDateStr(from) ? toTs(from, '00:00') : -Infinity, b = isDateStr(to) ? toTs(to, '23:59') + 59999 : Infinity;
  return (orders || []).filter((o) => !o.deletedAt && o.inAt >= a && o.inAt <= b && (!types || !types.size || types.has(o.type)) && (!statuses || !statuses.size || statuses.has(o.status)))
    .sort((x, y) => x.inAt - y.inAt);
}

/* ===== Resumen de un equipo (historial) ===== */
export function equipmentSummary({ orders = [], components = [], issues = [], oil = null, now = Date.now() }) {
  const live = orders.filter((o) => !o.deletedAt).sort((a, b) => b.inAt - a.inAt);
  const ids = new Set(live.map((o) => o.id));
  const comps = components.filter((c) => !c.deletedAt && ids.has(c.orderId));
  const ms = live.reduce((acc, o) => { const d = orderDuration(o, now); return acc + (d ? d.ms : 0); }, 0);
  return {
    count: live.length, last: live[0] || null, open: live.filter(isOpenOrder),
    issues: issues.filter((i) => !i.deletedAt), openIssues: issues.filter((i) => !i.deletedAt && !i.orderId),
    repairs: comps.filter((c) => c.action === 'reparado').length, replacements: comps.filter((c) => c.replaced || c.action === 'reemplazado').length,
    daysInShop: Math.round((ms / DAY) * 10) / 10, oil,
  };
}
