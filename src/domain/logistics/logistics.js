/*
 * Logística — reglas puras (sin almacenamiento ni DOM), para poder probarlas por separado.
 * Una operación está ABIERTA mientras no tenga closedAt: es la asignación actual de la unidad.
 * Las cerradas forman el historial. Una unidad sin operación abierta se considera Inactiva.
 */
import { DEFAULT_STATUS, STATUS_ORDER, isWorking, showOnHome, statusOf } from '../../config/logistics.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const isOpen = (op) => !!op && !op.closedAt && !op.deletedAt;

/* Operación abierta de una unidad (si por datos antiguos o importados hubiera varias, la más reciente) */
export function openOpOf(ops, vehicleId) {
  return ops.filter((o) => o.vehicleId === vehicleId && isOpen(o)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
}
export const historyOf = (ops, vehicleId) => ops.filter((o) => o.vehicleId === vehicleId && !o.deletedAt && o.closedAt).sort((a, b) => b.closedAt - a.closedAt);

/*
 * Tablero: una entrada por unidad del catálogo con su operación abierta (o Inactiva sin operación).
 * units: [{ id, ... }]  ops: registros de logisticsOperations
 */
export function board(units, ops) {
  return units.map((u) => { const op = openOpOf(ops, u.id); return { unit: u, op, status: op ? op.status : DEFAULT_STATUS }; });
}
/* Unidades que aparecen en Inicio: estado ≠ Inactiva y estado ≠ Vacío (solo operaciones abiertas) */
export const homeEntries = (entries) => entries.filter((e) => e.op && showOnHome(e.status))
  .sort((a, b) => statusOf(a.status).rank - statusOf(b.status).rank || (b.op.updatedAt || 0) - (a.op.updatedAt || 0));

export function countByStatus(entries) {
  const c = { all: entries.length };
  STATUS_ORDER.forEach((s) => { c[s.key] = 0; });
  entries.forEach((e) => { c[e.status] = (c[e.status] || 0) + 1; });
  return c;
}

/*
 * Filtros y buscador. f = { status:'all'|key, division:'all'|'puerto'|'campo', type:'all'|'chasis'|'jaula'|'tolva', text }
 * view(entry) → { eco, placas, operator, trailer, trailerType } con los datos actuales del catálogo.
 */
export function filterEntries(entries, f, view) {
  const q = fold(f.text).trim();
  return entries.filter((e) => {
    if (f.status && f.status !== 'all' && e.status !== f.status) return false;
    const v = view(e);
    if (f.division && f.division !== 'all' && (!e.op || e.op.division !== f.division)) return false;
    if (f.type && f.type !== 'all' && v.trailerType !== f.type) return false;
    if (!q) return true;
    const o = e.op || {};
    const hay = [v.eco, v.label, v.placas, v.operator, v.trailer, o.reference, o.origin, o.destination, o.deliveryPlace].map(fold).join('\u0001');
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
}
export function groupByStatus(entries) {
  return STATUS_ORDER.map((s) => ({ status: s, items: entries.filter((e) => e.status === s.key) })).filter((g) => g.items.length);
}

/*
 * Conflictos al crear o editar una operación (selfId = la operación que se edita).
 *   unit      la unidad ya tiene una operación abierta en estado de trabajo → se bloquea
 *   unitOpen  la unidad tiene una operación abierta sin trabajo (Vacío/Inactiva) → se cerrará y pasará al historial
 *   operator  el operador aparece en otra operación abierta → solo advertencia
 *   trailer   el remolque está asignado a otra operación abierta → advertencia con confirmación
 */
export function conflicts(ops, { vehicleId, operatorId, trailerId }, selfId = null) {
  const open = ops.filter((o) => isOpen(o) && o.id !== selfId);
  const unitOp = vehicleId ? open.find((o) => o.vehicleId === vehicleId) || null : null;
  return {
    unit: unitOp && isWorking(unitOp.status) ? unitOp : null,
    unitOpen: unitOp && !isWorking(unitOp.status) ? unitOp : null,
    operator: operatorId ? open.find((o) => o.operatorId === operatorId && o.vehicleId !== vehicleId) || null : null,
    trailer: trailerId ? open.find((o) => o.trailerId === trailerId && o.vehicleId !== vehicleId) || null : null,
  };
}

/* Sugerencias de texto (lugares de entrega, orígenes, destinos): las más usadas y recientes primero */
export function suggestions(values) {
  const m = new Map();
  values.forEach(({ v, at }) => {
    const t = String(v || '').trim(); if (!t) return;
    const k = fold(t), cur = m.get(k);
    if (cur) { cur.n += 1; if ((at || 0) > cur.at) { cur.at = at || 0; cur.v = t; } } else m.set(k, { v: t, n: 1, at: at || 0 });
  });
  return [...m.values()].sort((a, b) => b.n - a.n || b.at - a.at).map((x) => x.v);
}
