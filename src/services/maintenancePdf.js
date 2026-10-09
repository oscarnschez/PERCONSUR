/*
 * Taller — reporte en PDF: prepara datos, logotipo, medidas de texto y fotos; vista previa SVG y archivo.
 * Misma infraestructura que el estado de cuenta: pdf-lib local (sin conexión), PDF vectorial y una vista previa que
 * dibuja exactamente el mismo modelo de páginas (incluido el diagrama vectorial del equipo).
 */
import { loadLib } from './libs.js';
import { getMeasure, getBrand } from './statementPdf.js';
import { getCompany } from './companies.js';
import * as media from './media.js';
import * as mt from './maintenance.js';
import { buildMaintenanceReport } from '../domain/maintenance/report.js';
import { pageToSVG, modelToPdf } from '../domain/operators/statement.js';
import { filterOrders, fmtD, equipmentCode } from '../domain/maintenance/maintenance.js';
import { workTypeLabel } from '../domain/maintenance/catalog.js';

const MAX_PHOTOS = 40;
async function photoInfo(att) {
  const blob = await media.getBlob(att.mediaId);
  if (!blob) return null;
  const url = await media.ensureURL(att.mediaId);
  const dims = await new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = url; });
  if (!dims || !dims.w) return null;
  return { key: 'p_' + att.id, url, bytes: new Uint8Array(await blob.arrayBuffer()), ...dims };
}
function caption(att, order) {
  const kind = order.kind;
  if (att.parentType === 'issue') { const i = mt.issueById(att.parentId); return `Falla reportada${i && i.componentId ? ': ' + mt.componentName(kind, i.componentId) : ''}${i ? ' · ' + fmtD(i.date) : ''}`; }
  if (att.parentType === 'service') { const s = mt.servicesOf(order.id).find((x) => x.id === att.parentId); return s ? `${workTypeLabel(s.type)}${s.componentId ? ': ' + mt.componentName(kind, s.componentId) : ''} · ${fmtD(s.date)}` : 'Trabajo'; }
  if (att.parentType === 'tire') return 'Reemplazo de llantas';
  if (att.parentType === 'oil') return 'Cambio de aceite';
  return `Orden ${order.folio}`;
}
async function entryOf(order) {
  const atts = mt.photosOfOrder(order.id);
  const photos = [];
  for (const a of atts) { const p = await photoInfo(a); if (p) photos.push({ ...p, caption: caption(a, order) }); }
  return {
    order, services: mt.servicesOf(order.id), components: mt.componentsOfOrder(order.id), issues: mt.issuesOfOrder(order.id),
    tires: mt.tiresOf(order.id), oil: mt.oilOf(order.id), photos,
  };
}
/* Reporte individual de una orden */
export async function prepareOrderReport(orderId) {
  await mt.loadMaintenance();
  const order = mt.orderById(orderId);
  if (!order || order.deletedAt) throw new Error('La orden ya no existe.');
  const [measure, brand] = await Promise.all([getMeasure(), getBrand()]);
  const eq = mt.equipmentOfOrder(order), entries = [await entryOf(order)];
  const model = buildMaintenanceReport({ mode: 'orden', company: getCompany('perconsur'), equipment: eq, entries, measure, imgs: { mark: brand.mark, word: brand.word }, parts: mt.parts() });
  return { model, brand, entries, eq, filename: `${order.folio}.pdf`, title: `Reporte de mantenimiento ${order.folio}` };
}
/* Reporte de servicios de un equipo en un periodo (con tipos y estados elegidos) */
export async function prepareEquipmentReport(type, id, { from = '', to = '', types = new Set(), statuses = new Set(), typesText = '', statusesText = '' } = {}) {
  await mt.loadMaintenance();
  const eq = mt.equipmentOf(type, id);
  if (!eq) throw new Error('El equipo ya no está en el catálogo.');
  const orders = filterOrders(mt.ordersOf(eq.key), { from, to, types, statuses });
  const [measure, brand] = await Promise.all([getMeasure(), getBrand()]);
  const entries = [];
  let nPhotos = 0;
  for (const o of orders) {
    const e = await entryOf(o);
    e.photos = e.photos.slice(0, Math.max(0, MAX_PHOTOS - nPhotos)); nPhotos += e.photos.length;
    entries.push(e);
  }
  const today = new Date(), ref = `RS-${equipmentCode(eq)}-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const model = buildMaintenanceReport({ mode: 'consolidado', reference: ref, company: getCompany('perconsur'), equipment: eq, entries, period: { from, to, typesText, statusesText }, measure, imgs: { mark: brand.mark, word: brand.word }, parts: mt.parts() });
  return { model, brand, entries, eq, filename: `Servicios-${equipmentCode(eq)}-${(from || 'inicio').replace(/-/g, '')}-${(to || 'hoy').replace(/-/g, '')}.pdf`, title: `Reporte de servicios ${eq.label}` };
}
const srcsOf = (p) => ({ mark: p.brand.mark.src, word: p.brand.word && p.brand.word.src, ...Object.fromEntries(p.entries.flatMap((e) => e.photos.map((x) => [x.key, x.url]))) });
export const reportSVGs = (p) => p.model.pages.map((pg) => pageToSVG(pg, srcsOf(p)));
export async function reportBlob(p) {
  await loadLib('pdflib');
  const images = { mark: p.brand.mark.bytes, word: p.brand.word && p.brand.word.bytes };
  for (const e of p.entries) for (const x of e.photos) images[x.key] = { bytes: x.bytes, jpg: true };
  const bytes = await modelToPdf(window.PDFLib, p.model.pages, images, { title: p.title, subject: 'Reporte de mantenimiento y reparación' });
  return new Blob([bytes], { type: 'application/pdf' });
}
