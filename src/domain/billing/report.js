/*
 * Reporte de cobranza — diseño del documento (lenguaje visual de DOCGEN 3.1, ver domain/shared/pageDoc.js).
 *
 * Igual que el estado de cuenta de operador: produce un MODELO DE PÁGINAS (tamaño carta, coordenadas en puntos) que se
 * dibuja como vista previa (SVG) y como PDF vectorial (pdf-lib) con pageToSVG() y modelToPdf() de operators/statement.js.
 * Contenido: resumen por división → desglose de lo POR COBRAR → desglose de lo PAGADO (viajes y demoras en planta).
 * Los importes salen de summarize() y de los mismos renglones que muestra la pantalla de Cobranza.
 */
import { fmtDate } from '../operators/balance.js';
import { PAGE, COLOR, docMoney, longDate } from '../operators/statement.js';
import { TR, createDoc } from '../shared/pageDoc.js';
import { summarize, delayRows, daysBetween } from './billing.js';

const CW = PAGE.w - PAGE.ml - PAGE.mr;
const R = PAGE.w - PAGE.mr;
const DIV = { puerto: 'División Puerto', campo: 'División Campo' };
const WHITE = '#FFFFFF', OK = '#1B7A43';

export function billingReportFilename(issued, divisions) {
  return `Reporte-cobranza-${issued}${divisions.length === 1 ? '-' + divisions[0] : ''}.pdf`;
}

/*
 * input = { company (encabezado: PERCONSUR), items (ya filtrados por periodo), divisions: ['puerto','campo'],
 *           periodLabel, issued, measure(text,size,bold)→pt, imgs: { mark:{w,h}, word:{w,h}|null } }
 */
