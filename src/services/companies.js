/* Empresas: valores base de config/companies.js + textos editados por el usuario (store "companies").
 * Solo los campos de EDITABLE_FIELDS pueden cambiarse: logotipo, colores, serie de folio y demás valores fijos nunca se
 * toman del store (un respaldo importado no puede reemplazarlos). */
import * as db from './db.js';
import { COMPANY_DEFAULTS, EDITABLE_FIELDS } from '../config/companies.js';

const overrides = {};
export async function loadCompanies() {
  const rows = await db.all(db.S.companies);
  rows.forEach((r) => { overrides[r.key] = r.overrides || {}; });
}
export function getCompany(key) {
  const base = COMPANY_DEFAULTS[key] || COMPANY_DEFAULTS.perconsur;
  const o = overrides[key] || {};
  const merged = { ...base };
  for (const [k] of EDITABLE_FIELDS) if (typeof o[k] === 'string') merged[k] = o[k];
  return merged;
}
export const getOverrides = (key) => ({ ...(overrides[key] || {}) });
export async function saveOverrides(key, o) {
  overrides[key] = o;
  await db.put(db.S.companies, { key, overrides: o, updatedAt: Date.now() });
}
export async function resetCompany(key) { delete overrides[key]; await db.del(db.S.companies, key); }
