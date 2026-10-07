/*
 * Estado de cuenta de operador (#/operadores/:id/estado)
 * Ficha → Generar PDF → fecha de corte → vista previa (el documento real) → Generar PDF → Ver / Compartir / Guardar.
 */
import { el, on } from '../../core/dom.js';
import { go, back } from '../../core/router.js';
import * as ops from '../../services/operators.js';
import * as media from '../../services/media.js';
import { getCompany } from '../../services/companies.js';
import { shareFile, downloadBlob, openBlob, isIOS } from '../../services/share.js';
import { prepareStatement, statementSVGs, statementBlob } from '../../services/statementPdf.js';
import { esc, fmtSize } from '../../domain/shared/format.js';
import { todayStr, isDate, fmtDate } from '../../domain/operators/balance.js';
import { statementFolio, statementFilename, longDate } from '../../domain/operators/statement.js';
import { icon } from '../components/icons.js';
import { busy, openSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';

const ZOOMS = [1, 1.5, 2, 3];

export async function statementScreen({ id }) {
  const op = ops.operatorById(id);
  if (!op) { go('/operadores', { replace: true }); return null; }
  const st = ops.settingsFor(id);
  const fichaCut = isDate(st.cutoffDate) ? st.cutoffDate : null;
  let mode = 'hoy', other = fichaCut || todayStr(), zoom = 0, prepared = null, generated = null, seq = 0;
  const files = new Map();
  const cutoff = () => (mode === 'ficha' ? fichaCut : mode === 'fecha' && isDate(other) ? other : todayStr());

  const root = el(`<div class="wiz stmt">
    <header class="wiz-top">
      <button type="button" class="icon-btn" data-back aria-label="Volver a la ficha">${icon.back}</button>
      <div class="wiz-title static"><small>Estado de cuenta</small><b>${esc(op.name)}</b></div><span></span>
    </header>
    <main class="wiz-body">
      <section class="grp"><div class="grp-h"><h3>Fecha de corte</h3></div><div class="grp-b">
        <div class="seg">
          <button type="button" class="seg-b on" data-mode="hoy">Hoy</button>
          ${fichaCut ? `<button type="button" class="seg-b" data-mode="ficha">Corte de la ficha</button>` : ''}
          <button type="button" class="seg-b" data-mode="fecha">Otra fecha</button>
        </div>
        <label class="fld" data-other hidden><span class="fl">Estado al</span><input class="in" type="date" value="${esc(other)}" data-cut></label>
        <p class="stmt-cut" data-cutnote></p>
      </div></section>
      <div data-status></div>
      <div class="grp-h solo"><h3>Vista previa del estado de cuenta</h3><span class="count" data-pagecount></span></div>
      <div class="zoom-bar" role="group" aria-label="Zoom de la vista previa">
        <button type="button" class="icon-btn" data-z="-1" aria-label="Alejar">${icon.minus}</button>
        <span data-zl>Ajustado al ancho</span>
        <button type="button" class="icon-btn" data-z="1" aria-label="Acercar">${icon.plus}</button>
      </div>
      <div class="stmt-viewport"><div class="stmt-pages" data-pages><p class="grp-note center">Preparando vista previa…</p></div></div>
      <p class="grp-note center">Tamaño carta. Esta vista es el documento que se convertirá en PDF.</p>
      <section data-issued></section>
    </main>
    <footer class="actionbar" data-bar></footer>
  </div>`);
  const $ = (s) => root.querySelector(s);

  async function rebuild() {
    const my = ++seq, cut = cutoff(), issued = todayStr();
    generated = null; drawBar(); $('[data-status]').innerHTML = '';
    const n = await ops.peekStatementNumber(issued);
    try {
      const p = await prepareStatement({ op, company: getCompany('perconsur'), opCompany: getCompany(op.company).legal, rec: ops.recordsOf(id), cutoff: cut, folio: statementFolio(issued, n), issued });
      if (my !== seq) return;
      prepared = { ...p, cut, issued, n };
      $('[data-pages]').innerHTML = statementSVGs(p).join('');
      const pc = p.model.pages.length;
      $('[data-pagecount]').textContent = `${pc} página${pc === 1 ? '' : 's'}`;
      const r = p.model.res, notes = [`Balance al ${longDate(r.cutoff)}. Solo se incluyen movimientos hasta esta fecha.`];
      if (fichaCut && cut !== fichaCut) notes.push(`La ficha del operador usa corte al ${fmtDate(fichaCut)}.`);
      if (r.sat.manualIgnored) notes.push(`El ajuste manual de sábados (${r.sat.manualValue}) corresponde al corte de la ficha; a esta fecha se calculan automáticamente: ${r.sat.count}.`);
      if (cut > todayStr()) notes.push('La fecha de corte es posterior a hoy.');
      $('[data-cutnote]').innerHTML = notes.map(esc).join('<br>');
    } catch (e) {
      console.error(e);
      $('[data-pages]').innerHTML = '<p class="grp-note center warn-t">No se pudo preparar la vista previa. Abre la app una vez con conexión e intenta de nuevo.</p>';
    }
    drawBar();
  }
  function applyZoom() {
    const z = ZOOMS[zoom];
    $('[data-pages]').style.width = `${z * 100}%`;
    $('[data-zl]').textContent = z === 1 ? 'Ajustado al ancho' : `${Math.round(z * 100)} %`;
    root.querySelector('[data-z="-1"]').disabled = zoom === 0;
    root.querySelector('[data-z="1"]').disabled = zoom === ZOOMS.length - 1;
  }
  function drawBar() {
    const bar = $('[data-bar]');
    if (generated) {
      bar.className = 'actionbar bar3';
      bar.innerHTML = `<button type="button" class="btn-secondary" data-act="view">${icon.eye}<span>Ver PDF</span></button>
        <button type="button" class="btn-primary" data-act="share">${icon.share}<span>Compartir</span></button>
        <button type="button" class="btn-secondary" data-act="save">${icon.folder}<span>Guardar en Archivos</span></button>`;
    } else {
      bar.className = 'actionbar';
      bar.innerHTML = `<button type="button" class="btn-secondary" data-act="back">${icon.back}<span>Volver</span></button>
        <button type="button" class="btn-primary" data-act="generate" ${prepared ? '' : 'disabled'}>${icon.file}<span>Generar PDF</span></button>`;
    }
  }
  async function drawIssued() {
    const list = ops.statementsOf(id).slice(0, 10);
    for (const s of list) if (!files.has(s.id)) { const b = await media.getBlob(s.pdfId); if (b) files.set(s.id, new File([b], s.filename, { type: 'application/pdf' })); }
    $('[data-issued]').innerHTML = list.length ? `<div class="grp-h solo"><h3>Estados de cuenta emitidos</h3></div><div class="list">${list.map((s) => `<div class="row static issued">
        <span class="row-tx"><span class="row-l1"><b class="mono">${esc(s.folio)}</b></span><span class="row-l3">Corte ${esc(fmtDate(s.cutoff))} | emitido ${esc(fmtDate(s.issued))} | ${s.pages} pág. | ${fmtSize(s.size || 0)}</span></span>
        ${files.has(s.id) ? `<button type="button" class="icon-btn" data-open="${esc(s.id)}" aria-label="Abrir ${esc(s.folio)}">${icon.eye}</button><button type="button" class="icon-btn" data-share="${esc(s.id)}" aria-label="Compartir ${esc(s.folio)}">${icon.share}</button>` : ''}
      </div>`).join('')}</div>` : '';
  }
  async function deliver(file, save) {
    const r = await shareFile(file, { title: file.name });
    if (r === 'shared') { toast(save ? 'Listo' : 'Estado de cuenta compartido'); return; }
    if (r === 'cancelled') return;
    downloadBlob(file, file.name);
    toast(isIOS() ? 'Se abrió la descarga del PDF. Desde ahí puedes guardarlo en Archivos.' : 'PDF descargado: ' + file.name, { ms: 3500 });
  }

  async function generate() {
    if (!prepared) return;
    busy(true, 'Generando PDF…', 'Estado de cuenta');
    try {
      /* El folio se reserva al generar; la vista previa mostraba el siguiente disponible */
      const n = await ops.reserveStatementNumber(prepared.issued);
      let p = prepared;
      if (n !== prepared.n) {
        const fresh = await prepareStatement({ op, company: getCompany('perconsur'), opCompany: getCompany(op.company).legal, rec: ops.recordsOf(id), cutoff: prepared.cut, folio: statementFolio(prepared.issued, n), issued: prepared.issued });
        p = { ...fresh, cut: prepared.cut, issued: prepared.issued, n };
        prepared = p; $('[data-pages]').innerHTML = statementSVGs(p).join('');
      }
      const folio = statementFolio(p.issued, n), filename = statementFilename(op.name, p.cut);
      const blob = await statementBlob(p, { title: `Estado de cuenta ${folio} | ${op.name}` });
      const sid = 'eo_' + Date.now().toString(36);
      const pdfId = await media.saveBlob(blob, { owner: 'stmt:' + sid, kind: 'pdf', name: filename });
      const stmt = await ops.saveStatement({ id: sid, operatorId: id, folio, cutoff: p.cut, issued: p.issued, filename, pages: p.model.pages.length, size: blob.size, pdfId });
      generated = { file: new File([blob], filename, { type: 'application/pdf' }), stmt };
      files.set(sid, generated.file);
      busy(false);
      $('[data-status]').innerHTML = `<section class="ok-box stmt-ok">${icon.check}<span><b>PDF generado | ${esc(folio)}</b><small>${esc(filename)} | ${stmt.pages} página${stmt.pages === 1 ? '' : 's'} | ${fmtSize(blob.size)}</small></span></section>`;
      drawBar(); drawIssued();
      toast('PDF generado');
    } catch (e) {
      busy(false); console.error(e);
      toast('No se pudo generar el PDF. Intenta de nuevo.', { type: 'warn', ms: 4500 });
    }
  }
  function viewPdf(file) {
    const sh = openSheet({ title: file.name, full: true, className: 'viewer-sheet', body: `<div class="vw stmt-vw">${generated && file === generated.file ? statementSVGs(prepared).join('') : '<p class="sheet-lead">Este estado de cuenta se abre en el visor del sistema.</p>'}</div>
      <div class="sheet-foot"><button type="button" class="btn-secondary block" data-ext>${icon.eye}<span>Abrir en el visor del sistema</span></button></div>` });
    sh.body.querySelector('[data-ext]').addEventListener('click', () => openBlob(file));
  }

  on(root, 'click', '[data-back]', () => back(`/operadores/${id}`));
  on(root, 'click', '[data-mode]', (e, b) => {
    mode = b.dataset.mode;
    root.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
    $('[data-other]').hidden = mode !== 'fecha';
    rebuild();
  });
  root.addEventListener('change', (e) => {
    if (!e.target.matches('[data-cut]')) return;
    if (!isDate(e.target.value)) { toast('Elige una fecha de corte válida.', { type: 'warn' }); return; }
    other = e.target.value; rebuild();
  });
  on(root, 'click', '[data-z]', (e, b) => { zoom = Math.min(ZOOMS.length - 1, Math.max(0, zoom + +b.dataset.z)); applyZoom(); });
  on(root, 'click', '[data-act]', (e, b) => {
    const a = b.dataset.act;
    if (a === 'back') back(`/operadores/${id}`);
    if (a === 'generate') generate();
    if (a === 'share' && generated) deliver(generated.file, false);
    if (a === 'save' && generated) deliver(generated.file, true);
    if (a === 'view' && generated) viewPdf(generated.file);
  });
  on(root, 'click', '[data-share]', (e, b) => { const f = files.get(b.dataset.share); if (f) deliver(f, false); });
  on(root, 'click', '[data-open]', (e, b) => { const f = files.get(b.dataset.open); if (f) openBlob(f); });

  drawBar(); applyZoom();
  return { el: root, mounted: () => { rebuild(); drawIssued(); } };
}
