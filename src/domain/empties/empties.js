/*
 * Control de vacíos — reglas puras (sin almacenamiento ni DOM).
 * Estados internos separados del texto visible; para agregar uno basta con añadirlo a EMPTY_STATUSES.
 * Fila para Excel (Scan-IT to Office): mismas 9 columnas y orden que la hoja «Control de vacíos» del usuario:
 *   CONTENEDOR | OPERADOR QUE ENTREGA | ¿ENTREGADO CON OTRO TRANSPORTISTA? | TRANSPORTISTA (SI APLICA) | PATIO DE ENTREGA |
 *   FECHA DE ENTREGA | HORA DE ENTREGA | ¿ENTREGADO? | OBSERVACIONES
 * Celdas separadas por tabulador, sin acentos y con un espacio en las vacías (convención de xlCell, la misma del
 * «Código para Excel» de la nota de entrega, que Scan-IT to Office ya lee bien).
 */
import { xlCell, fmtFecha } from '../shared/format.js';

export const EMPTY_STATUSES = [
  { key: 'pending', label: 'Pendiente de asignar', short: 'Pendiente', tone: 'amber', open: true },
  { key: 'scheduled', label: 'Programado', short: 'Programado', tone: 'blue', open: true },
  { key: 'in_transit', label: 'En traslado', short: 'En traslado', tone: 'teal', open: true },
  { key: 'delivered', label: 'Entregado', short: 'Entregado', tone: 'ok', open: false },
];
const BY = new Map(EMPTY_STATUSES.map((s) => [s.key, s]));
export const emptyStatus = (k) => BY.get(k) || BY.get('pending');
export const isOpenEmpty = (r) => !!r && !r.deletedAt && emptyStatus(r.status).open;

export const EVENT_LABELS = {
  created: 'Creado como vacío', redetected: 'Vacío detectado de nuevo', operator: 'Operador asignado', carrier: 'Transportista modificado',
  yard: 'Patio asignado', schedule: 'Entrega programada', status: 'Estado cambiado', in_transit: 'En traslado', delivered: 'Entregado',
  vehicle: 'Unidad asignada', notes: 'Observaciones', reopened: 'Reabierto', delivery_fix: 'Fecha real corregida',
};

/* Número de contenedor: 4 letras + 7 dígitos (ISO 6346), sin espacios ni guiones */
export const cleanContainer = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const isContainer = (v) => /^[A-Z]{4}\d{7}$/.test(cleanContainer(v));
/* Todos los números de contenedor dentro de un texto (p. ej. «MSCU1234567 / TGHU-765432-1»), admitiendo espacios o guiones */
export function containersIn(text) {
  const out = [], re = /(?<![A-Z0-9])([A-Z]{4})[ -]?(\d{6})[ -]?(\d)(?![0-9])/g;
  let m; const t = String(text || '').toUpperCase();
  while ((m = re.exec(t))) { const n = m[1] + m[2] + m[3]; if (!out.includes(n)) out.push(n); }
  return out;
}

const p2 = (n) => String(n).padStart(2, '0');
export const dayStr = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const hmStr = (d = new Date()) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;

/* Entrega vencida: tenía fecha (y hora) programada, ya pasó y no se ha entregado */
export function isOverdue(r, now = new Date()) {
  if (!isOpenEmpty(r) || !r.scheduledDeliveryDate) return false;
  const today = dayStr(now);
  if (r.scheduledDeliveryDate < today) return true;
  if (r.scheduledDeliveryDate > today) return false;
  return !!r.scheduledDeliveryTime && r.scheduledDeliveryTime < hmStr(now);
}
/* Prioridad de pendientes: 0 vencidas · 1 hoy · 2 próximas · 3 sin fecha */
export function priority(r, now = new Date()) {
  if (isOverdue(r, now)) return 0;
  if (!r.scheduledDeliveryDate) return 3;
  return r.scheduledDeliveryDate === dayStr(now) ? 1 : 2;
}
export function sortPending(list, now = new Date()) {
  const key = (r) => `${r.scheduledDeliveryDate || '9999-99-99'} ${r.scheduledDeliveryTime || '99:99'}`;
  return [...list].sort((a, b) => priority(a, now) - priority(b, now) || key(a).localeCompare(key(b)) || (a.createdAt || 0) - (b.createdAt || 0));
}

