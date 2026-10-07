/* Documentos: Puerto / Campo, buscador y filtros por periodo. Incluye borradores. */
import { screen, on } from '../../core/dom.js';
import { go, query } from '../../core/router.js';
import { listDocuments } from '../../services/documents.js';
import { getCompany } from '../../services/companies.js';
import { esc, relDay, fmtFecha, agoText } from '../../domain/shared/format.js';
import { icon } from '../components/icons.js';
import { pendingDrafts } from './home.js';
import { draftRoute } from '../flows.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const STATUS = { generado: 'Generado', compartido: 'Compartido', borrador: 'Borrador' };

export function docRow(d) {
  const S = d.summary || {}, isP = d.type === 'puerto';
  const who = isP ? [S.operador, S.unidad].filter(Boolean).join(' | ') : [S.unidad, S.planta].filter(Boolean).join(' | ');
  return `<a class="row" href="#/doc/${esc(d.id)}">
    <span class="row-ic ${d.type}">${isP ? icon.container : icon.truck}</span>
    <span class="row-tx"><span class="row-l1"><b class="mono">${esc(d.folio)}</b><span class="st st-${d.status}">${STATUS[d.status] || ''}</span></span>
      <span class="row-l2">${esc(isP ? S.empresa || '' : 'PERCONSUR Campo')}${who ? ' | ' + esc(who) : ''}</span>
      <span class="row-l3">${isP ? 'Nota de entrega' : 'Asignación de unidades'} | ${esc(relDay(d.createdAt))}</span></span>
    <span class="chev">${icon.chev}</span></a>`;
}
function draftRow(d) {
  const isP = d.type === 'puerto', s = d.data;
  return `<a class="row" href="#${draftRoute(d)}">
    <span class="row-ic ${d.type} draft">${isP ? icon.container : icon.truck}</span>
    <span class="row-tx"><span class="row-l1"><b class="mono">${esc(s.folio)}</b><span class="st st-borrador">Borrador</span></span>
      <span class="row-l2">${isP ? esc(getCompany(d.company).short) + (s.operador ? ' | ' + esc(s.operador) : '') : 'PERCONSUR Campo'}</span>
      <span class="row-l3">Sin terminar | ${esc(agoText(d.updatedAt))}</span></span>
    <span class="chev">${icon.chev}</span></a>`;
}

export async function documentsScreen() {
  const q = query();
  let tab = q.get('t') === 'campo' ? 'campo' : 'puerto';
  let period = 'todos', text = '';
  const [docs, pend] = await Promise.all([listDocuments(), pendingDrafts()]);
  const s = screen(`<div class="page">
    <header class="page-top"><h1 class="title">Documentos</h1></header>
    <div class="seg wide" role="tablist">
      <button type="button" class="seg-b" data-tab="puerto" role="tab">Puerto</button><button type="button" class="seg-b" data-tab="campo" role="tab">Campo</button>
    </div>
    <label class="search"><span class="search-ic">${icon.search}</span><input type="search" class="search-in" placeholder="Buscar folio, operador o unidad" autocomplete="off" autocorrect="off" enterkeyhint="search"></label>
    <div class="chips filters">${[['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['todos', 'Todos']].map(([v, l]) => `<button type="button" class="chip" data-p="${v}">${l}</button>`).join('')}</div>
    <div data-list></div>
  </div>`);
  const root = s.el, listEl = root.querySelector('[data-list]');
  function inPeriod(ts) {
    if (period === 'todos') return true;
    const d = new Date(), start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (period === 'semana') { const dow = (start.getDay() + 6) % 7; start.setDate(start.getDate() - dow); }
    if (period === 'mes') start.setDate(1);
    return ts >= start.getTime();
  }
  function match(hay) { return !text || fold(hay).includes(fold(text)); }
  function draw() {
    root.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
    root.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === period));
    const ds = docs.filter((d) => d.type === tab && inPeriod(d.createdAt) && match([d.folio, d.filename, ...Object.values(d.summary || {}).flat()].join(' ')));
    const dr = pend.filter((d) => d.type === tab && inPeriod(d.updatedAt) && match([d.data.folio, d.data.operador, d.company].join(' ')));
    listEl.innerHTML = (dr.length ? `<h2 class="sec-h">Sin terminar</h2><div class="list">${dr.map(draftRow).join('')}</div>` : '')
      + (ds.length ? `<h2 class="sec-h">${ds.length} documento${ds.length === 1 ? '' : 's'}</h2><div class="list">${ds.map(docRow).join('')}</div>`
        : `<div class="empty"><p>${text || period !== 'todos' ? 'No hay documentos con ese filtro.' : tab === 'puerto' ? 'Aún no hay notas de entrega generadas.' : 'Aún no hay asignaciones generadas.'}</p></div>`);
  }
  on(root, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; history.replaceState(null, '', '#/documentos?t=' + tab); draw(); });
  on(root, 'click', '[data-p]', (e, b) => { period = b.dataset.p; draw(); });
  root.querySelector('.search-in').addEventListener('input', (e) => { text = e.target.value.trim(); draw(); });
  draw();
  return s;
}
