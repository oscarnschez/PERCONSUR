/* Inicio: saludo, divisiones, documentos sin terminar, recientes y unidades en operación (Logística). */
import { screen, on } from '../../core/dom.js';
import { go } from '../../core/router.js';
import { allDrafts } from '../../services/drafts.js';
import { listDocuments } from '../../services/documents.js';
import { getCompany } from '../../services/companies.js';
import { esc, agoText, relDay } from '../../domain/shared/format.js';
import { puertoHasData } from '../../domain/puerto/model.js';
import { campoHasData } from '../../domain/campo/model.js';
import { icon } from '../components/icons.js';
import { DIVISION_IMG } from '../../config/modules.js';
import { startPuerto, startCampo, discardDraft, draftRoute } from '../flows.js';
import { confirmDestructive } from '../components/sheet.js';
import { docRow } from './documents.js';
import { mountHomeOps } from './logistics.js';
import * as sync from '../../services/sync.js';
import { whenText } from '../../domain/sync/sync.js';

export function greeting(d = new Date()) { const h = d.getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }

export async function pendingDrafts() {
  return (await allDrafts()).filter((d) => (d.type === 'campo' ? campoHasData(d.data) : puertoHasData(d.data))).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function draftCardHTML(d) {
  const isP = d.type === 'puerto', co = getCompany(d.company);
  return `<article class="draft-card" data-draft="${esc(d.id)}">
    <div class="dc-main"><span class="dc-ic img"><img src="${DIVISION_IMG[isP ? 'puerto' : 'campo']}" alt=""></span>
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
      <p class="greet-sub">${sync.role() === 'read' ? 'Consulta la información al día' : '¿Qué necesitas hacer?'}</p>
      <a class="sync-pill" href="#/ajustes/compartir" data-syncpill></a>
    </header>
    ${pend.length ? `<section class="sec"><h2 class="sec-h">Sin terminar</h2>${pend.map(draftCardHTML).join('')}</section>` : ''}
    <section class="sec divs">
      <article class="div-card">
        <div class="div-head"><span class="div-ic img"><img src="${DIVISION_IMG.puerto}" alt=""></span><div><h2>División Puerto</h2><p>Notas de entrega y recepción</p></div></div>
        <button type="button" class="div-act" data-new="puerto"><span>Nueva nota</span>${icon.chev}</button>
      </article>
      <article class="div-card">
        <div class="div-head"><span class="div-ic img"><img src="${DIVISION_IMG.campo}" alt=""></span><div><h2>División Campo</h2><p>Asignación de unidades para carga</p></div></div>
        <button type="button" class="div-act" data-new="campo"><span>Nueva asignación</span>${icon.chev}</button>
      </article>
    </section>
    <section class="sec">
      <div class="sec-hrow"><h2 class="sec-h">Recientes</h2>${docs.length ? '<a class="link" href="#/documentos">Ver todos</a>' : ''}</div>
      ${recent.length ? `<div class="list">${recent.map(docRow).join('')}</div>` : `<div class="empty"><p>Aún no hay documentos generados. Los PDF que generes aparecerán aquí.</p></div>`}
    </section>
    <section class="sec lg-home" data-lghome aria-label="Unidades en operación"></section>
  </div>`);
  const root = s.el;
  /* Unidades en operación: se redibuja sola cuando cambia Logística */
  const unOps = mountHomeOps(root.querySelector('[data-lghome]'));
  /* Información compartida: modo consulta o estado de la publicación */
  const pill = root.querySelector('[data-syncpill]');
  const drawPill = () => {
    const st = sync.status();
    if (!st.role) { pill.innerHTML = ''; return; }
    const decide = st.role === 'write' && (st.conflict || sync.needsDecision());
    const warn = decide || !!st.error;
    const text = st.role === 'read'
      ? `Solo consulta · ${st.phase ? 'recibiendo…' : st.error ? 'sin conexión con la información compartida' : st.at ? 'actualizado ' + whenText(st.at) : 'esperando información'}`
      : decide ? 'Información compartida: decide qué información queda'
        : st.error ? 'Información compartida: no se pudo publicar'
          : st.phase ? 'Publicando…' : st.dirty ? 'Cambios por publicar' : st.at ? 'Compartido · publicado ' + whenText(st.at) : 'Información compartida';
    pill.className = 'sync-pill' + (warn ? ' warn' : '');
    pill.innerHTML = `${warn ? icon.alert : icon.cloud}<span>${esc(text)}</span>`;
  };
  drawPill();
  const unSync = sync.onSyncChange(drawPill);
  s.cleanup = () => { unSync(); if (typeof unOps === 'function') unOps(); };
  on(root, 'click', '[data-new]', (e, b) => (b.dataset.new === 'puerto' ? startPuerto() : startCampo()));
  on(root, 'click', '[data-continue]', (e, b) => { const d = pend.find((x) => x.id === b.dataset.continue); if (d) go(draftRoute(d)); });
  on(root, 'click', '[data-discard]', async (e, b) => {
    const d = pend.find((x) => x.id === b.dataset.discard);
    if (!d || !(await confirmDestructive('¿Descartar el documento sin terminar?', `Folio ${d.data.folio}. Se perderá la información capturada y sus fotos.`, 'Descartar'))) return;
    await discardDraft(d.id); b.closest('.draft-card').remove();
  });
  return s;
}
