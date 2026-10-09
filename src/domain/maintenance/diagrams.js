/*
 * Taller — diagramas técnicos vectoriales (tractocamión, chasis portacontenedor, jaula y tolva) y esquema de ejes y
 * llantas. Una sola geometría para dos salidas idénticas:
 *   svgMarkup()  SVG interactivo de la app (cada componente es una región con data-c)
 *   pdfItems()   trazos del modelo de páginas del reporte (pdf-lib drawSvgPath + vista previa SVG)
 * Solo se usan comandos absolutos M, L, Q, C y Z (sin arcos), así la misma ruta sirve en el SVG, en pdf-lib y al
 * reflejar la vista lateral derecha.
 * Colores por estado: ver STATE_COLORS en maintenance.js (gris sin daño, amarillo leve, naranja moderado, rojo daño
 * total, azul reemplazado). Los componentes intervenidos llevan además un número (no se depende solo del color).
 */
import { STATE_COLORS, TIRE_LAYOUTS, positionsOf } from './maintenance.js';
import { SEVERITY_RANK, LEGACY_ALIASES } from './catalog.js';

/* ===== Primitivas ===== */
const R = (x, y, w, h, r = 0) => ({ k: 'rect', x, y, w, h, r });
const C = (cx, cy, r) => ({ k: 'circle', cx, cy, r });
const P = (pts, close = true) => ({ k: 'poly', pts, close });
const D = (d) => ({ k: 'path', d });
const T = (x, y, t, o = {}) => ({ k: 'text', x, y, t, s: o.s || 13, a: o.a || 'middle', b: !!o.b });
const n2 = (v) => Math.round(v * 100) / 100;

