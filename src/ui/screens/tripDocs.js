/*
 * Expediente del viaje (dentro del detalle del viaje):
 *   Documento relacionado (trip.documentId; se puede ver o vincular, nunca se modifica)
 *   Documentos adicionales (tripAttachments): añadir varios a la vez, ver, cambiar nombre, reordenar, eliminar
 *   Ver expediente completo (vista previa en el orden real) y Generar PDF consolidado (ver, compartir, guardar)
 */
import { go } from '../../core/router.js';
import * as ta from '../../services/tripAttachments.js';
import * as ops from '../../services/operators.js';
import * as media from '../../services/media.js';
import { listDocuments } from '../../services/documents.js';
import { mainDocument, dossierPlan, buildDossier, docLabel, HEAVY_BYTES } from '../../services/dossier.js';
import { shareFile, downloadBlob, openBlob, isIOS } from '../../services/share.js';
import { esc, fmtSize, relDay } from '../../domain/shared/format.js';
import { icon } from '../components/icons.js';
import { openSheet, actionSheet, confirmDestructive, busy } from '../components/sheet.js';
import { openPicker } from '../components/picker.js';
import { toast } from '../components/toast.js';

const pagesTxt = (n) => (n ? `${n} página${n === 1 ? '' : 's'}` : '');
export const attachmentsMeta = (a) => (a.kind === 'pdf' ? ['PDF', pagesTxt(a.pages), fmtSize(a.size || 0)] : ['Imagen', fmtSize(a.size || 0)]).filter(Boolean).join(' · ');
/* Indicador discreto para las tarjetas de viajes */
export const attachCount = (tripId) => { const n = ta.countFor(tripId); return n ? `<span class="att-count" aria-label="${n} documento${n === 1 ? '' : 's'} adicional${n === 1 ? '' : 'es'}">${icon.paperclip}${n}</span>` : ''; };

