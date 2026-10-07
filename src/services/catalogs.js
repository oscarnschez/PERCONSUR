/*
 * Catálogos administrables. Operadores, unidades y remolques pertenecen a una empresa
 * (Campo usa los de PERCONSUR). Destinos, plantas y terminales son generales.
 */
import * as db from './db.js';
import { SEED_OPERATORS, SEED_VEHICLES, SEED_TRAILERS } from '../config/seeds.js';
import { PLANTAS_SEED, TERMINALES_SEED } from '../config/reference.js';
import { getSetting, setSetting } from './settings.js';
import { normEco } from '../domain/shared/format.js';

export const KINDS = {
  operators: { store: db.S.operators, title: 'Operadores', one: 'operador', perCompany: true,
    fields: [['name', 'Nombre completo', { autocapitalize: 'words' }]], label: (x) => x.name, sub: () => '' },
  vehicles: { store: db.S.vehicles, title: 'Unidades', one: 'unidad', perCompany: true,
    fields: [['eco', 'Número económico', { inputmode: 'numeric' }], ['placas', 'Placas', { upper: true }], ['desc', 'Descripción (opcional)', {}]],
    label: (x) => 'U' + String(x.eco).padStart(2, '0'), sub: (x) => [x.placas, x.desc].filter(Boolean).join(' | ') },
  trailers: { store: db.S.trailers, title: 'Remolques', one: 'remolque', perCompany: true,
    fields: [['placas', 'Placas', { upper: true }], ['desc', 'Descripción (marca, medida)', {}]], label: (x) => x.placas, sub: (x) => x.desc || '' },
  places: { store: db.S.places, title: 'Destinos', one: 'destino', perCompany: false,
    fields: [['name', 'Nombre (cliente o almacén)', { upper: true }], ['rfc', 'RFC', { rfc: true }], ['address', 'Dirección de entrega', { textarea: true }], ['contact', 'Contacto o teléfono', {}]],
    label: (x) => x.name, sub: (x) => x.address || '' },
  plants: { store: db.S.plants, title: 'Plantas', one: 'planta', perCompany: false,
    fields: [['name', 'Nombre', {}], ['address', 'Dirección', { textarea: true }], ['maps', 'Link de Google Maps', { url: true }]],
    label: (x) => x.name, sub: (x) => x.address || '' },
  terminals: { store: db.S.terminals, title: 'Terminales portuarias', one: 'terminal', perCompany: false,
    fields: [['name', 'Nombre', {}]], label: (x) => x.name, sub: () => '' },
};

const cache = {};
export async function loadCatalogs() {
  for (const [k, def] of Object.entries(KINDS)) cache[k] = await db.all(def.store);
}
export function list(kind, company) {
  const items = cache[kind] || [];
  const out = KINDS[kind].perCompany ? items.filter((x) => x.company === company) : items.slice();
  const lab = KINDS[kind].label;
  return out.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(lab(a)).localeCompare(String(lab(b)), 'es', { numeric: true }));
}
export async function save(kind, item) {
  const rec = { ...item, id: item.id || db.uid(kind.slice(0, 2) + '_'), updatedAt: Date.now() };
  await db.put(KINDS[kind].store, rec);
  const arr = cache[kind] || (cache[kind] = []);
  const i = arr.findIndex((x) => x.id === rec.id);
  if (i >= 0) arr[i] = rec; else arr.push(rec);
  return rec;
}
export async function remove(kind, id) {
  await db.del(KINDS[kind].store, id);
  cache[kind] = (cache[kind] || []).filter((x) => x.id !== id);
}

/* Unidades: buscar placas por número económico (fillPlacas) y recordar placas editadas (rememberPlacas) */
export function vehicleByEco(company, eco) {
  const e = normEco(eco);
  return list('vehicles', company).find((v) => normEco(v.eco) === e) || null;
}
export async function rememberPlacas(company, eco, placas) {
  const e = normEco(eco);
  if (!e) return;
  const v = vehicleByEco(company, e);
  if (v) { if (v.placas !== placas) await save('vehicles', { ...v, placas }); }
  else if (placas) await save('vehicles', { company, eco: e, placas, desc: '', source: 'auto' });
}
export function plantByName(name) { return list('plants').find((p) => p.name === name) || null; }

/* Siembra inicial con los datos del HTML original (solo la primera vez) */
export async function seedIfNeeded() {
  if (getSetting('seeded')) return false;
  const now = Date.now();
  const rows = (store, arr) => db.putMany(store, arr.map((x, i) => ({ id: db.uid('s_') + i, order: i, createdAt: now, source: 'seed', ...x })));
  await rows(db.S.operators, SEED_OPERATORS.map((name) => ({ company: 'perconsur', name })));
  await rows(db.S.vehicles, SEED_VEHICLES.map(([eco, placas]) => ({ company: 'perconsur', eco, placas, desc: '' })));
  await rows(db.S.trailers, SEED_TRAILERS.map(([placas, desc]) => ({ company: 'perconsur', placas, desc })));
  await rows(db.S.plants, PLANTAS_SEED);
  await rows(db.S.terminals, TERMINALES_SEED.map((name) => ({ name })));
  await setSetting('seeded', true);
  await loadCatalogs();
  return true;
}
