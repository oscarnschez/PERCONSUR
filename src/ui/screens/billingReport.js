/*
 * Reporte de cobranza (#/cobranza/reporte)
 * División y periodo → vista previa (el documento real) → Generar PDF → Ver / Compartir / Guardar.
 */
import { el, on } from '../../core/dom.js';
import { back } from '../../core/router.js';
import * as billing from '../../services/billing.js';
import { getCompany } from '../../services/companies.js';
import { shareFile, downloadBlob, openBlob, isIOS } from '../../services/share.js';
import { prepareBillingReport, billingSVGs, billingBlob } from '../../services/billingPdf.js';
import { esc, fmtSize } from '../../domain/shared/format.js';
import { money } from '../../domain/operators/money.js';
import { PERIODS, periodRange, todayStr, fmtDate } from '../../domain/operators/balance.js';
import { filterItems } from '../../domain/billing/billing.js';
import { billingReportFilename } from '../../domain/billing/report.js';
import { icon } from '../components/icons.js';
import { busy, openSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';

const ZOOMS = [1, 1.5, 2, 3];

export async function billingReportScreen() {
  await billing.loadBilling();
  let div = 'ambas', per = 'todo', zoom = 0, prepared = null, generated = null, seq = 0;
  const custom = { from: '', to: '' };

  const root = el(`<div class="wiz stmt">
    <header class="wiz-top">
      <button type="button" class="icon-btn" data-back aria-label="Volver a Cobranza">${icon.back}</button>
      <div class="wiz-title static"><small>Cobranza</small><b>Reporte en PDF</b></div><span></span>
    </header>
    <main class="wiz-body">
      <section class="grp"><div class="grp-h"><h3>Contenido del reporte</h3></div><div class="grp-b">
        <div class="fld"><span class="fl">División</span><div class="seg">${[['ambas', 'Ambas'], ['puerto', 'Puerto'], ['campo', 'Campo']].map(([k, l]) => `<button type="button" class="seg-b${k === div ? ' on' : ''}" data-div="${k}">${l}</button>`).join('')}</div></div>
        <div class="fld"><span class="fl">Periodo (por fecha del viaje)</span><div class="chips filters">${PERIODS.map(([k, l]) => `<button type="button" class="chip${k === per ? ' on' : ''}" data-per="${k}">${l}</button>`).join('')}</div></div>
        <div class="row2 period-custom" data-custom hidden><label class="fld"><span class="fl">Desde</span><input class="in" type="date" data-c="from"></label><label class="fld"><span class="fl">Hasta</span><input class="in" type="date" data-c="to"></label></div>
        <p class="stmt-cut" data-note></p>
      </div></section>
      <div data-status></div>
      <div class="grp-h solo"><h3>Vista previa del reporte</h3><span class="count" data-pagecount></span></div>
      <div class="zoom-bar" role="group" aria-label="Zoom de la vista previa">
        <button type="button" class="icon-btn" data-z="-1" aria-label="Alejar">${icon.minus}</button>
        <span data-zl>Ajustado al ancho</span>
        <button type="button" class="icon-btn" data-z="1" aria-label="Acercar">${icon.plus}</button>
      </div>
      <div class="stmt-viewport"><div class="stmt-pages" data-pages><p class="grp-note center">Preparando vista previa…</p></div></div>
      <p class="grp-note center">Tamaño carta. Esta vista es el documento que se convertirá en PDF.</p>
    </main>
    <footer class="actionbar" data-bar></footer>
  </div>`);
  const $ = (s) => root.querySelector(s);

  function scope() {
    const range = periodRange(per, custom), divisions = div === 'ambas' ? ['puerto', 'campo'] : [div];
    const periodLabel = range.from || range.to ? `${fmtDate(range.from) || 'Inicio'} a ${fmtDate(range.to) || 'hoy'}` : 'Todos los viajes registrados';
    return { divisions, periodLabel, items: filterItems(billing.items(), { from: range.from, to: range.to }) };
  }
  async function rebuild() {
    const my = ++seq, issued = todayStr(), sc = scope();
    generated = null; drawBar(); $('[data-status]').innerHTML = '';
    try {
      const p = await prepareBillingReport({ company: getCompany('perconsur'), items: sc.items, divisions: sc.divisions, periodLabel: sc.periodLabel, issued });
      if (my !== seq) return;
      prepared = { ...p, issued, divisions: sc.divisions };
      $('[data-pages]').innerHTML = billingSVGs(p).join('');
      const pc = p.model.pages.length, sm = p.model.summary;
      $('[data-pagecount]').textContent = `${pc} página${pc === 1 ? '' : 's'}`;
      $('[data-note]').innerHTML = [`${p.model.count} viaje${p.model.count === 1 ? '' : 's'} en el reporte.`, `Por cobrar: ${money(sm.due)} | Pagado: ${money(sm.paid)}`].map(esc).join('<br>');
    } catch (e) {
      console.error(e);
      prepared = null;
      $('[data-pages]').innerHTML = '<p class="grp-note center warn-t">No se pudo preparar la vista previa. Intenta de nuevo.</p>';
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
  async function deliver(file, save) {
    const r = await shareFile(file, { title: file.name });
    if (r === 'shared') { toast(save ? 'Listo' : 'Reporte compartido'); return; }
    if (r === 'cancelled') return;
    downloadBlob(file, file.name);
    toast(isIOS() ? 'Se abrió la descarga del PDF. Desde ahí puedes guardarlo en Archivos.' : 'PDF descargado: ' + file.name, { ms: 3500 });
  }
  async function generate() {
    if (!prepared) return;
    busy(true, 'Generando PDF…', 'Reporte de cobranza');
    try {
      const filename = billingReportFilename(prepared.issued, prepared.divisions);
      const blob = await billingBlob(prepared, { title: `Reporte de cobranza ${fmtDate(prepared.issued)}` });
      generated = { file: new File([blob], filename, { type: 'application/pdf' }) };
      busy(false);
      const pc = prepared.model.pages.length;
      $('[data-status]').innerHTML = `<section class="ok-box stmt-ok">${icon.check}<span><b>PDF generado</b><small>${esc(filename)} | ${pc} página${pc === 1 ? '' : 's'} | ${fmtSize(blob.size)}</small></span></section>`;
      drawBar();
      toast('PDF generado');
    } catch (e) {
      busy(false); console.error(e);
      toast('No se pudo generar el PDF. Intenta de nuevo.', { type: 'warn', ms: 4500 });
    }
  }
  function viewPdf(file) {
    const sh = openSheet({ title: file.name, full: true, className: 'viewer-sheet', body: `<div class="vw stmt-vw">${billingSVGs(prepared).join('')}</div>
      <div class="sheet-foot"><button type="button" class="btn-secondary block" data-ext>${icon.eye}<span>Abrir en el visor del sistema</span></button></div>` });
    sh.body.querySelector('[data-ext]').addEventListener('click', () => openBlob(file));
  }

  on(root, 'click', '[data-back]', () => back('/cobranza'));
  on(root, 'click', '[data-div]', (e, b) => { div = b.dataset.div; root.querySelectorAll('[data-div]').forEach((x) => x.classList.toggle('on', x === b)); rebuild(); });
  on(root, 'click', '[data-per]', (e, b) => {
    per = b.dataset.per; root.querySelectorAll('[data-per]').forEach((x) => x.classList.toggle('on', x === b));
    $('[data-custom]').hidden = per !== 'custom'; rebuild();
  });
  root.addEventListener('change', (e) => { const t = e.target; if (t.dataset.c) { custom[t.dataset.c] = t.value; rebuild(); } });
  on(root, 'click', '[data-z]', (e, b) => { zoom = Math.min(ZOOMS.length - 1, Math.max(0, zoom + +b.dataset.z)); applyZoom(); });
  on(root, 'click', '[data-act]', (e, b) => {
    const a = b.dataset.act;
    if (a === 'back') back('/cobranza');
    if (a === 'generate') generate();
    if (a === 'share' && generated) deliver(generated.file, false);
    if (a === 'save' && generated) deliver(generated.file, true);
    if (a === 'view' && generated) viewPdf(generated.file);
  });

  drawBar(); applyZoom();
  return { el: root, mounted: () => { rebuild(); } };
}
