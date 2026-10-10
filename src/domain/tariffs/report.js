/*
 * Tarifas — PDF de un apartado (diseño de DOCGEN 3.1, ver domain/shared/pageDoc.js).
 * Modelo de páginas tamaño carta que se dibuja igual como vista previa (SVG) y como PDF vectorial (pdf-lib) con
 * pageToSVG() y modelToPdf() de operators/statement.js. Una sección numerada por zona con la tabla de ciudades de origen
 * y sus destinos; las columnas dependen de la división:
 *   Campo:  Ciudad de origen | Planta destino | Tolva sencilla | Jaula sencilla
 *   Puerto: Origen | Ciudad destino | Tarifa sencillo   (+ sección de cargos adicionales)
 * En Campo cada ciudad de origen se mantiene completa en una página si cabe; si es más larga que una página (o en Puerto,
 * donde casi todo sale de Manzanillo), continúa en la siguiente repitiendo su nombre. Todos los importes son antes de
 * impuestos.
 */
import { fmtDate } from '../operators/balance.js';
import { PAGE, COLOR, docMoney, longDate } from '../operators/statement.js';
import { createDoc } from '../shared/pageDoc.js';
import { divisionOf, groupByZone, tariffStats, plantShort, TAX_NOTE } from './tariffs.js';

const CW = PAGE.w - PAGE.ml - PAGE.mr;
const R = PAGE.w - PAGE.mr;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const columnsFor = (D) => (D.key === 'puerto'
  ? [{ label: 'Origen', w: 160 }, { label: 'Ciudad destino', w: 236 }, { label: D.unitLabel('Sencillo'), w: 120, align: 'right' }]
  : [{ label: 'Ciudad de origen', w: 214 }, { label: 'Planta destino', w: 122 }, ...D.units.map((u) => ({ label: D.unitLabel(u), w: 90, align: 'right' }))]);

export function tariffReportFilename(name, issued) {
  const slug = String(name || 'tarifas').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'tarifas';
  return `Tarifas-${slug}-${issued}.pdf`;
}

