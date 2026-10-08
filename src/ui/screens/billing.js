/*
 * Cobranza (#/cobranza) — viajes registrados en Operadores, separados por división, con su estado de cobro
 * y sus demoras en planta. Cada viaje y cada demora están «por cobrar» o «pagados».
 * El importe de un viaje es su total después de impuestos (su tarifa, si no tiene impuestos). Los totales se derivan con summarize() (domain/billing/billing.js).
 */
import { screen, on } from '../../core/dom.js';
import { back } from '../../core/router.js';
import * as billing from '../../services/billing.js';
import { getSetting, setSetting } from '../../services/settings.js';
import { esc } from '../../domain/shared/format.js';
import { money, centsInput } from '../../domain/operators/money.js';
import { PERIODS, periodRange, fmtDate, fmtDateShort, todayStr, isDate } from '../../domain/operators/balance.js';
import { STATUS_FILTERS, DIVISIONS, DELAY_CONCEPT, filterItems, summarize } from '../../domain/billing/billing.js';
import { icon } from '../components/icons.js';
import { openSheet, confirmDestructive } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { formSheet, fail, readMoney, moneyIn, openTripForm } from './operatorForms.js';
import { operatorById, setTripsTaxes } from '../../services/operators.js';
import { tripTaxes, computeTaxes } from '../../domain/operators/taxes.js';
import { attachCount } from './tripDocs.js';

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const payTag = (paid, f = false) => `<span class="pay-tag ${paid ? 'paid' : 'due'}">${paid ? (f ? 'Pagada' : 'Pagado') : 'Por cobrar'}</span>`;
const paidLine = (x) => `${fmtDate(x.paidDate) ? 'Pago del ' + fmtDate(x.paidDate) : 'Sin fecha de pago registrada'}${x.reference ? ' | Ref. de pago ' + x.reference : ''}`;

/* sel: null fuera del modo «marcar varios»; true/false = viaje seleccionado o no */
function card(it, sel = null) {
  return `<button type="button" class="trip-card cob-card${sel == null ? '' : ' selectable'}${sel ? ' checked' : ''}" data-trip="${esc(it.id)}"${sel == null ? '' : ` aria-pressed="${!!sel}"`}>
    <span class="tc-top">${sel == null ? '' : `<span class="cob-check">${icon.check}</span>`}${payTag(it.paid)}${it.tripRef ? `<span class="ref-tag">${esc(it.tripRef)}</span>` : ''}${it.delays.length ? `<span class="after-tag">${plural(it.delays.length, 'demora', 'demoras')}</span>` : ''}${attachCount(it.id)}<span class="tc-date">${esc(fmtDateShort(it.date))}</span></span>
    <b class="tc-route">${esc(it.origin)} → ${esc(it.destination)}</b>
    <span class="cob-op">${esc(it.operator)}${it.company ? ' | ' + esc(it.company) : ''}</span>
    <span class="cob-line"><span>${it.taxed ? 'Total del viaje' : 'Tarifa del viaje'}${it.taxed ? `<small>Tarifa base ${money(it.fareBase)} más impuestos</small>` : ''}${it.paid ? `<small>${esc(paidLine(it))}</small>` : ''}</span><b>${money(it.amount)}</b></span>
    ${it.delays.map((d) => `<span class="cob-line delay"><span>${esc(d.concept)} ${payTag(d.paid, true)}<small>${esc(fmtDate(d.date))}${d.paid ? ' | ' + esc(paidLine(d)) : ''}</small></span><b>${money(d.amount)}</b></span>`).join('')}
  </button>`;
}

