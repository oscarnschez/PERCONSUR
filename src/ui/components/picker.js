/*
 * Selector moderno con buscador (sustituye a los <datalist>):
 * recientes, resultados del catálogo y opción para usar lo escrito como valor nuevo.
 * items: [{ value, label, sub, data }]
 */
import { openSheet } from './sheet.js';
import { esc } from '../../domain/shared/format.js';
import { icon } from './icons.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function openPicker({ title, items = [], recents = [], placeholder = 'Buscar o escribir', allowNew = true, newLabel = 'Usar', inputmode = 'text', autocap = 'words', transform = (v) => v, current = '', canSave = false, saveLabel = 'Guardar en catálogo', emptyText = 'El catálogo está vacío. Escribe para usar un valor nuevo.' }) {
  return new Promise((resolve) => {
    let result = null;
    const body = document.createElement('div');
    body.className = 'picker';
    body.innerHTML = `<label class="search"><span class="search-ic">${icon.search}</span>
        <input type="search" class="search-in" placeholder="${esc(placeholder)}" inputmode="${inputmode}" autocapitalize="${autocap}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done"></label>
      <div class="picker-list" role="listbox"></div>`;
    const sh = openSheet({ title, body, full: true, className: 'picker-sheet', onClose: () => resolve(result) });
    const inp = body.querySelector('.search-in'), listEl = body.querySelector('.picker-list');
    const byValue = new Map(items.map((it) => [String(it.value), it]));
    function row(it, cls = '') {
      const sel = String(it.value) === String(current) && current !== '';
      return `<button type="button" class="pk-row ${cls}${sel ? ' sel' : ''}" data-v="${esc(it.value)}"><span class="pk-tx"><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${sel ? `<span class="pk-check">${icon.check}</span>` : ''}</button>`;
    }
    function draw() {
      const q = transform(inp.value.trim());
      const fq = fold(q);
      let html = '';
      const typed = q && ![...byValue.keys()].some((v) => fold(v) === fq);
      if (allowNew && typed) {
        html += `<div class="pk-new"><button type="button" class="pk-row pk-use" data-new="1"><span class="pk-plus">${icon.plus}</span><span class="pk-tx"><b>${esc(newLabel)} «${esc(q)}»</b><small>Valor nuevo para este documento</small></span></button>
          ${canSave ? `<button type="button" class="pk-row pk-use" data-new="save"><span class="pk-plus">${icon.catalog}</span><span class="pk-tx"><b>${esc(saveLabel)}</b><small>Queda disponible para la próxima vez</small></span></button>` : ''}</div>`;
      }
      const rec = !q ? recents.map((v) => byValue.get(String(v)) || (allowNew ? { value: v, label: v } : null)).filter(Boolean) : [];
      if (rec.length) html += `<h3 class="pk-h">Recientes</h3>${rec.map((it) => row(it)).join('')}`;
      const res = items.filter((it) => !q || fold(it.label).includes(fq) || fold(it.sub).includes(fq) || fold(it.value).includes(fq));
      if (res.length) html += `<h3 class="pk-h">${q ? 'Resultados' : 'Catálogo'}</h3>${res.map((it) => row(it)).join('')}`;
      if (!res.length && !rec.length && !typed) html += `<p class="pk-empty">${esc(q ? 'Sin coincidencias.' : emptyText)}</p>`;
      listEl.innerHTML = html;
    }
    draw();
    inp.addEventListener('input', draw);
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = listEl.querySelector('.pk-row'); if (first) first.click();
    });
    listEl.addEventListener('click', (e) => {
      const b = e.target.closest('.pk-row'); if (!b) return;
      if (b.dataset.new) result = { value: transform(inp.value.trim()), isNew: true, save: b.dataset.new === 'save' };
      else { const it = byValue.get(b.dataset.v) || { value: b.dataset.v }; result = { value: it.value, item: it, isNew: false }; }
      sh.close(result);
    });
    /* El teclado solo abre si el enfoque ocurre dentro del toque del usuario */
    inp.focus({ preventScroll: true });
  });
}
