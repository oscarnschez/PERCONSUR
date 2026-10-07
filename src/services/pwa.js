/* Registro del service worker, actualizaciones y estado de instalación. */
import { LIBS, FONT_CSS } from '../config/reference.js';
import { flush } from './drafts.js';

let reg = null;
const listeners = new Set();
export const onUpdateReady = (fn) => listeners.add(fn);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    reg = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
    if (!reg) return;
    const watch = (w) => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) listeners.forEach((f) => f()); });
    if (reg.waiting && navigator.serviceWorker.controller) listeners.forEach((f) => f());
    reg.addEventListener('updatefound', () => watch(reg.installing));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
  } catch (e) { console.warn('SW', e); }
}
export async function checkForUpdate() { if (reg) { try { await reg.update(); } catch (e) { /* sin conexión */ } } return !!(reg && reg.waiting); }
export async function applyUpdate() {
  await flush();
  if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); else location.reload();
}

/* Descarga en segundo plano las librerías y la fuente para que queden disponibles sin conexión */
export function warmCache() {
  if (!navigator.onLine) return;
  const urls = Object.values(LIBS).filter((l) => !l.local).map((l) => l.cdn).concat([FONT_CSS]);
  const run = () => urls.forEach((u) => fetch(u, { mode: 'cors', credentials: 'omit' }).catch(() => {}));
  ('requestIdleCallback' in window) ? requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 1500);
}
/* ¿Está todo listo para trabajar sin conexión? */
export async function offlineStatus() {
  if (!('caches' in window)) return { ready: false, missing: ['caché no disponible'] };
  const missing = [];
  for (const [name, l] of Object.entries(LIBS)) {
    const hit = await caches.match(l.local || l.cdn, { ignoreSearch: false });
    if (!hit) missing.push(name);
  }
  return { ready: !missing.length, missing };
}
export async function persistStorage() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* */ }
  return false;
}
export async function storageInfo() {
  try {
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return { usage: est ? est.usage : null, quota: est ? est.quota : null, persisted };
  } catch (e) { return { usage: null, quota: null, persisted: false }; }
}
