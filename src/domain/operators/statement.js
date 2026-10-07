/*
 * Estado de cuenta de operador — diseño del documento.
 *
 * Produce un MODELO DE PÁGINAS (texto, líneas, rectángulos e imágenes con coordenadas en puntos, tamaño carta)
 * que se dibuja de dos maneras con el mismo resultado:
 *   - Vista previa: SVG en la app (services/statementPdf.js → pageSVG)
 *   - PDF vectorial: pdf-lib (services/statementPdf.js → renderStatementPdf)
 * Así la vista previa ES el documento: mismas páginas, saltos, tablas, totales, encabezado y pie.
 *
 * Los importes salen de computeOperator() con la fecha de corte elegida (fórmula única del módulo Operadores).
 * Nada se copia ni se guarda: el documento se arma con los registros actuales.
 */
import { computeOperator, isDate, fmtDate, ADJ_TARGETS, adjBalanceEffect, COMMISSION_RATE } from './balance.js';

export const PAGE = { w: 612, h: 792, ml: 48, mr: 48, bottom: 738 };
const CW = PAGE.w - PAGE.ml - PAGE.mr;          // 516 pt de ancho útil
const R = PAGE.w - PAGE.mr;                      // borde derecho
export const COLOR = { blue: '#354FA3', blueD: '#233878', blueL: '#EEF1F8', orange: '#F26F22', ink: '#1A2233', muted: '#5D6778', line: '#D5DAE4', faint: '#F4F6FA', neg: '#B42318' };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const longDate = (s) => (isDate(s) ? `${s.slice(8, 10)} de ${MESES[+s.slice(5, 7) - 1]} de ${s.slice(0, 4)}` : '');

/* Dinero para el documento: "$25,000.00" / "-$5,000.00" (guion normal, compatible con las fuentes del PDF) */
export function docMoney(cents, { sign = false, mxn = false } = {}) {
  const c = Math.round(cents || 0), a = Math.abs(c);
  const txt = Math.floor(a / 100).toLocaleString('en-US') + '.' + String(a % 100).padStart(2, '0');
  return `${c < 0 ? '-' : sign && c > 0 ? '+' : ''}$${txt}${mxn ? ' MXN' : ''}`;
}

/* Solo caracteres que las fuentes estándar del PDF (Helvetica, WinAnsi) pueden escribir */
const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function pdfSafe(t) {
  return [...String(t ?? '').replace(/\u2212/g, '-').replace(/\u2192/g, '->').replace(/\s+/g, ' ')].map((ch) => {
    const c = ch.charCodeAt(0);
    if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_EXTRA.includes(ch)) return ch;
    const d = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /^[\x20-\x7e]+$/.test(d) ? d : '?';
  }).join('');
}

/* Folio: EO-AAAAMMDD-NNN (consecutivo diario por fecha de emisión) */
export const statementFolio = (issued, n) => `EO-${issued.replace(/-/g, '')}-${String(n).padStart(3, '0')}`;
export function statementFilename(name, cutoff) {
  const slug = String(name || 'operador').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/gi, 'n')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'operador';
  return `Estado-de-cuenta-${slug}-${cutoff}.pdf`;
}

/*
 * input = { op, company (encabezado: PERCONSUR), opCompany (razón social del operador), rec, cutoff, folio, issued,
 *           measure(text,size,bold)→pt, imgs: { mark:{w,h}, word:{w,h}|null } }
 */
