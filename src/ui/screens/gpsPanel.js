/*
 * Detalle de la unidad → «Ubicación en tiempo real».
 * Mapa con el marcador de la unidad, botón para centrarla, estado de Logística arriba del mapa y, debajo, latitud,
 * longitud, última actualización, velocidad, motor y dirección solo si IOPGPS los entrega.
 * Destino: el lugar de entrega, la terminal, la planta o el patio (services/destinations.js) se marca en el mapa con una
 * línea punteada desde la unidad, su distancia en línea recta, «Cómo llegar» y «Ajustar destino en el mapa».
 * Se actualiza cada 30 s con la pantalla visible. Si el GPS falla, solo esta sección lo indica.
 */
import * as gps from '../../services/gps.js';
import { freshness, hasFix, ageText, dayHm, speedText, coordText, mapsLink } from '../../domain/gps/gps.js';
import { distanceKm, distanceText, directionsLink, precisionLabel, isApprox } from '../../domain/gps/geo.js';
import { onTargetsChange } from '../../services/destinations.js';
import { adjustTarget } from './destinationEdit.js';
import { trackURL, esc } from '../../domain/shared/format.js';
import { icon } from '../components/icons.js';
import { mountMap } from '../components/gpsMap.js';

/* Texto del estado del destino cuando todavía no hay punto en el mapa */
const TARGET_STATE = {
  searching: 'Buscando la dirección en el mapa…',
  notfound: 'No se encontró la dirección en el mapa. Ubícala a mano.',
  offline: 'Sin conexión con el buscador de direcciones.',
  noaddress: 'Sin dirección registrada.',
  missing: 'Asigna el patio en Control de vacíos.',
};
const CATALOG_PATH = { terminals: 'Terminales portuarias', yards: 'Patios de vacíos', plants: 'Plantas', places: 'Destinos' };
export function targetStateText(t) {
  if (t.state === 'noaddress' && t.catalog) return t.rec ? `Sin dirección. Agrégala en Catálogos → ${CATALOG_PATH[t.catalog]} o ubícala en el mapa.` : `«${t.name}» no está en Catálogos → ${CATALOG_PATH[t.catalog]}.`;
  return TARGET_STATE[t.state] || '';
}

