/*
 * Taller — piezas de interfaz compartidas:
 *   statusChip / sevChip / stateChip / availChip   chips de estado (mismos colores que el diagrama y el PDF)
 *   createDiagram()   diagrama interactivo por vistas, con zoom, lista alternativa de componentes y leyenda
 *   tirePicker()      esquema de ejes para marcar posiciones de llantas reemplazadas
 *   photoField()      fotos de evidencia: tomar foto, elegir de Fotos, ver, reemplazar y eliminar (se guardan al guardar)
 */
import { esc } from '../../domain/shared/format.js';
import { orderStatusOf, severityLabel, systemsOf } from '../../domain/maintenance/catalog.js';
import { STATE_LABELS, STATE_KEYS, componentStates, numbering, positionsOf } from '../../domain/maintenance/maintenance.js';
import { viewsOf, svgMarkup, componentViews, tireSvg } from '../../domain/maintenance/diagrams.js';
import * as mt from '../../services/maintenance.js';
import * as media from '../../services/media.js';
import { compressPhoto } from '../../services/camera.js';
import { icon } from '../components/icons.js';
import { openSheet, confirmDestructive } from '../components/sheet.js';
import { toast } from '../components/toast.js';

export const statusChip = (k, cls = '') => { const s = orderStatusOf(k); return `<span class="lg-st lg-t-${s.tone} ${cls}"><i aria-hidden="true"></i>${esc(s.label)}</span>`; };
export const sevChip = (sev) => `<span class="sev s-${sev || 'none'}"><i aria-hidden="true"></i>${esc(severityLabel(sev))}</span>`;
export const stateChip = (state) => `<span class="sev s-${state || 'none'}"><i aria-hidden="true"></i>${esc(STATE_LABELS[state || 'none'])}</span>`;
export const availChip = (av) => (av && av.inShop ? `<span class="mt-av">${icon.wrench}En taller</span>` : '<span class="mt-av ok">Disponible</span>');
export const eqHref = (type, id) => `#/operacion/taller/equipo/${type === 'vehicle' ? 'u' : 'r'}/${encodeURIComponent(id)}`;
export const orderHref = (id) => `#/operacion/taller/orden/${encodeURIComponent(id)}`;

/* Leyenda de colores (también con nombres: no se depende solo del color) */
export const legendHTML = () => `<div class="dg-legend" aria-label="Leyenda de colores">${STATE_KEYS.map((k) => `<span><i class="s-${k}" style="background:${{ none: '#C4CAD4', leve: '#FACC15', moderado: '#F97316', total: '#DC2626', reemplazado: '#2563EB' }[k]}"></i>${esc(STATE_LABELS[k])}</span>`).join('')}</div>`;

/*
 * Diagrama interactivo.
 *   kind        tractor | chasis | jaula | tolva
 *   records()   intervenciones a pintar (Map de estados se calcula aquí)
 *   onPick(id)  al tocar un componente (en el dibujo o en la lista)
 */