export function buildStatement({ op, company, opCompany, rec, cutoff, folio, issued, measure, imgs }) {
  const res = computeOperator(rec, { cutoff });
  const inc = res.included;
  const trips = [...inc.trips].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  const loans = [...inc.loans].sort((a, b) => (a.date < b.date ? -1 : 1));
  const adjs = [...inc.adjustments].sort((a, b) => (a.date < b.date ? -1 : 1));
  const st = res.settings;
  const pages = [];
  let page = null, y = 0;
  const W = (t, s, b) => measure(pdfSafe(t), s, b);

  /* ===== Primitivas ===== */
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
  /* Ajuste a varias líneas; si no cabe, la última termina en «…» */
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
    text(R, 52, 'ESTADO DE CUENTA DE OPERADOR', { s: 12.5, b: true, c: COLOR.blue, a: 'end' });
    const kv = [['Folio', folio], ['Fecha de emisión', longDate(issued)], ['Fecha de corte', longDate(res.cutoff)]];
    kv.forEach(([k, v], i) => {
      const yy = 70 + i * 11.5;
      text(R, yy, v, { s: 8, b: true, a: 'end', c: k === 'Folio' ? COLOR.orange : COLOR.ink });
      text(R - W(v, 8, true) - 8, yy, k, { s: 7.2, c: COLOR.muted, a: 'end' });
    });
    band(112, 3.2);
    return 130;
  }
  function contHeader() {
    const mh = 22, mw = mh * imgs.mark.w / imgs.mark.h;
    image('mark', PAGE.ml, 32, mw, mh);
    wordmark(PAGE.ml + mw + 7, 37, 11);
    text(R, 41, 'Estado de cuenta de operador', { s: 8, b: true, c: COLOR.blue, a: 'end' });
    text(R, 51, fit(`${op.name}  |  ${folio}  |  Corte ${fmtDate(res.cutoff)}`, 7, false, 300), { s: 7, c: COLOR.muted, a: 'end' });
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
  /* Cuadrícula de datos: [[etiqueta, valor, nota?], …] */
  function kvGrid(items, cols = 3) {
    const cw = CW / cols;
    for (let i = 0; i < items.length; i += cols) {
      const row = items.slice(i, i + cols), h = row.some((it) => it[2]) ? 36 : 29;
      ensure(h);
      row.forEach(([k, v, note], j) => {
        const x = PAGE.ml + j * cw;
        text(x, y + 9, k, { s: 6.8, c: COLOR.muted });
        text(x, y + 21, fit(v, 9.2, true, cw - 10), { s: 9.2, b: true });
        if (note) text(x, y + 30.5, fit(note, 6.6, false, cw - 10), { s: 6.6, c: COLOR.orange });
      });
      y += h;
      line(PAGE.ml, y - 3, R, y - 3, { c: COLOR.line, w: 0.5 });
    }
    y += 8;
  }
  /*
   * Tabla con encabezado repetido en cada página y filas que nunca se dividen.
   * cols: [{ label, w, align }]; rows: [{ cells: [{ lines:[…], sub, b, c, marker }], total }]
   */
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
    section(title, HH + all[0].h);
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
    for (const r of all) {
      if (!fits(r.h)) { newPage(); text(PAGE.ml, y + 9, `${title} (continuación)`, { s: 7.6, b: true, c: COLOR.blue }); y += 15; header(); }
      drawRow(r, false);
    }
    for (const r of tots) { if (!fits(r.h)) { newPage(); header(); } drawRow(r, true); }
    y += 12;
  }
  const cell = (str, o = {}) => ({ lines: [str], ...o });

  /* ===== Documento ===== */
  newPage();

  section('Datos del operador', 60);
  kvGrid([
    ['Operador', op.name], ['Empresa', opCompany || company.legal], ['Fecha de inicio de operación', isDate(st.startDate) ? fmtDate(st.startDate) : 'Sin configurar'],
    ['Fecha de corte del balance', fmtDate(res.cutoff)], ['Sábados contabilizados', String(res.sat.count), res.sat.manual ? 'Cantidad ajustada manualmente' : ''], ['Monto semanal', docMoney(st.weekly)],
  ]);

  /* Resumen de balance (misma fórmula y mismos datos que la ficha) */
  section('Resumen de balance', 130);
  const sumRows = [['Comisiones acumuladas', docMoney(res.comp.commissions, { sign: true })], ['Sábados pagados', docMoney(-res.comp.saturdaysPaid)], ['Gastos de viaje', docMoney(-res.comp.expenses)], ['Préstamos', docMoney(-res.comp.loans)]];
  sumRows.forEach(([k, v]) => { text(PAGE.ml + 4, y + 12, k, { s: 9 }); text(R - 4, y + 12, v, { s: 9, b: true, a: 'end' }); y += 18; line(PAGE.ml, y, R, y, { c: COLOR.line, w: 0.45 }); });
  y += 6;
  const neg = res.balance < 0;
  rect(PAGE.ml, y, CW, 40, { fill: COLOR.blueL });
  rect(PAGE.ml, y, 3, 40, { fill: neg ? COLOR.neg : COLOR.blue });
  text(PAGE.ml + 14, y + 17, 'BALANCE ACTUAL', { s: 10, b: true, c: COLOR.blueD });
  text(PAGE.ml + 14, y + 29.5, `Balance al ${longDate(res.cutoff)}`, { s: 7.2, c: COLOR.muted });
  text(R - 12, y + 25.5, docMoney(res.balance, { mxn: true }), { s: 16, b: true, c: neg ? COLOR.neg : COLOR.ink, a: 'end' });
  y += 48;
  text(PAGE.ml, y + 4, 'Balance = Comisiones – Sábados pagados – Gastos de viaje – Préstamos. Importes en pesos mexicanos (MXN).', { s: 6.8, c: COLOR.muted });
  if (neg) text(PAGE.ml, y + 13.5, 'El balance es negativo: el operador tiene un saldo en contra a la fecha de corte.', { s: 6.8, c: COLOR.neg });
  y += neg ? 26 : 18;

  /* Viajes */
  const tcols = [{ label: 'Fecha', w: 50 }, { label: 'División', w: 52 }, { label: 'Origen', w: 108 }, { label: 'Destino', w: 108 }, { label: 'Tarifa (MXN)', w: 68, align: 'right' }, { label: 'Gastos (MXN)', w: 62, align: 'right' }, { label: 'Comisión (MXN)', w: 68, align: 'right' }];
  const tripRows = trips.map((t) => ({
    cells: [
      cell(fmtDate(t.date)), cell(t.division === 'campo' ? 'Campo' : 'Puerto', { marker: t.division === 'campo' ? COLOR.orange : COLOR.blue }),
      { lines: wrap(t.origin, 7.8, false, 98) }, { lines: wrap(t.destination, 7.8, false, 98) },
      cell(docMoney(t.fare)), cell(docMoney(t.travelExpenses)),
      cell(docMoney(t.finalCommission), t.isExpanded ? { sub: `Ampliada | base ${docMoney(t.baseCommission)}`, subC: COLOR.orange } : {}),
    ],
  }));
  const S = (f) => trips.reduce((a, t) => a + (f(t) || 0), 0);
  table('Viajes realizados', tcols, tripRows, {
    empty: 'Sin viajes registrados hasta la fecha de corte.',
    totalRows: [{ cells: [cell(`Total (${trips.length} ${trips.length === 1 ? 'viaje' : 'viajes'})`), cell(''), cell(''), cell(''), cell(docMoney(S((t) => t.fare))), cell(docMoney(S((t) => t.travelExpenses))), cell(docMoney(S((t) => t.finalCommission)))] }],
  });
  const expanded = trips.filter((t) => t.isExpanded);
  if (trips.length) {
    section('Totales de viajes', 70);
    kvGrid([
      ['Total de viajes', String(trips.length)], ['Puerto', String(res.stats.puerto)], ['Campo', String(res.stats.campo)],
      ['Tarifas acumuladas', docMoney(S((t) => t.fare))], ['Gastos acumulados', docMoney(S((t) => t.travelExpenses))],
      ['Comisiones de viajes', docMoney(S((t) => t.finalCommission)), expanded.length ? `Incluye ${expanded.length} comisi${expanded.length === 1 ? 'ón ampliada' : 'ones ampliadas'} (+${docMoney(S((t) => t.expandedCommission))})` : ''],
    ]);
    if (expanded.length) { ensure(14); text(PAGE.ml, y - 2, `Comisión ampliada: cuando el ${COMMISSION_RATE}% de la tarifa es menor a la comisión mínima garantizada del operador, se paga el mínimo.`, { s: 6.8, c: COLOR.muted }); y += 12; }
  }

  /* Préstamos */
  const loanRows = loans.map((l) => ({ cells: [cell(fmtDate(l.date)), { lines: wrap(l.concept, 7.8, false, 160) }, { lines: wrap(l.notes || '—', 7.8, false, 198), c: l.notes ? COLOR.ink : COLOR.muted }, cell(docMoney(l.amount))] }));
  table('Préstamos', [{ label: 'Fecha', w: 54 }, { label: 'Concepto', w: 170 }, { label: 'Observaciones', w: 208 }, { label: 'Monto (MXN)', w: 84, align: 'right' }], loanRows, {
    empty: 'Sin préstamos registrados en este periodo.',
    totalRows: [{ cells: [cell('Total de préstamos'), cell(''), cell(''), cell(docMoney(res.stats.loanTotal))] }],
  });

  /* Sábados pagados */
  section('Sábados pagados', 70);
  kvGrid([
    ['Fecha de inicio', isDate(st.startDate) ? fmtDate(st.startDate) : 'Sin configurar'], ['Fecha de corte', fmtDate(res.cutoff)],
    ['Sábados contabilizados', String(res.sat.count), res.sat.manual ? 'Cantidad ajustada manualmente' : res.sat.manualIgnored ? 'Calculada automáticamente a esta fecha de corte' : ''],
    ['Monto por sábado', docMoney(st.weekly)], ['Total sábados pagados', docMoney(res.sat.count * st.weekly)],
  ]);

  /* Gastos de viaje (resumen; el detalle ya está en la tabla de viajes) */
  section('Gastos de viaje', 40);
  ensure(30);
  const withExp = trips.filter((t) => t.travelExpenses > 0).length;
  text(PAGE.ml + 4, y + 11, 'Total acumulado', { s: 9 });
  text(R - 4, y + 11, docMoney(res.stats.tripExpenses), { s: 9, b: true, a: 'end' });
  y += 17; line(PAGE.ml, y, R, y, { w: 0.45 });
  text(PAGE.ml + 4, y + 11, withExp ? `${withExp} ${withExp === 1 ? 'viaje con gastos' : 'viajes con gastos'} registrados; el detalle por viaje aparece en la tabla de viajes.` : 'Sin gastos de viaje registrados.', { s: 7, c: COLOR.muted });
  y += 24;

  /* Ajustes administrativos: solo si existen (explican diferencias entre los totales y el resumen) */
  if (adjs.length) {
    const T = Object.fromEntries(ADJ_TARGETS);
    table('Ajustes administrativos', [{ label: 'Fecha', w: 54 }, { label: 'Componente', w: 104 }, { label: 'Motivo', w: 258 }, { label: 'Efecto en balance', w: 100, align: 'right' }],
      adjs.map((a) => ({ cells: [cell(fmtDate(a.date)), cell(`${T[a.target]} (${a.direction === 'decrease' ? 'disminuye' : 'aumenta'})`), { lines: wrap(a.reason + (a.notes ? ` | ${a.notes}` : ''), 7.8, false, 248) }, cell(docMoney(adjBalanceEffect(a), { sign: true }))] })),
      { totalRows: [{ cells: [cell('Efecto total'), cell(''), cell(''), cell(docMoney(adjs.reduce((s, a) => s + adjBalanceEffect(a), 0), { sign: true }))] }] });
  }

  /* Nota final */
  ensure(30);
  line(PAGE.ml, y, R, y, { w: 0.45 });
  text(PAGE.ml, y + 12, `Este estado de cuenta refleja los movimientos registrados hasta el ${longDate(res.cutoff)}.`, { s: 7, c: COLOR.muted });
  text(PAGE.ml, y + 21.5, 'Documento de control administrativo interno de PERCONSUR.', { s: 7, c: COLOR.muted });

  /* Pie de página con numeración (se conoce el total al terminar) */
  pages.forEach((p, i) => {
    p.items.push({ t: 'line', x1: PAGE.ml, y1: 750, x2: R, y2: 750, c: COLOR.line, w: 0.5 });
    p.items.push({ t: 'text', x: PAGE.w / 2, y: 763, text: pdfSafe(`PERCONSUR · Estado de cuenta de operador · ${folio} · Página ${i + 1} de ${pages.length}`), s: 6.8, b: false, c: COLOR.muted, a: 'middle' });
  });
  return { pages, res, counts: { trips: trips.length, loans: loans.length, adjustments: adjs.length } };
}

