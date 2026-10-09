/*
 * Estado de cuenta de operador — diseño del documento (lenguaje visual de DOCGEN 3.1, ver domain/shared/pageDoc.js).
 *
 * Produce un MODELO DE PÁGINAS (texto, líneas, rectángulos, trazos e imágenes con coordenadas en puntos, tamaño carta)
 * que se dibuja de dos maneras con el mismo resultado:
 *   - Vista previa: SVG en la app (services/statementPdf.js → pageSVG)
 *   - PDF vectorial: pdf-lib (services/statementPdf.js → renderStatementPdf)
 * Así la vista previa ES el documento: mismas páginas, saltos, tablas, totales, encabezado y pie.
 *
 * Los importes salen de computeOperator() con la fecha de corte elegida (fórmula única del módulo Operadores).
 * Nada se copia ni se guarda: el documento se arma con los registros actuales.
 */
import { computeOperator, isDate, fmtDate, ADJ_TARGETS, adjBalanceEffect, COMMISSION_RATE } from './balance.js';
import { tripTaxes, sumTaxes, VAT_RATE, ISR_RATE, VAT_WITHHOLDING_RATE } from './taxes.js';
import { PAGE, DOC, TR, pdfSafe, createDoc } from '../shared/pageDoc.js';

export { PAGE, pdfSafe };
const CW = PAGE.w - PAGE.ml - PAGE.mr;          // 516 pt de ancho útil
const R = PAGE.w - PAGE.mr;                      // borde derecho
/* Colores de los reportes: paleta de la hoja de DOCGEN y marca PERCONSUR */
export const COLOR = { blue: DOC.c1, blueD: DOC.c1d, blueL: DOC.c1l, orange: DOC.c2, orangeD: DOC.c2d, ink: DOC.ink, ink2: DOC.ink2, muted: DOC.mute, line: DOC.line, line2: DOC.line2, faint: DOC.soft, neg: '#B42318' };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const longDate = (s) => (isDate(s) ? `${s.slice(8, 10)} de ${MESES[+s.slice(5, 7) - 1]} de ${s.slice(0, 4)}` : '');