const ZOOMS = [1, 1.5, 2, 3];
export function createDiagram({ kind, records, onPick, startView = '' }) {
  const views = viewsOf(kind), cv = componentViews(kind);
  let view = startView && views.some((v) => v.id === startView) ? startView : (views[0] || {}).id, zoom = 0, selected = '';
  const el = document.createElement('div');
  el.className = 'dg';
  el.innerHTML = `<div class="dg-views" role="tablist" aria-label="Vistas del diagrama">${views.map((v) => `<button type="button" class="chip" role="tab" data-view="${v.id}">${esc(v.name)}</button>`).join('')}</div>
    <div class="dg-bar">
      <button type="button" class="icon-btn" data-zoom="-1" aria-label="Alejar">${icon.minus}</button>
      <span class="dg-z" data-zl>100 %</span>
      <button type="button" class="icon-btn" data-zoom="1" aria-label="Acercar">${icon.plus}</button>
      <button type="button" class="icon-btn" data-zoom="0" aria-label="Restablecer zoom">${icon.fit}</button>
      <button type="button" class="btn-secondary" data-complist>${icon.list}<span>Componentes</span></button>
    </div>
    <div class="dg-vp" data-vp><div class="dg-canvas" data-canvas></div></div>
    <p class="dg-tip" data-tip aria-live="polite">Toca una parte del diagrama o usa la lista de componentes.</p>
    ${legendHTML()}`;
  const $ = (s) => el.querySelector(s);
  const names = () => new Map(mt.componentsFor(kind).map((c) => [c.id, c.name]));
  function draw() {
    const states = componentStates(records()), nums = numbering(states, kind, mt.parts());
    el.querySelectorAll('[data-view]').forEach((b) => { const on = b.dataset.view === view; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('[data-canvas]').innerHTML = svgMarkup(kind, view, { states, numbers: nums, names: names(), selected, interactive: true, title: `Diagrama: ${(views.find((v) => v.id === view) || {}).name}` });
    const z = ZOOMS[zoom];
    $('[data-canvas]').style.width = `${z * 100}%`;
    $('[data-zl]').textContent = `${Math.round(z * 100)} %`;
    el.querySelector('[data-zoom="-1"]').disabled = zoom === 0;
    el.querySelector('[data-zoom="1"]').disabled = zoom === ZOOMS.length - 1;
  }
  function pick(id) {
    selected = id; draw();
    const nm = names().get(id) || id, st = componentStates(records()).get(id);
    $('[data-tip]').innerHTML = `<b>${esc(nm)}</b> · ${esc(STATE_LABELS[(st && st.state) || 'none'])}`;
    onPick && onPick(id);
  }
  function setZoom(nz) {
    const vp = $('[data-vp]'), cx = (vp.scrollLeft + vp.clientWidth / 2) / vp.scrollWidth, cy = (vp.scrollTop + vp.clientHeight / 2) / vp.scrollHeight;
    zoom = nz; draw();
    vp.scrollLeft = cx * vp.scrollWidth - vp.clientWidth / 2; vp.scrollTop = cy * vp.scrollHeight - vp.clientHeight / 2;
  }
  el.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]'); if (v) { view = v.dataset.view; draw(); return; }
    const z = e.target.closest('[data-zoom]'); if (z) { const d = +z.dataset.zoom; setZoom(d === 0 ? 0 : Math.min(ZOOMS.length - 1, Math.max(0, zoom + d))); return; }
    if (e.target.closest('[data-complist]')) { openComponentList(kind, records(), (id) => { const vs = cv.get(id) || []; if (vs.length && !vs.includes(view)) view = vs[0]; pick(id); }); return; }
    const c = e.target.closest('[data-c]'); if (c) pick(c.dataset.c);
  });
  el.addEventListener('keydown', (e) => { const c = e.target.closest('[data-c]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(c.dataset.c); } });
  draw();
  return { el, update: draw, select: (id) => { selected = id; draw(); }, view: () => view };
}

/* Lista alternativa de componentes (agrupada por sistema, con buscador y su estado actual) */
export function openComponentList(kind, records, onPick) {
  const states = componentStates(records), comps = mt.componentsFor(kind), fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const body = document.createElement('div');
  body.className = 'picker';
  body.innerHTML = `<label class="search"><span class="search-ic">${icon.search}</span><input type="search" class="search-in" placeholder="Buscar componente" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"></label><div class="picker-list" data-l></div>`;
  const sh = openSheet({ title: 'Componentes', body, full: true, className: 'picker-sheet' });
  const draw = (q = '') => {
    const f = fold(q);
    body.querySelector('[data-l]').innerHTML = systemsOf(kind, mt.parts()).map((s) => {
      const items = comps.filter((c) => c.system === s.id && (!f || fold(c.name).includes(f) || fold(s.name).includes(f)));
      if (!items.length) return '';
      return `<p class="pk-h">${esc(s.name)}</p>${items.map((c) => { const st = states.get(c.id); return `<button type="button" class="pk-row" data-c="${esc(c.id)}"><span class="pk-tx"><b>${esc(c.name)}</b><small>${st ? esc(STATE_LABELS[st.state]) + ` · ${st.items.length} registro${st.items.length === 1 ? '' : 's'}` : 'Sin registro en esta orden'}${c.custom ? ' · agregado' : ''}</small></span>${st ? stateChip(st.state) : ''}</button>`; }).join('')}`;
    }).join('') || '<p class="pk-empty">Sin coincidencias.</p>';
  };
  body.querySelector('.search-in').addEventListener('input', (e) => draw(e.target.value));
  body.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { sh.close(); onPick(b.dataset.c); } });
  draw();
}