/* ===== Dibujo del modelo ===== */
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const xmlEsc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Vista previa: una página como SVG (mismas coordenadas que el PDF) */
export function pageToSVG(page, srcs) {
  const out = [`<svg class="eo-page" viewBox="0 0 ${page.w} ${page.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Página del estado de cuenta"><rect width="${page.w}" height="${page.h}" fill="#fff"/>`];
  for (const it of page.items) {
    if (it.t === 'rect') out.push(`<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" fill="${it.fill || 'none'}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw}"` : ''}/>`);
    else if (it.t === 'line') out.push(`<line x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}" stroke="${it.c}" stroke-width="${it.w}"/>`);
    else if (it.t === 'image' && srcs[it.key]) out.push(`<image href="${srcs[it.key]}" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" preserveAspectRatio="none"/>`);
    else if (it.t === 'text') out.push(`<text x="${it.x}" y="${it.y}" font-size="${it.s}" font-family="Helvetica, Arial, sans-serif"${it.b ? ' font-weight="700"' : ''} fill="${it.c}" text-anchor="${it.a}" xml:space="preserve">${xmlEsc(it.text)}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

/* PDF vectorial con pdf-lib (texto real, seleccionable y ligero). images = { mark: bytesPNG, word: bytesPNG|null } */
export async function modelToPdf(PDFLib, pages, images, meta) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const emb = {};
  for (const [k, bytes] of Object.entries(images)) if (bytes) emb[k] = await doc.embedPng(bytes);
  const col = (h) => rgb(...hex(h));
  for (const p of pages) {
    const pg = doc.addPage([p.w, p.h]);
    for (const it of p.items) {
      if (it.t === 'rect') pg.drawRectangle({ x: it.x, y: p.h - it.y - it.h, width: it.w, height: it.h, ...(it.fill ? { color: col(it.fill) } : {}), ...(it.stroke ? { borderColor: col(it.stroke), borderWidth: it.sw } : {}) });
      else if (it.t === 'line') pg.drawLine({ start: { x: it.x1, y: p.h - it.y1 }, end: { x: it.x2, y: p.h - it.y2 }, thickness: it.w, color: col(it.c) });
      else if (it.t === 'image' && emb[it.key]) pg.drawImage(emb[it.key], { x: it.x, y: p.h - it.y - it.h, width: it.w, height: it.h });
      else if (it.t === 'text' && it.text) {
        const f = it.b ? bold : reg, w = f.widthOfTextAtSize(it.text, it.s);
        const x = it.a === 'end' ? it.x - w : it.a === 'middle' ? it.x - w / 2 : it.x;
        pg.drawText(it.text, { x, y: p.h - it.y, size: it.s, font: f, color: col(it.c) });
      }
    }
  }
  doc.setTitle(meta.title); doc.setAuthor('PERCONSUR'); doc.setSubject('Estado de cuenta de operador'); doc.setCreator('PERCONSUR');
  doc.setCreationDate(new Date()); doc.setProducer('PERCONSUR');
  return doc.save();
}
