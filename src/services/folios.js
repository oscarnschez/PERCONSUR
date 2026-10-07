/*
 * Folios de la Nota de entrega: serie-AAMMDD-consecutivo (ej. 50-261006-004).
 * Consecutivo diario independiente por empresa (antes: ner-folios2 / ner-folios2@oasc / @osc).
 * Se incrementa al iniciar una nota y al cambiar la fecha, igual que el original.
 */
import * as db from './db.js';
import { nowParts } from '../domain/shared/format.js';
import { getCompany } from './companies.js';

export function folioKey(fecha) { const [y, m, d] = (fecha || nowParts().fecha).split('-'); return y.slice(2) + m + d; }
const cid = (company, key) => `folio:${company}:${key}`;

export async function nextFolio(company, fecha) {
  const key = folioKey(fecha);
  const n = await db.tx([db.S.counters], async ({ store, req }) => {
    const st = store(db.S.counters);
    const cur = await req(st.get(cid(company, key)));
    const next = ((cur && cur.n) || 0) + 1;
    st.put({ id: cid(company, key), company, day: key, n: next });
    return next;
  });
  return `${getCompany(company).folioSerie || '50'}-${key}-${String(n).padStart(3, '0')}`;
}
/* "Reiniciar a 001": pone el consecutivo del día en 0 y asigna el siguiente */
export async function resetFolio(company, fecha) {
  const key = folioKey(fecha);
  await db.put(db.S.counters, { id: cid(company, key), company, day: key, n: 0 });
  return nextFolio(company, fecha);
}
export async function mergeCounter(company, day, n) {
  const cur = await db.get(db.S.counters, cid(company, day));
  if (!cur || cur.n < n) await db.put(db.S.counters, { id: cid(company, day), company, day, n });
}
