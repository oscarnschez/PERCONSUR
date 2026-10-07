/* Inicio: saludo, divisiones, documentos sin terminar y recientes. */
import { screen, on } from '../../core/dom.js';
import { go } from '../../core/router.js';
import { allDrafts } from '../../services/drafts.js';
import { listDocuments } from '../../services/documents.js';
import { getCompany } from '../../services/companies.js';
import { esc, agoText, relDay } from '../../domain/shared/format.js';
import { puertoHasData } from '../../domain/puerto/model.js';
import { campoHasData } from '../../domain/campo/model.js';
import { icon } from '../components/icons.js';
import { startPuerto, startCampo, discardDraft, draftRoute } from '../flows.js';
import { confirmDestructive } from '../components/sheet.js';
import { docRow } from './documents.js';

export function greeting(d = new Date()) { const h = d.getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }

export async function pendingDrafts() {
  return (await allDrafts()).filter((d) => (d.type === 'campo' ? campoHasData(d.data) : puertoHasData(d.data))).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function draftCardHTML(d) {
  const isP = d.type === 'puerto', co = getCompany(d.company);
  return `<article class="draft-card" data-draft="${esc(d.id)}">
    <div class="dc-main"><span class="dc-ic">${isP ? icon.container : icon.truck}</span>
      <div><b>${isP ? 'Nota de entrega' : 'Asignación de unidades'}</b><small>${isP ? esc(co.short) + ' | ' : ''}Folio ${esc(d.data.folio)} | ${esc(agoText(d.updatedAt))}</small></div></div>
    <div class="dc-acts"><button type="button" class="btn-ghost sm danger" data-discard="${esc(d.id)}">Descartar</button><button type="button" class="btn-primary sm" data-continue="${esc(d.id)}">Continuar</button></div>
  </article>`;
}

export async function homeScreen() {
  const [pend, docs] = await Promise.all([pendingDrafts(), listDocuments()]);
  const recent = docs.slice(0, 4);
  const s = screen(`<div class="page home">
    <header class="home-top">
      <div class="brandline"><img src="./assets/brand/perconsur-mark.png" alt="" class="brand-mark"><span class="wordmark">PERCONSUR</span></div>
      <div class="band" aria-hidden="true"></div>
      <h1 class="greet">${greeting()}</h1>
      <p class="greet-sub">¿Qué necesitas hacer?</p>
    </header>
    ${pend.length ? `<section class="sec"><h2 class="sec-h">Sin terminar</h2>${pend.map(draftCardHTML).join('')}</section>` : ''}
    <section class="sec divs">
      <article class="div-card">
        <div class="div-head"><span class="div-ic">${icon.container}</span><div><h2>División Puerto</h2><p>Notas de entrega y recepción</p></div></div>
        <button type="button" class="div-act" data-new="puerto"><span>Nueva nota</span>${icon.chev}</button>
      </article>
      <article class="div-card">
        <div class="div-head"><span class="div-ic">${icon.truck}</span><div><h2>División Campo</h2><p>Asignación de unidades para carga</p></div></div>
        <button type="button" class="div-act" data-new="campo"><span>Nueva asignación</span>${icon.chev}</button>
      </article>
    </section>
    <section class="sec">
      <div class="sec-hrow"><h2 class="sec-h">Recientes</h2>${docs.length ? '<a class="link" href="#/documentos">Ver todos</a>' : ''}</div>
      ${recent.length ? `<div class="list">${recent.map(docRow).join('')}</div>` : `<div class="empty"><p>Aún no hay documentos generados. Los PDF que generes aparecerán aquí.</p></div>`}
    </section>
  </div>`);
  const root = s.el;
  on(root, 'click', '[data-new]', (e, b) => (b.dataset.new === 'puerto' ? startPuerto() : startCampo()));
  on(root, 'click', '[data-continue]', (e, b) => { const d = pend.find((x) => x.id === b.dataset.continue); if (d) go(draftRoute(d)); });
  on(root, 'click', '[data-discard]', async (e, b) => {
    const d = pend.find((x) => x.id === b.dataset.discard);
    if (!d || !(await confirmDestructive('¿Descartar el documento sin terminar?', `Folio ${d.data.folio}. Se perderá la información capturada y sus fotos.`, 'Descartar'))) return;
    await discardDraft(d.id); b.closest('.draft-card').remove();
  });
  return s;
}