/* Dinero para el documento: "$25,000.00" / "-$5,000.00" (guion normal, compatible con las fuentes del PDF) */
export function docMoney(cents, { sign = false, mxn = false } = {}) {
  const c = Math.round(cents || 0), a = Math.abs(c);
  const txt = Math.floor(a / 100).toLocaleString('en-US') + '.' + String(a % 100).padStart(2, '0');
  return `${c < 0 ? '-' : sign && c > 0 ? '+' : ''}$${txt}${mxn ? ' MXN' : ''}`;
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
  const D = createDoc({
    measure, imgs, company,
    head: {
      kicker: 'Administración · Operadores', title: 'Estado de cuenta de operador', sub: 'Balance y movimientos del operador', folio,
      meta: [{ label: 'Folio', value: folio, folio: true, w: 1.3 }, { label: 'Fecha de emisión', value: fmtDate(issued) }, { label: 'Fecha de corte', value: fmtDate(res.cutoff) }, { label: 'Operador', value: op.name, w: 2.1 }],
    },
    cont: { title: 'Estado de cuenta de operador', sub: [[op.name, false], [`  ·  Corte ${fmtDate(res.cutoff)}`, false]], asideLabel: 'Folio', asideValue: folio },
    foot: { left: 'PERCONSUR | Estado de cuenta de operador', center: folio },
  });
  const { text, rect, line, fit, wrap } = D;
  let y = 0;

  function newPage() { y = D.newPage(); }
  const fits = (h) => y + h <= PAGE.bottom;
  const ensure = (h) => { if (!fits(h)) { newPage(); return true; } return false; };

  /* ===== Bloques ===== */
  function section(title, minAfter = 30) { ensure(22 + minAfter); const r = D.sectionHead(y, title); y = r.y; return r.n; }
  /* Celdas con etiqueta: [[etiqueta, valor, nota?], …] */
  function kvGrid(items, cols = 3) {
    for (let i = 0; i < items.length; i += cols) {
      const row = items.slice(i, i + cols), h = row.some((it) => it[2]) ? 39 : 31;
      ensure(h);
      D.cellsRow(y, row, cols, { h });
      y += h;
    }
    y += 12;
  }
  /* Lista de conceptos con importe (recuadro con separadores finos) */
  function sumList(rows) {
    const h = 18;
    ensure(rows.length * h);
    rect(PAGE.ml, y, CW, rows.length * h, { stroke: COLOR.line, sw: 0.75 });
    rows.forEach(([k, v], i) => {
      if (i) line(PAGE.ml, y, R, y, { c: COLOR.line2 });
      text(PAGE.ml + 9, y + 12, k, { s: 8.6, c: COLOR.ink2 }); text(R - 9, y + 12, v, { s: 8.6, b: true, a: 'end' });
      y += h;
    });
  }
  /* Recuadro destacado (como el total de la tabla de DOCGEN): fondo azul claro y filo de color */
  function highlight(label, sub, value, { accent = COLOR.blue, valueColor = COLOR.ink, h = 40, size = 16 } = {}) {
    rect(PAGE.ml, y, CW, h, { fill: COLOR.blueL }); rect(PAGE.ml, y, 2.25, h, { fill: accent });
    line(PAGE.ml, y, R, y, { c: COLOR.blue, w: 0.75 });
    text(PAGE.ml + 14, y + (sub ? h / 2 - 1 : h / 2 + 3), label, { s: 8.2, b: true, up: true, tr: TR, c: COLOR.blueD });
    if (sub) text(PAGE.ml + 14, y + h / 2 + 10, sub, { s: 7, c: COLOR.muted });
    text(R - 12, y + h / 2 + size * 0.36, value, { s: size, b: true, c: valueColor, a: 'end' });
    y += h;
  }
  /*
   * Tabla con encabezado repetido en cada página y filas que nunca se dividen.
   * cols: [{ label, w, align }]; rows: [{ cells: [{ lines:[…], sub, b, c, marker }], total }]
   */
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
    const n = section(title, HH + all[0].h);
    y = D.tableHead(y, cols, xs, HH);
    let k = 0;
    const drawRow = (r, isTotal) => {
      D.rowFrame(y, r.h, k++, { total: isTotal });
      r.cells.forEach((c, i) => {
        const col = cols[i], right = col.align === 'right';
        const x = right ? xs[i] + col.w - 6 : xs[i] + 6 + (c.marker ? 8 : 0);
        if (c.marker) D.rrect(xs[i] + 6, y + 6.2, 4.6, 4.6, 1, { fill: c.marker });
        (c.lines || ['']).forEach((ln, j) => text(x, y + 11.2 + j * LH, ln, { s: 7.8, b: !!(c.b || isTotal), c: isTotal ? COLOR.blue : c.c || COLOR.ink, a: right ? 'end' : 'start' }));
        if (c.sub) text(x, y + 11.2 + (c.lines || ['']).length * LH - 1.8, c.sub, { s: 6.2, c: c.subC || COLOR.muted, a: right ? 'end' : 'start' });
      });
      y += r.h;
    };
    for (const r of all) {
      if (!fits(r.h)) { D.tableEnd(y); newPage(); y = D.sectionHead(y, `${title} (continuación)`, { n }).y; y = D.tableHead(y, cols, xs, HH); k = 0; }
      drawRow(r, false);
    }
    for (const r of tots) { if (!fits(r.h)) { D.tableEnd(y); newPage(); y = D.tableHead(y, cols, xs, HH); k = 0; } drawRow(r, true); }
    D.tableEnd(y);
    y += 14;
  }
  const cell = (str, o = {}) => ({ lines: [str], ...o });
  const muted = (str, dy = 0) => text(PAGE.ml, y + dy, str, { s: 6.8, c: COLOR.muted });

  /* ===== Documento ===== */
  newPage();

  section('Datos del operador', 60);
  kvGrid([
    ['Operador', op.name], ['Empresa', opCompany || company.legal], ['Fecha de inicio de operación', isDate(st.startDate) ? fmtDate(st.startDate) : 'Sin configurar'],
    ['Fecha de corte del balance', fmtDate(res.cutoff)], ['Sábados contabilizados', String(res.sat.count), res.sat.manual ? 'Cantidad ajustada manualmente' : ''], ['Monto semanal', docMoney(st.weekly)],
  ]);

  /* Resumen de balance (misma fórmula y mismos datos que la ficha) */
  section('Resumen de balance', 130);
  sumList([['Comisiones acumuladas', docMoney(res.comp.commissions, { sign: true })], ['Sábados pagados', docMoney(-res.comp.saturdaysPaid)], ['Gastos de viaje', docMoney(-res.comp.expenses)], ['Préstamos', docMoney(-res.comp.loans)]]);
  y += 6;
  const neg = res.balance < 0;
  highlight('Balance actual', `Balance al ${longDate(res.cutoff)}`, docMoney(res.balance, { mxn: true }), { accent: neg ? COLOR.neg : COLOR.blue, valueColor: neg ? COLOR.neg : COLOR.ink });
  y += 8;
  muted('Balance = Comisiones – Sábados pagados – Gastos de viaje – Préstamos. Importes en pesos mexicanos (MXN).', 4);
  if (neg) text(PAGE.ml, y + 13.5, 'El balance es negativo: el operador tiene un saldo en contra a la fecha de corte.', { s: 6.8, c: COLOR.neg });
  y += neg ? 28 : 20;

  /* Viajes: el desglose fiscal va en una segunda línea bajo la ruta, solo en los viajes con impuestos */
  const fx = sumTaxes(trips);
  const tcols = [{ label: 'Fecha', w: 44 }, { label: 'División', w: 44 }, { label: 'Ruta', w: 172 }, { label: 'Tarifa base', w: 64, align: 'right' }, { label: 'Total c/ imp.', w: 66, align: 'right' }, { label: 'Gastos', w: 56, align: 'right' }, { label: 'Comisión', w: 70, align: 'right' }];
  /* El porcentaje solo se escribe si difiere del oficial (16 / 4 / 4), para que la línea quepa bajo la ruta */
  const pct = (rate, std) => (rate === std ? '' : ` ${rate}%`);
  const taxLine = (x) => [x.applyVat && `IVA${pct(x.vatRate, VAT_RATE)} ${docMoney(x.vatAmount, { sign: true })}`, x.applyIsr && `ISR${pct(x.isrRate, ISR_RATE)} ${docMoney(-x.isrAmount)}`, x.applyVatWithholding && `Ret. IVA${pct(x.vatWithholdingRate, VAT_WITHHOLDING_RATE)} ${docMoney(-x.vatWithholdingAmount)}`].filter(Boolean).join(' · ');
  const tripRows = trips.map((t) => { const x = tripTaxes(t); return {
    cells: [
      cell(fmtDate(t.date)), cell(t.division === 'campo' ? 'Campo' : 'Puerto', { marker: t.division === 'campo' ? COLOR.orange : COLOR.blue }),
      { lines: wrap(`${t.origin} -> ${t.destination}`, 7.8, false, 160), ...(x.any ? { sub: fit(taxLine(x), 6.2, false, 160), subC: COLOR.blueD } : {}) },
      cell(docMoney(x.fareBase)), cell(docMoney(x.totalAfterTaxes), { b: x.any }), cell(docMoney(t.travelExpenses)),
      cell(docMoney(t.finalCommission), t.isExpanded ? { sub: `Ampliada | base ${docMoney(t.baseCommission)}`, subC: COLOR.orangeD } : {}),
    ],
  }; });
  const S = (f) => trips.reduce((a, t) => a + (f(t) || 0), 0);
  table('Viajes realizados', tcols, tripRows, {
    empty: 'Sin viajes registrados hasta la fecha de corte.',
    totalRows: [{ cells: [cell(`Total (${trips.length} ${trips.length === 1 ? 'viaje' : 'viajes'})`), cell(''), cell(''), cell(docMoney(fx.fares)), cell(docMoney(fx.total)), cell(docMoney(S((t) => t.travelExpenses))), cell(docMoney(S((t) => t.finalCommission)))] }],
  });
  const expanded = trips.filter((t) => t.isExpanded);
  if (trips.length) {
    /* Resumen fiscal: se suma viaje por viaje, con la configuración guardada en cada uno */
    section('Resumen de viajes', 170);
    sumList([['Tarifas base acumuladas', docMoney(fx.fares)], ['IVA generado', docMoney(fx.vat, { sign: true })], ['ISR retenido', docMoney(-fx.isr)], ['Retención IVA', docMoney(-fx.vatWithholding)]]);
    y += 5;
    highlight('Total generado después de impuestos', '', docMoney(fx.total, { mxn: true }), { h: 26, size: 11.5 });
    y += 5;
    sumList([['Comisiones acumuladas', docMoney(S((t) => t.finalCommission))]]);
    muted(`Total = Tarifa base + IVA ${VAT_RATE}% - ISR ${ISR_RATE}% - Retención IVA ${VAT_WITHHOLDING_RATE}%, según lo aplicado en cada viaje.`, 11);
    muted('La comisión del operador se calcula sobre la tarifa base, antes de impuestos; los impuestos no forman parte del balance.', 20.5);
    y += 34;
    section('Totales de viajes', 70);
    kvGrid([
      ['Total de viajes', String(trips.length)], ['Puerto', String(res.stats.puerto)], ['Campo', String(res.stats.campo)],
      ['Tarifas base acumuladas', docMoney(S((t) => t.fare))], ['Gastos acumulados', docMoney(S((t) => t.travelExpenses))],
      ['Comisiones de viajes', docMoney(S((t) => t.finalCommission)), expanded.length ? `Incluye ${expanded.length} comisi${expanded.length === 1 ? 'ón ampliada' : 'ones ampliadas'} (+${docMoney(S((t) => t.expandedCommission))})` : ''],
    ]);
    if (expanded.length) { ensure(14); muted(`Comisión ampliada: cuando el ${COMMISSION_RATE}% de la tarifa es menor a la comisión mínima garantizada del operador, se paga el mínimo.`, -2); y += 12; }
  }

  /* Préstamos */
  const loanRows = loans.map((l) => ({ cells: [cell(fmtDate(l.date)), { lines: wrap(l.concept, 7.8, false, 158) }, { lines: wrap(l.notes || '—', 7.8, false, 196), c: l.notes ? COLOR.ink : COLOR.muted }, cell(docMoney(l.amount))] }));
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
  section('Gastos de viaje', 44);
  const withExp = trips.filter((t) => t.travelExpenses > 0).length;
  sumList([['Total acumulado', docMoney(res.stats.tripExpenses)]]);
  muted(withExp ? `${withExp} ${withExp === 1 ? 'viaje con gastos' : 'viajes con gastos'} registrados; el detalle por viaje aparece en la tabla de viajes.` : 'Sin gastos de viaje registrados.', 11);
  y += 22;

  /* Ajustes administrativos: solo si existen (explican diferencias entre los totales y el resumen) */
  if (adjs.length) {
    const T = Object.fromEntries(ADJ_TARGETS);
    table('Ajustes administrativos', [{ label: 'Fecha', w: 54 }, { label: 'Componente', w: 104 }, { label: 'Motivo', w: 258 }, { label: 'Efecto en balance', w: 100, align: 'right' }],
      adjs.map((a) => ({ cells: [cell(fmtDate(a.date)), cell(`${T[a.target]} (${a.direction === 'decrease' ? 'disminuye' : 'aumenta'})`), { lines: wrap(a.reason + (a.notes ? ` | ${a.notes}` : ''), 7.8, false, 246) }, cell(docMoney(adjBalanceEffect(a), { sign: true }))] })),
      { totalRows: [{ cells: [cell('Efecto total'), cell(''), cell(''), cell(docMoney(adjs.reduce((s, a) => s + adjBalanceEffect(a), 0), { sign: true }))] }] });
  }

  /* Nota final (declaración de DOCGEN: escudo y filo naranja) */
  const fin = `Este estado de cuenta refleja los movimientos registrados hasta el ${longDate(res.cutoff)}. Documento de control administrativo interno de PERCONSUR.`;
  ensure(D.noteHeight(fin) + 4);
  y += D.note(y, fin, { icon: 'shield', accent: COLOR.orange, iconColor: COLOR.orangeD });

  /* Pie de página con folio y numeración (se conoce el total al terminar) */
  const pages = D.finish();
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
    /* Trazo vectorial (diagramas del Taller): misma ruta que dibuja pdf-lib con drawSvgPath */
    else if (it.t === 'path') out.push(`<path d="${it.d}" transform="translate(${it.x} ${it.y}) scale(${it.scale})" fill="${it.fill || 'none'}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw}" stroke-linejoin="round" stroke-linecap="round"` : ''}${it.dash ? ` stroke-dasharray="${it.dash.join(' ')}"` : ''}/>`);
    else if (it.t === 'text') {
      /* Título condensado (sx) y etiquetas espaciadas (ls): mismas medidas que en pdf-lib (Tz y Tc) */
      const pos = it.sx ? `x="0" y="0" transform="translate(${it.x} ${it.y}) scale(${it.sx} 1)"` : `x="${it.x}" y="${it.y}"`;
      const ls = it.ls ? ` letter-spacing="${+(it.ls / (it.sx || 1)).toFixed(3)}"` : '';
      out.push(`<text ${pos} font-size="${it.s}" font-family="Helvetica, Arial, sans-serif"${it.b ? ' font-weight="700"' : ''}${ls} fill="${it.c}" text-anchor="${it.a}" xml:space="preserve">${xmlEsc(it.text)}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}

