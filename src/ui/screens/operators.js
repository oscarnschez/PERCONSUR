/*
 * Operadores — control administrativo interno por operador.
 * Listado (#/operadores), ficha del operador (#/operadores/:id) y resumen general (#/operadores/resumen).
 * Todos los importes se derivan con computeOperator(), que usa la fórmula única:
 *   BALANCE = COMISIONES − SÁBADOS PAGADOS − GASTOS DE VIAJE − PRÉSTAMOS
 */
import { screen, on } from '../../core/dom.js';
import { go, back } from '../../core/router.js';
import * as ops from '../../services/operators.js';
import { shareFile, downloadBlob } from '../../services/share.js';
import { getSetting, setSetting } from '../../services/settings.js';
import { esc } from '../../domain/shared/format.js';
import { money } from '../../domain/operators/money.js';
import {
  computeOperator, movementsOf, filterMovements, MOVE_FILTERS, PERIODS, periodRange, fmtDate, fmtDateShort, todayStr, aggregate, isDate,
} from '../../domain/operators/balance.js';
import { icon } from '../components/icons.js';
import { actionSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { openTripForm, openTripDetail, openLoanForm, openAdjustmentForm, openSettingsForm } from './operatorForms.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const amtCls = (c) => (c < 0 ? 'neg' : c > 0 ? 'pos' : '');
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/* ===== Listado ===== */
export async function operatorsScreen() {
  let text = '', fco = 'todas', fbal = '';
  const list = ops.operatorList();
  const companies = [...new Set(list.map((o) => o.company))];
  const s = screen(`<div class="page">
    <header class="page-top split"><h1 class="title">Operadores</h1>
      <a class="btn-ghost sm" href="#/operadores/resumen">${icon.chart}<span>Resumen</span></a></header>
    <label class="search"><span class="search-ic">${icon.search}</span><input type="search" class="search-in" placeholder="Buscar operador" autocomplete="off" autocorrect="off" enterkeyhint="search"></label>
    <div class="chips filters">
      ${companies.length > 1 ? `<button type="button" class="chip" data-co="todas">Todas</button>${companies.map((c) => `<button type="button" class="chip" data-co="${c}">${esc(list.find((o) => o.company === c).companyShort)}</button>`).join('')}` : ''}
      <button type="button" class="chip" data-bal="neg">Balance negativo</button>
      <button type="button" class="chip" data-bal="min">Comisión mínima</button>
    </div>
    <div data-list></div>
    <p class="grp-note center">Los operadores provienen del catálogo. Para agregar uno ve a <a href="#/catalogos/operators">Catálogos → Operadores</a>.</p>
  </div>`);
  const root = s.el, listEl = root.querySelector('[data-list]');
  const results = new Map(list.map((o) => [o.id, ops.computeFor(o.id)]));
  function draw() {
    root.querySelectorAll('[data-co]').forEach((b) => b.classList.toggle('on', b.dataset.co === fco));
    root.querySelectorAll('[data-bal]').forEach((b) => b.classList.toggle('on', b.dataset.bal === fbal));
    const rows = list.filter((o) => (fco === 'todas' || o.company === fco) && (!text || fold(o.name).includes(fold(text))))
      .filter((o) => { const r = results.get(o.id); return !fbal || (fbal === 'neg' ? r.balance < 0 : r.settings.minEnabled); });
    listEl.innerHTML = !list.length
      ? `<div class="empty"><p>No hay operadores en el catálogo.</p><a class="btn-primary sm" href="#/catalogos/operators">${icon.plus}<span>Agregar operadores</span></a></div>`
      : rows.length ? `<div class="list">${rows.map((o) => {
        const r = results.get(o.id);
        return `<a class="row op-row" href="#/operadores/${esc(o.id)}">
          <span class="av">${esc(initials(o.name))}</span>
          <span class="row-tx"><span class="row-l1"><b>${esc(o.name)}</b>${r.settings.minEnabled ? '<span class="st st-min">Mínimo</span>' : ''}</span>
            <span class="row-l2">${companies.length > 1 ? esc(o.companyShort) + ' | ' : ''}${plural(r.stats.trips, 'viaje', 'viajes')} | ${money(r.comp.commissions)} en comisiones</span></span>
          <span class="op-bal ${amtCls(r.balance)}"><small>Balance</small><b>${money(r.balance)}</b></span>
        </a>`;
      }).join('')}</div>` : '<div class="empty"><p>No hay operadores con ese filtro.</p></div>';
  }
  on(root, 'click', '[data-co]', (e, b) => { fco = b.dataset.co; draw(); });
  on(root, 'click', '[data-bal]', (e, b) => { fbal = fbal === b.dataset.bal ? '' : b.dataset.bal; draw(); });
  root.querySelector('.search-in').addEventListener('input', (e) => { text = e.target.value.trim(); draw(); });
  draw();
  return s;
}

/* ===== Ficha del operador ===== */
function satLine(r) {
  if (!r.sat.count && !r.sat.manual) return 'Sin sábados contabilizados';
  return `${r.sat.count} × ${money(r.sat.weekly)} = ${money(r.sat.count * r.sat.weekly)}`;
}
export function balanceCard(r, { title = 'Balance actual', sub = '' } = {}) {
  return `<section class="bal-card ${r.balance < 0 ? 'is-neg' : ''}">
    <span class="bal-l">${esc(title)}</span>
    <b class="bal-v">${money(r.balance)}<small> MXN</small></b>
    ${sub ? `<span class="bal-sub">${sub}</span>` : ''}
    <dl class="bal-rows">
      <div><dt>Comisiones</dt><dd class="${r.comp.commissions > 0 ? 'pos' : ''}">${money(r.comp.commissions, { sign: true })}</dd></div>
      <div><dt>Sábados pagados</dt><dd>${money(-r.comp.saturdaysPaid)}</dd></div>
      <div><dt>Gastos de viaje</dt><dd>${money(-r.comp.expenses)}</dd></div>
      <div><dt>Préstamos</dt><dd>${money(-r.comp.loans)}</dd></div>
    </dl>
    ${r.balance < 0 ? '<p class="bal-note">Balance negativo. Puedes seguir registrando movimientos.</p>' : ''}
  </section>`;
}
function tripCard(t, cutoff) {
  return `<button type="button" class="trip-card" data-trip="${esc(t.id)}">
    <span class="tc-top"><span class="div-tag ${t.division}">${t.division === 'campo' ? 'Campo' : 'Puerto'}</span>${t.isExpanded ? '<span class="exp-tag">Comisión ampliada</span>' : ''}${t.date > cutoff ? '<span class="after-tag">Después del corte</span>' : ''}<span class="tc-date">${esc(fmtDateShort(t.date))}</span></span>
    <b class="tc-route">${esc(t.origin)} → ${esc(t.destination)}</b>
    <span class="tc-nums"><span><small>Tarifa</small><b>${money(t.fare)}</b></span><span><small>Comisión</small><b class="pos">${money(t.finalCommission)}</b></span><span><small>Gastos</small><b>${money(t.travelExpenses)}</b></span></span>
  </button>`;
}
function moveRow(m) {
  const ic = { sabado: icon.clock, prestamo: icon.download, viaje: icon.truck, ajuste: icon.edit, config: icon.gear }[m.kind];
  const amt = m.kind === 'viaje'
    ? `<span class="mv-amt"><b class="pos">${money(m.commission, { sign: true })}</b>${m.expenses ? `<small class="neg">${money(-m.expenses)} gastos</small>` : ''}</span>`
    : m.amount == null ? '' : `<span class="mv-amt"><b class="${amtCls(m.amount)}">${money(m.amount, { sign: true })}</b></span>`;
  const sub = m.kind === 'sabado' && m.manual ? `${m.count} sábados × ${money(m.weekly)}` : m.kind === 'viaje' ? `${m.division === 'campo' ? 'Campo' : 'Puerto'}${m.expanded ? ' | Comisión ampliada' : ''}` : m.sub || '';
  const tap = ['viaje', 'prestamo', 'ajuste'].includes(m.kind);
  return `<${tap ? 'button type="button"' : 'div'} class="mv-row k-${m.kind}${m.after ? ' after' : ''}" ${tap ? `data-mv="${m.kind}" data-id="${esc(m.id)}"` : ''}>
    <span class="mv-ic">${ic}</span>
    <span class="mv-tx"><b>${esc(m.title)}</b><small>${esc(fmtDate(m.date))}${sub ? ' | ' + esc(sub) : ''}${m.after ? ' | Después del corte' : ''}</small></span>${amt}</${tap ? 'button' : 'div'}>`;
}

export async function operatorScreen({ id }, q) {
  const op = ops.operatorById(id);
  if (!op) { toast('Ese operador ya no está en el catálogo.', { type: 'info' }); go('/operadores', { replace: true }); return null; }
  let tab = getSetting('opTab', 'viajes'), tdiv = 'todos', tper = 'todo', tcustom = { from: '', to: '' }, mfilter = 'todos';
  const s = screen('<div class="page op-page"></div>', { keepScroll: false });
  const root = s.el;

  function render() {
    const rec = ops.recordsOf(id), r = computeOperator(rec), st = r.settings;
    const trips = rec.trips.filter((t) => !t.deletedAt).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
    const loans = rec.loans.filter((l) => !l.deletedAt).sort((a, b) => (a.date < b.date ? 1 : -1));
    const y = window.scrollY;
    root.innerHTML = `
      <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Operadores</span></button>
        <button type="button" class="nav-act" data-more aria-label="Más opciones">${icon.more}</button></header>
      <div class="op-head"><span class="av lg">${esc(initials(op.name))}</span><div><h1>${esc(op.name)}</h1><p>${esc(op.companyShort)}${isDate(st.startDate) ? ` | Desde ${esc(fmtDate(st.startDate))}` : ''}</p></div></div>
      ${balanceCard(r, { sub: `Corte al ${esc(fmtDate(r.cutoff))}${r.cutoffIsToday ? ' (hoy)' : ''}` })}
      <div class="op-acts">
        <button type="button" class="btn-primary" data-new="viaje">${icon.plus}<span>Viaje</span></button>
        <button type="button" class="btn-secondary" data-new="prestamo">${icon.plus}<span>Préstamo</span></button>
        <button type="button" class="btn-secondary" data-new="ajuste">${icon.plus}<span>Ajuste</span></button>
      </div>
      <button type="button" class="btn-secondary block stmt-btn" data-stmt>${icon.file}<span>Generar PDF</span><small>Estado de cuenta</small></button>
      ${r.warnings.map((w) => `<p class="op-warn">${icon.alert}<span>${esc(w)}</span></p>`).join('')}
      <section class="grp"><div class="grp-h"><h3>Configuración</h3><button type="button" class="btn-ghost sm" data-settings>${icon.edit}<span>Editar</span></button></div>
        <div class="grp-b"><dl class="sumlist">
          <div><dt>Fecha de inicio</dt><dd>${isDate(st.startDate) ? esc(fmtDate(st.startDate)) : '<i>Sin configurar</i>'}</dd></div>
          <div><dt>Calcular hasta</dt><dd>${r.cutoffIsToday ? `Hoy (${esc(fmtDate(r.cutoff))})` : esc(fmtDate(r.cutoff))}</dd></div>
          <div><dt>Sábados contabilizados</dt><dd><b>${r.sat.count}</b> <span class="st ${r.sat.manual ? 'st-borrador' : 'st-generado'}">${r.sat.manual ? 'Ajuste manual' : 'Automático'}</span>${r.sat.manual ? `<br><small class="muted">Automático serían ${r.sat.auto}</small>` : ''}</dd></div>
          <div><dt>Monto semanal</dt><dd>${money(st.weekly)}</dd></div>
          <div><dt>Sábados pagados</dt><dd>${satLine(r)}</dd></div>
          <div><dt>Comisión mínima garantizada</dt><dd>${st.minEnabled ? `Activada | ${money(st.minAmount)}` : 'Desactivada'}</dd></div>
        </dl></div></section>
      <section class="grp"><div class="grp-h"><h3>Actividad</h3></div>
        <div class="tiles">
          <div class="tile"><small>Viajes</small><b>${r.stats.trips}</b></div>
          <div class="tile"><small>Puerto</small><b>${r.stats.puerto}</b></div>
          <div class="tile"><small>Campo</small><b>${r.stats.campo}</b></div>
          <div class="tile wide"><small>Tarifas acumuladas</small><b>${money(r.stats.fares)}</b></div>
          <div class="tile wide"><small>Comisiones ampliadas</small><b>${r.stats.expanded}${r.stats.expandedAmount ? ` <span class="muted">| ${money(r.stats.expandedAmount, { sign: true })}</span>` : ''}</b></div>
        </div></section>
      <div class="seg wide op-tabs" role="tablist">${[['viajes', 'Viajes'], ['prestamos', 'Préstamos'], ['movimientos', 'Movimientos']].map(([k, l]) => `<button type="button" role="tab" class="seg-b${tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="op-tab">${tab === 'viajes' ? tripsTab(trips, r) : tab === 'prestamos' ? loansTab(loans, r) : movesTab(rec, r)}</div>`;
    window.scrollTo(0, y);
  }
  function tripsTab(trips, r) {
    const range = periodRange(tper, tcustom);
    const list = trips.filter((t) => (tdiv === 'todos' || t.division === tdiv) && (!range.from || t.date >= range.from) && (!range.to || t.date <= range.to));
    const sum = (f) => list.reduce((a, t) => a + (f(t) || 0), 0);
    return `<div class="chips filters">${[['todos', 'Todos'], ['puerto', 'Puerto'], ['campo', 'Campo']].map(([k, l]) => `<button type="button" class="chip${tdiv === k ? ' on' : ''}" data-tdiv="${k}">${l}</button>`).join('')}</div>
      <div class="chips filters">${PERIODS.map(([k, l]) => `<button type="button" class="chip${tper === k ? ' on' : ''}" data-tper="${k}">${l}</button>`).join('')}</div>
      ${tper === 'custom' ? `<div class="row2 period-custom"><label class="fld"><span class="fl">Desde</span><input class="in" type="date" data-tc="from" value="${esc(tcustom.from)}"></label><label class="fld"><span class="fl">Hasta</span><input class="in" type="date" data-tc="to" value="${esc(tcustom.to)}"></label></div>` : ''}
      <div class="trip-sum"><span><small>Viajes</small><b>${list.length}</b></span><span><small>Tarifas</small><b>${money(sum((t) => t.fare))}</b></span><span><small>Comisiones</small><b class="pos">${money(sum((t) => t.finalCommission))}</b></span><span><small>Gastos</small><b>${money(sum((t) => t.travelExpenses))}</b></span></div>
      <button type="button" class="add-btn" data-new="viaje">${icon.plus}<span>Registrar viaje</span></button>
      ${list.length ? `<div class="trip-list">${list.map((t) => tripCard(t, r.cutoff)).join('')}</div>` : `<div class="empty"><p>${trips.length ? 'No hay viajes con ese filtro.' : 'Aún no hay viajes registrados para este operador.'}</p></div>`}`;
  }
  function loansTab(loans, r) {
    return `<div class="total-line"><span>Total de préstamos</span><b class="neg">${money(-r.stats.loanTotal)}</b></div>
      <button type="button" class="add-btn" data-new="prestamo">${icon.plus}<span>Registrar préstamo</span></button>
      ${loans.length ? `<div class="list">${loans.map((l) => `<button type="button" class="row" data-loan="${esc(l.id)}"><span class="row-tx"><span class="row-l1"><b>${esc(l.concept)}</b></span><span class="row-l3">${esc(fmtDate(l.date))}${l.notes ? ' | ' + esc(l.notes) : ''}${l.date > r.cutoff ? ' | Después del corte' : ''}</span></span><b class="neg mono">${money(-l.amount)}</b></button>`).join('')}</div>`
    : '<div class="empty"><p>No hay préstamos registrados.</p></div>'}`;
  }
  function movesTab(rec, r) {
    const all = movementsOf(rec, r), list = filterMovements(all, mfilter);
    return `<div class="chips filters">${MOVE_FILTERS.map(([k, l]) => `<button type="button" class="chip${mfilter === k ? ' on' : ''}" data-mf="${k}">${l}</button>`).join('')}</div>
      <button type="button" class="add-btn" data-new="ajuste">${icon.edit}<span>Registrar ajuste</span></button>
      ${list.length ? `<div class="list mv-list">${list.slice(0, 300).map(moveRow).join('')}</div>${list.length > 300 ? `<p class="grp-note center">Se muestran los 300 más recientes de ${list.length}.</p>` : ''}` : '<div class="empty"><p>No hay movimientos con ese filtro.</p></div>'}`;
  }

  const refresh = () => render();
  on(root, 'click', '[data-back]', () => back('/operadores'));
  on(root, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; setSetting('opTab', tab); render(); });
  on(root, 'click', '[data-tdiv]', (e, b) => { tdiv = b.dataset.tdiv; render(); });
  on(root, 'click', '[data-tper]', (e, b) => { tper = b.dataset.tper; render(); });
  on(root, 'click', '[data-mf]', (e, b) => { mfilter = b.dataset.mf; render(); });
  root.addEventListener('change', (e) => { const t = e.target; if (t.dataset.tc) { tcustom[t.dataset.tc] = t.value; render(); } });
  on(root, 'click', '[data-new]', (e, b) => {
    const k = b.dataset.new;
    if (k === 'viaje') openTripForm(op, null, refresh);
    if (k === 'prestamo') openLoanForm(op, null, refresh);
    if (k === 'ajuste') openAdjustmentForm(op, null, refresh);
  });
  on(root, 'click', '[data-settings]', () => openSettingsForm(op, refresh));
  on(root, 'click', '[data-stmt]', () => go(`/operadores/${id}/estado`));
  on(root, 'click', '[data-trip]', (e, b) => { const t = ops.recordsOf(id).trips.find((x) => x.id === b.dataset.trip); if (t) openTripDetail(op, t, refresh); });
  on(root, 'click', '[data-loan]', (e, b) => { const l = ops.recordsOf(id).loans.find((x) => x.id === b.dataset.loan); if (l) openLoanForm(op, l, refresh); });
  on(root, 'click', '[data-mv]', (e, b) => {
    const rec = ops.recordsOf(id), k = b.dataset.mv, mid = b.dataset.id;
    if (k === 'viaje') { const t = rec.trips.find((x) => x.id === mid); if (t) openTripDetail(op, t, refresh); }
    if (k === 'prestamo') { const l = rec.loans.find((x) => x.id === mid); if (l) openLoanForm(op, l, refresh); }
    if (k === 'ajuste') { const a = rec.adjustments.find((x) => x.id === mid); if (a) openAdjustmentForm(op, a, refresh); }
  });
  on(root, 'click', '[data-more]', async () => {
    const v = await actionSheet({ title: op.name, actions: [{ label: 'Editar configuración', value: 'cfg' }, { label: 'Exportar movimientos (CSV)', value: 'csv' }] });
    if (v === 'cfg') openSettingsForm(op, refresh);
    if (v === 'csv') exportOperatorSheet(op);
  });
  render();
  if (q && q.get('nuevo') === 'viaje') s.mounted = () => setTimeout(() => openTripForm(op, null, refresh), 250);
  return s;
}

