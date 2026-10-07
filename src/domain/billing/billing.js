/*
 * Cobranza — cálculos (sin interfaz ni almacenamiento).
 *
 * Cada viaje puede llevar una Referencia (campo «reference» del viaje, aquí tripRef) para identificarlo; no debe
 * confundirse con la referencia del pago (reference del registro de cobranza).
 * Lo que se cobra de cada viaje es su TOTAL DESPUÉS DE IMPUESTOS (tarifa base + IVA − ISR − retención de IVA, según lo
 * activado en el viaje; ver operators/taxes.js). En un viaje sin impuestos ese total es su tarifa. Además, cada viaje puede tener
 * demoras en planta, cada una con su importe. Viaje y demoras se cobran por separado: cada uno está «por cobrar» o «pagado».
 * Nada se guarda como total: los importes siempre se derivan de los viajes y de su registro de cobranza.
 * Montos en centavos; fechas como texto local AAAA-MM-DD.
 *
 * Registro de cobranza de un viaje (store tripBilling):
 *   { tripId, paid, paidDate, reference, notes,
 *     delays: [{ id, date, concept, amount, notes, paid, paidDate, reference }], ...auditoría }
 */
import { tripTaxes } from '../operators/taxes.js';

export const DELAY_CONCEPT = 'Demora en planta';
export const blankBilling = (tripId) => ({ tripId, paid: false, paidDate: '', reference: '', notes: '', delays: [] });

export const STATUS_FILTERS = [['todos', 'Todos'], ['tripDue', 'Viajes por cobrar'], ['tripPaid', 'Viajes pagados'], ['delayDue', 'Demoras por cobrar'], ['delayPaid', 'Demoras pagadas']];
export const DIVISIONS = [['puerto', 'Puerto'], ['campo', 'Campo']];

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

/* Días naturales entre dos fechas (b − a); null si alguna no es válida */
export function daysBetween(a, b) {
  if (!isDay(a) || !isDay(b)) return null;
  const n = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  return Math.round(n(b) - n(a));
}

/*
 * Une cada viaje con su registro de cobranza y su operador.
 * billOf(tripId) → registro o null; opOf(operatorId) → operador del catálogo o null.
 * Más reciente primero.
 */
export function billingItems(trips, billOf, opOf) {
  return trips.filter((t) => !t.deletedAt).map((t) => {
    const b = { ...blankBilling(t.id), ...(billOf(t.id) || {}) };
    const op = opOf(t.operatorId);
    return {
      id: t.id, trip: t, division: t.division === 'campo' ? 'campo' : 'puerto', date: t.date,
      operatorId: t.operatorId, operator: op ? op.name : 'Operador no encontrado', company: op ? op.companyShort || '' : '',
      tripRef: t.reference || '', origin: t.origin || '', destination: t.destination || '', route: `${t.origin || ''} → ${t.destination || ''}`,
      amount: tripTaxes(t).totalAfterTaxes, fareBase: t.fare || 0, taxed: tripTaxes(t).any, paid: !!b.paid, paidDate: b.paidDate || '', reference: b.reference || '', notes: b.notes || '',
      delays: (b.delays || []).map((d) => ({ ...d, amount: d.amount || 0, paid: !!d.paid })),
    };
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.trip.createdAt || 0) - (a.trip.createdAt || 0)));
}

/* Filtros: división, periodo (por fecha del viaje), texto (operador o ruta) y estado de cobro */
export function filterItems(items, { division = null, from = null, to = null, text = '', status = 'todos' } = {}) {
  const q = fold(text).trim();
  return items.filter((it) => {
    if (division && it.division !== division) return false;
    if (from && !(it.date >= from)) return false;
    if (to && !(it.date <= to)) return false;
    if (q && !fold(`${it.tripRef} ${it.operator} ${it.route} ${it.reference}`).includes(q)) return false;
    if (status === 'tripDue') return !it.paid;
    if (status === 'tripPaid') return it.paid;
    if (status === 'delayDue') return it.delays.some((d) => !d.paid);
    if (status === 'delayPaid') return it.delays.some((d) => d.paid);
    return true;
  });
}

/* Totales por cobrar y pagados, de viajes y de demoras */
export function summarize(items) {
  const z = () => ({ n: 0, amount: 0 });
  const s = { trips: { due: z(), paid: z() }, delays: { due: z(), paid: z() } };
  for (const it of items) {
    const t = it.paid ? s.trips.paid : s.trips.due; t.n += 1; t.amount += it.amount;
    for (const d of it.delays) { const x = d.paid ? s.delays.paid : s.delays.due; x.n += 1; x.amount += d.amount; }
  }
  s.due = s.trips.due.amount + s.delays.due.amount;
  s.paid = s.trips.paid.amount + s.delays.paid.amount;
  s.total = s.due + s.paid;
  return s;
}

/* Demoras como renglones propios (para el reporte), con los datos de su viaje */
export const delayRows = (items, paid) => items.flatMap((it) => it.delays.filter((d) => d.paid === paid).map((d) => ({ ...d, item: it })));