export async function billingScreen() {
  await billing.loadBilling();
  let div = getSetting('cobDiv', 'puerto') === 'campo' ? 'campo' : 'puerto';
  let status = 'todos', per = 'todo', text = '', shown = 30;
  /* Modo «seleccionar varios»: se eligen viajes de la lista filtrada para marcarlos pagados o cambiarles impuestos */
  let selecting = false, pool = [];
  const sel = new Set();
  const custom = { from: '', to: '' };
  const s = screen(`<div class="page cob-page">
    <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Administración</span></button>
      <a class="btn-ghost sm" href="#/cobranza/reporte">${icon.file}<span>Reporte PDF</span></a></header>
    <h1 class="title">Cobranza</h1>
    <div class="seg wide" role="tablist">${DIVISIONS.map(([k, l]) => `<button type="button" class="seg-b" data-div="${k}" role="tab">${l}</button>`).join('')}</div>
    <div data-sum></div>
    <label class="search"><span class="search-ic">${icon.search}</span><input type="search" class="search-in" placeholder="Buscar referencia, operador o ruta" autocomplete="off" autocorrect="off" enterkeyhint="search"></label>
    <div class="chips filters">${STATUS_FILTERS.map(([k, l]) => `<button type="button" class="chip" data-st="${k}">${l}</button>`).join('')}</div>
    <div class="chips filters">${PERIODS.map(([k, l]) => `<button type="button" class="chip" data-per="${k}">${l}</button>`).join('')}</div>
    <div class="row2 period-custom" data-custom hidden><label class="fld"><span class="fl">Desde</span><input class="in" type="date" data-c="from"></label><label class="fld"><span class="fl">Hasta</span><input class="in" type="date" data-c="to"></label></div>
    <div data-list></div>
    <p class="grp-note center">Los viajes provienen de <a href="#/operadores">Administración → Operadores</a>. El importe por cobrar de cada viaje es su total después de impuestos (su tarifa, si no tiene impuestos).</p>
  </div>`);
  const root = s.el, listEl = root.querySelector('[data-list]'), sumEl = root.querySelector('[data-sum]');

  function draw() {
    const all = billing.items(), range = periodRange(per, custom);
    const scoped = filterItems(all, { division: div, from: range.from, to: range.to, text });
    let list = filterItems(scoped, { status });
    const dueN = list.filter((it) => !it.paid).length;
    if (selecting && !list.length) { selecting = false; sel.clear(); }
    if (selecting) {
      pool = list;
      const ids = new Set(list.map((it) => it.id)); [...sel].forEach((id) => { if (!ids.has(id)) sel.delete(id); });
    }
    const sm = summarize(scoped);
    root.querySelectorAll('[data-div]').forEach((b) => { const on1 = b.dataset.div === div; b.classList.toggle('on', on1); b.setAttribute('aria-selected', on1); });
    root.querySelectorAll('[data-st]').forEach((b) => b.classList.toggle('on', b.dataset.st === status));
    root.querySelectorAll('[data-per]').forEach((b) => b.classList.toggle('on', b.dataset.per === per));
    root.querySelector('[data-custom]').hidden = per !== 'custom';
    const tile = (label, g, cls, a, b) => `<div class="tile"><small>${label}</small><b class="${g.amount ? cls : ''}">${money(g.amount)}</b><small>${plural(g.n, a, b)}</small></div>`;
    sumEl.innerHTML = `<div class="tiles four cob-tiles">
        ${tile('Viajes por cobrar', sm.trips.due, 'cob-due', 'viaje', 'viajes')}${tile('Viajes pagados', sm.trips.paid, 'pos', 'viaje', 'viajes')}
        ${tile('Demoras por cobrar', sm.delays.due, 'cob-due', 'demora', 'demoras')}${tile('Demoras pagadas', sm.delays.paid, 'pos', 'demora', 'demoras')}
      </div>
      <div class="total-line cob-total"><span>Total por cobrar | ${div === 'campo' ? 'Campo' : 'Puerto'}</span><b class="${sm.due ? 'cob-due' : ''}">${money(sm.due)}</b></div>`;
    const none = !all.some((it) => it.division === div);
    const picked = pool.filter((it) => sel.has(it.id)), selAmount = picked.reduce((a, it) => a + it.amount, 0), selDue = picked.filter((it) => !it.paid).length;
    const head = selecting
      ? `<div class="cob-selbar"><div class="sb-info"><b>${plural(sel.size, 'viaje seleccionado', 'viajes seleccionados')}</b><b class="mono">${money(selAmount)}</b></div>
          <div class="sb-acts"><button type="button" class="btn-ghost sm" data-selall>${sel.size === list.length ? 'Quitar selección' : `Seleccionar los ${list.length}`}</button><button type="button" class="btn-ghost sm" data-selcancel>Cancelar</button><button type="button" class="btn-secondary sm" data-seltax ${sel.size ? '' : 'disabled'}>${icon.edit}<span>Impuestos</span></button><button type="button" class="btn-primary sm" data-selpay ${selDue ? '' : 'disabled'}>${icon.check}<span>Marcar pagados${selDue && selDue !== sel.size ? ` (${selDue})` : ''}</span></button></div>
          ${sel.size ? (selDue !== sel.size ? `<small>${plural(sel.size - selDue, 'viaje seleccionado ya está pagado', 'viajes seleccionados ya están pagados')}: «Marcar pagados» no ${sel.size - selDue === 1 ? 'lo' : 'los'} toca.</small>` : '') : '<small>Toca los viajes que quieras. Puedes aplicarles impuestos o marcarlos como pagados. Los filtros de arriba acotan la lista.</small>'}</div>`
      : `<div class="sec-hrow"><h2 class="sec-h">${plural(list.length, 'viaje', 'viajes')}</h2>${list.length > 1 ? `<button type="button" class="btn-ghost sm" data-selmode>${icon.check}<span>Seleccionar varios</span></button>` : ''}</div>`;
    listEl.innerHTML = list.length
      ? `${head}<div class="trip-list">${list.slice(0, shown).map((it) => card(it, selecting ? sel.has(it.id) : null)).join('')}</div>${list.length > shown ? `<button type="button" class="btn-ghost block" data-more>Mostrar más (${list.length - shown})</button>` : ''}`
      : `<div class="empty"><p>${none ? `Aún no hay viajes de División ${div === 'campo' ? 'Campo' : 'Puerto'} registrados en Operadores.` : 'No hay viajes con ese filtro.'}</p></div>`;
  }

  on(root, 'click', '[data-back]', () => back('/administracion'));
  on(root, 'click', '[data-div]', (e, b) => { div = b.dataset.div; shown = 30; setSetting('cobDiv', div); draw(); });
  on(root, 'click', '[data-st]', (e, b) => { status = b.dataset.st; shown = 30; draw(); });
  on(root, 'click', '[data-per]', (e, b) => { per = b.dataset.per; shown = 30; draw(); });
  on(root, 'click', '[data-more]', () => { shown += 30; draw(); });
  on(root, 'click', '[data-trip]', (e, b) => {
    if (!selecting) { openBillingDetail(b.dataset.trip, draw); return; }
    const id = b.dataset.trip; if (sel.has(id)) sel.delete(id); else sel.add(id);
    draw();
  });
  on(root, 'click', '[data-selmode]', () => { selecting = true; sel.clear(); draw(); });
  on(root, 'click', '[data-selcancel]', () => { selecting = false; sel.clear(); draw(); });
  on(root, 'click', '[data-selall]', () => { if (sel.size === pool.length) sel.clear(); else pool.forEach((it) => sel.add(it.id)); draw(); });
  on(root, 'click', '[data-seltax]', () => {
    const chosen = pool.filter((it) => sel.has(it.id));
    if (chosen.length) openBulkTaxForm(chosen, () => { selecting = false; sel.clear(); draw(); });
  });
  on(root, 'click', '[data-selpay]', () => {
    const chosen = pool.filter((it) => sel.has(it.id) && !it.paid);
    if (chosen.length) openBulkPaymentForm(chosen, () => { selecting = false; sel.clear(); draw(); });
  });
  root.addEventListener('change', (e) => { const t = e.target; if (t.dataset.c) { custom[t.dataset.c] = t.value; draw(); } });
  root.querySelector('.search-in').addEventListener('input', (e) => { text = e.target.value.trim(); shown = 30; draw(); });
  draw();
  return s;
}

