/* Empresas: valores base de config/companies.js + textos editados por el usuario (store "companies"). */
import * as db from './db.js';
import { COMPANY_DEFAULTS } from '../config/companies.js';

const overrides = {};
export async function loadCompanies() {
  const rows = await db.all(db.S.companies);
  rows.forEach((r) => { overrides[r.key] = r.overrides || {}; });
}
export function getCompany(key) {
  const base = COMPANY_DEFAULTS[key] || COMPANY_DEFAULTS.perconsur;
  const o = overrides[key] || {};
  const merged = { ...base };
  for (const [k, v] of Object.entries(o)) if (typeof v === 'string') merged[k] = v;
  return merged;
}
export const getOverrides = (key) => ({ ...(overrides[key] || {}) });
export async function saveOverrides(key, o) {
  overrides[key] = o;
  await db.put(db.S.companies, { key, overrides: o, updatedAt: Date.now() });
}
export async function resetCompany(key) { delete overrides[key]; await db.del(db.S.companies, key); }
