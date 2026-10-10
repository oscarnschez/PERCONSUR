/*
 * Tarifario (#/tarifario) — tarifas de transporte sencillo (Tolva y Jaula) organizadas por zona.
 * Búsqueda por ciudad de origen (texto, sin acentos) y por planta destino; filtro por zona. Solo lectura: los datos
 * vienen de config/tariffs.js (combinaciones con monto del tarifario de PERCONSUR).
 */
import { screen, on } from '../../core/dom.js';
import { back } from '../../core/router.js';
import { esc } from '../../domain/shared/format.js';
import { money } from '../../domain/operators/money.js';
import { TARIFF_CONFIG } from '../../config/tariffs.js';
import { UNITS, tariffRoutes, zonesOf, destinationsOf, filterRoutes, groupByZone, tariffStats, plantShort } from '../../domain/tariffs/tariffs.js';
import { icon } from '../components/icons.js';

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const UNIT_ICON = { Tolva: 'trTolva', Jaula: 'trJaula' };

function originCard(o) {
  return `<article class="tf-card"><h3 class="tf-o">${esc(o.origin)}</h3>
    <table class="tf-t"><thead><tr><th scope="col">Planta destino</th>${UNITS.map((u) => `<th scope="col" class="r"><span class="tf-u">${icon[UNIT_ICON[u]]}${u}</span></th>`).join('')}</tr></thead>
    <tbody>${o.routes.map((r) => `<tr><td>${esc(plantShort(r.dest))}</td>${UNITS.map((u) => `<td class="r">${r.rates[u] != null ? money(r.rates[u]) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></article>`;
}

export function tariffsScreen() {
  const all = tariffRoutes(), zones = zonesOf(all), plants = destinationsOf(all), st = tariffStats(all);
  let zone = '', dest = '', origin = '';
  const s = screen(`<div class="page wide tf-page">
    <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Administración</span></button></header>
    <h1 class="title">Tarifario</h1>
    <p class="page-lead">Tarifas por zona, ciudad de origen y planta destino. Configuración de transporte <b>${esc(TARIFF_CONFIG.toLowerCase())}</b> (Tolva y Jaula); importes en pesos (MXN).</p>
    <div class="tiles tf-tiles">
      <div class="tile"><small>Rutas</small><b>${st.routes}</b></div>
      <div class="tile"><small>Orígenes</small><b>${st.origins}</b></div>
      <div class="tile"><small>Zonas</small><b>${st.zones}</b></div>
    </div>
    <label class="search"><span class="search-ic">${icon.search}</span><input type="search" class="search-in" data-origin placeholder="Buscar ciudad de origen" aria-label="Buscar por ciudad de origen" autocomplete="off" autocorrect="off" enterkeyhint="search"></label>
    <div class="chips filters" role="group" aria-label="Planta destino"><button type="button" class="chip" data-dest="">Todas las plantas</button>${plants.map((p) => `<button type="button" class="chip" data-dest="${esc(p)}">${icon.building}${esc(plantShort(p))}</button>`).join('')}</div>
    <div class="chips filters" role="group" aria-label="Zona"><button type="button" class="chip" data-zone="">Todas las zonas</button>${zones.map((z) => `<button type="button" class="chip" data-zone="${esc(z)}">${esc(z)}</button>`).join('')}</div>
    <div data-list></div>
    <p class="grp-note center">Solo se incluyen las combinaciones del tarifario que tienen monto, todas en configuración sencilla.</p>
  </div>`);
  const root = s.el, listEl = root.querySelector('[data-list]');

  function draw() {
    const list = filterRoutes(all, { zone, origin, dest });
    root.querySelectorAll('[data-zone]').forEach((b) => { const on1 = b.dataset.zone === zone; b.classList.toggle('on', on1); b.setAttribute('aria-pressed', on1); });
    root.querySelectorAll('[data-dest]').forEach((b) => { const on1 = b.dataset.dest === dest; b.classList.toggle('on', on1); b.setAttribute('aria-pressed', on1); });
    const filtered = zone || dest || origin;
    if (!list.length) {
      listEl.innerHTML = `<div class="empty"><p><b class="empty-t">Sin tarifas</b>No hay rutas con ese origen${dest ? ` hacia ${esc(plantShort(dest))}` : ''}${zone ? ` en ${esc(zone)}` : ''}.</p><button type="button" class="btn-secondary sm" data-clear>Quitar filtros</button></div>`;
      return;
    }
    const groups = groupByZone(list, all);
    listEl.innerHTML = `${filtered ? `<p class="tf-count" role="status">${plural(list.length, 'ruta encontrada', 'rutas encontradas')}</p>` : ''}
      ${groups.map((g) => `<section class="tf-zone" data-zone-sec="${esc(g.zone)}">
        <div class="sec-hrow"><h2 class="sec-h">${esc(g.zone)}</h2><small class="tf-n">${plural(g.origins.length, 'origen', 'orígenes')} · ${plural(g.routes.length, 'ruta', 'rutas')}</small></div>
        <div class="tf-grid">${g.origins.map(originCard).join('')}</div>
      </section>`).join('')}`;
  }

  on(root, 'click', '[data-back]', () => back('/administracion'));
  on(root, 'click', '[data-zone]', (e, b) => { zone = b.dataset.zone; draw(); });
  on(root, 'click', '[data-dest]', (e, b) => { dest = b.dataset.dest; draw(); });
  on(root, 'click', '[data-clear]', () => { zone = ''; dest = ''; origin = ''; root.querySelector('[data-origin]').value = ''; draw(); });
  root.querySelector('[data-origin]').addEventListener('input', (e) => { origin = e.target.value.trim(); draw(); });
  draw();
  return s;
}
