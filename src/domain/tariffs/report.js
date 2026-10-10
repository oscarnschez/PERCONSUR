/*
 * Tarifas — PDF de un apartado (diseño de DOCGEN 3.1, ver domain/shared/pageDoc.js).
 * Modelo de páginas tamaño carta que se dibuja igual como vista previa (SVG) y como PDF vectorial (pdf-lib) con
 * pageToSVG() y modelToPdf() de operators/statement.js. Una sección numerada por zona; en cada una, la tabla de
 * ciudades de origen con sus plantas destino y el importe de Tolva y Jaula (configuración sencilla).
 * Cada ciudad de origen se mantiene completa en una página (si no cabe, pasa a la siguiente).
 */
import { fmtDate } from '../operators/balance.js';
import { PAGE, COLOR, docMoney, longDate } from '../operators/statement.js';
import { createDoc } from '../shared/pageDoc.js';
import { UNITS, groupByZone, tariffStats, plantShort } from './tariffs.js';

const CW = PAGE.w - PAGE.ml - PAGE.mr;
const R = PAGE.w - PAGE.mr;
const COLS = [{ label: 'Ciudad de origen', w: 214 }, { label: 'Planta destino', w: 122 }, { label: 'Tolva sencilla', w: 90, align: 'right' }, { label: 'Jaula sencilla', w: 90, align: 'right' }];
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export function tariffReportFilename(name, issued) {
  const slug = String(name || 'tarifas').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'tarifas';
  return `Tarifas-${slug}-${issued}.pdf`;
}

/* input = { company, sheet { name, routes }, issued (AAAA-MM-DD), measure(text,size,bold)→pt, imgs: { mark:{w,h}, word:{w,h}|null } } */
export function buildTariffReport({ company, sheet, issued, measure, imgs }) {
  const routes = sheet.routes || [], st = tariffStats(routes);
  const D = createDoc({
    measure, imgs, company,
    head: {
      kicker: 'Administración · Tarifas', title: sheet.name, sub: 'Tarifario de transporte sencillo',
      meta: [{ label: 'Fecha de emisión', value: fmtDate(issued) }, { label: 'Configuración', value: 'Sencillo (Tolva y Jaula)', w: 1.7 }, { label: 'Rutas', value: String(st.routes), w: 0.7 }, { label: 'Orígenes', value: String(st.origins), w: 0.8 }, { label: 'Zonas', value: String(st.zones), w: 0.7 }],
    },
    cont: { title: sheet.name, sub: [[`Tarifario de transporte sencillo  ·  Emitido ${fmtDate(issued)}`, false]], asideLabel: 'Rutas', asideValue: String(st.routes) },
    foot: { left: 'PERCONSUR | Tarifas', center: sheet.name },
  });
  const { text, rect, line, wrap } = D;
  let y = 0;
  const newPage = () => { y = D.newPage(); };
  const fits = (h) => y + h <= PAGE.bottom;
  const xs = []; { let acc = PAGE.ml; COLS.forEach((c) => { xs.push(acc); acc += c.w; }); }
  const LH = 9.6, HH = 16;

  newPage();
  const groups = groupByZone(routes);
  if (!groups.length) {
    y = D.sectionHead(y, 'Tarifas').y;
    rect(PAGE.ml, y, CW, 24, { fill: COLOR.faint });
    text(PAGE.ml + 10, y + 15, 'Este apartado aún no tiene tarifas registradas.', { s: 8, c: COLOR.muted });
    y += 36;
  }
  for (const g of groups) {
    /* Encabezado de la zona + la primera ciudad deben caber juntos */
    const blocks = g.origins.map((o) => {
      const ol = wrap(o.origin, 7.8, true, COLS[0].w - 12, 3);
      const rows = o.routes.map((r, i) => ({ r, h: Math.max(17, 7 + (i === 0 ? ol.length : 1) * LH + 1) }));
      return { o, ol, rows, h: rows.reduce((a, x) => a + x.h, 0) };
    });
    if (!fits(19 + HH + blocks[0].h)) newPage();
    const head = D.sectionHead(y, g.zone, { aside: `${plural(g.origins.length, 'origen', 'orígenes')} · ${plural(g.routes.length, 'ruta', 'rutas')}` });
    y = D.tableHead(head.y, COLS, xs, HH);
    let afterHead = true;
    blocks.forEach((b, bi) => {
      if (!fits(b.h)) {
        D.tableEnd(y); newPage();
        y = D.sectionHead(y, `${g.zone} (continuación)`, { n: head.n }).y;
        y = D.tableHead(y, COLS, xs, HH);
        afterHead = true;
      }
      const top = y;
      /* Renglones alternos por ciudad de origen; línea fina entre ciudades */
      if (bi % 2 === 1) rect(PAGE.ml, top, CW, b.h, { fill: COLOR.faint });
      if (!afterHead) line(PAGE.ml, top, R, top, { c: COLOR.line2, w: 0.6 });
      afterHead = false;
      line(PAGE.ml, top, PAGE.ml, top + b.h, { c: COLOR.line, w: 0.75 }); line(R, top, R, top + b.h, { c: COLOR.line, w: 0.75 });
      b.ol.forEach((l, i) => text(xs[0] + 6, top + 11.2 + i * LH, l, { s: 7.8, b: true }));
      b.rows.forEach(({ r, h }) => {
        text(xs[1] + 6, y + 11.2, plantShort(r.dest), { s: 7.8 });
        UNITS.forEach((u, k) => {
          const c = COLS[2 + k], v = r.rates[u];
          text(xs[2 + k] + c.w - 6, y + 11.2, v != null ? docMoney(v) : '—', { s: 7.8, b: v != null, c: v != null ? COLOR.ink : COLOR.muted, a: 'end' });
        });
        y += h;
      });
    });
    D.tableEnd(y);
    y += 14;
  }

  /* Nota final (como la evidencia de DOCGEN: ícono de información y filo azul) */
  const fin = `Tarifas por viaje en configuración de transporte sencillo (Tolva y Jaula), en pesos mexicanos (MXN). Solo se incluyen las rutas con monto registrado al ${longDate(issued)}.`;
  if (!fits(D.noteHeight(fin) + 4)) newPage();
  y += D.note(y, fin, { icon: 'info' });

  const pages = D.finish();
  return { pages, stats: st };
}