/* ¿Tiene lo necesario para programarse? (quién entrega, patio y fecha) */
export const hasDeliverer = (r) => (r.externalCarrier ? !!String(r.externalCarrierName || '').trim() : !!r.deliveryOperatorId);
export const isSchedulable = (r) => hasDeliverer(r) && !!r.yardId && !!r.scheduledDeliveryDate;

/* Campos obligatorios para el código de Excel; devuelve los mensajes exactos de lo que falta */
export function missingForCode(r, v) {
  const m = [];
  if (!isContainer(r.containerNumber)) m.push(r.containerNumber ? 'El número de contenedor no tiene el formato de 4 letras y 7 números.' : 'Falta el número de contenedor.');
  if (r.externalCarrier) { if (!String(r.externalCarrierName || '').trim()) m.push('Falta escribir el transportista que entrega.'); }
  else if (!r.deliveryOperatorId || !v.deliveryOperator) m.push('Falta seleccionar el operador que entrega.');
  if (!r.yardId || !v.yard) m.push('Falta seleccionar el patio de entrega.');
  const d = r.status === 'delivered' ? r.actualDeliveryDate || r.scheduledDeliveryDate : r.scheduledDeliveryDate;
  const t = r.status === 'delivered' ? r.actualDeliveryTime || r.scheduledDeliveryTime : r.scheduledDeliveryTime;
  if (!d) m.push('Falta la fecha de entrega.');
  if (!t) m.push('Falta la hora de entrega.');
  return m;
}

/*
 * Columnas del Excel con sus valores (para la vista previa) y la fila codificada.
 * v = { deliveryOperator, yard } con nombres ya resueltos del catálogo.
 * Fecha/hora: las reales si ya se entregó; si no, las programadas.
 */
export const EXCEL_COLUMNS = ['CONTENEDOR', 'OPERADOR QUE ENTREGA', '¿ENTREGADO CON OTRO TRANSPORTISTA?', 'TRANSPORTISTA (SI APLICA)', 'PATIO DE ENTREGA', 'FECHA DE ENTREGA', 'HORA DE ENTREGA', '¿ENTREGADO?', 'OBSERVACIONES'];
export function excelValues(r, v) {
  const done = r.status === 'delivered', ext = !!r.externalCarrier;
  return [
    cleanContainer(r.containerNumber),
    ext ? r.externalDriverName || '' : v.deliveryOperator || '',
    ext ? 'Sí' : 'No',
    ext ? r.externalCarrierName || '' : '',
    v.yard || '',
    fmtFecha(done ? r.actualDeliveryDate || r.scheduledDeliveryDate : r.scheduledDeliveryDate),
    done ? r.actualDeliveryTime || r.scheduledDeliveryTime || '' : r.scheduledDeliveryTime || '',
    done ? 'Sí' : 'No',
    r.notes || '',
  ];
}
export const excelRowEmpty = (r, v) => excelValues(r, v).map(xlCell).join('\t');

/* Búsqueda sin acentos sobre los datos visibles */
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function matches(r, v, text) {
  const q = fold(text).trim(); if (!q) return true;
  const hay = [r.containerNumber, v.deliveryOperator, v.originalOperator, r.externalCarrierName, r.externalDriverName, r.externalVehicle, v.yard, v.unit, v.placas, v.trailer, r.reference, v.tripText].map(fold).join('\u0001');
  return q.split(/\s+/).every((w) => hay.includes(w));
}
