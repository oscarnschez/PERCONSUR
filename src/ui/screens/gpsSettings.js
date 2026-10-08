/*
 * Ajustes → GPS (#/ajustes/gps)
 *   Conexión con el intermediario (dirección del Worker y clave PCS_KEY; se guardan solo en este dispositivo)
 *   Vincular cada dispositivo de IOPGPS (IMEI) con su unidad del catálogo (vehicles.gpsDeviceId)
 */
import { screen, on } from '../../core/dom.js';
import { back } from '../../core/router.js';
import * as gps from '../../services/gps.js';
import { listAll, save as saveCatalog } from '../../services/catalogs.js';
import { vehicles as fleetUnits } from '../../services/fuel.js';
import { suggestUnit, freshness, dayHm } from '../../domain/gps/gps.js';
import { esc } from '../../domain/shared/format.js';
import { icon } from '../components/icons.js';
import { openPicker } from '../components/picker.js';
import { toast } from '../components/toast.js';
import { busy } from '../components/sheet.js';

export async function gpsSettingsScreen() {
  let devs = [], loaded = false, loadErr = '';
  const s = screen(`<div class="page gps-set">
    <header class="nav-top"><button type="button" class="nav-back" data-back>${icon.back}<span>Ajustes</span></button></header>
    <h1 class="title">Rastreo GPS</h1>
    <p class="page-lead">Ubicación de las unidades desde IOPGPS en Inicio y Logística, a través del intermediario seguro (Cloudflare Worker).</p>
    <section class="grp"><div class="grp-h"><h3>Conexión</h3></div><div class="grp-b">
      <form data-cfg novalidate>
        <label class="fld"><span class="fl">Dirección del intermediario</span><input class="in" name="url" type="url" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="https://perconsur-gps.….workers.dev" value="${esc(gps.config().url)}" enterkeyhint="next"></label>
        <label class="fld"><span class="fl">Clave de PERCONSUR (PCS_KEY)</span><span class="in-w"><input class="in" name="key" type="password" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(gps.config().key)}" enterkeyhint="done"><button type="button" class="in-act" data-show aria-label="Mostrar clave">${icon.eye}</button></span>
          <span class="fhint">Se guarda solo en este dispositivo y no se incluye en los respaldos. Las credenciales de IOPGPS nunca están en la app.</span></label>
        <p class="gps-st" data-st></p>
        <div class="sheet-acts"><button type="button" class="btn-secondary" data-test>${icon.refresh}<span>Probar</span></button><button type="submit" class="btn-primary">Guardar</button></div>
      </form>
    </div></section>
    <div class="sec-hrow"><h2 class="sec-h">Unidades vinculadas</h2><span class="count" data-n></span></div>
    <div data-devs></div>
  </div>`);
  const root = s.el, form = root.querySelector('[data-cfg]');
  const setSt = (html, cls = '') => { const p = root.querySelector('[data-st]'); p.className = 'gps-st ' + cls; p.innerHTML = html; };
  const unitOfImei = (imei) => listAll('vehicles').find((v) => String(v.gpsDeviceId || '') === String(imei)) || null;

  function drawStatus() {
    if (!gps.configured()) { setSt(`${icon.info}<span>Sin configurar. Escribe la dirección del Worker y la clave, y pulsa Guardar.</span>`); return; }
    const st = gps.status();
    if (st.error && !st.count) setSt(`${icon.alert}<span>${esc(st.error)}</span>`, 'warn');
    else if (st.fetchedAt) setSt(`${icon.check}<span>Conectado · ${st.count} dispositivo${st.count === 1 ? '' : 's'} · consulta ${dayHm(st.fetchedAt)}</span>`, 'ok');
    else setSt(`${icon.refresh}<span>Consultando…</span>`);
  }
  function drawDevs() {
    const box = root.querySelector('[data-devs]'), units = fleetUnits();
    root.querySelector('[data-n]').textContent = loaded ? `${devs.filter((d) => unitOfImei(d.imei)).length}/${devs.length}` : '';
    if (!gps.configured()) { box.innerHTML = '<div class="empty"><p>Primero configura la conexión.</p></div>'; return; }
    if (!loaded) { box.innerHTML = `<div class="empty"><p>${loadErr ? esc(loadErr) : 'Cargando dispositivos de IOPGPS…'}</p>${loadErr ? `<button type="button" class="btn-secondary sm" data-load>${icon.refresh}<span>Reintentar</span></button>` : ''}</div>`; return; }
    if (!devs.length) { box.innerHTML = '<div class="empty"><p>IOPGPS no devolvió dispositivos para esta cuenta.</p></div>'; return; }
    const pending = devs.filter((d) => !unitOfImei(d.imei) && suggestUnit(d.name, units.filter((u) => !(listAll('vehicles').find((v) => v.id === u.id) || {}).gpsDeviceId)));
    box.innerHTML = `${pending.length ? `<button type="button" class="btn-primary block gps-sug" data-suggest>${icon.check}<span>Vincular automáticamente ${pending.length} sugerencia${pending.length === 1 ? '' : 's'}</span></button>` : ''}
      <div class="list">${devs.map((d) => {
    const u = unitOfImei(d.imei), sug = !u ? suggestUnit(d.name, units) : null, f = freshness(d), unitLbl = u ? units.find((x) => x.id === u.id) : null;
    return `<button type="button" class="row gps-dev" data-imei="${esc(d.imei)}"><span class="row-ic${u ? '' : ' off'}">${icon.pin}</span>
          <span class="row-tx"><span class="row-l1"><b>${esc(d.name || 'Sin nombre')}</b>${u ? `<span class="st st-generado">${esc(unitLbl ? unitLbl.label : 'Vinculado')}</span>` : sug ? `<span class="st st-borrador">Sugerido: ${esc(sug.label)}</span>` : '<span class="st">Sin vincular</span>'}</span>
          <span class="row-l2 mono">IMEI ${esc(d.imei)}</span><span class="row-l3">${esc(f.state === 'none' ? 'Sin coordenadas' : f.label)}</span></span><span class="chev">${icon.chev}</span></button>`;
  }).join('')}</div>
      <p class="grp-note">Cada dispositivo de IOPGPS se relaciona por su IMEI con una unidad del catálogo. También puedes capturar el IMEI en Administración → Catálogos → Unidades.</p>`;
  }
  async function load() {
    if (!gps.configured()) { drawDevs(); return; }
    loaded = false; loadErr = ''; drawDevs();
    try { const r = await gps.test(gps.config().url, gps.config().key); devs = r.devices.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true })); loaded = true; }
    catch (e) { loadErr = e.message; }
    drawDevs(); gps.refresh({ force: true });
  }
  async function link(imei, unitId) {
    for (const v of listAll('vehicles')) if (String(v.gpsDeviceId || '') === String(imei) && v.id !== unitId) await saveCatalog('vehicles', { ...v, gpsDeviceId: '', gpsProvider: '' });
    if (unitId) { const v = listAll('vehicles').find((x) => x.id === unitId); if (v) await saveCatalog('vehicles', { ...v, gpsDeviceId: String(imei), gpsProvider: 'iopgps' }); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = form.elements.url.value.trim(), key = form.elements.key.value.trim();
    if (url && !/^https:\/\/[^\s/]+/i.test(url)) { toast('La dirección debe empezar con https://', { type: 'warn' }); return; }
    await gps.saveConfig({ url, key }); toast(url && key ? 'Conexión guardada' : 'GPS desactivado'); drawStatus(); load();
  });
  on(root, 'click', '[data-show]', (e, b) => { const i = form.elements.key; i.type = i.type === 'password' ? 'text' : 'password'; b.classList.toggle('on', i.type === 'text'); });
  on(root, 'click', '[data-test]', async () => {
    const url = form.elements.url.value.trim(), key = form.elements.key.value.trim();
    if (!url || !key) { toast('Escribe la dirección y la clave.', { type: 'warn' }); return; }
    setSt(`${icon.refresh}<span>Probando…</span>`);
    try { const r = await gps.test(url, key); setSt(`${icon.check}<span>Conexión correcta · ${r.count} dispositivo${r.count === 1 ? '' : 's'}, ${r.withFix} con coordenadas. Pulsa Guardar.</span>`, 'ok'); }
    catch (err) { setSt(`${icon.alert}<span>${esc(err.message)}</span>`, 'warn'); }
  });
  on(root, 'click', '[data-load]', () => load());
  on(root, 'click', '[data-suggest]', async () => {
    const units = fleetUnits(); let n = 0;
    busy(true, 'Vinculando unidades…');
    try {
      for (const d of devs) {
        if (unitOfImei(d.imei)) continue;
        const free = units.filter((u) => !(listAll('vehicles').find((v) => v.id === u.id) || {}).gpsDeviceId);
        const u = suggestUnit(d.name, free); if (u) { await link(d.imei, u.id); n++; }
      }
    } finally { busy(false); }
    toast(`${n} unidad${n === 1 ? '' : 'es'} vinculada${n === 1 ? '' : 's'}`); drawDevs();
  });
  on(root, 'click', '[data-imei]', async (e, b) => {
    const d = devs.find((x) => x.imei === b.dataset.imei); if (!d) return;
    const cur = unitOfImei(d.imei), units = fleetUnits(), sug = suggestUnit(d.name, units);
    const r = await openPicker({ title: d.name || 'Dispositivo GPS', allowNew: false, placeholder: 'Buscar unidad o placas', current: cur ? cur.id : '', recents: sug && !cur ? [sug.id] : [],
      items: [{ value: '__none', label: 'Sin vincular', sub: 'Quitar el vínculo de este dispositivo' }, ...units.map((u) => { const v = listAll('vehicles').find((x) => x.id === u.id) || {}; return { value: u.id, label: u.label, sub: [u.placas, v.gpsDeviceId && v.gpsDeviceId !== d.imei ? `Ya tiene GPS (${v.gpsDeviceId})` : ''].filter(Boolean).join(' · ') }; })] });
    if (!r) return;
    await link(d.imei, r.value === '__none' ? null : r.value);
    toast(r.value === '__none' ? 'Vínculo quitado' : `${d.name || d.imei} vinculado`); drawDevs();
  });
  on(root, 'click', '[data-back]', () => back('/ajustes'));
  drawStatus(); drawDevs(); load();
  const un = gps.watch(drawStatus, 60000);
  s.cleanup = un;
  return s;
}
