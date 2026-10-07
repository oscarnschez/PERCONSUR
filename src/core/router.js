/*
 * Enrutador por hash (#/ruta). Funciona con el gesto "atrás" de Safari y en modo standalone.
 * Lleva una pila interna para que el botón "Atrás" de la app regrese a la pantalla anterior
 * o, si no hay historial, a una ruta de respaldo.
 */
const routes = [];
const stack = [];
let current = null;
let guard = null;
let viewEl = null;
let lastDir = 'fwd';

export function route(pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, handler, opts });
}
export const currentPath = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];
export const query = () => new URLSearchParams((location.hash.split('?')[1]) || '');
/* Permite que una pantalla bloquee la navegación (p. ej. mientras se genera un PDF) */
export const setGuard = (fn) => { guard = fn; };

export function go(path, { replace = false } = {}) {
  const h = '#' + path;
  if (location.hash === h) { render(); return; }
  lastDir = 'fwd';
  if (replace) { location.replace(h); } else location.hash = h;
}
export function back(fallback = '/') {
  lastDir = 'back';
  if (stack.length > 1) { history.back(); } else go(fallback, { replace: true });
}

async function render() {
  const path = currentPath();
  if (guard && guard(path) === false) return;
  const prev = stack[stack.length - 2];
  if (prev === path) { stack.pop(); lastDir = 'back'; } else if (stack[stack.length - 1] !== path) stack.push(path);
  if (stack.length > 50) stack.splice(0, stack.length - 50);
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    if (current && current.cleanup) { try { await current.cleanup(); } catch (e) { /* */ } current = null; }
    const screen = await r.handler(params, query());
    if (!screen) return;
    current = screen;
    viewEl.replaceChildren(screen.el);
    document.body.dataset.screen = r.opts.name || '';
    document.body.classList.toggle('has-tabbar', !!r.opts.tabs);
    screen.el.classList.add(lastDir === 'back' ? 'enter-back' : 'enter');
    if (!screen.keepScroll) window.scrollTo(0, 0);
    if (screen.mounted) screen.mounted();
    window.dispatchEvent(new CustomEvent('routechange', { detail: { path, tab: r.opts.tab } }));
    lastDir = 'fwd';
    return;
  }
  go('/', { replace: true });
}
export function startRouter(el) {
  viewEl = el;
  window.addEventListener('hashchange', render);
  render();
}
export const refresh = () => render();
