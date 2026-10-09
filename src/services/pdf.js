/*
 * Generación de PDF — misma técnica que DOCGEN para conservar el formato exacto:
 *   1. Se monta la(s) hoja(s) HTML a 816 px de ancho (carta / media carta), sin depender del tamaño de la pantalla.
 *   2. Se sustituyen los elementos que html2canvas no dibuja bien (textos con Archivo condensado, renglones de
 *      observaciones, íconos y código de barras en SVG) por imágenes — igual que prepClone() de DOCGEN.
 *   3. html2canvas (escala 2.5) → JPEG → jsPDF, con enlaces clicables sobre QR y rastreo GPS.
 *   4. pdf-lib agrega los archivos combinados (PDF / JPG / PNG) en el orden elegido.
 * Mejoras para Safari iOS:
 *   - Cada lienzo se libera (width/height = 0) en cuanto se usa: Safari limita la memoria de canvas.
 *   - Si el lienzo sale vacío o falla por memoria, se reintenta con escala 2.0 y luego 1.6.
 *   - Se generan vistas previas ligeras de cada página para el visor interno.
 */
import { loadLibs } from './libs.js';

export const FORMATS = {
  letter: { jspdf: { unit: 'pt', format: 'letter', compress: true }, W: 612, H: 792, quality: 0.9 },
  half: { jspdf: { unit: 'pt', format: [396, 612], orientation: 'landscape', compress: true }, W: 612, H: 396, quality: 0.92 },
};
const SCALES = [2.5, 2, 1.6];

/* Texto con fuente condensada → imagen (html2canvas ignora font-stretch) */
function drawText(el) {
  const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect();
  const cs = getComputedStyle(el), w = Math.ceil(b.width) + 1, h = Math.ceil(b.height), raw = el.textContent.trim();
  const txt = cs.textTransform === 'uppercase' ? raw.toUpperCase() : raw;
  if (!w || !h || !txt) return;
  const k = 3, c = document.createElement('canvas'); c.width = w * k; c.height = h * k; const x = c.getContext('2d');
  const st = parseFloat(cs.fontStretch) || 100;
  if ('fontStretch' in x) x.fontStretch = st <= 56 ? 'ultra-condensed' : st <= 69 ? 'extra-condensed' : st <= 81 ? 'condensed' : st <= 94 ? 'semi-condensed' : 'normal';
  x.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; x.fillStyle = cs.color; x.textBaseline = 'alphabetic';
  const m = x.measureText(txt), asc = m.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.75, dsc = m.actualBoundingBoxDescent || 0;
  x.scale(k * Math.min(1.15, w / m.width), k); x.fillText(txt, 0, (h - (asc + dsc)) / 2 + asc);
  const i = new Image(); i.src = c.toDataURL('image/png'); c.width = c.height = 0;
  i.alt = txt; i.style.cssText = `display:block;width:${w}px;height:${h}px;max-width:none`;
  el.textContent = ''; el.appendChild(i);
}

/* SVG en línea (íconos, código de barras) → imagen PNG: html2canvas no siempre dibuja bien los SVG */
function svgToImg(svgEl, scale) {
  return new Promise((res) => {
    const r = svgEl.getBoundingClientRect(), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const str = new XMLSerializer().serializeToString(svgEl);
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const out = new Image(); out.src = c.toDataURL('image/png'); c.width = c.height = 0;
      out.className = svgEl.getAttribute('class') || ''; out.style.cssText = `width:${w}px;height:${h}px;flex:none;display:block`;
      out.onload = () => res(out); out.onerror = () => res(null);
    };
    im.onerror = () => res(null);
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  });
}

const waitImages = (root) => Promise.all([...root.querySelectorAll('img')].map((im) => (im.complete && im.naturalWidth ? 0 : new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 8000); }))));

async function prepare(spec) {
  /* La hoja (816 px) se monta dentro de un contenedor fijo que recorta el desbordamiento:
     así no ensancha la página en el teléfono (evita zoom o desplazamiento lateral en Safari). */
  const stage = document.createElement('div');
  stage.className = 'pdf-stage';
  stage.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;overflow:hidden;z-index:900;pointer-events:none';
  const host = document.createElement('div');
  host.className = 'pdf-host doc-root';
  host.style.cssText = 'position:absolute;left:0;top:0;width:816px;background:#fff';
  host.innerHTML = spec.html;
  stage.appendChild(host);
  document.body.appendChild(stage);
  await waitImages(host);
  const sheets = [...host.querySelectorAll(spec.sheetSel)];
  sheets.forEach((x) => { x.style.boxShadow = 'none'; x.style.marginBottom = '0'; });
  host.querySelectorAll(spec.textSel).forEach(drawText);
  if (spec.obsLines && sheets[0]) {
    sheets[0].querySelectorAll('.s-obs').forEach((obs) => {
      obs.style.background = '#fff'; obs.style.position = 'relative';
      for (let y = 25; y < obs.offsetHeight - 2; y += 22) { const l = document.createElement('div'); l.style.cssText = `position:absolute;left:0;right:0;top:${y}px;height:1px;background:#E7EAF0`; obs.appendChild(l); }
    });
  }
  for (const sv of [...host.querySelectorAll('svg')]) { const im = await svgToImg(sv, 4); if (im) sv.replaceWith(im); }
  await waitImages(host);
  return { host: stage, sheets };
}

async function preview(canvas) {
  const W = Math.min(1224, canvas.width), H = Math.round(canvas.height * W / canvas.width);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').drawImage(canvas, 0, 0, W, H);
  const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  c.width = c.height = 0;
  return b;
}

