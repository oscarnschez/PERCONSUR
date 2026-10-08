/*
 * Mapa de la ubicación GPS (Leaflet, incluido en /vendor/leaflet). Se carga solo al abrir el detalle de una unidad.
 * Mapa base: OpenStreetMap (uso ligero con atribución). El marcador muestra la unidad con el color de su estado de Logística.
 */
import { loadLib } from '../../services/libs.js';
import { esc } from '../../domain/shared/format.js';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

function ensureCss() {
  if (document.querySelector('link[data-leaflet]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = './vendor/leaflet/leaflet.css'; l.dataset.leaflet = '1';
  document.head.appendChild(l);
}
const pinIcon = (L, label, tone, stale) => L.divIcon({
  className: 'gps-pin-wrap', iconSize: null, iconAnchor: [0, 0],
  html: `<div class="gps-pin lg-t-${esc(tone)}${stale ? ' stale' : ''}"><span class="gps-pin-dot"></span><b>${esc(label)}</b></div>`,
});

/* Crea el mapa dentro de el; devuelve { update(lat, lng, opts), recenter(), resize(), destroy() } */
export async function mountMap(el, { lat, lng, label, tone = 'blue', stale = false, zoom = 13 }) {
  ensureCss();
  await loadLib('leaflet');
  const L = window.L;
  const map = L.map(el, { zoomControl: true, attributionControl: true, tap: true, scrollWheelZoom: false }).setView([lat, lng], zoom);
  L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIB, crossOrigin: true }).addTo(map);
  const marker = L.marker([lat, lng], { icon: pinIcon(L, label, tone, stale), keyboard: false }).addTo(map);
  let follow = true;
  map.on('dragstart', () => { follow = false; });
  return {
    update(nlat, nlng, opts = {}) {
      marker.setLatLng([nlat, nlng]);
      if (opts.label !== undefined || opts.tone !== undefined || opts.stale !== undefined) marker.setIcon(pinIcon(L, opts.label ?? label, opts.tone ?? tone, !!opts.stale));
      if (follow) map.panTo([nlat, nlng], { animate: true });
    },
    recenter() { follow = true; map.setView(marker.getLatLng(), Math.max(map.getZoom(), zoom), { animate: true }); },
    resize() { map.invalidateSize(); },
    destroy() { map.remove(); },
  };
}
