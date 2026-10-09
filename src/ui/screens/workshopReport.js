/*
 * Taller — reporte en PDF con vista previa del documento real.
 *   #/operacion/taller/reporte/:id                 reporte individual de una orden
 *   #/operacion/taller/reporte-equipo/:type/:id    reporte de servicios de una unidad (u) o remolque (r) en un periodo
 * Vista previa (SVG del mismo modelo de páginas que el PDF) con zoom → Generar PDF → Ver / Compartir / Guardar.
 */
import { el, on } from '../../core/dom.js';
import { back } from '../../core/router.js';
import { shareFile, downloadBlob, openBlob, isIOS } from '../../services/share.js';
import { prepareOrderReport, prepareEquipmentReport, reportSVGs, reportBlob } from '../../services/maintenancePdf.js';
import * as mt from '../../services/maintenance.js';
import { esc, fmtSize } from '../../domain/shared/format.js';
import { ORDER_TYPES, ORDER_STATUSES } from '../../domain/maintenance/catalog.js';
import { splitTs } from '../../domain/maintenance/maintenance.js';
import { icon } from '../components/icons.js';
import { busy, openSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';

const ZOOMS = [1, 1.5, 2, 3];
const day = (ts) => splitTs(ts).date;
const PERIODS = [['mes', 'Este mes'], ['3m', 'Últimos 3 meses'], ['anio', 'Este año'], ['todo', 'Todo el historial'], ['custom', 'Personalizado']];
function periodRange(k, custom) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  if (k === 'mes') return { from: day(new Date(y, m, 1).getTime()), to: day(now.getTime()) };
  if (k === '3m') return { from: day(new Date(y, m - 2, 1).getTime()), to: day(now.getTime()) };
  if (k === 'anio') return { from: `${y}-01-01`, to: day(now.getTime()) };
  if (k === 'custom') return { from: custom.from || '', to: custom.to || '' };
  return { from: '', to: '' };
}

function shell(title, sub, controls) {
  return el(`<div class="wiz stmt mt-rep">
    <header class="wiz-top"><button type="button" class="icon-btn" data-back aria-label="Volver">${icon.back}</button>
      <div class="wiz-title static"><small>${esc(sub)}</small><b>${esc(title)}</b></div><span></span></header>
    <main class="wiz-body">
      ${controls}
      <div data-status></div>
      <div class="grp-h solo"><h3>Vista previa del reporte</h3><span class="count" data-pagecount></span></div>
      <div class="zoom-bar" role="group" aria-label="Zoom de la vista previa">
        <button type="button" class="icon-btn" data-z="-1" aria-label="Alejar">${icon.minus}</button><span data-zl>Ajustado al ancho</span>
        <button type="button" class="icon-btn" data-z="1" aria-label="Acercar">${icon.plus}</button></div>
      <div class="stmt-viewport"><div class="stmt-pages" data-pages><p class="grp-note center">Preparando vista previa…</p></div></div>
      <p class="grp-note center">Tamaño carta. Esta vista es el documento que se convertirá en PDF (mismos datos, tablas, diagramas, colores e imágenes).</p>
    </main>
    <footer class="actionbar" data-bar></footer></div>`);
}