export function mountTripDocs(box, { trip: trip0, onChange }) {
  let trip = trip0;
  const current = () => ops.allTrips().find((t) => t.id === trip.id) || trip;
  async function draw() {
    trip = current();
    const main = await mainDocument(trip), list = ta.listFor(trip.id), gone = await ta.missingFiles(trip.id);
    await media.ensureURLs(list.filter((a) => a.kind === 'img' && a.status === 'ok').map((a) => a.storageKey));
    const d = main.doc;
    const mainHTML = d && !main.missing
      ? `<div class="td-main"><span class="att-ic pdf">PDF</span><span class="att-tx"><b>${esc(docLabel(d))}</b><small>Documento principal · ${esc([pagesTxt(d.pages), fmtSize(d.size || 0), relDay(d.createdAt)].filter(Boolean).join(' · '))}</small></span>
          <span class="att-b"><button type="button" class="btn-ghost sm" data-td="view-main">Ver</button><button type="button" class="icon-btn" data-td="link" aria-label="Cambiar documento relacionado">${icon.edit}</button></span></div>`
      : `<div class="td-main none"><span class="att-ic none">${icon.file}</span><span class="att-tx"><b>Sin documento principal</b><small>${main.missing === 'deleted' ? 'El documento relacionado ya no existe en este dispositivo.' : main.missing === 'file' ? `No se encontró el PDF de ${esc(docLabel(d))}.` : 'Los documentos adicionales se conservan y se combinarán cuando vincules uno.'}</small></span>
          <span class="att-b"><button type="button" class="btn-secondary sm" data-td="link">Vincular</button></span></div>`;
    const rows = list.map((a, i) => { const ok = a.status === 'ok' && !gone.has(a.id); return `<li class="att td-att${ok ? '' : ' err'}" data-id="${esc(a.id)}">
        <span class="td-n" aria-hidden="true">${i + 1}</span>
        <span class="att-ic ${esc(a.kind)}"${a.kind === 'img' && ok ? ` style="background-image:url('${media.urlFor(a.storageKey)}')"` : ''}>${a.kind === 'pdf' ? 'PDF' : ok ? '' : 'IMG'}</span>
        <span class="att-tx"><b>${esc(a.name)}</b><small>${ok ? esc(attachmentsMeta(a)) : `<span class="td-errt">${icon.alert}${gone.has(a.id) ? 'Archivo no disponible en este dispositivo' : 'No se pudo procesar este archivo'}</span>`}</small>
          ${ok ? '' : `<span class="td-erracts">${gone.has(a.id) ? '' : `<button type="button" class="btn-secondary sm" data-ta="retry">${icon.refresh}<span>Reintentar</span></button>`}<button type="button" class="btn-ghost sm danger" data-ta="del">${icon.trash}<span>Eliminar</span></button></span>`}</span>
        <span class="att-b"><button type="button" class="icon-btn" data-ta="up" aria-label="Subir ${esc(a.name)}"${i ? '' : ' disabled'}>${icon.up}</button><button type="button" class="icon-btn" data-ta="down" aria-label="Bajar ${esc(a.name)}"${i < list.length - 1 ? '' : ' disabled'}>${icon.down}</button><button type="button" class="icon-btn" data-ta="more" aria-label="Acciones de ${esc(a.name)}">${icon.more}</button></span>
      </li>`; }).join('');
    const can = (d && !main.missing) || list.some((a) => a.status === 'ok' && !gone.has(a.id));
    box.innerHTML = `<h3 class="pk-h">Documento relacionado</h3>${mainHTML}
      <label class="btn-secondary block td-add">${icon.paperclip}<span>Añadir documentos</span><input type="file" accept="${ta.ACCEPT}" multiple hidden data-td-files></label>
      <div class="td-h"><h3 class="pk-h">Documentos adicionales</h3>${list.length ? `<span class="count">${list.length}</span>` : ''}</div>
      ${list.length ? `<ul class="att-list td-list">${rows}</ul>` : '<p class="td-empty">Sin documentos adicionales</p>'}
      <div class="sheet-acts td-acts"><button type="button" class="btn-secondary" data-td="preview"${can ? '' : ' disabled'}>${icon.eye}<span>Ver expediente completo</span></button><button type="button" class="btn-primary" data-td="build"${can ? '' : ' disabled'}>${icon.file}<span>Generar PDF consolidado</span></button></div>
      <p class="grp-note">El expediente une el documento relacionado original y, después, los adicionales en el orden de la lista. El original no se modifica.</p>`;
  }
  const changed = async () => { await draw(); onChange && onChange(); };

  box.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-td-files]'); if (!inp) return;
    const files = [...(inp.files || [])]; inp.value = '';
    if (!files.length) return;
    busy(true, 'Agregando documentos…', files.length > 1 ? `Procesando 1 de ${files.length} archivos` : '');
    let r;
    try { r = await ta.addFiles(trip.id, files, (i, n, name) => busy(true, 'Agregando documentos…', n > 1 ? `Procesando ${i} de ${n} archivos` : name)); }
    catch (err) { busy(false); toast('No se pudieron agregar los documentos.', { type: 'warn' }); return; }
    busy(false);
    await changed();
    if (r.added.length) toast(r.added.length === 1 ? 'Documento agregado' : `${r.added.length} documentos agregados`);
    if (r.failed.length) toast(`No se pudo procesar ${r.failed.length === 1 ? `«${r.failed[0]}»` : `${r.failed.length} archivos`}. Puedes reintentar o eliminarlo; los demás se agregaron.`, { type: 'warn', ms: 5500 });
    if (r.rejected.length) setTimeout(() => toast(`${r.rejected.map((x) => `«${x}»`).join(', ')}: solo se permiten PDF, JPG y PNG (máximo ${Math.round(ta.MAX_FILE / 1048576)} MB por archivo).`, { type: 'warn', ms: 5500 }), r.failed.length ? 5600 : 0);
  });

  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-td],[data-ta]'); if (!b) return;
    const act = b.dataset.td || b.dataset.ta, li = b.closest('[data-id]'), a = li ? ta.byId(li.dataset.id) : null;
    if (act === 'view-main') { go(`/doc/${encodeURIComponent(trip.documentId)}`); return; }
    if (act === 'link') { await linkDocument(); return; }
    if (act === 'preview') { await openDossierPreview(current()); return; }
    if (act === 'build') { await generate(current()); return; }
    if (!a) return;
    try {
      if (act === 'up' || act === 'down') { await ta.move(a.id, act === 'up' ? -1 : 1); await changed(); return; }
      if (act === 'retry') { await retry(a); return; }
      if (act === 'del') { await removeAtt(a); return; }
      if (act === 'more') {
        const list = ta.listFor(trip.id), i = list.findIndex((x) => x.id === a.id);
        const v = await actionSheet({ title: a.name, message: a.status === 'ok' ? attachmentsMeta(a) : 'No se pudo procesar este archivo', actions: [
          ...(a.status === 'ok' ? [{ label: 'Ver', value: 'view', icon: icon.eye }] : [{ label: 'Reintentar', value: 'retry', icon: icon.refresh }]),
          { label: 'Cambiar nombre', value: 'rename', icon: icon.edit },
          ...(i > 0 ? [{ label: 'Subir', value: 'up', icon: icon.up }] : []), ...(i < list.length - 1 ? [{ label: 'Bajar', value: 'down', icon: icon.down }] : []),
          { label: 'Eliminar', value: 'del', style: 'destructive', icon: icon.trash }] });
        if (v === 'view') await viewAttachment(a);
        if (v === 'retry') await retry(a);
        if (v === 'rename') renameAtt(a);
        if (v === 'up' || v === 'down') { await ta.move(a.id, v === 'up' ? -1 : 1); await changed(); }
        if (v === 'del') await removeAtt(a);
      }
    } catch (err) { toast(err.message || 'No se pudo completar la acción.', { type: 'warn' }); }
  });

  async function retry(a) {
    busy(true, 'Procesando archivo…', a.name);
    try { await ta.retry(a.id); busy(false); toast('Archivo procesado'); }
    catch (err) { busy(false); toast(`No se pudo procesar «${a.name}». Puede estar dañado o protegido; puedes eliminarlo y continuar.`, { type: 'warn', ms: 5000 }); }
    await changed();
  }
  async function removeAtt(a) {
    if (!(await confirmDestructive('¿Eliminar este documento adicional?', `${a.name}. Se quita del viaje y del expediente. El documento relacionado original no se modifica.`, 'Eliminar documento'))) return;
    await ta.remove(a.id); toast('Documento eliminado', { type: 'info' }); await changed();
  }
  function renameAtt(a) {
    const form = document.createElement('form'); form.className = 'op-form'; form.noValidate = true;
    form.innerHTML = `<label class="fld"><span class="fl">Nombre</span><input class="in" name="n" value="${esc(a.name)}" maxlength="120" autocomplete="off" enterkeyhint="done"></label>
      <div class="form-foot"><button type="submit" class="btn-primary block lg">Guardar nombre</button></div>`;
    const sh = openSheet({ title: 'Cambiar nombre', body: form });
    const inp = form.elements.n; setTimeout(() => { inp.focus(); const dot = a.name.lastIndexOf('.'); try { inp.setSelectionRange(0, dot > 0 ? dot : a.name.length); } catch (e) { /* */ } }, 250);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = inp.value.trim();
      if (!n) { toast('Escribe un nombre.', { type: 'warn' }); return; }
      await ta.rename(a.id, n); sh.close(); toast('Nombre actualizado'); await changed();
    });
  }
  async function linkDocument() {
    const docs = await listDocuments();
    if (!docs.length && !trip.documentId) { toast('Aún no hay documentos generados para vincular.', { type: 'info' }); return; }
    const items = docs.slice(0, 120).map((d) => { const S = d.summary || {}; return { value: d.id, label: docLabel(d), sub: [relDay(d.createdAt), d.type === 'puerto' ? (S.contenedores || []).join(' / ') : S.unidad, S.operador].filter(Boolean).join(' · '), icon: icon.file }; });
    if (trip.documentId) items.unshift({ value: '__none', label: 'Sin documento principal', sub: 'Quitar el vínculo (el documento no se borra)' });
    const r = await openPicker({ title: 'Documento relacionado', allowNew: false, placeholder: 'Buscar folio, contenedor u operador', current: trip.documentId || '', items });
    if (!r) return;
    const id = r.value === '__none' ? null : r.value;
    if (id === (trip.documentId || null)) return;
    await ops.setTripDocument(trip.id, id);
    toast(id ? 'Documento relacionado vinculado' : 'Vínculo quitado'); await changed();
  }
  draw();
  return { refresh: draw };
}

