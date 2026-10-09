/* Documentos generados: datos, resumen, PDF y vistas previas. */
import * as db from './db.js';
import * as media from './media.js';
import { isReadOnly } from './access.js';

export async function saveDocument(doc) { await db.put(db.S.documents, doc); return doc; }
export async function getDocument(id) { return db.get(db.S.documents, id); }
export async function listDocuments() {
  const all = await db.all(db.S.documents);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function markShared(id) {
  /* En un dispositivo de consulta compartir el PDF no cambia el registro (lo marca el capturista) */
  if (isReadOnly()) return;
  const d = await getDocument(id);
  if (d && d.status !== 'compartido') { d.status = 'compartido'; d.sharedAt = Date.now(); await db.put(db.S.documents, d); }
}
export async function deleteDocument(id) {
  await media.removeOwned('doc:' + id);
  await db.del(db.S.documents, id);
}
