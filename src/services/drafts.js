/*
 * Borradores con guardado automático.
 * - Cada cambio se guarda en IndexedDB (con retardo corto).
 * - Además, cuando la app pasa a segundo plano (bloqueo, cambio de app, cierre de Safari) se escribe
 *   una copia sincrónica en localStorage; al abrir se usa la más reciente de las dos.
 * Ids: "puerto:<empresa>" y "campo".
 */
import * as db from './db.js';

const MIRROR = 'pcs-draft-mirror:';
const live = new Map();   // id -> draft con cambios pendientes de guardar
const session = new Map(); // id -> draft en memoria durante la sesión (fuente de verdad mientras se edita)
let timer = null;

export const draftId = (type, company) => (type === 'campo' ? 'campo' : `puerto:${company}`);

export async function getDraft(id) { return session.get(id) || db.get(db.S.drafts, id); }
export const clearDraftCache = () => session.clear();
export async function allDrafts() { return db.all(db.S.drafts); }

export async function saveNow(draft) {
  draft.updatedAt = Date.now();
  session.set(draft.id, draft);
  await db.put(db.S.drafts, JSON.parse(JSON.stringify(draft)));
  mirror(draft);
}
function mirror(d) { try { localStorage.setItem(MIRROR + d.id, JSON.stringify(d)); } catch (e) { /* lleno: IndexedDB conserva el dato */ } }

/* Marca el borrador como modificado; se guarda en 350 ms */
export function touch(draft) {
  draft.updatedAt = Date.now();
  live.set(draft.id, draft);
  session.set(draft.id, draft);
  clearTimeout(timer);
  timer = setTimeout(flush, 350);
}
export async function flush() {
  clearTimeout(timer);
  const items = [...live.values()];
  live.clear();
  for (const d of items) { try { await saveNow(d); } catch (e) { mirror(d); console.warn('draft', e); } }
}
function flushSync() {
  for (const d of live.values()) mirror(d);
  flush();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSync(); });
window.addEventListener('pagehide', flushSync);

export async function removeDraft(id) {
  live.delete(id);
  session.delete(id);
  await db.del(db.S.drafts, id);
  try { localStorage.removeItem(MIRROR + id); } catch (e) { /* */ }
}

/* Al iniciar: recupera copias de localStorage más nuevas que las de IndexedDB */
export async function reconcileMirrors() {
  const keys = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(MIRROR)) keys.push(k); } } catch (e) { return; }
  for (const k of keys) {
    try {
      const m = JSON.parse(localStorage.getItem(k));
      const cur = await getDraft(m.id);
      if (!cur || (m.updatedAt || 0) > (cur.updatedAt || 0)) await db.put(db.S.drafts, m);
    } catch (e) { /* copia dañada: se ignora */ }
  }
}