export function buildBillingReport({ company, items, divisions, periodLabel, issued, measure, imgs }) {
  const divLabel = divisions.length > 1 ? 'Puerto y Campo' : DIV[divisions[0]];
  const asc = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const scope = divisions.flatMap((d) => items.filter((it) => it.division === d));
  const total = summarize(scope);
  const D = createDoc({
    measure, imgs, company,
    head: {
      kicker: 'Administración · Cobranza', title: 'Reporte de cobranza', sub: divLabel,
      meta: [{ label: 'Fecha de emisión', value: fmtDate(issued) }, { label: 'Periodo', value: periodLabel, w: 1.9 }, { label: 'División', value: divLabel, w: 1.2 },
        { label: 'Por cobrar', value: docMoney(total.due), w: 1.1, color: total.due ? COLOR.neg : COLOR.ink }, { label: 'Pagado', value: docMoney(total.paid), w: 1.1 }],
    },
    cont: { title: 'Reporte de cobranza', sub: [[`${divLabel}  ·  ${periodLabel}`, false]], asideLabel: 'Emitido', asideValue: fmtDate(issued) },
    foot: { left: 'PERCONSUR | Reporte de cobranza', center: `Emitido ${fmtDate(issued)}` },
  });
  const { text, rect, line, fit, wrap } = D;
  let y = 0;

  function newPage() { y = D.newPage(); }
  const fits = (h) => y + h <= PAGE.bottom;
  const ensure = (h) => { if (!fits(h)) { newPage(); return true; } return false; };

  /* ===== Bloques ===== */
  function section(title, minAfter = 30) { ensure(22 + minAfter); const r = D.sectionHead(y, title); y = r.y; return r.n; }
  /* Franja que abre cada mitad del desglose (por cobrar / pagado) con su total */
  function banner(title, amount, color) {
    ensure(28 + 70);
    D.rrect(PAGE.ml, y, CW, 22, 2.25, { fill: color });
    text(PAGE.ml + 10, y + 14.4, title, { s: 9, b: true, up: true, tr: TR, c: WHITE });
    text(R - 10, y + 14.6, amount, { s: 10.5, b: true, c: WHITE, a: 'end' });
    y += 32;
  }
  /* Tabla con encabezado repetido en cada página y filas que nunca se dividen */
  function table(title, cols, rows, { empty, totalRows = [] } = {}) {
    const HH = 16, LH = 9.6;
    const xs = []; let acc = PAGE.ml; cols.forEach((c) => { xs.push(acc); acc += c.w; });
    const prep = (r) => ({ ...r, h: Math.max(16.5, 7 + Math.max(...r.cells.map((c) => (c.lines || ['']).length * LH + (c.sub ? 7.6 : 0))) + 1) });
    const all = rows.map(prep), tots = totalRows.map(prep);
    if (!all.length) {
      section(title, 26);
      rect(PAGE.ml, y, CW, 24, { fill: COLOR.faint });
      text(PAGE.ml + 10, y + 15, empty, { s: 8, c: COLOR.muted });
      y += 36;
      return;
    }
    const n = section(title, HH + all[0].h + (all.length === 1 ? tots.reduce((a, r) => a + r.h, 0) : 0));
    y = D.tableHead(y, cols, xs, HH);
    let k = 0;
    const drawRow = (r, isTotal) => {
      D.rowFrame(y, r.h, k++, { total: isTotal });
      r.cells.forEach((c, i) => {
        const col = cols[i], right = col.align === 'right';
        const x = right ? xs[i] + col.w - 6 : xs[i] + 6 + (c.marker ? 8 : 0);
        if (c.marker) D.rrect(xs[i] + 6, y + 6.2, 4.6, 4.6, 1, { fill: c.marker });
        (c.lines || ['']).forEach((ln, j) => text(x, y + 11.2 + j * LH, ln, { s: 7.8, b: !!(c.b || isTotal), c: isTotal && !c.c ? COLOR.blue : c.c || COLOR.ink, a: right ? 'end' : 'start' }));
        if (c.sub) text(x, y + 11.2 + (c.lines || ['']).length * LH - 1.8, c.sub, { s: 6.2, c: c.subC || COLOR.muted, a: right ? 'end' : 'start' });
      });
      y += r.h;
    };
    /* El último renglón viaja junto con los totales: un total nunca queda solo al inicio de una página */
    const totH = tots.reduce((a, r) => a + r.h, 0);
    all.forEach((r, j) => {
      if (!fits(r.h + (j === all.length - 1 ? totH : 0))) { D.tableEnd(y); newPage(); y = D.sectionHead(y, `${title} (continuación)`, { n }).y; y = D.tableHead(y, cols, xs, HH); k = 0; }
      drawRow(r, false);
    });
    for (const r of tots) drawRow(r, true);
    D.tableEnd(y);
    y += 14;
  }
  const cell = (str, o = {}) => ({ lines: [str], ...o });
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  const sum = (arr) => arr.reduce((a, x) => a + (x.amount || 0), 0);

  /* ===== Documento ===== */
  newPage();

  /* Resumen: por división, viajes y demoras, por cobrar y pagado */
  const scols = [{ label: 'Concepto', w: 166 }, { label: 'Cant.', w: 36, align: 'right' }, { label: 'Por cobrar (MXN)', w: 94, align: 'right' },
    { label: 'Cant.', w: 36, align: 'right' }, { label: 'Pagado (MXN)', w: 90, align: 'right' }, { label: 'Total (MXN)', w: 94, align: 'right' }];
  const srow = (label, g, o = {}) => ({ cells: [cell(label, o), cell(String(g.due.n)), cell(docMoney(g.due.amount), { c: g.due.amount ? COLOR.neg : COLOR.ink }), cell(String(g.paid.n)), cell(docMoney(g.paid.amount)), cell(docMoney(g.due.amount + g.paid.amount))] });
  const srows = divisions.flatMap((d) => {
    const s = summarize(scope.filter((it) => it.division === d)), mk = d === 'campo' ? COLOR.orange : COLOR.blue;
    return [srow(`${DIV[d]} | Viajes`, s.trips, { marker: mk }), srow(`${DIV[d]} | Demoras en planta`, s.delays, { marker: mk })];
  });
  const both = { due: { n: total.trips.due.n + total.delays.due.n, amount: total.due }, paid: { n: total.trips.paid.n + total.delays.paid.n, amount: total.paid } };
  table('Resumen', scols, srows, { totalRows: [srow('Total', both)] });

  /* Totales destacados */
  ensure(60);
  const bw = (CW - 10) / 2;
  const box = (x, label, sub, amount, accent, valueColor) => {
    rect(x, y, bw, 46, { fill: COLOR.blueL }); rect(x, y, 2.25, 46, { fill: accent });
    line(x, y, x + bw, y, { c: COLOR.blue, w: 0.75 });
    text(x + 12, y + 15, label, { s: 7.9, b: true, up: true, tr: TR, c: COLOR.blueD });
    text(x + 12, y + 26, sub, { s: 6.8, c: COLOR.muted });
    text(x + bw - 10, y + 38, amount, { s: 14, b: true, c: valueColor, a: 'end' });
  };
  box(PAGE.ml, 'Total por cobrar', `${plural(total.trips.due.n, 'viaje', 'viajes')} y ${plural(total.delays.due.n, 'demora', 'demoras')}`, docMoney(total.due, { mxn: true }), COLOR.orange, total.due ? COLOR.neg : COLOR.ink);
  box(PAGE.ml + bw + 10, 'Total pagado', `${plural(total.trips.paid.n, 'viaje', 'viajes')} y ${plural(total.delays.paid.n, 'demora', 'demoras')}`, docMoney(total.paid, { mxn: true }), OK, COLOR.ink);
  y += 54;
  text(PAGE.ml, y + 4, 'El importe de cada viaje es su total después de impuestos (su tarifa, si no los tiene). Las demoras en planta se cobran por separado. Importes en MXN.', { s: 6.8, c: COLOR.muted });
  y += 20;

  /* Desglose */
  const tripCols = (paid) => (paid
    ? [{ label: 'Fecha', w: 50 }, { label: 'Operador', w: 118 }, { label: 'Viaje', w: 142 }, { label: 'Pagado el', w: 52 }, { label: 'Ref. de pago', w: 72 }, { label: 'Importe (MXN)', w: 82, align: 'right' }]
    : [{ label: 'Fecha', w: 50 }, { label: 'Operador', w: 130 }, { label: 'Viaje', w: 206 }, { label: 'Días', w: 42, align: 'right' }, { label: 'Importe (MXN)', w: 88, align: 'right' }]);
  const delayCols = (paid) => (paid
    ? [{ label: 'Fecha', w: 50 }, { label: 'Operador', w: 108 }, { label: 'Concepto / Viaje', w: 152 }, { label: 'Pagado el', w: 52 }, { label: 'Ref. de pago', w: 72 }, { label: 'Importe (MXN)', w: 82, align: 'right' }]
    : [{ label: 'Fecha', w: 50 }, { label: 'Operador', w: 120 }, { label: 'Concepto / Viaje', w: 216 }, { label: 'Días', w: 42, align: 'right' }, { label: 'Importe (MXN)', w: 88, align: 'right' }]);
  const routeCell = (it, w) => ({ lines: wrap(`${it.origin} -> ${it.destination}`, 7.8, false, w - 10), ...(it.tripRef ? { sub: fit(`Ref. ${it.tripRef}`, 6.2, false, w - 10), subC: COLOR.blueD } : {}) });
  const delaySub = (dl, w) => fit(`Viaje ${fmtDate(dl.item.date)}${dl.item.tripRef ? ` (Ref. ${dl.item.tripRef})` : ''}: ${dl.item.origin} -> ${dl.item.destination}`, 6.2, false, w - 10);
  const age = (d) => { const n = daysBetween(d, issued); return n == null || n < 0 ? '—' : String(n); };

  function half(paid) {
    const word = paid ? 'pagados' : 'por cobrar', wordF = paid ? 'pagadas' : 'por cobrar';
    banner(paid ? 'PAGADO' : 'POR COBRAR', docMoney(paid ? total.paid : total.due, { mxn: true }), paid ? OK : COLOR.orange);
    for (const d of divisions) {
      const its = scope.filter((it) => it.division === d);
      const trips = its.filter((it) => it.paid === paid).sort(asc);
      const delays = delayRows(its, paid).sort(asc);
      const tc = tripCols(paid), dc = delayCols(paid);
      table(`${DIV[d]} | Viajes ${word}`, tc, trips.map((it) => ({
        cells: paid
          ? [cell(fmtDate(it.date)), { lines: wrap(it.operator, 7.8, false, tc[1].w - 10) }, routeCell(it, tc[2].w), cell(fmtDate(it.paidDate) || '—'), cell(fit(it.reference || '—', 7.8, false, tc[4].w - 10)), cell(docMoney(it.amount))]
          : [cell(fmtDate(it.date)), { lines: wrap(it.operator, 7.8, false, tc[1].w - 10) }, routeCell(it, tc[2].w), cell(age(it.date)), cell(docMoney(it.amount))],
      })), {
        empty: `Sin viajes ${word} en ${DIV[d]}.`,
        totalRows: [{ cells: [cell(`Total (${plural(trips.length, 'viaje', 'viajes')})`), ...tc.slice(1, -1).map(() => cell('')), cell(docMoney(sum(trips)))] }],
      });
      table(`${DIV[d]} | Demoras en planta ${wordF}`, dc, delays.map((dl) => ({
        cells: paid
          ? [cell(fmtDate(dl.date)), { lines: wrap(dl.item.operator, 7.8, false, dc[1].w - 10) }, { lines: [fit(dl.concept, 7.8, false, dc[2].w - 10)], sub: delaySub(dl, dc[2].w) }, cell(fmtDate(dl.paidDate) || '—'), cell(fit(dl.reference || '—', 7.8, false, dc[4].w - 10)), cell(docMoney(dl.amount))]
          : [cell(fmtDate(dl.date)), { lines: wrap(dl.item.operator, 7.8, false, dc[1].w - 10) }, { lines: [fit(dl.concept, 7.8, false, dc[2].w - 10)], sub: delaySub(dl, dc[2].w) }, cell(age(dl.date)), cell(docMoney(dl.amount))],
      })), {
        empty: `Sin demoras en planta ${wordF} en ${DIV[d]}.`,
        totalRows: [{ cells: [cell(`Total (${plural(delays.length, 'demora', 'demoras')})`), ...dc.slice(1, -1).map(() => cell('')), cell(docMoney(sum(delays)))] }],
      });
    }
  }
  half(false);
  half(true);

  /* Nota final (declaración de DOCGEN: escudo y filo naranja) */
  const fin = `Este reporte refleja los viajes y las demoras registrados al ${longDate(issued)}. «Días» son los días transcurridos desde la fecha del viaje o de la demora. Documento de control administrativo interno de PERCONSUR.`;
  ensure(D.noteHeight(fin) + 4);
  y += D.note(y, fin, { icon: 'shield', accent: COLOR.orange, iconColor: COLOR.orangeD });

  /* Pie de página con numeración */
  const pages = D.finish();
  return { pages, summary: total, count: scope.length };
}
