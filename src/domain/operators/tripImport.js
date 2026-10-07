/*
 * Importación de viajes — relaciona registros leídos de fuera (p. ej. de imágenes de hojas de cálculo) con los viajes
 * que YA existen en Operadores, para actualizar solo dos cosas: la Referencia del viaje (número de contenedor) y su
 * estatus de pago. Lógica pura: no guarda nada; la pantalla aplica el plan únicamente al confirmar.
 *
 * Reglas:
 *   - El viaje se localiza por operador + fecha. No se crean viajes ni operadores, SALVO que el archivo lo pida de
 *     forma expresa con "create": true en el operador: entonces el operador que no exista se da de alta (con su RFC,
 *     CURP y licencia) y los viajes que no existan se registran. Para crear un viaje el archivo debe traer origen,
 *     destino y tarifa; los gastos de viaje se toman del archivo (campo expenses) y quedan en cero si no los trae.
 *   - Si ese día el operador tiene varios viajes (o hay varios registros), se intenta distinguir por la referencia ya
 *     guardada y por el destino; si no alcanza, el registro queda «ambiguo» para elegir a mano. No se asigna al azar.
 *   - Un contenedor cuyo dígito verificador ISO 6346 no coincide es una lectura dudosa: su referencia no se asigna sola.
 *   - Una referencia existente y distinta nunca se reemplaza sin confirmación expresa.
 *   - Solo se marca pagado lo que dice explícitamente «Pagado/Pagada». Nunca se quita un pago ya registrado.
 *
 * Archivo: { format:'perconsur-trip-import', version:1, source, operators:[{ name, trips:[[fecha, contenedor, estatus, destino?, nota?]] }] }
 *   o bien { ..., records:[{ operator, date, container, status, destination?, note? }] }. Fechas AAAA-MM-DD o DD/MM/AAAA.
 *   Altas: { name, create:true, company, profile:{ rfc, curp, license }, trips:[{ date, container, status, origin, destination, fare, expenses? }] }
 *   (fare y expenses en pesos; fare es la tarifa base, sin IVA).
 */
import { isoCheck } from '../shared/format.js';

