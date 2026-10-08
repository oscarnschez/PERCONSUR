/*
 * Destino a marcar en el mapa de una unidad, según su operación de Logística:
 *   En ruta a destino / Descargando → documento relacionado (operación o su viaje):
 *       Nota de entrega / recepción: dirección de entrega (destNombre + destDir); en Exportación, la terminal portuaria
 *       (catálogo «Terminales portuarias» con su dirección o punto fijado). Asignación de Campo: la planta del catálogo.
 *       Sin documento: el «Lugar de entrega» si coincide con un catálogo, o la ciudad destino (aproximada).
 *   En ruta vacío / Vacío → patio asignado en Control de vacíos (catálogo «Patios de vacíos»).
 * Todo se resuelve sin bloquear: targetOf() responde con lo que ya se sabe y, si falta leer la nota o buscar la
 * dirección, lo hace en segundo plano y avisa con onTargetsChange para volver a dibujar.
 */
import { getDocument } from './documents.js';
import { listAll, plantByName } from './catalogs.js';
import { allTrips } from './operators.js';
import * as ec from './empties.js';
import { cached, failed, locate, placeLoc, locatePlace, onGeoChange } from './geocode.js';

const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const notify = () => window.dispatchEvent(new CustomEvent('geo:change'));
export const onTargetsChange = onGeoChange;

/* Datos de los documentos relacionados (de IndexedDB; se vuelven a leer cada 10 min por si el documento cambió) */
const DOC_TTL = 10 * 60 * 1000;
const docs = new Map(), docPending = new Set();
function docOf(id) {
  if (!id) return null;
  const c = docs.get(id);
  if ((!c || Date.now() - c.at > DOC_TTL) && !docPending.has(id)) {
    docPending.add(id);
    getDocument(id).then((d) => docs.set(id, { at: Date.now(), v: d ? { type: d.type, folio: d.folio || '', data: d.data || {} } : null }))
      .catch(() => docs.set(id, { at: Date.now(), v: c ? c.v : null })).finally(() => { docPending.delete(id); notify(); });
  }
  return c ? c.v : undefined;
}

const CATALOG_KIND = { places: 'place', plants: 'plant', terminals: 'terminal', yards: 'yard' };
const CATALOG_TITLE = { places: 'Destino', plants: 'Planta', terminals: 'Terminal', yards: 'Patio de entrega' };
const byName = (kind, name) => (name ? listAll(kind).find((x) => fold(x.name) === fold(name)) || null : null);
const fromCatalog = (kind, rec, name, source) => ({ kind: CATALOG_KIND[kind], title: CATALOG_TITLE[kind], name: (rec && rec.name) || name, address: (rec && rec.address) || '', rec, catalog: kind, source });

function fallback(op) {
  if (op.deliveryPlace) {
    for (const kind of ['places', 'plants', 'terminals', 'yards']) { const r = byName(kind, op.deliveryPlace); if (r) return fromCatalog(kind, r, op.deliveryPlace, 'Lugar de entrega de la operación'); }
  }
  if (op.destination) return { kind: 'city', title: 'Destino', name: op.destination, address: op.destination, source: 'Destino de la operación' };
  return null;
}

/* Qué se debe marcar (sin la ubicación). undefined = todavía leyendo el documento relacionado. */
export function specOf(op) {
  if (!op) return null;
  if (op.status === 'empty_transit' || op.status === 'empty') {
    const list = ec.openList().filter((r) => r.logisticsOperationId === op.id || r.vehicleId === op.vehicleId)
      .sort((a, b) => (b.logisticsOperationId === op.id) - (a.logisticsOperationId === op.id) || (b.updatedAt || 0) - (a.updatedAt || 0));
    const r = list.find((x) => x.yardId);
    if (r) { const y = listAll('yards').find((x) => x.id === r.yardId) || null; return fromCatalog('yards', y, 'Patio', `Control de vacíos · ${r.containerNumber || 'contenedor'}`); }
    return list.length ? { kind: 'yard', title: 'Patio de entrega', name: 'Patio sin asignar', address: '', missing: 'yard', source: `Control de vacíos · ${list[0].containerNumber || 'contenedor'}` } : null;
  }
  if (op.status === 'inactive') return null;
  const trip = op.tripId ? allTrips().find((t) => t.id === op.tripId) || null : null;
  const d = docOf(op.documentId || (trip && trip.documentId) || null);
  if (d === undefined) return undefined;
  if (d && d.type === 'puerto') {
    const x = d.data, src = `Nota ${d.folio}`;
    const term = x.terminal ? fromCatalog('terminals', byName('terminals', x.terminal), x.terminal, src) : null;
    const deliv = x.destDir ? { kind: 'delivery', title: 'Destino', name: x.destNombre || 'Lugar de entrega', address: x.destDir, source: src } : null;
    if (x.modal === 'exp') return term || deliv || fallback(op);
    return deliv || (x.modal === 'vac' ? term : null) || fallback(op);
  }
  if (d && d.type === 'campo' && d.data.planta) return fromCatalog('plants', plantByName(d.data.planta), d.data.planta, `Asignación ${d.folio}`);
  return fallback(op);
}

/* Búsquedas que fallaron por conexión: se reintentan después de un minuto */
const netErr = new Map();
function kick(fn, addr) {
  const t = netErr.get(addr);
  if (t && Date.now() - t < 60000) return 'offline';
  fn().then(() => netErr.delete(addr)).catch(() => { netErr.set(addr, Date.now()); notify(); });
  return 'searching';
}

/*
 * Destino listo para dibujar:
 *   { kind, title, name, address, source, loc: {lat,lng,precision}|null,
 *     state: ok | searching | notfound | noaddress | offline | missing, edit: {type:'catalog',kind,id} | {type:'address',address} | null }
 * null = sin destino que marcar; undefined = todavía resolviendo.
 */
export function targetOf(op) {
  const spec = specOf(op);
  if (!spec) return spec;
  const out = { ...spec, loc: null, state: 'ok', edit: null };
  if (spec.missing) { out.state = 'missing'; return out; }
  if (spec.catalog) {
    if (!spec.rec) { out.state = 'noaddress'; return out; }
    out.edit = { type: 'catalog', kind: spec.catalog, id: spec.rec.id };
    out.loc = placeLoc(spec.rec);
    if (!out.loc) out.state = !spec.rec.address ? 'noaddress' : failed(spec.rec.address) ? 'notfound' : kick(() => locatePlace(spec.rec), spec.rec.address);
    return out;
  }
  if (spec.kind === 'delivery') out.edit = { type: 'address', address: spec.address };
  const g = cached(spec.address);
  if (g) out.loc = { lat: g.lat, lng: g.lng, precision: spec.kind === 'city' && g.precision !== 'manual' ? 'city' : g.precision };
  else out.state = failed(spec.address) ? 'notfound' : kick(() => locate(spec.address), spec.address);
  return out;
}