/* Ver un adjunto: imagen dentro de la app; PDF en el visor del sistema (archivo ya en memoria para abrirlo dentro del toque) */
async function viewAttachment(a) {
  const blob = await ta.blobOf(a);
  if (!blob) { toast('El archivo ya no está en este dispositivo.', { type: 'warn' }); return; }
  /* El tipo sale del kind validado (pdf | img), nunca del dato guardado: un adjunto importado no puede abrirse como página */
  const type = a.kind === 'img' ? (/^image\/(jpeg|png)$/.test(blob.type) ? blob.type : 'image/jpeg') : 'application/pdf';
  const file = new File([blob], a.name, { type });
  if (a.kind === 'img') {
    const u = await media.ensureURL(a.storageKey);
    const sh = openSheet({ title: a.name, full: true, body: `<img class="ph-big td-img" src="${u}" alt="${esc(a.name)}"><p class="sheet-lead center">${esc(attachmentsMeta(a))}</p>
      <div class="sheet-acts col"><button type="button" class="btn-secondary block" data-ext>${icon.share}<span>Compartir imagen</span></button></div>` });
    sh.body.querySelector('[data-ext]').addEventListener('click', async () => { const r = await shareFile(file, { title: a.name }); if (r !== 'shared' && r !== 'cancelled') downloadBlob(file, a.name); });
    return;
  }
  const sh = openSheet({ title: a.name, body: `<div class="vw-file">${icon.file}<div><b>${esc(a.name)}</b><small>${esc(attachmentsMeta(a))}</small></div></div>
    <div class="sheet-acts col"><button type="button" class="btn-primary block" data-open>${icon.eye}<span>Abrir PDF</span></button><button type="button" class="btn-secondary block" data-share>${icon.share}<span>Compartir</span></button></div>` });
  sh.body.querySelector('[data-open]').addEventListener('click', () => openBlob(file));
  sh.body.querySelector('[data-share]').addEventListener('click', async () => { const r = await shareFile(file, { title: a.name }); if (r !== 'shared' && r !== 'cancelled') downloadBlob(file, a.name); });
}