/* PDF vectorial con pdf-lib (texto real, seleccionable y ligero). images = { mark: bytesPNG, word: bytesPNG|null, <clave>: { bytes, jpg: true } } */
export async function modelToPdf(PDFLib, pages, images, meta) {
  const { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, setCharacterSpacing, setCharacterSqueeze, LineCapStyle } = PDFLib;
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const emb = {};
  for (const [k, img] of Object.entries(images)) {
    if (!img) continue;
    try { emb[k] = img.jpg ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes || img); } catch (e) { console.warn('imagen omitida', k, e); }
  }
  const col = (h) => rgb(...hex(h));
  for (const p of pages) {
    const pg = doc.addPage([p.w, p.h]);
    for (const it of p.items) {
      if (it.t === 'rect') pg.drawRectangle({ x: it.x, y: p.h - it.y - it.h, width: it.w, height: it.h, ...(it.fill ? { color: col(it.fill) } : {}), ...(it.stroke ? { borderColor: col(it.stroke), borderWidth: it.sw } : {}) });
      else if (it.t === 'line') pg.drawLine({ start: { x: it.x1, y: p.h - it.y1 }, end: { x: it.x2, y: p.h - it.y2 }, thickness: it.w, color: col(it.c) });
      else if (it.t === 'image' && emb[it.key]) pg.drawImage(emb[it.key], { x: it.x, y: p.h - it.y - it.h, width: it.w, height: it.h });
      else if (it.t === 'path') {
        const o = { x: it.x, y: p.h - it.y, scale: it.scale };
        if (it.fill) o.color = col(it.fill);
        if (it.stroke) { o.borderColor = col(it.stroke); o.borderWidth = it.sw; if (it.dash) o.borderDashArray = it.dash; if (it.cap === 'round') o.borderLineCap = LineCapStyle.Round; }
        if (o.color || o.borderColor) pg.drawSvgPath(it.d, o);
      }
      else if (it.t === 'text' && it.text) {
        const f = it.b ? bold : reg, w = f.widthOfTextAtSize(it.text, it.s);
        const x = it.a === 'end' ? it.x - w : it.a === 'middle' ? it.x - w / 2 : it.x;
        /* Condensado (Tz) y espaciado entre letras (Tc, que Tz también escala) solo para este texto */
        const ts = it.sx || it.ls;
        if (ts) pg.pushOperators(pushGraphicsState(), ...(it.sx ? [setCharacterSqueeze(it.sx * 100)] : []), ...(it.ls ? [setCharacterSpacing(it.ls / (it.sx || 1))] : []));
        pg.drawText(it.text, { x, y: p.h - it.y, size: it.s, font: f, color: col(it.c) });
        if (ts) pg.pushOperators(popGraphicsState());
      }
    }
  }
  doc.setTitle(meta.title); doc.setAuthor('PERCONSUR'); doc.setSubject(meta.subject || 'Estado de cuenta de operador'); doc.setCreator('PERCONSUR');
  if (meta.keywords) doc.setKeywords(meta.keywords);
  doc.setCreationDate(new Date()); doc.setProducer('PERCONSUR');
  return doc.save();
}