function rectD({ x, y, w, h, r }) {
  r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  if (!r) return `M${n2(x)},${n2(y)} L${n2(x + w)},${n2(y)} L${n2(x + w)},${n2(y + h)} L${n2(x)},${n2(y + h)} Z`;
  return `M${n2(x + r)},${n2(y)} L${n2(x + w - r)},${n2(y)} Q${n2(x + w)},${n2(y)} ${n2(x + w)},${n2(y + r)} L${n2(x + w)},${n2(y + h - r)} Q${n2(x + w)},${n2(y + h)} ${n2(x + w - r)},${n2(y + h)} L${n2(x + r)},${n2(y + h)} Q${n2(x)},${n2(y + h)} ${n2(x)},${n2(y + h - r)} L${n2(x)},${n2(y + r)} Q${n2(x)},${n2(y)} ${n2(x + r)},${n2(y)} Z`;
}
function circleD({ cx, cy, r }) {
  const k = 0.5523 * r;
  return `M${n2(cx - r)},${n2(cy)} C${n2(cx - r)},${n2(cy - k)} ${n2(cx - k)},${n2(cy - r)} ${n2(cx)},${n2(cy - r)} C${n2(cx + k)},${n2(cy - r)} ${n2(cx + r)},${n2(cy - k)} ${n2(cx + r)},${n2(cy)} C${n2(cx + r)},${n2(cy + k)} ${n2(cx + k)},${n2(cy + r)} ${n2(cx)},${n2(cy + r)} C${n2(cx - k)},${n2(cy + r)} ${n2(cx - r)},${n2(cy + k)} ${n2(cx - r)},${n2(cy)} Z`;
}
const polyD = ({ pts, close }) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n2(x)},${n2(y)}`).join(' ') + (close ? ' Z' : '');
const primD = (p) => (p.k === 'rect' ? rectD(p) : p.k === 'circle' ? circleD(p) : p.k === 'poly' ? polyD(p) : p.d);
/* Reflejo horizontal (vista lateral derecha = izquierda vista desde el otro lado) */
function mirrorPrim(p, W) {
  if (p.k === 'rect') return { ...p, x: W - p.x - p.w };
  if (p.k === 'circle') return { ...p, cx: W - p.cx };
  if (p.k === 'poly') return { ...p, pts: p.pts.map(([x, y]) => [W - x, y]) };
  if (p.k === 'text') return { ...p, x: W - p.x, a: p.a === 'start' ? 'end' : p.a === 'end' ? 'start' : p.a };
  return { ...p, d: mirrorD(p.d, W) };
}
function mirrorD(d, W) {
  return d.replace(/([MLQCZ])([^MLQCZ]*)/g, (m, cmd, args) => {
    const nums = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    const pairs = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pairs.push(`${n2(W - nums[i])},${n2(nums[i + 1])}`);
    return cmd + pairs.join(' ') + ' ';
  }).trim();
}
/* Caja que ocupa una primitiva (para la etiqueta numerada) */
function bbox(p) {
  if (p.k === 'rect') return [p.x, p.y, p.x + p.w, p.y + p.h];
  if (p.k === 'circle') return [p.cx - p.r, p.cy - p.r, p.cx + p.r, p.cy + p.r];
  const nums = p.k === 'poly' ? p.pts.flat() : p.d.match(/-?\d+(\.\d+)?/g).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/* ===== Estilos ===== */
export const INK = '#2D3442';
const ST = {
  ground: { fill: null, stroke: '#B8C0CC', sw: 2 },
  dash: { fill: null, stroke: '#9AA3B2', sw: 1.6, dash: [8, 6] },
  base: { fill: '#FFFFFF', stroke: '#4A5568', sw: 1.8 },
  metal: { fill: '#E3E7ED', stroke: '#4A5568', sw: 1.8 },
  dark: { fill: '#5B6474', stroke: '#3B4453', sw: 1.4 },
  detail: { fill: null, stroke: '#7C8697', sw: 1.2 },
  label: { fill: '#7C8697' },
};
const LINE_NONE = '#8A93A3';

/* ===== Geometría ===== */
/* Capas en orden de dibujo: [componente | null, estilo, primitivas[]] */
const L = (c, style, ...prims) => ({ c, style, prims });
const lugs = (cx, cy) => [C(cx, cy, 9), ...[0, 1, 2, 3, 4].map((i) => C(cx + 15 * Math.cos(i * 1.2566 - 1.57), cy + 15 * Math.sin(i * 1.2566 - 1.57), 2.2))];

/* Tractocamión moderno (cabina dormitorio de techo alto, cofre inclinado, defensa aerodinámica) — lateral izquierda,
   frente a la izquierda. La lateral derecha es este mismo dibujo reflejado con las llantas del otro lado. */
function tractorSide() {
  return [
    L(null, 'ground', D('M20,384 L980,384')),
    L(null, 'metal', R(80, 292, 830, 16, 3)),
    L(null, 'metal', P([[690, 276], [830, 276], [836, 290], [684, 290]]), R(740, 266, 40, 10, 2)),
    L(null, 'dark', R(884, 306, 12, 68, 3)),
    L('susp_del', 'part', D('M94,298 Q160,316 226,298 L226,306 Q160,324 94,306 Z')),
    L('amortiguadores', 'part', R(232, 298, 8, 34, 3), R(644, 300, 8, 32, 3), R(866, 300, 8, 30, 3)),
    L('susp_tras', 'part', R(724, 298, 62, 14, 4), P([[740, 290], [770, 290], [764, 298], [746, 298]])),
    L('bolsas_aire', 'part', R(616, 278, 26, 16, 7), R(870, 276, 26, 16, 7)),
    L('llantas_del_izq', 'part', C(160, 334, 46)),
    L('llantas_trac_izq', 'part', C(700, 334, 46), C(810, 334, 46)),
    L('rines', 'part', C(160, 334, 28), C(700, 334, 28), C(810, 334, 28)),
    L(null, 'detail', C(160, 334, 22), C(700, 334, 22), C(810, 334, 22), ...lugs(160, 334), ...lugs(700, 334), ...lugs(810, 334)),
    L('valvulas', 'part', R(180, 307, 5, 10, 1.5), R(720, 307, 5, 10, 1.5), R(830, 307, 5, 10, 1.5)),
    L('camaras', 'part', R(208, 316, 20, 10, 3), R(746, 318, 18, 10, 3), R(856, 318, 10, 10, 3)),
    L('combustible', 'part', R(316, 302, 152, 44, 20)),
    L(null, 'detail', D('M346,303 L346,345 M438,303 L438,345'), C(332, 314, 4)),
    L('baterias', 'part', R(476, 300, 66, 46, 6)),
    L(null, 'detail', D('M480,316 L538,316 M480,331 L538,331')),
    L('cabina', 'part', D('M300,300 L300,166 L344,84 Q350,72 364,71 L420,67 Q434,40 468,35 L562,32 Q576,32 578,46 L582,300 Z'), P([[578, 42], [602, 50], [606, 292], [582, 300]])),
    L(null, 'detail', D('M440,70 L440,292 M424,66 L566,58'), R(492, 112, 58, 34, 8), R(458, 206, 108, 54, 8), D('M500,214 L524,214 M300,296 L580,296')),
    L('puertas', 'part', P([[350, 102], [436, 96], [438, 292], [350, 292]])),
    L(null, 'detail', P([[372, 108], [430, 104], [430, 174], [356, 178]]), D('M412,204 L428,204 M354,270 L434,270')),
    L('parabrisas', 'part', P([[306, 166], [348, 86], [362, 84], [330, 166]])),
    L(null, 'metal', D('M286,128 L304,124 L304,130 L286,134 Z M286,150 L300,148 L300,154 L286,156 Z')),
    L('espejos', 'part', R(272, 112, 16, 52, 6), R(112, 168, 12, 16, 4)),
    L(null, 'detail', D('M118,184 L122,190')),
    L('cofre', 'part', D('M46,268 Q40,230 62,206 Q76,192 106,188 L300,166 L300,300 L232,300 C232,272 204,256 160,256 C116,256 92,272 92,300 L92,274 Q92,268 86,268 Z')),
    L(null, 'detail', D('M114,198 L296,176 M58,256 Q70,262 88,264'), D('M248,206 L290,201 L290,216 L248,221 Z')),
    L('radiador', 'part', D('M42,264 Q38,232 54,208 L64,214 Q50,236 54,264 Z')),
    L('luces', 'part', D('M54,240 Q60,226 80,224 L128,226 Q134,234 126,240 L66,250 Q54,250 54,240 Z'), R(214, 254, 14, 6, 2), R(508, 26, 12, 5, 2), R(900, 294, 10, 14, 2)),
    L('defensas', 'part', D('M46,262 L94,262 Q102,262 102,270 L104,326 Q104,336 94,336 L54,336 Q40,336 37,324 Q30,298 36,274 Q38,262 46,262 Z')),
    L(null, 'detail', D('M34,300 L102,300'), R(42, 310, 24, 12, 5)),
    L('lineas_aire', 'line', D('M606,150 C644,150 626,200 656,210 C684,220 676,250 700,264')),
  ];
}
/* Tractocamión — frente (el lado derecho del equipo queda a la izquierda de quien lo mira) */
function tractorFront() {
  const hl = 'M134,298 Q136,284 150,288 L190,306 Q198,310 197,320 L195,330 Q193,338 183,336 L144,326 Q133,322 134,310 Z';
  return [
    L(null, 'ground', D('M30,500 L570,500')),
    L(null, 'label', T(130, 522, 'LADO DERECHO', { s: 12, b: true }), T(470, 522, 'LADO IZQUIERDO', { s: 12, b: true })),
    L('llantas_del_der', 'part', R(82, 398, 58, 100, 12)),
    L('llantas_del_izq', 'part', R(460, 398, 58, 100, 12)),
    L('cabina', 'part', D('M156,220 L166,96 Q170,62 204,58 L396,58 Q430,62 434,96 L444,220 Z'), D('M170,64 Q176,20 222,14 L378,14 Q424,20 430,64 Z')),
    L(null, 'detail', D('M200,40 L400,40'), R(158, 120, 10, 70, 3), R(432, 120, 10, 70, 3)),
    L('parabrisas', 'part', D('M186,98 Q188,78 208,76 L392,76 Q412,78 414,98 L422,178 Q300,192 178,178 Z')),
    L(null, 'detail', D('M300,77 L300,186 M214,176 L266,150 M334,180 L386,152')),
    L('espejos', 'part', R(112, 88, 28, 78, 9), R(460, 88, 28, 78, 9), R(146, 196, 16, 22, 5), R(438, 196, 16, 22, 5)),
    L(null, 'detail', D('M140,104 L166,108 M140,150 L164,152 M460,104 L434,108 M460,150 L436,152 M154,218 L162,230 M446,218 L438,230')),
    L('cofre', 'part', D('M184,214 L416,214 Q446,216 458,250 L480,332 Q486,360 484,394 L116,394 Q114,360 120,332 L142,250 Q154,216 184,214 Z')),
    L(null, 'detail', D('M170,228 Q300,220 430,228')),
    L('radiador', 'part', D('M222,236 L378,236 Q392,236 394,250 L406,372 Q406,386 392,386 L208,386 Q194,386 194,372 L206,250 Q208,236 222,236 Z')),
    L(null, 'detail', ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => D(`M${212 - i},${260 + i * 15} L${388 + i},${260 + i * 15}`)), D('M204,312 L396,312')),
    L('defensas', 'part', D('M120,392 L480,392 Q496,392 498,408 L494,444 Q492,458 478,458 L122,458 Q108,458 106,444 L102,408 Q104,392 120,392 Z')),
    L(null, 'detail', R(232, 420, 136, 22, 7), D('M244,431 L356,431')),
    L('luces', 'part', D(hl), D(mirrorD(hl, 600)), R(124, 414, 34, 16, 7), R(442, 414, 34, 16, 7), R(258, 64, 14, 6, 2), R(293, 64, 14, 6, 2), R(328, 64, 14, 6, 2)),
  ];
}
/* Tractocamión — trasera (dormitorio con extensiones laterales; el lado izquierdo queda a la izquierda) */
function tractorRear() {
  return [
    L(null, 'ground', D('M30,500 L570,500')),
    L(null, 'label', T(126, 522, 'LADO IZQUIERDO', { s: 12, b: true }), T(474, 522, 'LADO DERECHO', { s: 12, b: true })),
    L(null, 'metal', P([[124, 48], [150, 40], [150, 286], [130, 278]]), P([[476, 48], [450, 40], [450, 286], [470, 278]])),
    L('cabina', 'part', D('M150,48 Q154,22 186,18 L414,18 Q446,22 450,48 L452,286 L148,286 Z')),
    L(null, 'detail', D('M162,64 L438,64 M160,256 L440,256'), R(266, 86, 68, 34, 6), D('M276,96 L324,96 M276,110 L324,110')),
    L(null, 'metal', P([[150, 282], [450, 282], [440, 300], [160, 300]]), R(214, 300, 24, 42, 2), R(362, 300, 24, 42, 2)),
    L('lineas_aire', 'line', D('M276,140 C256,170 296,186 276,214 C258,240 292,258 284,290'), D('M324,140 C344,170 304,186 324,214 C342,240 308,258 316,290')),
    L(null, 'metal', R(66, 350, 120, 12, 6), R(414, 350, 120, 12, 6)),
    L('ejes', 'part', R(150, 404, 300, 16, 6)),
    L('diferenciales', 'part', C(300, 412, 40)),
    L('bolsas_aire', 'part', R(206, 352, 34, 30, 10), R(360, 352, 34, 30, 10)),
    L('llantas_trac_izq', 'part', R(70, 370, 54, 128, 10), R(128, 370, 54, 128, 10)),
    L('llantas_trac_der', 'part', R(418, 370, 54, 128, 10), R(476, 370, 54, 128, 10)),
    L('luces', 'part', R(196, 320, 40, 16, 3), R(364, 320, 40, 16, 3), R(282, 26, 36, 6, 2)),
  ];
}
/* Tractocamión — esquema de sistemas (vista superior; frente a la izquierda, lado del operador abajo) */
function tractorSystems() {
  return [
    L(null, 'label', T(40, 34, 'FRENTE', { a: 'start', b: true }), T(500, 22, 'LADO DERECHO', { s: 12 }), T(500, 432, 'LADO IZQUIERDO (OPERADOR)', { s: 12 })),
    L(null, 'detail', D('M110,28 L94,28 M94,28 L101,23 M94,28 L101,33')),
    L(null, 'dash', D('M44,150 Q48,122 80,118 L300,108 L300,332 L80,322 Q48,318 44,290 Z'), R(300, 100, 300, 240, 14)),
    L(null, 'metal', R(70, 176, 846, 14, 3), R(70, 250, 846, 14, 3), R(420, 190, 8, 60, 1), R(600, 190, 8, 60, 1), R(900, 190, 8, 60, 1)),
    L('defensas', 'part', R(52, 116, 12, 208, 4)),
    L('luces', 'part', R(64, 176, 8, 14, 2), R(64, 250, 8, 14, 2), R(912, 176, 8, 14, 2), R(912, 250, 8, 14, 2)),
    L('ejes', 'part', R(144, 112, 12, 216, 4), R(694, 96, 12, 248, 4), R(804, 96, 12, 248, 4)),
    L('susp_del', 'part', R(108, 168, 84, 8, 3), R(108, 264, 84, 8, 3)),
    L('susp_tras', 'part', R(640, 168, 210, 8, 3), R(640, 264, 210, 8, 3)),
    L('amortiguadores', 'part', R(196, 166, 22, 8, 3), R(196, 266, 22, 8, 3), R(866, 168, 24, 8, 3), R(866, 264, 24, 8, 3)),
    L('bolsas_aire', 'part', C(752, 158, 9), C(752, 282, 9), C(862, 156, 9), C(862, 284, 9)),
    L('radiador', 'part', R(76, 170, 22, 100, 3)),
    L('enfriamiento', 'line', D('M98,186 C140,186 168,192 212,196'), D('M98,254 C140,254 168,248 212,244')),
    L('motor', 'part', R(212, 174, 124, 92, 8)),
    L(null, 'detail', D('M232,186 L232,254 M252,186 L252,254 M272,186 L272,254 M292,186 L292,254 M312,186 L312,254')),
    L('lubricacion', 'part', R(226, 268, 84, 14, 6), C(320, 276, 7)),
    L('turbo', 'part', C(352, 194, 13)),
    L('alternador', 'part', C(234, 160, 10)),
    L('compresor', 'part', R(266, 144, 30, 18, 4)),
    L('marcha', 'part', R(338, 262, 26, 14, 4)),
    L('embrague', 'part', P([[336, 190], [364, 196], [364, 244], [336, 250]])),
    L('transmision', 'part', R(364, 196, 112, 48, 8)),
    L('cardan', 'part', R(476, 214, 212, 12, 4), R(722, 216, 76, 8, 3)),
    L('diferenciales', 'part', C(700, 220, 22), C(810, 220, 22)),
    L('cableado', 'line', D('M86,206 L204,206 M476,204 L688,204 M722,204 L900,204')),
    L('lineas_aire', 'line', D('M282,144 L282,138 L886,138 L886,302 L870,302')),
    L('llantas_del_der', 'part', R(114, 80, 72, 30, 8)),
    L('llantas_del_izq', 'part', R(114, 330, 72, 30, 8)),
    L('llantas_trac_der', 'part', R(664, 58, 72, 22, 6), R(664, 82, 72, 22, 6), R(774, 58, 72, 22, 6), R(774, 82, 72, 22, 6)),
    L('llantas_trac_izq', 'part', R(664, 336, 72, 22, 6), R(664, 360, 72, 22, 6), R(774, 336, 72, 22, 6), R(774, 360, 72, 22, 6)),
    L('frenos_del', 'part', R(126, 114, 48, 12, 3), R(126, 314, 48, 12, 3)),
    L('frenos_tras', 'part', R(670, 108, 60, 12, 3), R(670, 320, 60, 12, 3), R(780, 108, 60, 12, 3), R(780, 320, 60, 12, 3)),
    L('camaras', 'part', C(186, 134, 7), C(186, 306, 7), C(742, 124, 7), C(742, 316, 7), C(852, 124, 7), C(852, 316, 7)),
    L('terminales', 'part', R(176, 140, 6, 160, 2), C(179, 140, 5), C(179, 300, 5)),
    L('caja_dir', 'part', R(196, 292, 26, 22, 4)),
    L('direccion', 'line', D('M222,302 C262,302 286,292 316,276'), D('M196,312 L168,322')),
    L('combustible', 'part', R(400, 290, 150, 40, 18)),
    L('baterias', 'part', R(560, 290, 56, 40, 4)),
  ];
}

/* Chasis portacontenedor */
function chasisSide() {
  return [
    L(null, 'ground', D('M20,360 L980,360')),
    L(null, 'dash', R(40, 40, 920, 112, 2)),
    L(null, 'label', T(500, 102, 'CONTENEDOR (REFERENCIA)', { s: 13 })),
    L('largueros', 'part', P([[40, 170], [252, 170], [276, 196], [960, 196], [960, 222], [268, 222], [244, 196], [40, 196]])),
    L('estructura', 'part', R(40, 158, 30, 12, 2), R(474, 184, 30, 12, 2), R(926, 184, 34, 12, 2), R(940, 222, 14, 54, 2), R(904, 276, 56, 10, 3)),
    L(null, 'detail', ...[340, 420, 560, 640, 720].map((x) => D(`M${x},222 L${x},232`))),
    L('seguros', 'part', R(46, 148, 16, 10, 2), R(482, 174, 16, 10, 2), R(936, 174, 16, 10, 2)),
    L('acoplamiento', 'part', R(108, 196, 48, 8, 2), R(126, 204, 12, 14, 3)),
    L('conectores', 'part', R(26, 176, 14, 14, 2)),
    L('patines', 'part', R(306, 222, 14, 108, 2), R(296, 330, 34, 10, 3)),
    L(null, 'detail', D('M320,250 L340,250 L340,262')),
    L('suspension', 'part', R(760, 222, 188, 16, 4)),
    L('llantas_izq', 'part', C(800, 314, 42), C(898, 314, 42)),
    L(null, 'base', C(800, 314, 24), C(898, 314, 24)),
    L('ejes', 'part', C(800, 314, 9), C(898, 314, 9)),
    L('frenos', 'part', R(820, 280, 22, 10, 3), R(918, 280, 22, 10, 3)),
    L('luces', 'part', R(960, 200, 10, 14, 2), R(520, 200, 10, 6, 2), R(860, 200, 10, 6, 2)),
  ];
}
function chasisTop() {
  const xs = [100, 200, 300, 400, 560, 660, 760, 860];
  return [
    L(null, 'label', T(40, 22, 'FRENTE', { a: 'start', b: true }), T(600, 12, 'LADO DERECHO', { s: 11 }), T(600, 296, 'LADO IZQUIERDO', { s: 11 })),
    L('largueros', 'part', R(40, 104, 920, 12, 2), R(40, 184, 920, 12, 2)),
    L('estructura', 'part', ...xs.map((x) => R(x, 116, 6, 68, 1)), R(40, 64, 28, 172, 3), R(476, 64, 28, 172, 3), R(928, 64, 32, 172, 3)),
    L('seguros', 'part', R(42, 66, 14, 14, 2), R(42, 220, 14, 14, 2), R(478, 66, 14, 14, 2), R(478, 220, 14, 14, 2), R(936, 66, 14, 14, 2), R(936, 220, 14, 14, 2)),
    L('acoplamiento', 'part', C(132, 150, 12)),
    L('conectores', 'part', R(26, 140, 12, 20, 2)),
    L('patines', 'part', R(306, 84, 16, 16, 2), R(306, 200, 16, 16, 2)),
    L('suspension', 'part', R(762, 96, 180, 6, 2), R(762, 198, 180, 6, 2)),
    L('ejes', 'part', R(796, 54, 8, 192, 3), R(894, 54, 8, 192, 3)),
    L('frenos', 'part', R(776, 70, 46, 10, 3), R(776, 220, 46, 10, 3), R(874, 70, 46, 10, 3), R(874, 220, 46, 10, 3)),
    L('llantas_der', 'part', R(772, 18, 56, 16, 5), R(772, 36, 56, 16, 5), R(870, 18, 56, 16, 5), R(870, 36, 56, 16, 5)),
    L('llantas_izq', 'part', R(772, 248, 56, 16, 5), R(772, 266, 56, 16, 5), R(870, 248, 56, 16, 5), R(870, 266, 56, 16, 5)),
    L('luces', 'part', R(960, 104, 8, 12, 2), R(960, 184, 8, 12, 2)),
  ];
}
function chasisRear() {
  return [
    L(null, 'ground', D('M30,400 L570,400')),
    L('estructura', 'part', R(110, 120, 380, 22, 3), R(170, 190, 14, 48, 2), R(416, 190, 14, 48, 2), R(130, 238, 340, 20, 4)),
    L('largueros', 'part', R(206, 142, 30, 40, 2), R(364, 142, 30, 40, 2)),
    L('seguros', 'part', R(112, 106, 20, 14, 2), R(468, 106, 20, 14, 2)),
    L('luces', 'part', R(196, 196, 40, 16, 3), R(364, 196, 40, 16, 3)),
    L('suspension', 'part', R(190, 262, 60, 18, 4), R(350, 262, 60, 18, 4)),
    L('ejes', 'part', R(150, 300, 300, 14, 5)),
    L('frenos', 'part', R(186, 318, 24, 12, 3), R(390, 318, 24, 12, 3)),
    L(null, 'label', T(124, 416, 'LADO IZQUIERDO', { s: 11 }), T(476, 416, 'LADO DERECHO', { s: 11 })),
    L('llantas_izq', 'part', R(70, 268, 52, 128, 10), R(126, 268, 52, 128, 10)),
    L('llantas_der', 'part', R(422, 268, 52, 128, 10), R(478, 268, 52, 128, 10)),
  ];
}

/* Jaula */
function jaulaSide() {
  return [
    L(null, 'ground', D('M20,362 L980,362')),
    L('paneles', 'part', R(56, 62, 888, 158, 2)),
    L(null, 'detail', ...Array.from({ length: 36 }, (_, i) => D(`M${80 + i * 24},66 L${80 + i * 24},216`)), D('M58,112 L942,112 M58,164 L942,164')),
    L('estructura', 'part', R(40, 50, 920, 12, 3), R(40, 232, 920, 18, 3), R(40, 50, 16, 190, 2), R(944, 50, 16, 190, 2), R(330, 62, 10, 170, 2), R(640, 62, 10, 170, 2)),
    L('piso', 'part', R(56, 220, 888, 12, 2)),
    L('puertas', 'part', R(150, 104, 64, 116, 2)),
    L(null, 'detail', D('M156,120 L208,120 M156,200 L208,200 M206,150 L206,170')),
    L('acoplamiento', 'part', R(110, 250, 48, 8, 2), R(128, 258, 12, 14, 3)),
    L(null, 'metal', R(300, 250, 14, 92, 2), R(290, 342, 34, 10, 3)),
    L('suspension', 'part', R(760, 250, 190, 16, 4)),
    L('llantas_izq', 'part', C(800, 316, 42), C(898, 316, 42)),
    L(null, 'base', C(800, 316, 24), C(898, 316, 24)),
    L('ejes', 'part', C(800, 316, 9), C(898, 316, 9)),
    L('frenos', 'part', R(820, 282, 22, 10, 3), R(918, 282, 22, 10, 3)),
    L('luces', 'part', R(960, 236, 10, 12, 2), R(500, 236, 10, 6, 2), R(944, 42, 10, 6, 2)),
  ];
}
function jaulaTop() {
  return [
    L(null, 'label', T(40, 22, 'FRENTE', { a: 'start', b: true }), T(600, 12, 'LADO DERECHO', { s: 11 }), T(600, 296, 'LADO IZQUIERDO', { s: 11 })),
    L('llantas_der', 'part', R(772, 24, 56, 14, 4), R(870, 24, 56, 14, 4)),
    L('llantas_izq', 'part', R(772, 262, 56, 14, 4), R(870, 262, 56, 14, 4)),
    L('piso', 'part', R(56, 66, 888, 168, 2)),
    L(null, 'detail', ...Array.from({ length: 9 }, (_, i) => D(`M58,${84 + i * 17} L942,${84 + i * 17}`))),
    L('paneles', 'part', R(40, 54, 920, 12, 2), R(40, 234, 920, 12, 2)),
    L('estructura', 'part', R(40, 66, 16, 168, 2), ...[330, 640].flatMap((x) => [R(x, 50, 12, 20, 2), R(x, 230, 12, 20, 2)])),
    L('puertas', 'part', R(944, 66, 16, 168, 2)),
    L('acoplamiento', 'part', C(132, 150, 12)),
  ];
}
function jaulaRear() {
  return [
    L(null, 'ground', D('M30,400 L570,400')),
    L('puertas', 'part', R(146, 46, 154, 210, 2), R(300, 46, 154, 210, 2)),
    L(null, 'detail', D('M196,50 L196,252 M250,50 L250,252 M350,50 L350,252 M404,50 L404,252'), R(286, 140, 10, 26, 2), R(304, 140, 10, 26, 2)),
    L('estructura', 'part', R(130, 30, 340, 16, 2), R(130, 30, 16, 250, 2), R(454, 30, 16, 250, 2), R(130, 266, 340, 16, 2)),
    L('piso', 'part', R(146, 256, 308, 10, 2)),
    L('luces', 'part', R(180, 288, 36, 14, 3), R(384, 288, 36, 14, 3)),
    L('suspension', 'part', R(190, 308, 60, 16, 4), R(350, 308, 60, 16, 4)),
    L('ejes', 'part', R(150, 332, 300, 12, 5)),
    L('frenos', 'part', R(184, 348, 22, 10, 3), R(394, 348, 22, 10, 3)),
    L(null, 'label', T(124, 416, 'LADO IZQUIERDO', { s: 11 }), T(476, 416, 'LADO DERECHO', { s: 11 })),
    L('llantas_izq', 'part', R(70, 296, 52, 102, 10), R(126, 296, 52, 102, 10)),
    L('llantas_der', 'part', R(422, 296, 52, 102, 10), R(478, 296, 52, 102, 10)),
  ];
}

/* Tolva */
function tolvaSide() {
  return [
    L(null, 'ground', D('M20,362 L980,362')),
    L('caja', 'part', R(60, 56, 880, 114, 2), P([[230, 170], [500, 170], [410, 262], [320, 262]]), P([[520, 170], [790, 170], [700, 262], [610, 262]]), P([[60, 170], [230, 170], [214, 190], [60, 190]]), P([[790, 170], [940, 170], [940, 190], [806, 190]])),
    L(null, 'detail', ...[180, 300, 420, 540, 660, 780].map((x) => D(`M${x},60 L${x},168`))),
    L('estructura', 'part', R(52, 46, 896, 10, 3), R(40, 190, 190, 16, 3), R(800, 190, 160, 16, 3), R(120, 206, 12, 14, 3)),
    L('compuertas', 'part', R(320, 262, 90, 14, 3), R(610, 262, 90, 14, 3)),
    L('descarga', 'part', R(318, 278, 94, 8, 3), R(608, 278, 94, 8, 3), R(414, 272, 16, 16, 3), R(704, 272, 16, 16, 3)),
    L('hidraulico', 'part', R(278, 268, 34, 10, 4), R(568, 268, 34, 10, 4)),
    L(null, 'metal', R(250, 206, 14, 128, 2), R(240, 334, 34, 10, 3)),
    L('suspension', 'part', R(800, 206, 150, 16, 4)),
    L('llantas_izq', 'part', C(836, 316, 42), C(926, 316, 42)),
    L(null, 'base', C(836, 316, 24), C(926, 316, 24)),
    L('ejes', 'part', C(836, 316, 9), C(926, 316, 9)),
    L('frenos', 'part', R(856, 282, 22, 10, 3), R(946, 282, 16, 10, 3)),
    L('luces', 'part', R(960, 192, 10, 12, 2), R(54, 38, 10, 6, 2), R(936, 38, 10, 6, 2)),
  ];
}
function tolvaTop() {
  return [
    L(null, 'label', T(40, 22, 'FRENTE', { a: 'start', b: true }), T(600, 12, 'LADO DERECHO', { s: 11 }), T(600, 296, 'LADO IZQUIERDO', { s: 11 })),
    L('llantas_der', 'part', R(808, 18, 56, 14, 4), R(898, 18, 56, 14, 4)),
    L('llantas_izq', 'part', R(808, 268, 56, 14, 4), R(898, 268, 56, 14, 4)),
    L('caja', 'part', R(60, 60, 880, 180, 4)),
    L(null, 'detail', ...[140, 220, 300, 380, 460, 540, 620, 700, 780, 860].map((x) => D(`M${x},64 L${x},236`))),
    L(null, 'dash', R(240, 82, 260, 136, 4), R(530, 82, 260, 136, 4)),
    L('estructura', 'part', R(52, 50, 896, 10, 3), R(52, 240, 896, 10, 3)),
    L('luces', 'part', R(944, 64, 8, 12, 2), R(944, 224, 8, 12, 2)),
  ];
}
function tolvaRear() {
  return [
    L(null, 'ground', D('M30,400 L570,400')),
    L('caja', 'part', P([[110, 34], [490, 34], [478, 190], [122, 190]])),
    L(null, 'detail', D('M130,80 L470,80 M126,136 L474,136')),
    L('estructura', 'part', R(104, 26, 392, 10, 3), R(140, 196, 320, 16, 3), R(150, 280, 300, 16, 3), R(170, 212, 12, 68, 2), R(418, 212, 12, 68, 2)),
    L('luces', 'part', R(196, 236, 40, 16, 3), R(364, 236, 40, 16, 3)),
    L('suspension', 'part', R(196, 300, 60, 16, 4), R(344, 300, 60, 16, 4)),
    L('ejes', 'part', R(150, 324, 300, 12, 5)),
    L('frenos', 'part', R(184, 340, 22, 10, 3), R(394, 340, 22, 10, 3)),
    L(null, 'label', T(124, 416, 'LADO IZQUIERDO', { s: 11 }), T(476, 416, 'LADO DERECHO', { s: 11 })),
    L('llantas_izq', 'part', R(70, 296, 52, 102, 10), R(126, 296, 52, 102, 10)),
    L('llantas_der', 'part', R(422, 296, 52, 102, 10), R(478, 296, 52, 102, 10)),
  ];
}

/* Vista lateral derecha: el mismo dibujo reflejado; los componentes «_izq» visibles pasan a ser los del lado derecho */
const toRight = (layers) => layers.map((l) => (l.c && l.c.endsWith('_izq') ? { ...l, c: l.c.slice(0, -4) + '_der' } : l));

/* Vistas por tipo de equipo */
const VIEWS = {
  tractor: [
    { id: 'izq', name: 'Lateral izquierda', w: 1000, h: 400, build: tractorSide },
    { id: 'der', name: 'Lateral derecha', w: 1000, h: 400, build: () => toRight(tractorSide()), mirror: true },
    { id: 'frente', name: 'Frontal', w: 600, h: 530, build: tractorFront },
    { id: 'trasera', name: 'Trasera', w: 600, h: 530, build: tractorRear },
    { id: 'sistemas', name: 'Esquema de sistemas', w: 1000, h: 440, build: tractorSystems },
  ],
  chasis: [
    { id: 'lado', name: 'Lateral izquierda', w: 1000, h: 380, build: chasisSide },
    { id: 'lado_der', name: 'Lateral derecha', w: 1000, h: 380, build: () => toRight(chasisSide()), mirror: true },
    { id: 'superior', name: 'Vista superior', w: 1000, h: 300, build: chasisTop },
    { id: 'trasera', name: 'Trasera', w: 600, h: 420, build: chasisRear },
  ],
  jaula: [
    { id: 'lado', name: 'Lateral izquierda', w: 1000, h: 380, build: jaulaSide },
    { id: 'lado_der', name: 'Lateral derecha', w: 1000, h: 380, build: () => toRight(jaulaSide()), mirror: true },
    { id: 'superior', name: 'Vista superior', w: 1000, h: 300, build: jaulaTop },
    { id: 'trasera', name: 'Trasera', w: 600, h: 420, build: jaulaRear },
  ],
  tolva: [
    { id: 'lado', name: 'Lateral izquierda', w: 1000, h: 380, build: tolvaSide },
    { id: 'lado_der', name: 'Lateral derecha', w: 1000, h: 380, build: () => toRight(tolvaSide()), mirror: true },
    { id: 'superior', name: 'Vista superior', w: 1000, h: 300, build: tolvaTop },
    { id: 'trasera', name: 'Trasera', w: 600, h: 420, build: tolvaRear },
  ],
};
export const viewsOf = (kind) => (VIEWS[kind] || []).map(({ id, name, w, h }) => ({ id, name, w, h }));
export const hasDiagram = (kind) => !!VIEWS[kind];

const cache = new Map();
/* Capas de una vista (con el reflejo aplicado si corresponde) */
export function viewLayers(kind, viewId) {
  const key = kind + '/' + viewId;
  if (cache.has(key)) return cache.get(key);
  const v = (VIEWS[kind] || []).find((x) => x.id === viewId);
  if (!v) return null;
  const layers = v.build().map((l) => ({ ...l, prims: v.mirror ? l.prims.map((p) => mirrorPrim(p, v.w)) : l.prims }));
  const out = { id: v.id, name: v.name, w: v.w, h: v.h, layers };
  cache.set(key, out);
  return out;
}
/* Componentes que aparecen en cada vista: Map componentId → [vistas] (un componente anterior a la separación por
   lado aparece donde aparezca cualquiera de sus lados) */
export function componentViews(kind) {
  const out = new Map();
  for (const v of VIEWS[kind] || []) for (const l of viewLayers(kind, v.id).layers) if (l.c) { const a = out.get(l.c) || []; if (!a.includes(v.id)) a.push(v.id); out.set(l.c, a); }
  for (const [old, sides] of Object.entries(LEGACY_ALIASES[kind] || {})) {
    const vs = (VIEWS[kind] || []).map((v) => v.id).filter((id) => sides.some((c) => (out.get(c) || []).includes(id)));
    if (vs.length) out.set(old, vs);
  }
  return out;
}
/*
 * Estados por región del dibujo: un registro anterior (p. ej. «Llantas de tracción (ambos lados)») pinta los dos lados;
 * si un lado tiene además registros propios, manda el reemplazo y luego la gravedad más alta.
 */
export function diagramStates(kind, states) {
  const al = LEGACY_ALIASES[kind] || {};
  if (![...states.keys()].some((k) => al[k])) return states;
  const out = new Map(states);
  for (const [id, v] of states) {
    for (const side of al[id] || []) {
      const cur = out.get(side);
      if (!cur) { out.set(side, { ...v, componentId: side }); continue; }
      const severity = (SEVERITY_RANK[v.severity] || 0) > (SEVERITY_RANK[cur.severity] || 0) ? v.severity : cur.severity, replaced = cur.replaced || v.replaced;
      out.set(side, { ...cur, severity, replaced, items: [...cur.items, ...v.items], state: replaced ? 'reemplazado' : severity || 'none' });
    }
  }
  return out;
}
/* Puntos de las etiquetas numeradas: Map componentId → [[x, y]...] (un componente anterior se numera en cada lado visible) */
function anchorsOf(kind, v, numbers) {
  const al = LEGACY_ALIASES[kind] || {}, out = [];
  for (const [c, n] of numbers) for (const id of al[c] || [c]) { const a = anchorOf(v, id); if (a) out.push([a, n]); }
  return out;
}
/* Punto para la etiqueta numerada de un componente en una vista (centro de su primera figura) */
export function anchorOf(view, componentId) {
  const l = view.layers.find((x) => x.c === componentId);
  if (!l) return null;
  const [x1, y1, x2, y2] = bbox(l.prims[0]);
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

/* Colores de una capa según el estado de su componente */
function paint(layer, state) {
  if (!layer.c) return ST[layer.style] || ST.base;
  if (layer.style === 'line') return { fill: null, stroke: state ? STATE_COLORS[state] : LINE_NONE, sw: 5 };
  return { fill: STATE_COLORS[state || 'none'], stroke: INK, sw: 1.8 };
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/*
 * SVG de una vista. states: Map componentId → { state } (componentStates); numbers: Map componentId → número;
 * names: Map componentId → nombre (accesibilidad). interactive: cada región se puede tocar (data-c).
 */
export function svgMarkup(kind, viewId, { states = new Map(), numbers = new Map(), names = new Map(), selected = '', interactive = false, title = '' } = {}) {
  const v = viewLayers(kind, viewId);
  if (!v) return '';
  const out = [`<svg class="dg-svg" viewBox="0 0 ${v.w} ${v.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title || v.name)}">`];
  states = diagramStates(kind, states);
  const sels = (LEGACY_ALIASES[kind] || {})[selected] || [selected];
  for (const l of v.layers) {
    if (l.style === 'label') { for (const p of l.prims) out.push(`<text x="${p.x}" y="${p.y}" font-size="${p.s}" text-anchor="${p.a}" font-family="Helvetica, Arial, sans-serif"${p.b ? ' font-weight="700"' : ''} fill="${ST.label.fill}">${esc(p.t)}</text>`); continue; }
    const st = l.c ? (states.get(l.c) || {}).state || '' : '';
    const pt = paint(l, st), d = l.prims.map(primD).join(' ');
    const attrs = `fill="${pt.fill || 'none'}" stroke="${pt.stroke}" stroke-width="${pt.sw}"${pt.dash ? ` stroke-dasharray="${pt.dash.join(' ')}"` : ''} stroke-linejoin="round" stroke-linecap="round"`;
    if (!l.c) { out.push(`<path d="${d}" ${attrs} pointer-events="none"/>`); continue; }
    const nm = names.get(l.c) || l.c, sel = sels.includes(l.c), lab = nm;
    if (interactive) {
      out.push(`<g class="dg-c${sel ? ' sel' : ''}${st ? ' on' : ''}" data-c="${esc(l.c)}" tabindex="0" role="button" aria-label="${esc(lab)}"><title>${esc(nm)}</title>`
        + (l.style === 'line' ? `<path d="${d}" fill="none" stroke="transparent" stroke-width="22"/>` : '')
        + `<path class="dg-shape" d="${d}" ${attrs}/></g>`);
    } else out.push(`<path d="${d}" ${attrs}/>`);
  }
  /* Etiquetas numeradas de los componentes intervenidos */
  for (const [a, n] of anchorsOf(kind, v, numbers)) {
    out.push(`<g class="dg-n" pointer-events="none"><path d="${circleD({ cx: a[0], cy: a[1], r: 13 })}" fill="#FFFFFF" stroke="${INK}" stroke-width="2"/><text x="${n2(a[0])}" y="${n2(a[1] + 5)}" font-size="15" font-weight="700" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" fill="${INK}">${n}</text></g>`);
  }
  out.push('</svg>');
  return out.join('');
}

