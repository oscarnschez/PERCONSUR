/*
 * Operación → Combustible y rendimiento
 *   #/operacion/combustible            resumen de flota (filtro por periodo) y comparación de unidades
 *   #/operacion/combustible/:vehicleId ficha de la unidad: indicadores, gráficas e historial
 * Todos los valores derivados salen de domain/fuel/fuel.js (no se guardan).
 */
import { screen, on } from '../../core/dom.js';
import { go, back } from '../../core/router.js';
import * as fuel from '../../services/fuel.js';
import { getCompany } from '../../services/companies.js';
import { shareFile, downloadBlob, isIOS } from '../../services/share.js';
import { esc } from '../../domain/shared/format.js';
import { money, toCents, centsInput, moneyClean } from '../../domain/operators/money.js';
import { fmtDate, todayStr, isDate } from '../../domain/operators/balance.js';
import { analyzeVehicle, indicators, fleetSummary, fuelRange, FUEL_PERIODS, compareUnits, COMPARE_SORTS, monthly, odometerCheck, pricePerLiter } from '../../domain/fuel/fuel.js';
import { buildFuelWorkbook } from '../../domain/fuel/report.js';
import { lineChart, barChart } from '../components/charts.js';
import { icon } from '../components/icons.js';
import { openSheet, actionSheet, confirmDestructive, busy } from '../components/sheet.js';
import { openPicker } from '../components/picker.js';
import { toast } from '../components/toast.js';
import { enterAdvances } from '../components/fields.js';

