/*
 * PERCONSUR · Intermediario GPS (Cloudflare Worker) para la Open API de IOPGPS (Wanway).
 *
 * Por qué existe: la API de IOPGPS exige firmar con un secreto que no puede ir en el navegador, y no permite
 * llamadas directas desde otro sitio web. Este Worker guarda las credenciales como secretos de Cloudflare,
 * renueva el permiso (accessToken, 2 h), consulta las posiciones de toda la flota en una sola llamada,
 * guarda el resultado unos segundos y entrega a PERCONSUR solo lo necesario.
 *
 * Secretos / variables (Cloudflare → Worker → Settings → Variables and Secrets):
 *   IOP_APPID       Secret  appid de la Open API (p. ej. LOG_PERCONSUR)
 *   IOP_SECRET      Secret  clave de la Open API (32 caracteres)
 *   PCS_KEY         Secret  clave propia que usa la app PERCONSUR para consultar este Worker
 *   ALLOWED_ORIGIN  Texto   sitio autorizado, p. ej. https://oscarnschez.github.io (varios separados por coma)
 *   IOP_BASE        Texto   opcional; por defecto https://open.iopgps.com
 *
 * Endpoints:
 *   GET /salud                 ¿se pudo autenticar con IOPGPS? (sin credenciales ni ubicaciones; con ?key= añade nombres de campos)
 *   GET /v1/posiciones         posiciones de la flota (header X-PCS-Key o ?key=). Opcional: ?imeis=865…,867…
 *   GET /v1/ubicacion?imei=…   posición de una unidad con dirección y estado (header X-PCS-Key o ?key=)
 *
 * API de IOPGPS utilizada (documentación pública de terceros; confirmar con el proveedor):
 *   POST /api/auth  { appid, time, signature = md5(md5(secreto) + time) } → { accessToken, expiresIn }
 *   Header accessToken en las demás llamadas.
 *   GET /api/device/locations/search-by-organization?isTakeSub=1   → [{ imei, lat, lng, speed, gpsTime, … }]
 *   GET /api/device/location?imei=…                                 → { lat, lng, address, gpsTime, … }
 *   GET /api/device/status?imei=…                                   → { signalTime, gpsTime, accStatus, speed, … }
 * La respuesta se normaliza con tolerancia (lat/latitude, lng/lon/longitude, tiempos en segundos, ms o texto).
 */

const FLEET_TTL = 30 * 1000;      /* posiciones de la flota: una llamada al proveedor cada 30 s como máximo */
const DETAIL_TTL = 120 * 1000;    /* dirección/estado por unidad: cada 2 min como máximo */
const TOKEN_MARGIN = 5 * 60 * 1000;

/* ===== Estado por instancia (Cloudflare reutiliza la instancia entre peticiones) ===== */
let token = null, tokenExp = 0, tokenPending = null;
const cache = new Map();   /* clave → { at, value } */
const inflight = new Map();

/* ===== MD5 (implementación propia: no depende de extensiones de Web Crypto) ===== */
export function md5(str) {
  const bytes = new TextEncoder().encode(str);
  const n = (((bytes.length + 8) >>> 6) + 1) * 16, w = new Uint32Array(n);
  for (let i = 0; i < bytes.length; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
  w[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
  w[n - 2] = bytes.length * 8;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let o = 0; o < n; o += 16) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const s = S[(i >> 4) * 4 + (i % 4)];
      F = (F + A + K[i] + w[o + g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  return [a0, b0, c0, d0].map((v) => [0, 8, 16, 24].map((sh) => ((v >>> sh) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
}

/* ===== Utilidades ===== */
const base = (env) => String(env.IOP_BASE || 'https://open.iopgps.com').replace(/\/+$/, '');
const origins = (env) => String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);

function corsHeaders(req, env) {
  const o = req.headers.get('Origin'), allow = origins(env);
  const h = { 'Vary': 'Origin' };
  if (o && allow.includes(o)) {
    h['Access-Control-Allow-Origin'] = o;
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'X-PCS-Key';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}
function json(req, env, status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(req, env) } });
}
/* Comparación en tiempo constante de la clave de la app */
function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
const appKey = (req, url) => req.headers.get('X-PCS-Key') || url.searchParams.get('key') || '';

/* Tiempo → milisegundos (acepta segundos, milisegundos o texto «2026-10-08 03:13:00») */
export function toMs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) { const n = Number(v); return n < 1e12 ? Math.round(n * 1000) : Math.round(n); }
  const t = Date.parse(String(v).replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
}
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };   /* sin dato → null (nunca 0 inventado) */
const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] != null && o[k] !== '') return o[k]; return null; };
const listOf = (r) => (Array.isArray(r) ? r : Array.isArray(r && r.data) ? r.data : Array.isArray(r && r.data && r.data.list) ? r.data.list : Array.isArray(r && r.list) ? r.list : []);
const objOf = (r) => (r && r.data && !Array.isArray(r.data) && typeof r.data === 'object' ? r.data : Array.isArray(r && r.data) ? r.data[0] || {} : r || {});