export const IMPORT_SOURCE = 'image-import';
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
export const cleanContainer = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const isPaidStatus = (s) => /^pagad[ao]s?$/.test(fold(s));
function toDate(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

/* Valida el archivo y lo deja como lista plana de registros */
export function parseImport(obj) {
  if (!obj || obj.format !== 'perconsur-trip-import') throw new Error('El archivo no es una importación de viajes de PERCONSUR.');
  const flat = [];
  if (Array.isArray(obj.operators)) {
    for (const o of obj.operators) for (const t of o.trips || []) {
      const base = Array.isArray(t) ? { date: t[0], container: t[1], status: t[2], destination: t[3], note: t[4] } : t;
      flat.push({ ...base, operator: o.name, create: !!o.create, company: o.company, profile: o.profile });
    }
  }
  if (Array.isArray(obj.records)) flat.push(...obj.records);
  if (!flat.length) throw new Error('El archivo no contiene registros.');
  const records = flat.map((r, n) => {
    const container = cleanContainer(r.container), iso = container ? isoCheck(container) : { state: 'empty' };
    return {
      n, operator: String(r.operator || '').replace(/\s+/g, ' ').trim(), date: toDate(r.date), container, status: String(r.status || '').trim(),
      paid: isPaidStatus(r.status), destination: String(r.destination || '').trim(), note: String(r.note || '').trim(),
      create: !!r.create, company: String(r.company || 'perconsur'), origin: String(r.origin || '').trim(), fare: Number.isFinite(+r.fare) && +r.fare > 0 ? Math.round(+r.fare * 100) : 0, expenses: Number.isFinite(+r.expenses) && +r.expenses > 0 ? Math.round(+r.expenses * 100) : 0,
      profile: r.profile ? { rfc: cleanContainer(r.profile.rfc), curp: cleanContainer(r.profile.curp), license: cleanContainer(r.profile.license) } : null,
      containerOk: iso.state === 'ok', containerHint: iso.state === 'bad' ? `El dígito verificador no coincide (debería terminar en ${iso.d}).` : iso.state === 'format' ? 'No tiene el formato de 4 letras y 7 números.' : '',
    };
  });
  return { source: String(obj.source || ''), records };
}

const destMatch = (rec, trip) => {
  const a = fold(rec.destination.split(',')[0]), b = fold(String(trip.destination || '').split(',')[0]);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
};

/* ¿El registro trae lo necesario para registrar un viaje nuevo? Devuelve el motivo si no. */
export function createBlocker(rec) {
  if (!rec.origin || !rec.destination) return 'Falta el origen o el destino.';
  if (!rec.fare) return 'Falta la tarifa del viaje.';
  if (rec.container && !rec.containerOk) return `Lectura dudosa del contenedor. ${rec.containerHint}`;
  return '';
}

/*
 * Estado de la referencia y del pago de un registro ya relacionado con un viaje.
 * refState: 'add' | 'same' | 'conflict' (hay otra distinta) | 'uncertain' (lectura dudosa) | 'none' (sin contenedor)
 */
export function resolveRow(row, trip, billOf) {
  const rec = row.rec, cur = cleanContainer(trip.reference), bill = billOf(trip.id);
  const refState = !rec.container ? 'none' : cur === rec.container ? 'same' : !rec.containerOk ? 'uncertain' : cur ? 'conflict' : 'add';
  const alreadyPaid = !!(bill && bill.paid);
  return { ...row, state: 'ok', trip, refState, currentRef: trip.reference || '', alreadyPaid, markPaid: rec.paid && !alreadyPaid };
}

/*
 * operators: catálogo; trips: todos los viajes vigentes; billOf(tripId) → registro de cobranza o null.
 * Devuelve una fila por registro: state 'ok' | 'create' (viaje nuevo; newOp si además el operador es nuevo) |
 * 'notfound' | 'ambiguous' | 'operator' | 'invalid'.
 */
export function planImport(records, { operators, trips, billOf }) {
  const rows = records.map((rec) => ({ rec, op: null, trip: null, candidates: [], state: 'notfound', refState: 'none', markPaid: false, alreadyPaid: false, reason: '' }));
  const groups = new Map();
  rows.forEach((row) => {
    const rec = row.rec;
    if (!rec.date) { row.state = 'invalid'; row.reason = 'La fecha no es válida.'; return; }
    const ops = operators.filter((o) => fold(o.name) === fold(rec.operator));
    if (!ops.length && rec.create) {
      const why = createBlocker(rec);
      if (why) { row.state = 'invalid'; row.reason = why; } else { row.state = 'create'; row.newOp = true; row.markPaid = rec.paid; }
      return;
    }
    if (ops.length !== 1) { row.state = 'operator'; row.reason = ops.length ? 'Hay más de un operador con ese nombre en el catálogo.' : 'El operador no está en el catálogo.'; return; }
    row.op = ops[0];
    const k = `${row.op.id}|${rec.date}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  });
  for (const [k, group] of groups) {
    const [opId, date] = k.split('|');
    let free = trips.filter((t) => !t.deletedAt && t.operatorId === opId && t.date === date);
    let pending = group.slice();
    const take = (row, trip) => { Object.assign(row, resolveRow(row, trip, billOf)); free = free.filter((t) => t !== trip); pending = pending.filter((r) => r !== row); };
    /* 1) El viaje que ya tiene guardada esa misma referencia */
    for (const row of pending.slice()) { const t = row.rec.container && free.find((x) => cleanContainer(x.reference) === row.rec.container); if (t) take(row, t); }
    /* 2) Un solo registro y un solo viaje ese día */
    if (pending.length === 1 && free.length === 1) take(pending[0], free[0]);
    /* 3) Varios: distinguir por destino cuando señala un único viaje que nadie más reclama */
    if (pending.length && free.length) {
      const pick = pending.map((row) => ({ row, cands: free.filter((t) => destMatch(row.rec, t)) }));
      for (const p of pick) {
        if (p.cands.length !== 1) continue;
        const t = p.cands[0];
        if (free.includes(t) && pick.filter((q) => q.cands.includes(t)).length === 1) take(p.row, t);
      }
    }
    for (const row of pending) {
      if (!free.length && row.rec.create) {
        const why = createBlocker(row.rec);
        if (why) { row.state = 'invalid'; row.reason = why; } else { row.state = 'create'; row.newOp = false; row.markPaid = row.rec.paid; }
        continue;
      }
      if (!free.length) { row.state = 'notfound'; row.reason = 'No hay un viaje de este operador en esa fecha.'; continue; }
      row.state = 'ambiguous'; row.candidates = free.slice();
      row.reason = group.length > 1 ? `Hay ${group.length} registros y ${free.length === 1 ? 'un viaje' : free.length + ' viajes'} de ese día que no se pueden distinguir.` : `El operador tiene ${free.length} viajes ese día.`;
    }
  }
  return rows;
}

/* ¿La fila necesita una decisión manual? */
export const needsReview = (row) => (row.state !== 'ok' && row.state !== 'create') || row.refState === 'conflict' || row.refState === 'uncertain';
/* ¿Qué haría «Aplicar cambios» con la fila tal como está? */
export const willSetRef = (row) => row.state === 'ok' && row.refState === 'add';
export const willChange = (row) => row.state === 'create' || willSetRef(row) || (row.state === 'ok' && row.markPaid);

export function summarizePlan(rows) {
  return {
    detected: rows.length, found: rows.filter((r) => r.state === 'ok').length, refs: rows.filter(willSetRef).length,
    pay: rows.filter((r) => (r.state === 'ok' || r.state === 'create') && r.markPaid).length, review: rows.filter(needsReview).length,
    newTrips: rows.filter((r) => r.state === 'create').length, newOps: new Set(rows.filter((r) => r.state === 'create' && r.newOp).map((r) => fold(r.rec.operator))).size,
    unchanged: rows.filter((r) => r.state === 'ok' && !willChange(r) && !needsReview(r)).length,
  };
}
