/*
 * Visor de PDF interno: muestra las páginas renderizadas (vistas previas guardadas al generar)
 * y los archivos combinados. Funciona sin conexión y en modo app. "Abrir en visor del sistema" usa el PDF real.
 */
import * as media from '../../services/media.js';
import { openBlob } from '../../services/share.js';
import { esc } from '../../domain/shared/format.js';
import { openSheet } from '../components/sheet.js';
import { icon } from '../components/icons.js';

export async function openViewer(doc, file) {
  const ids = doc.previewIds || [];
  await media.ensureURLs(ids);
  const atts = (doc.type === 'puerto' && doc.data.attachments) || [];
  await media.ensureURLs(atts.filter((a) => a.kind === 'img').map((a) => a.id));
  const pages = ids.map((id, k) => `<figure class="vw-page"><img src="${media.urlFor(id)}" alt="Página ${k + 1}"><figcaption>Página ${k + 1}</figcaption></figure>`).join('');
  const extra = atts.map((a) => a.kind === 'img'
    ? `<figure class="vw-page att"><img src="${media.urlFor(a.id)}" alt="${esc(a.name)}"><figcaption>Archivo combinado: ${esc(a.name)}</figcaption></figure>`
    : `<div class="vw-file">${icon.file}<div><b>${esc(a.name)}</b><small>PDF combinado${a.pages ? ` | ${a.pages} página${a.pages > 1 ? 's' : ''}` : ''}. Se ve completo en el visor del sistema.</small></div></div>`).join('');
  const sh = openSheet({ title: doc.filename, full: true, className: 'viewer-sheet', body: `
    <div class="vw">${pages || '<p class="sheet-lead">No hay vista previa guardada para este documento.</p>'}${extra}</div>
    <div class="sheet-foot"><button type="button" class="btn-secondary block" data-ext>${icon.eye}<span>Abrir en el visor del sistema</span></button></div>` });
  sh.body.querySelector('[data-ext]').addEventListener('click', () => { if (file) openBlob(file); });
}
