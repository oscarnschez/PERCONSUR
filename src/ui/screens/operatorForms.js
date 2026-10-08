/*
 * Formularios del control de operadores (hojas inferiores, mobile-first).
 * Validan antes de guardar y muestran el error específico junto al campo.
 */
import * as ops from '../../services/operators.js';
import { esc } from '../../domain/shared/format.js';
import { toCents, money, centsInput, moneyClean } from '../../domain/operators/money.js';
import {
  commissionFor, ruleFromSettings, ruleFromTrip, isDate, fmtDate, todayStr, saturdaysBetween, ADJ_TARGETS, adjBalanceEffect, COMMISSION_RATE,
} from '../../domain/operators/balance.js';
import { openSheet, confirmDestructive, actionSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { icon } from '../components/icons.js';
import { enterAdvances } from '../components/fields.js';
import { loadBilling, billingOf } from '../../services/billing.js';
import { computeTaxes, tripTaxes, taxFields, defaultTaxFlags } from '../../domain/operators/taxes.js';
import { openBillingDetail } from './billing.js';
import { mountTripDocs } from './tripDocs.js';

const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const who = (op) => `<div class="op-who"><span class="av sm">${esc(initials(op.name))}</span><div><small>Operador</small><b>${esc(op.name)}</b></div></div>`;
const err = (name) => `<span class="ferr" data-err="${name}"></span>`;
export const moneyIn = (name, label, value, ph = '0.00') => `<label class="fld" data-f="${name}"><span class="fl">${label}</span><span class="money-w"><span class="money-sym">$</span><input class="in money" name="${name}" inputmode="decimal" autocomplete="off" placeholder="${ph}" value="${esc(value)}" enterkeyhint="next"></span>${err(name)}</label>`;
const dateIn = (name, label, value) => `<label class="fld" data-f="${name}"><span class="fl">${label}</span><input class="in" type="date" name="${name}" value="${esc(value || '')}"><span class="fhint warn-t" data-cuthint></span>${err(name)}</label>`;
/* Aviso en vivo si la fecha queda después del corte del operador (no contará en el balance hasta esa fecha) */
function cutoffHint(form, op) {
  const st = ops.settingsFor(op.id), cut = isDate(st.cutoffDate) ? st.cutoffDate : todayStr();
  const el = form.querySelector('[data-cuthint]'), inp = form.elements.date;
  if (!el || !inp) return;
  const upd = () => {
    el.textContent = isDate(inp.value) && inp.value > cut
      ? (isDate(st.cutoffDate) ? `Esta fecha es posterior al corte (${fmtDate(cut)}): no contará en el balance mientras el corte no la incluya.` : 'Esta fecha es posterior a hoy: contará en el balance a partir de esa fecha.')
      : '';
  };
  inp.addEventListener('input', upd); inp.addEventListener('change', upd); upd();
}

export function formSheet({ title, html, saveLabel, onSubmit, del }) {
  const form = document.createElement('form');
  form.className = 'op-form';
  form.noValidate = true;
  form.innerHTML = `${html}<div class="form-foot"><button type="submit" class="btn-primary block lg">${esc(saveLabel)}</button>
    ${del ? `<button type="button" class="btn-danger block" data-del>${icon.trash}<span>${esc(del.label)}</span></button>` : ''}</div>`;
  const sh = openSheet({ title, body: form, full: true, className: 'form-sheet' });
  enterAdvances(form);
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.classList.contains('money')) { const v = moneyClean(t.value); if (v !== t.value) t.value = v; }
    const f = t.closest('.fld'); if (f) { f.classList.remove('has-err'); const m = f.querySelector('.ferr'); if (m) m.textContent = ''; }
  });
  let saving = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    saving = true;
    try { await onSubmit(form, sh); } finally { saving = false; }
  });
  if (del) form.querySelector('[data-del]').addEventListener('click', async () => { if (await del.fn()) sh.close(); });
  return { sh, form };
}
/* Marca el primer error, lleva el foco al campo y lo anuncia */
export function fail(form, name, msg) {
  const f = form.querySelector(`[data-f="${name}"]`);
  if (f) {
    f.classList.add('has-err');
    const m = f.querySelector('.ferr'); if (m) m.textContent = msg;
    f.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const inp = f.querySelector('input,textarea,select'); if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 250);
  }
  toast(msg, { type: 'warn', ms: 3500 });
  return false;
}
/* Monto válido: no negativo, máximo 2 decimales */
export function readMoney(form, name, { required = false, positive = false, label }) {
  const raw = form.elements[name].value;
  if (/^\s*-/.test(raw)) return { error: `No se permiten montos negativos en ${label}.` };
  const c = toCents(raw);
  if (c == null) { if (required) return { error: `Escribe ${label}.` }; return { value: 0 }; }
  if (Number.isNaN(c)) return { error: `${label[0].toUpperCase() + label.slice(1)} no es un monto válido (sin signos negativos y máximo 2 decimales).` };
  if (positive && c <= 0) return { error: `${label[0].toUpperCase() + label.slice(1)} debe ser mayor a cero.` };
  return { value: c };
}

