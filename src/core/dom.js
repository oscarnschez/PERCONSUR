/* Utilidades DOM mínimas */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export function screen(html, extra = {}) { return { el: el(html), ...extra }; }
export const on = (root, ev, sel, fn) => root.addEventListener(ev, (e) => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); });
export const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* Valor por ruta: get(obj,'conts.0.num') */
export function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
export function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }
