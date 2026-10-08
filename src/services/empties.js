/*
 * Control de vacíos — almacenamiento (stores emptyContainers y emptyContainerEvents).
 * No crea viajes, operadores, unidades ni remolques: guarda sus IDs (tripId, logisticsOperationId, vehicleId, trailerId,
 * originalOperatorId, deliveryOperatorId, yardId) y resuelve los nombres al mostrar.
 * Registro: { id, containerNumber, tripId, logisticsOperationId, documentId, vehicleId, trailerId, division, origin, destination,
 *   reference, originalOperatorId, deliveryOperatorId, externalCarrier, externalCarrierName, externalDriverName, externalVehicle,
 *   yardId, scheduledDeliveryDate, scheduledDeliveryTime, actualDeliveryDate, actualDeliveryTime, status, notes,
 *   emptiedAt, deliveredAt, createdAt, createdBy, updatedAt, updatedBy }
 * Evento: { id, emptyContainerId, containerNumber, eventType, previousStatus, newStatus, date, time, details, createdAt, createdBy }
 * Un contenedor solo puede tener un control abierto: se identifica por containerNumber (y tripId cuando hace falta).
 * Entregar NO borra el registro: sale de pendientes y queda en el historial.
 */
import * as db from './db.js';
import { listAll } from './catalogs.js';
import { vehicles as fleetUnits } from './fuel.js';
import { operatorById, allTrips } from './operators.js';
import { getDocument } from './documents.js';
import { cleanContainer, containersIn, isContainer, isOpenEmpty, isSchedulable, emptyStatus, dayStr, hmStr, EVENT_LABELS } from '../domain/empties/empties.js';
import { fmtFecha } from '../domain/shared/format.js';

let cache = null, events = null;
export async function loadEmpties(force = false) {
  if (!cache || force) { cache = await db.all(db.S.emptyContainers); events = await db.all(db.S.emptyContainerEvents); }
  return cache;
}
function actor() { try { const s = JSON.parse(sessionStorage.getItem('pcs-session') || 'null'); return (s && s.user) || 'local'; } catch (e) { return 'local'; } }

/* ===== Aviso de cambios (pantallas abiertas y otras pestañas) ===== */
const EVT = 'empties:change';
let bc = null;
try { bc = new BroadcastChannel('pcs-empties'); bc.onmessage = async () => { await loadEmpties(true); window.dispatchEvent(new CustomEvent(EVT)); }; } catch (e) { /* */ }
function changed() { window.dispatchEvent(new CustomEvent(EVT)); try { if (bc) bc.postMessage(Date.now()); } catch (e) { /* */ } }
export function onEmptiesChange(fn) { window.addEventListener(EVT, fn); return () => window.removeEventListener(EVT, fn); }

/* ===== Consultas ===== */
export const all = () => (cache || []).filter((r) => !r.deletedAt);
export const byId = (id) => all().find((r) => r.id === id) || null;
export const openList = () => all().filter(isOpenEmpty);
export const activeByContainer = (num) => { const c = cleanContainer(num); return c ? openList().find((r) => r.containerNumber === c) || null : null; };
export const openForVehicle = (vehicleId) => openList().filter((r) => r.vehicleId === vehicleId);
export const openForOperation = (opId) => openList().filter((r) => r.logisticsOperationId === opId);
export const eventsOf = (id) => (events || []).filter((e) => e.emptyContainerId === id).sort((a, b) => b.createdAt - a.createdAt);
export const recentEvents = (n = 15) => [...(events || [])].sort((a, b) => b.createdAt - a.createdAt).filter((e) => byId(e.emptyContainerId)).slice(0, n);
export const yardById = (id) => (id ? listAll('yards').find((y) => y.id === id) || null : null);

/* Datos visibles del registro, con los nombres actuales del catálogo */
export function view(r) {
  const u = r.vehicleId ? fleetUnits().find((x) => x.id === r.vehicleId) : null;
  const t = r.trailerId ? listAll('trailers').find((x) => x.id === r.trailerId) : null;
  const dop = r.deliveryOperatorId ? operatorById(r.deliveryOperatorId) : null, oop = r.originalOperatorId ? operatorById(r.originalOperatorId) : null;
  const y = yardById(r.yardId), trip = r.tripId ? allTrips().find((x) => x.id === r.tripId) : null;
  return {
    unit: u ? u.label : '', placas: u ? u.placas : '', trailer: t ? t.placas : '', trailerType: t ? t.type || '' : '',
    deliveryOperator: dop ? dop.name : '', deliveryOperatorRec: dop, originalOperator: oop ? oop.name : '', yard: y ? y.name : '', yardRec: y,
    trip, tripText: trip ? `${fmtFecha(trip.date)} ${trip.origin} ${trip.destination} ${trip.reference || ''}` : '',
    deliverer: r.externalCarrier ? [r.externalCarrierName, r.externalDriverName].filter(Boolean).join(' · ') : dop ? dop.name : '',
  };
}

