/*
 * Diseño de DOCGEN 3.1 para los reportes del MODELO DE PÁGINAS (estado de cuenta, cobranza y taller).
 *
 * Las hojas de DOCGEN (nota de entrega, asignación) son HTML; estos reportes son páginas con coordenadas en puntos que
 * se dibujan igual como vista previa (SVG) y como PDF vectorial (pdf-lib). Este módulo traduce el mismo lenguaje visual
 * a ese modelo: medidas de la hoja de 816 px × 0.75 = puntos.
 *   - Encabezado: logotipo y razón social a la izquierda; letrero de área, título condensado, subtítulo y código de
 *     barras del folio a la derecha. Banda de marca 78/22 y tira de datos clave bajo la banda.
 *   - Páginas siguientes: encabezado corto como el anexo de evidencia (logotipo, título, dato destacado y banda).
 *   - Secciones numeradas (01, 02…) con línea fina, celdas con etiqueta en mayúsculas, tablas con encabezado sólido
 *     y renglones alternos, notas con ícono (escudo, información) y pie de tres columnas con el folio al centro.
 * El texto sigue siendo texto real del PDF (Helvetica): el título se condensa al 80 % y las etiquetas llevan un
 * espaciado de 0.08 em, el máximo que conserva el texto copiable y buscable (con más, los lectores separan las letras).
 */
import { ICON_PATHS } from './docIcons.js';
import { code128 } from './barcode.js';

export const PAGE = { w: 612, h: 792, ml: 48, mr: 48, bottom: 734 };
const CW = PAGE.w - PAGE.ml - PAGE.mr, RX = PAGE.w - PAGE.mr;

/* Paleta de la hoja de DOCGEN (--p-*) y colores de marca de PERCONSUR (--c1 / --c2) */
export const DOC = {
  ink: '#111827', ink2: '#374151', mute: '#6B7280', line: '#D7DCE4', line2: '#E7EAF0', soft: '#F6F7FA', photo: '#F3F5F8',
  c1: '#354FA3', c1d: '#233878', c1l: '#EEF1F8', c2: '#F26F22', c2d: '#D65B15', c2l: '#FEF3EC', white: '#FFFFFF',
};
export const TR = 0.08;     // espaciado de etiquetas y títulos en mayúsculas (em)
const SQ = 0.8;      // ancho del título condensado

/* Solo caracteres que las fuentes estándar del PDF (Helvetica, WinAnsi) pueden escribir */
const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function pdfSafe(t) {
  return [...String(t ?? '').replace(/−/g, '-').replace(/→/g, '->').replace(/\s+/g, ' ')].map((ch) => {
    const c = ch.charCodeAt(0);
    if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_EXTRA.includes(ch)) return ch;
    const d = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return /^[\x20-\x7e]+$/.test(d) ? d : '?';
  }).join('');
}