/* ===== Detalle de cobranza de un viaje ===== */
/* pay: abre de una vez el registro del pago si el viaje sigue por cobrar (acceso directo desde la ficha del operador) */
export function openBillingDetail(tripId, onChange, { pay = false } = {}) {
  const sh = openSheet({ title: 'Cobranza del viaje', body: '<div data-d></div>', full: true, className: 'form-sheet' });
  const box = sh.body.querySelector('[data-d]');
  const changed = () => { paint(); onChange && onChange(); };
  function paint() {
    const it = billing.itemOf(tripId);
    if (!it) { sh.close(); return; }
    const rows = [...(it.tripRef ? [['Referencia', it.tripRef]] : []), ['Operador', it.operator + (it.company ? ' | ' + it.company : '')], ['División', it.division === 'campo' ? 'Campo' : 'Puerto'], ['Fecha del viaje', fmtDate(it.date)], ['Ruta', `${it.origin} → ${it.destination}`]];
    box.innerHTML = `<dl class="sumlist detail">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <h3 class="pk-h">Importe del viaje</h3>
      ${(() => {
        const x = tripTaxes(it.trip);
        const fr = [['Tarifa base', money(x.fareBase)], [`IVA ${x.vatRate}%`, x.applyVat ? money(x.vatAmount, { sign: true }) : 'No aplicado'], [`ISR ${x.isrRate}%`, x.applyIsr ? money(-x.isrAmount) : 'No aplicado'],
          [`Retención IVA ${x.vatWithholdingRate}%`, x.applyVatWithholding ? money(-x.vatWithholdingAmount) : 'No aplicada']];
        return `<dl class="sumlist detail">${fr.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}<div><dt>Total después de impuestos</dt><dd><b>${money(x.totalAfterTaxes)}</b></dd></div></dl>`;
      })()}
      <button type="button" class="btn-secondary block" data-edittrip>${icon.edit}<span>Editar viaje e impuestos</span></button>
      <p class="grp-note">Los impuestos cambian el total por cobrar. La comisión del operador se calcula siempre sobre la tarifa base.</p>
      <h3 class="pk-h">Cobro del viaje</h3>
      <div class="cob-state ${it.paid ? 'paid' : 'due'}"><span>${payTag(it.paid)}<small>${it.paid ? esc(paidLine(it)) : it.taxed ? `Total después de impuestos | tarifa base ${money(it.fareBase)}` : 'Tarifa del viaje'}</small></span><b>${money(it.amount)}</b></div>
      ${it.notes ? `<p class="detail-notes">${esc(it.notes)}</p>` : ''}
      ${it.paid
        ? `<div class="sheet-acts"><button type="button" class="btn-secondary" data-pay>${icon.edit}<span>Editar pago</span></button><button type="button" class="btn-secondary" data-unpay>${icon.refresh}<span>Quitar pago</span></button></div>`
        : `<button type="button" class="btn-primary block" data-pay>${icon.check}<span>Registrar pago del viaje</span></button>`}
      <h3 class="pk-h">Demoras en planta</h3>
      ${it.delays.length ? `<div class="list">${it.delays.map((d) => `<button type="button" class="row" data-delay="${esc(d.id)}"><span class="row-tx"><span class="row-l1"><b>${esc(d.concept)}</b>${payTag(d.paid, true)}</span><span class="row-l3">${esc(fmtDate(d.date))}${d.paid ? ' | ' + esc(paidLine(d)) : ''}${d.notes ? ' | ' + esc(d.notes) : ''}</span></span><b class="mono">${money(d.amount)}</b></button>`).join('')}</div>` : '<p class="grp-note">Este viaje no tiene demoras registradas.</p>'}
      <button type="button" class="add-btn" data-newdelay>${icon.plus}<span>Registrar demora en planta</span></button>`;
  }
  on(box, 'click', '[data-edittrip]', () => {
    const it = billing.itemOf(tripId), op = it && operatorById(it.operatorId);
    if (!op) { toast('El operador de este viaje ya no está en el catálogo; no se puede editar desde aquí.', { type: 'warn', ms: 4500 }); return; }
    openTripForm(op, it.trip, changed, { focus: 'taxes' });
  });
  on(box, 'click', '[data-pay]', () => { const it = billing.itemOf(tripId); if (it) openPaymentForm(it, changed); });
  on(box, 'click', '[data-unpay]', async () => {
    const it = billing.itemOf(tripId); if (!it) return;
    if (!(await confirmDestructive('¿Volver este viaje a «por cobrar»?', `${it.origin} → ${it.destination}, ${money(it.amount)}. Se quitan la fecha y la referencia del pago.`, 'Marcar por cobrar'))) return;
    try { await billing.setTripPayment(tripId, { paid: false, notes: it.notes }); } catch (e) { toast(e.message || 'No se pudo guardar.', { type: 'warn' }); return; }
    toast('Viaje marcado por cobrar', { type: 'info' }); changed();
  });
  on(box, 'click', '[data-newdelay]', () => { const it = billing.itemOf(tripId); if (it) openDelayForm(it, null, changed); });
  on(box, 'click', '[data-delay]', (e, b) => { const it = billing.itemOf(tripId), d = it && it.delays.find((x) => x.id === b.dataset.delay); if (d) openDelayForm(it, d, changed); });
  paint();
  if (pay) { const it = billing.itemOf(tripId); if (it && !it.paid) openPaymentForm(it, changed); }
}

