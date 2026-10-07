/* Preferencias en IndexedDB con caché en memoria. El tema se refleja en localStorage para aplicarlo antes del primer pintado. */
import * as db from './db.js';

const cache = new Map();
export async function loadSettings() {
  const rows = await db.all(db.S.settings);
  rows.forEach((r) => cache.set(r.key, r.value));
}
export const getSetting = (k, d) => (cache.has(k) ? cache.get(k) : d);
export async function setSetting(k, v) {
  cache.set(k, v);
  await db.put(db.S.settings, { key: k, value: v });
}

/* Últimos valores usados por campo (para los selectores) */
export function recents(kind) { return getSetting('recent:' + kind, []); }
export async function pushRecent(kind, value, max = 6) {
  if (!value) return;
  const list = recents(kind).filter((v) => v !== value);
  list.unshift(value);
  await setSetting('recent:' + kind, list.slice(0, max));
}
