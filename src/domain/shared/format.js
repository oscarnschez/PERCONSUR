/*
 * Formatos, normalizaciones y validaciones operativas.
 * Cada función conserva exactamente el comportamiento del HTML original (NER 3.0);
 * el nombre original se indica entre corchetes cuando cambió.
 */
import { NAVIERAS, EDOS } from '../../config/reference.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const p2 = (n) => String(n).padStart(2, '0');

export function nowParts() {
  const d = new Date();
  return { fecha: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, hora: `${p2(d.getHours())}:${p2(d.getMinutes())}` };
}

/* AAAA-MM-DD → DD/MM/AAAA */
export function fmtFecha(f) {
  if (!f) return '';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

/* Marca de tiempo de fotografía: DD/MM/AAAA HH:MM */
export function fmtStamp(t) {
  if (!t) return '';
  const d = new Date(t);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/* Nombres propios: "JUAN DE LA CRUZ" → "Juan de la Cruz" */
export function nameCase(t) {
  const low = ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'van', 'von'];
  return String(t || '').trim().replace(/\s+/g, ' ').toLowerCase().split(' ')
    .map((w, i) => (i && low.includes(w) ? w : w.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-')))
    .join(' ');
}

export function titleCase(t) {
  const low = ['de', 'del', 'la', 'las', 'los', 'y', 'el'];
  return t.toLowerCase().split(' ').map((w, i) => (i && low.includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

/* Número desde texto con comas ("12,500.5") */
export function kg(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : null;
}
export function fmtKg(n) {
  return n == null ? '' : n.toLocaleString('es-MX', { maximumFractionDigits: 2 }) + ' kg';
}
export function money(n) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
}

/* Pedimento: 15 dígitos agrupados 2-2-4-7 ("26 16 1641 6005426") */
export function fmtPedimento(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 15);
  const p = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8), d.slice(8, 15)].filter(Boolean);
  return p.join(' ');
}

/* Número económico: solo dígitos, sin ceros a la izquierda */
export function normEco(v) {
  return String(v || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}
/* Etiqueta de unidad en documentos: 21 → U21, 4 → U04 */
export function ecoLabel(eco) {
  return eco ? 'U' + String(eco).padStart(2, '0') : '';
}

/* Teléfono MX a 10 dígitos: (33) 1234 5678 o (312) 123 4567 */
export function fmtTel(v) {
  const d = String(v || '').replace(/\D/g, '').replace(/^52(?=\d{10}$)/, '');
  if (d.length !== 10) return String(v || '').trim();
  return /^(55|56|33|81)/.test(d) ? d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2 $3') : d.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2 $3');
}
/* Caracteres permitidos mientras se escribe un teléfono */
export const telClean = (v) => String(v || '').replace(/[^\d+\s()-]/g, '');

/* RFC: mayúsculas, A-Z Ñ & 0-9, máximo 13 */
export function rfcClean(v) {
  return String(v || '').toUpperCase().replace(/[^A-ZÑ&0-9]/g, '').slice(0, 13);
}
export function rfcHint(v) {
  if (!v) return null;
  return v.length === 12 || v.length === 13 ? null : 'El RFC debe tener 12 (moral) o 13 (física) caracteres.';
}

/* Número de contenedor: solo A-Z y 0-9 */
export const contNumClean = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/* Números decimales mientras se escribe (pesos, tarifas) */
export const decClean = (v) => String(v || '').replace(/[^\d.,]/g, '');

/* ===== Dígito verificador ISO 6346 ===== */
const LV = {};
(() => { let v = 10; for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') { if (v % 11 === 0) v++; LV[ch] = v; v++; } })();

export function isoCheck(n) {
  if (!n) return { state: 'empty' };
  if (!/^[A-Z]{4}\d{7}$/.test(n)) return { state: 'format' };
  let sum = 0;
  for (let i = 0; i < 10; i++) { const c = n[i]; sum += (/\d/.test(c) ? +c : LV[c]) * Math.pow(2, i); }
  const d = (sum % 11) % 10;
  return { state: d === +n[10] ? 'ok' : 'bad', d };
}
export function chkMsg(n) {
  const r = isoCheck(n);
  if (r.state === 'empty') return ['', ''];
  if (r.state === 'format') return ['warn', 'Formato esperado: 4 letras y 7 números (ej. MSCU1234565).'];
  if (r.state === 'ok') return ['ok', 'Número válido: el dígito verificador coincide.'];
  return ['warn', `El dígito verificador no coincide (debería terminar en ${r.d}). Revisa el número.`];
}

/* ===== Línea naviera por prefijo de BL ===== */
const NAV_MAP = {};
NAVIERAS.forEach(([ps, n]) => ps.forEach((p) => { NAV_MAP[p] = n; }));
export function naviera(bl) {
  const t = String(bl || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.length < 4) return '';
  return NAV_MAP[t.slice(0, 4)] || '';
}

/* ===== Municipio y estado de destino a partir de la dirección ("Zapopan, JAL") ===== */
const ABRV = new Set(EDOS.map((e) => e[1]).concat(['JAL', 'COL', 'NAY', 'MICH', 'GTO', 'QRO', 'SLP', 'AGS', 'ZAC']));
const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
function edoOf(tok) {
  const n = norm(tok);
  for (const [name, ab] of EDOS) {
    if (n === name) return { ab, rest: '' };
    if (n.endsWith(' ' + name)) return { ab, rest: tok.trim().slice(0, tok.trim().length - name.length).trim() };
  }
  const up = tok.replace(/\./g, '').trim().toUpperCase();
  if (ABRV.has(up)) return { ab: up, rest: '' };
  const m = up.match(/^(.*)\s([A-Z]{2,5})$/);
  if (m && ABRV.has(m[2])) return { ab: m[2], rest: tok.trim().slice(0, m[1].length).trim() };
  return null;
}
export function destinoMunicipio(addr) {
  if (!addr) return '';
  let toks = addr.replace(/\n/g, ',').split(',')
    .map((t) => t.replace(/\b(c\.?\s?p\.?|codigo postal|código postal)\s*:?\s*\d{5}\b/ig, '').replace(/\b\d{5}\b/g, '').trim())
    .filter(Boolean);
  toks = toks.filter((t) => !/^(m[eé]xico|mx|mex\.?)$/i.test(t) || toks.length < 2);
  for (let i = toks.length - 1; i >= 0; i--) {
    const e = edoOf(toks[i]);
    if (e) {
      const mun = e.rest || (i > 0 ? toks[i - 1] : '');
      return mun ? `${titleCase(mun.replace(/^(municipio de|mpio\.? de)\s+/i, ''))}, ${e.ab}` : e.ab;
    }
  }
  return titleCase(toks[toks.length - 1] || '');
}

/* ===== URLs ===== */
/* Link de Google Maps (o cualquier URL con dominio). Agrega https:// si falta. */
export function mapsURL(v) {
  let u = String(v || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); return /\./.test(x.hostname) ? x.href : ''; } catch (e) { return ''; }
}
/* ¿Parece un link de Google Maps? (solo para avisos; no bloquea) */
export function isGoogleMaps(u) {
  try { const h = new URL(u).hostname; return /(^|\.)google\.[a-z.]+$/.test(h) || /(^|\.)goo\.gl$/.test(h) || /maps\.app\.goo\.gl$/.test(h); } catch (e) { return false; }
}
/* URL de búsqueda en Google Maps para una dirección escrita (QR de "Ubicación de entrega") */
export function mapsSearchURL(addr) {
  const a = (addr || '').replace(/\s+/g, ' ').trim();
  return a ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a) : '';
}

/* Link de rastreo GPS: vacío si solo es "tinyurl.com/" */
export function trackURL(track) {
  let u = (track || '').trim();
  if (!u || /^(https?:\/\/)?(www\.)?tinyurl\.com\/?$/i.test(u)) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { return new URL(u).href; } catch (e) { return ''; }
}

/* ===== Código para Excel (Scan-IT to Office) ===== */
/* Sin acentos ni ñ: Scan-IT to Office descarta los campos con esos caracteres y recorre las columnas */
export function xlAscii(t) {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ñ]/g, 'n').replace(/[Ñ]/g, 'N').replace(/[^\x20-\x7E]/g, '');
}
/* Celda vacía = un espacio, para que el escáner no junte tabuladores seguidos y se recorran las columnas */
export function xlCell(v) {
  const t = xlAscii(String(v ?? '').replace(/[\t\r\n]+/g, ' ')).trim();
  return t === '' ? ' ' : t;
}

export function fmtSize(n) {
  return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
}

/* Fechas relativas para listas */
export function relDay(ts) {
  const d = new Date(ts), now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  if (diff === 0) return `Hoy ${hm}`;
  if (diff === 1) return `Ayer ${hm}`;
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function agoText(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return relDay(ts);
}