/* ===== Escritura con historial ===== */
async function addEvent(rec, eventType, { previousStatus = null, details = '' } = {}) {
  const now = new Date(), e = {
    id: db.uid('ev_'), emptyContainerId: rec.id, containerNumber: rec.containerNumber, eventType, previousStatus, newStatus: rec.status,
    date: dayStr(now), time: hmStr(now), details, createdAt: now.getTime(), createdBy: actor(),
  };
  events.push(e);
  await db.put(db.S.emptyContainerEvents, e);
  return e;
}
async function write(rec) {
  const i = cache.findIndex((x) => x.id === rec.id);
  if (i >= 0) cache[i] = rec; else cache.push(rec);
  await db.put(db.S.emptyContainers, rec);
}

/* Crea un control (o devuelve el abierto del mismo contenedor). Devuelve { record, created } */
export async function create(data, { source = 'manual' } = {}) {
  await loadEmpties();
  const containerNumber = cleanContainer(data.containerNumber);
  if (!isContainer(containerNumber)) throw new Error('El número de contenedor debe tener 4 letras y 7 números.');
  const existing = activeByContainer(containerNumber);
  if (existing) return { record: existing, created: false };
  const now = Date.now(), who = actor();
  const rec = {
    tripId: null, logisticsOperationId: null, documentId: null, vehicleId: null, trailerId: null, division: '', origin: '', destination: '', reference: '',
    originalOperatorId: null, deliveryOperatorId: null, externalCarrier: false, externalCarrierName: '', externalDriverName: '', externalVehicle: '',
    yardId: null, scheduledDeliveryDate: '', scheduledDeliveryTime: '', actualDeliveryDate: '', actualDeliveryTime: '', notes: '',
    ...data, containerNumber, id: db.uid('ec_'), status: 'pending', source, emptiedAt: data.emptiedAt || now, deliveredAt: null,
    createdAt: now, createdBy: who, updatedAt: now, updatedBy: who,
  };
  if (!rec.deliveryOperatorId && rec.originalOperatorId && !rec.externalCarrier) rec.deliveryOperatorId = rec.originalOperatorId;   /* sugerencia editable */
  await write(rec);
  await addEvent(rec, 'created', { details: source === 'logistics' ? 'Desde Logística (estado Vacío)' : 'Registro manual' });
  changed();
  return { record: rec, created: true };
}

/*
 * Actualiza datos de la entrega y registra un evento por cada cambio relevante.
 * Si queda con quién entrega, patio y fecha, pasa de «Pendiente de asignar» a «Programado».
 */
export async function update(id, patch) {
  await loadEmpties();
  const prev = byId(id); if (!prev) throw new Error('El registro ya no existe.');
  const next = { ...prev, ...patch, updatedAt: Date.now(), updatedBy: actor() };
  if (next.status === 'pending' && isSchedulable(next)) next.status = 'scheduled';
  if (next.status === 'scheduled' && !isSchedulable(next)) next.status = 'pending';
  await write(next);
  const v = view(next), ev = [];
  if (prev.externalCarrier !== next.externalCarrier || prev.externalCarrierName !== next.externalCarrierName || prev.externalDriverName !== next.externalDriverName || prev.externalVehicle !== next.externalVehicle) {
    ev.push(['carrier', next.externalCarrier ? `Otro transportista: ${[next.externalCarrierName, next.externalDriverName, next.externalVehicle].filter(Boolean).join(' · ')}` : 'Lo entrega PERCONSUR']);
  }
  if (!next.externalCarrier && prev.deliveryOperatorId !== next.deliveryOperatorId) ev.push(['operator', v.deliveryOperator || 'Sin operador']);
  if (prev.yardId !== next.yardId) ev.push(['yard', v.yard || 'Sin patio']);
  if (prev.scheduledDeliveryDate !== next.scheduledDeliveryDate || prev.scheduledDeliveryTime !== next.scheduledDeliveryTime) ev.push(['schedule', [fmtFecha(next.scheduledDeliveryDate), next.scheduledDeliveryTime].filter(Boolean).join(' ') || 'Sin fecha']);
  if (prev.vehicleId !== next.vehicleId) ev.push(['vehicle', v.unit || 'Sin unidad']);
  if (prev.actualDeliveryDate !== next.actualDeliveryDate || prev.actualDeliveryTime !== next.actualDeliveryTime) if (next.status === 'delivered') ev.push(['delivery_fix', `${fmtFecha(next.actualDeliveryDate)} ${next.actualDeliveryTime}`]);
  if ((prev.notes || '') !== (next.notes || '')) ev.push(['notes', next.notes ? 'Observaciones actualizadas' : 'Observaciones borradas']);
  for (const [t, d] of ev) await addEvent(next, t, { previousStatus: prev.status, details: d });
  if (prev.status !== next.status) await addEvent(next, 'status', { previousStatus: prev.status, details: `${emptyStatus(prev.status).label} → ${emptyStatus(next.status).label}` });
  changed();
  return next;
}

