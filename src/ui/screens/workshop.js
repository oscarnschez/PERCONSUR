/*
 * Operación → Taller
 *   #/operacion/taller                       tablero: en taller, pendientes, alertas de aceite, fallas, recientes, llantas e historial
 *   #/operacion/taller/equipo/:type/:id      historial de una unidad (u) o remolque (r)
 *   #/operacion/taller/orden/:id             orden de mantenimiento: fechas, trabajos, diagrama, fallas, reemplazos, aceite,
 *                                            llantas, evidencias y bitácora
 * Los controles que modifican información llevan data-w: en un dispositivo de consulta se ocultan (html.ro).
 */
import { screen, on } from '../../core/dom.js';
import { go, back } from '../../core/router.js';
import * as mt from '../../services/maintenance.js';
import * as lg from '../../services/logistics.js';
import { esc } from '../../domain/shared/format.js';
import { ORDER_TYPES, kindLabel, workTypeLabel, workStatusLabel, actionLabel, tireReasonLabel, isOpenStatus, relatedIds } from '../../domain/maintenance/catalog.js';
import {
  fmtDT, fmtD, orderDuration, durationText, kmText, nf, componentStates, numbering, matchOrder, equipmentSummary, OIL_STATE_TEXT, oilLine,
  positionLabel, positionsOf, pendingPositions, STATE_LABELS,
} from '../../domain/maintenance/maintenance.js';
import { icon } from '../components/icons.js';
import { openSheet, confirmDestructive } from '../components/sheet.js';
import { openPicker } from '../components/picker.js';
import { toast } from '../components/toast.js';
import { statusChip, sevChip, stateChip, availChip, eqHref, orderHref, createDiagram, tirePicker, photoField, photoStrip, viewPhoto } from './workshopKit.js';
import { startOrder, openOrderForm, openStatusForm, openServiceForm, openComponentSheet, openIssueForm, openIssueSheet, openOilForm, openTireForm, openProfileForm } from './workshopForms.js';

const typeLabel = (k) => (ORDER_TYPES.find(([x]) => x === k) || [null, 'Servicio'])[1];
const badge = (eq) => `<span class="unit-badge">${esc(eq.type === 'vehicle' ? eq.label : (eq.label || '').slice(0, 9))}</span>`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/* Tarjeta de una orden */
function orderCard(o, now = Date.now()) {
  const eq = mt.equipmentOfOrder(o), d = orderDuration(o, now);
  return `<a class="mt-card lg-t-${({ reportado: 'gray', pendiente: 'amber', diagnostico: 'teal', mantenimiento: 'blue', refacciones: 'orange', finalizado: 'ok' })[o.status] || 'gray'}" href="${orderHref(o.id)}">
    <div class="mt-c1">${badge(eq)}<span class="mt-folio">${esc(o.folio)}</span>${statusChip(o.status)}</div>
    <p class="mt-c2">${esc(o.reason || typeLabel(o.type))}</p>
    <p class="mt-c3"><span>${esc(typeLabel(o.type))}</span><span>${icon.clock}${esc(fmtDT(o.inAt))}</span>${d ? `<span>${d.running ? 'En taller ' : ''}${esc(d.text)}</span>` : ''}${o.equipmentType === 'trailer' ? `<span>${esc(kindLabel(o.kind))}</span>` : ''}</p>
  </a>`;
}
function oilAlert(x) {
  const st = x.st, due = st.state === 'vencido';
  return `<a class="mt-alert ${due ? 'due' : 'soon'}" href="${eqHref('vehicle', x.eq.id)}">${icon.drop}<span><b>${esc(x.eq.label)} — ${esc(OIL_STATE_TEXT[st.state])}</b><small>${esc(oilLine(st))}${st.nextKm != null ? ` · próximo a los ${esc(nf(st.nextKm))} km` : ''}${st.staleCurrent ? ' · odómetro actual desactualizado' : ''}</small></span></a>`;
}
const issueRow = (i) => { const eq = mt.equipmentOf(i.equipmentType, i.vehicleId || i.trailerId) || { label: (i.snap || {}).label || '—', type: i.equipmentType }; return `<button type="button" class="mt-row" data-issue="${esc(i.id)}">${icon.alert}<span class="mt-row-tx"><b>${esc(eq.label)} · ${esc(i.componentId ? mt.componentName(i.kind, i.componentId) : 'Falla')}</b><small>${esc(fmtDT(i.date))} · ${esc(i.description)}</small>${sevChip(i.severity)}${i.orderId ? `<span class="lg-st lg-t-blue"><i></i>${esc((mt.orderById(i.orderId) || {}).folio || 'En orden')}</span>` : ''}</span><span class="chev">${icon.chev}</span></button>`; };
const tireRow = (t) => { const o = mt.orderById(t.orderId) || {}, eq = o.id ? mt.equipmentOfOrder(o) : { label: '—' }; return `<a class="mt-row" href="${orderHref(t.orderId)}">${icon.tire}<span class="mt-row-tx"><b>${esc(eq.label)} · ${plural(t.quantity, 'llanta', 'llantas')}</b><small>${esc(fmtD(t.date))} · ${esc(tireReasonLabel(t.reason))}${t.positions.length ? ` · ${esc(t.positions.map((p) => positionLabel(p, (positionsOf(t.layout).find((x) => x.id === p) || {}).axleKind)).join('; '))}` : ' · posiciones pendientes de especificar'}</small></span><span class="chev">${icon.chev}</span></a>`; };