/* ===== Viaje ===== */
/* focus: 'taxes' abre el formulario directamente en la sección de impuestos (lo usa Cobranza) */
export function openTripForm(op, trip, onSaved, { focus = '' } = {}) {
  const editing = !!trip;
  const current = ruleFromSettings(ops.settingsFor(op.id));
  let rule = editing ? ruleFromTrip(trip) : current;
  let division = editing ? trip.division : 'puerto';
  /* Impuestos del viaje. En uno nuevo, la división fija los valores iniciales hasta que el usuario toque alguno;
     en uno existente se respeta lo guardado (sin datos fiscales = nada aplicado). La retención de IVA nunca se activa sola. */
  const t0 = editing ? tripTaxes(trip) : defaultTaxFlags(division);
  let tax = { applyVat: !!t0.applyVat, applyIsr: !!t0.applyIsr, applyVatWithholding: !!t0.applyVatWithholding };
  let taxTouched = editing;
  const taxRates = editing ? trip : {};
  const sug = ops.routeSuggestions();
  const differs = editing && (rule.minEnabled !== current.minEnabled || rule.minAmount !== current.minAmount);
  const html = `${who(op)}
    <div class="fld" data-f="division"><span class="fl">División</span><div class="seg big">${[['puerto', 'Puerto'], ['campo', 'Campo']].map(([k, l]) => `<button type="button" class="seg-b${division === k ? ' on' : ''}" data-div="${k}" aria-pressed="${division === k}">${l}</button>`).join('')}</div></div>
    ${dateIn('date', 'Fecha del viaje', editing ? trip.date : todayStr())}
    <label class="fld" data-f="reference"><span class="fl">Referencia (opcional)</span><input class="in" name="reference" value="${esc(editing ? trip.reference || '' : '')}" maxlength="40" autocomplete="off" autocapitalize="characters" placeholder="Ej. carta porte, contenedor o folio" enterkeyhint="next"><span class="fhint">Identifica el viaje en Operadores y en Cobranza.</span>${err('reference')}</label>
    ${sug.routes.length ? `<div class="fld"><span class="fl">Rutas usadas</span><div class="chips route-chips">${sug.routes.map((r, i) => `<button type="button" class="chip" data-route="${i}">${esc(r.origin)} → ${esc(r.destination)}</button>`).join('')}</div></div>` : ''}
    <div class="fld" data-f="origin"><span class="fl">Origen</span><input class="in" name="origin" value="${esc(editing ? trip.origin : '')}" autocomplete="off" autocapitalize="words" placeholder="Ej. Manzanillo" enterkeyhint="next"><span class="sugg" data-sugg="origin"></span>${err('origin')}</div>
    <div class="fld" data-f="destination"><span class="fl">Destino</span><input class="in" name="destination" value="${esc(editing ? trip.destination : '')}" autocomplete="off" autocapitalize="words" placeholder="Ej. Guadalajara" enterkeyhint="next"><span class="sugg" data-sugg="destination"></span>${err('destination')}</div>
    <div class="row2">${moneyIn('fare', 'Tarifa base', editing ? centsInput(trip.fare) : '')}${moneyIn('exp', 'Gastos de viaje', editing ? centsInput(trip.travelExpenses) : '')}</div>
    <div class="fld tax-box" data-f="taxes"><span class="fl">Impuestos</span>
      <p class="tax-lead">Se calculan sobre la tarifa base, que es el importe antes de impuestos.</p>
      <label class="sw-row"><span class="sw-tx">Aplicar IVA 16%<small>Se suma al total</small></span><input type="checkbox" switch class="sw" name="applyVat"${tax.applyVat ? ' checked' : ''}></label>
      <label class="sw-row"><span class="sw-tx">Aplicar ISR 4%<small>Retención: se resta del total</small></span><input type="checkbox" switch class="sw" name="applyIsr"${tax.applyIsr ? ' checked' : ''}></label>
      <label class="sw-row"><span class="sw-tx">Aplicar Retención IVA 4%<small>Activar manualmente cuando aplique</small></span><input type="checkbox" switch class="sw" name="applyVatWithholding"${tax.applyVatWithholding ? ' checked' : ''}></label>
      <span class="fhint" data-taxhint></span></div>
    <section class="cm-prev" data-prev aria-live="polite"></section>
    ${differs ? `<button type="button" class="btn-ghost sm" data-rule>${icon.refresh}<span>Aplicar la configuración actual del operador</span></button>` : ''}
    <label class="fld"><span class="fl">Observaciones (opcional)</span><textarea class="in" name="notes" rows="2" enterkeyhint="enter">${esc(editing ? trip.notes || '' : '')}</textarea></label>`;
  const { sh, form } = formSheet({
    title: editing ? 'Editar viaje' : 'Nuevo viaje', html, saveLabel: 'Guardar viaje',
    async onSubmit(f) {
      if (!isDate(f.elements.date.value)) return fail(f, 'date', 'La fecha del viaje no es válida.');
      const origin = f.elements.origin.value.trim(), destination = f.elements.destination.value.trim();
      if (!origin) return fail(f, 'origin', 'Escribe el origen del viaje.');
      if (!destination) return fail(f, 'destination', 'Escribe el destino del viaje.');
      const fare = readMoney(f, 'fare', { required: true, positive: true, label: 'la tarifa base del viaje' });
      if (fare.error) return fail(f, 'fare', fare.error);
      const exp = readMoney(f, 'exp', { label: 'el gasto de viaje' });
      if (exp.error) return fail(f, 'exp', exp.error);
      const c = commissionFor(fare.value, rule);
      try {
        await ops.saveTrip({
          ...(editing ? { id: trip.id, documentId: trip.documentId ?? null, source: trip.source || 'manual' } : {}),
          operatorId: op.id, division, date: f.elements.date.value, reference: f.elements.reference.value.trim().replace(/\s+/g, ' '), origin, destination, fare: fare.value, travelExpenses: exp.value,
          ...taxFields(fare.value, tax, taxRates),
          commissionRate: c.rate, minEnabled: !!rule.minEnabled, minAmount: rule.minAmount,
          baseCommission: c.base, expandedCommission: c.adjustment, finalCommission: c.final, isExpanded: c.expanded,
          notes: f.elements.notes.value.trim(),
        });
      } catch (e) { toast(e.message || 'No se pudo guardar el viaje.', { type: 'warn' }); return false; }
      sh.close(); toast(editing ? 'Viaje actualizado' : `Viaje guardado | comisión ${money(c.final)}`); onSaved && onSaved();
      return true;
    },
  });
  cutoffHint(form, op);
  const prev = form.querySelector('[data-prev]');
  const TAXES = ['applyVat', 'applyIsr', 'applyVatWithholding'];
  const syncTax = () => TAXES.forEach((k) => { form.elements[k].checked = !!tax[k]; });
  const taxHint = () => { form.querySelector('[data-taxhint]').textContent = !editing && division === 'campo' ? 'IVA 16% e ISR 4% se aplican por defecto en División Campo. Puedes desactivarlos para este viaje.' : ''; };
  form.addEventListener('change', (e) => { if (TAXES.includes(e.target.name)) { tax[e.target.name] = e.target.checked; taxTouched = true; preview(); } });
  taxHint();
  if (focus === 'taxes') setTimeout(() => { const box = form.querySelector('.tax-box'); if (box) box.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 350);
  function preview() {
    const fare = toCents(form.elements.fare.value), exp = toCents(form.elements.exp.value);
    if (fare == null || Number.isNaN(fare)) { prev.innerHTML = '<p class="cm-note">Escribe la tarifa base para calcular los impuestos y la comisión.</p>'; return; }
    const c = commissionFor(fare, rule);
    const tx = computeTaxes(fare, tax, taxRates);
    prev.innerHTML = `<div class="cm-head"><span>Resumen financiero</span></div>
      <dl class="cm-rows fin"><div><dt>Tarifa base</dt><dd>${money(tx.fareBase)}</dd></div>
        ${tx.applyVat ? `<div><dt>IVA ${tx.vatRate}%</dt><dd>${money(tx.vatAmount, { sign: true })}</dd></div>` : ''}${tx.applyIsr ? `<div><dt>ISR ${tx.isrRate}%</dt><dd>${money(-tx.isrAmount)}</dd></div>` : ''}${tx.applyVatWithholding ? `<div><dt>Retención IVA ${tx.vatWithholdingRate}%</dt><dd>${money(-tx.vatWithholdingAmount)}</dd></div>` : ''}${tx.any ? '' : '<div><dt>Impuestos</dt><dd>No aplicados</dd></div>'}
        <div class="tot"><dt>Total después de impuestos</dt><dd><b>${money(tx.totalAfterTaxes)}</b></dd></div></dl>
      <div class="cm-head cm-sep"><span>Comisión operador</span>${c.expanded ? '<span class="exp-tag">Comisión ampliada</span>' : `<span class="cm-rate">${c.rate}%</span>`}</div>
      <b class="cm-final">${money(c.final)}</b>
      <dl class="cm-rows"><div><dt>Comisión base ${c.rate}%</dt><dd>${money(c.base)}</dd></div>
        ${c.expanded ? `<div><dt>Ajuste (mínimo garantizado)</dt><dd class="pos">${money(c.adjustment, { sign: true })}</dd></div><div><dt>Comisión final</dt><dd><b>${money(c.final)}</b></dd></div>` : ''}</dl>
      <p class="cm-note">${rule.minEnabled ? `Comisión mínima garantizada: ${money(rule.minAmount)}.` : 'Sin comisión mínima garantizada.'} Los gastos${exp && !Number.isNaN(exp) ? ` (${money(exp)})` : ''} no se descuentan de la comisión; se restan en el balance.</p>`;
  }
  preview();
  form.addEventListener('input', (e) => { if (['fare', 'exp'].includes(e.target.name)) preview(); if (['origin', 'destination'].includes(e.target.name)) suggest(e.target.name); });
  form.querySelectorAll('[data-div]').forEach((b) => b.addEventListener('click', () => {
    division = b.dataset.div;
    form.querySelectorAll('[data-div]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    /* La división solo fija los valores iniciales: una selección manual de impuestos nunca se sobrescribe */
    if (!editing && !taxTouched) { tax = defaultTaxFlags(division); syncTax(); }
    taxHint(); preview();
  }));
  form.querySelectorAll('[data-route]').forEach((b) => b.addEventListener('click', () => {
    const r = sug.routes[+b.dataset.route]; form.elements.origin.value = r.origin; form.elements.destination.value = r.destination;
    form.querySelectorAll('.sugg').forEach((x) => { x.innerHTML = ''; });
  }));
  const rb = form.querySelector('[data-rule]');
  if (rb) rb.addEventListener('click', () => { rule = current; rb.remove(); preview(); toast('Se aplicará la configuración actual de comisión'); });
  /* Sugerencias de origen/destino (texto libre; nunca obligatorias) */
  function suggest(name) {
    const box = form.querySelector(`[data-sugg="${name}"]`), q = form.elements[name].value.trim().toLowerCase();
    const src = name === 'origin' ? sug.origins : sug.destinations;
    const list = src.filter((x) => (!q || x.toLowerCase().includes(q)) && x.toLowerCase() !== q).slice(0, 5);
    box.innerHTML = list.map((x) => `<button type="button" class="chip sm-chip" data-pick-sugg="${esc(x)}">${esc(x)}</button>`).join('');
  }
  form.addEventListener('focusin', (e) => { if (['origin', 'destination'].includes(e.target.name)) suggest(e.target.name); });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick-sugg]'); if (!b) return;
    const fld = b.closest('.fld').querySelector('input'); fld.value = b.dataset.pickSugg; b.parentElement.innerHTML = '';
  });
}

