/*
 * Tarifas — almacenamiento (store tariffSheets: un registro por apartado con sus rutas).
 * Apartado: { id, name, division:'campo'|'puerto', config:'Sencillo', routes:[{ id, zone, origin, dest, rates }],
 *             extras:[{ id, label, amount }], createdAt, updatedAt, source }
 * La primera vez se siembra «BAYER INBOUND 2026» (División Campo) con el tarifario de PERCONSUR (config/tariffs.js); a partir
 * de ahí todo se edita en la app, se respalda y se comparte con los demás dispositivos como cualquier otro registro.
 */
import * as db from './db.js';
import { getSetting, setSetting } from './settings.js';
import { seedSheet, newSheet, checkRoute, checkExtra, upsertRoute, checkSheetName, sanitizeSheet } from '../domain/tariffs/tariffs.js';

let cache = null;
/* Al leer se normaliza cada apartado (los de la versión 1.22 no tenían división ni cargos: quedan en División Campo) */
export async function loadTariffs(force = false) {
  if (!cache || force) cache = (await db.all(db.S.tariffSheets)).map(sanitizeSheet).filter(Boolean);
  return cache;
}
/* Apartados en orden de creación */
export const sheets = () => [...(cache || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
export const sheetById = (id) => (cache || []).find((s) => s.id === id) || null;

/* Siembra de BAYER INBOUND 2026 (solo una vez y solo si no hay apartados: no reaparece si se elimina) */
export async function seedTariffsIfNeeded() {
  if (getSetting('tariffsSeeded')) return false;
  await loadTariffs();
  if (!cache.length) { await db.put(db.S.tariffSheets, seedSheet()); await loadTariffs(true); }
  await setSetting('tariffsSeeded', true);
  return true;
}

/* Todo cambio marca el apartado como del usuario: al importar un respaldo, uno editado nunca cede ante la siembra */
async function save(sheet) {
  const s = { ...sheet, source: 'user', updatedAt: Date.now() };
  await db.put(db.S.tariffSheets, s);
  await loadTariffs(true);
  return s;
}
const need = (id) => { const s = sheetById(id); if (!s) throw new Error('El apartado ya no existe.'); return s; };

/* Ruta nueva (id null) o editada; devuelve { sheet, route } o { errors } (ver checkRoute) */
export async function saveRoute(sheetId, input, id = null) {
  const sheet = need(sheetId);
  const r = checkRoute(input, sheet.routes, id, sheet.division);
  if (r.errors) return r;
  const route = { ...r.route, id: id || db.uid('r_') };
  return { sheet: await save({ ...sheet, routes: upsertRoute(sheet.routes, route) }), route };
}
export async function deleteRoute(sheetId, id) {
  const sheet = sheetById(sheetId);
  if (!sheet) return null;
  return save({ ...sheet, routes: sheet.routes.filter((r) => r.id !== id) });
}

/* Cargos adicionales del apartado (sobrepeso, arrastres…): { sheet, extra } o { errors } */
export async function saveExtra(sheetId, input, id = null) {
  const sheet = need(sheetId);
  const r = checkExtra(input, sheet.extras, id);
  if (r.errors) return r;
  const extra = { ...r.extra, id: id || db.uid('x_') };
  return { sheet: await save({ ...sheet, extras: upsertRoute(sheet.extras, extra) }), extra };
}
export async function deleteExtra(sheetId, id) {
  const sheet = sheetById(sheetId);
  if (!sheet) return null;
  return save({ ...sheet, extras: sheet.extras.filter((x) => x.id !== id) });
}

/* Apartados: crear (con su división), renombrar y eliminar */
export async function createSheet(name, division) {
  const r = checkSheetName(name, sheets());
  if (r.error) return r;
  return { sheet: await save(newSheet({ id: db.uid('tfs_'), name: r.name, division })) };
}
export async function renameSheet(id, name) {
  const sheet = sheetById(id);
  if (!sheet) return { error: 'El apartado ya no existe.' };
  const r = checkSheetName(name, sheets(), id);
  if (r.error) return r;
  return { sheet: await save({ ...sheet, name: r.name }) };
}
export async function deleteSheet(id) {
  await db.del(db.S.tariffSheets, id);
  await loadTariffs(true);
}