const nf = (n, d = 0) => (n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const kmF = (n) => `${nf(n)} km`, lF = (n) => `${nf(n, 2)} L`, kmlF = (v) => (v == null ? 'Pendiente' : `${v.toFixed(2)} km/L`), l100F = (v) => (v == null ? '—' : `${v.toFixed(2)} L/100 km`);
const pplF = (v) => (v == null ? '—' : `$${nf(v, 2)}`);
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const STATUS = {
  cierra: 'Tanque lleno | cierra un periodo de medición', inicia: 'Tanque lleno | inicia la medición', parcial: 'Parcial | se suma al siguiente tanque lleno',
  sinbase: 'Parcial | antes del primer tanque lleno (no se mide)', reinicio: 'Corrección de odómetro | reinicia la medición', invalido: 'Tanque lleno | periodo sin distancia válida',
};

/* ===== Resumen de flota y comparación ===== */
export async function fuelScreen() {
  await fuel.loadFuel();
  let per = 'mes', custom = { from: '', to: '' }, sort = 'best';
  const s = screen('<div class="page wide"></div>');
  const root = s.el;
  function render() {
    const units = fuel.unitsAnalyzed(), rg = fuelRange(per, custom), fl = fleetSummary(units, rg), cmp = compareUnits(fl.units, sort);
    root.innerHTML = `
      <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Operación</span></button></header>
      <h1 class="title">Combustible y rendimiento</h1>
      <div class="op-acts two"><button type="button" class="btn-primary" data-new>${icon.plus}<span>Registrar recarga</span></button><button type="button" class="btn-secondary" data-export>${icon.download}<span>Exportar registros</span></button></div>
      <div class="chips filters">${FUEL_PERIODS.map(([k, l]) => `<button type="button" class="chip${per === k ? ' on' : ''}" data-per="${k}">${l}</button>`).join('')}</div>
      ${per === 'custom' ? `<div class="row2 period-custom"><label class="fld"><span class="fl">Desde</span><input class="in" type="date" data-c="from" value="${esc(custom.from)}"></label><label class="fld"><span class="fl">Hasta</span><input class="in" type="date" data-c="to" value="${esc(custom.to)}"></label></div>` : ''}
      <section class="grp"><div class="grp-h"><h3>Resumen de flota</h3></div>
        <div class="tiles">
          <div class="tile"><small>Unidades activas</small><b>${fl.active}</b></div>
          <div class="tile"><small>Recargas</small><b>${fl.count}</b></div>
          <div class="tile"><small>Litros</small><b>${nf(fl.liters, 0)}</b></div>
          <div class="tile wide"><small>Gasto en combustible</small><b>${money(fl.amount)}</b></div>
          <div class="tile wide"><small>Kilómetros registrados</small><b>${kmF(fl.km)}</b></div>
          <div class="tile wide"><small>Rendimiento promedio de la flota</small><b>${fl.perf ? kmlF(fl.perf.kmL) : '<span class="muted">Pendiente</span>'}</b>${fl.perf ? `<small>${l100F(fl.perf.l100)} | ${fl.perf.n} periodo${fl.perf.n === 1 ? '' : 's'} medido${fl.perf.n === 1 ? '' : 's'}</small>` : ''}</div>
          <div class="tile wide"><small>Precio promedio por litro</small><b>${pplF(fl.avgPrice)}</b></div>
        </div></section>
      <div class="sec-hrow"><h2 class="sec-h">Comparar unidades</h2></div>
      <div class="chips filters">${COMPARE_SORTS.map(([k, l]) => `<button type="button" class="chip${sort === k ? ' on' : ''}" data-sort="${k}">${l}</button>`).join('')}</div>
      ${cmp.length ? `<div class="list">${cmp.map((u) => `<a class="row" href="#/operacion/combustible/${esc(u.id)}">
          <span class="unit-badge">${esc(u.label)}</span>
          <span class="row-tx"><span class="row-l2">${esc(u.placas)}${u.desc ? ' | ' + esc(u.desc) : ''}</span><span class="row-l3">${lF(u.m.liters)} | ${money(u.m.amount)} | ${kmF(u.m.km)}</span></span>
          <span class="op-bal"><small>Rendimiento</small><b>${u.m.perf ? kmlF(u.m.perf.kmL) : '<span class="muted">Pendiente</span>'}</b></span></a>`).join('')}</div>
        <p class="grp-note">El orden es una herramienta de análisis; no indica fallas ni diagnósticos.</p>`
    : '<div class="empty"><p>No hay recargas en este periodo.</p></div>'}
      <div class="sec-hrow"><h2 class="sec-h">Unidades</h2></div>
      ${units.length ? `<div class="chips unit-chips">${units.map((u) => `<a class="chip" href="#/operacion/combustible/${esc(u.id)}">${esc(u.label)}</a>`).join('')}</div>`
    : '<div class="empty"><p>No hay unidades en el catálogo. Agrégalas en Administración → Catálogos → Unidades.</p></div>'}`;
  }
  on(root, 'click', '[data-back]', () => back('/operacion'));
  on(root, 'click', '[data-per]', (e, b) => { per = b.dataset.per; render(); });
  on(root, 'click', '[data-sort]', (e, b) => { sort = b.dataset.sort; render(); });
  root.addEventListener('change', (e) => { if (e.target.dataset.c) { custom[e.target.dataset.c] = e.target.value; render(); } });
  on(root, 'click', '[data-new]', () => startFuelRecord(null, render));
  on(root, 'click', '[data-export]', () => openExport());
  render();
  return s;
}

/* Registrar recarga: si no hay unidad, se elige del catálogo */
export async function startFuelRecord(vehicleId, onSaved) {
  await fuel.loadFuel();
  let vid = vehicleId;
  if (!vid) {
    const vs = fuel.vehicles();
    if (!vs.length) { toast('No hay unidades en el catálogo. Agrégalas en Administración → Catálogos.', { type: 'info', ms: 4000 }); return; }
    const multi = new Set(vs.map((v) => v.company)).size > 1;
    const r = await openPicker({ title: 'Unidad', allowNew: false, placeholder: 'Buscar unidad', inputmode: 'numeric', autocap: 'none', items: vs.map((v) => ({ value: v.id, label: v.label, sub: [v.placas, multi ? v.companyShort : '', v.desc].filter(Boolean).join(' | ') })) });
    if (!r) return; vid = r.value;
  }
  openFuelForm(fuel.vehicleById(vid), null, onSaved);
}

/* ===== Ficha de la unidad ===== */
export async function fuelUnitScreen({ id }) {
  await fuel.loadFuel();
  const v = fuel.vehicleById(id);
  if (!v) { toast('Esa unidad ya no está en el catálogo.', { type: 'info' }); go('/operacion/combustible', { replace: true }); return null; }
  let shown = 20;
  const s = screen('<div class="page"></div>');
  const root = s.el;
  function render() {
    const an = analyzeVehicle(fuel.recordsOf(id)), ind = indicators(an), t = an.totals, last = an.last;
    const hist = [...an.rows].reverse(), y = window.scrollY;
    const perfPts = an.segments.map((sg) => ({ x: sg.endDate, y: sg.kmL })), mo = monthly(an, 12), odo = an.records.map((r) => ({ x: r.date, y: r.odometer }));
    const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'], mLabel = (k) => MES[+k.slice(5, 7) - 1];
    const varTxt = ind.variation == null ? '—' : `${ind.variation > 0 ? '+' : ''}${ind.variation.toFixed(1)}%`;
    root.innerHTML = `
      <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Combustible</span></button></header>
      <div class="unit-head"><span class="unit-badge lg">${esc(v.label)}</span><div><h1>${esc(v.placas || 'Sin placas')}</h1><p>${esc(v.companyShort)}${v.desc ? ' | ' + esc(v.desc) : ''}</p></div></div>
      <dl class="sumlist unit-meta"><div><dt>Último odómetro</dt><dd>${last ? kmF(last.odometer) : '—'}</dd></div><div><dt>Última recarga</dt><dd>${last ? `${esc(fmtDate(last.date))} ${esc(last.time)} | ${lF(last.liters)}` : 'Sin recargas'}</dd></div></dl>
      <button type="button" class="btn-primary block lg" data-new>${icon.plus}<span>Registrar recarga</span></button>
      ${an.pending && (an.pending.records.length || !an.segments.length) && an.records.length ? `<p class="op-warn">${icon.info}<span><b>Rendimiento pendiente.</b> Se requiere una siguiente carga con tanque lleno para cerrar el periodo que inició el ${esc(fmtDate(an.pending.from.date))}${an.pending.liters ? ` (${lF(an.pending.liters)} cargados desde entonces)` : ''}.</span></p>` : ''}
      ${!an.records.length ? '<div class="empty"><p>Aún no hay recargas de esta unidad.</p></div>' : `
      <section class="perf-card">
        <span class="bal-l">Rendimiento actual</span>
        <b class="perf-v">${ind.current ? ind.current.kmL.toFixed(2) : '—'}<small> km/L</small></b>
        <span class="bal-sub">${ind.current ? `${l100F(ind.current.l100)} | periodo ${esc(fmtDate(ind.current.startDate))} a ${esc(fmtDate(ind.current.endDate))}` : 'Pendiente: se necesitan dos cargas con tanque lleno'}</span>
        ${ind.current && ind.hist ? `<span class="perf-var">Variación contra el promedio histórico: <b>${varTxt}</b></span>` : ''}
      </section>
      <div class="tiles">
        <div class="tile"><small>Promedio histórico</small><b>${ind.hist ? ind.hist.kmL.toFixed(2) : '—'}</b></div>
        <div class="tile"><small>Últimos 30 días</small><b>${ind.avg30 ? ind.avg30.kmL.toFixed(2) : '—'}</b></div>
        <div class="tile"><small>Últimos 90 días</small><b>${ind.avg90 ? ind.avg90.kmL.toFixed(2) : '—'}</b></div>
        <div class="tile"><small>Mejor</small><b>${ind.best ? ind.best.kmL.toFixed(2) : '—'}</b></div>
        <div class="tile"><small>Peor</small><b>${ind.worst ? ind.worst.kmL.toFixed(2) : '—'}</b></div>
        <div class="tile"><small>Periodos medidos</small><b>${an.segments.length}</b></div>
      </div>
      <p class="grp-note">Rendimientos en km/L por el método de tanque lleno. Solo se muestran datos y variaciones; no son diagnósticos.</p>
      <div class="tiles four">
        <div class="tile wide"><small>Distancia recorrida</small><b>${kmF(t.km)}</b></div>
        <div class="tile wide"><small>Combustible cargado</small><b>${lF(t.liters)}</b></div>
        <div class="tile wide"><small>Gasto en combustible</small><b>${money(t.amount)}</b></div>
        <div class="tile wide"><small>Precio promedio por litro</small><b>${pplF(t.avgPrice)}</b></div>
      </div>
      <section class="grp"><div class="grp-h"><h3>Rendimiento a través del tiempo (km/L)</h3></div><div class="chart-box">${lineChart({ points: perfPts, avg: ind.hist ? ind.hist.kmL : null, avgLabel: 'Promedio', label: 'Rendimiento por periodo' })}</div></section>
      <section class="grp"><div class="grp-h"><h3>Litros cargados por mes</h3></div><div class="chart-box">${barChart({ bars: mo.map((b) => ({ label: mLabel(b.key), v: b.liters })), fmt: (x) => nf(x), label: 'Litros por mes' })}</div></section>
      <section class="grp"><div class="grp-h"><h3>Gasto en combustible por mes</h3></div><div class="chart-box">${barChart({ bars: mo.map((b) => ({ label: mLabel(b.key), v: b.amount / 100 })), fmt: (x) => (x >= 1000 ? `$${nf(x / 1000, x >= 10000 ? 0 : 1)}k` : `$${nf(x)}`), label: 'Gasto por mes' })}</div></section>
      <section class="grp"><div class="grp-h"><h3>Odómetro (km acumulados)</h3></div><div class="chart-box">${lineChart({ points: odo, fmt: (x) => nf(x), label: 'Odómetro' })}</div></section>`}
      ${hist.length ? `<div class="sec-hrow"><h2 class="sec-h">Historial de recargas</h2><span class="count">${hist.length}</span></div>
      <div class="list">${hist.slice(0, shown).map((x) => `<button type="button" class="row fuel-row" data-rec="${esc(x.rec.id)}">
        <span class="row-tx"><span class="row-l1"><b>${esc(fmtDate(x.rec.date))}</b><span class="tc-date">${esc(x.rec.time)}</span><span class="st ${x.rec.fullTank ? 'st-generado' : 'st-borrador'}">${x.rec.fullTank ? 'Tanque lleno' : 'Parcial'}</span>${x.brk ? '<span class="st st-borrador">Corrección</span>' : ''}</span>
          <span class="row-l2">${kmF(x.rec.odometer)}${x.km != null ? ` | +${nf(x.km)} km` : ''} | ${lF(x.rec.liters)} | ${money(x.rec.amount)} | ${pplF(x.ppl)}/L</span>
          <span class="row-l3">${x.segment ? `<b class="pos">${x.segment.kmL.toFixed(2)} km/L</b> | ${x.segment.l100.toFixed(2)} L/100 km` : esc(STATUS[x.status] || '')}</span></span>
        <span class="chev">${icon.chev}</span></button>`).join('')}</div>
      ${hist.length > shown ? `<button type="button" class="btn-ghost block" data-more>Mostrar más (${hist.length - shown})</button>` : ''}` : ''}`;
    window.scrollTo(0, y);
  }
  on(root, 'click', '[data-back]', () => back('/operacion/combustible'));
  on(root, 'click', '[data-new]', () => openFuelForm(v, null, render));
  on(root, 'click', '[data-more]', () => { shown += 20; render(); });
  on(root, 'click', '[data-rec]', (e, b) => openRecordDetail(v, b.dataset.rec, render));
  render();
  return s;
}

/* ===== Detalle de una recarga: cómo se calculó ===== */
function openRecordDetail(v, recId, onChange) {
  const an = analyzeVehicle(fuel.recordsOf(v.id)), row = an.rows.find((x) => x.rec.id === recId);
  if (!row) return;
  const r = row.rec, seg = row.segment || an.segments.find((sg) => sg.records.some((x) => x.id === r.id));
  const calc = seg ? `<h3 class="pk-h">Cálculo del rendimiento</h3>
    <dl class="sumlist calc">
      <div><dt>Periodo</dt><dd>${esc(fmtDate(seg.startDate))} → ${esc(fmtDate(seg.endDate))}</dd></div>
      <div><dt>Odómetro inicial</dt><dd>${kmF(seg.from.odometer)}</dd></div><div><dt>Odómetro final</dt><dd>${kmF(seg.to.odometer)}</dd></div>
      <div><dt>Distancia</dt><dd><b>${kmF(seg.km)}</b></dd></div>
      <div><dt>Recargas incluidas</dt><dd>${seg.records.map((x) => `${esc(fmtDate(x.date))}: ${lF(x.liters)}${x.fullTank ? '' : ' (parcial)'}`).join('<br>')}</dd></div>
      <div><dt>Total combustible</dt><dd><b>${lF(seg.liters)}</b></dd></div>
    </dl>
    <div class="calc-box"><span>${nf(seg.km)} ÷ ${nf(seg.liters, 2)} = <b>${seg.kmL.toFixed(2)} km/L</b></span><span>${nf(seg.liters, 2)} ÷ ${nf(seg.km)} × 100 = <b>${seg.l100.toFixed(2)} L/100 km</b></span></div>
    ${seg.id !== r.id ? '<p class="grp-note">Esta carga parcial forma parte del periodo mostrado.</p>' : ''}`
    : `<p class="op-warn">${icon.info}<span>${esc(STATUS[row.status] || '')}. ${row.status === 'sinbase' ? 'No hay un tanque lleno anterior para medir el consumo.' : 'Rendimiento pendiente: se requiere una siguiente carga con tanque lleno.'}</span></p>`;
  const sh = openSheet({ title: `${v.label} | ${fmtDate(r.date)} ${r.time}`, full: true, body: `
    <dl class="sumlist">
      <div><dt>Odómetro GPS</dt><dd>${kmF(r.odometer)}</dd></div>
      <div><dt>Km desde la recarga anterior</dt><dd>${row.km != null ? `${nf(r.odometer)} − ${nf(row.prev.odometer)} = <b>${kmF(row.km)}</b>` : row.brk ? 'Corrección de odómetro (no se calcula)' : 'Primera recarga registrada'}</dd></div>
      <div><dt>Litros</dt><dd>${lF(r.liters)}</dd></div><div><dt>Importe</dt><dd>${money(r.amount)}</dd></div>
      <div><dt>Precio por litro</dt><dd>${row.ppl != null ? `${money(r.amount)} ÷ ${nf(r.liters, 2)} = <b>${pplF(row.ppl)}</b>` : '—'}</dd></div>
      <div><dt>Tipo de carga</dt><dd>${r.fullTank ? 'Tanque lleno' : 'Parcial'}</dd></div>
      ${r.station ? `<div><dt>Estación</dt><dd>${esc(r.station)}</dd></div>` : ''}${r.reference ? `<div><dt>Referencia</dt><dd>${esc(r.reference)}</dd></div>` : ''}${r.notes ? `<div><dt>Observaciones</dt><dd>${esc(r.notes)}</dd></div>` : ''}
    </dl>${calc}
    <p class="grp-note">Registrada ${new Date(r.createdAt).toLocaleString('es-MX')}${r.createdBy ? ' por ' + esc(r.createdBy) : ''}${r.updatedAt !== r.createdAt ? ` | modificada ${new Date(r.updatedAt).toLocaleString('es-MX')}` : ''}</p>
    <div class="sheet-acts"><button type="button" class="btn-secondary" data-edit>${icon.edit}<span>Editar</span></button><button type="button" class="btn-danger" data-del>${icon.trash}<span>Eliminar</span></button></div>` });
  sh.body.querySelector('[data-edit]').addEventListener('click', () => { sh.close(); openFuelForm(v, r, onChange); });
  sh.body.querySelector('[data-del]').addEventListener('click', async () => {
    if (!(await confirmDestructive('¿Eliminar esta recarga?', `${fmtDate(r.date)} ${r.time} | ${lF(r.liters)}. Los rendimientos de los periodos afectados se recalcularán.`, 'Eliminar recarga'))) return;
    await fuel.deleteFuelRecord(r.id); sh.close(); toast('Recarga eliminada; rendimientos recalculados', { type: 'info' }); onChange && onChange();
  });
}

/* ===== Formulario de recarga ===== */
function openFuelForm(v, rec, onSaved) {
  const editing = !!rec;
  let full = editing ? !!rec.fullTank : true;
  const form = document.createElement('form');
  form.className = 'op-form'; form.noValidate = true;
  form.innerHTML = `<div class="op-who"><span class="unit-badge">${esc(v.label)}</span><div><small>Unidad</small><b>${esc(v.placas || 'Sin placas')}</b></div></div>
    <div class="row2"><label class="fld" data-f="date"><span class="fl">Fecha</span><input class="in" type="date" name="date" value="${esc(editing ? rec.date : todayStr())}"><span class="ferr" data-err="date"></span></label>
      <label class="fld" data-f="time"><span class="fl">Hora</span><input class="in" type="time" name="time" value="${esc(editing ? rec.time : nowHM())}"></label></div>
    <label class="fld" data-f="odometer"><span class="fl">Odómetro GPS (km)</span><input class="in" name="odometer" inputmode="numeric" autocomplete="off" placeholder="Ej. 126,280" value="${editing ? nf(rec.odometer) : ''}" enterkeyhint="next"><span class="fhint" data-odo></span><span class="ferr" data-err="odometer"></span></label>
    <div class="row2"><label class="fld" data-f="liters"><span class="fl">Litros cargados</span><input class="in" name="liters" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(editing ? rec.liters : '')}" enterkeyhint="next"><span class="ferr" data-err="liters"></span></label>
      <label class="fld" data-f="amount"><span class="fl">Importe ($)</span><span class="money-w"><span class="money-sym">$</span><input class="in money" name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${editing ? centsInput(rec.amount) : ''}" enterkeyhint="next"></span><span class="ferr" data-err="amount"></span></label></div>
    <p class="calc-line" data-ppl></p>
    <div class="fld"><span class="fl">Tipo de carga</span><div class="seg big"><button type="button" class="seg-b${full ? ' on' : ''}" data-full="1">Tanque lleno</button><button type="button" class="seg-b${full ? '' : ' on'}" data-full="0">Parcial</button></div>
      <span class="fhint">El rendimiento se mide entre dos cargas de tanque lleno; las parciales se suman al periodo.</span></div>
    <label class="fld"><span class="fl">Estación o proveedor (opcional)</span><input class="in" name="station" value="${esc(editing ? rec.station || '' : '')}" autocapitalize="words" enterkeyhint="next"></label>
    <label class="fld"><span class="fl">Ticket o referencia (opcional)</span><input class="in" name="reference" value="${esc(editing ? rec.reference || '' : '')}" autocapitalize="characters" enterkeyhint="next"></label>
    <label class="fld" data-f="notes"><span class="fl">Observaciones (opcional)</span><textarea class="in" name="notes" rows="2">${esc(editing ? rec.notes || '' : '')}</textarea><span class="ferr" data-err="notes"></span></label>
    <div class="form-foot"><button type="submit" class="btn-primary block lg">Guardar recarga</button></div>`;
  const sh = openSheet({ title: editing ? 'Editar recarga' : 'Registrar recarga', body: form, full: true, className: 'form-sheet' });
  enterAdvances(form);
  const odoNum = () => { const t = form.elements.odometer.value.replace(/[,\s]/g, ''); return /^\d{1,7}$/.test(t) ? +t : NaN; };
  const litNum = () => { const t = form.elements.liters.value.replace(/[,\s]/g, ''); return /^\d+(\.\d{1,2})?$/.test(t) && +t > 0 ? Math.round(+t * 100) / 100 : NaN; };
  function preview() {
    const odo = odoNum(), lit = litNum(), am = toCents(form.elements.amount.value), d = form.elements.date.value;
    const hint = form.querySelector('[data-odo]');
    if (!Number.isNaN(odo) && isDate(d)) {
      const ck = odometerCheck(fuel.recordsOf(v.id), { date: d, time: form.elements.time.value, odometer: odo }, editing ? rec.id : null);
      hint.className = 'fhint' + (ck.lowerThanPrev || ck.higherThanNext ? ' warn-t' : '');
      hint.textContent = ck.lowerThanPrev ? `Menor que la recarga anterior (${nf(ck.prev.odometer)} km del ${fmtDate(ck.prev.date)}).`
        : ck.higherThanNext ? `Mayor que la recarga siguiente (${nf(ck.next.odometer)} km del ${fmtDate(ck.next.date)}).`
          : ck.prev ? `Recorrido desde la recarga anterior: ${nf(ck.km)} km (${nf(ck.prev.odometer)} → ${nf(odo)}).` : 'Primera recarga de esta unidad.';
    } else hint.textContent = '';
    const ppl = !Number.isNaN(lit) && am > 0 ? am / 100 / lit : null;
    form.querySelector('[data-ppl]').innerHTML = ppl != null ? `Precio por litro: ${money(am)} ÷ ${nf(lit, 2)} L = <b>${pplF(ppl)}</b>` : '';
  }
  form.addEventListener('input', (e) => {
    if (e.target.classList.contains('money')) { const c = moneyClean(e.target.value); if (c !== e.target.value) e.target.value = c; }
    const f = e.target.closest('.fld'); if (f) { f.classList.remove('has-err'); const m = f.querySelector('.ferr'); if (m) m.textContent = ''; }
    preview();
  });
  form.querySelectorAll('[data-full]').forEach((b) => b.addEventListener('click', () => { full = b.dataset.full === '1'; form.querySelectorAll('[data-full]').forEach((x) => x.classList.toggle('on', x === b)); }));
  const fail = (name, msg) => { const f = form.querySelector(`[data-f="${name}"]`); if (f) { f.classList.add('has-err'); f.querySelector('.ferr').textContent = msg; f.scrollIntoView({ block: 'center', behavior: 'smooth' }); } toast(msg, { type: 'warn', ms: 3500 }); };
  let saving = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); if (saving) return;
    const date = form.elements.date.value, time = form.elements.time.value || '00:00', odo = odoNum(), lit = litNum(), am = toCents(form.elements.amount.value), notes = form.elements.notes.value.trim();
    if (!isDate(date)) return fail('date', 'La fecha no es válida.');
    if (Number.isNaN(odo) || odo <= 0) return fail('odometer', 'Escribe el odómetro GPS en km (solo números, sin negativos).');
    if (Number.isNaN(lit)) return fail('liters', 'Escribe los litros cargados (mayor a cero, máximo 2 decimales).');
    if (/^\s*-/.test(form.elements.amount.value)) return fail('amount', 'No se permiten importes negativos.');
    if (am == null || Number.isNaN(am) || am <= 0) return fail('amount', 'Escribe el importe de la recarga.');
    const ck = odometerCheck(fuel.recordsOf(v.id), { date, time, odometer: odo }, editing ? rec.id : null);
    let correction = false;
    if (ck.lowerThanPrev || ck.higherThanNext) {
      const msg = ck.lowerThanPrev ? `El odómetro (${nf(odo)} km) es menor que el de la recarga anterior (${nf(ck.prev.odometer)} km del ${fmtDate(ck.prev.date)}).` : `El odómetro (${nf(odo)} km) es mayor que el de la recarga siguiente (${nf(ck.next.odometer)} km del ${fmtDate(ck.next.date)}).`;
      const ok = await actionSheet({ title: 'Odómetro fuera de secuencia', message: `${msg} Revisa el dato. Si es una corrección excepcional (por ejemplo, cambio de GPS), regístrala con una observación: la medición de rendimiento se reiniciará en esta recarga.`, actions: [{ label: 'Registrar como corrección', value: true, style: 'destructive' }], cancel: 'Revisar el dato' });
      if (!ok) { form.elements.odometer.focus(); return; }
      if (!notes) return fail('notes', 'Escribe en Observaciones el motivo de la corrección del odómetro.');
      correction = true;
    }
    saving = true;
    try {
      await fuel.saveFuelRecord({ ...(editing ? { id: rec.id } : {}), vehicleId: v.id, date, time, odometer: odo, liters: lit, amount: am, fullTank: full, station: form.elements.station.value.trim(), reference: form.elements.reference.value.trim(), notes, odometerCorrection: correction });
      sh.close(); toast(editing ? 'Recarga actualizada; rendimientos recalculados' : 'Recarga registrada'); onSaved && onSaved();
    } catch (err) { toast(err.message || 'No se pudo guardar la recarga.', { type: 'warn' }); } finally { saving = false; }
  });
  preview();
}