async function render(spec, scale, onStep) {
  const fmt = FORMATS[spec.format];
  const { host, sheets } = await prepare(spec);
  try {
    const pdf = new window.jspdf.jsPDF(fmt.jspdf);
    const previews = [];
    for (let p = 0; p < sheets.length; p++) {
      onStep && onStep(`Página ${p + 1} de ${sheets.length}`);
      const el = sheets[p];
      if (p > 0) pdf.addPage(spec.format === 'letter' ? 'letter' : [396, 612], spec.format === 'letter' ? 'p' : 'l');
      const canvas = await window.html2canvas(el, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: 1200 });
      const data = canvas.toDataURL('image/jpeg', fmt.quality);
      if (!canvas.width || data.length < 2000) throw new Error('canvas-empty');
      let w = fmt.W, h = canvas.height * fmt.W / canvas.width, x = 0;
      if (h > fmt.H) { w = canvas.width * fmt.H / canvas.height; h = fmt.H; x = (fmt.W - w) / 2; }
      pdf.addImage(data, 'JPEG', x, 0, w, h);
      const sr = el.getBoundingClientRect(), f = w / sr.width;
      el.querySelectorAll(spec.linkSel).forEach((a) => { const r = a.getBoundingClientRect(); pdf.link(x + (r.left - sr.left) * f, (r.top - sr.top) * f, r.width * f, r.height * f, { url: a.href }); });
      previews.push(await preview(canvas));
      canvas.width = canvas.height = 0;
    }
    pdf.setProperties({ title: spec.title, author: spec.author, subject: spec.subject || '' });
    return { buf: pdf.output('arraybuffer'), previews, pages: sheets.length };
  } finally { host.remove(); }
}

/*
 * Agrega un archivo al final de un PDF de pdf-lib (lo usan la nota de Puerto y el expediente de viajes).
 *   PDF: copia las páginas originales (conserva texto y calidad; no se rasteriza).
 *   Imagen JPEG (ya normalizada con normImage): una página carta vertical u horizontal según su proporción,
 *   centrada, sin recortar ni deformar, con margen. Devuelve el número de páginas agregadas.
 */
export async function appendFile(doc, { kind, bytes, w, h }) {
  if (kind === 'pdf') {
    const src = await window.PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await doc.copyPages(src, src.getPageIndices()); pages.forEach((p) => doc.addPage(p));
    return pages.length;
  }
  const img = await doc.embedJpg(bytes); const iw = w || img.width, ih = h || img.height, land = iw > ih;
  const W = land ? 792 : 612, H = land ? 612 : 792, m = 28;
  const k = Math.min((W - 2 * m) / iw, (H - 2 * m) / ih), dw = iw * k, dh = ih * k;
  const pg = doc.addPage([W, H]); pg.drawImage(img, { x: (W - dw) / 2, y: (H - dh) / 2, width: dw, height: dh });
  return 1;
}

async function merge(baseBuf, spec, skipped) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.load(baseBuf);
  for (const a of spec.attachments) {
    try { await appendFile(doc, { kind: a.kind, bytes: new Uint8Array(await a.blob.arrayBuffer()), w: a.w, h: a.h }); }
    catch (e) { console.warn(e); skipped.push(a.name); }
  }
  doc.setTitle(spec.title); doc.setAuthor(spec.author);
  return { bytes: await doc.save(), pages: doc.getPageCount() };
}

/*
 * spec = { format, html, sheetSel, textSel, linkSel, obsLines, colors, title, author, subject, attachments:[{kind,name,blob,w,h}] }
 * Devuelve { blob, previews:[Blob], pages, skipped:[nombres omitidos] }
 */
export async function generatePdf(spec, onStep) {
  onStep && onStep('Preparando');
  await loadLibs(['html2canvas', 'jspdf'].concat(spec.attachments.length ? ['pdflib'] : []));
  if (document.fonts && document.fonts.ready) {
    /* Las letras del documento (Archivo, Inter y JetBrains Mono) se cargan antes de dibujar la hoja */
    const faces = ['800 44px "Archivo"', '400 12px "Inter"', '600 12px "Inter"', '800 12px "Inter"', '700 15px "JetBrains Mono"', '600 12px "JetBrains Mono"'];
    try { await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* sin fuente: respaldo del sistema */ }
    await document.fonts.ready;
  }
  const sy = window.scrollY; window.scrollTo(0, 0);
  let out = null, lastErr = null;
  try {
    for (const scale of SCALES) {
      try { out = await render(spec, scale, onStep); break; } catch (e) { lastErr = e; console.warn('PDF escala', scale, e); }
    }
  } finally { window.scrollTo(0, sy); }
  if (!out) throw lastErr || new Error('No se pudo generar el PDF');
  const skipped = [];
  let bytes = out.buf, pages = out.pages;
  if (spec.attachments.length) {
    onStep && onStep('Combinando archivos');
    const m = await merge(out.buf, spec, skipped);
    bytes = m.bytes; pages = m.pages;
  }
  return { blob: new Blob([bytes], { type: 'application/pdf' }), previews: out.previews, pages, skipped };
}

/* Respaldo si no se pudieron cargar las librerías (comportamiento del original): impresión del navegador */
export function printFallback(html) {
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; root.className = 'doc-root'; document.body.appendChild(root); }
  root.innerHTML = html;
  document.documentElement.classList.add('printing');
  const end = () => { document.documentElement.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', end); };
  window.addEventListener('afterprint', end);
  setTimeout(() => window.print(), 300);
}
