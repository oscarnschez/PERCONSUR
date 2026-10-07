/*
 * Archivos binarios (fotos, adjuntos, PDF generados y vistas previas) en el store "attachments".
 * Se guardan como ArrayBuffer + tipo MIME para máxima compatibilidad con Safari iOS.
 */
import * as db from './db.js';

const urls = new Map();

export async function saveBlob(blob, meta = {}) {
  const id = meta.id || db.uid('m_');
  const buf = await blob.arrayBuffer();
  await db.put(db.S.attachments, { createdAt: Date.now(), ...meta, id, type: blob.type || meta.type || 'application/octet-stream', size: blob.size, buf });
  return id;
}
export async function getRecord(id) { return db.get(db.S.attachments, id); }
export async function getBlob(id) {
  const r = await getRecord(id);
  return r ? new Blob([r.buf], { type: r.type }) : null;
}
export async function setOwner(ids, owner) {
  for (const id of ids) {
    const r = await getRecord(id);
    if (r && r.owner !== owner) await db.put(db.S.attachments, { ...r, owner });
  }
}
export async function remove(id) {
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  await db.del(db.S.attachments, id);
}
export async function removeOwned(owner) {
  const list = await db.byIndex(db.S.attachments, 'owner', owner);
  for (const r of list) await remove(r.id);
}

/* URL de objeto (sincrónica después de precargar con ensureURLs) */
export const urlFor = (id) => urls.get(id) || '';
export async function ensureURL(id) {
  if (!id) return '';
  if (urls.has(id)) return urls.get(id);
  const b = await getBlob(id);
  if (!b) return '';
  const u = URL.createObjectURL(b);
  urls.set(id, u);
  return u;
}
export async function ensureURLs(ids) { await Promise.all(ids.filter(Boolean).map(ensureURL)); }

/* Convierte un data URL (borradores del sistema anterior) en archivo */
export function dataURLtoBlob(d) {
  const [h, b] = d.split(',');
  const bin = atob(b);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: (h.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' });
}
