/*
 * Expediente de un viaje = documento relacionado original + documentos adicionales (en el orden actual).
 * Es un archivo DERIVADO: se arma al pedirlo con los datos vigentes y nunca se guarda sobre el original.
 * Usa pdf-lib (vendor) y appendFile() de services/pdf.js: las páginas de los PDF se copian tal cual y las imágenes
 * se colocan centradas en una página carta. Se procesa un archivo a la vez para cuidar la memoria del iPhone.
 */
import { loadLib } from './libs.js';
import * as media from './media.js';
import { getDocument } from './documents.js';
import { appendFile } from './pdf.js';
import { listFor, missingFiles, countFor } from './tripAttachments.js';
import { allTrips } from './operators.js';
import { todayStr } from '../domain/operators/balance.js';

/* Por encima de esto se avisa antes de combinar (no se bloquea) */
export const HEAVY_BYTES = 60 * 1024 * 1024;

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export function dossierName(trip, date = todayStr()) {
  const ref = slug(trip.reference) || `viaje-${slug(trip.date) || 'sin-fecha'}-${String(trip.id).slice(-6)}`;
  return `Expediente-${ref}-${date}.pdf`;
}
export const docLabel = (d) => (d ? `${d.type === 'puerto' ? 'Nota de entrega' : 'Asignación de unidades'} ${d.folio}` : '');

/* Viajes cuyo documento relacionado es docId (normalmente uno) */
export const tripsForDocument = (docId) => (docId ? allTrips().filter((t) => t.documentId === docId) : []);
/*
 * Expediente al que apunta un registro con tripId y/o documentId (p. ej. una operación de Logística):
 * el viaje indicado si su documento coincide; si no, el viaje vinculado a ese documento.
 * Devuelve { trip, docId, extra (documentos adicionales del viaje) }.
 */
export function dossierRef({ tripId = null, documentId = null } = {}) {
  const t = tripId ? allTrips().find((x) => x.id === tripId) || null : null;
  const docId = documentId || (t && t.documentId) || null;
  const trip = t && (!docId || !t.documentId || t.documentId === docId) ? t : tripsForDocument(docId)[0] || null;
  return { trip, docId, extra: trip ? countFor(trip.id) : 0 };
}

/* Documento principal del viaje: { doc, missing:'none'|'deleted'|'file'|null } */
export async function mainDocument(trip) {
  if (!trip.documentId) return { doc: null, missing: 'none' };
  const doc = await getDocument(trip.documentId);
  if (!doc) return { doc: null, missing: 'deleted' };
  const rec = doc.pdfId ? await media.getRecord(doc.pdfId) : null;
  return { doc, missing: rec ? null : 'file' };
}

/* Resumen previo (sin combinar): secciones con sus páginas, tamaño estimado y archivos que se omitirán */
export async function dossierPlan(trip) {
  const main = await mainDocument(trip), atts = listFor(trip.id), missing = await missingFiles(trip.id);
  const sections = [];
  let page = 1, bytes = 0;
  if (main.doc && !main.missing) {
    const n = main.doc.pages || 1;
    sections.push({ key: 'main', label: 'Documento original', name: docLabel(main.doc), kind: 'main', from: page, to: page + n - 1, doc: main.doc });
    page += n; bytes += main.doc.size || 0;
  }
  const skipped = [];
  for (const a of atts) {
    if (a.status !== 'ok' || !a.storageKey || missing.has(a.id)) { skipped.push(a); continue; }
    const n = a.pages || 1;
    sections.push({ key: a.id, label: a.name, name: a.name, kind: a.kind, from: page, to: page + n - 1, att: a });
    page += n; bytes += a.size || 0;
  }
  return { main, sections, skipped, pages: page - 1, bytes };
}

/*
 * Combina en un solo PDF. onProgress(i, total, nombre). Devuelve { file, pages, sections, skipped:[nombres] }.
 * Un archivo que falla al combinar se omite y se informa; no cancela el expediente.
 */
export async function buildDossier(trip, { onProgress } = {}) {
  await loadLib('pdflib');
  const { PDFDocument } = window.PDFLib;
  const plan = await dossierPlan(trip);
  const out = await PDFDocument.create();
  const total = plan.sections.length, sections = [], skipped = plan.skipped.map((a) => a.name);
  let done = 0;
  for (const s of plan.sections) {
    onProgress && onProgress(++done, total, s.kind === 'main' ? 'Documento original' : s.name);
    await new Promise((r) => setTimeout(r, 0));
    try {
      const blob = s.kind === 'main' ? await media.getBlob(s.doc.pdfId) : await media.getBlob(s.att.storageKey);
      if (!blob) throw new Error('Archivo no disponible');
      const from = out.getPageCount() + 1;
      let bytes = new Uint8Array(await blob.arrayBuffer());
      await appendFile(out, s.kind === 'img' ? { kind: 'img', bytes, w: s.att.w, h: s.att.h } : { kind: 'pdf', bytes });
      bytes = null;   /* libera la copia temporal antes del siguiente archivo */
      sections.push({ ...s, from, to: out.getPageCount() });
    } catch (e) { console.warn('expediente', s.name, e); skipped.push(s.kind === 'main' ? 'Documento original' : s.name); }
  }
  if (!out.getPageCount()) throw new Error('No hay documentos que se puedan combinar.');
  out.setTitle(`Expediente ${trip.reference || ''}`.trim()); out.setAuthor('PERCONSUR'); out.setCreator('PERCONSUR');
  const name = dossierName(trip);
  const file = new File([await out.save()], name, { type: 'application/pdf' });
  return { file, pages: out.getPageCount(), sections, skipped };
}
