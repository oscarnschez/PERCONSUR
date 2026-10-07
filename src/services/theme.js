/* Apariencia: sistema / claro / oscuro. Se refleja en localStorage para aplicarse antes del primer pintado (ver index.html). */
import { getSetting, setSetting } from './settings.js';

const mq = window.matchMedia('(prefers-color-scheme: dark)');
export const themePref = () => getSetting('theme', 'system');
export function effectiveTheme(p = themePref()) { return p === 'system' ? (mq.matches ? 'dark' : 'light') : p; }
export function applyTheme(p = themePref()) {
  const root = document.documentElement;
  if (p === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', p);
  const dark = effectiveTheme(p) === 'dark';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const m = document.createElement('meta'); m.name = 'theme-color'; m.content = dark ? '#0E1219' : '#F4F5F8';
  document.head.appendChild(m);
  try { localStorage.setItem('pcs-theme', p); } catch (e) { /* */ }
}
export async function setTheme(p) { await setSetting('theme', p); applyTheme(p); }
mq.addEventListener ? mq.addEventListener('change', () => applyTheme()) : mq.addListener(() => applyTheme());