/* Vista previa del expediente: secciones y páginas en el orden real del PDF consolidado */
export async function openDossierPreview(trip) {
  const plan = await dossierPlan(trip);
  if (!plan.sections.length) { toast('No hay documentos para el expediente.', { type: 'info' }); return; }
  const ids = [];
  plan.sections.forEach((s) => { if (s.kind === 'main') ids.push(...(s.doc.previewIds || []).slice(0, s.to - s.from + 1)); if (s.kind === 'img') ids.push(s.att.storageKey); });
  await media.ensureURLs(ids);
  const page = (n, img = '') => `<figure class="td-pg${img ? '' : ' ph'}">${img ? `<img src="${img}" alt="Página ${n}" loading="lazy">` : `${icon.file}`}<figcaption>Página ${n}</figcaption></figure>`;
  const secHTML = plan.sections.map((s) => {
    const n = s.to - s.from + 1, pages = [];
    for (let k = 0; k < n; k++) {
      const pid = s.kind === 'main' ? (s.doc.previewIds || [])[k] : s.kind === 'img' ? s.att.storageKey : null;
      pages.push(page(s.from + k, pid ? media.urlFor(pid) : ''));
    }
    return `<section class="td-sec"><div class="td-sech"><b>${esc(s.kind === 'main' ? 'Documento original' : s.name)}</b><small>${esc(s.kind === 'main' ? docLabel(s.doc) + ' · ' : '')}${n === 1 ? `Página ${s.from}` : `Páginas ${s.from} a ${s.to}`}</small></div>
      <div class="td-pages">${pages.join('')}</div>${s.kind === 'pdf' ? '<p class="td-note">Páginas originales del PDF; se ven completas al generar el expediente.</p>' : ''}</section>`;
  }).join('');
  const sh = openSheet({ title: 'Expediente completo', full: true, body: `
    <p class="sheet-lead">${esc(pagesTxt(plan.pages))} · ${plan.sections.length} documento${plan.sections.length === 1 ? '' : 's'} · aprox. ${esc(fmtSize(plan.bytes))}</p>
    ${plan.main.doc && !plan.main.missing ? '' : `<p class="op-warn">${icon.info}<span>Sin documento principal: el expediente tendrá solo los documentos adicionales.</span></p>`}
    ${plan.skipped.length ? `<p class="op-warn">${icon.alert}<span>Se omitirá${plan.skipped.length === 1 ? '' : 'n'} por no poder procesarse: ${plan.skipped.map((a) => esc(a.name)).join(', ')}.</span></p>` : ''}
    <div class="td-preview">${secHTML}</div>
    <div class="sheet-foot"><button type="button" class="btn-primary block lg" data-build>${icon.file}<span>Generar PDF consolidado</span></button></div>` });
  sh.body.querySelector('[data-build]').addEventListener('click', () => { sh.close(); generate(trip); });
}