const dateFld = (name, label, value) => `<label class="fld" data-f="${name}"><span class="fl">${label}</span><input class="in" type="date" name="${name}" value="${esc(value || '')}"><span class="ferr"></span></label>`;
const tripWho = (it) => `<div class="op-who"><div><small>${it.division === 'campo' ? 'Campo' : 'Puerto'} | ${esc(fmtDate(it.date))} | ${esc(it.operator)}${it.tripRef ? ' | Ref. ' + esc(it.tripRef) : ''}</small><b>${esc(it.origin)} → ${esc(it.destination)}</b></div></div>`;

function openPaymentForm(it, onSaved) {
  formSheet({
    title: it.paid ? 'Editar pago del viaje' : 'Registrar pago del viaje', saveLabel: it.paid ? 'Guardar cambios' : 'Marcar como pagado',
    html: `${tripWho(it)}
      <div class="cob-state due"><span><small>${it.taxed ? 'Importe del viaje (total después de impuestos)' : 'Importe del viaje (tarifa)'}</small></span><b>${money(it.amount)}</b></div>
      ${dateFld('paidDate', 'Fecha de pago', it.paidDate || todayStr())}
      <label class="fld"><span class="fl">Referencia del pago (opcional)</span><input class="in" name="reference" value="${esc(it.reference)}" placeholder="Factura, transferencia o folio" autocomplete="off" enterkeyhint="next"></label>
      <label class="fld"><span class="fl">Observaciones (opcional)</span><textarea class="in" name="notes" rows="2">${esc(it.notes)}</textarea></label>`,
    async onSubmit(f, sh) {
      if (!isDate(f.elements.paidDate.value)) return fail(f, 'paidDate', 'La fecha de pago no es válida.');
      try { await billing.setTripPayment(it.id, { paid: true, paidDate: f.elements.paidDate.value, reference: f.elements.reference.value.trim(), notes: f.elements.notes.value.trim() }); }
      catch (e) { toast(e.message || 'No se pudo guardar el pago.', { type: 'warn' }); return false; }
      sh.close(); toast(it.paid ? 'Pago actualizado' : `Viaje pagado | ${money(it.amount)}`); onSaved && onSaved(); return true;
    },
  });
}

