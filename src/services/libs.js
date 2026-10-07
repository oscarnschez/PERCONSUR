/* Carga diferida de librerías externas (primero /vendor si existe, luego CDN). El service worker las deja disponibles sin conexión. */
import { LIBS } from '../config/reference.js';

const pending = {};
export const hasLib = (name) => !!window[LIBS[name].global];

export function loadLib(name) {
  if (hasLib(name)) return Promise.resolve(true);
  if (pending[name]) return pending[name];
  const def = LIBS[name];
  const urls = [def.local, def.cdn].filter(Boolean);
  pending[name] = new Promise((resolve, reject) => {
    let i = 0;
    const next = () => {
      if (i >= urls.length) { delete pending[name]; reject(new Error(`No se pudo cargar ${name}`)); return; }
      const url = urls[i++];
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      if (/^https?:/.test(url)) s.crossOrigin = 'anonymous';
      s.onload = () => (hasLib(name) ? resolve(true) : next());
      s.onerror = () => { s.remove(); next(); };
      document.head.appendChild(s);
    };
    next();
  });
  return pending[name];
}
export async function loadLibs(names) { await Promise.all(names.map(loadLib)); }
/* Igual que loadLibs pero no falla: devuelve las que no se pudieron cargar */
export async function tryLibs(names) {
  const res = await Promise.allSettled(names.map(loadLib));
  return names.filter((n, i) => res[i].status !== 'fulfilled');
}