/* Genera el PDF consolidado y ofrece Ver, Compartir y Guardar en Archivos */
export async function generate(trip) {
  const plan = await dossierPlan(trip);
  if (!plan.sections.length) { toast('No hay documentos para el expediente.', { type: 'info' }); return; }
  if (plan.bytes > HEAVY_BYTES) {
    const ok = await actionSheet({ title: 'Expediente pesado', message: `Los documentos suman aprox. ${fmtSize(plan.bytes)}. En iPhone la combinación puede tardar y el archivo será grande para compartir.`, actions: [{ label: 'Generar de todos modos', value: true, style: 'primary' }] });
    if (!ok) return;
  }
  busy(true, 'Preparando expediente…', '');
  let out;
  try { out = await buildDossier(trip, { onProgress: (i, n) => busy(true, 'Preparando expediente…', `Procesando ${i} de ${n} archivo${n === 1 ? '' : 's'}`) }); }
  catch (err) { busy(false); console.error(err); toast(err.message === 'No hay documentos que se puedan combinar.' ? err.message : 'No se pudo generar el expediente. Intenta de nuevo; si persiste, revisa el archivo más pesado.', { type: 'warn', ms: 5000 }); return; }
  busy(false);
  const f = out.file;
  const sh = openSheet({ title: 'Expediente generado', body: `
    <section class="ok-box stmt-ok">${icon.check}<span><b>${esc(f.name)}</b><small>${esc(pagesTxt(out.pages))} · ${esc(fmtSize(f.size))}</small></span></section>
    ${out.skipped.length ? `<p class="op-warn">${icon.alert}<span>No se pudo procesar: ${out.skipped.map(esc).join(', ')}. El resto se combinó.</span></p>` : ''}
    ${f.size > 40 * 1048576 ? `<p class="op-warn">${icon.info}<span>Archivo pesado: compartirlo puede tardar.</span></p>` : ''}
    <ol class="td-index">${out.sections.map((s) => `<li><span>${esc(s.kind === 'main' ? 'Documento original' : s.name)}</span><small>${s.to > s.from ? `pp. ${s.from}–${s.to}` : `p. ${s.from}`}</small></li>`).join('')}</ol>
    <div class="sheet-acts col"><button type="button" class="btn-primary block" data-x="view">${icon.eye}<span>Ver PDF</span></button>
      <div class="sheet-acts td-two"><button type="button" class="btn-secondary" data-x="share">${icon.share}<span>Compartir</span></button><button type="button" class="btn-secondary" data-x="save">${icon.folder}<span>Guardar en Archivos</span></button></div></div>
    <p class="grp-note">Archivo derivado: el documento relacionado original se conserva sin cambios. Si después agregas documentos, vuelve a generarlo.</p>` });
  sh.body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'view') { openBlob(f); return; }
    const r = await shareFile(f, { title: f.name });
    if (r === 'shared') toast(b.dataset.x === 'save' ? 'Listo' : 'Expediente compartido');
    else if (r !== 'cancelled') { downloadBlob(f, f.name); toast(isIOS() ? 'Se abrió la descarga del PDF. Desde ahí puedes guardarlo en Archivos.' : 'PDF descargado: ' + f.name, { ms: 3500 }); }
  });
}