/* ===== Tablero ===== */
export async function workshopScreen() {
  await Promise.all([mt.loadMaintenance(), lg.loadLogistics()]);
  const f = { text: '', state: 'all', type: '' };
  let histLimit = 12, oilAll = false;
  const s = screen('<div class="page mt-page"></div>');
  const root = s.el;
  function render() {
    const y = window.scrollY, d = mt.dashboard(), all = mt.orders();
    const hist = all.filter((o) => (f.state === 'all' || (f.state === 'open' ? isOpenStatus(o.status) : o.status === 'finalizado')) && (!f.type || o.type === f.type)
      && matchOrder(o, f.text, { label: mt.equipmentOfOrder(o).label, placas: mt.equipmentOfOrder(o).placas, componentNames: mt.componentsOfOrder(o.id).map((c) => mt.componentName(o.kind, c.componentId)) }));
    const RANK = { vencido: 0, proximo: 1, ok: 2, desconocido: 3, sin_intervalo: 4, sin_registro: 5 };
    const oilRows = [...d.oil].sort((a, b) => RANK[a.st.state] - RANK[b.st.state] || (a.st.remainingKm ?? 1e9) - (b.st.remainingKm ?? 1e9));
    root.innerHTML = `
      <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Operación</span></button></header>
      <h1 class="title">Taller</h1>
      <p class="page-lead">Control de mantenimiento y reparaciones de unidades y remolques.</p>
      <div class="mt-acts"><button type="button" class="btn-primary" data-new="order" data-w>${icon.plus}<span>Registrar mantenimiento</span></button><button type="button" class="btn-secondary" data-new="issue" data-w>${icon.alert}<span>Reportar falla</span></button></div>
      <div class="mt-tiles">
        <div class="mt-tile${d.inShopVehicles.length ? ' warn' : ''}"><small>Unidades en mantenimiento</small><b>${d.inShopVehicles.length}</b></div>
        <div class="mt-tile${d.inShopTrailers.length ? ' warn' : ''}"><small>Remolques en mantenimiento</small><b>${d.inShopTrailers.length}</b></div>
        <div class="mt-tile"><small>Servicios pendientes</small><b>${d.open.length}</b></div>
        <div class="mt-tile"><small>Trabajos por terminar</small><b>${d.pendingWork}</b></div>
        <div class="mt-tile${d.openIssues.length ? ' warn' : ''}"><small>Fallas reportadas</small><b>${d.openIssues.length}</b></div>
        <div class="mt-tile${d.oilAlerts.length ? ' warn' : ''}"><small>Alertas de aceite</small><b>${d.oilAlerts.length}</b></div>
      </div>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">En taller ahora</h2><span class="count">${d.open.length}</span></div>
        ${d.open.length ? `<div class="mt-cards">${d.open.map((o) => orderCard(o, d.now)).join('')}</div>` : '<div class="empty"><p>Ningún equipo en el taller.</p></div>'}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Próximos cambios de aceite</h2><span class="count">${d.oilAlerts.length}</span></div>
        ${d.oilAlerts.length ? d.oilAlerts.map(oilAlert).join('') : '<p class="grp-note">Sin alertas. Se basan en el último cambio registrado y en el intervalo configurado de cada unidad.</p>'}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Fallas reportadas</h2><span class="count">${d.openIssues.length}</span></div>
        ${d.openIssues.length ? `<div class="mt-list">${d.openIssues.slice(0, 10).map(issueRow).join('')}</div>` : '<p class="grp-note">Sin fallas pendientes de atender.</p>'}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Mantenimientos recientes</h2></div>
        ${d.recent.length ? `<div class="mt-cards">${d.recent.slice(0, 5).map((o) => orderCard(o, d.now)).join('')}</div>` : '<p class="grp-note">Aún no hay mantenimientos finalizados.</p>'}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Cambios de aceite</h2><span class="count">${d.oil.length}</span></div>
        ${d.oil.length ? `<div class="mt-list">${oilRows.slice(0, oilAll ? 999 : 6).map((x) => `<a class="mt-row" href="${eqHref('vehicle', x.eq.id)}">${icon.drop}<span class="mt-row-tx"><b>${esc(x.eq.label)}</b><small>${esc(OIL_STATE_TEXT[x.st.state])}${x.st.state === 'proximo' || x.st.state === 'vencido' ? ' · ' + esc(oilLine(x.st)) : ''}</small><small>${x.st.last ? `Último: ${esc(fmtD(x.st.last.ts))} · ${esc(kmText(x.st.last.odometer))}` : 'Sin cambio registrado'}${x.st.nextKm != null ? ` · Próximo: ${esc(nf(x.st.nextKm))} km` : ''}${x.st.intervalKm ? ` · cada ${esc(nf(x.st.intervalKm))} km` : ''}</small></span><span class="chev">${icon.chev}</span></a>`).join('')}</div>
          ${oilRows.length > 6 && !oilAll ? `<button type="button" class="btn-ghost block mt-more" data-oilall>Ver todas las unidades (${oilRows.length})</button>` : ''}` : '<p class="grp-note">No hay unidades en el catálogo.</p>'}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Llantas</h2></div>
        ${d.recentTires.length ? `<div class="mt-list">${d.recentTires.map(tireRow).join('')}</div>` : '<p class="grp-note">Sin reemplazos de llantas registrados.</p>'}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Historial de servicios</h2><span class="count">${hist.length}</span></div>
        <label class="search"><span class="search-ic">${icon.search}</span><input type="search" class="search-in" data-q placeholder="Folio, unidad, placas, fecha o componente" value="${esc(f.text)}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" aria-label="Buscar en el historial"></label>
        <div class="chips filters">${[['all', 'Todos'], ['open', 'En taller'], ['done', 'Finalizados']].map(([k, l]) => `<button type="button" class="chip${f.state === k ? ' on' : ''}" data-fs="${k}">${l}</button>`).join('')}</div>
        <div class="chips filters">${[['', 'Todos los tipos'], ...ORDER_TYPES].map(([k, l]) => `<button type="button" class="chip${f.type === k ? ' on' : ''}" data-ft="${k}">${esc(l)}</button>`).join('')}</div>
        ${hist.length ? `<div class="mt-cards">${hist.slice(0, histLimit).map((o) => orderCard(o, d.now)).join('')}</div>${hist.length > histLimit ? `<button type="button" class="btn-ghost block mt-more" data-more>Mostrar más (${hist.length - histLimit})</button>` : ''}` : `<div class="empty"><p>${f.text || f.type || f.state !== 'all' ? 'Sin coincidencias.' : 'Aún no hay mantenimientos registrados.'}</p></div>`}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Equipos</h2></div>
        <p class="grp-note">Historial de cada tractocamión y remolque del catálogo.</p>
        <div class="mt-eq-chips">${mt.vehicles().map((e) => `<a class="chip" href="${eqHref('vehicle', e.id)}">${esc(e.label)}${mt.availability(e.key).inShop ? ' · en taller' : ''}</a>`).join('')}</div>
        <div class="mt-eq-chips">${mt.trailers().map((e) => `<a class="chip" href="${eqHref('trailer', e.id)}">${esc(e.label)}<small class="muted">${esc(e.kind ? kindLabel(e.kind).split(' ')[0] : 'Sin clasificar')}</small>${mt.availability(e.key).inShop ? ' · en taller' : ''}</a>`).join('')}</div></section>`;
    const q = root.querySelector('[data-q]');
    if (f.focus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); f.focus = false; }
    window.scrollTo(0, y);
  }
  on(root, 'click', '[data-back]', () => back('/operacion'));
  on(root, 'click', '[data-new]', (e, b) => (b.dataset.new === 'order' ? startOrder() : openIssueForm({ onSaved: render })));
  on(root, 'click', '[data-issue]', (e, b) => { const i = mt.issueById(b.dataset.issue); if (i) openIssueSheet(i, render); });
  on(root, 'click', '[data-fs]', (e, b) => { f.state = b.dataset.fs; render(); });
  on(root, 'click', '[data-ft]', (e, b) => { f.type = b.dataset.ft; render(); });
  on(root, 'click', '[data-more]', () => { histLimit += 20; render(); });
  on(root, 'click', '[data-oilall]', () => { oilAll = true; render(); });
  root.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { f.text = e.target.value; f.focus = true; render(); } });
  render();
  const un = mt.onMaintenanceChange(render), timer = setInterval(() => { if (document.visibilityState === 'visible' && !document.activeElement.matches('input,textarea,select')) render(); }, 60000);
  s.cleanup = () => { un(); clearInterval(timer); };
  return s;
}

