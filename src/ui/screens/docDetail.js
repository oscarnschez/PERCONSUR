/* Detalle de un documento generado. */
import { screen, on } from '../../core/dom.js';
import { go, back } from '../../core/router.js';
import { getDocument, deleteDocument } from '../../services/documents.js';
import { getCompany } from '../../services/companies.js';
import { esc, fmtFecha, fmtSize, relDay, ecoLabel, destinoMunicipio } from '../../domain/shared/format.js';
import { filledConts } from '../../domain/puerto/model.js';
import { cpRows } from '../../domain/campo/model.js';
import { icon } from '../components/icons.js';
import { confirmDestructive } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { loadDocFile } from '../flows.js';
import { doShare, openWhatsApp, viewPdf, saveHint } from './docActions.js';
import { openExcelCodes } from './excelCodes.js';
import { tripsForDocument } from '../../services/dossier.js';
import { countFor } from '../../services/tripAttachments.js';
import { operatorById } from '../../services/operators.js';
import { fmtDate } from '../../domain/operators/balance.js';
import { generate as generateDossier, openDossierPreview } from './tripDocs.js';

/* Expediente consolidado de cada viaje vinculado a este documento (documento + documentos adicionales del viaje) */
function dossierCard(t) {
  const n = countFor(t.id), op = operatorById(t.operatorId);
  return `<section class="grp xp" data-xptrip="${esc(t.id)}"><div class="grp-h"><h3>Expediente consolidado</h3>${n ? `<span class="att-count">${icon.paperclip}${n}</span>` : ''}</div>
    <div class="grp-b xp-b">
      <p class="xp-l1">${n ? `Este documento + ${n} documento${n === 1 ? '' : 's'} adicional${n === 1 ? '' : 'es'} del viaje, en un solo PDF.` : 'El viaje vinculado aún no tiene documentos adicionales: el expediente es solo este documento.'}</p>
      <p class="xp-l2">Viaje del ${esc(fmtDate(t.date))} · ${esc(t.origin)} → ${esc(t.destination)}${op ? ' · ' + esc(op.name) : ''}${t.reference ? ' · Ref. ' + esc(t.reference) : ''}</p>
      ${n ? `<button type="button" class="btn-primary block" data-xp="view">${icon.eye}<span>Ver expediente consolidado</span></button>
        <button type="button" class="btn-ghost block" data-xp="order">${icon.docs}<span>Orden y páginas</span></button>` : ''}
      ${op ? `<a class="btn-secondary block" href="#/operadores/${esc(op.id)}?viaje=${esc(t.id)}">${icon.paperclip}<span>${n ? 'Administrar documentos adicionales' : 'Añadir documentos al viaje'}</span></a>` : ''}
    </div></section>`;
}

export function docSummaryRows(doc) {
  const s = doc.data;
  if (doc.type === 'puerto') {
    const co = getCompany(doc.company);
    return [['Empresa', esc(co.legal)], ['Fecha', `${esc(fmtFecha(s.fecha))} ${esc(s.hora)}`], ['Operador', esc(s.operador) || '—'],
      ['Unidad', s.eco ? `${esc(ecoLabel(s.eco))}${s.placasU ? ' | ' + esc(s.placasU) : ''}` : '—'], ['Remolque', esc(s.placasR) || '—'],
      ['Contenedores', filledConts(s).map((c) => `${esc(c.num || 'Sin número')} | ${esc(c.tipo)}`).join('<br>') || '—'],
      ['Entregar a', esc(s.destNombre) || '—'], ['Destino', esc(destinoMunicipio(s.destDir)) || '—'],
      ['Evidencias', `${(doc.summary || {}).fotos || 0} fotos | ${(s.attachments || []).length} archivos`]];
  }
  return [['Fecha de carga', esc(fmtFecha(s.fecha)) || '—'], ['Planta destino', esc((s.planta || '').replace(/^Planta /, '')) || '—'],
    ['Unidades', cpRows(s).map((u) => `${esc(ecoLabel(u.eco) || '—')} | ${esc(u.op || '')}${u.tipo ? ' | ' + esc(u.tipo) : ''}`).join('<br>') || '—']];
}