function reportController(root, { prepare, backTo, onReady = null }) {
  let zoom = 0, prepared = null, generated = null, seq = 0;
  const $ = (s) => root.querySelector(s);
  async function rebuild() {
    const my = ++seq;
    generated = null; drawBar(); $('[data-status]').innerHTML = '';
    try {
      const p = await prepare();
      if (my !== seq) return;
      prepared = p;
      if (onReady) onReady(p);
      $('[data-pages]').innerHTML = reportSVGs(p).join('');
      const pc = p.model.pages.length;
      $('[data-pagecount]').textContent = `${pc} página${pc === 1 ? '' : 's'}`;
    } catch (e) {
      console.error(e); prepared = null;
      $('[data-pages]').innerHTML = `<p class="grp-note center warn-t">${esc(e.message || 'No se pudo preparar la vista previa.')}</p>`;
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
    busy(true, 'Generando PDF…', 'Reporte de mantenimiento');
    try {
      const blob = await reportBlob(prepared);
      generated = { file: new File([blob], prepared.filename, { type: 'application/pdf' }) };
      busy(false);
      const pc = prepared.model.pages.length;
      $('[data-status]').innerHTML = `<section class="ok-box stmt-ok">${icon.check}<span><b>PDF generado</b><small>${esc(prepared.filename)} | ${pc} página${pc === 1 ? '' : 's'} | ${fmtSize(blob.size)}</small></span></section>`;
      drawBar(); toast('PDF generado');
    } catch (e) { busy(false); console.error(e); toast('No se pudo generar el PDF. Intenta de nuevo.', { type: 'warn', ms: 4500 }); }
  }
  function viewPdf(file) {
    const sh = openSheet({ title: file.name, full: true, className: 'viewer-sheet', body: `<div class="vw stmt-vw">${reportSVGs(prepared).join('')}</div>
      <div class="sheet-foot"><button type="button" class="btn-secondary block" data-ext>${icon.eye}<span>Abrir en el visor del sistema</span></button></div>` });
    sh.body.querySelector('[data-ext]').addEventListener('click', () => openBlob(file));
  }
  on(root, 'click', '[data-back]', () => back(backTo));
  on(root, 'click', '[data-z]', (e, b) => { zoom = Math.min(ZOOMS.length - 1, Math.max(0, zoom + +b.dataset.z)); applyZoom(); });
  on(root, 'click', '[data-act]', (e, b) => {
    const a = b.dataset.act;
    if (a === 'back') back(backTo);
    if (a === 'generate') generate();
    if (a === 'share' && generated) deliver(generated.file, false);
    if (a === 'save' && generated) deliver(generated.file, true);
    if (a === 'view' && generated) viewPdf(generated.file);
  });
  drawBar(); applyZoom();
  return { rebuild };
}

export async function workshopOrderReportScreen({ id }) {
  await mt.loadMaintenance();
  const o = mt.orderById(id);
  const root = shell('Reporte de mantenimiento', o ? o.folio : 'Taller', '');
  const c = reportController(root, { prepare: () => prepareOrderReport(id), backTo: `/operacion/taller/orden/${id}` });
  return { el: root, mounted: () => c.rebuild() };
}

export async function workshopEquipmentReportScreen({ type, id }) {
  await mt.loadMaintenance();
  const t = type === 'u' ? 'vehicle' : 'trailer', eq = mt.equipmentOf(t, id);
  let per = 'todo';
  const custom = { from: '', to: '' }, types = new Set(), statuses = new Set();
  const controls = `<section class="grp"><div class="grp-h"><h3>Contenido del reporte</h3></div><div class="grp-b">
      <div class="fld"><span class="fl">Periodo (por fecha de ingreso al taller)</span><div class="chips filters">${PERIODS.map(([k, l]) => `<button type="button" class="chip${k === per ? ' on' : ''}" data-per="${k}">${l}</button>`).join('')}</div></div>
      <div class="row2 period-custom" data-custom hidden><label class="fld"><span class="fl">Fecha inicial</span><input class="in" type="date" data-c="from"></label><label class="fld"><span class="fl">Fecha final</span><input class="in" type="date" data-c="to"></label></div>
      <div class="fld"><span class="fl">Tipos de mantenimiento (ninguno = todos)</span><div class="chips filters">${ORDER_TYPES.map(([k, l]) => `<button type="button" class="chip" data-type="${k}">${esc(l)}</button>`).join('')}</div></div>
      <div class="fld"><span class="fl">Estados (ninguno = todos)</span><div class="chips filters">${ORDER_STATUSES.map((s) => `<button type="button" class="chip" data-st="${s.key}">${esc(s.label)}</button>`).join('')}</div></div>
      <p class="stmt-cut" data-note></p></div></section>`;
  const root = shell('Reporte de servicios', eq ? `Taller · ${eq.label}` : 'Taller', controls);
  const $ = (s) => root.querySelector(s);
  const label = (list, set) => list.filter((x) => set.has(Array.isArray(x) ? x[0] : x.key)).map((x) => (Array.isArray(x) ? x[1] : x.label)).join(', ');
  const c = reportController(root, {
    backTo: `/operacion/taller/equipo/${type}/${id}`,
    prepare: async () => {
      const r = periodRange(per, custom);
      if (r.from && r.to && r.to < r.from) throw new Error('La fecha final no puede ser anterior a la inicial.');
      return prepareEquipmentReport(t, id, { ...r, types, statuses, typesText: label(ORDER_TYPES, types), statusesText: label(ORDER_STATUSES, statuses) });
    },
    onReady: (p) => { const n = p.entries.length; $('[data-note]').textContent = `${n} servicio${n === 1 ? '' : 's'} en el reporte.`; },
  });
  on(root, 'click', '[data-per]', (e, b) => { per = b.dataset.per; root.querySelectorAll('[data-per]').forEach((x) => x.classList.toggle('on', x === b)); $('[data-custom]').hidden = per !== 'custom'; c.rebuild(); });
  on(root, 'click', '[data-type]', (e, b) => { const k = b.dataset.type; if (types.has(k)) types.delete(k); else types.add(k); b.classList.toggle('on', types.has(k)); c.rebuild(); });
  on(root, 'click', '[data-st]', (e, b) => { const k = b.dataset.st; if (statuses.has(k)) statuses.delete(k); else statuses.add(k); b.classList.toggle('on', statuses.has(k)); c.rebuild(); });
  root.addEventListener('change', (e) => { const t2 = e.target; if (t2.dataset.c) { custom[t2.dataset.c] = t2.value; c.rebuild(); } });
  return { el: root, mounted: () => c.rebuild() };
}