/* opts: { vehicleId, label, status: () => ({ key, tone, chip }), target: () => destino|null|undefined } → { el, refresh(), resize(), destroy() } */
export function createGpsPanel({ vehicleId, label, status, target = () => null }) {
  const el = document.createElement('div');
  el.className = 'gps-slot';
  let map = null, mounting = false, destroyed = false, unwatch = null, untick = null, ungeo = null;
  const imei = () => (gps.configured() ? gps.imeiOf(vehicleId) : '');
  const track = () => trackURL(gps.trackingUrlOf(vehicleId));

  function skeleton() {
    el.innerHTML = `<section class="grp gps"><div class="grp-h"><h3>Ubicación en tiempo real</h3><span class="gps-live" data-g-live></span></div>
      <div class="gps-card">
        <div class="gps-top"><span data-g-status></span><span class="gps-fresh" data-g-fresh></span></div>
        <div class="gps-mapwrap"><div class="gps-map" data-g-map></div>
          <button type="button" class="gps-center" data-g-center aria-label="Centrar la unidad en el mapa">${icon.pin}<span>Centrar</span></button>
          <div class="gps-msg" data-g-msg hidden></div></div>
        <div class="gps-dest" data-g-dest hidden></div>
        <dl class="sumlist gps-data" data-g-data></dl>
        <div class="gps-acts" data-g-acts></div>
      </div></section>`;
    el.querySelector('[data-g-center]').addEventListener('click', () => { if (map) map.recenter(); });
    el.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-g-adjust]')) return;
      const t = target(), p = gps.bestOf(imei());
      if (t && t.edit) { await adjustTarget(t, hasFix(p) ? { lat: p.lat, lng: p.lng, label } : null); render(); }
    });
  }
  function small(html) { el.innerHTML = `<section class="grp gps"><div class="grp-h"><h3>Ubicación GPS</h3></div><div class="gps-mini">${html}</div></section>`; }

  function render() {
    if (destroyed) return;
    const id = imei(), tr = track();
    if (!id) {
      if (!gps.configured() && !tr) { el.innerHTML = ''; return; }
      small(`${!gps.configured() ? '' : `<p>${icon.info}<span>Esta unidad no tiene un GPS vinculado. Vincúlalo en <a href="#/ajustes/gps">Ajustes → GPS</a>.</span></p>`}
        ${tr ? `<a class="btn-secondary block" href="${esc(tr)}" target="_blank" rel="noopener">${icon.pin}<span>Abrir rastreo GPS</span></a>` : ''}`);
      return;
    }
    if (!el.querySelector('[data-g-map]')) skeleton();
    const st = status(), p = gps.bestOf(id), f = freshness(p), s = gps.status(), t = target();
    const tgtPoint = t && t.loc ? { lat: t.loc.lat, lng: t.loc.lng, label: t.title, kind: t.kind, approx: isApprox(t.loc.precision) } : null;
    const km = t && t.loc && hasFix(p) ? distanceKm(p, t.loc) : null;
    const dEl = el.querySelector('[data-g-dest]');
    dEl.hidden = !t;
    if (t) {
      const note = t.loc ? [precisionLabel(t.loc.precision), km != null ? `${distanceText(km)} en línea recta` : ''].filter(Boolean).join(' · ') : targetStateText(t);
      dEl.className = `gps-dest${t.loc && isApprox(t.loc.precision) ? ' approx' : ''}${t.loc ? '' : ' none'}`;
      dEl.innerHTML = `<span class="gps-dest-ic">${icon[{ plant: 'building', terminal: 'container', yard: 'yard' }[t.kind] || 'flag']}</span>
        <span class="gps-dest-tx"><small>${esc(t.title)} · ${esc(t.source)}</small><b>${esc(t.name)}</b>${t.address && t.address !== t.name ? `<span>${esc(t.address.replace(/\s*\n\s*/g, ', '))}</span>` : ''}
        <em>${esc(note)}</em></span>`;
    }
    el.querySelector('[data-g-status]').innerHTML = st.chip;
    const fr = el.querySelector('[data-g-fresh]');
    fr.className = `gps-fresh ${f.state}`;
    fr.innerHTML = f.state === 'live' ? `<i aria-hidden="true"></i><span data-gps-ts="${Number(f.since) || 0}" data-gps-prefix="Actualizado ">Actualizado ${esc(ageText(f.since))}</span>` : `${f.state === 'none' ? '' : icon.alert}<span>${esc(f.label)}</span>`;
    el.querySelector('[data-g-live]').textContent = s.fetchedAt ? `Consulta: ${dayHm(s.fetchedAt)}` : '';
    const msg = el.querySelector('[data-g-msg]'), mapEl = el.querySelector('[data-g-map]');
    if (!hasFix(p)) {
      msg.hidden = false;
      msg.innerHTML = `${icon.cloudOff}<b>Ubicación GPS no disponible</b><small>${esc(s.error || (s.fetchedAt ? 'IOPGPS no reportó coordenadas para este equipo.' : 'Consultando…'))}</small>`;
      mapEl.classList.add('empty');
    } else {
      msg.hidden = true; mapEl.classList.remove('empty');
      const opts = { label, tone: st.tone, stale: f.state === 'stale' };
      if (map) { map.update(p.lat, p.lng, opts); map.setTarget(tgtPoint); }
      else if (!mounting) {
        mounting = true;
        mountMap(mapEl, { lat: p.lat, lng: p.lng, ...opts }).then((m) => { if (destroyed) { m.destroy(); return; } map = m; m.setTarget(tgtPoint); setTimeout(() => m.resize(), 60); })
          .catch(() => { msg.hidden = false; msg.innerHTML = `${icon.cloudOff}<b>No se pudo cargar el mapa</b><small>Revisa la conexión. Los datos de ubicación siguen abajo.</small>`; })
          .finally(() => { mounting = false; });
      }
    }
    const rows = [];
    if (hasFix(p)) { rows.push(['Latitud', coordText(p.lat)], ['Longitud', coordText(p.lng)]); }
    if (p && p.gpsTime) rows.push(['Última actualización GPS', `${dayHm(p.gpsTime)} · ${ageText(p.gpsTime)}`]);
    if (p && p.signalTime && (!p.gpsTime || Math.abs(p.signalTime - p.gpsTime) > 60000)) rows.push(['Última señal del equipo', `${dayHm(p.signalTime)} · ${ageText(p.signalTime)}`]);
    if (speedText(p)) rows.push(['Velocidad', speedText(p)]);
    if (p && typeof p.acc === 'boolean') rows.push(['Motor', p.acc ? 'Encendido' : 'Apagado']);
    if (p && p.address) rows.push(['Dirección aproximada', p.address]);
    el.querySelector('[data-g-data]').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    el.querySelector('[data-g-acts]').innerHTML = [
      hasFix(p) ? `<a class="btn-secondary" href="${esc(mapsLink(p))}" target="_blank" rel="noopener">${icon.pin}<span>Abrir en Google Maps</span></a>` : '',
      t && t.loc ? `<a class="btn-secondary" href="${esc(directionsLink(hasFix(p) ? p : null, t.loc))}" target="_blank" rel="noopener">${icon.route}<span>Cómo llegar</span></a>` : '',
      tr ? `<a class="btn-secondary" href="${esc(tr)}" target="_blank" rel="noopener">${icon.eye}<span>Abrir rastreo</span></a>` : '',
      t && t.edit ? `<button type="button" class="btn-secondary" data-g-adjust>${icon.crosshair}<span>${t.loc ? 'Ajustar destino' : 'Ubicar destino'}</span></button>` : '',
      `<a class="btn-secondary" href="#/operacion/logistica/monitoreo?u=${encodeURIComponent(vehicleId)}">${icon.map}<span>Ver en Monitoreo GPS</span></a>`,
    ].join('');
  }

  function start() {
    unwatch = gps.watch(() => { render(); const id = imei(); if (id) gps.detail(id); }, 30000);
    untick = gps.tickAges(el);
    ungeo = onTargetsChange(render);
    const id = imei(); if (id) gps.detail(id).then(render);
    render();
  }
  start();
  return {
    el,
    refresh: render,
    resize() { setTimeout(() => { if (map) map.resize(); }, 30); },
    destroy() { destroyed = true; if (unwatch) unwatch(); if (untick) untick(); if (ungeo) ungeo(); if (map) map.destroy(); map = null; },
  };
}