export async function docDetailScreen({ id }, q) {
  const doc = await getDocument(id);
  if (!doc) { toast('Ese documento ya no existe.', { type: 'info' }); go('/documentos', { replace: true }); return null; }
  const file = await loadDocFile(doc);
  const isP = doc.type === 'puerto';
  const trips = tripsForDocument(doc.id);
  const s = screen(`<div class="page">
    <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Documentos</span></button></header>
    <div class="doc-hero">
      <span class="row-ic big ${doc.type}">${isP ? icon.container : icon.truck}</span>
      <div><small>${isP ? 'Nota de entrega – recepción' : 'Asignación de unidades'}</small><h1 class="mono">${esc(doc.folio)}</h1>
      <p>${esc(relDay(doc.createdAt))} | ${doc.pages} página${doc.pages === 1 ? '' : 's'} | ${fmtSize(doc.size || 0)} | <span class="st st-${doc.status}">${doc.status === 'compartido' ? 'Compartido' : 'Generado'}</span></p></div>
    </div>
    <div class="act-grid">
      <button type="button" class="act" data-a="share">${icon.share}<span>Compartir</span></button>
      <button type="button" class="act" data-a="save">${icon.folder}<span>Guardar en Archivos</span></button>
      <button type="button" class="act" data-a="wa">${icon.whatsapp}<span>WhatsApp</span></button>
      <button type="button" class="act" data-a="view">${icon.eye}<span>Ver PDF</span></button>
    </div>
    ${!file ? '<p class="grp-note warn-t">No se encontró el archivo PDF de este documento.</p>' : ''}
    ${trips.map(dossierCard).join('')}
    <section class="grp"><div class="grp-h"><h3>Datos</h3></div><div class="grp-b"><dl class="sumlist">${docSummaryRows(doc).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></div></section>
    <section class="grp"><div class="grp-b list-actions">
      ${isP ? `<button type="button" class="row-btn" data-a="excel">${icon.qr}<span>Código para Excel</span>${icon.chev}</button>` : ''}
      <button type="button" class="row-btn danger" data-a="del">${icon.trash}<span>Eliminar documento</span></button>
    </div></section>
  </div>`);
  on(s.el, 'click', '[data-back]', () => back('/documentos'));
  on(s.el, 'click', '[data-xp]', (e, b) => {
    const t = trips.find((x) => x.id === b.closest('[data-xptrip]').dataset.xptrip); if (!t) return;
    if (b.dataset.xp === 'view') generateDossier(t); else openDossierPreview(t);
  });
  /* Desde Logística («Ver documento relacionado»): abre directamente el expediente consolidado */
  const xp = q && q.get('expediente'), xt = xp && trips.find((t) => t.id === xp);
  if (xt) s.mounted = () => setTimeout(() => generateDossier(xt), 250);
  on(s.el, 'click', '[data-a]', async (e, b) => {
    const a = b.dataset.a;
    if (a === 'share') doShare(doc, file);
    if (a === 'save') { doShare(doc, file, { save: true }); }
    if (a === 'wa') openWhatsApp(doc, file);
    if (a === 'view') viewPdf(doc, file);
    if (a === 'excel') openExcelCodes(doc.data);
    if (a === 'del') {
      if (!(await confirmDestructive('¿Eliminar este documento?', `Folio ${doc.folio}. Se borrarán el PDF, las fotos y los archivos guardados en este dispositivo. El folio no se reutiliza.`, 'Eliminar documento'))) return;
      await deleteDocument(doc.id); toast('Documento eliminado', { type: 'info' }); go('/documentos', { replace: true });
    }
  });
  return s;
}