export async function markInTransit(id) {
  const prev = byId(id); if (!prev || prev.status === 'in_transit' || prev.status === 'delivered') return prev;
  const next = { ...prev, status: 'in_transit', updatedAt: Date.now(), updatedBy: actor() };
  await write(next); await addEvent(next, 'in_transit', { previousStatus: prev.status, details: view(next).yard ? `Rumbo a ${view(next).yard}` : '' });
  changed(); return next;
}
/* Entregado: guarda fecha y hora reales (corregibles) y deliveredAt; el registro se conserva */
export async function markDelivered(id, { date, time }) {
  const prev = byId(id); if (!prev) throw new Error('El registro ya no existe.');
  const now = Date.now();
  const next = { ...prev, status: 'delivered', actualDeliveryDate: date, actualDeliveryTime: time, deliveredAt: now, updatedAt: now, updatedBy: actor() };
  await write(next);
  const v = view(next);
  await addEvent(next, 'delivered', { previousStatus: prev.status, details: [v.yard, v.deliverer, `${fmtFecha(date)} ${time}`].filter(Boolean).join(' · ') });
  changed(); return next;
}
/* Reabrir un entregado por error (conserva el historial) */
export async function reopen(id) {
  const prev = byId(id); if (!prev || prev.status !== 'delivered') return prev;
  if (activeByContainer(prev.containerNumber)) throw new Error('Este contenedor ya tiene otro control abierto.');
  const next = { ...prev, status: isSchedulable(prev) ? 'scheduled' : 'pending', deliveredAt: null, updatedAt: Date.now(), updatedBy: actor() };
  await write(next); await addEvent(next, 'reopened', { previousStatus: 'delivered' }); changed(); return next;
}

/*
 * Desde Logística: la operación pasó a «Vacío». Toma el contenedor del viaje relacionado (referencia), de la
 * referencia de la operación o del documento relacionado, sin pedirlo de nuevo. Un control por contenedor.
 * Devuelve { created:[registros], existing:[registros], none:boolean }.
 */
export async function fromOperation(op) {
  await loadEmpties();
  const trip = op.tripId ? allTrips().find((t) => t.id === op.tripId) || null : null;
  let nums = [...containersIn(trip && trip.reference), ...containersIn(op.reference)];
  const docId = op.documentId || (trip && trip.documentId);
  if (!nums.length && docId) { const d = await getDocument(docId); if (d && d.summary) nums = containersIn((d.summary.contenedores || []).join(' ')); }
  nums = [...new Set(nums)];
  const out = { created: [], existing: [], none: !nums.length };
  for (const n of nums) {
    const r = await create({
      containerNumber: n, tripId: trip ? trip.id : op.tripId || null, logisticsOperationId: op.id, documentId: docId || null,
      vehicleId: op.vehicleId || null, trailerId: op.trailerId || null, originalOperatorId: op.operatorId || null,
      division: op.division || (trip && trip.division) || '', origin: op.origin || (trip && trip.origin) || '', destination: op.destination || (trip && trip.destination) || '',
      reference: op.reference || (trip && trip.reference) || '',
    }, { source: 'logistics' });
    if (r.created) out.created.push(r.record);
    else {
      /* Mismo contenedor ya abierto: se reutiliza y se completan los vínculos que falten */
      const e = r.record, fill = {};
      for (const [k, val] of [['logisticsOperationId', op.id], ['tripId', trip ? trip.id : null], ['vehicleId', op.vehicleId], ['trailerId', op.trailerId], ['originalOperatorId', op.operatorId]]) if (!e[k] && val) fill[k] = val;
      const rec = Object.keys(fill).length ? await update(e.id, fill) : e;
      await addEvent(rec, 'redetected', { details: 'La operación volvió a marcarse como Vacío' });
      out.existing.push(rec);
    }
  }
  if (out.existing.length) changed();
  return out;
}

/* Para proteger el catálogo: ¿el patio está en un control abierto? */
export async function yardInUse(yardId) { await loadEmpties(); return openList().some((r) => r.yardId === yardId); }
export const eventLabel = (e) => EVENT_LABELS[e.eventType] || e.eventType;