const up = (t) => String(t ?? '').toLocaleUpperCase('es-MX');
const pad2 = (n) => String(n).padStart(2, '0');
/* Rectángulo con esquinas redondeadas como ruta (la dibujan igual el SVG y pdf-lib) */
export function roundRectPath(w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) return `M0 0h${w}v${h}h${-w}z`;
  return `M${r} 0h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

/*
 * opts = {
 *   measure(text, size, bold) → pt, imgs: { mark: { w, h }, word: { w, h } | null }, company: { legal, addr1, addr2, email, web },
 *   head: { kicker, kickerIcon, title, sub, folio (código de barras), meta: [{ label, value, w (peso), folio, color }] },
 *   cont: { title, sub: [[texto, resaltado]], asideLabel, asideValue },
 *   foot: { left, center }   (a la derecha va «Página n de N»)
 * }
 * Devuelve las primitivas de dibujo, los bloques del diseño y finish() para el pie con numeración.
 */
export function createDoc({ measure, imgs = {}, company = {}, head = {}, cont = {}, foot = {} }) {
  const pages = [];
  let page = null, secN = 0;
  const W = (t, s, b) => measure(pdfSafe(t), s, b);
  const mark = imgs.mark || { w: 1, h: 1 };

  /* ===== Primitivas ===== */
  /* o: { s, b, c, a, up (mayúsculas), tr (espaciado en em), sx (condensado) } */
  function text(x, y, str, o = {}) {
    const t = pdfSafe(o.up ? up(str) : str), s = o.s || 8, b = !!o.b, sx = o.sx || 1, ls = (o.tr || 0) * s;
    const it = { t: 'text', x, y, text: t, s, b, c: o.c || DOC.ink, a: o.a || 'start' };
    if (sx !== 1 || ls) {
      /* Con espaciado o condensado la posición se resuelve aquí: los dos dibujos reciben el inicio exacto */
      const w = measure(t, s, b) * sx + ls * [...t].length;
      it.x = it.a === 'end' ? x - w : it.a === 'middle' ? x - w / 2 : x; it.a = 'start';
      if (sx !== 1) it.sx = sx;
      if (ls) it.ls = ls;
    }
    page.items.push(it);
    return it;
  }
  const textW = (str, o = {}) => { const t = pdfSafe(o.up ? up(str) : str), s = o.s || 8; return measure(t, s, !!o.b) * (o.sx || 1) + (o.tr || 0) * s * [...t].length; };
  const rect = (x, y, w, h, o = {}) => page.items.push({ t: 'rect', x, y, w, h, fill: o.fill || null, stroke: o.stroke || null, sw: o.sw || 0.6 });
  const line = (x1, y1, x2, y2, o = {}) => page.items.push({ t: 'line', x1, y1, x2, y2, c: o.c || DOC.line, w: o.w || 0.6 });
  const image = (key, x, y, w, h) => page.items.push({ t: 'image', key, x, y, w, h });
  const path = (d, x, y, scale, o = {}) => page.items.push({ t: 'path', d, x, y, scale, fill: o.fill || null, stroke: o.stroke || null, sw: o.sw || 1, ...(o.cap ? { cap: o.cap } : {}) });
  const rrect = (x, y, w, h, r, o = {}) => path(roundRectPath(w, h, r), x, y, 1, o);
  /* Ícono de DOCGEN (cuadrícula de 24, trazo 2 redondeado) */
  const icon = (name, x, y, size, color, sw = 2) => { if (ICON_PATHS[name]) path(ICON_PATHS[name], x, y, size / 24, { stroke: color, sw, cap: 'round' }); };
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

  /* ===== Marca ===== */
  const band = (y, h = 3.75) => { rect(PAGE.ml, y, CW * 0.78, h, { fill: DOC.c1 }); rect(PAGE.ml + CW * 0.78, y, CW * 0.22, h, { fill: DOC.c2 }); };
  function wordmark(x, y, h) {
    if (imgs.word) { const w = h * imgs.word.w / imgs.word.h; image('word', x, y, w, h); return w; }
    text(x, y + h * 0.86, 'PERCONSUR', { s: h * 1.12, b: true, c: DOC.c1, sx: 0.82 });
    return textW('PERCONSUR', { s: h * 1.12, b: true, sx: 0.82 });
  }
  /* Letrero de área (.d-kicker): mayúsculas espaciadas en naranja oscuro con marco naranja */
  function kicker(xr, y, label, ic) {
    const s = 7.1, o = { s, b: true, up: true, tr: TR * 1.5, c: DOC.c2d };
    const iw = ic ? 9.5 : 0, w = textW(label, o) + iw + 12, h = 13;
    rrect(xr - w, y, w, h, 2.25, { stroke: DOC.c2, sw: 0.75 });
    if (ic) icon(ic, xr - w + 6, y + 3, 7.5, DOC.c2d, 2.2);
    text(xr - w + 6 + iw, y + 9.2, label, o);
    return h;
  }

  /* ===== Encabezado de la primera página ===== */
  function firstHeader() {
    const top = 30, x0 = PAGE.ml;
    /* Izquierda: logotipo + nombre + razón social y datos de contacto */
    const blockH = 70, mh = 54, mw = mh * mark.w / mark.h;
    image('mark', x0, top + (blockH - mh) / 2, mw, mh);
    const x = x0 + mw + 10.5;
    const wW = wordmark(x, top, 21);
    const co = [[company.legal, true, DOC.ink], [company.addr1, false, DOC.ink2], [company.addr2, false, DOC.ink2], [[company.email, company.web].filter(Boolean).join('  |  '), false, DOC.ink2]]
      .filter(([t]) => t);
    let leftW = wW;
    co.forEach(([t, b, c], i) => { text(x, top + 35 + i * 11.2, t, { s: 7.4, b, c }); leftW = Math.max(leftW, W(t, 7.4, b)); });
    const leftR = x + leftW, leftB = top + Math.max(blockH, 35 + (co.length - 1) * 11.2 + 4);
    /* Derecha: letrero, título condensado, subtítulo y código de barras */
    let y = top;
    if (head.kicker) y += kicker(RX, y, head.kicker, head.kickerIcon) + 6;
    const avail = RX - leftR - 18;
    let ts = 22.5;
    const tw = textW(head.title, { s: ts, b: true, up: true, sx: SQ });
    if (tw > avail) ts = Math.max(13, ts * avail / tw);
    text(RX, y + ts * 0.74, head.title, { s: ts, b: true, up: true, sx: SQ, c: DOC.ink, a: 'end' });
    y += ts * 0.74;
    if (head.sub) { y += 12; text(RX, y, fit(up(head.sub), 8.2, false, avail), { s: 8.2, c: DOC.mute, tr: TR, a: 'end' }); }
    const bc = head.folio ? code128(head.folio) : null;
    /* 1 módulo = 0.75 pt (1 px de DOCGEN); un folio muy largo se angosta para no invadir el bloque de la empresa */
    if (bc) { const k = Math.min(0.75, avail / bc.mods), x0 = RX - bc.mods * k, bh = 19.5; y += 7; bc.bars.forEach(([p, n]) => rect(x0 + p * k, y, n * k, bh, { fill: '#1A2233' })); y += bh; }
    else y += 3;
    /* Banda y tira de datos */
    const by = Math.max(leftB, y) + 11;
    band(by);
    return metaStrip(by + 3.75, head.meta || []);
  }
  /* Tira de datos clave (.d-meta): celdas con etiqueta en mayúsculas y dato; el folio en azul */
  function metaStrip(y, items) {
    if (!items.length) return y + 14;
    const h = 31, tot = items.reduce((a, it) => a + (it.w || 1), 0);
    line(PAGE.ml, y, PAGE.ml, y + h); line(RX, y, RX, y + h); line(PAGE.ml, y + h, RX, y + h);
    let x = PAGE.ml;
    items.forEach((it, i) => {
      const w = CW * (it.w || 1) / tot;
      if (i) line(x, y + 4, x, y + h - 4, { c: DOC.line2 });
      text(x + 7.5, y + 11, it.label, { s: 6, b: true, up: true, tr: TR, c: DOC.mute });
      const vs = it.folio ? 11 : 9;
      text(x + 7.5, y + 24.5, fit(it.value || '—', vs, true, w - 14), { s: vs, b: true, c: it.color || (it.folio ? DOC.c1 : DOC.ink) });
      x += w;
    });
    return y + h + 14;
  }

  /* ===== Encabezado de las páginas siguientes (como el anexo de DOCGEN) ===== */
  function contHeader() {
    const top = 30, mh = 34, mw = mh * mark.w / mark.h;
    image('mark', PAGE.ml, top, mw, mh);
    const x = PAGE.ml + mw + 10.5;
    let aw = 0;
    if (cont.asideValue) {
      const vo = { s: 12, b: true, c: DOC.c2d };
      aw = Math.max(textW(cont.asideValue, vo), textW(cont.asideLabel || '', { s: 6.4, b: true, up: true, tr: TR }));
      text(RX, top + 11, cont.asideLabel || '', { s: 6.4, b: true, up: true, tr: TR, c: DOC.mute, a: 'end' });
      text(RX, top + 27, cont.asideValue, { ...vo, a: 'end' });
    }
    const avail = RX - x - aw - 16;
    let ts = 16.5;
    const tw = textW(cont.title || head.title, { s: ts, b: true, up: true, sx: SQ });
    if (tw > avail) ts = Math.max(11, ts * avail / tw);
    text(x, top + 15, cont.title || head.title, { s: ts, b: true, up: true, sx: SQ, c: DOC.ink });
    /* Subtítulo con partes resaltadas (folio en azul) */
    let sx = x;
    for (const [t, hl] of cont.sub || []) {
      const o = { s: 7.9, b: !!hl, c: hl ? DOC.c1 : DOC.ink2 }, tt = fit(t, 7.9, !!hl, Math.max(10, x + avail - sx));
      text(sx, top + 28, tt, o); sx += W(tt, 7.9, !!hl);
    }
    band(top + mh + 9);
    return top + mh + 9 + 3.75 + 14;
  }

  function newPage() { page = { w: PAGE.w, h: PAGE.h, items: [] }; pages.push(page); return pages.length === 1 ? firstHeader() : contHeader(); }

  /* ===== Bloques ===== */
  /* Encabezado de sección numerado (.s-h): número en azul, título en mayúsculas y línea fina hasta el margen */
  function sectionHead(y, title, { n = null, aside = '' } = {}) {
    const num = n || pad2(++secN);
    const bw = Math.max(15, W(num, 6.75, true) + 6);
    rrect(PAGE.ml, y + 2, bw, 12, 2.25, { fill: DOC.c1 });
    text(PAGE.ml + bw / 2, y + 10.4, num, { s: 6.75, b: true, c: DOC.white, a: 'middle' });
    const to = { s: 7.9, b: true, up: true, tr: TR, c: DOC.c1 };
    const tx = PAGE.ml + bw + 6;
    text(tx, y + 10.6, title, to);
    let lineEnd = RX;
    if (aside) { const aw = W(aside, 7.4, false); text(RX, y + 10.6, aside, { s: 7.4, c: DOC.ink2, a: 'end' }); lineEnd = RX - aw - 6; }
    const lx = tx + textW(title, to) + 6;
    if (lineEnd > lx) line(lx, y + 8, lineEnd, y + 8, { c: DOC.line, w: 0.75 });
    return { y: y + 19, n: num };
  }
  /* Celdas con etiqueta (.s-cells): items [[etiqueta, valor, nota?]]; devuelve la altura usada */
  function cellsRow(y, items, cols, { h = null } = {}) {
    const cw = CW / cols, hasNote = items.some((it) => it[2]);
    const rh = h || (hasNote ? 39 : 31);
    rect(PAGE.ml, y, CW, rh, { stroke: DOC.line, sw: 0.75 });
    items.forEach(([k, v, note], j) => {
      const x = PAGE.ml + j * cw;
      if (j) line(x, y, x, y + rh, { c: DOC.line2, w: 0.75 });
      text(x + 7.5, y + 11, k, { s: 6, b: true, up: true, tr: TR, c: DOC.mute });
      text(x + 7.5, y + 23.5, fit(v, 9.2, true, cw - 15), { s: 9.2, b: true });
      if (note) text(x + 7.5, y + 33, fit(note, 6.6, false, cw - 15), { s: 6.6, c: DOC.c2d });
    });
    return rh;
  }
  /* Encabezado de tabla (.s-t th): fondo azul sólido, etiquetas blancas en mayúsculas */
  function tableHead(y, cols, xs, h = 16) {
    rect(PAGE.ml, y, CW, h, { fill: DOC.c1 });
    cols.forEach((c, i) => {
      const right = c.align === 'right';
      text(right ? xs[i] + c.w - 6 : xs[i] + 6, y + h / 2 + 2.3, c.label, { s: 6.2, b: true, up: true, tr: TR, c: DOC.white, a: right ? 'end' : 'start' });
    });
    return y + h;
  }
  /* Bordes laterales de un renglón de tabla y separador superior (.s-t td) */
  function rowFrame(y, h, k, { total = false } = {}) {
    if (total) rect(PAGE.ml, y, CW, h, { fill: DOC.c1l });
    else if (k % 2 === 1) rect(PAGE.ml, y, CW, h, { fill: DOC.soft });
    if (total) line(PAGE.ml, y, RX, y, { c: DOC.c1, w: 0.75 });
    else if (k > 0) line(PAGE.ml, y, RX, y, { c: DOC.line2, w: 0.6 });
    line(PAGE.ml, y, PAGE.ml, y + h, { c: DOC.line, w: 0.75 }); line(RX, y, RX, y + h, { c: DOC.line, w: 0.75 });
  }
  const tableEnd = (y) => line(PAGE.ml, y, RX, y, { c: DOC.line, w: 0.75 });
  /* Nota con ícono (.s-decl: escudo y borde naranja; .s-ev: información y borde azul) */
  function note(y, str, { icon: ic = 'info', accent = DOC.c1, iconColor = null, maxLines = 4, s = 7.4 } = {}) {
    const lines = wrap(str, s, false, CW - 40, maxLines), lh = s * 1.5, h = 13 + lines.length * lh;
    rect(PAGE.ml, y, CW, h, { fill: DOC.soft });
    rect(PAGE.ml, y, 2.25, h, { fill: accent });
    icon(ic, PAGE.ml + 11, y + 6.5, 10.5, iconColor || accent, 2);
    lines.forEach((l, i) => text(PAGE.ml + 29, y + 6.5 + s * 0.95 + i * lh, l, { s, c: DOC.ink2 }));
    return h;
  }
  const noteHeight = (str, { maxLines = 4, s = 7.4 } = {}) => 13 + wrap(str, s, false, CW - 40, maxLines).length * s * 1.5;

  /* Pie (.s-foot3): izquierda, folio al centro y número de página a la derecha */
  function finish() {
    pages.forEach((p, i) => {
      p.items.push({ t: 'line', x1: PAGE.ml, y1: 750, x2: RX, y2: 750, c: DOC.line, w: 0.75 });
      if (foot.left) p.items.push({ t: 'text', x: PAGE.ml, y: 761, text: pdfSafe(foot.left), s: 6.4, b: false, c: DOC.mute, a: 'start' });
      if (foot.center) p.items.push({ t: 'text', x: PAGE.w / 2, y: 761, text: pdfSafe(foot.center), s: 6.6, b: true, c: DOC.ink2, a: 'middle' });
      p.items.push({ t: 'text', x: RX, y: 761, text: pdfSafe(`Página ${i + 1} de ${pages.length}`), s: 6.4, b: false, c: DOC.mute, a: 'end' });
    });
    return pages;
  }

  return {
    pages, get page() { return page; }, W, text, textW, rect, line, image, path, rrect, icon, fit, wrap, band,
    newPage, sectionHead, cellsRow, tableHead, rowFrame, tableEnd, note, noteHeight, finish, CW, RX,
  };
}