/*
 * Trazos para el modelo de páginas del PDF: la vista se escala para caber en box { x, y, w, h } (puntos, origen arriba).
 * Devuelve { items, w, h } con items { t:'path', d, x, y, scale, fill, stroke, sw, dash } y { t:'text', ... }.
 */
export function pdfItems(kind, viewId, { states = new Map(), numbers = new Map() } = {}, box) {
  const v = viewLayers(kind, viewId);
  if (!v) return { items: [], w: 0, h: 0 };
  const scale = Math.min(box.w / v.w, box.h / v.h), w = v.w * scale, h = v.h * scale;
  const ox = box.x + (box.w - w) / 2, oy = box.y;
  const items = [];
  states = diagramStates(kind, states);
  for (const l of v.layers) {
    if (l.style === 'label') { for (const p of l.prims) items.push({ t: 'text', x: ox + p.x * scale, y: oy + p.y * scale, text: p.t, s: Math.max(5.5, p.s * scale), b: p.b, c: ST.label.fill, a: p.a }); continue; }
    const st = l.c ? (states.get(l.c) || {}).state || '' : '';
    const pt = paint(l, st);
    for (const p of l.prims) items.push({ t: 'path', d: primD(p), x: ox, y: oy, scale, fill: pt.fill || null, stroke: pt.stroke || null, sw: pt.sw, dash: pt.dash || null });
  }
  for (const [a, n] of anchorsOf(kind, v, numbers)) {
    items.push({ t: 'path', d: circleD({ cx: a[0], cy: a[1], r: 13 }), x: ox, y: oy, scale, fill: '#FFFFFF', stroke: INK, sw: 2, dash: null });
    items.push({ t: 'text', x: ox + a[0] * scale, y: oy + (a[1] + 5) * scale, text: String(n), s: Math.max(5.5, 15 * scale), b: true, c: INK, a: 'middle' });
  }
  return { items, w, h };
}

