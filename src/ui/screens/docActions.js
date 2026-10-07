/*
 * Acciones sobre un PDF generado: compartir, guardar en Archivos, WhatsApp y ver.
 * El archivo debe estar ya en memoria para que navigator.share funcione dentro del toque.
 */
import { shareFile, downloadBlob, openBlob, canShareFiles, shareText, waURL, copyText, isIOS } from '../../services/share.js';
import { markShared } from '../../services/documents.js';
import { getSetting, setSetting } from '../../services/settings.js';
import { waText } from '../../domain/puerto/model.js';
import { esc } from '../../domain/shared/format.js';
import { openSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { icon } from '../components/icons.js';
import { openViewer } from './viewer.js';

export async function doShare(doc, file, { save = false } = {}) {
  if (!file) { toast('El PDF no está disponible.', { type: 'warn' }); return; }
  if (save && isIOS() && !getSetting('hintSaveFiles')) { setSetting('hintSaveFiles', true); }
  const r = await shareFile(file, { title: doc.filename });
  if (r === 'shared') { await markShared(doc.id); toast(save ? 'Listo' : 'Documento compartido'); return; }
  if (r === 'cancelled') return;
  /* Sin hoja de compartir con archivos (escritorio o iOS antiguo): descarga */
  downloadBlob(file, doc.filename);
  toast(isIOS() ? 'Se abrió la descarga del PDF. Desde ahí puedes guardarlo en Archivos.' : 'PDF descargado: ' + doc.filename, { ms: 3500 });
}
export function saveHint() {
  return isIOS() ? 'En la hoja de compartir elige «Guardar en Archivos».' : 'Se descargará el PDF a tu equipo.';
}

/* WhatsApp: vista previa del resumen (Puerto) y después compartir */
export function openWhatsApp(doc, file) {
  if (doc.type !== 'puerto') {
    const sh = openSheet({ title: 'Enviar por WhatsApp', body: `<p class="sheet-lead">Se abrirá la hoja de compartir con el PDF. Elige WhatsApp y el chat.</p>
      <button type="button" class="btn-wa block" data-wa-file>${icon.whatsapp}<span>Compartir PDF</span></button>` });
    sh.body.querySelector('[data-wa-file]').addEventListener('click', () => { sh.close(); doShare(doc, file); });
    return;
  }
  const t = waText(doc.data);
  const fileOk = file && canShareFiles(file);
  const sh = openSheet({ title: 'Resumen del servicio', body: `
    <p class="sheet-lead">Vista previa del mensaje para WhatsApp.</p>
    <div class="wa-chat"><div class="wa-bubble">${esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>')}</div></div>
    <div class="sheet-acts col">
      <a class="btn-wa block" href="${waURL(t)}" target="_blank" rel="noopener" data-wa-open>${icon.whatsapp}<span>Abrir en WhatsApp</span></a>
      ${navigator.share ? `<button type="button" class="btn-secondary block" data-wa-share>${icon.share}<span>Compartir resumen</span></button>` : ''}
      ${fileOk ? `<button type="button" class="btn-secondary block" data-wa-both>${icon.file}<span>Compartir PDF con el resumen</span></button>` : ''}
      <button type="button" class="btn-ghost block" data-wa-copy>${icon.copy}<span>Copiar texto</span></button>
    </div>` });
  sh.body.querySelector('[data-wa-open]').addEventListener('click', () => markShared(doc.id));
  const sb = sh.body.querySelector('[data-wa-share]');
  if (sb) sb.addEventListener('click', async () => { const r = await shareText(t); if (r === 'shared') { markShared(doc.id); toast('Resumen compartido'); } });
  const bb = sh.body.querySelector('[data-wa-both]');
  if (bb) bb.addEventListener('click', async () => { const r = await shareFile(file, { title: doc.filename, text: t }); if (r === 'shared') { markShared(doc.id); toast('Documento compartido'); } });
  sh.body.querySelector('[data-wa-copy]').addEventListener('click', async (e) => {
    const ok = await copyText(t);
    toast(ok ? 'Texto copiado. Pégalo en WhatsApp.' : 'No se pudo copiar automáticamente; selecciona el texto y cópialo.', { type: ok ? 'ok' : 'warn', ms: 3000 });
  });
}

export function viewPdf(doc, file) { openViewer(doc, file); }
export function openExternal(file) { if (file) openBlob(file); }
