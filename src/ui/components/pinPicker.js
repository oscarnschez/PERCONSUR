/*
 * Selector de ubicación: se mueve el mapa bajo la mira fija del centro (cómodo con el dedo en iPhone), o se busca
 * un lugar, o se pegan coordenadas o un link largo de Google Maps. Devuelve { lat, lng }, 'clear' (quitar el punto
 * fijado) o null (cancelado).
 *   pickPoint({ title, name, address, start: {lat,lng}|null, zoom, canClear, ref: {lat,lng,label}|null })
 *   ref: punto de referencia que se muestra sin moverse (p. ej. la unidad)
 */
import { openSheet } from './sheet.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { loadLib } from '../../services/libs.js';
import { findPlace, locate } from '../../services/geocode.js';
import { coordsIn } from '../../domain/gps/geo.js';
import { esc } from '../../domain/shared/format.js';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
/* Sin ningún dato: puerto de Manzanillo */
export const DEFAULT_CENTER = { lat: 19.0606, lng: -104.2986 };

function ensureCss() {
  if (document.querySelector('link[data-leaflet]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = './vendor/leaflet/leaflet.css'; l.dataset.leaflet = '1';
  document.head.appendChild(l);
}

export function pickPoint({ title = 'Ubicar en el mapa', name = '', address = '', start = null, zoom = 16, canClear = false, ref = null } = {}) {
  return new Promise((resolve) => {
    let result = null, map = null;
    const sh = openSheet({
      title, full: true, className: 'pp-sheet',
      body: `<div class="pp">
        ${name || address ? `<p class="pp-what">${name ? `<b>${esc(name)}</b>` : ''}${address ? `<span>${esc(address)}</span>` : ''}</p>` : ''}
        <form class="pp-find" data-find novalidate><label class="search"><span class="search-ic">${icon.search}</span><input class="search-in" name="q" type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" placeholder="Buscar lugar, o pegar coordenadas o link de Google Maps"></label></form>
        <div class="pp-mapwrap"><div class="pp-map" data-map></div><span class="pp-cross" aria-hidden="true">${icon.pin}</span></div>
        <p class="pp-hint">Mueve el mapa hasta que la mira quede sobre la entrada del lugar.</p>
        <div class="sheet-acts">${canClear ? '<button type="button" class="btn-secondary" data-clear>Quitar punto fijado</button>' : '<button type="button" class="btn-secondary" data-cancel>Cancelar</button>'}<button type="button" class="btn-primary" data-ok>Usar esta ubicación</button></div>
      </div>`,
      onClose: () => { if (map) map.remove(); resolve(result); },
    });
    const root = sh.body, mapEl = root.querySelector('[data-map]');
    const go = (p, z) => { if (map && p) map.setView([p.lat, p.lng], z || Math.max(map.getZoom(), 16)); };
    (async () => {
      try {
        ensureCss(); await loadLib('leaflet');
        const L = window.L;
        let c = start, z = zoom;
        if (!c && address) { try { const g = await locate(address); if (g) { c = g; z = g.precision === 'city' ? 12 : g.precision === 'area' ? 14 : 17; } } catch (e) { /* sin conexión */ } }
        if (!c && ref) { c = ref; z = 13; }
        if (!c) { c = DEFAULT_CENTER; z = 12; }
        map = L.map(mapEl, { zoomControl: true, attributionControl: true, tap: true }).setView([c.lat, c.lng], z);
        L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIB, crossOrigin: true }).addTo(map);
        if (ref && Number.isFinite(ref.lat)) L.marker([ref.lat, ref.lng], { keyboard: false, interactive: false, icon: L.divIcon({ className: 'gps-pin-wrap', iconSize: null, iconAnchor: [0, 0], html: `<div class="gps-pin lg-t-blue"><span class="gps-pin-dot"></span><b>${esc(ref.label || 'Unidad')}</b></div>` }) }).addTo(map);
        setTimeout(() => map && map.invalidateSize(), 260);
      } catch (e) { mapEl.classList.add('empty'); mapEl.textContent = 'No se pudo cargar el mapa. Revisa la conexión o pega coordenadas.'; }
    })();
    root.querySelector('[data-find]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = e.target.elements.q, q = inp.value.trim();
      if (!q) return;
      inp.blur();
      const direct = coordsIn(q);
      if (direct) { go(direct, 17); return; }
      if (/maps\.app\.goo\.gl|goo\.gl\//i.test(q)) { toast('Ese link corto de Google Maps no trae coordenadas. En Google Maps mantén presionado el lugar y copia las coordenadas que aparecen.', { type: 'warn', ms: 6500 }); return; }
      try { const r = await findPlace(q); if (r) go(r, 16); else toast('No se encontró ese lugar. Prueba con la colonia, el municipio o mueve el mapa a mano.', { type: 'warn', ms: 4500 }); }
      catch (err) { toast('Sin conexión con el buscador de direcciones.', { type: 'warn' }); }
    });
    root.querySelector('[data-ok]').addEventListener('click', () => {
      if (!map) { toast('El mapa no está disponible; pega coordenadas en el buscador.', { type: 'warn' }); return; }
      const c = map.getCenter(); result = { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) }; sh.close();
    });
    const cl = root.querySelector('[data-clear]'); if (cl) cl.addEventListener('click', () => { result = 'clear'; sh.close(); });
    const ca = root.querySelector('[data-cancel]'); if (ca) ca.addEventListener('click', () => sh.close());
  });
}