export function openTripDetail(op, trip, onChange) {
  const bill = billingOf(trip.id), paid = !!(bill && bill.paid), delays = (bill && bill.delays) || [];
  const tx = tripTaxes(trip);
  const rows = [
    ...(trip.reference ? [['Referencia', trip.reference]] : []),
    ['División', trip.division === 'campo' ? 'Campo' : 'Puerto'], ['Fecha', fmtDate(trip.date)], ['Ruta', `${trip.origin} → ${trip.destination}`],
    ['Tarifa base', money(tx.fareBase)], [`IVA ${tx.vatRate}%`, tx.applyVat ? money(tx.vatAmount, { sign: true }) : 'No aplicado'], [`ISR ${tx.isrRate}%`, tx.applyIsr ? money(-tx.isrAmount) : 'No aplicado'],
    [`Retención IVA ${tx.vatWithholdingRate}%`, tx.applyVatWithholding ? money(-tx.vatWithholdingAmount) : 'No aplicada'], ['Total después de impuestos', `<b>${money(tx.totalAfterTaxes)}</b>`],
    ['Gastos de viaje', money(trip.travelExpenses)], [`Comisión base ${trip.commissionRate ?? COMMISSION_RATE}%`, money(trip.baseCommission)],
    ['Ajuste de comisión', trip.expandedCommission ? money(trip.expandedCommission, { sign: true }) : money(0)], ['Comisión final', `<b>${money(trip.finalCommission)}</b>`],
  ];
  const meta = [
    trip.minEnabled ? `Comisión mínima garantizada al registrar: ${money(trip.minAmount)}` : 'Sin comisión mínima garantizada al registrar',
    `Registrado ${new Date(trip.createdAt).toLocaleString('es-MX')}${trip.createdBy ? ' por ' + trip.createdBy : ''}`,
    trip.updatedAt !== trip.createdAt ? `Modificado ${new Date(trip.updatedAt).toLocaleString('es-MX')}${trip.updatedBy ? ' por ' + trip.updatedBy : ''}` : '',
  ].filter(Boolean);
  const sh = openSheet({ title: 'Detalle del viaje', body: `${who(op)}
    ${trip.isExpanded ? '<span class="exp-tag lg">Comisión ampliada</span>' : ''}
    <dl class="sumlist detail">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${k === 'Comisión final' || k === 'Total después de impuestos' ? v : esc(v)}</dd></div>`).join('')}</dl>
    ${trip.notes ? `<p class="detail-notes">${esc(trip.notes)}</p>` : ''}
    <section class="td" data-tripdocs aria-label="Expediente del viaje"></section>
    <h3 class="pk-h">Cobranza</h3>
    <div class="cob-state ${paid ? 'paid' : 'due'}"><span><span class="pay-tag ${paid ? 'paid' : 'due'}">${paid ? 'Pagado' : 'Por cobrar'}</span><small>${paid ? `${fmtDate(bill.paidDate) ? 'Pago del ' + esc(fmtDate(bill.paidDate)) : 'Sin fecha de pago registrada'}${bill.reference ? ' | Ref. de pago ' + esc(bill.reference) : ''}` : tx.any ? 'Total después de impuestos' : 'Tarifa del viaje'}${delays.length ? ` | ${delays.length} demora${delays.length === 1 ? '' : 's'}` : ''}</small></span><b>${money(tx.totalAfterTaxes)}</b></div>
    <button type="button" class="${paid ? 'btn-secondary' : 'btn-primary'} block" data-cob>${icon.cash}<span>${paid ? 'Ver cobranza del viaje' : 'Registrar pago del viaje'}</span></button>
    <p class="grp-note">${meta.map(esc).join('<br>')}</p>
    <div class="sheet-acts"><button type="button" class="btn-secondary" data-edit>${icon.edit}<span>Editar</span></button><button type="button" class="btn-danger" data-del>${icon.trash}<span>Eliminar</span></button></div>` });
  /* Documento relacionado + documentos adicionales + expediente consolidado */
  mountTripDocs(sh.body.querySelector('[data-tripdocs]'), { trip, onChange });
  sh.body.querySelector('[data-edit]').addEventListener('click', () => { sh.close(); openTripForm(op, trip, onChange); });
  sh.body.querySelector('[data-cob]').addEventListener('click', async () => { await loadBilling(); sh.close(); openBillingDetail(trip.id, onChange, { pay: true }); });
  sh.body.querySelector('[data-del]').addEventListener('click', async () => {
    if (!(await confirmDestructive('¿Eliminar este viaje?', `${trip.origin} → ${trip.destination}, ${fmtDate(trip.date)}. Su comisión y sus gastos dejarán de contar en el balance. El registro se conserva en el respaldo.`, 'Eliminar viaje'))) return;
    await ops.deleteTrip(trip.id); sh.close(); toast('Viaje eliminado', { type: 'info' }); onChange && onChange();
  });
}

/* ===== Préstamo ===== */
export function openLoanForm(op, loan, onSaved) {
  const editing = !!loan;
  const { form } = formSheet({
    title: editing ? 'Préstamo' : 'Registrar préstamo', saveLabel: editing ? 'Guardar cambios' : 'Guardar préstamo',
    html: `${who(op)}${dateIn('date', 'Fecha', editing ? loan.date : todayStr())}${moneyIn('amount', 'Monto', editing ? centsInput(loan.amount) : '')}
      <label class="fld" data-f="concept"><span class="fl">Concepto</span><input class="in" name="concept" value="${esc(editing ? loan.concept : '')}" placeholder="Ej. Préstamo personal" autocapitalize="sentences" enterkeyhint="next">${err('concept')}</label>
      <label class="fld"><span class="fl">Observaciones (opcional)</span><textarea class="in" name="notes" rows="2">${esc(editing ? loan.notes || '' : '')}</textarea></label>
      <p class="grp-note">Los préstamos se restan del balance del operador.</p>`,
    del: editing ? { label: 'Eliminar préstamo', fn: async () => {
      if (!(await confirmDestructive('¿Eliminar este préstamo?', `${loan.concept}, ${money(loan.amount)} del ${fmtDate(loan.date)}. Dejará de restarse del balance.`, 'Eliminar préstamo'))) return false;
      await ops.deleteLoan(loan.id); toast('Préstamo eliminado', { type: 'info' }); onSaved && onSaved(); return true;
    } } : null,
    async onSubmit(f, sh) {
      if (!isDate(f.elements.date.value)) return fail(f, 'date', 'La fecha del préstamo no es válida.');
      const a = readMoney(f, 'amount', { required: true, positive: true, label: 'el monto del préstamo' });
      if (a.error) return fail(f, 'amount', a.error);
      const concept = f.elements.concept.value.trim();
      if (!concept) return fail(f, 'concept', 'Escribe el concepto del préstamo.');
      try { await ops.saveLoan({ ...(editing ? { id: loan.id } : {}), operatorId: op.id, date: f.elements.date.value, amount: a.value, concept, notes: f.elements.notes.value.trim() }); }
      catch (e) { toast(e.message || 'No se pudo guardar el préstamo.', { type: 'warn' }); return false; }
      sh.close(); toast(editing ? 'Préstamo actualizado' : 'Préstamo registrado'); onSaved && onSaved(); return true;
    },
  });
  cutoffHint(form, op);
}

/* ===== Ajuste administrativo ===== */
export function openAdjustmentForm(op, adj, onSaved) {
  const editing = !!adj;
  let direction = editing ? adj.direction : 'increase';
  const { form } = formSheet({
    title: editing ? 'Ajuste' : 'Registrar ajuste', saveLabel: editing ? 'Guardar cambios' : 'Guardar ajuste',
    html: `${who(op)}<p class="grp-note">Las correcciones no modifican registros anteriores: quedan como un ajuste con fecha y motivo.</p>
      ${dateIn('date', 'Fecha', editing ? adj.date : todayStr())}
      <label class="fld"><span class="fl">Tipo (componente del balance)</span><span class="sel-w"><select class="in" name="target">${ADJ_TARGETS.map(([k, l]) => `<option value="${k}"${editing && adj.target === k ? ' selected' : ''}>${l}</option>`).join('')}</select><span class="sel-ic">${icon.down}</span></span></label>
      <div class="fld"><span class="fl">Efecto sobre el componente</span><div class="seg big">${[['increase', 'Aumentar'], ['decrease', 'Disminuir']].map(([k, l]) => `<button type="button" class="seg-b${direction === k ? ' on' : ''}" data-dir="${k}">${l}</button>`).join('')}</div></div>
      ${moneyIn('amount', 'Monto', editing ? centsInput(adj.amount) : '')}
      <p class="adj-prev" data-aprev></p>
      <label class="fld" data-f="reason"><span class="fl">Motivo</span><input class="in" name="reason" value="${esc(editing ? adj.reason : '')}" placeholder="Ej. Corrección de comisión del viaje del 12/08" autocapitalize="sentences" enterkeyhint="next">${err('reason')}</label>
      <label class="fld"><span class="fl">Observaciones (opcional)</span><textarea class="in" name="notes" rows="2">${esc(editing ? adj.notes || '' : '')}</textarea></label>`,
    del: editing ? { label: 'Eliminar ajuste', fn: async () => {
      if (!(await confirmDestructive('¿Eliminar este ajuste?', `${adj.reason}. Dejará de contar en el balance; el registro se conserva en el respaldo.`, 'Eliminar ajuste'))) return false;
      await ops.deleteAdjustment(adj.id); toast('Ajuste eliminado', { type: 'info' }); onSaved && onSaved(); return true;
    } } : null,
    async onSubmit(f, sh) {
      if (!isDate(f.elements.date.value)) return fail(f, 'date', 'La fecha del ajuste no es válida.');
      const a = readMoney(f, 'amount', { required: true, positive: true, label: 'el monto del ajuste' });
      if (a.error) return fail(f, 'amount', a.error);
      const reason = f.elements.reason.value.trim();
      if (!reason) return fail(f, 'reason', 'Escribe el motivo del ajuste.');
      try { await ops.saveAdjustment({ ...(editing ? { id: adj.id } : {}), operatorId: op.id, date: f.elements.date.value, target: f.elements.target.value, direction, amount: a.value, reason, notes: f.elements.notes.value.trim() }); }
      catch (e) { toast(e.message || 'No se pudo guardar el ajuste.', { type: 'warn' }); return false; }
      sh.close(); toast(editing ? 'Ajuste actualizado' : 'Ajuste registrado'); onSaved && onSaved(); return true;
    },
  });
  cutoffHint(form, op);
  const p = form.querySelector('[data-aprev]');
  const upd = () => {
    const c = toCents(form.elements.amount.value);
    if (c == null || Number.isNaN(c) || !c) { p.textContent = ''; return; }
    const e = adjBalanceEffect({ target: form.elements.target.value, direction, amount: c });
    p.innerHTML = `Efecto en el balance: <b class="${e < 0 ? 'neg' : 'pos'}">${money(e, { sign: true })}</b>`;
  };
  form.addEventListener('input', upd); form.addEventListener('change', upd);
  form.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => { direction = b.dataset.dir; form.querySelectorAll('[data-dir]').forEach((x) => x.classList.toggle('on', x === b)); upd(); }));
  upd();
}

/* ===== Configuración del operador ===== */
function describe(k, v) {
  if (k === 'startDate') return isDate(v) ? fmtDate(v) : 'Sin fecha';
  if (k === 'cutoffDate') return isDate(v) ? fmtDate(v) : 'Hoy';
  if (k === 'satMode') return v === 'manual' ? 'Ajuste manual' : 'Automático';
  if (k === 'satManual') return v == null ? '—' : String(v);
  if (k === 'weekly' || k === 'minAmount') return money(v);
  if (k === 'minEnabled') return v ? 'Activada' : 'Desactivada';
  return String(v);
}
export function openSettingsForm(op, onSaved) {
  const st = ops.settingsFor(op.id);
  let cutMode = isDate(st.cutoffDate) ? 'fecha' : 'hoy', satMode = st.satMode === 'manual' ? 'manual' : 'auto';
  const { form } = formSheet({
    title: 'Configuración del operador', saveLabel: 'Guardar configuración',
    html: `${who(op)}
      ${dateIn('startDate', 'Fecha de inicio de operación en PERCONSUR', st.startDate)}
      <div class="fld" data-f="cutoffDate"><span class="fl">Calcular hasta</span>
        <div class="seg">${[['hoy', 'Hoy'], ['fecha', 'Otra fecha']].map(([k, l]) => `<button type="button" class="seg-b${cutMode === k ? ' on' : ''}" data-cut="${k}">${l}</button>`).join('')}</div>
        <input class="in" type="date" name="cutoffDate" value="${esc(isDate(st.cutoffDate) ? st.cutoffDate : todayStr())}" ${cutMode === 'hoy' ? 'hidden' : ''}>
        <span class="fhint">Sirve para cortes históricos: solo cuenta sábados y movimientos hasta esa fecha.</span>${err('cutoffDate')}</div>
      <div class="fld" data-f="satManual"><span class="fl">Sábados contabilizados</span>
        <div class="seg">${[['auto', 'Automático'], ['manual', 'Ajuste manual']].map(([k, l]) => `<button type="button" class="seg-b${satMode === k ? ' on' : ''}" data-sat="${k}">${l}</button>`).join('')}</div>
        <p class="sat-auto" data-satauto></p>
        <input class="in" name="satManual" inputmode="numeric" placeholder="Número de sábados" value="${esc(st.satManual ?? '')}" ${satMode === 'manual' ? '' : 'hidden'}>${err('satManual')}</div>
      ${moneyIn('weekly', 'Monto semanal', centsInput(st.weekly))}
      <p class="sat-total" data-sattotal></p>
      <label class="sw-row"><span class="sw-tx">Comisión mínima garantizada<small>Si la comisión calculada al 15% es menor al mínimo establecido, se aplicará una comisión ampliada.</small></span><input type="checkbox" switch class="sw" name="minEnabled"${st.minEnabled ? ' checked' : ''}></label>
      <div data-minwrap ${st.minEnabled ? '' : 'hidden'}>${moneyIn('minAmount', 'Comisión mínima', centsInput(st.minAmount))}</div>
      <p class="grp-note">La comisión mínima aplica a los viajes que registres después; los viajes ya registrados conservan su comisión. Cada cambio queda registrado en Movimientos → Ajustes.</p>`,
    async onSubmit(f, sh) {
      const startDate = f.elements.startDate.value;
      if (startDate && !isDate(startDate)) return fail(f, 'startDate', 'La fecha de inicio no es válida.');
      const cutoffDate = cutMode === 'fecha' ? f.elements.cutoffDate.value : '';
      if (cutMode === 'fecha' && !isDate(cutoffDate)) return fail(f, 'cutoffDate', 'Elige una fecha de corte válida.');
      let satManual = st.satManual;
      if (satMode === 'manual') {
        const t = f.elements.satManual.value.trim();
        if (!/^\d{1,4}$/.test(t)) return fail(f, 'satManual', 'Escribe el número de sábados (entero, sin negativos).');
        satManual = +t;
      }
      const weekly = readMoney(f, 'weekly', { required: true, label: 'el monto semanal' });
      if (weekly.error) return fail(f, 'weekly', weekly.error);
      const minEnabled = f.elements.minEnabled.checked;
      let minAmount = st.minAmount;
      if (minEnabled) { const m = readMoney(f, 'minAmount', { required: true, positive: true, label: 'la comisión mínima' }); if (m.error) return fail(f, 'minAmount', m.error); minAmount = m.value; }
      const effCut = cutoffDate || todayStr();
      if (startDate && effCut < startDate) {
        const v = await actionSheet({ title: 'La fecha de corte es anterior a la fecha de inicio', message: 'No se contabilizarán sábados con esta configuración.', actions: [{ label: 'Guardar de todos modos', value: true, style: 'primary' }] });
        if (!v) return false;
      }
      const next = { startDate, cutoffDate, satMode, satManual: satMode === 'manual' ? satManual : st.satManual, weekly: weekly.value, minEnabled, minAmount };
      const changed = await ops.saveSettings(op.id, next, describe);
      sh.close(); toast(changed ? 'Configuración guardada' : 'Sin cambios', { type: changed ? 'ok' : 'info' }); if (changed && onSaved) onSaved();
      return true;
    },
  });
  const autoP = form.querySelector('[data-satauto]'), totP = form.querySelector('[data-sattotal]');
  function upd() {
    const sd = form.elements.startDate.value, cd = cutMode === 'fecha' ? form.elements.cutoffDate.value : todayStr();
    const n = isDate(sd) && isDate(cd) ? saturdaysBetween(sd, cd).length : 0;
    autoP.textContent = isDate(sd) ? `Automático: ${n} sábado${n === 1 ? '' : 's'} del ${fmtDate(sd)} al ${fmtDate(cd)} (incluye ambas fechas).` : 'Captura la fecha de inicio para calcular los sábados.';
    const count = satMode === 'manual' && /^\d+$/.test(form.elements.satManual.value.trim()) ? +form.elements.satManual.value : n;
    const w = toCents(form.elements.weekly.value);
    totP.innerHTML = w != null && !Number.isNaN(w) ? `Sábados pagados: ${count} × ${money(w)} = <b>${money(count * w)}</b>${satMode === 'manual' ? ' <span class="st st-borrador">Ajuste manual</span>' : ''}` : '';
  }
  form.addEventListener('input', upd); form.addEventListener('change', (e) => { if (e.target.name === 'minEnabled') form.querySelector('[data-minwrap]').hidden = !e.target.checked; upd(); });
  form.querySelectorAll('[data-cut]').forEach((b) => b.addEventListener('click', () => { cutMode = b.dataset.cut; form.querySelectorAll('[data-cut]').forEach((x) => x.classList.toggle('on', x === b)); form.elements.cutoffDate.hidden = cutMode === 'hoy'; upd(); }));
  form.querySelectorAll('[data-sat]').forEach((b) => b.addEventListener('click', () => {
    satMode = b.dataset.sat; form.querySelectorAll('[data-sat]').forEach((x) => x.classList.toggle('on', x === b));
    const inp = form.elements.satManual; inp.hidden = satMode !== 'manual';
    if (satMode === 'manual' && !inp.value) { const sd = form.elements.startDate.value; inp.value = isDate(sd) ? saturdaysBetween(sd, cutMode === 'fecha' ? form.elements.cutoffDate.value : todayStr()).length : ''; }
    upd();
  }));
  upd();
}
