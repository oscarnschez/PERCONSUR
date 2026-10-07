/*
 * Códigos QR y código para Excel.
 * - qrDataURL: qrcode-generator (QR de ubicación en documentos).
 * - excelCode: PDF417 con bwip-js para Scan-IT to Office; si falla, QR (igual que el original).
 * Código 128 del folio: implementado en el original pero nunca se mostraba; se conserva aquí sin uso.
 */
const qrCache = new Map();
function bytesMode() {
  /* Codificar en UTF-8 para que acentos y ñ lleguen bien (José, Rincón, Castañeda) */
  window.qrcode.stringToBytes = (str) => { const b = []; for (let i = 0; i < str.length; i++) b.push(str.charCodeAt(i) & 0xff); return b; };
}
export function qrDataURL(text, cell = 4, margin = 2, utf8 = false) {
  if (!text || typeof window.qrcode !== 'function') return null;
  const key = `${cell}|${margin}|${utf8}|${text}`;
  if (qrCache.has(key)) return qrCache.get(key);
  try {
    bytesMode();
    const q = window.qrcode(0, 'M');
    q.addData(utf8 ? unescape(encodeURIComponent(text)) : text, 'Byte');
    q.make();
    const src = q.createDataURL(cell, margin);
    if (qrCache.size > 60) qrCache.clear();
    qrCache.set(key, src);
    return src;
  } catch (e) { return null; }
}

/* ===== Código para Excel ===== */
const bcCache = new Map();
export let bcError = '';
function hasInk(cv) {
  try {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0;
    for (let i = 3; i < d.length; i += 16) { if (d[i] > 128 && d[i - 3] < 100) { if (++n > 50) return true; } }
  } catch (e) { return true; }
  return false;
}
function pdf417ViaSVG(text) {
  const svg = window.bwipjs.toSVG({ bcid: 'pdf417', text: unescape(encodeURIComponent(text)), binarytext: true, columns: 6, eclevel: 3, rowmult: 3 });
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg); if (!vb) throw new Error('SVG sin viewBox');
  const W = +vb[1], H = +vb[2], k = 3, cv = document.createElement('canvas'); cv.width = Math.ceil(W * k); cv.height = Math.ceil(H * k);
  const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.scale(k, k);
  const re = /<path\b([^>]*)>/g; let m;
  while ((m = re.exec(svg))) {
    const a = m[1], d = /\sd="([^"]+)"/.exec(a); if (!d) continue;
    const fill = (/fill="([^"]+)"/.exec(a) || [, '#000000'])[1], st = (/stroke="([^"]+)"/.exec(a) || [])[1], sw = (/stroke-width="([^"]+)"/.exec(a) || [])[1];
    const col = (c) => (c.startsWith('#') || (/^[a-z]/i.test(c) && !/^[0-9a-f]{6}$/i.test(c)) ? c : '#' + c);
    const p = new Path2D(d[1]);
    if (fill !== 'none' && !/^#?(fff|ffffff)$/i.test(fill)) { x.fillStyle = col(fill); x.fill(p); }
    if (st && st !== 'none') { x.strokeStyle = col(st); x.lineWidth = sw ? +sw : 1; x.stroke(p); }
  }
  return cv;
}
function qrFallback(text) {
  if (typeof window.qrcode !== 'function') return null;
  bytesMode();
  try {
    const q = window.qrcode(0, 'M'); q.addData(unescape(encodeURIComponent(text)), 'Byte'); q.make();
    const n = q.getModuleCount() + 4; const px = Math.max(1, Math.floor(56 / n));
    return { src: q.createDataURL(6, 24), w: n * px, h: n * px, kind: 'qr' };
  } catch (e) { return null; }
}
export function excelCode(text) {
  if (!text) return null;
  if (bcCache.has(text)) return bcCache.get(text);
  let r = null;
  if (window.bwipjs) {
    const tries = [
      () => { const cv = document.createElement('canvas'); window.bwipjs.toCanvas(cv, { bcid: 'pdf417', text: unescape(encodeURIComponent(text)), binarytext: true, columns: 6, eclevel: 3, rowmult: 3, scale: 3, backgroundcolor: 'FFFFFF' }); return cv; },
      () => pdf417ViaSVG(text),
    ];
    for (const t of tries) {
      try {
        const cv = t();
        if (cv && cv.width && hasInk(cv)) { r = { src: cv.toDataURL('image/png'), w: Math.round(cv.width / 3), h: Math.round(cv.height / 3), kind: 'pdf417' }; break; }
        bcError = 'El código se generó vacío';
      } catch (e) { bcError = String((e && e.message) || e); }
    }
  } else bcError = 'No se cargó el generador de códigos de barras';
  if (!r) r = qrFallback(text);
  if (r) { if (bcCache.size > 40) bcCache.clear(); bcCache.set(text, r); }
  return r;
}

/* Código 128-B del folio (conservado del original; no se imprime en el documento actual) */
const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232'.split(' ');
export function folioBarcode(text) {
  text = String(text || '').replace(/[^\x20-\x7E]/g, '');
  if (!text) return null;
  const vals = [104, ...[...text].map((ch) => ch.charCodeAt(0) - 32)];
  let sum = 104; for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
  vals.push(sum % 103);
  const widths = vals.map((v) => C128[v]).join('') + '2331112';
  const quiet = 10, mods = [...widths].reduce((a, w) => a + +w, 0) + quiet * 2, k = 4, H = 44;
  const cv = document.createElement('canvas'); cv.width = mods * k; cv.height = H * k;
  const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.fillStyle = '#1A2233';
  let pos = quiet, bar = true; for (const w of widths) { const n = +w; if (bar) x.fillRect(pos * k, 0, n * k, cv.height); pos += n; bar = !bar; }
  return { text, src: cv.toDataURL('image/png'), mods };
}
