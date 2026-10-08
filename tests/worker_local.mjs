/*
 * Worker gps-proxy corriendo en Node para las pruebas de punta a punta (monitor.py): el mismo código que va a
 * Cloudflare, con un IOPGPS simulado y un espacio KV en memoria. No usa credenciales reales.
 *   node tests/worker_local.mjs <puerto> <APP_URL>
 * Control de la simulación (solo pruebas): POST /__mock  { devices: [...] }  → posiciones que entrega el «proveedor»
 *   (vacía la caché de 30 s del Worker para que la prueba no tenga que esperar; los enlaces siguen en el KV)
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import worker, { __reset } from '../gps-proxy/worker.js';

const PORT = +process.argv[2] || 8795, APP_URL = process.argv[3] || 'https://app.test/';
const APPID = 'APP_PRUEBA', SECRET = 'secreto-de-prueba-0123456789abcdef';
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
let devices = [];

/* IOPGPS simulado */
const iop = http.createServer((req, res) => {
  const send = (b) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/auth') {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => { const { time, signature } = JSON.parse(b); send(signature === md5(md5(SECRET) + time) ? { code: 0, accessToken: 'tk', expiresIn: 7200 } : { code: 1001, msg: 'signature error' }); });
    return;
  }
  if (u.pathname === '/api/device/locations/search-by-organization') return send({ code: 0, data: devices });
  const d = devices.find((x) => x.imei === u.searchParams.get('imei')) || {};
  if (u.pathname === '/api/device/location') return send({ code: 0, data: d });
  if (u.pathname === '/api/device/status') return send({ code: 0, data: d });
  send({ code: 404, msg: 'no' });
});
await new Promise((r) => iop.listen(0, '127.0.0.1', r));

/* KV en memoria (get/put/list con metadatos y caducidad) */
const store = new Map();
const KV = {
  async get(k, t) { const v = store.get(k); if (!v || (v.exp && Date.now() > v.exp)) return null; return t === 'json' ? JSON.parse(v.v) : v.v; },
  async put(k, v, o = {}) { store.set(k, { v, meta: o.metadata, exp: o.expirationTtl ? Date.now() + o.expirationTtl * 1000 : 0 }); },
  async delete(k) { store.delete(k); },
  async list({ prefix = '' } = {}) { return { keys: [...store].filter(([k]) => k.startsWith(prefix)).map(([name, x]) => ({ name, metadata: x.meta })), list_complete: true }; },
};
const env = { IOP_APPID: APPID, IOP_SECRET: SECRET, PCS_KEY: 'clave-app', ALLOWED_ORIGIN: 'http://127.0.0.1:8806', IOP_BASE: `http://127.0.0.1:${iop.address().port}`, TRACKING: KV, APP_URL };

http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  if (req.url === '/__mock' && req.method === 'POST') { devices = JSON.parse(body.toString() || '{}').devices || []; __reset(); res.writeHead(204); return res.end(); }
  /* La prueba entra como https://gps.test (el navegador la reenvía aquí) */
  const host = req.headers['x-forwarded-host'] || 'gps.test';
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const r = await worker.fetch(new Request(`https://${host}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
  const out = {}; r.headers.forEach((v, k) => { out[k] = v; });
  res.writeHead(r.status, out); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, '127.0.0.1', () => console.log('worker local en', PORT));
