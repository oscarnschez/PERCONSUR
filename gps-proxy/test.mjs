/*
 * Prueba local del Worker contra un servidor que imita la Open API de IOPGPS (no usa credenciales reales).
 * Uso: node gps-proxy/test.mjs
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import worker, { md5, toMs, normalize, __reset, LIMITS } from './worker.js';

const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1; };
const nodeMd5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');

/* MD5 propio = MD5 de Node */
for (const s of ['', 'a', 'abc', 'secreto-de-prueba-32-caracteres!', 'ñandú ü 漢字', 'x'.repeat(1000)]) ok(md5(s) === nodeMd5(s), `md5(${JSON.stringify(s.slice(0, 20))})`);
ok(toMs(1759900380) === 1759900380000 && toMs(1759900380000) === 1759900380000 && toMs('1759900380') === 1759900380000, 'tiempos en segundos o milisegundos');
ok(normalize({ imei: 865190071363660, latitude: '19.010070', longitude: '-103.832489', accStatus: 1 }).lat === 19.01007, 'normaliza latitude/longitude y acc');
ok(normalize({ lat: 200, lng: 10 }).lat === null, 'descarta coordenadas fuera de rango');
ok(normalize({ imei: '1', lat: 1, lng: 1 }).course === null && normalize({ imei: '1' }).speed === null, 'campos que el proveedor no entrega quedan en null (no se inventa 0)');

/* ===== IOPGPS simulado ===== */
const APPID = 'APP_PRUEBA', SECRET = 'secreto-de-prueba-0123456789abcdef';
const stats = { auth: 0, fleet: 0, location: 0, status: 0, all: 0 };
let tokens = new Set(), failNextWithToken = false, down = false;
const srv = http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const u = new URL(req.url, 'http://x');
  stats.all++;
  if (down) return send(503, { code: 503, msg: 'mantenimiento' });
  if (req.method === 'POST' && u.pathname === '/api/auth') {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      stats.auth++;
      const { appid, time, signature } = JSON.parse(b);
      const good = appid === APPID && signature === nodeMd5(nodeMd5(SECRET) + time) && Math.abs(Date.now() / 1000 - time) < 300;
      if (!good) return send(200, { code: 1001, msg: 'signature error' });
      const t = 'tk' + Math.random().toString(36).slice(2); tokens.add(t);
      send(200, { code: 0, accessToken: t, expiresIn: 7200 });
    });
    return;
  }
  const t = req.headers.accesstoken;
  if (!tokens.has(t)) return send(200, { code: 401, msg: 'accessToken invalid' });
  if (failNextWithToken) { failNextWithToken = false; tokens.delete(t); return send(200, { code: 401, msg: 'accessToken expired' }); }
  if (u.pathname === '/api/device/locations/search-by-organization') {
    stats.fleet++;
    return send(200, { code: 0, data: [
      { imei: '865190071363660', deviceName: 'U12 60-BN-4J', lat: '19.010070', lng: '-103.832489', speed: 0, gpsTime: 1759900380, accStatus: 1 },
      { imei: '865190071300000', deviceName: 'U21', lat: 20.66, lng: -103.35, speed: 82.5, gpsTime: 1759900500, accStatus: 0 },
    ] });
  }
  if (u.pathname === '/api/device/location') { stats.location++; return send(200, { code: 0, data: { lat: 19.01007, lng: -103.832489, address: 'Autopista Colima - Manzanillo, Tecolapa, Tecomán, Colima, México', gpsTime: 1759900380 } }); }
  if (u.pathname === '/api/device/status') { stats.status++; return send(200, { code: 0, data: [{ imei: u.searchParams.get('imei'), signalTime: 1759900560, gpsTime: 1759900380, accStatus: 1, speed: 0 }] }); }
  send(404, { code: 404, msg: 'not found' });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const ORIGIN = 'https://oscarnschez.github.io';