/* Logotipo reducido al tamaño en que se muestra (el archivo pesa menos) */
async function smallLogo() {
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = './assets/brand/perconsur-mark.png'; });
  const h = 126, w = Math.round(h * im.naturalWidth / im.naturalHeight), c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(im, 0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png')); c.width = c.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

/* ===== Exportar a Excel ===== */
export async function openExport() {
  await fuel.loadFuel();
  const vs = fuel.vehicles();
  let per = 'todo', file = null;
  const PER = FUEL_PERIODS.filter(([k]) => ['todo', 'mes', 'mesAnt', 'anio', 'custom'].includes(k));
  const sh = openSheet({ title: 'Exportar registros', body: `<p class="sheet-lead">Hoja de cálculo .xlsx con las hojas Resumen general, Recargas y Resumen por unidad.</p>
    <div class="fld"><span class="fl">Periodo</span><div class="chips">${PER.map(([k, l]) => `<button type="button" class="chip${k === per ? ' on' : ''}" data-xp="${k}">${l}</button>`).join('')}</div></div>
    <div class="row2" data-xc hidden><label class="fld"><span class="fl">Desde</span><input class="in" type="date" data-xf="from"></label><label class="fld"><span class="fl">Hasta</span><input class="in" type="date" data-xf="to"></label></div>
    <label class="fld"><span class="fl">Unidad</span><span class="sel-w"><select class="in" data-xu><option value="">Todas las unidades</option>${vs.map((u) => `<option value="${esc(u.id)}">${esc(u.label)}${u.placas ? ' | ' + esc(u.placas) : ''}</option>`).join('')}</select><span class="sel-ic">${icon.down}</span></span></label>
    <div data-xout><button type="button" class="btn-primary block lg" data-xgo>${icon.download}<span>Generar Excel</span></button></div>` });
  const b = sh.body, custom = { from: '', to: '' };
  b.querySelectorAll('[data-xp]').forEach((x) => x.addEventListener('click', () => { per = x.dataset.xp; b.querySelectorAll('[data-xp]').forEach((y) => y.classList.toggle('on', y === x)); b.querySelector('[data-xc]').hidden = per !== 'custom'; reset(); }));
  b.querySelectorAll('[data-xf]').forEach((x) => x.addEventListener('change', () => { custom[x.dataset.xf] = x.value; reset(); }));
  b.querySelector('[data-xu]').addEventListener('change', reset);
  function reset() { if (file) { file = null; b.querySelector('[data-xout]').innerHTML = `<button type="button" class="btn-primary block lg" data-xgo>${icon.download}<span>Generar Excel</span></button>`; } }
  b.addEventListener('click', async (e) => {
    if (e.target.closest('[data-xgo]')) {
      const rg = fuelRange(per, custom);
      if (per === 'custom' && (!rg.from || !rg.to || rg.from > rg.to)) { toast('Elige un periodo personalizado válido (desde y hasta).', { type: 'warn' }); return; }
      busy(true, 'Generando Excel…');
      try {
        const uid = b.querySelector('[data-xu]').value, units = fuel.unitsAnalyzed().filter((u) => !uid || u.id === uid);
        const logoBytes = await smallLogo();
        const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
        const perLabel = per === 'custom' ? `${fmtDate(rg.from)} a ${fmtDate(rg.to)}` : (PER.find(([k]) => k === per) || [])[1] + (rg.from ? ` (${fmtDate(rg.from)} a ${fmtDate(rg.to)})` : '');
        const unitLabel = uid ? units[0].label : 'Todas';
        const wb = buildFuelWorkbook(units, rg, { company: getCompany('perconsur').legal, periodLabel: perLabel, unitLabel, generated: `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`, logo: { png: logoBytes, w: 334, h: 344 } });
        const slug = (uid ? units[0].label + '-' : '') + (per === 'custom' ? `${rg.from}_a_${rg.to}` : per);
        file = new File([wb.bytes()], `PERCONSUR-combustible-${slug}-${todayStr()}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        busy(false);
        b.querySelector('[data-xout]').innerHTML = `<section class="ok-box stmt-ok">${icon.check}<span><b>Excel generado</b><small>${esc(file.name)} | ${Math.max(1, Math.round(file.size / 1024))} KB</small></span></section>
          <div class="sheet-acts"><button type="button" class="btn-primary" data-xs="0">${icon.share}<span>Compartir</span></button><button type="button" class="btn-secondary" data-xs="1">${icon.folder}<span>Guardar en Archivos</span></button></div>`;
      } catch (err) { busy(false); console.error(err); toast('No se pudo generar el Excel.', { type: 'warn' }); }
    }
    const sb = e.target.closest('[data-xs]');
    if (sb && file) {
      const r = await shareFile(file, { title: file.name });
      if (r === 'shared') toast(sb.dataset.xs === '1' ? 'Listo' : 'Excel compartido');
      else if (r !== 'cancelled') { downloadBlob(file, file.name); toast(isIOS() ? 'Se abrió la descarga del Excel. Desde ahí puedes guardarlo en Archivos.' : 'Excel descargado: ' + file.name, { ms: 3500 }); }
    }
  });
}
