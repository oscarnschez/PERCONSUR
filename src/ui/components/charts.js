/*
 * Gráficas SVG ligeras (sin librerías, funcionan sin conexión). Cada una responde una pregunta concreta.
 * Colores por variables CSS: se adaptan a modo claro y oscuro.
 */
const W = 340, PAD = { l: 44, r: 12, t: 14, b: 26 };
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function niceRange(min, max) {
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
  const span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / 3))), m = [1, 2, 2.5, 5, 10].find((k) => span / (k * step) <= 4) * step;
  return { lo: Math.floor(min / m) * m, hi: Math.ceil(max / m) * m, step: m };
}
const shortDate = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
function frame(H, r, fmt) {
  let g = '';
  for (let v = r.lo; v <= r.hi + r.step / 2; v += r.step) {
    const y = PAD.t + (H - PAD.t - PAD.b) * (1 - (v - r.lo) / (r.hi - r.lo));
    g += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y}" y2="${y}" class="ch-grid"/><text x="${PAD.l - 6}" y="${y + 3.5}" class="ch-ax" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  return g;
}
/* Línea en el tiempo. points: [{ x:'AAAA-MM-DD', y }], avg: número opcional (línea punteada) */
export function lineChart({ points, avg = null, fmt = (v) => v.toFixed(2), avgLabel = 'Promedio', label = '', height = 190 }) {
  if (!points.length) return '<p class="ch-empty">Aún no hay datos suficientes para esta gráfica.</p>';
  const H = height, ys = points.map((p) => p.y).concat(avg != null ? [avg] : []);
  const r = niceRange(Math.min(...ys), Math.max(...ys)), iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const X = (i) => PAD.l + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1)), Y = (v) => PAD.t + ih * (1 - (v - r.lo) / (r.hi - r.lo));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const lastI = points.length - 1, idx = [...new Set([0, Math.floor(lastI / 2), lastI])];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${frame(H, r, fmt)}
    ${avg != null ? `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${Y(avg)}" y2="${Y(avg)}" class="ch-avg"/><text x="${W - PAD.r}" y="${Y(avg) - 5}" class="ch-avgt" text-anchor="end">${esc(avgLabel)} ${esc(fmt(avg))}</text>` : ''}
    <path d="${path}" class="ch-line"/>${points.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.y)}" r="${points.length > 40 ? 1.8 : 3}" class="ch-dot${i === lastI ? ' last' : ''}"><title>${esc(shortDate(p.x))}: ${esc(fmt(p.y))}</title></circle>`).join('')}
    <text x="${X(lastI)}" y="${Y(points[lastI].y) - 8}" class="ch-val" text-anchor="${points.length === 1 ? 'middle' : 'end'}">${esc(fmt(points[lastI].y))}</text>
    ${idx.map((i) => `<text x="${X(i)}" y="${H - 8}" class="ch-ax" text-anchor="${i === 0 && points.length > 1 ? 'start' : i === lastI && points.length > 1 ? 'end' : 'middle'}">${esc(shortDate(points[i].x))}</text>`).join('')}</svg>`;
}
/* Barras por periodo. bars: [{ label, v }] */
export function barChart({ bars, fmt = (v) => String(Math.round(v)), label = '', height = 170 }) {
  if (!bars.some((b) => b.v > 0)) return '<p class="ch-empty">Sin registros en los últimos meses.</p>';
  const H = height, r = niceRange(0, Math.max(...bars.map((b) => b.v))), iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const bw = iw / bars.length, Y = (v) => PAD.t + ih * (1 - (v - r.lo) / (r.hi - r.lo));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${frame(H, { ...r, lo: 0 }, fmt)}
    ${bars.map((b, i) => { const x = PAD.l + i * bw + bw * 0.18, h = Math.max(0, PAD.t + ih - Y(b.v)); return `<rect x="${x.toFixed(1)}" y="${Y(b.v).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="ch-bar${i === bars.length - 1 ? ' last' : ''}"><title>${esc(b.label)}: ${esc(fmt(b.v))}</title></rect>${i % 2 === bars.length % 2 || bars.length <= 6 ? `<text x="${(x + bw * 0.32).toFixed(1)}" y="${H - 8}" class="ch-ax" text-anchor="middle">${esc(b.label)}</text>` : ''}`; }).join('')}</svg>`;
}