const env = { IOP_APPID: APPID, IOP_SECRET: SECRET, PCS_KEY: 'clave-app-PERCONSUR-123', ALLOWED_ORIGIN: ORIGIN, IOP_BASE: BASE };
const call = async (path, { e = env, origin = ORIGIN, key = env.PCS_KEY, method = 'GET', ip = '' } = {}) => {
  const h = {}; if (origin) h.Origin = origin; if (key) h['X-PCS-Key'] = key; if (ip) h['CF-Connecting-IP'] = ip;
  const r = await worker.fetch(new Request('https://perconsur-gps.ejemplo.workers.dev' + path, { method, headers: h }), e);
  let body = null; try { body = await r.clone().json(); } catch (x) { /* */ }
  return { status: r.status, body, headers: r.headers };
};

try {
  /* Salud sin secretos */
  __reset();
  let r = await call('/salud', { e: { ALLOWED_ORIGIN: ORIGIN, IOP_BASE: BASE }, origin: null, key: null });
  ok(r.status === 502 && r.body.secretos.IOP_SECRET === false && /Faltan los secretos/.test(r.body.error), 'salud: avisa si faltan los secretos');
  /* Firma incorrecta */
  __reset();
  r = await call('/salud', { e: { ...env, IOP_SECRET: 'otro' }, origin: null, key: null });
  ok(r.status === 502 && /signature error/.test(r.body.error), 'salud: autenticación rechazada con firma incorrecta');
  /* Salud correcta: sin clave no muestra nombres de campos; con clave sí */
  __reset();
  r = await call('/salud', { origin: null, key: null });
  ok(r.status === 200 && r.body.autenticacion === 'correcta' && r.body.dispositivos === 2 && !r.body.camposDelProveedor, 'salud: autenticación correcta y 2 dispositivos (sin exponer datos)');
  ok(!JSON.stringify(r.body).includes(SECRET) && !JSON.stringify(r.body).includes('865190071363660'), 'salud: no muestra secretos ni IMEI');
  r = await call('/salud?key=' + env.PCS_KEY, { origin: null, key: null });
  ok(Array.isArray(r.body.camposDelProveedor) && r.body.camposDelProveedor.includes('gpsTime'), 'salud con clave: nombres de los campos del proveedor');
  /* Autorización y CORS */
  r = await call('/v1/posiciones', { key: 'mala' }); ok(r.status === 401, 'posiciones: clave inválida → 401');
  r = await call('/v1/posiciones', { origin: 'https://otro-sitio.com' }); ok(r.status === 403, 'posiciones: origen no autorizado → 403');
  r = await call('/v1/posiciones', { method: 'OPTIONS', key: null }); ok(r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === ORIGIN && /X-PCS-Key/.test(r.headers.get('Access-Control-Allow-Headers')), 'preflight CORS para el sitio autorizado');
  /* Posiciones normalizadas y caché */
  __reset(); stats.fleet = 0; stats.auth = 0;
  r = await call('/v1/posiciones');
  const u12 = r.body.devices.find((d) => d.imei === '865190071363660');
  ok(r.status === 200 && r.headers.get('Access-Control-Allow-Origin') === ORIGIN && u12 && u12.lat === 19.01007 && u12.lng === -103.832489 && u12.gpsTime === 1759900380000 && u12.acc === true, 'posiciones: U12 con lat, lng, hora GPS (ms) y encendido');
  await Promise.all([call('/v1/posiciones'), call('/v1/posiciones'), call('/v1/posiciones?imeis=865190071300000')]);
  ok(stats.fleet === 1 && stats.auth === 1, `caché 30 s: 4 consultas de la app → ${stats.fleet} llamada al proveedor y ${stats.auth} autenticación`);
  r = await call('/v1/posiciones?imeis=865190071300000'); ok(r.body.devices.length === 1 && r.body.devices[0].speed === 82.5, 'filtro por IMEI');
  /* Token vencido: reautentica y reintenta una vez */
  __reset(); await call('/v1/posiciones'); __reset();   /* fuerza nueva consulta */
  stats.auth = 0; failNextWithToken = true;
  r = await call('/v1/posiciones');
  ok(r.status === 200 && r.body.devices.length === 2 && stats.auth === 2, 'token vencido: se renueva y se reintenta');
  /* Ubicación con dirección y estado */
  r = await call('/v1/ubicacion?imei=865190071363660');
  ok(r.status === 200 && /Autopista Colima/.test(r.body.device.address) && r.body.device.signalTime === 1759900560000 && r.body.device.lat === 19.01007, 'ubicación: dirección, señal y coordenadas');
  r = await call('/v1/ubicacion?imei=abc'); ok(r.status === 400, 'ubicación: IMEI inválido → 400');
  /* Proveedor caído: entrega lo último conocido marcado como antiguo */
  cacheExpire();
  down = true; r = await call('/v1/posiciones'); down = false;
  ok(r.status === 200 && r.body.stale === true && r.body.devices.length === 2 && /mantenimiento|error/i.test(r.body.warning || ''), 'proveedor caído: última posición conocida marcada como antigua');
  __reset(); down = true; r = await call('/v1/posiciones'); down = false;
  ok(r.status === 502 && r.body.ok === false, 'proveedor caído sin datos previos: error claro (502)');
  r = await call('/nada'); ok(r.status === 404, 'ruta desconocida → 404');

  /* IOPGPS caído: /salud (sin clave) no repite llamadas al proveedor durante 30 s, aunque lleguen muchas peticiones */
  __reset(); stats.all = 0; down = true;
  for (let i = 0; i < 6; i++) await call('/salud', { origin: null, key: null, ip: `203.0.113.${50 + i}` });
  ok(stats.all === 1, `proveedor caído: 6 consultas anónimas a /salud → ${stats.all} llamada a IOPGPS (espera de 30 s)`);
  r = await call('/v1/posiciones'); ok(r.status === 502 && stats.all === 1, 'durante la espera la app recibe el error sin nuevas llamadas al proveedor');
  { const realNow = Date.now; Date.now = () => realNow() + 31 * 1000; down = false; r = await call('/v1/posiciones'); Date.now = realNow; ok(r.status === 200 && stats.all >= 2, 'pasados 30 s se vuelve a consultar y se recupera'); }
  down = false;

  /* ===== Límite de intentos (rate limit) ===== */
  __reset(); await call('/v1/posiciones');   /* caché llena: las pruebas siguientes no dependen del proveedor */
  const realNow = Date.now; let shift = 0; Date.now = () => realNow() + shift;
  try {
    const A = '203.0.113.10', B = '198.51.100.7';
    let codes = [];
    for (let i = 0; i < 4; i++) codes.push((await call('/v1/posiciones', { key: 'adivina' + i, ip: A })).status);
    r = await call('/v1/posiciones', { key: 'adivina-5', ip: A });
    ok(codes.every((c) => c === 401) && r.status === 429 && +r.headers.get('Retry-After') === 900 && /Intenta de nuevo en 15 min/.test(r.body.error), `5 claves incorrectas desde una IP → bloqueo 15 min (429, Retry-After 900): ${codes.join(',')},${r.status}`);
    ok(r.headers.get('Access-Control-Allow-Origin') === ORIGIN && /Retry-After/.test(r.headers.get('Access-Control-Expose-Headers') || ''), 'el 429 llega a la app (CORS y Retry-After visibles)');
    r = await call('/v1/posiciones', { ip: A });
    ok(r.status === 429, 'IP bloqueada: tampoco se revisa la clave correcta (no se puede seguir adivinando)');
    r = await call('/salud?key=otra', { origin: null, key: null, ip: A }); ok(r.status === 429, 'IP bloqueada: /salud con clave también');
    r = await call('/v1/posiciones', { ip: B }); ok(r.status === 200, 'otra IP con la clave correcta sigue funcionando');
    shift += 15 * 60 * 1000 + 1000;
    r = await call('/v1/posiciones', { ip: A }); ok(r.status === 200, 'al terminar el bloqueo, la clave correcta funciona');
    for (let i = 0; i < 3; i++) await call('/v1/posiciones', { key: 'x' + i, ip: B });
    await call('/v1/posiciones', { ip: B });
    codes = []; for (let i = 0; i < 4; i++) codes.push((await call('/v1/posiciones', { key: 'y' + i, ip: B })).status);
    ok(codes.every((c) => c === 401), 'una clave correcta reinicia la cuenta de fallos de esa IP');
    __reset(); await call('/v1/posiciones');
    for (let i = 0; i < 5; i++) await call('/v1/posiciones', { key: 'z' + i, ip: A });
    shift += 15 * 60 * 1000 + 1000;
    for (let i = 0; i < 4; i++) await call('/v1/posiciones', { key: 'w' + i, ip: A });
    r = await call('/v1/posiciones', { key: 'w5', ip: A });
    ok(r.status === 429 && +r.headers.get('Retry-After') === 1800, 'si reincide, el bloqueo se duplica (30 min)');
    /* Muchas IP distintas (ataque repartido): después de 30 fallos, 1 fallo basta para bloquear */
    __reset(); await call('/v1/posiciones');
    for (let i = 0; i < 31; i++) await call('/v1/posiciones', { key: 'k' + i, ip: `192.0.2.${i}` });
    r = await call('/v1/posiciones', { key: 'nueva', ip: '192.0.2.200' });
    ok(r.status === 429, 'ataque desde muchas IP: con más de 30 fallos, el primer fallo de una IP la bloquea');
    r = await call('/v1/posiciones', { ip: '192.0.2.201' }); ok(r.status === 200, 'una IP sin fallos con la clave correcta no se afecta');
    /* Peticiones por minuto */
    __reset(); await call('/v1/posiciones', { ip: B });
    codes = []; for (let i = 0; i < LIMITS.REQ_MAX; i++) codes.push((await call('/v1/posiciones', { ip: B })).status);
    ok(codes.filter((c) => c === 429).length === 1 && codes[codes.length - 1] === 429, `más de ${LIMITS.REQ_MAX} consultas por minuto desde una IP → 429`);
    shift += 61 * 1000; r = await call('/v1/posiciones', { ip: B }); ok(r.status === 200, 'al minuto siguiente vuelve a responder');
    /* Clave sin configurar en el Worker: no bloquea a nadie por error */
    __reset();
    codes = []; for (let i = 0; i < 6; i++) codes.push((await call('/v1/posiciones', { e: { ...env, PCS_KEY: '' }, key: 'algo', ip: A })).status);
    ok(codes.every((c) => c === 401), 'sin PCS_KEY configurada no se cuentan fallos (no se bloquea al propio usuario)');
    /* Con el espacio KV opcional (LIMITS) el bloqueo se comparte entre instancias */
    const store = new Map(), puts = [];
    const kv = { async get(k, t) { const v = store.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v, o) { puts.push(o); store.set(k, v); }, async delete(k) { store.delete(k); } };
    const envKV = { ...env, LIMITS: kv };
    __reset(); await call('/v1/posiciones', { e: envKV, ip: B });
    for (let i = 0; i < 5; i++) await call('/v1/posiciones', { e: envKV, key: 'q' + i, ip: A });
    __reset();   /* otra instancia: memoria vacía */
    r = await call('/v1/posiciones', { e: envKV, ip: A });
    ok(r.status === 429 && [...store.keys()].every((k) => k.startsWith('lim:') && !k.includes(A)), 'KV: el bloqueo se respeta en otra instancia y la IP no se guarda en texto');
    ok(puts.every((o) => o && o.expirationTtl >= 60), 'KV: los registros caducan solos');
  } finally { Date.now = realNow; }
} finally { srv.close(); }

/* Hace que la caché parezca vencida sin borrar su contenido */
function cacheExpire() { const realNow = Date.now; Date.now = () => realNow() + 31 * 1000; setTimeout(() => { Date.now = realNow; }, 0); }