/* Esquema de llantas para marcar posiciones (layoutKey de TIRE_LAYOUTS) */
export function tirePicker(layoutKey, selected = new Set(), { interactive = true, onChange = null } = {}) {
  const el = document.createElement('div');
  el.className = 'tr';
  const labels = new Map(positionsOf(layoutKey).map((p) => [p.id, p.label]));
  const draw = () => { el.innerHTML = `<div class="tr-wrap">${tireSvg(layoutKey, { replaced: selected, interactive, labels })}</div>`; };
  if (interactive) {
    const toggle = (g) => { const id = g.dataset.pos; if (selected.has(id)) selected.delete(id); else selected.add(id); draw(); onChange && onChange(selected); };
    el.addEventListener('click', (e) => { const g = e.target.closest('[data-pos]'); if (g) toggle(g); });
    el.addEventListener('keydown', (e) => { const g = e.target.closest('[data-pos]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(g); } });
  }
  draw();
  return { el, selected, redraw: draw };
}

/*
 * Fotos de evidencia de un registro. existing: fotos ya guardadas (maintenanceAttachments).
 * Los cambios (nuevas, reemplazadas, eliminadas) se aplican con apply(parentType, parentId, orderId) al guardar.
 */
export function photoField(existing = [], { label = 'Fotografías (opcional)' } = {}) {
  const items = existing.map((a) => ({ att: a, url: '', blob: null })), removed = new Set();
  const el = document.createElement('div');
  el.className = 'fld mph';
  async function draw() {
    await media.ensureURLs(items.filter((i) => i.att && !i.blob).map((i) => i.att.mediaId));
    items.forEach((i) => { if (i.att && !i.blob) i.url = media.urlFor(i.att.mediaId); });
    el.innerHTML = `<span class="fl">${esc(label)}</span>
      ${items.length ? `<div class="mph-grid">${items.map((i, k) => `<button type="button" class="mph-th" data-k="${k}" aria-label="Ver fotografía ${k + 1}"><img src="${esc(i.url)}" alt="">${i.blob ? '<span class="mph-new">Nueva</span>' : ''}</button>`).join('')}</div>` : ''}
      <div class="mph-btns"><label class="btn-secondary">${icon.camera}<span>Tomar fotografía</span><input type="file" accept="image/*" capture="environment" hidden data-add></label>
        <label class="btn-secondary">${icon.image}<span>Seleccionar de Fotos</span><input type="file" accept="image/*" multiple hidden data-add></label></div>`;
  }
  async function toBlobs(files) {
    const out = [];
    for (const f of files) { try { out.push(await compressPhoto(f)); } catch (e) { toast('No se pudo leer una imagen. Prueba con otra foto.', { type: 'warn' }); } }
    return out;
  }
  el.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-add]'); if (!inp) return;
    const files = [...(inp.files || [])]; inp.value = '';
    for (const b of await toBlobs(files)) items.push({ att: null, blob: b, url: URL.createObjectURL(b) });
    draw();
  });
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-k]'); if (!t) return;
    const k = +t.dataset.k, it = items[k];
    const sh = openSheet({ title: `Fotografía ${k + 1}`, body: `<div class="mph-view"><img src="${esc(it.url)}" alt="Fotografía de evidencia"></div>
      <div class="mph-btns"><label class="btn-secondary">${icon.camera}<span>Reemplazar con cámara</span><input type="file" accept="image/*" capture="environment" hidden data-rep></label>
      <label class="btn-secondary">${icon.image}<span>Reemplazar de Fotos</span><input type="file" accept="image/*" hidden data-rep></label></div>
      <button type="button" class="btn-danger block" data-del style="margin-top:10px">${icon.trash}<span>Eliminar fotografía</span></button>` });
    sh.body.addEventListener('change', async (ev) => {
      const inp = ev.target.closest('[data-rep]'); if (!inp) return;
      const [b] = await toBlobs([...(inp.files || [])]); inp.value = '';
      if (!b) return;
      items[k] = { att: it.att, blob: b, url: URL.createObjectURL(b), replace: !!it.att };
      sh.close(); draw(); toast('Fotografía reemplazada; se guarda al guardar el registro', { type: 'info' });
    });
    sh.body.querySelector('[data-del]').addEventListener('click', async () => {
      if (!(await confirmDestructive('¿Eliminar la fotografía?', 'Se quitará al guardar el registro.', 'Eliminar foto'))) return;
      if (it.att) removed.add(it.att.id);
      items.splice(k, 1); sh.close(); draw();
    });
  });
  draw();
  return {
    el,
    count: () => items.length,
    async apply(parentType, parentId, orderId) {
      for (const id of removed) await mt.removePhoto(id);
      for (const i of items) {
        if (i.att && i.replace) await mt.replacePhoto(i.att.id, i.blob);
        else if (!i.att && i.blob) await mt.addPhoto(parentType, parentId, orderId, i.blob);
      }
    },
  };
}

/* Miniaturas de solo lectura (detalle y tablero) */
export async function photoStrip(list) {
  if (!list.length) return '';
  await media.ensureURLs(list.map((a) => a.mediaId));
  return `<div class="mph-grid">${list.map((a, k) => `<button type="button" class="mph-th" data-view-photo="${esc(a.mediaId)}" aria-label="Ver fotografía ${k + 1}"><img src="${esc(media.urlFor(a.mediaId))}" alt=""></button>`).join('')}</div>`;
}
export function viewPhoto(mediaId) {
  const url = media.urlFor(mediaId);
  if (url) openSheet({ title: 'Fotografía', body: `<div class="mph-view"><img src="${esc(url)}" alt="Fotografía de evidencia"></div>` });
}
