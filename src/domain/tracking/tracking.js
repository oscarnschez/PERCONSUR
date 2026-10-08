/*
 * Rastreo para clientes — reglas puras (sin red ni DOM).
 * Un enlace público pertenece a UNA operación de Logística y a la unidad (IMEI) de esa operación. Se puede compartir
 * mientras la operación está en un estado con rastreo (config/logistics.js → track: En ruta a destino, Descargando).
 * La entrega se considera finalizada cuando la operación pasa a un estado sin rastreo (En ruta vacío, Vacío, Inactiva)
 * o se cierra: entonces el enlace se finaliza y deja de dar la ubicación.
 */
import { statusOf, isStatus } from '../../config/logistics.js';
import { isApprox } from '../gps/geo.js';

export const isTrackable = (status) => isStatus(status) && !!statusOf(status).track;

/* Por qué no se puede compartir ('' = sí se puede) */
export function shareBlock(op, imei) {
  if (!op || op.closedAt || op.deletedAt) return 'La unidad no tiene una operación activa.';
  if (!isTrackable(op.status)) return 'El rastreo se comparte con la unidad En ruta a destino o Descargando.';
  if (!imei) return 'La unidad no tiene un GPS vinculado (Ajustes → GPS).';
  return '';
}

/* Destino para el mapa del cliente (solo si ya está ubicado) */
export const destPoint = (target) => (target && target.loc && Number.isFinite(target.loc.lat) && Number.isFinite(target.loc.lng)
  ? { lat: target.loc.lat, lng: target.loc.lng, approx: isApprox(target.loc.precision) } : null);

/* Datos que se envían al Worker al compartir. Sin operador ni placas: el cliente no los ve. */
export function linkPayload(op, view, imei, target) {
  return {
    opId: op.id, imei: String(imei || ''), unit: view.label || '', trailerType: view.trailerType || '', status: op.status,
    origin: op.origin || '', destination: op.destination || '', place: op.deliveryPlace || '', dest: destPoint(target),
  };
}

/*
 * Caducidad automática. links: enlaces del Worker; opOf(opId) → operación | null (borrada) | undefined (no está en este
 * dispositivo: no se toca); destOf(op) → punto de destino ya ubicado o null.
 * Devuelve [{ link, action: 'finish' | 'update', body }].
 */
export function reconcile(links, opOf, destOf = () => null) {
  const out = [];
  for (const link of links) {
    if (link.state !== 'active') continue;
    const op = opOf(link.opId);
    if (op === undefined) continue;
    if (!op || op.closedAt || op.deletedAt) { out.push({ link, action: 'finish', body: { reason: 'closed' } }); continue; }
    if (!isTrackable(op.status)) { out.push({ link, action: 'finish', body: { reason: 'delivered' } }); continue; }
    const body = {};
    if (op.status !== link.status) body.status = op.status;
    if (!link.hasDest) { const d = destOf(op); if (d) body.dest = d; }
    if (Object.keys(body).length) out.push({ link, action: 'update', body });
  }
  return out;
}

/* Texto del estado de un enlace para la app */
export function linkStateText(link, now = Date.now()) {
  if (!link) return '';
  if (link.state === 'active') { const h = Math.max(0, Math.round((link.expiresAt - now) / 3600000)); return `Activo · vence en ${h < 1 ? 'menos de 1 h' : `${h} h`} o al terminar la entrega`; }
  return { finished: 'Finalizado: la entrega terminó', revoked: 'Revocado', expired: 'Vencido' }[link.state] || '';
}
