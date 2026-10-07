/*
 * Importación de viajes (#/operadores/importar)
 * Carga un archivo de registros (operador, fecha, contenedor, estatus de pago), los relaciona con los viajes existentes
 * y muestra una vista previa. Nada se guarda hasta tocar «Aplicar cambios». Solo actualiza la Referencia del viaje y su
 * estatus de pago; no crea viajes ni cambia tarifas, gastos, comisiones o balances.
 * La app no lee imágenes: el archivo se prepara aparte (ver domain/operators/tripImport.js para el formato).
 */
import { el, on } from '../../core/dom.js';
import { back, query } from '../../core/router.js';
import * as ops from '../../services/operators.js';
import * as billing from '../../services/billing.js';
import { save as saveCatalog } from '../../services/catalogs.js';
import { commissionFor, ruleFromSettings } from '../../domain/operators/balance.js';
import { nameCase } from '../../domain/shared/format.js';
import { esc } from '../../domain/shared/format.js';
import { money } from '../../domain/operators/money.js';
import { fmtDate } from '../../domain/operators/balance.js';
import { parseImport, planImport, summarizePlan, resolveRow, needsReview, willSetRef, willChange, cleanContainer, IMPORT_SOURCE } from '../../domain/operators/tripImport.js';
import { icon } from '../components/icons.js';
import { actionSheet, busy } from '../components/sheet.js';
import { toast } from '../components/toast.js';

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const FILTERS = [['todos', 'Todos'], ['cambios', 'Por actualizar'], ['revision', 'Requieren revisión'], ['igual', 'Sin cambios']];
const tripLabel = (t) => `${t.origin} → ${t.destination} | ${money(t.fare)}${t.reference ? ' | Ref. ' + t.reference : ''}`;