/* ===== Esquema de ejes y llantas (vista superior, frente arriba; la izquierda del equipo a la izquierda) ===== */
export function tireLayers(layoutKey) {
  const l = TIRE_LAYOUTS[layoutKey];
  if (!l) return null;
  const tractor = l.for === 'tractor', ys = [];
  let y = 92;
  l.axles.forEach((a, i) => { if (i > 0) y += tractor && i === 1 ? 150 : 104; ys.push(y); });
  const H = y + 52, W = 360, layers = [], labels = [];
  labels.push(T(180, 24, 'FRENTE', { b: true, s: 14 }), T(16, 24, 'IZQUIERDA', { a: 'start', s: 11 }), T(344, 24, 'DERECHA', { a: 'end', s: 11 }));
  layers.push(L(null, 'metal', R(166, 40, 28, H - 56, 4)));
  l.axles.forEach((a, i) => {
    const yy = ys[i], n = i + 1;
    layers.push(L(null, 'metal', R(64, yy - 5, 232, 10, 4)));
    labels.push(T(16, yy - 42, `EJE ${n}${a.kind === 'dir' ? ' · DIRECCIONAL' : a.kind === 'trac' ? ' · TRACCIÓN' : ''}`, { s: 11.5, b: true, a: 'start' }));
    const rects = a.dual
      ? [[`E${n}-IE`, 18], [`E${n}-II`, 50], [`E${n}-DI`, 282], [`E${n}-DE`, 314]]
      : [[`E${n}-I`, 34], [`E${n}-D`, 296]];
    for (const [id, x] of rects) layers.push(L(id, 'part', R(x, yy - 32, 28, 64, 7)));
  });
  layers.push(L(null, 'label', ...labels));
  return { w: W, h: H, layers };
}
export function tireSvg(layoutKey, { replaced = new Set(), interactive = false, labels = new Map() } = {}) {
  const v = tireLayers(layoutKey);
  if (!v) return '';
  const out = [`<svg class="tr-svg" viewBox="0 0 ${v.w} ${v.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Posiciones de llantas">`];
  for (const l of v.layers) {
    if (l.style === 'label') { for (const p of l.prims) out.push(`<text x="${p.x}" y="${p.y}" font-size="${p.s}" text-anchor="${p.a}" font-family="Helvetica, Arial, sans-serif"${p.b ? ' font-weight="700"' : ''} fill="${ST.label.fill}">${esc(p.t)}</text>`); continue; }
    const d = l.prims.map(primD).join(' ');
    if (!l.c) { out.push(`<path d="${d}" fill="${ST[l.style].fill}" stroke="${ST[l.style].stroke}" stroke-width="${ST[l.style].sw}" pointer-events="none"/>`); continue; }
    const on = replaced.has(l.c), fill = on ? STATE_COLORS.reemplazado : STATE_COLORS.none;
    const shape = `<path class="tr-shape" d="${d}" fill="${fill}" stroke="${INK}" stroke-width="1.8"/>`;
    out.push(interactive ? `<g class="tr-p${on ? ' on' : ''}" data-pos="${esc(l.c)}" tabindex="0" role="checkbox" aria-checked="${on}" aria-label="${esc(labels.get(l.c) || l.c)}">${shape}</g>` : shape);
  }
  out.push('</svg>');
  return out.join('');
}
export function tirePdfItems(layoutKey, replaced, box) {
  const v = tireLayers(layoutKey);
  if (!v) return { items: [], w: 0, h: 0 };
  const scale = Math.min(box.w / v.w, box.h / v.h), w = v.w * scale, h = v.h * scale, ox = box.x + (box.w - w) / 2, oy = box.y, items = [];
  for (const l of v.layers) {
    if (l.style === 'label') { for (const p of l.prims) items.push({ t: 'text', x: ox + p.x * scale, y: oy + p.y * scale, text: p.t, s: Math.max(5, p.s * scale), b: p.b, c: ST.label.fill, a: p.a }); continue; }
    const fill = l.c ? (replaced.has(l.c) ? STATE_COLORS.reemplazado : STATE_COLORS.none) : ST[l.style].fill;
    for (const p of l.prims) items.push({ t: 'path', d: primD(p), x: ox, y: oy, scale, fill, stroke: l.c ? INK : ST[l.style].stroke, sw: 1.8, dash: null });
  }
  return { items, w, h };
}
export { positionsOf };
