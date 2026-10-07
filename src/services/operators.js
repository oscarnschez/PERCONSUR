/*
 * Control de operadores — almacenamiento.
 * Fuente de operadores: el catálogo existente (store "operators", con IDs persistentes). No se crean operadores aquí.
 * Entidades independientes, relacionadas por operatorId:
 *   operatorSettings     { operatorId, startDate, cutoffDate, satMode, satManual, weekly, minEnabled, minAmount, history[] }
 *   operatorTrips        { id, operatorId, division, date, origin, destination, fare, travelExpenses, commissionRate,
 *                          minEnabled, minAmount, baseCommission, expandedCommission, finalCommission, isExpanded,
 *                          notes, documentId, source, ...auditoría }
 *   operatorLoans        { id, operatorId, date, amount, concept, notes, ...auditoría }
 *   operatorAdjustments  { id, operatorId, date, amount, target, direction, reason, notes, ...auditoría }
 * Auditoría en cada registro: createdAt, createdBy, updatedAt, updatedBy, revisions[] (valores anteriores al editar)
 * y borrado recuperable (deletedAt, deletedBy): lo eliminado deja de contar pero queda en el respaldo.
 * Montos en centavos. documentId permite relacionar después un viaje con un documento de Puerto/Campo.
 */
import * as db from './db.js';
import { listAll } from './catalogs.js';
import { getCompany } from './companies.js';
import { DEFAULT_SETTINGS, settingsOf, computeOperator, todayStr } from '../domain/operators/balance.js';
import { tripTaxes, taxFields } from '../domain/operators/taxes.js';

const cache = { settings: new Map(), trips: [], loans: [], adjustments: [], statements: [] };
const STORE = { trips: db.S.operatorTrips, loans: db.S.operatorLoans, adjustments: db.S.operatorAdjustments };

export async function loadOperatorData() {
  cache.settings = new Map((await db.all(db.S.operatorSettings)).map((s) => [s.operatorId, s]));
  cache.trips = await db.all(db.S.operatorTrips);
  cache.loans = await db.all(db.S.operatorLoans);
  cache.adjustments = await db.all(db.S.operatorAdjustments);
  cache.statements = await db.all(db.S.operatorStatements);
}

/* Usuario de la sesión actual (para auditoría) */
function actor() { try { const s = JSON.parse(sessionStorage.getItem('pcs-session') || 'null'); return (s && s.user) || 'local'; } catch (e) { return 'local'; } }

