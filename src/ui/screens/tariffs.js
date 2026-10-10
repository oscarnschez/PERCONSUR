/*
 * Tarifas (Administración)
 *   #/tarifas            apartados (p. ej. BAYER INBOUND 2026): crear con su división (Puerto o Campo), entrar
 *   #/tarifas/:id        tarifas del apartado por zona, con búsqueda y filtros; agregar, editar y eliminar tarifas y
 *                        (División Puerto) cargos adicionales; cambiar nombre o eliminar el apartado
 *   #/tarifas/:id/pdf    PDF del apartado (vista previa = documento real, generar, ver, compartir, guardar)
 * División Campo: origen libre, planta destino, Tolva y Jaula. División Puerto: origen Manzanillo de forma predeterminada,
 * ciudad destino y un monto por ruta, más los cargos adicionales. Todos los importes son antes de impuestos.
 * En un dispositivo de consulta no se muestran los controles de edición (la base además rechaza escrituras).
 */
import { screen, el, on } from '../../core/dom.js';
import { back, go } from '../../core/router.js';
import { esc, fmtSize } from '../../domain/shared/format.js';
import { money, centsInput } from '../../domain/operators/money.js';
import { todayStr, fmtDate } from '../../domain/operators/balance.js';
import { DIVISIONS, TAX_NOTE, divisionOf, zonesOf, destinationsOf, filterRoutes, groupByZone, tariffStats, plantShort } from '../../domain/tariffs/tariffs.js';
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
const UNIT_ICON = { Tolva: 'trTolva', Jaula: 'trJaula', Sencillo: 'container' };
const DIV_ICON = { campo: 'sprout', puerto: 'containers' };
const textIn = (name, label, value, { list = '', ph = '', cap = 'words' } = {}) => `<label class="fld" data-f="${name}"><span class="fl">${label}</span><input class="in" name="${name}" value="${esc(value || '')}"${list ? ` list="${list}"` : ''} placeholder="${esc(ph)}" autocomplete="off" autocapitalize="${cap}" enterkeyhint="next"><span class="ferr" data-err="${name}"></span></label>`;
const datalist = (id, items) => `<datalist id="${id}">${[...new Set(items)].filter(Boolean).map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
const destText = (D, dest) => (D.key === 'campo' ? plantShort(dest) : dest);
const clearErrors = (f) => f.querySelectorAll('.has-err').forEach((x) => { x.classList.remove('has-err'); const m = x.querySelector('.ferr'); if (m) m.textContent = ''; });
function sheetMeta(s) {
  const st = tariffStats(s.routes);
  return divisionOf(s).key === 'puerto'
    ? `${plural(st.routes, 'ruta', 'rutas')} | ${plural(st.dests, 'destino', 'destinos')} | ${plural(s.extras.length, 'cargo adicional', 'cargos adicionales')}`
    : `${plural(st.routes, 'ruta', 'rutas')} | ${plural(st.origins, 'origen', 'orígenes')} | ${plural(st.zones, 'zona', 'zonas')}`;
}

/* ===== Apartado: nuevo (con su división) o cambio de nombre ===== */
function openSheetNameForm(sheet, onSaved) {
  let division = 'puerto';
  const { form } = formSheet({
    title: sheet ? 'Cambiar nombre del apartado' : 'Nuevo apartado', saveLabel: sheet ? 'Guardar nombre' : 'Crear apartado',
    html: `${textIn('name', 'Nombre del apartado', sheet ? sheet.name : '', { ph: 'Ej. BAYER INBOUND 2026', cap: 'characters' })}
      ${sheet
    ? `<p class="fhint tf-sheetname">${icon[DIV_ICON[divisionOf(sheet).key]]}<span>${esc(divisionOf(sheet).label)}</span></p>`
    : `<div class="fld" data-f="division"><span class="fl">División de PERCONSUR que usa este tarifario</span><div class="seg big">${['puerto', 'campo'].map((k) => DIVISIONS[k]).map((d) => `<button type="button" class="seg-b${d.key === division ? ' on' : ''}" data-div="${d.key}" aria-pressed="${d.key === division}">${d.key === 'puerto' ? 'Puerto' : 'Campo'}</button>`).join('')}</div></div>
      <p class="fhint" data-divhint></p>`}`,
    onSubmit: async (f, sh) => {
      const r = sheet ? await tf.renameSheet(sheet.id, f.elements.name.value) : await tf.createSheet(f.elements.name.value, division);
      if (r.error) { fail(f, 'name', r.error); return; }
      sh.close(); toast(sheet ? 'Nombre actualizado' : 'Apartado creado');
      onSaved(r.sheet);
    },
  });
  const hint = form.querySelector('[data-divhint]');
  const paint = () => {
    form.querySelectorAll('[data-div]').forEach((b) => { const on1 = b.dataset.div === division; b.classList.toggle('on', on1); b.setAttribute('aria-pressed', on1); });
    if (hint) hint.textContent = division === 'puerto'
      ? 'Origen Manzanillo de forma predeterminada, ciudad destino y un monto por ruta. Incluye los cargos adicionales: sobrepeso $3,000 y arrastre local en Manzanillo de vacíos $2,000 y de llenos $5,000. Importes antes de impuestos.'
      : 'Ciudad de origen, planta destino y montos de Tolva y Jaula sencillas. Importes antes de impuestos.';
  };
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-div]'); if (b) { division = b.dataset.div; paint(); } });
  paint();
}

/* ===== Tarifa (ruta): agregar, editar o eliminar ===== */
function openRouteForm(sheet, route, prefill, onSaved) {
  const D = divisionOf(sheet), editing = !!route;
  const r = route || { zone: prefill.zone || '', origin: D.defaultOrigin, dest: prefill.dest || '', rates: {} };
  const dests = D.key === 'campo' ? [...destinationsOf(sheet.routes), ...listAll('plants').map((p) => p.name)] : destinationsOf(sheet.routes);
  const { form } = formSheet({
    title: editing ? 'Editar tarifa' : 'Agregar tarifa', saveLabel: editing ? 'Guardar cambios' : 'Agregar tarifa',
    html: `<p class="fhint tf-sheetname">${icon.tag}<span>${esc(sheet.name)} · ${esc(D.label)} · transporte sencillo</span></p>
      ${textIn('zone', 'Zona', r.zone, { list: 'tf-dl-zones', ph: D.key === 'puerto' ? 'Ej. Occidente' : 'Ej. Bajío zona A' })}
      ${textIn('origin', 'Ciudad de origen', r.origin, { list: 'tf-dl-origins', ph: D.key === 'puerto' ? 'Manzanillo' : 'Ej. Irapuato' })}
      ${textIn('dest', D.destLabel, r.dest, { list: 'tf-dl-dests', ph: D.key === 'puerto' ? 'Ej. Guadalajara' : 'Ej. Planta Nextipac' })}
      <div class="${D.units.length > 1 ? 'row2' : ''}">${D.units.map((u) => moneyIn(u, D.unitLabel(u), r.rates[u] != null ? centsInput(r.rates[u]) : '', D.units.length > 1 ? 'Sin tarifa' : '0.00')).join('')}</div>
      <p class="fhint">${D.units.length > 1 ? 'Deja vacío el tipo de unidad que no tenga tarifa; se necesita al menos un monto. ' : ''}Importes en pesos (MXN), antes de impuestos.</p>
      ${datalist('tf-dl-zones', zonesOf(sheet.routes))}${datalist('tf-dl-origins', [D.defaultOrigin, ...sheet.routes.map((x) => x.origin)])}${datalist('tf-dl-dests', dests)}`,
    onSubmit: async (f, sh) => {
      /* Los avisos de un intento anterior (p. ej. ruta repetida) se recalculan completos */
      clearErrors(f);
      const rates = {};
      for (const u of D.units) {
        const m = readMoney(f, u, { label: `el monto de ${D.unitLabel(u).toLowerCase()}` });
        if (m.error) { fail(f, u, m.error); return; }
        rates[u] = m.value > 0 ? m.value : null;
      }
      const res = await tf.saveRoute(sheet.id, { zone: f.elements.zone.value, origin: f.elements.origin.value, dest: f.elements.dest.value, rates }, editing ? route.id : null);
      if (res.errors) {
        const [k, msg] = Object.entries(res.errors)[0];
        fail(f, k === 'rates' ? D.units[0] : k, msg); return;
      }
      sh.close(); toast(editing ? 'Tarifa actualizada' : 'Tarifa agregada');
      onSaved(res.route);
    },
    del: editing ? {
      label: 'Eliminar tarifa',
      fn: async () => {
        if (!(await confirmDestructive('¿Eliminar esta tarifa?', `${route.origin} → ${destText(D, route.dest)} se quitará del apartado ${sheet.name}.`))) return false;
        await tf.deleteRoute(sheet.id, route.id); toast('Tarifa eliminada'); onSaved(null);
        return true;
      },
    } : null,
  });
  if (!editing) setTimeout(() => form.elements[!r.zone ? 'zone' : !r.origin ? 'origin' : 'dest'].focus(), 300);
}

/* ===== Cargo adicional (División Puerto): agregar, editar o eliminar ===== */
function openExtraForm(sheet, extra, onSaved) {
  const editing = !!extra;
  formSheet({
    title: editing ? 'Editar cargo adicional' : 'Agregar cargo adicional', saveLabel: editing ? 'Guardar cambios' : 'Agregar cargo',
    html: `<p class="fhint tf-sheetname">${icon.tag}<span>${esc(sheet.name)}</span></p>
      ${textIn('label', 'Concepto', editing ? extra.label : '', { ph: 'Ej. Sobrepeso', cap: 'sentences' })}
      ${moneyIn('amount', 'Importe', editing ? centsInput(extra.amount) : '')}
      <p class="fhint">Importe en pesos (MXN), antes de impuestos.</p>`,
    onSubmit: async (f, sh) => {
      clearErrors(f);
      const m = readMoney(f, 'amount', { label: 'el importe del cargo' });
      if (m.error) { fail(f, 'amount', m.error); return; }
      const res = await tf.saveExtra(sheet.id, { label: f.elements.label.value, amount: m.value }, editing ? extra.id : null);
      if (res.errors) { const [k, msg] = Object.entries(res.errors)[0]; fail(f, k, msg); return; }
      sh.close(); toast(editing ? 'Cargo actualizado' : 'Cargo agregado');
      onSaved();
    },
    del: editing ? {
      label: 'Eliminar cargo',
      fn: async () => {
        if (!(await confirmDestructive('¿Eliminar este cargo?', `«${extra.label}» se quitará del apartado ${sheet.name}.`))) return false;
        await tf.deleteExtra(sheet.id, extra.id); toast('Cargo eliminado'); onSaved();
        return true;
      },
    } : null,
  });
}

/* ===== #/tarifas: apartados ===== */
export async function tariffSheetsScreen() {
  await tf.loadTariffs();
  const ro = isReadOnly();
  const s = screen(`<div class="page tf-page">
    <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Administración</span></button>${ro ? '' : `<button type="button" class="btn-ghost sm" data-add>${icon.plus}<span>Nuevo apartado</span></button>`}</header>
    <h1 class="title">Tarifas</h1>
    <p class="page-lead">Tarifas de transporte agrupadas por apartado (cliente o proyecto); cada apartado pertenece a la División Puerto o a la División Campo. ${TAX_NOTE}</p>
    <div data-list></div>
  </div>`);
  const root = s.el, list = root.querySelector('[data-list]');
  function draw() {
    const all = tf.sheets();
    list.innerHTML = all.length
      ? `<div class="mod-list">${all.map((x) => { const D = divisionOf(x); return `<a class="mod-card" href="#/tarifas/${esc(x.id)}"><span class="mod-ic">${icon[DIV_ICON[D.key]]}</span><span class="mod-tx"><b>${esc(x.name)}</b><small>${esc(D.label)} · ${esc(D.summary)}</small><span class="mod-meta">${sheetMeta(x)}</span></span><span class="chev">${icon.chev}</span></a>`; }).join('')}</div>`
      : `<div class="empty"><p><b class="empty-t">Aún no hay apartados</b>${ro ? 'El dispositivo que captura la información aún no ha compartido tarifas.' : 'Crea un apartado para agrupar las tarifas de un cliente o proyecto.'}</p>${ro ? '' : `<button type="button" class="btn-primary sm" data-add>${icon.plus}<span>Nuevo apartado</span></button>`}</div>`;
  }
  on(root, 'click', '[data-back]', () => back('/administracion'));
  on(root, 'click', '[data-add]', () => openSheetNameForm(null, (sh) => go(`/tarifas/${sh.id}`)));
  draw();
  return s;
}

/* ===== #/tarifas/:id: tarifas del apartado ===== */
function routeCard(D, o, ro) {
  return `<article class="tf-card"><h3 class="tf-o">${esc(o.origin)}</h3>
    <table class="tf-t"><thead><tr><th scope="col">${esc(D.destLabel)}</th>${D.units.map((u) => `<th scope="col" class="r"><span class="tf-u">${icon[UNIT_ICON[u]]}${esc(D.units.length > 1 ? u : D.unitLabel(u))}</span></th>`).join('')}</tr></thead>
    <tbody>${o.routes.map((r) => `<tr${ro ? '' : ` data-route="${esc(r.id)}" tabindex="0" aria-label="Editar tarifa ${esc(o.origin)} a ${esc(destText(D, r.dest))}"`}><td>${esc(destText(D, r.dest))}${ro ? '' : `<span class="tf-ed" aria-hidden="true">${icon.edit}</span>`}</td>${D.units.map((u) => `<td class="r${r.rates[u] == null ? ' tf-miss' : ''}">${r.rates[u] != null ? money(r.rates[u]) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></article>`;
}
function extrasSection(sheet, ro) {
  const xs = sheet.extras;
  return `<section class="tf-zone tf-extras">
    <div class="sec-hrow"><h2 class="sec-h">Cargos adicionales</h2>${ro ? '' : `<button type="button" class="btn-ghost sm" data-xadd>${icon.plus}<span>Agregar cargo</span></button>`}</div>
    ${xs.length ? `<article class="tf-card"><table class="tf-t"><thead><tr><th scope="col">Concepto</th><th scope="col" class="r">Importe</th></tr></thead>
      <tbody>${xs.map((x) => `<tr${ro ? '' : ` data-extra="${esc(x.id)}" tabindex="0" aria-label="Editar cargo ${esc(x.label)}"`}><td>${esc(x.label)}${ro ? '' : `<span class="tf-ed" aria-hidden="true">${icon.edit}</span>`}</td><td class="r">${money(x.amount)}</td></tr>`).join('')}</tbody></table></article>`
    : '<p class="grp-note">Sin cargos adicionales.</p>'}
  </section>`;
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
  const D = divisionOf(tf.sheetById(id)), puerto = D.key === 'puerto';
  let zone = '', dest = '', text = '';
  const s = screen(`<div class="page wide tf-page">
    <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Tarifas</span></button>${ro ? '' : `<button type="button" class="icon-btn" data-w data-more aria-label="Opciones del apartado">${icon.more}</button>`}</header>
    <p class="tf-div">${icon[DIV_ICON[D.key]]}<span>${esc(D.label)}</span></p>
    <h1 class="title" data-name></h1>
    <p class="page-lead">${puerto ? 'Tarifas por zona y ciudad destino, con origen en Manzanillo.' : 'Tarifas por zona, ciudad de origen y planta destino.'} Configuración de transporte <b>sencillo</b>${puerto ? '' : ' (Tolva y Jaula)'}; importes en pesos (MXN), <b>antes de impuestos</b>.</p>
    <div class="tiles tf-tiles" data-tiles></div>
    <div class="tf-acts">${ro ? '' : `<button type="button" class="btn-primary sm" data-add>${icon.plus}<span>Agregar tarifa</span></button>`}<a class="btn-secondary sm" data-pdf href="#/tarifas/${esc(id)}/pdf">${icon.file}<span>Generar PDF</span></a></div>
    <label class="search"><span class="search-ic">${icon.search}</span><input type="search" class="search-in" data-text placeholder="${puerto ? 'Buscar ciudad destino u origen' : 'Buscar ciudad de origen'}" aria-label="${puerto ? 'Buscar por ciudad destino u origen' : 'Buscar por ciudad de origen'}" autocomplete="off" autocorrect="off" enterkeyhint="search"></label>
    ${puerto ? '' : '<div class="chips filters" role="group" aria-label="Planta destino" data-dests></div>'}
    <div class="chips filters" role="group" aria-label="Zona" data-zones></div>
    <div data-list></div>
    ${puerto ? '<div data-extras></div>' : ''}
    ${ro ? '' : `<p class="grp-note center">Toca una ${puerto ? 'ruta o un cargo' : 'ruta'} para cambiar su monto o eliminarlo. Solo se guardan rutas con monto.</p>`}
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
    root.querySelector('[data-tiles]').innerHTML = `<div class="tile"><small>Rutas</small><b>${st.routes}</b></div>`
      + (puerto ? `<div class="tile"><small>Destinos</small><b>${st.dests}</b></div>` : `<div class="tile"><small>Orígenes</small><b>${st.origins}</b></div>`)
      + `<div class="tile"><small>Zonas</small><b>${st.zones}</b></div>`;
    const chip = (attr, v, label, cur, ic = '') => `<button type="button" class="chip${v === cur ? ' on' : ''}" ${attr}="${esc(v)}" aria-pressed="${v === cur}">${ic}${esc(label)}</button>`;
    const dEl = root.querySelector('[data-dests]');
    if (dEl) dEl.innerHTML = chip('data-dest', '', 'Todas las plantas', dest) + plants.map((p) => chip('data-dest', p, plantShort(p), dest, icon.building)).join('');
    root.querySelector('[data-zones]').innerHTML = zones.length > 1 ? chip('data-zone', '', 'Todas las zonas', zone) + zones.map((z) => chip('data-zone', z, z, zone)).join('') : '';
    root.querySelector('[data-pdf]').classList.toggle('disabled', !all.length && !(puerto && sh.extras.length));
    const xEl = root.querySelector('[data-extras]');
    if (xEl) xEl.innerHTML = extrasSection(sh, ro);
    if (!all.length) {
      listEl.innerHTML = `<div class="empty"><p><b class="empty-t">Sin tarifas en este apartado</b>${ro ? 'Aún no se han registrado tarifas.' : `Agrega la primera tarifa: zona, ${puerto ? 'ciudad destino (origen Manzanillo)' : 'ciudad de origen, planta destino'} y el monto${puerto ? '' : ' de Tolva o Jaula'}.`}</p>${ro ? '' : `<button type="button" class="btn-primary sm" data-add>${icon.plus}<span>Agregar tarifa</span></button>`}</div>`;
      return;
    }
    const list = filterRoutes(all, puerto ? { zone, text } : { zone, origin: text, dest });
    if (!list.length) {
      listEl.innerHTML = `<div class="empty"><p><b class="empty-t">Sin tarifas</b>No hay rutas con esa búsqueda${dest ? ` hacia ${esc(plantShort(dest))}` : ''}${zone ? ` en ${esc(zone)}` : ''}.</p><button type="button" class="btn-secondary sm" data-clear>Quitar filtros</button></div>`;
      return;
    }
    const filtered = zone || dest || text;
    listEl.innerHTML = `${filtered ? `<p class="tf-count" role="status">${plural(list.length, 'ruta encontrada', 'rutas encontradas')}</p>` : ''}
      ${groupByZone(list, all, { alphaDest: puerto }).map((g) => `<section class="tf-zone">
        <div class="sec-hrow"><h2 class="sec-h">${esc(g.zone)}</h2><small class="tf-n">${puerto ? '' : `${plural(g.origins.length, 'origen', 'orígenes')} · `}${plural(g.routes.length, 'ruta', 'rutas')}</small></div>
        <div class="tf-grid">${g.origins.map((o) => routeCard(D, o, ro)).join('')}</div>
      </section>`).join('')}`;
  }
  const editRoute = (routeId) => { const sh = sheet(), r = sh && sh.routes.find((x) => x.id === routeId); if (r) openRouteForm(sh, r, {}, draw); };
  const editExtra = (xid) => { const sh = sheet(), x = sh && sh.extras.find((e) => e.id === xid); if (x) openExtraForm(sh, x, draw); };

  on(root, 'click', '[data-back]', () => back('/tarifas'));
  on(root, 'click', '[data-zone]', (e, b) => { zone = b.dataset.zone; draw(); });
  on(root, 'click', '[data-dest]', (e, b) => { dest = b.dataset.dest; draw(); });
  on(root, 'click', '[data-clear]', () => { zone = ''; dest = ''; text = ''; root.querySelector('[data-text]').value = ''; draw(); });
  on(root, 'click', '[data-add]', () => openRouteForm(sheet(), null, { zone, dest }, draw));
  on(root, 'click', '[data-xadd]', () => openExtraForm(sheet(), null, draw));
  on(root, 'click', '[data-route]', (e, tr) => editRoute(tr.dataset.route));
  on(root, 'click', '[data-extra]', (e, tr) => editExtra(tr.dataset.extra));
  on(root, 'keydown', '[data-route],[data-extra]', (e, tr) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (tr.dataset.route) editRoute(tr.dataset.route); else editExtra(tr.dataset.extra); } });
  on(root, 'click', '[data-more]', async () => {
    const sh = sheet();
    const v = await actionSheet({ title: sh.name, message: `${divisionOf(sh).label} | ${sheetMeta(sh)}`, actions: [{ label: 'Cambiar nombre', value: 'rename' }, { label: 'Eliminar apartado', value: 'del', style: 'destructive' }] });
    if (v === 'rename') openSheetNameForm(sh, draw);
    if (v === 'del' && await confirmDestructive('¿Eliminar el apartado?', `${sh.name} y sus ${plural(sh.routes.length, 'tarifa', 'tarifas')} se eliminarán. Esta acción no se puede deshacer.`, 'Eliminar apartado')) {
      await tf.deleteSheet(sh.id); toast('Apartado eliminado'); go('/tarifas', { replace: true });
    }
  });
  root.querySelector('[data-text]').addEventListener('input', (e) => { text = e.target.value.trim(); draw(); });
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
      const D = divisionOf(sheet), puerto = D.key === 'puerto';
      $('[data-note]').innerHTML = [`${sheet.name} · ${D.label}`,
        puerto ? `${plural(st.routes, 'ruta', 'rutas')} desde ${D.defaultOrigin} a ${plural(st.dests, 'ciudad destino', 'ciudades destino')} en ${plural(st.zones, 'zona', 'zonas')}${sheet.extras.length ? `, más ${plural(sheet.extras.length, 'cargo adicional', 'cargos adicionales')}` : ''}.` : `${plural(st.routes, 'ruta', 'rutas')} de ${plural(st.origins, 'ciudad de origen', 'ciudades de origen')} en ${plural(st.zones, 'zona', 'zonas')}.`,
        `Transporte sencillo${puerto ? '' : ' (Tolva y Jaula)'}, importes en MXN antes de impuestos.`].map(esc).join('<br>');
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
