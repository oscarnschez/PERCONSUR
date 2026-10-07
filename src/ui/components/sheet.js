/*
 * Hojas inferiores (bottom sheets) y hojas de acción (action sheets) estilo iOS.
 * - Se cierran con el botón, tocando el fondo, deslizando hacia abajo o con Escape.
 * - Bloquean el desplazamiento del fondo mientras están abiertas.
 */
import { esc } from '../../domain/shared/format.js';
import { icon } from './icons.js';

const openSheets = [];
function lockScroll(on) { document.documentElement.classList.toggle('sheet-open', on); }

export function openSheet({ title = '', body = '', className = '', full = false, onClose = null, closeLabel = 'Cerrar', headerRight = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div>
    <section class="bsheet ${full ? 'full' : ''} ${className}" role="dialog" aria-modal="true" ${title ? `aria-label="${esc(title)}"` : ''}>
      <div class="bsheet-grab" aria-hidden="true"></div>
      ${title || closeLabel ? `<header class="bsheet-head"><h2 class="bsheet-title">${esc(title)}</h2>${headerRight}${closeLabel ? `<button type="button" class="icon-btn bsheet-x" aria-label="${esc(closeLabel)}">${icon.close}</button>` : ''}</header>` : ''}
      <div class="bsheet-body"></div>
    </section>`;
  const panel = wrap.querySelector('.bsheet'), bodyEl = wrap.querySelector('.bsheet-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  document.body.appendChild(wrap);
  lockScroll(true);
  requestAnimationFrame(() => wrap.classList.add('is-open'));
  let closed = false;
  const api = {
    el: panel, body: bodyEl, wrap,
    close(result) {
      if (closed) return; closed = true;
      wrap.classList.remove('is-open'); wrap.classList.add('out');
      const i = openSheets.indexOf(api); if (i >= 0) openSheets.splice(i, 1);
      if (!openSheets.length) lockScroll(false);
      setTimeout(() => wrap.remove(), 240);
      if (onClose) onClose(result);
    },
  };
  openSheets.push(api);
  wrap.querySelector('.sheet-backdrop').addEventListener('click', () => api.close());
  const x = wrap.querySelector('.bsheet-x'); if (x) x.addEventListener('click', () => api.close());
  /* Deslizar hacia abajo desde la parte superior para cerrar */
  let y0 = null, dy = 0;
  const head = wrap.querySelector('.bsheet-grab');
  const start = (e) => { y0 = e.touches[0].clientY; dy = 0; panel.style.transition = 'none'; };
  const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); panel.style.transform = `translateY(${dy}px)`; };
  const end = () => { if (y0 == null) return; panel.style.transition = ''; panel.style.transform = ''; if (dy > 90) api.close(); y0 = null; };
  [head, wrap.querySelector('.bsheet-head')].filter(Boolean).forEach((h) => { h.addEventListener('touchstart', start, { passive: true }); h.addEventListener('touchmove', move, { passive: true }); h.addEventListener('touchend', end); });
  return api;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSheets.length) openSheets[openSheets.length - 1].close(); });
export const closeAllSheets = () => [...openSheets].forEach((s) => s.close());

/*
 * Hoja de acciones. actions: [{ label, value, style: 'default'|'primary'|'destructive', icon, sub }]
 * Devuelve una promesa con el value elegido o null si se cancela.
 */
export function actionSheet({ title = '', message = '', actions = [], cancel = 'Cancelar', html = '' } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap as-wrap';
    wrap.innerHTML = `<div class="sheet-backdrop"></div>
      <section class="asheet" role="alertdialog" aria-modal="true">
        <div class="as-group">
          ${title || message || html ? `<div class="as-head">${title ? `<h2>${esc(title)}</h2>` : ''}${message ? `<p>${esc(message)}</p>` : ''}${html}</div>` : ''}
          ${actions.map((a, i) => `<button type="button" class="as-btn ${a.style || ''}" data-i="${i}">${a.icon ? `<span class="as-ic">${a.icon}</span>` : ''}<span>${esc(a.label)}${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</span></button>`).join('')}
        </div>
        ${cancel ? `<button type="button" class="as-btn as-cancel" data-i="-1">${esc(cancel)}</button>` : ''}
      </section>`;
    document.body.appendChild(wrap);
    lockScroll(true);
    requestAnimationFrame(() => wrap.classList.add('is-open'));
    const fake = { close: () => done(null) };
    openSheets.push(fake);
    function done(v) {
      const i = openSheets.indexOf(fake); if (i >= 0) openSheets.splice(i, 1);
      if (!openSheets.length) lockScroll(false);
      wrap.classList.remove('is-open'); wrap.classList.add('out'); setTimeout(() => wrap.remove(), 240); resolve(v);
    }
    wrap.querySelector('.sheet-backdrop').addEventListener('click', () => done(null));
    wrap.querySelectorAll('.as-btn').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.i; done(i < 0 ? null : actions[i].value); }));
  });
}
export const confirmDestructive = (title, message, label = 'Eliminar') => actionSheet({ title, message, actions: [{ label, value: true, style: 'destructive' }] }).then((v) => v === true);

/* Indicador de trabajo a pantalla completa (generación de PDF) */
let busyEl = null;
export function busy(on, text = 'Generando PDF…', sub = '') {
  if (!busyEl) { busyEl = document.createElement('div'); busyEl.className = 'busy'; busyEl.innerHTML = '<div class="busy-box"><div class="busy-band"></div><b></b><small></small></div>'; document.body.appendChild(busyEl); }
  busyEl.querySelector('b').textContent = text; busyEl.querySelector('small').textContent = sub;
  busyEl.classList.toggle('on', on);
  document.documentElement.classList.toggle('is-busy', on);
}
