/*
 * Cobranza — almacenamiento (store tripBilling, un registro por viaje con clave tripId).
 * Los viajes son los de Operadores (store operatorTrips); aquí solo se guarda su estado de cobro y sus demoras en planta.
 * Un viaje sin registro está «por cobrar» y sin demoras. Los viajes eliminados en Operadores dejan de aparecer.
 * Auditoría: createdAt/By, updatedAt/By y revisions[] (valores anteriores). Se carga al entrar a Administración o Cobranza.
 */
import * as db from './db.js';
import { allTrips, operatorList } from './operators.js';
import { blankBilling, billingItems, DELAY_CONCEPT } from '../domain/billing/billing.js';

let cache = null;
export async function loadBilling(force = false) {
  if (!cache || force) cache = new Map((await db.all(db.S.tripBilling)).map((r) => [r.tripId, r]));
  return cache;
}
export const resetBillingCache = () => { cache = null; };
function actor() { try { const s = JSON.parse(sessionStorage.getItem('pcs-session') || 'null'); return (s && s.user) || 'local'; } catch (e) { return 'local'; } }

export const billingOf = (tripId) => (cache && cache.get(tripId)) || null;
/* Todos los viajes con su cobranza (requiere loadBilling) */
export function items() {
  const ops = new Map(operatorList().map((o) => [o.id, o]));
  return billingItems(allTrips(), billingOf, (id) => ops.get(id) || null);
}
export const itemOf = (tripId) => items().find((x) => x.id === tripId) || null;

async function write(tripId, mutate) {
  await loadBilling();
  if (!allTrips().some((t) => t.id === tripId)) throw new Error('El viaje ya no existe en Operadores.');
  const now = Date.now(), who = actor(), prev = cache.get(tripId);
  const base = prev ? JSON.parse(JSON.stringify(prev)) : { ...blankBilling(tripId), createdAt: now, createdBy: who, revisions: [] };
  const { revisions = [], ...before } = base;
  const next = mutate(JSON.parse(JSON.stringify(before)));
  const out = { ...next, tripId, updatedAt: now, updatedBy: who, revisions: prev ? [...revisions, { at: now, by: who, before }].slice(-30) : [] };
  cache.set(tripId, out);
  await db.put(db.S.tripBilling, out);
  return out;
}

/* Cobro del viaje: pagado (con fecha y referencia) o por cobrar */
export function setTripPayment(tripId, { paid, paidDate = '', reference = '', notes = '' }) {
  return write(tripId, (b) => ({ ...b, paid: !!paid, paidDate: paid ? paidDate : '', reference: paid ? reference : '', notes }));
}
/* Varios viajes pagados de una vez, con la misma fecha y referencia de pago. No toca las demoras ni los ya pagados. */
/* paidDate puede ir vacía cuando se sabe que está pagado pero no cuándo (importaciones); source deja rastro del origen. */
export async function setTripsPaid(tripIds, { paidDate = '', reference = '', source = '' }) {
  await loadBilling();
  let n = 0;
  for (const id of tripIds) {
    const cur = cache.get(id);
    if (cur && cur.paid) continue;
    await write(id, (b) => ({ ...b, paid: true, paidDate, reference, ...(source ? { paidSource: source } : {}) }));
    n += 1;
  }
  return n;
}
/* Demora en planta: alta o edición (por id) */
export function saveDelay(tripId, delay) {
  return write(tripId, (b) => {
    const d = {
      id: delay.id || db.uid('dm_'), date: delay.date, concept: delay.concept || DELAY_CONCEPT, amount: delay.amount, notes: delay.notes || '',
      paid: !!delay.paid, paidDate: delay.paid ? delay.paidDate || '' : '', reference: delay.paid ? delay.reference || '' : '',
    };
    const list = b.delays || [], i = list.findIndex((x) => x.id === d.id);
    if (i >= 0) list[i] = d; else list.push(d);
    return { ...b, delays: list };
  });
}
export function deleteDelay(tripId, delayId) {
  return write(tripId, (b) => ({ ...b, delays: (b.delays || []).filter((x) => x.id !== delayId) }));
}