/* ===== Historial de un equipo ===== */
export async function workshopEquipmentScreen({ type, id }) {
  await Promise.all([mt.loadMaintenance(), lg.loadLogistics()]);
  const t = type === 'u' ? 'vehicle' : 'trailer';
  if (!mt.equipmentOf(t, id)) { toast('Ese equipo ya no está en el catálogo.', { type: 'info' }); go('/operacion/taller', { replace: true }); return null; }
  let text = '';
  const s = screen('<div class="page mt-page"></div>');
  const root = s.el;
  let dg = null;
  function render() {
    const eq = mt.equipmentOf(t, id);
    if (!eq) { go('/operacion/taller', { replace: true }); return; }
    const y = window.scrollY, orders = mt.ordersOf(eq.key), comps = mt.componentsOfOrders(orders.map((o) => o.id));
    const oil = t === 'vehicle' ? mt.oilStatusOf(id) : null, sum = equipmentSummary({ orders, components: comps, issues: mt.issuesOf(eq.key), oil });
    const av = mt.availability(eq.key), prof = mt.profileOf(eq.key), tires = mt.tiresOfEquipment(eq.key), last = mt.lastOdometer(id);
    const list = orders.filter((o) => matchOrder(o, text, { label: eq.label, placas: eq.placas, componentNames: mt.componentsOfOrder(o.id).map((c) => mt.componentName(o.kind, c.componentId)) }));
    const replacedPos = new Set(tires.filter((x) => x.layout === prof.tireLayout).flatMap((x) => x.positions));
    root.innerHTML = `
      <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Taller</span></button><button type="button" class="nav-act" data-cfg data-w aria-label="Configurar intervalos y ejes">${icon.gear}</button></header>
      <div class="unit-head"><span class="unit-badge lg">${esc(t === 'vehicle' ? eq.label : (eq.label || '').slice(0, 9))}</span><div><h1>${esc(t === 'vehicle' ? eq.placas || 'Sin placas' : eq.label)}</h1><p>${esc(eq.kindLabel)}${t === 'trailer' && eq.sub && eq.sub !== eq.kindLabel ? ' · ' + esc(eq.sub.replace(eq.kindLabel + ' · ', '')) : ''}</p></div></div>
      <p>${availChip(av)}${av.inShop ? ` <a class="link" href="${orderHref(av.order.id)}">${esc(av.order.folio)}</a>` : ''}</p>
      <div class="mt-acts"><button type="button" class="btn-primary" data-new="order" data-w>${icon.plus}<span>Registrar mantenimiento</span></button><button type="button" class="btn-secondary" data-new="issue" data-w>${icon.alert}<span>Reportar falla</span></button></div>
      <a class="btn-secondary block" href="#/operacion/taller/reporte-equipo/${type}/${encodeURIComponent(id)}" style="margin:0 0 16px">${icon.file}<span>Generar reporte de servicios</span></a>
      <div class="mt-tiles">
        <div class="mt-tile"><small>Servicios</small><b>${sum.count}</b></div>
        <div class="mt-tile"><small>Último mantenimiento</small><b style="font-size:15px">${sum.last ? esc(fmtD(sum.last.inAt)) : '—'}</b></div>
        <div class="mt-tile"><small>Días en taller</small><b>${nf(sum.daysInShop, 1)}</b></div>
        <div class="mt-tile${sum.openIssues.length ? ' warn' : ''}"><small>Fallas reportadas</small><b>${sum.issues.length}</b>${sum.openIssues.length ? `<small>${sum.openIssues.length} sin atender</small>` : ''}</div>
        <div class="mt-tile"><small>Reparaciones</small><b>${sum.repairs}</b></div>
        <div class="mt-tile"><small>Reemplazos</small><b>${sum.replacements}</b></div>
      </div>
      ${t === 'vehicle' ? `<section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Cambio de aceite</h2><button type="button" class="btn-ghost sm" data-cfg data-w>${icon.gear}<span>Intervalo</span></button></div>
        ${oil.state === 'proximo' || oil.state === 'vencido' ? oilAlert({ eq, st: oil }) : ''}
        <dl class="sumlist grp-b" style="padding-bottom:4px">
          <div><dt>Último cambio</dt><dd>${oil.last ? `${esc(fmtDT(oil.last.ts))} · <b>${esc(kmText(oil.last.odometer))}</b>` : '<i>Sin cambio registrado</i>'}</dd></div>
          <div><dt>Intervalo</dt><dd>${prof.oilKm ? `${esc(nf(prof.oilKm))} km` : '<i>Sin configurar</i>'}${prof.oilDays ? ` o ${esc(prof.oilDays)} días` : ''}</dd></div>
          <div><dt>Próximo cambio</dt><dd>${oil.nextKm != null ? `<b>${esc(nf(oil.nextKm))} km</b><small> = ${esc(nf(oil.last.odometer))} + ${esc(nf(prof.oilKm))}</small>` : oil.state === 'sin_intervalo' ? '<i>Configura el intervalo de esta unidad</i>' : '<i>—</i>'}${oil.dueTs ? `<small>Fecha límite: ${esc(fmtD(oil.dueTs))}</small>` : ''}</dd></div>
          <div><dt>Estado</dt><dd>${esc(OIL_STATE_TEXT[oil.state])}${oilLine(oil) ? `<small>${esc(oilLine(oil))}</small>` : ''}</dd></div>
          <div><dt>Odómetro actual</dt><dd>${last ? `${esc(kmText(last.km))}<small>${esc(mt.SOURCE_TEXT[last.source] || '')} · ${esc(fmtD(last.ts))} (${esc(last.age.text)})${last.age.stale ? ' · dato desactualizado' : ''}</small>` : '<i>Sin dato</i>'}</dd></div>
        </dl></section>` : ''}
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Llantas</h2><span class="count">${tires.length}</span></div>
        ${tires.length ? `<p class="grp-note">Último reemplazo: <b>${esc(fmtD(tires[0].date))}</b> · ${plural(tires[0].quantity, 'llanta', 'llantas')} · ${esc(tireReasonLabel(tires[0].reason))}${tires[0].odometer != null ? ` · ${esc(kmText(tires[0].odometer))}` : ''}</p>` : ''}
        ${prof.tireLayout && replacedPos.size ? '<div data-tires></div>' : ''}
        ${tires.length ? `<div class="mt-list">${tires.map(tireRow).join('')}</div>` : '<p class="grp-note">Sin reemplazos de llantas registrados.</p>'}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Diagrama del historial</h2></div>
        ${comps.length ? '<p class="dg-hint">Todas las intervenciones registradas del equipo. Toca un componente para ver su historial.</p><div data-dg></div>' : '<p class="grp-note">Sin componentes intervenidos todavía.</p>'}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Fallas reportadas</h2><span class="count">${sum.issues.length}</span></div>
        ${sum.issues.length ? `<div class="mt-list">${sum.issues.map(issueRow).join('')}</div>` : '<p class="grp-note">Sin fallas reportadas.</p>'}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Mantenimientos</h2><span class="count">${list.length}</span></div>
        <label class="search"><span class="search-ic">${icon.search}</span><input type="search" class="search-in" data-q placeholder="Folio, fecha o componente" value="${esc(text)}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"></label>
        ${list.length ? `<div class="mt-cards">${list.map((o) => orderCard(o)).join('')}</div>` : `<div class="empty"><p>${text ? 'Sin coincidencias.' : 'Sin mantenimientos registrados.'}</p></div>`}</section>`;
    const tb = root.querySelector('[data-tires]');
    if (tb) tb.replaceWith(tirePicker(prof.tireLayout, replacedPos, { interactive: false }).el);
    const slot = root.querySelector('[data-dg]');
    if (slot && eq.kind) {
      if (!dg) dg = createDiagram({ kind: eq.kind, records: () => mt.componentsOfOrders(mt.ordersOf(eq.key).map((o) => o.id)), onPick: (c) => componentHistory(eq, c) });
      slot.replaceWith(dg.el); dg.update();
    }
    const q = root.querySelector('[data-q]');
    if (s.focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); s.focusQ = false; }
    window.scrollTo(0, y);
  }
  on(root, 'click', '[data-back]', () => back('/operacion/taller'));
  on(root, 'click', '[data-new]', (e, b) => (b.dataset.new === 'order' ? startOrder({ type: t, id }) : openIssueForm({ eq: mt.equipmentOf(t, id), onSaved: render })));
  on(root, 'click', '[data-cfg]', () => openProfileForm(mt.equipmentOf(t, id), render));
  on(root, 'click', '[data-issue]', (e, b) => { const i = mt.issueById(b.dataset.issue); if (i) openIssueSheet(i, render); });
  root.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { text = e.target.value; s.focusQ = true; render(); } });
  render();
  s.cleanup = mt.onMaintenanceChange(render);
  return s;
}
/* Historial de un componente en todas las órdenes del equipo */
function componentHistory(eq, componentId) {
  const rel = relatedIds(eq.kind, componentId);
  const rows = mt.ordersOf(eq.key).flatMap((o) => mt.componentsOfOrder(o.id).filter((c) => rel.includes(c.componentId)).map((c) => ({ c, o })));
  const st = componentStates(rows.map((r) => ({ ...r.c, componentId }))).get(componentId);
  openSheet({ title: mt.componentName(eq.kind, componentId), full: true, body: `<div class="op-form">
    <p>${st ? stateChip(st.state) : stateChip('none')}</p>
    ${rows.length ? `<div class="mt-list">${rows.map(({ c, o }) => `<a class="mt-row" href="${orderHref(o.id)}"><span class="mt-row-tx"><b>${esc(o.folio)}</b><small>${esc(fmtD(c.date))}${c.description ? ' · ' + esc(c.description) : ''}${c.componentId !== componentId ? ' · registro de ambos lados' : ''}</small>${c.severity ? sevChip(c.severity) : ''}<span class="lg-st lg-t-gray"><i></i>${esc(actionLabel(c.action))}</span></span><span class="chev">${icon.chev}</span></a>`).join('')}</div>` : '<p class="grp-note">Sin intervenciones registradas en este componente.</p>'}</div>` });
}