/*
 * Impuestos de varios viajes a la vez. Cada concepto se deja «sin cambiar», se aplica o se quita en todos los
 * seleccionados; lo que no se toca conserva la configuración de cada viaje. La comisión nunca cambia.
 */
function openBulkTaxForm(chosen, onSaved) {
  const n = chosen.length, change = { applyVat: null, applyIsr: null, applyVatWithholding: null };
  const ROWS = [['applyVat', 'IVA 16%', 'Se suma al total'], ['applyIsr', 'ISR 4%', 'Retención: se resta del total'], ['applyVatWithholding', 'Retención IVA 4%', 'Solo cuando aplique; nunca se activa sola']];
  const result = (it) => { const cur = tripTaxes(it.trip), pick = (k) => (typeof change[k] === 'boolean' ? change[k] : cur[k]); return computeTaxes(it.trip.fare, { applyVat: pick('applyVat'), applyIsr: pick('applyIsr'), applyVatWithholding: pick('applyVatWithholding') }, it.trip); };
  const differs = (it) => { const a = tripTaxes(it.trip), b = result(it); return a.applyVat !== b.applyVat || a.applyIsr !== b.applyIsr || a.applyVatWithholding !== b.applyVatWithholding; };
  const { form } = formSheet({
    title: 'Impuestos de varios viajes', saveLabel: `Aplicar a ${plural(n, 'viaje', 'viajes')}`,
    html: `<div class="cob-state due"><span><b>${plural(n, 'viaje seleccionado', 'viajes seleccionados')}</b><small>Tarifas base</small></span><b>${money(chosen.reduce((a, it) => a + it.fareBase, 0))}</b></div>
      ${ROWS.map(([k, l, sub]) => `<div class="fld"><span class="fl">${l}</span><div class="seg" data-tax="${k}">${[['', 'No cambiar'], ['1', 'Aplicar'], ['0', 'Quitar']].map(([v, t]) => `<button type="button" class="seg-b${v === '' ? ' on' : ''}" data-v="${v}" aria-pressed="${v === ''}">${t}</button>`).join('')}</div><span class="fhint">${sub}</span></div>`).join('')}
      <section class="cm-prev" data-bprev aria-live="polite"></section>
      <p class="grp-note">Cada impuesto se calcula sobre la tarifa base de cada viaje. La comisión de los operadores y sus balances no cambian. Para corregir un viaje en particular, ábrelo y usa «Editar viaje e impuestos».</p>`,
    async onSubmit(f, sh) {
      if (Object.values(change).every((v) => v === null)) { toast('Elige al menos un impuesto para aplicar o quitar.', { type: 'warn', ms: 3500 }); return false; }
      let done = 0;
      try { done = await setTripsTaxes(chosen.map((it) => it.id), change); }
      catch (e) { toast(e.message || 'No se pudieron actualizar todos los viajes. Revisa la lista.', { type: 'warn', ms: 4500 }); onSaved && onSaved(); return false; }
      sh.close(); toast(done ? `Impuestos actualizados en ${plural(done, 'viaje', 'viajes')}` : 'Los viajes ya tenían esa configuración', { type: done ? 'ok' : 'info' }); onSaved && onSaved(); return true;
    },
  });
  const prev = form.querySelector('[data-bprev]');
  function preview() {
    const before = chosen.reduce((a, it) => a + tripTaxes(it.trip).totalAfterTaxes, 0), r = chosen.map(result), sum = (k) => r.reduce((a, x) => a + x[k], 0), after = sum('totalAfterTaxes');
    const nChange = chosen.filter(differs).length;
    prev.innerHTML = `<div class="cm-head"><span>Resultado en ${n === 1 ? 'el viaje' : `los ${n} viajes`}</span></div>
      <dl class="cm-rows fin"><div><dt>Tarifas base</dt><dd>${money(sum('fareBase'))}</dd></div>
        <div><dt>IVA</dt><dd>${money(sum('vatAmount'), { sign: true })}</dd></div><div><dt>ISR</dt><dd>${money(-sum('isrAmount'))}</dd></div><div><dt>Retención IVA</dt><dd>${money(-sum('vatWithholdingAmount'))}</dd></div>
        <div class="tot"><dt>Total después de impuestos</dt><dd><b>${money(after)}</b></dd></div></dl>
      <p class="cm-note">${after === before ? 'El total no cambia' : `Total actual: ${money(before)} | diferencia ${money(after - before, { sign: true })}`}. ${nChange ? plural(nChange, 'viaje cambia', 'viajes cambian') : 'Ningún viaje cambia'}${nChange && nChange !== n ? `; ${plural(n - nChange, 'ya está así', 'ya están así')}` : ''}.</p>`;
  }
  form.querySelectorAll('[data-tax] .seg-b').forEach((b) => b.addEventListener('click', () => {
    const k = b.parentElement.dataset.tax, v = b.dataset.v;
    change[k] = v === '' ? null : v === '1';
    b.parentElement.querySelectorAll('.seg-b').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    preview();
  }));
  preview();
}