/* ===== Exportaciones (CSV para Excel; montos con 2 decimales) ===== */
const csvCell = (v) => { const t = String(v ?? ''); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const num = (c) => (Math.round(c) / 100).toFixed(2);
function csvFile(rows, name) { return new File(['\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], name, { type: 'text/csv' }); }
async function deliver(file) {
  const r = await shareFile(file, { title: file.name });
  if (r === 'unsupported' || r === 'error') downloadBlob(file, file.name);
  if (r !== 'cancelled') toast('Archivo exportado: ' + file.name);
}
function exportOperatorSheet(op) {
  const rec = ops.recordsOf(op.id), r = computeOperator(rec);
  const rows = [
    ['Operador', op.name], ['Empresa', op.companyShort], ['Fecha de inicio', fmtDate(r.settings.startDate)], ['Calcular hasta', fmtDate(r.cutoff)],
    ['Sábados contabilizados', r.sat.count, r.sat.manual ? 'Ajuste manual' : 'Automático'], ['Monto semanal', num(r.sat.weekly)],
    [], ['Fórmula', 'Balance = Comisiones - Sábados pagados - Gastos de viaje - Préstamos'],
    ['Comisiones', num(r.comp.commissions)], ['Sábados pagados', num(r.comp.saturdaysPaid)], ['Gastos de viaje', num(r.comp.expenses)], ['Préstamos', num(r.comp.loans)], ['Balance actual', num(r.balance)],
    [], ['Fecha', 'Tipo', 'Concepto', 'División', 'Tarifa', 'Comisión', 'Gastos', 'Efecto en balance', 'Después del corte'],
    ...movementsOf(rec, r).filter((m) => m.kind !== 'config').map((m) => [fmtDate(m.date), { sabado: 'Sábado pagado', prestamo: 'Préstamo', viaje: 'Viaje', ajuste: 'Ajuste' }[m.kind], m.kind === 'sabado' && m.manual ? `${m.count} sábados (manual)` : m.title,
      m.division ? (m.division === 'campo' ? 'Campo' : 'Puerto') : '', m.fare != null ? num(m.fare) : '', m.commission != null ? num(m.commission) : '', m.expenses != null ? num(m.expenses) : '', num(m.amount), m.after ? 'Sí' : '']),
  ];
  deliver(csvFile(rows, `Operador-${op.name.replace(/\s+/g, '_')}-${todayStr()}.csv`));
}

/* ===== Resumen general ===== */
export async function summaryScreen() {
  let per = 'todo', custom = { from: '', to: '' };
  const s = screen('<div class="page"></div>');
  const root = s.el;
  function data() {
    const range = periodRange(per, custom);
    const list = ops.operatorList().map((o) => ({ o, r: ops.computeFor(o.id, range) }));
    return { range, list, total: aggregate(list.map((x) => x.r)) };
  }
  function render() {
    const { range, list, total } = data();
    const manualNote = list.some((x) => x.r.sat.manualIgnored);
    root.innerHTML = `
      <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Operadores</span></button></header>
      <h1 class="title">Resumen de operadores</h1>
      <div class="chips filters">${PERIODS.map(([k, l]) => `<button type="button" class="chip${per === k ? ' on' : ''}" data-per="${k}">${l}</button>`).join('')}</div>
      ${per === 'custom' ? `<div class="row2 period-custom"><label class="fld"><span class="fl">Desde</span><input class="in" type="date" data-c="from" value="${esc(custom.from)}"></label><label class="fld"><span class="fl">Hasta</span><input class="in" type="date" data-c="to" value="${esc(custom.to)}"></label></div>` : ''}
      ${balanceCard(total, { title: 'Balance acumulado', sub: range.from || range.to ? `Periodo ${esc(fmtDate(range.from) || 'inicio')} a ${esc(fmtDate(range.to) || 'hoy')}` : 'Todos los operadores, al corte de cada uno' })}
      <div class="tiles">
        <div class="tile"><small>Viajes</small><b>${total.stats.trips}</b></div>
        <div class="tile"><small>Puerto</small><b>${total.stats.puerto}</b></div>
        <div class="tile"><small>Campo</small><b>${total.stats.campo}</b></div>
        <div class="tile wide"><small>Tarifas acumuladas</small><b>${money(total.stats.fares)}</b></div>
        <div class="tile wide"><small>Comisiones ampliadas aplicadas</small><b>${total.stats.expanded}${total.stats.expandedAmount ? ` <span class="muted">| ${money(total.stats.expandedAmount, { sign: true })}</span>` : ''}</b></div>
      </div>
      ${manualNote ? '<p class="grp-note">En periodos parciales, los sábados de operadores con ajuste manual se calculan automáticamente dentro del periodo.</p>' : ''}
      <div class="sec-hrow"><h2 class="sec-h">Por operador</h2><button type="button" class="btn-ghost sm" data-csv>${icon.download}<span>Exportar CSV</span></button></div>
      <div class="list">${list.map(({ o, r }) => `<a class="row op-row" href="#/operadores/${esc(o.id)}"><span class="av">${esc(initials(o.name))}</span>
        <span class="row-tx"><span class="row-l1"><b>${esc(o.name)}</b></span><span class="row-l2">${plural(r.stats.trips, 'viaje', 'viajes')} | ${money(r.comp.commissions)} comisiones</span></span>
        <span class="op-bal ${amtCls(r.balance)}"><small>Balance</small><b>${money(r.balance)}</b></span></a>`).join('') || '<div class="empty"><p>No hay operadores.</p></div>'}</div>`;
  }
  on(root, 'click', '[data-back]', () => back('/operadores'));
  on(root, 'click', '[data-per]', (e, b) => { per = b.dataset.per; render(); });
  root.addEventListener('change', (e) => { const t = e.target; if (t.dataset.c) { custom[t.dataset.c] = t.value; render(); } });
  on(root, 'click', '[data-csv]', () => {
    const { range, list, total } = data();
    const head = ['Operador', 'Empresa', 'Fecha de inicio', 'Corte', 'Viajes', 'Puerto', 'Campo', 'Tarifas', 'Comisiones', 'Comisiones ampliadas', 'Sábados contabilizados', 'Monto semanal', 'Sábados pagados', 'Gastos de viaje', 'Préstamos', 'Balance'];
    const rows = [
      ['Resumen de operadores', range.from || range.to ? `${fmtDate(range.from) || 'inicio'} a ${fmtDate(range.to) || 'hoy'}` : 'Todo'],
      ['Fórmula', 'Balance = Comisiones - Sábados pagados - Gastos de viaje - Préstamos'], [], head,
      ...list.map(({ o, r }) => [o.name, o.companyShort, fmtDate(r.settings.startDate), fmtDate(r.cutoff), r.stats.trips, r.stats.puerto, r.stats.campo, num(r.stats.fares), num(r.comp.commissions), r.stats.expanded, r.sat.count, num(r.sat.weekly), num(r.comp.saturdaysPaid), num(r.comp.expenses), num(r.comp.loans), num(r.balance)]),
      ['TOTAL', '', '', '', total.stats.trips, total.stats.puerto, total.stats.campo, num(total.stats.fares), num(total.comp.commissions), total.stats.expanded, total.stats.saturdays, '', num(total.comp.saturdaysPaid), num(total.comp.expenses), num(total.comp.loans), num(total.balance)],
    ];
    deliver(csvFile(rows, `Resumen-operadores-${todayStr()}.csv`));
  });
  render();
  return s;
}
