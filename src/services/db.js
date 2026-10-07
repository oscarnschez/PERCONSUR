/*
 * Capa de persistencia sobre IndexedDB.
 * Stores:
 *   documents   documentos generados (datos + referencia al PDF)
 *   drafts      documentos sin terminar (uno por división/empresa)
 *   operators, vehicles, trailers   catálogos por empresa
 *   places, plants, terminals       catálogos generales (destinos, plantas, terminales)
 *   companies   ajustes de texto de cada empresa (overrides)
 *   settings    preferencias { key, value }
 *   attachments archivos binarios: fotos, adjuntos, PDF generados, vistas previas
 *   counters    consecutivos de folio
 *   operatorSettings, operatorTrips, operatorLoans, operatorAdjustments   control de operadores (v2)
 * Diseñado para que más adelante un servicio de sincronización lea/escriba estos mismos stores.
 */
const DB_NAME = 'perconsur';
const DB_VERSION = 3;  /* v2: control de operadores | v3: estados de cuenta */

export const S = {
  documents: 'documents', drafts: 'drafts', operators: 'operators', vehicles: 'vehicles', trailers: 'trailers',
  places: 'places', plants: 'plants', terminals: 'terminals', companies: 'companies', settings: 'settings',
  attachments: 'attachments', counters: 'counters',
  operatorSettings: 'operatorSettings', operatorTrips: 'operatorTrips', operatorLoans: 'operatorLoans', operatorAdjustments: 'operatorAdjustments',
  operatorStatements: 'operatorStatements',
};

let dbp = null;
export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB no disponible')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const mk = (name, opts, indexes = []) => {
        if (db.objectStoreNames.contains(name)) return;
        const st = db.createObjectStore(name, opts);
        indexes.forEach(([n, k]) => st.createIndex(n, k));
      };
      mk(S.documents, { keyPath: 'id' }, [['type', 'type'], ['createdAt', 'createdAt']]);
      mk(S.drafts, { keyPath: 'id' });
      mk(S.operators, { keyPath: 'id' }, [['company', 'company']]);
      mk(S.vehicles, { keyPath: 'id' }, [['company', 'company']]);
      mk(S.trailers, { keyPath: 'id' }, [['company', 'company']]);
      mk(S.places, { keyPath: 'id' });
      mk(S.plants, { keyPath: 'id' });
      mk(S.terminals, { keyPath: 'id' });
      mk(S.companies, { keyPath: 'key' });
      mk(S.settings, { keyPath: 'key' });
      mk(S.attachments, { keyPath: 'id' }, [['owner', 'owner']]);
      mk(S.counters, { keyPath: 'id' });
      /* v2 — Control de operadores (todo relacionado por operatorId, nunca por nombre) */
      mk(S.operatorSettings, { keyPath: 'operatorId' });
      mk(S.operatorTrips, { keyPath: 'id' }, [['operatorId', 'operatorId'], ['documentId', 'documentId'], ['date', 'date']]);
      mk(S.operatorLoans, { keyPath: 'id' }, [['operatorId', 'operatorId'], ['date', 'date']]);
      mk(S.operatorAdjustments, { keyPath: 'id' }, [['operatorId', 'operatorId'], ['date', 'date']]);
      /* v3 — Estados de cuenta emitidos (solo folio y metadatos; el PDF vive en attachments) */
      mk(S.operatorStatements, { keyPath: 'id' }, [['operatorId', 'operatorId']]);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña.'));
  });
  return dbp;
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Transacción cancelada')); });

export async function get(store, key) { const db = await openDB(); return wrap(db.transaction(store).objectStore(store).get(key)); }
export async function all(store) { const db = await openDB(); return wrap(db.transaction(store).objectStore(store).getAll()); }
export async function byIndex(store, index, value) { const db = await openDB(); return wrap(db.transaction(store).objectStore(store).index(index).getAll(value)); }
export async function put(store, value) { const db = await openDB(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value); await done(tx); return value; }
export async function putMany(store, values) { const db = await openDB(); const tx = db.transaction(store, 'readwrite'); const st = tx.objectStore(store); values.forEach((v) => st.put(v)); await done(tx); }
export async function del(store, key) { const db = await openDB(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); await done(tx); }
export async function count(store) { const db = await openDB(); return wrap(db.transaction(store).objectStore(store).count()); }

/* Transacción de lectura-escritura sobre varios stores; fn recibe { store(name) } */
export async function tx(stores, fn) {
  const db = await openDB();
  const t = db.transaction(stores, 'readwrite');
  const result = await fn({ store: (n) => t.objectStore(n), req: wrap });
  await done(t);
  return result;
}

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