/* Pago de varios viajes a la vez: misma fecha y misma referencia de pago para todos */
function openBulkPaymentForm(chosen, onSaved) {
  const total = chosen.reduce((a, it) => a + it.amount, 0), n = chosen.length;
  const withDelays = chosen.filter((it) => it.delays.some((d) => !d.paid)).length;
  formSheet({
    title: 'Marcar viajes como pagados', saveLabel: `Marcar ${plural(n, 'viaje', 'viajes')} como ${n === 1 ? 'pagado' : 'pagados'}`,
    html: `<div class="cob-state due"><span><b>${plural(n, 'viaje', 'viajes')}</b><small>Importe total</small></span><b>${money(total)}</b></div>
      ${dateFld('paidDate', 'Fecha de pago', todayStr())}
      <label class="fld"><span class="fl">Referencia del pago (opcional)</span><input class="in" name="reference" placeholder="Factura, transferencia o folio" autocomplete="off"></label>
      <p class="grp-note">Se guarda la misma fecha y la misma referencia en todos los viajes seleccionados. Para corregir uno, ábrelo y usa «Editar pago» o «Quitar pago».${withDelays ? ` Las demoras en planta de ${plural(withDelays, 'viaje', 'viajes')} siguen por cobrar: se marcan aparte.` : ''}</p>`,
    async onSubmit(f, sh) {
      if (!isDate(f.elements.paidDate.value)) return fail(f, 'paidDate', 'La fecha de pago no es válida.');
      let done = 0;
      try { done = await billing.setTripsPaid(chosen.map((it) => it.id), { paidDate: f.elements.paidDate.value, reference: f.elements.reference.value.trim() }); }
      catch (e) { toast(e.message || 'No se pudieron guardar todos los pagos. Revisa la lista.', { type: 'warn', ms: 4500 }); onSaved && onSaved(); return false; }
      sh.close(); toast(`${plural(done, 'viaje marcado como pagado', 'viajes marcados como pagados')} | ${money(total)}`); onSaved && onSaved(); return true;
    },
  });
}

