/*
 * Reporte Excel de combustible y rendimiento (identidad PERCONSUR).
 * Hojas: «Resumen general», «Recargas», «Resumen por unidad».
 * Los totales, precios por litro y sumas por unidad son FÓRMULAS (recalculan si se edita la hoja) y llevan su valor
 * calculado. El rendimiento (método de tanque lleno) se escribe como valor porque depende de varios registros.
 */
import { Workbook, xlDate, xlTime } from '../../services/xlsx.js';
import { periodMetrics, fleetSummary } from './fuel.js';

const C = { blue: '#354FA3', blueD: '#233878', orange: '#F26F22', light: '#EEF1F8', zebra: '#F7F8FB', ink: '#1A2233', muted: '#5D6778', line: '#D5DAE4' };
const F = { money: '"$"#,##0.00', km: '#,##0" km"', l: '#,##0.00" L"', kmL: '0.00" km/L"', l100: '0.00" L/100 km"', date: 'dd/mm/yyyy', time: 'hh:mm', int: '#,##0' };
const inRange = (d, rg) => (!rg.from || d >= rg.from) && (!rg.to || d <= rg.to);

/* units: [{ id, label, placas, an }]; meta: { company, periodLabel, unitLabel, generated, logo: { png, w, h } } */
export function buildFuelWorkbook(units, rg, meta) {
  const wb = new Workbook(); wb.title = 'Combustible y rendimiento';
  const S = {
    co: wb.style({ b: true, sz: 13, color: C.blue }), title: wb.style({ b: true, sz: 11, color: C.ink }), sub: wb.style({ sz: 9, color: C.muted }),
    bandB: wb.style({ fill: C.blue }), bandO: wb.style({ fill: C.orange }),
    th: wb.style({ b: true, sz: 10, color: '#FFFFFF', fill: C.blue, h: 'center', v: 'center', wrap: true, border: 'all', borderColor: C.blueD }),
    note: wb.style({ i: true, sz: 9, color: C.muted, wrap: true, v: 'top' }),
  };
  const cell = (fmt, zebra, extra = {}) => wb.style({ sz: 10, color: C.ink, border: 'bottom', fmt, ...(zebra ? { fill: C.zebra } : {}), ...extra });
  const tot = (fmt) => wb.style({ b: true, sz: 10, color: C.blueD, fill: C.light, border: ['top', 'bottom'], borderColor: C.blue, fmt });

  function header(sh, ncols, title) {
    sh.height(0, 24).height(1, 18).height(2, 16).height(3, 5).height(4, 10);
    sh.set(0, 1, meta.company, S.co).merge(0, 1, 0, ncols - 1);
    sh.set(1, 1, title, S.title).merge(1, 1, 1, ncols - 1);
    sh.set(2, 1, `Periodo: ${meta.periodLabel}   |   Unidad: ${meta.unitLabel}   |   Generado: ${meta.generated}`, S.sub).merge(2, 1, 2, ncols - 1);
    const split = Math.max(1, Math.round(ncols * 0.78));
    for (let c = 0; c < ncols; c++) sh.set(3, c, '', c < split ? S.bandB : S.bandO);
    if (meta.logo) sh.image(meta.logo.png, { row: 0, col: 0, w: Math.round(42 * meta.logo.w / meta.logo.h), h: 42, dx: 4, dy: 4 });
  }

  /* ===== Datos del periodo ===== */
  const rows = units.flatMap((u) => u.an.rows.filter((x) => inRange(x.rec.date, rg)).map((x) => ({ u, x })))
    .sort((a, b) => (a.x.rec.date + a.x.rec.time < b.x.rec.date + b.x.rec.time ? -1 : 1));
  const fleet = fleetSummary(units, rg);
  const active = fleet.units.filter((u) => u.m.count > 0);

  /* ===== Hoja Recargas ===== */
  const R = wb.sheet('Recargas', { cols: [12, 8, 10, 12, 14, 14, 12, 15, 13, 14, 15, 17, 22, 16, 34], tab: C.blue });
  const heads = ['Fecha', 'Hora', 'Unidad', 'Placas', 'Odómetro', 'Km recorridos', 'Litros', 'Importe', 'Precio por litro', 'Tipo de carga', 'Rendimiento km/L', 'Consumo L/100 km', 'Estación', 'Referencia', 'Observaciones'];
  header(R, heads.length, 'Recargas de combustible');
  const H0 = 5; R.height(H0, 30); heads.forEach((h, c) => R.set(H0, c, h, S.th));
  const first = H0 + 1; let r = first;
  for (const { u, x } of rows) {
    const z = (r - first) % 2 === 1, rec = x.rec, n = r + 1, seg = x.segment;
    R.set(r, 0, xlDate(rec.date), cell(F.date, z, { h: 'center' })).set(r, 1, xlTime(rec.time), cell(F.time, z, { h: 'center' }))
      .set(r, 2, u.label, cell(null, z, { b: true, h: 'center' })).set(r, 3, u.placas || '', cell(null, z, { h: 'center' }))
      .set(r, 4, rec.odometer, cell(F.km, z)).set(r, 5, x.km > 0 ? x.km : '', cell(F.km, z))
      .set(r, 6, rec.liters, cell(F.l, z)).set(r, 7, rec.amount / 100, cell(F.money, z))
      .set(r, 8, x.ppl != null ? Math.round(x.ppl * 10000) / 10000 : '', cell(F.money, z), `IF(AND(G${n}>0,H${n}>0),H${n}/G${n},"")`)
      .set(r, 9, rec.fullTank ? 'Tanque lleno' : 'Parcial', cell(null, z, { h: 'center' }))
      .set(r, 10, seg ? Math.round(seg.kmL * 100) / 100 : '', cell(F.kmL, z, seg ? { b: true } : {})).set(r, 11, seg ? Math.round(seg.l100 * 100) / 100 : '', cell(F.l100, z))
      .set(r, 12, rec.station || '', cell(null, z)).set(r, 13, rec.reference || '', cell(null, z)).set(r, 14, rec.notes || '', cell(null, z, { wrap: true }));
    r++;
  }
  const last = Math.max(first, r - 1), sumCol = (col, val) => ({ f: `SUBTOTAL(109,${col}${first + 1}:${col}${last + 1})`, v: val });
  const tr = r, km = rows.reduce((a, { x }) => a + (x.km > 0 ? x.km : 0), 0), lt = Math.round(rows.reduce((a, { x }) => a + x.rec.liters, 0) * 100) / 100, am = rows.reduce((a, { x }) => a + x.rec.amount, 0) / 100;
  R.set(tr, 0, `Total (${rows.length} recargas)`, tot(null)).merge(tr, 0, tr, 3);
  for (let c = 1; c < heads.length; c++) R.set(tr, c, '', tot(null));
  const s5 = sumCol('F', km), s6 = sumCol('G', lt), s7 = sumCol('H', am);
  R.set(tr, 5, s5.v, tot(F.km), s5.f).set(tr, 6, s6.v, tot(F.l), s6.f).set(tr, 7, s7.v, tot(F.money), s7.f)
    .set(tr, 8, lt > 0 ? Math.round((am / lt) * 10000) / 10000 : '', tot(F.money), `IF(G${tr + 1}>0,H${tr + 1}/G${tr + 1},"")`);
  R.freeze(H0 + 1).filter(H0, 0, last, heads.length - 1);
  R.set(tr + 2, 0, 'Rendimiento por el método de tanque lleno: se muestra en la carga que cierra cada periodo (de un tanque lleno al siguiente) y considera todos los litros cargados en ese periodo, incluidas las cargas parciales.', S.note).merge(tr + 2, 0, tr + 2, 11).height(tr + 2, 28);

  /* ===== Hoja Resumen por unidad ===== */
  const U = wb.sheet('Resumen por unidad', { cols: [12, 13, 11, 15, 15, 16, 15, 17, 18, 13], tab: C.orange });
  const uh = ['Unidad', 'Placas', 'Recargas', 'Kilómetros', 'Litros', 'Gasto', 'Precio promedio por litro', 'Rendimiento promedio', 'Consumo L/100 km', 'Periodos medidos'];
  header(U, uh.length, 'Resumen por unidad');
  U.height(H0, 30); uh.forEach((h, c) => U.set(H0, c, h, S.th));
  const RG = (col) => `Recargas!$${col}$${first + 1}:$${col}$${last + 1}`;
  let ur = first;
  for (const u of active) {
    const z = (ur - first) % 2 === 1, n = ur + 1, m = u.m;
    U.set(ur, 0, u.label, cell(null, z, { b: true, h: 'center' })).set(ur, 1, u.placas || '', cell(null, z, { h: 'center' }))
      .set(ur, 2, m.count, cell(F.int, z, { h: 'center' }), `COUNTIFS(${RG('C')},A${n})`)
      .set(ur, 3, m.km, cell(F.km, z), `SUMIFS(${RG('F')},${RG('C')},A${n})`)
      .set(ur, 4, m.liters, cell(F.l, z), `SUMIFS(${RG('G')},${RG('C')},A${n})`)
      .set(ur, 5, m.amount / 100, cell(F.money, z), `SUMIFS(${RG('H')},${RG('C')},A${n})`)
      .set(ur, 6, m.avgPrice != null ? Math.round(m.avgPrice * 10000) / 10000 : '', cell(F.money, z), `IFERROR(SUMIFS(${RG('H')},${RG('C')},A${n},${RG('H')},">0")/SUMIFS(${RG('G')},${RG('C')},A${n},${RG('H')},">0"),"")`)
      .set(ur, 7, m.perf ? Math.round(m.perf.kmL * 100) / 100 : 'Pendiente', cell(m.perf ? F.kmL : null, z, { b: !!m.perf, h: 'right', ...(m.perf ? {} : { color: C.muted, i: true }) }))
      .set(ur, 8, m.perf ? Math.round(m.perf.l100 * 100) / 100 : '', cell(F.l100, z)).set(ur, 9, m.perf ? m.perf.n : 0, cell(F.int, z, { h: 'center' }));
    ur++;
  }
  const ul = Math.max(first, ur - 1), ut = ur, uRange = (col) => `${col}${first + 1}:${col}${ul + 1}`;
  U.set(ut, 0, 'Total flota', tot(null)).merge(ut, 0, ut, 1).set(ut, 1, '', tot(null))
    .set(ut, 2, fleet.count, tot(F.int), `SUM(${uRange('C')})`).set(ut, 3, fleet.km, tot(F.km), `SUM(${uRange('D')})`)
    .set(ut, 4, fleet.liters, tot(F.l), `SUM(${uRange('E')})`).set(ut, 5, fleet.amount / 100, tot(F.money), `SUM(${uRange('F')})`)
    .set(ut, 6, fleet.avgPrice != null ? Math.round(fleet.avgPrice * 10000) / 10000 : '', tot(F.money), `IFERROR(SUMIFS(${RG('H')},${RG('H')},">0")/SUMIFS(${RG('G')},${RG('H')},">0"),"")`)
    .set(ut, 7, fleet.perf ? Math.round(fleet.perf.kmL * 100) / 100 : 'Pendiente', tot(fleet.perf ? F.kmL : null)).set(ut, 8, fleet.perf ? Math.round(fleet.perf.l100 * 100) / 100 : '', tot(F.l100))
    .set(ut, 9, fleet.perf ? fleet.perf.n : 0, tot(F.int));
  U.freeze(H0 + 1).filter(H0, 0, ul, uh.length - 1);
  U.set(ut + 2, 0, 'Rendimiento promedio = kilómetros de los periodos medidos ÷ litros de esos periodos (método de tanque lleno). «Pendiente»: aún no hay dos cargas de tanque lleno en el periodo.', S.note).merge(ut + 2, 0, ut + 2, 9).height(ut + 2, 28);

  /* ===== Hoja Resumen general (primera) ===== */
  const G = wb.sheet('Resumen general', { cols: [40, 22, 52], tab: C.blueD, landscape: false });
  header(G, 3, 'Reporte de combustible y rendimiento');
  G.height(H0, 24); ['Indicador', 'Valor', 'Cómo se obtiene'].forEach((h, c) => G.set(H0, c, h, S.th));
  const lab = wb.style({ sz: 10, color: C.ink, border: 'bottom', indent: 1 }), how = wb.style({ sz: 9, color: C.muted, border: 'bottom', wrap: true });
  const val = (fmt) => wb.style({ b: true, sz: 11, color: C.ink, border: 'bottom', h: 'right', fmt });
  const UR = `'Resumen por unidad'!`;
  const K = [
    ['Unidades con recargas', active.length, F.int, `COUNTA(${UR}A${first + 1}:A${ul + 1})`, 'Unidades con al menos una recarga en el periodo'],
    ['Recargas registradas', fleet.count, F.int, `COUNTA(Recargas!A${first + 1}:A${last + 1})`, 'Número de registros en la hoja Recargas'],
    ['Litros cargados', fleet.liters, F.l, `SUM(Recargas!G${first + 1}:G${last + 1})`, 'Suma de litros de todas las recargas'],
    ['Gasto total', fleet.amount / 100, F.money, `SUM(Recargas!H${first + 1}:H${last + 1})`, 'Suma de importes'],
    ['Precio promedio por litro', fleet.avgPrice != null ? Math.round(fleet.avgPrice * 10000) / 10000 : '', F.money, `IFERROR(SUMIFS(Recargas!H${first + 1}:H${last + 1},Recargas!H${first + 1}:H${last + 1},">0")/SUMIFS(Recargas!G${first + 1}:G${last + 1},Recargas!H${first + 1}:H${last + 1},">0"),"")`, 'Gasto ÷ litros (recargas con importe)'],
    ['Kilómetros registrados', fleet.km, F.km, `SUM(Recargas!F${first + 1}:F${last + 1})`, 'Suma de la diferencia de odómetro entre recargas consecutivas'],
    ['Rendimiento promedio de la flota', fleet.perf ? Math.round(fleet.perf.kmL * 100) / 100 : 'Pendiente', fleet.perf ? F.kmL : null, null, 'Km de periodos medidos ÷ litros de esos periodos (tanque lleno a tanque lleno)'],
    ['Consumo promedio', fleet.perf ? Math.round(fleet.perf.l100 * 100) / 100 : '', F.l100, null, 'Litros de periodos medidos ÷ km × 100'],
    ['Periodos de rendimiento medidos', fleet.perf ? fleet.perf.n : 0, F.int, null, 'Periodos cerrados entre dos cargas de tanque lleno'],
  ];
  K.forEach(([k, v, fmt, f, h], i) => { const rr = first + i; G.height(rr, 20); G.set(rr, 0, k, lab).set(rr, 1, v, val(fmt), f).set(rr, 2, h, how); });
  G.freeze(H0 + 1);
  wb.sheets.unshift(wb.sheets.pop());   // «Resumen general» como primera hoja
  return wb;
}