/* Normaliza un registro del proveedor al formato de PERCONSUR */
export function normalize(d) {
  const lat = num(pick(d, 'lat', 'latitude', 'gpsLat')), lng = num(pick(d, 'lng', 'lon', 'longitude', 'gpsLng'));
  const acc = pick(d, 'accStatus', 'acc');
  return {
    imei: String(pick(d, 'imei', 'deviceImei') || ''),
    name: pick(d, 'deviceName', 'name') || '',
    lat: lat != null && Math.abs(lat) <= 90 ? lat : null,
    lng: lng != null && Math.abs(lng) <= 180 ? lng : null,
    gpsTime: toMs(pick(d, 'gpsTime', 'gpsTimeStamp', 'positionTime')),
    signalTime: toMs(pick(d, 'signalTime', 'heartTime', 'lastSignalTime')),
    speed: num(pick(d, 'speed')),
    course: num(pick(d, 'course', 'direction')),
    acc: acc == null ? null : String(acc) === '1' || acc === true || String(acc).toLowerCase() === 'on',
    positionType: pick(d, 'positionType', 'posType') || null,
    address: pick(d, 'address', 'addr') || null,
  };
}

/* ===== IOPGPS ===== */
class UpstreamError extends Error {
  constructor(message, { status = 502, tokenProblem = false } = {}) { super(message); this.status = status; this.tokenProblem = tokenProblem; }
}
const isOkCode = (r) => r && (r.code === undefined || r.code === 0 || r.code === '0' || r.code === 200 || r.code === '200');

async function auth(env) {
  if (!env.IOP_APPID || !env.IOP_SECRET) throw new UpstreamError('Faltan los secretos IOP_APPID / IOP_SECRET en el Worker.', { status: 500 });
  const time = Math.floor(Date.now() / 1000);
  const signature = md5(md5(env.IOP_SECRET) + time);
  const res = await fetch(base(env) + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appid: env.IOP_APPID, time, signature }) });
  let body = null; try { body = await res.json(); } catch (e) { /* respuesta no JSON */ }
  const tk = body && (body.accessToken || (body.data && body.data.accessToken));
  if (!res.ok || !tk || !isOkCode(body)) throw new UpstreamError(`IOPGPS rechazó la autenticación${body && (body.msg || body.message) ? ': ' + (body.msg || body.message) : ` (HTTP ${res.status})`}`);
  const exp = Number(body.expiresIn || (body.data && body.data.expiresIn) || 7200);
  token = tk;
  tokenExp = Date.now() + (exp < 1e6 ? exp * 1000 : exp);   /* expiresIn en segundos (o ms) */
  return token;
}
async function ensureToken(env) {
  if (token && Date.now() < tokenExp - TOKEN_MARGIN) return token;
  if (!tokenPending) tokenPending = auth(env).finally(() => { tokenPending = null; });
  return tokenPending;
}
async function iop(env, path, retried = false) {
  const tk = await ensureToken(env);
  const res = await fetch(base(env) + path, { headers: { accessToken: tk, Accept: 'application/json' } });
  let body = null; try { body = await res.json(); } catch (e) { /* */ }
  const msg = body && (body.msg || body.message) ? String(body.msg || body.message) : '';
  const tokenProblem = res.status === 401 || (body && String(body.code) === '401') || /token/i.test(msg);
  if (tokenProblem && !retried) { token = null; tokenExp = 0; return iop(env, path, true); }
  if (!res.ok || !isOkCode(body)) throw new UpstreamError(`IOPGPS respondió con error${msg ? ': ' + msg : ` (HTTP ${res.status})`}`, { tokenProblem });
  return body;
}
/* Caché con «una sola petición en vuelo» para no repetir llamadas simultáneas al proveedor */
async function cached(key, ttl, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ttl) return { value: c.value, at: c.at, cached: true };
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => { const value = await fn(); const at = Date.now(); cache.set(key, { at, value }); return { value, at, cached: false }; })()
    .catch((e) => { if (c) return { value: c.value, at: c.at, cached: true, stale: true, error: e.message }; throw e; })   /* si falla, entrega lo último conocido marcado como antiguo */
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
const fleet = (env) => cached('fleet', FLEET_TTL, async () => listOf(await iop(env, '/api/device/locations/search-by-organization?isTakeSub=1')).map(normalize).filter((d) => d.imei));

