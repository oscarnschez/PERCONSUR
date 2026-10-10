/*
 * Tarifas — almacenamiento (store tariffSheets: un registro por apartado con sus rutas).
 * Apartado: { id, name, config:'Sencillo', routes:[{ id, zone, origin, dest, rates:{ Tolva, Jaula } }], createdAt, updatedAt, source }
 * La primera vez se siembra «BAYER INBOUND 2026» con el tarifario de PERCONSUR (config/tariffs.js); a partir de ahí todo
 * se edita en la app, se respalda y se comparte con los demás dispositivos como cualquier otro registro.
 */
import * as db from './db.js';
import { getSetting, setSetting } from './settings.js';
import { seedSheet, checkRoute, upsertRoute, checkSheetName } from '../domain/tariffs/tariffs.js';

let cache = null;
export async function loadTariffs(force = false) {
  if (!cache || force) cache = await db.all(db.S.tariffSheets);
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

/* Ruta nueva (id null) o editada; devuelve { sheet } o { errors } (ver checkRoute) */
export async function saveRoute(sheetId, input, id = null) {
  const sheet = sheetById(sheetId);
  if (!sheet) throw new Error('El apartado ya no existe.');
  const r = checkRoute(input, sheet.routes, id);
  if (r.errors) return r;
  const route = { ...r.route, id: id || db.uid('r_') };
  return { sheet: await save({ ...sheet, routes: upsertRoute(sheet.routes, route) }), route };
}
export async function deleteRoute(sheetId, id) {
  const sheet = sheetById(sheetId);
  if (!sheet) return null;
  return save({ ...sheet, routes: sheet.routes.filter((r) => r.id !== id) });
}

/* Apartados: crear, renombrar y eliminar */
export async function createSheet(name) {
  const r = checkSheetName(name, sheets());
  if (r.error) return r;
  const now = Date.now();
  return { sheet: await save({ id: db.uid('tfs_'), name: r.name, config: 'Sencillo', routes: [], createdAt: now, source: 'user' }) };
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