export async function tripImportScreen() {
  await billing.loadBilling();
  let records = null, source = '', rows = [], filter = 'todos', done = null;
  const choice = new Map();    // n del registro → id del viaje elegido a mano (ambiguos)
  const replace = new Set();   // n → reemplazar una referencia distinta ya guardada
  const refEdit = new Map();   // n → referencia corregida a mano (lectura dudosa); '' = no asignar

  const root = el(`<div class="wiz imp">
    <header class="wiz-top">
      <button type="button" class="icon-btn" data-back aria-label="Volver a Operadores">${icon.back}</button>
      <div class="wiz-title static"><small>Operadores</small><b>Importación de viajes</b></div><span></span>
    </header>
    <main class="wiz-body" data-body></main>
    <footer class="actionbar" data-bar></footer>
  </div>`);
  const body = root.querySelector('[data-body]'), bar = root.querySelector('[data-bar]');

  function plan() {
    const ctx = { operators: ops.operatorList(), trips: ops.allTrips(), billOf: billing.billingOf };
    rows = planImport(records, ctx).map((row) => {
      if (row.state !== 'ambiguous' || !choice.has(row.rec.n)) return row;
      const t = row.candidates.find((x) => x.id === choice.get(row.rec.n));
      return t ? { ...resolveRow(row, t, ctx.billOf), candidates: row.candidates, manual: true } : row;
    });
  }
  /* Lo que se aplicará a cada fila, incluyendo las decisiones manuales */
  const refToSet = (row) => {
    if (row.state !== 'ok') return '';
    if (row.refState === 'add') return row.rec.container;
    if (row.refState === 'conflict' && replace.has(row.rec.n)) return row.rec.container;
    if (row.refState === 'uncertain' && refEdit.get(row.rec.n)) return cleanContainer(refEdit.get(row.rec.n));
    return '';
  };
  const changes = (row) => row.state === 'create' || !!refToSet(row) || (row.state === 'ok' && row.markPaid);
  const pending = (row) => (row.state !== 'ok' && row.state !== 'create') || (row.refState === 'conflict' && !replace.has(row.rec.n)) || (row.refState === 'uncertain' && !refEdit.has(row.rec.n));
  const totals = () => ({ ...summarizePlan(rows), refs: rows.filter((r) => refToSet(r)).length, review: rows.filter(pending).length, change: rows.filter(changes).length });

  function rowHTML(row) {
    const rec = row.rec, found = row.state === 'ok', isNew = row.state === 'create';
    const st = rec.paid ? '<span class="pay-tag paid">Pagado</span>' : `<span class="pay-tag none">${rec.status ? esc(rec.status) : 'Sin estatus'}</span>`;
    const acts = [];
    if (found) {
      if (row.refState === 'add') acts.push('Agregar referencia');
      if (row.refState === 'same') acts.push('Referencia ya guardada');
      if (row.refState === 'none') acts.push('Sin número de contenedor');
      if (row.refState === 'conflict' && refToSet(row)) acts.push('Reemplazar referencia');
      if (row.refState === 'uncertain' && refToSet(row)) acts.push(`Agregar referencia ${refToSet(row)}`);
      if (row.markPaid) acts.push('Marcar como pagado');
      else if (rec.paid && row.alreadyPaid) acts.push('Ya estaba pagado');
      else if (!rec.paid) acts.push(row.alreadyPaid ? 'El pago registrado en la app no se modifica' : 'Queda por cobrar');
    }
    if (isNew) { acts.push('Registrar viaje nuevo'); acts.push(`Comisión 15 %: ${money(Math.round(rec.fare * 0.15))}`); acts.push('Gastos de viaje: $0.00'); acts.push(rec.paid ? 'Marcar como pagado' : 'Queda por cobrar'); }
    const badge = isNew ? '<span class="st st-generado">Crear</span>' : pending(row) ? '<span class="st st-borrador">Revisar</span>' : changes(row) ? '<span class="st st-generado">Actualizar</span>' : '<span class="st">Sin cambios</span>';
    let ctl = '';
    if (row.state === 'ambiguous' || row.manual) {
      ctl = `<label class="fld imp-ctl"><span class="fl">${esc(row.reason || 'Elige el viaje que corresponde')}</span><span class="sel-w"><select class="in" data-choice="${rec.n}">
        <option value="">Sin asignar (revisar después)</option>${row.candidates.map((t, k) => `<option value="${esc(t.id)}"${choice.get(rec.n) === t.id ? ' selected' : ''}>Viaje ${k + 1}: ${esc(tripLabel(t))}</option>`).join('')}</select><span class="sel-ic">${icon.down}</span></span></label>`;
    }
    if (found && row.refState === 'conflict') {
      ctl += `<label class="imp-check"><input type="checkbox" data-replace="${rec.n}"${replace.has(rec.n) ? ' checked' : ''}><span>El viaje ya tiene la referencia <b class="mono">${esc(row.currentRef)}</b>. Reemplazarla por <b class="mono">${esc(rec.container)}</b>.</span></label>`;
    }
    if (found && row.refState === 'uncertain') {
      const v = refEdit.has(rec.n) ? refEdit.get(rec.n) : rec.container;
      ctl += `<label class="fld imp-ctl"><span class="fl">Lectura dudosa del contenedor. ${esc(rec.containerHint)} Corrígelo o confírmalo:</span><input class="in mono" data-refedit="${rec.n}" value="${esc(v)}" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="40"></label>
        <div class="imp-btns"><button type="button" class="btn-secondary sm" data-refok="${rec.n}">${refEdit.get(rec.n) ? 'Referencia confirmada' : 'Usar esta referencia'}</button><button type="button" class="btn-ghost sm" data-refskip="${rec.n}">${refEdit.get(rec.n) === '' ? 'No se asignará' : 'No asignar referencia'}</button></div>`;
    }
    return `<div class="imp-row${pending(row) ? ' rev' : ''}" data-n="${rec.n}">
      <div class="imp-top"><b class="mono">${rec.container ? esc(rec.container) : 'Sin número'}</b>${st}<span class="imp-date">${esc(fmtDate(rec.date) || 'Sin fecha')}</span>${badge}</div>
      <div class="imp-l2">${isNew ? `Viaje nuevo: ${esc(rec.origin)} → ${esc(rec.destination)} | ${money(rec.fare)}` : found ? `Viaje encontrado: ${esc(row.trip.origin)} → ${esc(row.trip.destination)} | ${money(row.trip.fare)}` : row.state === 'ambiguous' ? 'Coincidencia ambigua' : esc(row.reason || 'No encontrado')}</div>
      ${acts.length ? `<div class="imp-l3">${acts.map(esc).join(' | ')}</div>` : ''}${rec.note ? `<div class="imp-l3">${esc(rec.note)}</div>` : ''}
      ${ctl}</div>`;
  }

  function draw() {
    if (!records) {
      body.innerHTML = `<section class="grp"><div class="grp-h"><h3>Archivo de importación</h3></div><div class="grp-b">
          <p class="sheet-lead">Actualiza la <b>Referencia</b> (número de contenedor) y el <b>estatus de pago</b> de viajes que ya existen, a partir de un archivo con operador, fecha, contenedor y estatus.</p>
          <label class="btn-primary block">${icon.upload}<span>Elegir archivo (.json)</span><input type="file" accept="application/json,.json" hidden data-file></label>
          <p class="grp-note">La app no lee imágenes por sí sola: las imágenes se transcriben antes a este archivo. Verás una vista previa y nada se guarda hasta que confirmes.</p>
        </div></section>`;
      bar.innerHTML = `<button type="button" class="btn-secondary" data-act="cancel">${icon.back}<span>Volver</span></button><span></span>`;
      return;
    }
    const t = totals();
    const groups = new Map();
    rows.forEach((row) => { const k = row.rec.operator; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(row); });
    const show = (row) => filter === 'todos' || (filter === 'revision' ? pending(row) : filter === 'cambios' ? changes(row) : !changes(row) && !pending(row));
    const tile = (label, v, cls = '') => `<div class="tile"><small>${label}</small><b class="${cls}">${v}</b></div>`;
    body.innerHTML = `${done ? `<section class="ok-box stmt-ok">${icon.check}<span><b>Importación completada</b><small>${done.newTrips ? `${plural(done.newOps, 'operador agregado', 'operadores agregados')} | ${plural(done.newTrips, 'viaje registrado', 'viajes registrados')} | ` : ''}${done.trips ? `${plural(done.trips, 'viaje actualizado', 'viajes actualizados')} | ${plural(done.refs, 'referencia agregada', 'referencias agregadas')} | ` : ''} ${plural(done.paid, 'viaje marcado como pagado', 'viajes marcados como pagados')}${t.review ? ` | ${plural(t.review, 'registro requiere', 'registros requieren')} revisión` : ''}</small></span></section>
        ${t.review ? `<button type="button" class="btn-secondary block imp-pend" data-f="revision">${icon.alert}<span>Revisar pendientes (${t.review})</span></button>` : ''}` : ''}
      <div class="tiles imp-tiles">${t.newTrips ? tile('Operadores nuevos', t.newOps, t.newOps ? 'pos' : '') + tile('Viajes nuevos', t.newTrips, 'pos') : ''}${tile('Registros detectados', t.detected)}${tile('Viajes encontrados', t.found)}${tile('Referencias a agregar', t.refs)}${tile('Viajes a marcar como pagados', t.pay, t.pay ? 'pos' : '')}${tile('Requieren revisión', t.review, t.review ? 'cob-due' : '')}</div>
      ${source ? `<p class="grp-note">Origen: ${esc(source)}</p>` : ''}
      <div class="chips filters">${FILTERS.map(([k, l]) => `<button type="button" class="chip${filter === k ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      ${[...groups].map(([name, list]) => {
        const vis = list.filter(show);
        const op = list[0].op;
        const nu = list.find((r) => r.state === 'create' && r.newOp), pf = nu && nu.rec.profile;
        return vis.length ? `<div class="grp-h solo"><h3>${esc(op ? op.name : nu ? nameCase(name) : name)}</h3><span class="count">${op ? plural(vis.length, 'registro', 'registros') : nu ? 'Operador nuevo' : 'No está en el catálogo'}</span></div>
          ${nu ? `<p class="grp-note imp-newop">Se dará de alta en el catálogo de ${esc(nu.rec.company === 'perconsur' ? 'PERCONSUR' : nu.rec.company.toUpperCase())}${pf ? ` con RFC <b class="mono">${esc(pf.rfc || '—')}</b>, CURP <b class="mono">${esc(pf.curp || '—')}</b> y licencia <b class="mono">${esc(pf.license || '—')}</b>` : ''}. La fecha de inicio y el monto semanal se configuran después en su ficha.</p>` : ''}<div class="imp-list">${vis.map(rowHTML).join('')}</div>` : '';
      }).join('') || '<div class="empty"><p>No hay registros con ese filtro.</p></div>'}
      <p class="grp-note center">${t.newTrips ? 'Los viajes nuevos se registran con la tarifa del archivo, comisión del 15 % y gastos de viaje en cero. En los viajes que ya existen solo' : 'Solo'} se actualizan la Referencia y el estatus de pago${t.newTrips ? '' : '. No se crean viajes ni cambian tarifas, gastos, comisiones o balances'}. Los viajes marcados como pagados quedan sin fecha de pago, porque el archivo no la trae.</p>`;
    bar.innerHTML = `<button type="button" class="btn-secondary" data-act="cancel">${icon.close}<span>${done ? 'Cerrar' : 'Cancelar'}</span></button>
      <button type="button" class="btn-primary" data-act="apply" ${t.change ? '' : 'disabled'}>${icon.check}<span>Aplicar cambios${t.change ? ` (${t.change})` : ''}</span></button>`;
  }

  function load(obj) {
    const p = parseImport(obj);
    records = p.records; source = p.source; done = null; choice.clear(); replace.clear(); refEdit.clear(); filter = 'todos';
    plan(); draw();
  }
  async function apply() {
    const todo = rows.filter(changes);
    if (!todo.length) return;
    const ids = todo.filter((r) => r.trip).map((r) => r.trip.id);
    if (new Set(ids).size !== ids.length) { toast('Elegiste el mismo viaje para dos registros. Corrige la selección.', { type: 'warn', ms: 4500 }); return; }
    const creates = todo.filter((r) => r.state === 'create'), updates = todo.filter((r) => r.state === 'ok');
    const newOpNames = [...new Set(creates.filter((r) => r.newOp).map((r) => r.rec.operator))];
    const nRef = updates.filter((r) => refToSet(r)).length, toPay = todo.filter((r) => r.markPaid), left = rows.filter(pending).length;
    const v = await actionSheet({ title: 'Aplicar cambios', message: `${creates.length ? `${newOpNames.length ? plural(newOpNames.length, 'operador nuevo', 'operadores nuevos') + ' y ' : ''}${plural(creates.length, 'viaje nuevo', 'viajes nuevos')}. ` : ''}${updates.length ? `${plural(updates.length, 'viaje', 'viajes')} por actualizar: ${plural(nRef, 'referencia', 'referencias')}. ` : ''}${plural(toPay.length, 'viaje marcado como pagado', 'viajes marcados como pagados')}.${left ? ` ${plural(left, 'registro queda', 'registros quedan')} para revisión y no se ${left === 1 ? 'modifica' : 'modifican'}.` : ''}`,
      actions: [{ label: 'Aplicar cambios', value: true, style: 'primary' }] });
    if (!v) return;
    busy(true, 'Actualizando viajes…', '');
    let refs = 0, paid = 0, newOps = 0, newTrips = 0;
    try {
      /* Altas: primero los operadores, después sus viajes */
      const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      const payIds = toPay.filter((r) => r.trip).map((r) => r.trip.id);
      for (const r of creates) {
        const rec = r.rec;
        let op = ops.operatorList().find((o) => fold(o.name) === fold(rec.operator));
        if (!op) {
          const pf = rec.profile || {};
          op = await saveCatalog('operators', { company: rec.company, name: nameCase(rec.operator), rfc: pf.rfc || '', curp: pf.curp || '', license: { number: pf.license || '', type: '', issued: '', expires: '' }, source: IMPORT_SOURCE });
          newOps += 1;
        }
        const c = commissionFor(rec.fare, ruleFromSettings(ops.settingsFor(op.id)));
        const t = await ops.saveTrip({ operatorId: op.id, division: 'puerto', date: rec.date, reference: rec.container, referenceSource: IMPORT_SOURCE, origin: rec.origin, destination: rec.destination,
          fare: rec.fare, travelExpenses: 0, commissionRate: c.rate, minEnabled: !!ops.settingsFor(op.id).minEnabled, minAmount: ops.settingsFor(op.id).minAmount,
          baseCommission: c.base, expandedCommission: c.adjustment, finalCommission: c.final, isExpanded: c.expanded, notes: '', source: IMPORT_SOURCE });
        newTrips += 1;
        if (rec.paid) payIds.push(t.id);
      }
      for (const r of updates) { const ref = refToSet(r); if (ref) { await ops.setTripReference(r.trip.id, ref, IMPORT_SOURCE); refs += 1; } }
      paid = await billing.setTripsPaid(payIds, { paidDate: '', reference: '', source: IMPORT_SOURCE });
    } catch (e) {
      busy(false); console.error(e);
      toast('No se pudieron aplicar todos los cambios. Revisa la vista previa: muestra lo que falta.', { type: 'warn', ms: 6000 });
      plan(); draw(); return;
    }
    busy(false);
    done = { trips: updates.length, refs, paid, newOps, newTrips };
    replace.clear(); refEdit.clear();
    plan(); draw(); window.scrollTo(0, 0);
    toast('Importación completada');
  }

  on(root, 'click', '[data-back]', () => back('/operadores'));
  on(root, 'click', '[data-f]', (e, b) => { filter = b.dataset.f; draw(); if (b.classList.contains('imp-pend')) { const x = body.querySelector('.imp-row.rev'); if (x) x.scrollIntoView({ block: 'center', behavior: 'smooth' }); } });
  on(root, 'click', '[data-act]', (e, b) => { if (b.dataset.act === 'cancel') back('/operadores'); else apply(); });
  on(root, 'click', '[data-refok]', (e, b) => { const n = +b.dataset.refok, inp = body.querySelector(`[data-refedit="${n}"]`), v = cleanContainer(inp.value); if (!v) { toast('Escribe la referencia.', { type: 'warn' }); return; } refEdit.set(n, v); draw(); });
  on(root, 'click', '[data-refskip]', (e, b) => { refEdit.set(+b.dataset.refskip, ''); draw(); });
  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-choice]')) { if (t.value) choice.set(+t.dataset.choice, t.value); else choice.delete(+t.dataset.choice); plan(); draw(); }
    if (t.matches('[data-replace]')) { if (t.checked) replace.add(+t.dataset.replace); else replace.delete(+t.dataset.replace); draw(); }
    if (t.matches('[data-file]')) {
      const f = t.files && t.files[0]; t.value = ''; if (!f) return;
      try { load(JSON.parse(await f.text())); } catch (err) { toast(err instanceof SyntaxError ? 'El archivo no es un JSON válido.' : err.message, { type: 'warn', ms: 5000 }); }
    }
  });

  draw();
  /* #/operadores/importar?archivo=importaciones/<nombre>.json abre directamente un archivo publicado junto a la app */
  const src = query().get('archivo');
  const mounted = async () => {
    if (!src || !/^importaciones\/[\w.-]+\.json$/.test(src)) return;
    try { const r = await fetch('./' + src, { cache: 'no-store' }); if (!r.ok) throw new Error('No se encontró el archivo de importación.'); load(await r.json()); }
    catch (err) { toast(err.message || 'No se pudo abrir el archivo de importación.', { type: 'warn', ms: 5000 }); }
  };
  return { el: root, mounted };
}
