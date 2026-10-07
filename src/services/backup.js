/*
 * Respaldo local en JSON. Formato:
 *   { app:'perconsur', format:1, version, exportedAt, includeMedia, data:{ <store>: [...] } }
 * Los archivos (fotos, PDF, adjuntos) viajan en base64 dentro de data.attachments.
 * Los borradores siempre incluyen sus fotos; las de documentos generados solo si includeMedia.
 * La importación valida el archivo y COMBINA (no borra nada existente).
 * También acepta el volcado del sistema anterior (claves ner-*) generado con tools/exportar-datos-anteriores.html.
 */
import * as db from './db.js';
import { APP_VERSION } from '../config/reference.js';
import { migrateLegacy } from './migration.js';
import { loadSettings } from './settings.js';
import { loadCatalogs } from './catalogs.js';
import { loadCompanies } from './companies.js';
import { loadOperatorData } from './operators.js';

const DATA_STORES = ['settings', 'companies', 'counters', 'operators', 'vehicles', 'trailers', 'places', 'plants', 'terminals', 'drafts', 'documents',
  'operatorSettings', 'operatorTrips', 'operatorLoans', 'operatorAdjustments', 'operatorStatements'];
const OP_STORES = ['operatorSettings', 'operatorTrips', 'operatorLoans', 'operatorAdjustments', 'operatorStatements'];
DATA_STORES.push('fuelRecords');
const SKIP_SETTINGS = new Set(['seeded', 'legacyMigrated']);

const b64 = {
  from(buf) { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); },
  to(str) { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; },
};

