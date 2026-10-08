/*
 * Detalle de la unidad → «Ubicación en tiempo real».
 * Mapa con el marcador de la unidad, botón para centrarla, estado de Logística arriba del mapa y, debajo, latitud,
 * longitud, última actualización, velocidad, motor y dirección solo si IOPGPS los entrega.
 * Se actualiza cada 30 s con la pantalla visible. Si el GPS falla, solo esta sección lo indica.
 */
import * as gps from '../../services/gps.js';
import { freshness, hasFix, ageText, dayHm, speedText, coordText, mapsLink } from '../../domain/gps/gps.js';
import { trackURL, esc } from '../../domain/shared/format.js';
import { icon } from '../components/icons.js';
import { mountMap } from '../components/gpsMap.js';

/* opts: { vehicleId, label, status: () => ({ key, tone, chip }) } → { el, refresh(), resize(), destroy() } */
export function createGpsPanel({ vehicleId, label, status }) {
  const el = document.createElement('div');
  el.className = 'gps-slot';
  let map = null, mounting = false, destroyed = false, unwatch = null, untick = null;
  const imei = () => (gps.configured() ? gps.imeiOf(vehicleId) : '');
  const track = () => trackURL(gps.trackingUrlOf(vehicleId));

  function skeleton() {
    el.innerHTML = `<section class="grp gps"><div class="grp-h"><h3>Ubicación en tiempo real</h3><span class="gps-live" data-g-live></span></div>
      <div class="gps-card">
        <div class="gps-top"><span data-g-status></span><span class="gps-fresh" data-g-fresh></span></div>
        <div class="gps-mapwrap"><div class="gps-map" data-g-map></div>
          <button type="button" class="gps-center" data-g-center aria-label="Centrar la unidad en el mapa">${icon.pin}<span>Centrar</span></button>
          <div class="gps-msg" data-g-msg hidden></div></div>
        <dl class="sumlist gps-data" data-g-data></dl>
        <div class="gps-acts" data-g-acts></div>
      </div></section>`;
    el.querySelector('[data-g-center]').addEventListener('click', () => { if (map) map.recenter(); });
  }
  function small(html) { el.innerHTML = `<section class="grp gps"><div class="grp-h"><h3>Ubicación GPS</h3></div><div class="gps-mini">${html}</div></section>`; }

  function render() {
    if (destroyed) return;
    const id = imei(), t = track();
    if (!id) {
      if (!gps.configured() && !t) { el.innerHTML = ''; return; }
      small(`${!gps.configured() ? '' : `<p>${icon.info}<span>Esta unidad no tiene un GPS vinculado. Vincúlalo en <a href="#/ajustes/gps">Ajustes → GPS</a>.</span></p>`}
        ${t ? `<a class="btn-secondary block" href="${esc(t)}" target="_blank" rel="noopener">${icon.pin}<span>Abrir rastreo GPS</span></a>` : ''}`);
      return;
    }
    if (!el.querySelector('[data-g-map]')) skeleton();
    const st = status(), p = gps.bestOf(id), f = freshness(p), s = gps.status();
    el.querySelector('[data-g-status]').innerHTML = st.chip;
    const fr = el.querySelector('[data-g-fresh]');
    fr.className = `gps-fresh ${f.state}`;
    fr.innerHTML = f.state === 'live' ? `<i aria-hidden="true"></i><span data-gps-ts="${f.since}" data-gps-prefix="Actualizado ">Actualizado ${esc(ageText(f.since))}</span>` : `${f.state === 'none' ? '' : icon.alert}<span>${esc(f.label)}</span>`;
    el.querySelector('[data-g-live]').textContent = s.fetchedAt ? `Consulta: ${dayHm(s.fetchedAt)}` : '';
    const msg = el.querySelector('[data-g-msg]'), mapEl = el.querySelector('[data-g-map]');
    if (!hasFix(p)) {
      msg.hidden = false;
      msg.innerHTML = `${icon.cloudOff}<b>Ubicación GPS no disponible</b><small>${esc(s.error || (s.fetchedAt ? 'IOPGPS no reportó coordenadas para este equipo.' : 'Consultando…'))}</small>`;
      mapEl.classList.add('empty');
    } else {
      msg.hidden = true; mapEl.classList.remove('empty');
      const opts = { label, tone: st.tone, stale: f.state === 'stale' };
      if (map) map.update(p.lat, p.lng, opts);
      else if (!mounting) {
        mounting = true;
        mountMap(mapEl, { lat: p.lat, lng: p.lng, ...opts }).then((m) => { if (destroyed) { m.destroy(); return; } map = m; setTimeout(() => m.resize(), 60); })
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
    el.querySelector('[data-g-acts]').innerHTML = [hasFix(p) ? `<a class="btn-secondary" href="${esc(mapsLink(p))}" target="_blank" rel="noopener">${icon.pin}<span>Abrir en Google Maps</span></a>` : '', t ? `<a class="btn-secondary" href="${esc(t)}" target="_blank" rel="noopener">${icon.eye}<span>Abrir rastreo</span></a>` : ''].join('');
  }

  function start() {
    unwatch = gps.watch(() => { render(); const id = imei(); if (id) gps.detail(id); }, 30000);
    untick = gps.tickAges(el);
    const id = imei(); if (id) gps.detail(id).then(render);
    render();
  }
  start();
  return {
    el,
    refresh: render,
    resize() { if (map) setTimeout(() => map.resize(), 30); },
    destroy() { destroyed = true; if (unwatch) unwatch(); if (untick) untick(); if (map) map.destroy(); map = null; },
  };
}
