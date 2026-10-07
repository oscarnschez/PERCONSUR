/*
 * Reporte de cobranza — diseño del documento.
 *
 * Igual que el estado de cuenta de operador: produce un MODELO DE PÁGINAS (tamaño carta, coordenadas en puntos) que se
 * dibuja como vista previa (SVG) y como PDF vectorial (pdf-lib) con pageToSVG() y modelToPdf() de operators/statement.js.
 * Contenido: resumen por división → desglose de lo POR COBRAR → desglose de lo PAGADO (viajes y demoras en planta).
 * Los importes salen de summarize() y de los mismos renglones que muestra la pantalla de Cobranza.
 */
import { fmtDate } from '../operators/balance.js';
import { PAGE, COLOR, docMoney, pdfSafe, longDate } from '../operators/statement.js';
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
  const pages = [];
  let page = null, y = 0;
  const W = (t, s, b) => measure(pdfSafe(t), s, b);
  const divLabel = divisions.length > 1 ? 'Puerto y Campo' : DIV[divisions[0]];
  const asc = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const scope = divisions.flatMap((d) => items.filter((it) => it.division === d));
  const total = summarize(scope);

  /* ===== Primitivas (mismas que el estado de cuenta) ===== */
  const text = (x, yy, str, o = {}) => page.items.push({ t: 'text', x, y: yy, text: pdfSafe(str), s: o.s || 8, b: !!o.b, c: o.c || COLOR.ink, a: o.a || 'start' });
  const rect = (x, yy, w, h, o = {}) => page.items.push({ t: 'rect', x, y: yy, w, h, fill: o.fill || null, stroke: o.stroke || null, sw: o.sw || 0.6 });
  const line = (x1, y1, x2, y2, o = {}) => page.items.push({ t: 'line', x1, y1, x2, y2, c: o.c || COLOR.line, w: o.w || 0.6 });
  const image = (key, x, yy, w, h) => page.items.push({ t: 'image', key, x, y: yy, w, h });
  function fit(str, s, b, maxW) {
    let t = pdfSafe(str);
    if (W(t, s, b) <= maxW) return t;
    while (t.length > 1 && W(t + '…', s, b) > maxW) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }
  function wrap(str, s, b, maxW, maxLines = 2) {
    const words = pdfSafe(str).split(' ').filter(Boolean);
    if (!words.length) return [''];
    const lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (cur && W(t, s, b) > maxW) { lines.push(cur); cur = w; } else cur = t; });
    lines.push(cur);
    if (lines.length > maxLines) { const rest = lines.slice(maxLines - 1).join(' '); lines.length = maxLines - 1; lines.push(rest + '…'); }
    return lines.map((l) => fit(l, s, b, maxW));
  }
  const band = (yy, h) => { rect(PAGE.ml, yy, CW * 0.78, h, { fill: COLOR.blue }); rect(PAGE.ml + CW * 0.78, yy, CW * 0.22, h, { fill: COLOR.orange }); };
  const wordmark = (x, yy, h) => {
    if (imgs.word) { const w = h * imgs.word.w / imgs.word.h; image('word', x, yy, w, h); return w; }
    text(x, yy + h * 0.82, 'PERCONSUR', { s: h * 0.95, b: true, c: COLOR.blue }); return W('PERCONSUR', h * 0.95, true);
  };

  /* ===== Encabezados ===== */
  function firstHeader() {
    const mh = 42, mw = mh * imgs.mark.w / imgs.mark.h;
    image('mark', PAGE.ml, 38, mw, mh);
    const x = PAGE.ml + mw + 10;
    wordmark(x, 40, 19);
    text(x, 72, company.legal, { s: 7.4, b: true });
    text(x, 81.5, company.addr1, { s: 6.8, c: COLOR.muted });
    text(x, 90.5, company.addr2, { s: 6.8, c: COLOR.muted });
    text(x, 99.5, [company.email, company.web].filter(Boolean).join('  |  '), { s: 6.8, c: COLOR.muted });
    text(R, 52, 'REPORTE DE COBRANZA', { s: 12.5, b: true, c: COLOR.blue, a: 'end' });
    const kv = [['Fecha de emisión', longDate(issued)], ['Periodo', periodLabel], ['División', divLabel]];
    kv.forEach(([k, v], i) => {
      const yy = 70 + i * 11.5;
      text(R, yy, v, { s: 8, b: true, a: 'end' });
      text(R - W(v, 8, true) - 8, yy, k, { s: 7.2, c: COLOR.muted, a: 'end' });
    });
    band(112, 3.2);
    return 130;
  }
  function contHeader() {
    const mh = 22, mw = mh * imgs.mark.w / imgs.mark.h;
    image('mark', PAGE.ml, 32, mw, mh);
    wordmark(PAGE.ml + mw + 7, 37, 11);
    text(R, 41, 'Reporte de cobranza', { s: 8, b: true, c: COLOR.blue, a: 'end' });
    text(R, 51, fit(`${divLabel}  |  ${periodLabel}  |  Emitido ${fmtDate(issued)}`, 7, false, 320), { s: 7, c: COLOR.muted, a: 'end' });
    band(62, 1.6);
    return 78;
  }
  function newPage() { page = { w: PAGE.w, h: PAGE.h, items: [] }; pages.push(page); y = pages.length === 1 ? firstHeader() : contHeader(); }
  const fits = (h) => y + h <= PAGE.bottom;
  const ensure = (h) => { if (!fits(h)) { newPage(); return true; } return false; };

  /* ===== Bloques ===== */
  function section(title, minAfter = 30) {
    ensure(26 + minAfter);
    text(PAGE.ml, y + 11, title.toUpperCase(), { s: 9, b: true, c: COLOR.blue });
    line(PAGE.ml, y + 16, R, y + 16, { c: COLOR.blue, w: 0.8 });
    y += 24;
  }
  /* Franja que abre cada mitad del desglose (por cobrar / pagado) con su total */
  function banner(title, amount, color) {
    ensure(28 + 70);
    rect(PAGE.ml, y, CW, 22, { fill: color });
    text(PAGE.ml + 10, y + 14.6, title, { s: 10.5, b: true, c: WHITE });
    text(R - 10, y + 14.6, amount, { s: 10.5, b: true, c: WHITE, a: 'end' });
    y += 30;
  }
  /* Tabla con encabezado repetido en cada página y filas que nunca se dividen */
  function table(title, cols, rows, { empty, totalRows = [] } = {}) {
    const HH = 17, LH = 9.6;
    const xs = []; let acc = PAGE.ml; cols.forEach((c) => { xs.push(acc); acc += c.w; });
    const header = () => {
      rect(PAGE.ml, y, CW, HH, { fill: COLOR.blueL });
      cols.forEach((c, i) => text(c.align === 'right' ? xs[i] + c.w - 5 : xs[i] + 5, y + 11.3, c.label, { s: 6.9, b: true, c: COLOR.blueD, a: c.align === 'right' ? 'end' : 'start' }));
      y += HH;
    };
    const prep = (r) => ({ ...r, h: Math.max(16.5, 7 + Math.max(...r.cells.map((c) => (c.lines || ['']).length * LH + (c.sub ? 7.6 : 0))) + 1) });
    const all = rows.map(prep), tots = totalRows.map(prep);
    if (!all.length) {
      section(title, 26);
      rect(PAGE.ml, y, CW, 24, { fill: COLOR.faint });
      text(PAGE.ml + 10, y + 15, empty, { s: 8, c: COLOR.muted });
      y += 34;
      return;
    }
    section(title, HH + all[0].h + (all.length === 1 ? tots.reduce((a, r) => a + r.h, 0) : 0));
    header();
    const drawRow = (r, isTotal) => {
      if (isTotal) rect(PAGE.ml, y, CW, r.h, { fill: COLOR.faint });
      r.cells.forEach((c, i) => {
        const col = cols[i], right = col.align === 'right';
        const x = right ? xs[i] + col.w - 5 : xs[i] + 5 + (c.marker ? 8 : 0);
        if (c.marker) rect(xs[i] + 5, y + 6.2, 4.6, 4.6, { fill: c.marker });
        (c.lines || ['']).forEach((ln, k) => text(x, y + 11.2 + k * LH, ln, { s: 7.8, b: !!(c.b || isTotal), c: c.c || COLOR.ink, a: right ? 'end' : 'start' }));
        if (c.sub) text(x, y + 11.2 + (c.lines || ['']).length * LH - 1.8, c.sub, { s: 6.2, c: c.subC || COLOR.muted, a: right ? 'end' : 'start' });
      });
      y += r.h;
      line(PAGE.ml, y, R, y, { c: isTotal ? COLOR.blue : COLOR.line, w: isTotal ? 0.7 : 0.45 });
    };
    /* El último renglón viaja junto con los totales: un total nunca queda solo al inicio de una página */
    const totH = tots.reduce((a, r) => a + r.h, 0);
    all.forEach((r, k) => {
      if (!fits(r.h + (k === all.length - 1 ? totH : 0))) { newPage(); text(PAGE.ml, y + 9, `${title} (continuación)`, { s: 7.6, b: true, c: COLOR.blue }); y += 15; header(); }
      drawRow(r, false);
    });
    for (const r of tots) drawRow(r, true);
    y += 12;
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
  ensure(58);
  const bw = (CW - 10) / 2;
  const box = (x, label, sub, amount, accent, valueColor) => {
    rect(x, y, bw, 44, { fill: COLOR.blueL });
    rect(x, y, 3, 44, { fill: accent });
    text(x + 12, y + 16, label, { s: 9, b: true, c: COLOR.blueD });
    text(x + 12, y + 28, sub, { s: 6.8, c: COLOR.muted });
    text(x + bw - 10, y + 36, amount, { s: 14, b: true, c: valueColor, a: 'end' });
  };
  box(PAGE.ml, 'TOTAL POR COBRAR', `${plural(total.trips.due.n, 'viaje', 'viajes')} y ${plural(total.delays.due.n, 'demora', 'demoras')}`, docMoney(total.due, { mxn: true }), COLOR.orange, total.due ? COLOR.neg : COLOR.ink);
  box(PAGE.ml + bw + 10, 'TOTAL PAGADO', `${plural(total.trips.paid.n, 'viaje', 'viajes')} y ${plural(total.delays.paid.n, 'demora', 'demoras')}`, docMoney(total.paid, { mxn: true }), OK, COLOR.ink);
  y += 52;
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

  /* Nota final */
  ensure(40);
  line(PAGE.ml, y, R, y, { w: 0.45 });
  text(PAGE.ml, y + 12, `Este reporte refleja los viajes y las demoras registrados al ${longDate(issued)}. «Días» son los días transcurridos desde la fecha del viaje o de la demora.`, { s: 7, c: COLOR.muted });
  text(PAGE.ml, y + 21.5, 'Documento de control administrativo interno de PERCONSUR.', { s: 7, c: COLOR.muted });

  /* Pie de página con numeración */
  pages.forEach((p, i) => {
    p.items.push({ t: 'line', x1: PAGE.ml, y1: 750, x2: R, y2: 750, c: COLOR.line, w: 0.5 });
    p.items.push({ t: 'text', x: PAGE.w / 2, y: 763, text: pdfSafe(`PERCONSUR · Reporte de cobranza · Emitido ${fmtDate(issued)} · Página ${i + 1} de ${pages.length}`), s: 6.8, b: false, c: COLOR.muted, a: 'middle' });
  });
  return { pages, summary: total, count: scope.length };
}