export async function exportBackup({ includeMedia = false } = {}) {
  const data = {};
  for (const s of DATA_STORES) data[s] = await db.all(s);
  const atts = await db.all(db.S.attachments);
  data.attachments = atts
    /* Borradores y fotografías de operadores siempre; PDF y fotos de documentos solo en el respaldo completo */
    .filter((a) => includeMedia || /^(draft|op):/.test(String(a.owner || '')))
    .map(({ buf, ...rest }) => ({ ...rest, b64: b64.from(buf) }));
  const json = JSON.stringify({ app: 'perconsur', format: 1, version: APP_VERSION, exportedAt: new Date().toISOString(), includeMedia, data });
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const name = `PERCONSUR-respaldo-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  return new File([json], name, { type: 'application/json' });
}

/* Valida y describe un archivo antes de importarlo */
export async function inspectBackup(file) {
  if (!file) throw new Error('No se eligió ningún archivo.');
  if (file.size > 400 * 1024 * 1024) throw new Error('El archivo es demasiado grande para importarse en este dispositivo.');
  let obj;
  try { obj = JSON.parse(await file.text()); } catch (e) { throw new Error('El archivo no es un respaldo válido (no es JSON).'); }
  if (obj && obj.app === 'perconsur') {
    if (obj.format !== 1 || !obj.data || typeof obj.data !== 'object') throw new Error('El respaldo es de una versión no compatible.');
    for (const [k, v] of Object.entries(obj.data)) if (!Array.isArray(v)) throw new Error(`El respaldo está dañado (sección «${k}»).`);
    const n = (k) => (obj.data[k] || []).length;
    return {
      kind: 'backup', obj,
      lines: [
        `Documentos: ${n('documents')}`, `Borradores: ${n('drafts')}`,
        `Catálogos: ${n('operators')} operadores, ${n('vehicles')} unidades, ${n('trailers')} remolques, ${n('places')} destinos`,
        `Combustible: ${n('fuelRecords')} recargas`,
        `Control de operadores: ${n('operatorTrips')} viajes, ${n('operatorLoans')} préstamos, ${n('operatorAdjustments')} ajustes, ${n('operatorSettings')} configuraciones`,
        `Archivos: ${n('attachments')}`, `Creado: ${obj.exportedAt ? new Date(obj.exportedAt).toLocaleString('es-MX') : 'sin fecha'}`,
      ],
    };
  }
  const kv = obj && obj.format === 'ner-legacy' ? obj.keys : obj;
  if (kv && typeof kv === 'object' && Object.keys(kv).some((k) => k.startsWith('ner-'))) {
    return { kind: 'legacy', obj: kv, lines: [`Datos del sistema anterior: ${Object.keys(kv).filter((k) => k.startsWith('ner-')).length} claves`] };
  }
  throw new Error('El archivo no corresponde a un respaldo de PERCONSUR.');
}

export async function importBackup(info) {
  if (info.kind === 'legacy') {
    const r = await migrateLegacy(info.obj, { source: 'archivo' });
    await reload();
    return r;
  }
  const { data } = info.obj;
  /* Operadores: no duplicar. Si ya existe uno con la misma empresa y nombre (IDs distintos por venir de otro
     dispositivo), se usa el existente y se reasignan a él los registros importados. */
  const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const existing = await db.all(db.S.operators);
  const remap = new Map();
  data.operators = (data.operators || []).filter((o) => {
    if (existing.some((e) => e.id === o.id)) return true;
    const twin = existing.find((e) => e.company === o.company && fold(e.name) === fold(o.name));
    if (twin) { remap.set(o.id, twin.id); return false; }
    return true;
  });
  for (const st of OP_STORES) for (const r of data[st] || []) if (remap.has(r.operatorId)) r.operatorId = remap.get(r.operatorId);
  for (const t of data._trailerUpdates || []) await db.put(db.S.trailers, t);
  for (const a of data.attachments || []) { const m = /^op:(.+)$/.exec(a.owner || ''); if (m && remap.has(m[1])) a.owner = 'op:' + remap.get(m[1]); }
  /* Unidades: misma regla (empresa + número económico); las recargas se reasignan a la unidad existente */
  const normEco = (x) => String(x || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const exVeh = await db.all(db.S.vehicles), vmap = new Map();
  data.vehicles = (data.vehicles || []).filter((v) => {
    if (exVeh.some((e) => e.id === v.id)) return true;
    const twin = exVeh.find((e) => e.company === v.company && normEco(e.eco) === normEco(v.eco));
    if (twin) { vmap.set(v.id, twin.id); return false; }
    return true;
  });
  for (const r of data.fuelRecords || []) if (vmap.has(r.vehicleId)) r.vehicleId = vmap.get(r.vehicleId);
  /* Remolques: no duplicar por empresa + placas (se conserva el tipo si el existente no lo tiene) */
  const exTr = await db.all(db.S.trailers);
  data.trailers = (data.trailers || []).filter((t) => {
    if (exTr.some((e) => e.id === t.id)) return true;
    const twin = exTr.find((e) => e.company === t.company && fold(e.placas) === fold(t.placas));
    if (twin && t.type && !twin.type) { twin.type = t.type; data._trailerUpdates = [...(data._trailerUpdates || []), twin]; }
    return !twin;
  });
  if (data.operatorSettings) {
    for (const r of data.operatorSettings) { const cur = await db.get(db.S.operatorSettings, r.operatorId); if (cur && (cur.updatedAt || 0) >= (r.updatedAt || 0)) r._skip = true; }
    data.operatorSettings = data.operatorSettings.filter((r) => !r._skip);
  }
  for (const s of DATA_STORES) {
    const rows = data[s] || [];
    if (s === 'counters') { for (const r of rows) { const cur = await db.get(s, r.id); if (!cur || cur.n < r.n) await db.put(s, r); } continue; }
    if (s === 'settings') { for (const r of rows) if (!SKIP_SETTINGS.has(r.key)) await db.put(s, r); continue; }
    if (s === 'drafts') { for (const r of rows) { const cur = await db.get(s, r.id); if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) await db.put(s, r); } continue; }
    if (rows.length) await db.putMany(s, rows);
  }
  for (const a of data.attachments || []) {
    const { b64: str, ...rest } = a;
    if (typeof str === 'string') await db.put(db.S.attachments, { ...rest, buf: b64.to(str) });
  }
  await reload();
  return { documents: (data.documents || []).length };
}
async function reload() { await loadSettings(); await loadCatalogs(); await loadCompanies(); await loadOperatorData(); }