/* ===== Operadores (del catálogo) ===== */
export function operatorList() {
  return listAll('operators').map((o) => ({ ...o, companyShort: getCompany(o.company).short }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.companyShort.localeCompare(b.companyShort));
}
export const operatorById = (id) => operatorList().find((o) => o.id === id) || null;
/* Todos los viajes vigentes de todos los operadores (los usa Cobranza) */
export const allTrips = () => cache.trips.filter((t) => !t.deletedAt);

export function recordsOf(operatorId) {
  return {
    settings: cache.settings.get(operatorId) || null,
    trips: cache.trips.filter((t) => t.operatorId === operatorId),
    loans: cache.loans.filter((l) => l.operatorId === operatorId),
    adjustments: cache.adjustments.filter((a) => a.operatorId === operatorId),
  };
}
export const settingsFor = (operatorId) => settingsOf(cache.settings.get(operatorId));
export function hasRecords(operatorId) {
  const r = recordsOf(operatorId);
  return !!(r.settings || r.trips.length || r.loans.length || r.adjustments.length);
}
export function computeFor(operatorId, opts) { return computeOperator(recordsOf(operatorId), opts); }

/* ===== Guardado genérico con auditoría ===== */
async function saveRecord(kind, rec) {
  if (!rec.operatorId || !operatorById(rec.operatorId)) throw new Error('El registro debe pertenecer a un operador del catálogo.');
  const now = Date.now(), who = actor();
  const arr = cache[kind];
  const i = rec.id ? arr.findIndex((x) => x.id === rec.id) : -1;
  let out;
  if (i >= 0) {
    const prev = arr[i];
    const { revisions = [], ...before } = prev;
    out = { ...prev, ...rec, updatedAt: now, updatedBy: who, revisions: [...revisions, { at: now, by: who, before }].slice(-30) };
    arr[i] = out;
  } else {
    out = { ...rec, id: db.uid(kind.slice(0, 2) + '_'), createdAt: now, createdBy: who, updatedAt: now, updatedBy: who, revisions: [] };
    arr.push(out);
  }
  await db.put(STORE[kind], out);
  return out;
}
async function softDelete(kind, id) {
  const r = cache[kind].find((x) => x.id === id);
  if (!r) return;
  r.deletedAt = Date.now(); r.deletedBy = actor();
  await db.put(STORE[kind], r);
}
export const saveTrip = (t) => saveRecord('trips', { documentId: null, source: 'manual', ...t });
export const deleteTrip = (id) => softDelete('trips', id);
/*
 * Cambia los impuestos de varios viajes a la vez. change = { applyVat, applyIsr, applyVatWithholding }, cada uno
 * true (aplicar), false (quitar) o null/undefined (no cambiar). Solo toca los campos fiscales: tarifa, gastos y
 * comisión quedan igual. Los viajes que ya estaban así no se reescriben. Devuelve cuántos viajes cambiaron.
 */
export async function setTripsTaxes(tripIds, change) {
  let n = 0;
  for (const id of tripIds) {
    const t = cache.trips.find((x) => x.id === id && !x.deletedAt);
    if (!t) continue;
    const cur = tripTaxes(t), pick = (k) => (typeof change[k] === 'boolean' ? change[k] : cur[k]);
    const flags = { applyVat: pick('applyVat'), applyIsr: pick('applyIsr'), applyVatWithholding: pick('applyVatWithholding') };
    if (flags.applyVat === cur.applyVat && flags.applyIsr === cur.applyIsr && flags.applyVatWithholding === cur.applyVatWithholding) continue;
    await saveRecord('trips', { id: t.id, operatorId: t.operatorId, ...taxFields(t.fare, flags, t) });
    n += 1;
  }
  return n;
}
/* Cambia solo la Referencia de un viaje (importaciones). No toca tarifa, gastos ni comisión; deja rastro en revisions. */
export function setTripReference(tripId, reference, source = '') {
  const t = cache.trips.find((x) => x.id === tripId && !x.deletedAt);
  if (!t) throw new Error('El viaje ya no existe.');
  return saveRecord('trips', { id: t.id, operatorId: t.operatorId, reference, ...(source ? { referenceSource: source } : {}) });
}
export const saveLoan = (l) => saveRecord('loans', l);
export const deleteLoan = (id) => softDelete('loans', id);
export const saveAdjustment = (a) => saveRecord('adjustments', a);
export const deleteAdjustment = (id) => softDelete('adjustments', id);

/* ===== Configuración (con historial de cambios: nunca se sobrescribe en silencio) ===== */
const LABELS = { startDate: 'Fecha de inicio', cutoffDate: 'Calcular hasta', satMode: 'Sábados', satManual: 'Sábados (manual)', weekly: 'Monto semanal', minEnabled: 'Comisión mínima garantizada', minAmount: 'Comisión mínima' };
export async function saveSettings(operatorId, next, describe) {
  const prev = settingsOf(cache.settings.get(operatorId));
  const changes = [];
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) changes.push({ field: k, label: LABELS[k], from: describe(k, prev[k]), to: describe(k, next[k]) });
  }
  if (!changes.length) return false;
  const now = Date.now(), who = actor();
  const stored = cache.settings.get(operatorId);
  const rec = {
    ...prev, ...next, operatorId,
    createdAt: stored ? stored.createdAt : now, createdBy: stored ? stored.createdBy : who, updatedAt: now, updatedBy: who,
    history: [...((stored && stored.history) || []), { at: now, by: who, date: todayStr(), changes }].slice(-200),
  };
  cache.settings.set(operatorId, rec);
  await db.put(db.S.operatorSettings, rec);
  return true;
}

/* ===== Rutas usadas (sugerencias; nunca obligatorias) ===== */
export function routeSuggestions() {
  const count = (arr) => { const m = new Map(); arr.filter(Boolean).forEach((x) => { const k = x.trim(); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k); };
  const live = cache.trips.filter((t) => !t.deletedAt).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const pairs = []; const seen = new Set();
  for (const t of live) { const k = `${t.origin}\u0000${t.destination}`; if (!seen.has(k) && t.origin && t.destination) { seen.add(k); pairs.push({ origin: t.origin, destination: t.destination }); } }
  return { origins: count(live.map((t) => t.origin)), destinations: count(live.map((t) => t.destination)), routes: pairs.slice(0, 8) };
}

/* ===== Estados de cuenta emitidos =====
 * Solo se guardan folio y metadatos (y el PDF emitido en attachments). Los importes NO se copian:
 * el documento siempre se arma con los registros actuales mediante computeOperator().
 * Folio EO-AAAAMMDD-NNN: consecutivo diario (store counters, id "eo:AAAAMMDD").
 */
export const statementsOf = (operatorId) => cache.statements.filter((s) => s.operatorId === operatorId).sort((a, b) => b.issuedAt - a.issuedAt);
export async function peekStatementNumber(issued) {
  const cur = await db.get(db.S.counters, 'eo:' + issued.replace(/-/g, ''));
  return ((cur && cur.n) || 0) + 1;
}
export async function reserveStatementNumber(issued) {
  const id = 'eo:' + issued.replace(/-/g, '');
  return db.tx([db.S.counters], async ({ store, req }) => {
    const st = store(db.S.counters), cur = await req(st.get(id)), n = ((cur && cur.n) || 0) + 1;
    st.put({ id, kind: 'estado-cuenta', day: issued, n });
    return n;
  });
}
export async function saveStatement(rec) {
  const out = { ...rec, id: rec.id || db.uid('eo_'), issuedAt: Date.now(), createdBy: actor() };
  cache.statements.push(out);
  await db.put(db.S.operatorStatements, out);
  return out;
}

/* Para la integración futura con documentos de Puerto/Campo (evita duplicar un viaje del mismo documento) */
export const tripsByDocument = (documentId) => cache.trips.filter((t) => t.documentId === documentId && !t.deletedAt);