/* ===== Orden de mantenimiento ===== */
export async function workshopOrderScreen({ id }) {
  await Promise.all([mt.loadMaintenance(), lg.loadLogistics()]);
  const o0 = mt.orderById(id);
  if (!o0 || o0.deletedAt) { toast('Esa orden ya no existe.', { type: 'info' }); go('/operacion/taller', { replace: true }); return null; }
  const s = screen('<div class="page mt-page mt-order"></div>');
  const root = s.el;
  let dg = null;
  async function render() {
    const o = mt.orderById(id);
    if (!o || o.deletedAt) { go('/operacion/taller', { replace: true }); return; }
    const y = window.scrollY, eq = mt.equipmentOfOrder(o), d = orderDuration(o), av = mt.availability(eq.key);
    const services = mt.servicesOf(id), comps = mt.componentsOfOrder(id), issues = mt.issuesOfOrder(id), tires = mt.tiresOf(id), oil = mt.oilOf(id), events = mt.eventsOf(id);
    const states = componentStates(comps), nums = numbering(states, o.kind, mt.parts());
    const replaced = comps.filter((c) => c.replaced || c.action === 'reemplazado');
    const openIss = mt.issuesOf(eq.key).filter((i) => !i.orderId);
    const photos = mt.photosOfOrder(id), strip = await photoStrip(photos);
    const phCount = (pid) => mt.photosOf(pid).length;
    root.innerHTML = `
      <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Taller</span></button><button type="button" class="nav-act" data-edit data-w aria-label="Editar mantenimiento">${icon.edit}</button></header>
      <div class="mt-head">${badge(eq)}<div><h1>${esc(o.folio)}</h1><p><a class="link" href="${eqHref(eq.type, eq.id)}">${esc(eq.kindLabel)} ${esc(eq.label)}${eq.placas && eq.placas !== eq.label ? ' · ' + esc(eq.placas) : ''}</a> · ${esc(typeLabel(o.type))}</p></div></div>
      <section class="mt-hero">
        <div class="mt-hero-top">${statusChip(o.status, 'lg-big')}${availChip(av)}</div>
        <div class="mt-time"><div><small>Ingreso</small><b>${esc(fmtDT(o.inAt))}</b></div><div><small>Salida</small><b>${Number.isFinite(o.outAt) ? esc(fmtDT(o.outAt)) : '—'}</b></div>
          <div class="full"><small>${d && d.running ? 'Tiempo en taller (en curso)' : 'Tiempo en taller'}</small><b>${d ? esc(d.text) : '—'}</b></div></div>
        <button type="button" class="${isOpenStatus(o.status) ? 'btn-primary' : 'btn-secondary'} block lg" data-st data-w>${icon.refresh}<span>${isOpenStatus(o.status) ? 'Actualizar estado o finalizar' : 'Cambiar estado'}</span></button>
      </section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Información</h2></div>
        <dl class="sumlist grp-b" style="padding-bottom:4px">
          ${o.equipmentType === 'vehicle' ? `<div><dt>Kilometraje</dt><dd>${esc(kmText(o.odometer))}${o.odometerFix ? `<small>Corrección documentada: ${esc(o.odometerFix.reasonText)} (último conocido ${esc(kmText(o.odometerFix.prevKm))})</small>` : ''}</dd></div>` : `<div><dt>Tipo de remolque</dt><dd>${esc(kindLabel(o.kind))}</dd></div>`}
          <div><dt>Motivo</dt><dd>${esc(o.reason || '—')}</dd></div>
          <div><dt>Descripción</dt><dd>${o.description ? esc(o.description) : '<i>Sin descripción</i>'}</dd></div>
          ${o.notes ? `<div><dt>Observaciones</dt><dd>${esc(o.notes)}</dd></div>` : ''}
          <div><dt>Disponibilidad</dt><dd>${o.outOfService !== false ? 'Fuera de servicio mientras esté abierta' : 'Puede operar durante la orden'}</dd></div>
        </dl></section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Servicios realizados</h2><span class="count">${services.length}</span></div>
        ${services.length ? `<div class="mt-list">${services.map((sv) => `<button type="button" class="mt-row" data-svc="${esc(sv.id)}">${icon.wrench}<span class="mt-row-tx"><b>${esc(workTypeLabel(sv.type))}${sv.componentId ? ' · ' + esc(mt.componentName(o.kind, sv.componentId)) : ''}</b><small>${esc(fmtD(sv.date))}${sv.description ? ' · ' + esc(sv.description) : ''}</small>${sv.severity ? sevChip(sv.severity) : ''}${sv.action ? `<span class="lg-st lg-t-${sv.action === 'reemplazado' ? 'blue' : 'gray'}"><i></i>${esc(actionLabel(sv.action))}</span>` : ''}<span class="lg-st lg-t-${sv.workStatus === 'terminado' ? 'ok' : 'amber'}"><i></i>${esc(workStatusLabel(sv.workStatus))}</span></span>${phCount(sv.id) ? `<span class="mt-ph-n">${icon.image}${phCount(sv.id)}</span>` : ''}<span class="chev">${icon.chev}</span></button>`).join('')}</div>` : '<p class="grp-note">Agrega cada trabajo de este ingreso (no hace falta crear una orden por trabajo).</p>'}
        <button type="button" class="add-btn" data-addsvc data-w>${icon.plus}<span>Agregar trabajo</span></button></section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Diagrama de intervenciones</h2></div>
        <p class="dg-hint">Toca la parte intervenida (o abre la lista de componentes) para registrar la gravedad, la reparación o el reemplazo.</p>
        <div data-dg></div>
        ${states.size ? `<div class="mt-list">${[...states.values()].sort((a, b) => nums.get(a.componentId) - nums.get(b.componentId)).map((v) => `<button type="button" class="mt-row" data-comp="${esc(v.componentId)}"><span class="dg-num">${nums.get(v.componentId)}</span><span class="mt-row-tx"><b>${esc(mt.componentName(o.kind, v.componentId))}</b><small>${plural(v.items.length, 'registro', 'registros')}${v.replaced && v.severity ? ` · daño original: ${esc(STATE_LABELS[v.severity])}` : ''}</small>${stateChip(v.state)}</span><span class="chev">${icon.chev}</span></button>`).join('')}</div>` : ''}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Fallas relacionadas</h2><span class="count">${issues.length}</span></div>
        ${issues.length ? `<div class="mt-list">${issues.map(issueRow).join('')}</div>` : '<p class="grp-note">Ninguna falla reportada relacionada con esta orden.</p>'}
        ${openIss.length ? `<button type="button" class="add-btn" data-linkiss data-w>${icon.link}<span>Relacionar falla reportada (${openIss.length})</span></button>` : ''}</section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Componentes reemplazados</h2><span class="count">${replaced.length}</span></div>
        ${replaced.length ? `<div class="mt-list">${replaced.map((c) => `<button type="button" class="mt-row" data-comp="${esc(c.componentId)}"><span class="mt-row-tx"><b>${esc(mt.componentName(o.kind, c.componentId))}</b><small>${esc(fmtD(c.date))} · daño original: ${esc(c.severity ? STATE_LABELS[c.severity] : 'sin registrar')}</small>${stateChip('reemplazado')}</span></button>`).join('')}</div>` : '<p class="grp-note">Sin componentes reemplazados.</p>'}</section>
      ${o.equipmentType === 'vehicle' ? `<section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Cambio de aceite</h2></div>
        ${oil.length ? `<div class="mt-list">${oil.map((x) => `<button type="button" class="mt-row" data-oil="${esc(x.id)}">${icon.drop}<span class="mt-row-tx"><b>${esc(kmText(x.odometer))} · ${esc([x.brand, x.viscosity].filter(Boolean).join(' ') || 'Aceite')}</b><small>${esc(fmtDT(x.date))}${x.liters ? ` · ${esc(nf(x.liters, 1))} L` : ''} · filtro de aceite ${x.oilFilter ? 'reemplazado' : 'no reemplazado'}${x.otherFilters ? ` · ${esc(x.otherFilters)}` : ''}</small></span><span class="chev">${icon.chev}</span></button>`).join('')}</div>` : ''}
        <button type="button" class="add-btn" data-addoil data-w>${icon.drop}<span>Registrar cambio de aceite</span></button></section>` : ''}
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Llantas</h2><span class="count">${tires.reduce((a, x) => a + x.quantity, 0)}</span></div>
        ${tires.length ? `<div class="mt-list">${tires.map((x) => `<button type="button" class="mt-row" data-tire="${esc(x.id)}">${icon.tire}<span class="mt-row-tx"><b>${plural(x.quantity, 'llanta reemplazada', 'llantas reemplazadas')}</b><small>${esc(fmtD(x.date))} · ${esc(tireReasonLabel(x.reason))}${x.brand ? ' · ' + esc(x.brand) : ''}${x.size ? ' ' + esc(x.size) : ''}</small><small>${x.positions.length ? esc(x.positions.map((p) => positionLabel(p, (positionsOf(x.layout).find((z) => z.id === p) || {}).axleKind)).join('; ')) : ''}${pendingPositions(x) ? `${x.positions.length ? ' · ' : ''}${pendingPositions(x)} pendiente${pendingPositions(x) === 1 ? '' : 's'} de especificar` : ''}</small></span><span class="chev">${icon.chev}</span></button>`).join('')}</div><div data-tires></div>` : ''}
        <button type="button" class="add-btn" data-addtire data-w>${icon.tire}<span>Registrar reemplazo de llantas</span></button></section>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Evidencias</h2><span class="count">${photos.length}</span></div>
        ${strip || '<p class="grp-note">Sin fotografías.</p>'}
        <button type="button" class="add-btn" data-addph data-w>${icon.camera}<span>Agregar fotografías a la orden</span></button></section>
      <a class="btn-primary block lg" href="#/operacion/taller/reporte/${encodeURIComponent(id)}" style="margin:0 0 18px">${icon.file}<span>Generar reporte</span></a>
      <section class="mt-sec"><div class="sec-hrow"><h2 class="sec-h">Bitácora</h2></div>
        <ul class="mt-log grp-b">${[...events].reverse().map((ev) => `<li>${esc(ev.text)}<small>${esc(fmtDT(ev.at))}${ev.by ? ' · ' + esc(ev.by) : ''}</small></li>`).join('') || '<li>Sin movimientos.</li>'}</ul></section>
      <button type="button" class="btn-danger block" data-del data-w>${icon.trash}<span>Eliminar mantenimiento</span></button>`;
    const slot = root.querySelector('[data-dg]');
    if (!dg) dg = createDiagram({ kind: o.kind, records: () => mt.componentsOfOrder(id), onPick: (c) => openComponentSheet(mt.orderById(id), c, () => {}) });
    slot.replaceWith(dg.el); dg.update();
    const tb = root.querySelector('[data-tires]');
    const withPos = tires.filter((x) => x.layout && x.positions.length);
    if (tb && withPos.length) tb.replaceWith(tirePicker(withPos[0].layout, new Set(withPos.filter((x) => x.layout === withPos[0].layout).flatMap((x) => x.positions)), { interactive: false }).el);
    window.scrollTo(0, y);
  }
  const ord = () => mt.orderById(id);
  on(root, 'click', '[data-back]', () => back('/operacion/taller'));
  on(root, 'click', '[data-edit]', () => openOrderForm({ eq: mt.equipmentOfOrder(ord()), order: ord(), onSaved: () => {} }));
  on(root, 'click', '[data-st]', () => openStatusForm(ord()));
  on(root, 'click', '[data-addsvc]', () => openServiceForm(ord()));
  on(root, 'click', '[data-svc]', (e, b) => { const sv = mt.servicesOf(id).find((x) => x.id === b.dataset.svc); if (!sv) return; if (sv.oilChangeId) openOilForm(ord(), mt.oilOf(id).find((x) => x.id === sv.oilChangeId)); else if (sv.tireId) openTireForm(ord(), mt.tiresOf(id).find((x) => x.id === sv.tireId)); else openServiceForm(ord(), sv); });
  on(root, 'click', '[data-comp]', (e, b) => { if (dg) dg.select(b.dataset.comp); openComponentSheet(ord(), b.dataset.comp, () => {}); });
  on(root, 'click', '[data-issue]', (e, b) => { const i = mt.issueById(b.dataset.issue); if (i) openIssueSheet(i); });
  on(root, 'click', '[data-linkiss]', async () => {
    const eq = mt.equipmentOfOrder(ord()), list = mt.issuesOf(eq.key).filter((i) => !i.orderId);
    const r = await openPicker({ title: 'Relacionar falla reportada', allowNew: false, items: list.map((i) => ({ value: i.id, label: `${i.componentId ? mt.componentName(i.kind, i.componentId) : 'Falla'} · ${fmtD(i.date)}`, sub: i.description })) });
    if (r) { try { await mt.linkIssue(r.value, id); toast('Falla relacionada (no se duplica: queda una sola, con esta orden)'); } catch (err) { toast(err.message, { type: 'warn' }); } }
  });
  on(root, 'click', '[data-addoil]', () => openOilForm(ord()));
  on(root, 'click', '[data-oil]', (e, b) => openOilForm(ord(), mt.oilOf(id).find((x) => x.id === b.dataset.oil)));
  on(root, 'click', '[data-addtire]', () => openTireForm(ord()));
  on(root, 'click', '[data-tire]', (e, b) => openTireForm(ord(), mt.tiresOf(id).find((x) => x.id === b.dataset.tire)));
  on(root, 'click', '[data-view-photo]', (e, b) => viewPhoto(b.dataset.viewPhoto));
  on(root, 'click', '[data-addph]', () => {
    const pf = photoField(mt.photosOf(id), { label: 'Fotografías de la orden' });
    const sh = openSheet({ title: 'Evidencias de la orden', full: true, className: 'form-sheet', body: '<div class="op-form" data-b></div>' });
    const box = sh.body.querySelector('[data-b]'); box.appendChild(pf.el);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn-primary block lg'; btn.textContent = 'Guardar fotografías'; box.appendChild(btn);
    btn.addEventListener('click', async () => { try { await pf.apply('order', id, id); sh.close(); toast('Fotografías guardadas'); } catch (err) { toast(err.message || 'No se pudieron guardar las fotos.', { type: 'warn' }); } });
  });
  on(root, 'click', '[data-del]', async () => {
    const o = ord();
    if (!(await confirmDestructive(`¿Eliminar el mantenimiento ${o.folio}?`, 'La orden sale del historial y del tablero. Las fallas relacionadas vuelven a «Fallas reportadas».', 'Eliminar mantenimiento'))) return;
    await mt.deleteOrder(id); toast('Mantenimiento eliminado', { type: 'info' }); go('/operacion/taller', { replace: true });
  });
  await render();
  const un = mt.onMaintenanceChange(() => render()), timer = setInterval(() => { const o = ord(); if (o && isOpenStatus(o.status) && document.visibilityState === 'visible' && !document.documentElement.classList.contains('sheet-open')) render(); }, 60000);
  s.cleanup = () => { un(); clearInterval(timer); };
  return s;
}
