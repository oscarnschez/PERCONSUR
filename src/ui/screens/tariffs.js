/*
 * Tarifas (Administración)
 *   #/tarifas            apartados (p. ej. BAYER INBOUND 2026): crear, entrar
 *   #/tarifas/:id        tarifas del apartado por zona, con búsqueda por origen y filtros por planta y zona;
 *                        agregar, editar y eliminar tarifas; cambiar nombre o eliminar el apartado
 *   #/tarifas/:id/pdf    PDF del apartado (vista previa = documento real, generar, ver, compartir, guardar)
 * En un dispositivo de consulta no se muestran los controles de edición (la base además rechaza escrituras).
 */
import { screen, el, on } from '../../core/dom.js';
import { back, go } from '../../core/router.js';
import { esc, fmtSize } from '../../domain/shared/format.js';
import { money, centsInput } from '../../domain/operators/money.js';
import { todayStr, fmtDate } from '../../domain/operators/balance.js';
import { UNITS, zonesOf, destinationsOf, filterRoutes, groupByZone, tariffStats, plantShort } from '../../domain/tariffs/tariffs.js';
import { tariffReportFilename } from '../../domain/tariffs/report.js';
import * as tf from '../../services/tariffs.js';
import { listAll } from '../../services/catalogs.js';
import { getCompany } from '../../services/companies.js';
import { isReadOnly } from '../../services/access.js';
import { shareFile, downloadBlob, openBlob, isIOS } from '../../services/share.js';
import { prepareTariffReport, tariffSVGs, tariffBlob } from '../../services/tariffPdf.js';
import { icon } from '../components/icons.js';
import { openSheet, actionSheet, confirmDestructive, busy } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { formSheet, fail, readMoney, moneyIn } from './operatorForms.js';

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const UNIT_ICON = { Tolva: 'trTolva', Jaula: 'trJaula' };
const textIn = (name, label, value, { list = '', ph = '', cap = 'words' } = {}) => `<label class="fld" data-f="${name}"><span class="fl">${label}</span><input class="in" name="${name}" value="${esc(value || '')}"${list ? ` list="${list}"` : ''} placeholder="${esc(ph)}" autocomplete="off" autocapitalize="${cap}" enterkeyhint="next"><span class="ferr" data-err="${name}"></span></label>`;
const datalist = (id, items) => `<datalist id="${id}">${[...new Set(items)].filter(Boolean).map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
const sheetMeta = (s) => { const st = tariffStats(s.routes); return `${plural(st.routes, 'ruta', 'rutas')} | ${plural(st.origins, 'origen', 'orígenes')} | ${plural(st.zones, 'zona', 'zonas')}`; };

/* ===== Apartado: nuevo o cambio de nombre ===== */
function openSheetNameForm(sheet, onSaved) {
  formSheet({
    title: sheet ? 'Cambiar nombre del apartado' : 'Nuevo apartado', saveLabel: sheet ? 'Guardar nombre' : 'Crear apartado',
    html: `${textIn('name', 'Nombre del apartado', sheet ? sheet.name : '', { ph: 'Ej. BAYER INBOUND 2026', cap: 'characters' })}
      <p class="fhint">Agrupa las tarifas de un cliente, proyecto o temporada. Todas en configuración de transporte sencillo (Tolva y Jaula).</p>`,
    onSubmit: async (form, sh) => {
      const r = sheet ? await tf.renameSheet(sheet.id, form.elements.name.value) : await tf.createSheet(form.elements.name.value);
      if (r.error) { fail(form, 'name', r.error); return; }
      sh.close(); toast(sheet ? 'Nombre actualizado' : 'Apartado creado');
      onSaved(r.sheet);
    },
  });
}

/* ===== Tarifa (ruta): agregar, editar o eliminar ===== */
function openRouteForm(sheet, route, prefill, onSaved) {
  const editing = !!route, r = route || { zone: prefill.zone || '', origin: '', dest: prefill.dest || '', rates: {} };
  const plants = [...destinationsOf(sheet.routes), ...listAll('plants').map((p) => p.name)];
  const { form } = formSheet({
    title: editing ? 'Editar tarifa' : 'Agregar tarifa', saveLabel: editing ? 'Guardar cambios' : 'Agregar tarifa',
    html: `<p class="fhint tf-sheetname">${icon.tag}<span>${esc(sheet.name)} · transporte sencillo</span></p>
      ${textIn('zone', 'Zona', r.zone, { list: 'tf-dl-zones', ph: 'Ej. Bajío zona A' })}
      ${textIn('origin', 'Ciudad de origen', r.origin, { list: 'tf-dl-origins', ph: 'Ej. Irapuato' })}
      ${textIn('dest', 'Planta destino', r.dest, { list: 'tf-dl-plants', ph: 'Ej. Planta Nextipac' })}
      <div class="row2">${UNITS.map((u) => moneyIn(u, `${u} sencilla`, r.rates[u] != null ? centsInput(r.rates[u]) : '', 'Sin tarifa')).join('')}</div>
      <p class="fhint">Deja vacío el tipo de unidad que no tenga tarifa; se necesita al menos un monto. Importes en pesos (MXN).</p>
      ${datalist('tf-dl-zones', zonesOf(sheet.routes))}${datalist('tf-dl-origins', sheet.routes.map((x) => x.origin))}${datalist('tf-dl-plants', plants)}`,
    onSubmit: async (f, sh) => {
      /* Los avisos de un intento anterior (p. ej. ruta repetida) se recalculan completos */
      f.querySelectorAll('.has-err').forEach((x) => { x.classList.remove('has-err'); const m = x.querySelector('.ferr'); if (m) m.textContent = ''; });
      const rates = {};
      for (const u of UNITS) {
        const m = readMoney(f, u, { label: `el monto de ${u}` });
        if (m.error) { fail(f, u, m.error); return; }
        rates[u] = m.value > 0 ? m.value : null;
      }
      const res = await tf.saveRoute(sheet.id, { zone: f.elements.zone.value, origin: f.elements.origin.value, dest: f.elements.dest.value, rates }, editing ? route.id : null);
      if (res.errors) {
        const [k, msg] = Object.entries(res.errors)[0];
        fail(f, k === 'rates' ? UNITS[0] : k, msg); return;
      }
      sh.close(); toast(editing ? 'Tarifa actualizada' : 'Tarifa agregada');
      onSaved(res.route);
    },
    del: editing ? {
      label: 'Eliminar tarifa',
      fn: async () => {
        if (!(await confirmDestructive('¿Eliminar esta tarifa?', `${route.origin} → ${plantShort(route.dest)} se quitará del apartado ${sheet.name}.`))) return false;
        await tf.deleteRoute(sheet.id, route.id); toast('Tarifa eliminada'); onSaved(null);
        return true;
      },
    } : null,
  });
  if (!editing) setTimeout(() => form.elements[r.zone ? 'origin' : 'zone'].focus(), 300);
}

/* ===== #/tarifas: apartados ===== */
export async function tariffSheetsScreen() {
  await tf.loadTariffs();
  const ro = isReadOnly();
  const s = screen(`<div class="page tf-page">
    <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Administración</span></button>${ro ? '' : `<button type="button" class="btn-ghost sm" data-add>${icon.plus}<span>Nuevo apartado</span></button>`}</header>
    <h1 class="title">Tarifas</h1>
    <p class="page-lead">Tarifas de transporte agrupadas por apartado (cliente o proyecto). Dentro de cada apartado se organizan por zona, ciudad de origen y planta destino.</p>
    <div data-list></div>
  </div>`);
  const root = s.el, list = root.querySelector('[data-list]');
  function draw() {
    const all = tf.sheets();
    list.innerHTML = all.length
      ? `<div class="mod-list">${all.map((x) => `<a class="mod-card" href="#/tarifas/${esc(x.id)}"><span class="mod-ic">${icon.tag}</span><span class="mod-tx"><b>${esc(x.name)}</b><small>Transporte sencillo · Tolva y Jaula</small><span class="mod-meta">${sheetMeta(x)}</span></span><span class="chev">${icon.chev}</span></a>`).join('')}</div>`
      : `<div class="empty"><p><b class="empty-t">Aún no hay apartados</b>${ro ? 'El dispositivo que captura la información aún no ha compartido tarifas.' : 'Crea un apartado para agrupar las tarifas de un cliente o proyecto.'}</p>${ro ? '' : `<button type="button" class="btn-primary sm" data-add>${icon.plus}<span>Nuevo apartado</span></button>`}</div>`;
  }
  on(root, 'click', '[data-back]', () => back('/administracion'));
  on(root, 'click', '[data-add]', () => openSheetNameForm(null, (sh) => go(`/tarifas/${sh.id}`)));
  draw();
  return s;
}

/* ===== #/tarifas/:id: tarifas del apartado ===== */
function routeCard(o, ro) {
  return `<article class="tf-card"><h3 class="tf-o">${esc(o.origin)}</h3>
    <table class="tf-t"><thead><tr><th scope="col">Planta destino</th>${UNITS.map((u) => `<th scope="col" class="r"><span class="tf-u">${icon[UNIT_ICON[u]]}${u}</span></th>`).join('')}</tr></thead>
    <tbody>${o.routes.map((r) => `<tr${ro ? '' : ` data-route="${esc(r.id)}" tabindex="0" aria-label="Editar tarifa ${esc(o.origin)} a ${esc(plantShort(r.dest))}"`}><td>${esc(plantShort(r.dest))}${ro ? '' : `<span class="tf-ed" aria-hidden="true">${icon.edit}</span>`}</td>${UNITS.map((u) => `<td class="r${r.rates[u] == null ? ' tf-miss' : ''}">${r.rates[u] != null ? money(r.rates[u]) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></article>`;
}

export async function tariffSheetScreen({ id }) {
  await tf.loadTariffs();
  const ro = isReadOnly();
  if (!tf.sheetById(id)) {
    const s = screen(`<div class="page tf-page"><header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Tarifas</span></button></header>
      <div class="empty"><p><b class="empty-t">Este apartado ya no existe</b>Pudo haberse eliminado en este u otro dispositivo.</p></div></div>`);
    on(s.el, 'click', '[data-back]', () => back('/tarifas'));
    return s;
  }
  let zone = '', dest = '', origin = '';
  const s = screen(`<div class="page wide tf-page">
    <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Tarifas</span></button>${ro ? '' : `<button type="button" class="icon-btn" data-w data-more aria-label="Opciones del apartado">${icon.more}</button>`}</header>
    <h1 class="title" data-name></h1>
    <p class="page-lead">Tarifas por zona, ciudad de origen y planta destino. Configuración de transporte <b>sencillo</b> (Tolva y Jaula); importes en pesos (MXN).</p>
    <div class="tiles tf-tiles" data-tiles></div>
    <div class="tf-acts">${ro ? '' : `<button type="button" class="btn-primary sm" data-add>${icon.plus}<span>Agregar tarifa</span></button>`}<a class="btn-secondary sm" data-pdf href="#/tarifas/${esc(id)}/pdf">${icon.file}<span>Generar PDF</span></a></div>
    <label class="search"><span class="search-ic">${icon.search}</span><input type="search" class="search-in" data-origin placeholder="Buscar ciudad de origen" aria-label="Buscar por ciudad de origen" autocomplete="off" autocorrect="off" enterkeyhint="search"></label>
    <div class="chips filters" role="group" aria-label="Planta destino" data-dests></div>
    <div class="chips filters" role="group" aria-label="Zona" data-zones></div>
    <div data-list></div>
    ${ro ? '' : '<p class="grp-note center">Toca una ruta para cambiar sus montos o eliminarla. Solo se guardan rutas con al menos un monto.</p>'}
  </div>`);
  const root = s.el, listEl = root.querySelector('[data-list]');
  const sheet = () => tf.sheetById(id);

  function draw() {
    const sh = sheet();
    if (!sh) { go('/tarifas', { replace: true }); return; }
    const all = sh.routes, zones = zonesOf(all), plants = destinationsOf(all), st = tariffStats(all);
    if (zone && !zones.includes(zone)) zone = '';
    if (dest && !plants.includes(dest)) dest = '';
    root.querySelector('[data-name]').textContent = sh.name;
    root.querySelector('[data-tiles]').innerHTML = `<div class="tile"><small>Rutas</small><b>${st.routes}</b></div><div class="tile"><small>Orígenes</small><b>${st.origins}</b></div><div class="tile"><small>Zonas</small><b>${st.zones}</b></div>`;
    const chip = (attr, v, label, cur, ic = '') => `<button type="button" class="chip${v === cur ? ' on' : ''}" ${attr}="${esc(v)}" aria-pressed="${v === cur}">${ic}${esc(label)}</button>`;
    root.querySelector('[data-dests]').innerHTML = chip('data-dest', '', 'Todas las plantas', dest) + plants.map((p) => chip('data-dest', p, plantShort(p), dest, icon.building)).join('');
    root.querySelector('[data-zones]').innerHTML = chip('data-zone', '', 'Todas las zonas', zone) + zones.map((z) => chip('data-zone', z, z, zone)).join('');
    root.querySelector('[data-pdf]').classList.toggle('disabled', !all.length);
    if (!all.length) {
      listEl.innerHTML = `<div class="empty"><p><b class="empty-t">Sin tarifas en este apartado</b>${ro ? 'Aún no se han registrado tarifas.' : 'Agrega la primera tarifa: zona, ciudad de origen, planta destino y el monto de Tolva o Jaula.'}</p>${ro ? '' : `<button type="button" class="btn-primary sm" data-add>${icon.plus}<span>Agregar tarifa</span></button>`}</div>`;
      return;
    }
    const list = filterRoutes(all, { zone, origin, dest });
    if (!list.length) {
      listEl.innerHTML = `<div class="empty"><p><b class="empty-t">Sin tarifas</b>No hay rutas con ese origen${dest ? ` hacia ${esc(plantShort(dest))}` : ''}${zone ? ` en ${esc(zone)}` : ''}.</p><button type="button" class="btn-secondary sm" data-clear>Quitar filtros</button></div>`;
      return;
    }
    const filtered = zone || dest || origin;
    listEl.innerHTML = `${filtered ? `<p class="tf-count" role="status">${plural(list.length, 'ruta encontrada', 'rutas encontradas')}</p>` : ''}
      ${groupByZone(list, all).map((g) => `<section class="tf-zone">
        <div class="sec-hrow"><h2 class="sec-h">${esc(g.zone)}</h2><small class="tf-n">${plural(g.origins.length, 'origen', 'orígenes')} · ${plural(g.routes.length, 'ruta', 'rutas')}</small></div>
        <div class="tf-grid">${g.origins.map((o) => routeCard(o, ro)).join('')}</div>
      </section>`).join('')}`;
  }
  const edit = (routeId) => {
    const sh = sheet(), r = sh && sh.routes.find((x) => x.id === routeId);
    if (r) openRouteForm(sh, r, {}, draw);
  };

  on(root, 'click', '[data-back]', () => back('/tarifas'));
  on(root, 'click', '[data-zone]', (e, b) => { zone = b.dataset.zone; draw(); });
  on(root, 'click', '[data-dest]', (e, b) => { dest = b.dataset.dest; draw(); });
  on(root, 'click', '[data-clear]', () => { zone = ''; dest = ''; origin = ''; root.querySelector('[data-origin]').value = ''; draw(); });
  on(root, 'click', '[data-add]', () => openRouteForm(sheet(), null, { zone, dest }, draw));
  on(root, 'click', '[data-route]', (e, tr) => edit(tr.dataset.route));
  on(root, 'keydown', '[data-route]', (e, tr) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(tr.dataset.route); } });
  on(root, 'click', '[data-more]', async () => {
    const sh = sheet();
    const v = await actionSheet({ title: sh.name, message: sheetMeta(sh), actions: [{ label: 'Cambiar nombre', value: 'rename' }, { label: 'Eliminar apartado', value: 'del', style: 'destructive' }] });
    if (v === 'rename') openSheetNameForm(sh, draw);
    if (v === 'del' && await confirmDestructive('¿Eliminar el apartado?', `${sh.name} y sus ${plural(sh.routes.length, 'tarifa', 'tarifas')} se eliminarán. Esta acción no se puede deshacer.`, 'Eliminar apartado')) {
      await tf.deleteSheet(sh.id); toast('Apartado eliminado'); go('/tarifas', { replace: true });
    }
  });
  root.querySelector('[data-origin]').addEventListener('input', (e) => { origin = e.target.value.trim(); draw(); });
  draw();
  return s;
}

/* ===== #/tarifas/:id/pdf: PDF del apartado ===== */
const ZOOMS = [1, 1.5, 2, 3];
export async function tariffReportScreen({ id }) {
  await tf.loadTariffs();
  let zoom = 0, prepared = null, generated = null;
  const root = el(`<div class="wiz stmt">
    <header class="wiz-top">
      <button type="button" class="icon-btn" data-back aria-label="Volver al apartado">${icon.back}</button>
      <div class="wiz-title static"><small>Tarifas</small><b>PDF del apartado</b></div><span></span>
    </header>
    <main class="wiz-body">
      <section class="grp"><div class="grp-h"><h3>Contenido</h3></div><div class="grp-b"><p class="stmt-cut" data-note>Preparando…</p></div></section>
      <div data-status></div>
      <div class="grp-h solo"><h3>Vista previa</h3><span class="count" data-pagecount></span></div>
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
  const $ = (q) => root.querySelector(q);

  async function build() {
    const sheet = tf.sheetById(id);
    if (!sheet) { $('[data-pages]').innerHTML = '<p class="grp-note center warn-t">Este apartado ya no existe.</p>'; return; }
    const issued = todayStr();
    try {
      const p = await prepareTariffReport({ company: getCompany('perconsur'), sheet, issued });
      prepared = { ...p, issued, sheet };
      $('[data-pages]').innerHTML = tariffSVGs(p).join('');
      const pc = p.model.pages.length, st = p.model.stats;
      $('[data-pagecount]').textContent = `${pc} página${pc === 1 ? '' : 's'}`;
      $('[data-note]').innerHTML = [`${sheet.name}`, `${plural(st.routes, 'ruta', 'rutas')} de ${plural(st.origins, 'ciudad de origen', 'ciudades de origen')} en ${plural(st.zones, 'zona', 'zonas')}.`, 'Transporte sencillo (Tolva y Jaula), importes en MXN.'].map(esc).join('<br>');
    } catch (e) {
      console.error(e); prepared = null;
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
    if (r === 'shared') { toast(save ? 'Listo' : 'Tarifas compartidas'); return; }
    if (r === 'cancelled') return;
    downloadBlob(file, file.name);
    toast(isIOS() ? 'Se abrió la descarga del PDF. Desde ahí puedes guardarlo en Archivos.' : 'PDF descargado: ' + file.name, { ms: 3500 });
  }
  async function generate() {
    if (!prepared) return;
    busy(true, 'Generando PDF…', prepared.sheet.name);
    try {
      const filename = tariffReportFilename(prepared.sheet.name, prepared.issued);
      const blob = await tariffBlob(prepared, { title: `Tarifas ${prepared.sheet.name} ${fmtDate(prepared.issued)}` });
      generated = { file: new File([blob], filename, { type: 'application/pdf' }) };
      busy(false);
      const pc = prepared.model.pages.length;
      $('[data-status]').innerHTML = `<section class="ok-box stmt-ok">${icon.check}<span><b>PDF generado</b><small>${esc(filename)} | ${pc} página${pc === 1 ? '' : 's'} | ${fmtSize(blob.size)}</small></span></section>`;
      drawBar(); toast('PDF generado');
    } catch (e) {
      busy(false); console.error(e);
      toast('No se pudo generar el PDF. Intenta de nuevo.', { type: 'warn', ms: 4500 });
    }
  }
  function viewPdf(file) {
    const sh = openSheet({ title: file.name, full: true, className: 'viewer-sheet', body: `<div class="vw stmt-vw">${tariffSVGs(prepared).join('')}</div>
      <div class="sheet-foot"><button type="button" class="btn-secondary block" data-ext>${icon.eye}<span>Abrir en el visor del sistema</span></button></div>` });
    sh.body.querySelector('[data-ext]').addEventListener('click', () => openBlob(file));
  }

  on(root, 'click', '[data-back]', () => back(`/tarifas/${id}`));
  on(root, 'click', '[data-z]', (e, b) => { zoom = Math.min(ZOOMS.length - 1, Math.max(0, zoom + +b.dataset.z)); applyZoom(); });
  on(root, 'click', '[data-act]', (e, b) => {
    const a = b.dataset.act;
    if (a === 'back') back(`/tarifas/${id}`);
    if (a === 'generate') generate();
    if (a === 'share' && generated) deliver(generated.file, false);
    if (a === 'save' && generated) deliver(generated.file, true);
    if (a === 'view' && generated) viewPdf(generated.file);
  });
  drawBar(); applyZoom();
  return { el: root, mounted: () => { build(); } };
}