async function detail(env, imei) {
  return cached('d:' + imei, DETAIL_TTL, async () => {
    const q = encodeURIComponent(imei);
    const [loc, st] = await Promise.allSettled([iop(env, `/api/device/location?imei=${q}`), iop(env, `/api/device/status?imei=${q}`)]);
    if (loc.status === 'rejected' && st.status === 'rejected') throw loc.reason;
    const a = loc.status === 'fulfilled' ? normalize({ imei, ...objOf(loc.value) }) : {};
    const b = st.status === 'fulfilled' ? normalize({ imei, ...objOf(st.value) }) : {};
    const out = { ...b };
    for (const [k, v] of Object.entries(a)) if (v != null && v !== '') out[k] = v;
    out.imei = imei;
    return out;
  });
}

/* ===== Router ===== */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    if (req.method !== 'GET') return json(req, env, 405, { ok: false, error: 'Método no permitido' });
    const o = req.headers.get('Origin');
    if (o && !origins(env).includes(o)) return json(req, env, 403, { ok: false, error: 'Origen no autorizado' });
    const authorized = sameKey(appKey(req, url), env.PCS_KEY);
    try {
      if (url.pathname === '/' || url.pathname === '/salud') {
        const out = { ok: false, servicio: 'PERCONSUR GPS', proveedor: 'IOPGPS', secretos: { IOP_APPID: !!env.IOP_APPID, IOP_SECRET: !!env.IOP_SECRET, PCS_KEY: !!env.PCS_KEY, ALLOWED_ORIGIN: origins(env).length > 0 } };
        try {
          await ensureToken(env); out.autenticacion = 'correcta';
          const f = await fleet(env); out.ok = true; out.dispositivos = f.value.length; out.conCoordenadas = f.value.filter((d) => d.lat != null && d.lng != null).length;
          if (authorized) {
            const raw = listOf(await iop(env, '/api/device/locations/search-by-organization?isTakeSub=1'));
            out.camposDelProveedor = raw[0] ? Object.keys(raw[0]) : [];
          }
        } catch (e) { out.autenticacion = out.autenticacion || 'fallida'; out.error = e.message; }
        return json(req, env, out.ok ? 200 : 502, out);
      }
      if (!authorized) return json(req, env, 401, { ok: false, error: 'Clave de PERCONSUR inválida o ausente' });
      if (url.pathname === '/v1/posiciones') {
        const want = new Set((url.searchParams.get('imeis') || '').split(',').map((s) => s.trim()).filter(Boolean));
        const f = await fleet(env);
        const devices = want.size ? f.value.filter((d) => want.has(d.imei)) : f.value;
        return json(req, env, 200, { ok: true, fetchedAt: f.at, stale: !!f.stale, ...(f.error ? { warning: f.error } : {}), devices });
      }
      if (url.pathname === '/v1/ubicacion') {
        const imei = (url.searchParams.get('imei') || '').trim();
        if (!/^\d{8,20}$/.test(imei)) return json(req, env, 400, { ok: false, error: 'IMEI inválido' });
        const d = await detail(env, imei);
        return json(req, env, 200, { ok: true, fetchedAt: d.at, stale: !!d.stale, ...(d.error ? { warning: d.error } : {}), device: d.value });
      }
      return json(req, env, 404, { ok: false, error: 'Ruta no encontrada' });
    } catch (e) {
      return json(req, env, e.status || 502, { ok: false, error: e.message || 'Error al consultar IOPGPS' });
    }
  },
};

/* Solo para pruebas locales: reinicia el estado en memoria */
export function __reset() { token = null; tokenExp = 0; tokenPending = null; cache.clear(); inflight.clear(); }