function openDelayForm(it, delay, onSaved) {
  const editing = !!delay;
  let paid = editing ? !!delay.paid : false;
  const { form } = formSheet({
    title: editing ? 'Demora en planta' : 'Registrar demora en planta', saveLabel: editing ? 'Guardar cambios' : 'Guardar demora',
    html: `${tripWho(it)}
      ${dateFld('date', 'Fecha de la demora', editing ? delay.date : it.date)}
      <label class="fld" data-f="concept"><span class="fl">Concepto</span><input class="in" name="concept" value="${esc(editing ? delay.concept : DELAY_CONCEPT)}" autocapitalize="sentences" autocomplete="off" enterkeyhint="next"><span class="ferr"></span></label>
      ${moneyIn('amount', 'Importe de la demora', editing ? centsInput(delay.amount) : '')}
      <label class="fld"><span class="fl">Observaciones (opcional)</span><textarea class="in" name="notes" rows="2" placeholder="Ej. 2 días en planta">${esc(editing ? delay.notes || '' : '')}</textarea></label>
      <div class="fld"><span class="fl">Estado de cobro</span><div class="seg big">${[[0, 'Por cobrar'], [1, 'Pagada']].map(([k, l]) => `<button type="button" class="seg-b${!!k === paid ? ' on' : ''}" data-paid="${k}" aria-pressed="${!!k === paid}">${l}</button>`).join('')}</div></div>
      <div data-paidbox ${paid ? '' : 'hidden'}>
        ${dateFld('paidDate', 'Fecha de pago', (editing && delay.paidDate) || todayStr())}
        <label class="fld"><span class="fl">Referencia del pago (opcional)</span><input class="in" name="reference" value="${esc(editing ? delay.reference || '' : '')}" placeholder="Factura, transferencia o folio" autocomplete="off"></label>
      </div>`,
    del: editing ? { label: 'Eliminar demora', fn: async () => {
      if (!(await confirmDestructive('¿Eliminar esta demora?', `${delay.concept}, ${money(delay.amount)} del ${fmtDate(delay.date)}. Dejará de aparecer en Cobranza.`, 'Eliminar demora'))) return false;
      try { await billing.deleteDelay(it.id, delay.id); } catch (e) { toast(e.message || 'No se pudo eliminar.', { type: 'warn' }); return false; }
      toast('Demora eliminada', { type: 'info' }); onSaved && onSaved(); return true;
    } } : null,
    async onSubmit(f, sh) {
      if (!isDate(f.elements.date.value)) return fail(f, 'date', 'La fecha de la demora no es válida.');
      const concept = f.elements.concept.value.trim();
      if (!concept) return fail(f, 'concept', 'Escribe el concepto de la demora.');
      const a = readMoney(f, 'amount', { required: true, positive: true, label: 'el importe de la demora' });
      if (a.error) return fail(f, 'amount', a.error);
      if (paid && !isDate(f.elements.paidDate.value)) return fail(f, 'paidDate', 'La fecha de pago no es válida.');
      try {
        await billing.saveDelay(it.id, { ...(editing ? { id: delay.id } : {}), date: f.elements.date.value, concept, amount: a.value, notes: f.elements.notes.value.trim(),
          paid, paidDate: f.elements.paidDate.value, reference: f.elements.reference.value.trim() });
      } catch (e) { toast(e.message || 'No se pudo guardar la demora.', { type: 'warn' }); return false; }
      sh.close(); toast(editing ? 'Demora actualizada' : 'Demora registrada'); onSaved && onSaved(); return true;
    },
  });
  form.querySelectorAll('[data-paid]').forEach((b) => b.addEventListener('click', () => {
    paid = b.dataset.paid === '1';
    form.querySelectorAll('[data-paid]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    form.querySelector('[data-paidbox]').hidden = !paid;
  }));
}
