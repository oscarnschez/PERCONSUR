/*
 * Plantillas de campos de formulario optimizadas para iPhone:
 * - 16 px o más (evita el zoom automático de Safari), mínimo 48 px de alto.
 * - inputmode / autocapitalize / enterkeyhint según el dato.
 * data-b = ruta del dato en el borrador; data-t = transformación (mayúsculas, RFC, etc.).
 */
import { esc } from '../../domain/shared/format.js';
import { icon } from './icons.js';

export function fld({ label, path, value = '', type = 'text', mode, cap = 'sentences', ph = '', t = '', max, hint = '', hintId = '', textarea = false, rows = 2, readonly = false, extra = '', after = '', cls = '' }) {
  const attrs = [
    `data-b="${esc(path)}"`, t ? `data-t="${t}"` : '', mode ? `inputmode="${mode}"` : '', `autocapitalize="${cap}"`,
    ph ? `placeholder="${esc(ph)}"` : '', max ? `maxlength="${max}"` : '', readonly ? 'readonly tabindex="-1"' : '',
    'autocomplete="off"', cap === 'characters' || mode === 'url' || mode === 'email' ? 'spellcheck="false" autocorrect="off"' : '', extra,
  ].filter(Boolean).join(' ');
  const ctl = textarea
    ? `<textarea class="in" rows="${rows}" ${attrs} enterkeyhint="enter">${esc(value)}</textarea>`
    : `<input class="in" type="${type}" value="${esc(value)}" ${attrs} enterkeyhint="next">`;
  return `<label class="fld ${cls}" data-f="${esc(path)}"><span class="fl">${esc(label)}</span>${ctl}${after}${hint || hintId ? `<span class="fhint" ${hintId ? `data-hint="${esc(hintId)}"` : ''}>${hint}</span>` : ''}</label>`;
}

/* Campo que abre un selector con buscador */
export function pickFld({ label, path, value = '', ph = 'Elegir o escribir', sub = '', hint = '' }) {
  return `<div class="fld" data-f="${esc(path)}"><span class="fl">${esc(label)}</span>
    <button type="button" class="in pick ${value ? '' : 'empty'}" data-pick="${esc(path)}"><span class="pv"><span class="pv-v">${esc(value || ph)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="pick-ic">${icon.chev}</span></button>
    ${hint ? `<span class="fhint">${hint}</span>` : ''}</div>`;
}
export function setPickDisplay(root, path, value, ph = 'Elegir o escribir', sub = '') {
  const b = root.querySelector(`[data-pick="${CSS.escape(path)}"]`);
  if (!b) return;
  b.classList.toggle('empty', !value);
  b.querySelector('.pv').innerHTML = `<span class="pv-v">${esc(value || ph)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
}

export function selFld({ label, path, value = '', options = [], hint = '' }) {
  return `<label class="fld" data-f="${esc(path)}"><span class="fl">${esc(label)}</span>
    <span class="sel-w"><select class="in" data-b="${esc(path)}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><span class="sel-ic">${icon.down}</span></span>
    ${hint ? `<span class="fhint">${hint}</span>` : ''}</label>`;
}

/* Interruptor (usa el switch nativo de Safari 18 con respuesta háptica; estilo propio en otros navegadores) */
export function swRow({ label, path, checked, sub = '' }) {
  return `<label class="sw-row" data-f="${esc(path)}"><span class="sw-tx">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><input type="checkbox" switch class="sw" data-b="${esc(path)}"${checked ? ' checked' : ''}></label>`;
}

export function seg({ path, value, options }) {
  return `<div class="seg" role="radiogroup" data-f="${esc(path)}">${options.map(([v, l]) => `<button type="button" role="radio" class="seg-b${v === value ? ' on' : ''}" aria-checked="${v === value}" data-seg="${esc(path)}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
}

export const group = (title, inner, { note = '', cls = '', right = '' } = {}) =>
  `<section class="grp ${cls}">${title ? `<div class="grp-h"><h3>${esc(title)}</h3>${right}</div>` : ''}${note ? `<p class="grp-note">${note}</p>` : ''}<div class="grp-b">${inner}</div></section>`;

/* Mantiene la posición del cursor al transformar el texto */
export function setKeepCaret(el, v) {
  if (el.value === v) return;
  const p = el.selectionStart, diff = v.length - el.value.length;
  el.value = v;
  try { const n = Math.max(0, Math.min(v.length, (p || 0) + Math.min(0, diff))); el.setSelectionRange(n, n); } catch (e) { /* */ }
}

/* Enter avanza al siguiente campo; en el último cierra el teclado */
export function enterAdvances(root) {
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'search') return;
    e.preventDefault();
    const list = [...root.querySelectorAll('input.in:not([readonly]):not([type=checkbox]),textarea.in,select.in')].filter((x) => x.offsetParent);
    const i = list.indexOf(e.target);
    const nx = list[i + 1];
    if (nx) nx.focus(); else e.target.blur();
  });
}

/* Lleva al usuario a un campo concreto (desde la lista de pendientes) */
export function focusField(root, path) {
  if (!path) return;
  const t = root.querySelector(`[data-b="${CSS.escape(path)}"],[data-pick="${CSS.escape(path)}"],[data-f="${CSS.escape(path)}"]`);
  if (!t) return;
  const box = t.closest('.fld,.sw-row,.seg,.card') || t;
  box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
  if (t.matches('input,textarea')) setTimeout(() => t.focus({ preventScroll: true }), 350);
}