/* input = { company, sheet { name, division, routes, extras }, issued (AAAA-MM-DD), measure(text,size,bold)→pt, imgs } */
export function buildTariffReport({ company, sheet, issued, measure, imgs }) {
  const D = divisionOf(sheet), puerto = D.key === 'puerto';
  const routes = sheet.routes || [], extras = sheet.extras || [], st = tariffStats(routes);
  const COLS = columnsFor(D);
  const doc = createDoc({
    measure, imgs, company,
    head: {
      kicker: `${D.label} · Tarifas`, kickerIcon: D.icon, title: sheet.name, sub: 'Tarifario de transporte sencillo · Antes de impuestos',
      meta: puerto
        ? [{ label: 'Fecha de emisión', value: fmtDate(issued) }, { label: 'Origen', value: [...new Set(routes.map((r) => r.origin))].join(', ') || D.defaultOrigin, w: 1.3 }, { label: 'Rutas', value: String(st.routes), w: 0.7 }, { label: 'Destinos', value: String(st.dests), w: 0.8 }, { label: 'Importes', value: 'Antes de impuestos', w: 1.3 }]
        : [{ label: 'Fecha de emisión', value: fmtDate(issued) }, { label: 'Configuración', value: 'Sencillo (Tolva y Jaula)', w: 1.6 }, { label: 'Rutas', value: String(st.routes), w: 0.7 }, { label: 'Orígenes', value: String(st.origins), w: 0.8 }, { label: 'Importes', value: 'Antes de impuestos', w: 1.3 }],
    },
    cont: { title: sheet.name, sub: [[`${D.label}  ·  Tarifario de transporte sencillo  ·  Emitido ${fmtDate(issued)}`, false]], asideLabel: 'Rutas', asideValue: String(st.routes) },
    foot: { left: `PERCONSUR | ${D.label} | Tarifas`, center: sheet.name },
  });
  const { text, rect, line, wrap } = doc;
  let y = 0;
  const newPage = () => { y = doc.newPage(); };
  const fits = (h) => y + h <= PAGE.bottom;
  const xs = []; { let acc = PAGE.ml; COLS.forEach((c) => { xs.push(acc); acc += c.w; }); }
  const LH = 9.6, HH = 16, ROW = 17;
  const money = (v) => (v != null ? docMoney(v) : '—');

  newPage();
  const groups = groupByZone(routes, routes, { alphaDest: puerto });
  if (!groups.length) {
    y = doc.sectionHead(y, 'Tarifas').y;
    rect(PAGE.ml, y, CW, 24, { fill: COLOR.faint });
    text(PAGE.ml + 10, y + 15, 'Este apartado aún no tiene tarifas registradas.', { s: 8, c: COLOR.muted });
    y += 36;
  }
  for (const g of groups) {
    const blocks = g.origins.map((o) => {
      const ol = wrap(o.origin, 7.8, true, COLS[0].w - 12, 3);
      const rows = o.routes.map((r, i) => ({ r, h: Math.max(ROW, 7 + (i === 0 ? ol.length : 1) * LH + 1) }));
      return { o, ol, rows, h: rows.reduce((a, x) => a + x.h, 0) };
    });
    /* Campo: cada ciudad de origen se mantiene completa si cabe en una página. Puerto: casi todo sale de Manzanillo, así
       que los destinos corren renglón por renglón (con fondo alterno) en lugar de mover el bloque completo */
    const keep = (b) => !puerto && b.h <= PAGE.bottom - 140;
    /* Encabezado de la zona + la primera ciudad (completa o al menos dos renglones) deben caber juntos */
    if (!fits(19 + HH + (keep(blocks[0]) ? blocks[0].h : blocks[0].rows[0].h + ROW))) newPage();
    const head = doc.sectionHead(y, g.zone, { aside: puerto ? plural(g.routes.length, 'ruta', 'rutas') : `${plural(g.origins.length, 'origen', 'orígenes')} · ${plural(g.routes.length, 'ruta', 'rutas')}` });
    y = doc.tableHead(head.y, COLS, xs, HH);
    let afterHead = true;
    const breakPage = () => {
      doc.tableEnd(y); newPage();
      y = doc.sectionHead(y, `${g.zone} (continuación)`, { n: head.n }).y;
      y = doc.tableHead(y, COLS, xs, HH);
      afterHead = true;
    };
    blocks.forEach((b, bi) => {
      /* La ciudad completa pasa a la página siguiente si ahí sí cabe; si es más larga que una página, se parte */
      if (!fits(b.h) && keep(b)) breakPage();
      let first = true, segTop = y;
      /* Bordes laterales de cada tramo (el fondo alterno va renglón por renglón, antes del texto) */
      const frame = (top, bottom) => { line(PAGE.ml, top, PAGE.ml, bottom, { c: COLOR.line, w: 0.75 }); line(R, top, R, bottom, { c: COLOR.line, w: 0.75 }); };
      b.rows.forEach(({ r }, i) => {
        /* El nombre de la ciudad va en su primer renglón y se repite «(cont.)» al seguir en otra página */
        const nameAt = () => (i === 0 ? b.ol : [doc.fit(`${b.o.origin} (cont.)`, 7.8, true, COLS[0].w - 12)]);
        let rh = first ? Math.max(ROW, 7 + nameAt().length * LH + 1) : ROW;
        if (!fits(rh)) { frame(segTop, y); breakPage(); segTop = y; first = true; rh = Math.max(ROW, 7 + nameAt().length * LH + 1); }
        /* Campo: fondo alterno por ciudad de origen. Puerto: por renglón, en las columnas de destino e importe */
        if (puerto ? i % 2 === 1 : bi % 2 === 1) rect(puerto ? xs[1] : PAGE.ml, y, puerto ? R - xs[1] : CW, rh, { fill: COLOR.faint });
        /* Línea fina entre ciudades de origen */
        if (i === 0 && !afterHead) line(PAGE.ml, y, R, y, { c: COLOR.line2, w: 0.6 });
        afterHead = false;
        if (first) nameAt().forEach((l, k) => text(xs[0] + 6, y + 11.2 + k * LH, l, { s: 7.8, b: true }));
        text(xs[1] + 6, y + 11.2, puerto ? r.dest : plantShort(r.dest), { s: 7.8 });
        D.units.forEach((u, k) => {
          const c = COLS[2 + k], v = r.rates[u];
          text(xs[2 + k] + c.w - 6, y + 11.2, money(v), { s: 7.8, b: v != null, c: v != null ? COLOR.ink : COLOR.muted, a: 'end' });
        });
        y += rh;
        first = false;
      });
      frame(segTop, y);
    });
    doc.tableEnd(y);
    y += 14;
  }

  /* Cargos adicionales (División Puerto) */
  if (extras.length) {
    const EC = [{ label: 'Concepto', w: 396 }, { label: 'Importe', w: 120, align: 'right' }];
    const exs = [PAGE.ml, PAGE.ml + 396];
    if (!fits(19 + HH + extras.length * ROW)) newPage();
    y = doc.sectionHead(y, 'Cargos adicionales').y;
    y = doc.tableHead(y, EC, exs, HH);
    extras.forEach((x, i) => {
      doc.rowFrame(y, ROW, i);
      text(exs[0] + 6, y + 11.2, x.label, { s: 7.8 });
      text(R - 6, y + 11.2, docMoney(x.amount), { s: 7.8, b: true, a: 'end' });
      y += ROW;
    });
    doc.tableEnd(y);
    y += 14;
  }

  /* Nota final: importes antes de impuestos (ícono de información y filo azul, como la evidencia de DOCGEN) */
  const fin = `${TAX_NOTE} Tarifas por viaje en configuración de transporte sencillo${puerto ? '' : ' (Tolva y Jaula)'}, en pesos mexicanos (MXN). Solo se incluyen las rutas con monto registrado al ${longDate(issued)}.`;
  if (!fits(doc.noteHeight(fin) + 4)) newPage();
  y += doc.note(y, fin, { icon: 'info' });

  const pages = doc.finish();
  return { pages, stats: st };
}
