/*
 * Taller — formularios en hojas inferiores (iPhone primero): registrar mantenimiento (equipo → datos), editar,
 * cambiar estado y finalizar, trabajos, intervención por componente (desde el diagrama), fallas, cambio de aceite,
 * llantas e intervalos por equipo. Toda validación de datos vive también en el servicio (services/maintenance.js).
 */
import { go } from '../../core/router.js';
import { esc } from '../../domain/shared/format.js';
import * as mt from '../../services/maintenance.js';
import { save as saveCatalog, listAll, TRAILER_TYPES } from '../../services/catalogs.js';
import { statusLabel } from '../../config/logistics.js';
import {
  ORDER_TYPES, ORDER_STATUSES, SEVERITIES, DIAGRAM_ACTIONS, ACTIONS, WORK_TYPES, WORK_STATUSES, TIRE_REASONS, ODOMETER_FIXES,
  isOpenStatus, orderStatusOf, severityLabel, actionLabel, systemsOf, kindLabel,
} from '../../domain/maintenance/catalog.js';
import {
  toTs, splitTs, fmtDT, fmtD, durationText, parseKm, parseCount, kmText, nf, odometerCheck, readingAge, TIRE_LAYOUTS, layoutsFor, positionsOf,
  componentStates, STATE_LABELS, equipmentKey, pendingPositions,
} from '../../domain/maintenance/maintenance.js';
import { icon } from '../components/icons.js';
import { openSheet, actionSheet, confirmDestructive } from '../components/sheet.js';
import { openPicker } from '../components/picker.js';
import { toast } from '../components/toast.js';
import { photoField, tirePicker, sevChip, stateChip, statusChip, orderHref } from './workshopKit.js';

const opt = (list, cur) => list.map((x) => { const [k, l] = Array.isArray(x) ? x : [x.key, x.label]; return `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
const sel = (name, list, cur, label) => `<label class="fld" data-f="${name}"><span class="fl">${esc(label)}</span><span class="sel-w"><select class="in" name="${name}">${opt(list, cur)}</select><span class="sel-ic">${icon.down}</span></span><span class="ferr"></span></label>`;
const dt2 = (prefix, label, ts) => { const p = splitTs(ts); return `<div class="row2" data-f="${prefix}"><label class="fld"><span class="fl">${esc(label)}</span><input class="in" type="date" name="${prefix}Date" value="${esc(p.date)}"></label><label class="fld"><span class="fl">Hora</span><input class="in" type="time" name="${prefix}Time" value="${esc(p.time)}"></label></div><span class="ferr" data-err="${prefix}"></span>`; };
const segH = (name, list, cur, swatch = false) => `<div class="seg wrap" data-seg="${name}">${list.map(([k, l]) => `<button type="button" class="seg-b${k === cur ? ' on' : ''}" data-v="${esc(k)}">${swatch && k ? `<span class="sw-i" style="background:${{ leve: '#FACC15', moderado: '#F97316', total: '#DC2626', reemplazado: '#2563EB' }[k] || '#C4CAD4'}"></span>` : ''}${esc(l)}</button>`).join('')}</div>`;
function bindSegs(form, state) {
  form.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    state[g.dataset.seg] = b.dataset.v;
    g.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b));
    form.dispatchEvent(new Event('input'));
  }));
}
function failer(form) {
  return (name, msg) => {
    const f = form.querySelector(`[data-f="${name}"]`);
    if (f) { f.classList.add('has-err'); const m = f.querySelector('.ferr') || form.querySelector(`[data-err="${name}"]`); if (m) m.textContent = msg; f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    toast(msg, { type: 'warn', ms: 3800 });
    return false;
  };
}
function clearErr(form) { form.addEventListener('input', (e) => { const f = e.target.closest && e.target.closest('.fld,[data-f]'); if (f) { f.classList.remove('has-err'); const m = f.querySelector('.ferr'); if (m) m.textContent = ''; } }); }
const eqWho = (eq) => `<div class="op-who"><span class="unit-badge">${esc(eq.type === 'vehicle' ? eq.label : eq.label.slice(0, 8))}</span><div><small>${esc(eq.type === 'vehicle' ? 'Tractocamión' : eq.kindLabel)}</small><b>${esc(eq.type === 'vehicle' ? eq.placas || 'Sin placas' : eq.sub || eq.label)}</b></div></div>`;

/* ===== Elegir equipo (catálogo; sin duplicar) ===== */
export async function chooseEquipment(type = null) {
  await mt.loadMaintenance();
  if (!type) {
    type = await actionSheet({ title: 'Tipo de equipo', actions: [{ label: 'Tractocamión', value: 'vehicle', style: 'primary' }, { label: 'Remolque', value: 'trailer' }] });
    if (!type) return null;
  }
  const list = type === 'vehicle' ? mt.vehicles() : mt.trailers();
  if (!list.length) { toast(type === 'vehicle' ? 'No hay unidades en el catálogo. Agrégalas en Administración → Catálogos.' : 'No hay remolques en el catálogo. Agrégalos en Administración → Catálogos.', { type: 'info', ms: 4200 }); return null; }
  const r = await openPicker({
    title: type === 'vehicle' ? 'Tractocamión' : 'Remolque', allowNew: false, placeholder: type === 'vehicle' ? 'Buscar unidad o placas' : 'Buscar placas o tipo',
    items: list.map((e) => { const av = mt.availability(e.key); return { value: e.id, label: e.label, sub: [e.sub, av.inShop ? 'En taller' : ''].filter(Boolean).join(' · ') }; }),
  });
  if (!r) return null;
  let eq = mt.equipmentOf(type, r.value);
  if (eq && eq.type === 'trailer' && !eq.kind) eq = await classifyTrailer(eq);
  return eq;
}
/* Remolque sin clasificar: se pide su tipo (se guarda en el catálogo, que es donde vive la clasificación) */
async function classifyTrailer(eq) {
  const t = await actionSheet({ title: `Clasificar el remolque ${eq.label}`, message: 'El diagrama y los componentes dependen del tipo de remolque. Se guardará en el catálogo.', actions: TRAILER_TYPES.map(([k, l]) => ({ label: l, value: k })) });
  if (!t) return null;
  const cur = listAll('trailers').find((x) => x.id === eq.id);
  await saveCatalog('trailers', { ...cur, type: t });
  toast(`${eq.label} clasificado como ${kindLabel(t)}`);
  return mt.equipmentOf('trailer', eq.id);
}

/* ===== Registrar mantenimiento ===== */
export async function startOrder({ type = null, id = null, issue = null } = {}) {
  await mt.loadMaintenance();
  let eq = id ? mt.equipmentOf(type, id) : null;
  if (eq && eq.type === 'trailer' && !eq.kind) eq = await classifyTrailer(eq);
  if (!eq) eq = await chooseEquipment(type);
  if (!eq) return;
  openOrderForm({ eq, issue });
}

/* Lectura de odómetro sugerida y aviso si está desactualizada (nunca se inventan kilómetros) */
function odoHint(eq, inAt, excludeOrder) {
  if (eq.type !== 'vehicle') return { html: '', reading: null };
  const r = mt.lastOdometer(eq.id, { beforeTs: Number.isFinite(inAt) ? inAt : Infinity, excludeOrder });
  if (!r) return { html: 'Sin odómetro conocido para esta unidad (ni en Combustible ni en Taller). Escríbelo del tablero o del GPS.', reading: null };
  const age = readingAge(r);
  return { reading: r, stale: age.stale, html: `Último odómetro conocido: <b>${esc(kmText(r.km))}</b> · ${esc(mt.SOURCE_TEXT[r.source] || r.source)} · ${esc(fmtD(r.ts))} (${esc(age.text)})${age.stale ? ' · <b>dato desactualizado</b>: confirma el kilometraje real' : ''} <button type="button" class="link-btn" data-useodo>Usar este dato</button>` };
}

export function openOrderForm({ eq, order = null, issue = null, onSaved = null }) {
  const editing = !!order, o = order || {};
  const now = Date.now();
  const form = document.createElement('form');
  form.className = 'op-form'; form.noValidate = true;
  const status0 = o.status || 'pendiente';
  form.innerHTML = `${eqWho(eq)}
    ${editing ? `<p class="grp-note">Folio <b>${esc(o.folio)}</b> · el equipo de una orden no cambia (si se eligió otro, elimina la orden y regístrala de nuevo).</p>` : ''}
    ${dt2('in', 'Ingreso al taller', o.inAt || now)}
    ${eq.type === 'vehicle' ? `<label class="fld" data-f="odometer"><span class="fl">Kilometraje al momento del servicio (km)</span><input class="in" name="odometer" inputmode="numeric" autocomplete="off" placeholder="Ej. 152,340" value="${o.odometer != null ? esc(nf(o.odometer)) : ''}" enterkeyhint="next"><span class="fhint" data-odo></span><span class="ferr"></span></label>
    <div class="fld" data-fix hidden><span class="fl">Corrección de odómetro documentada</span><span class="sel-w"><select class="in" name="fixReason"><option value="">Elige el motivo…</option>${opt(ODOMETER_FIXES, (o.odometerFix || {}).reason)}</select><span class="sel-ic">${icon.down}</span></span>
      <input class="in" name="fixText" placeholder="Detalle de la corrección" value="${esc((o.odometerFix || {}).reasonText || '')}" style="margin-top:8px"><span class="fhint">El kilometraje es menor que el último conocido. No se bloquea: queda documentado en la orden y su bitácora.</span></div>` : ''}
    ${sel('type', ORDER_TYPES, o.type || (issue ? 'correctivo' : 'preventivo'), 'Tipo de mantenimiento')}
    ${sel('status', ORDER_STATUSES, status0, 'Estado')}
    <div data-out>${dt2('out', 'Salida del taller', o.outAt || null)}<p class="fhint" data-dur></p></div>
    <label class="sw-row"><span class="sw-tx"><b>Fuera de servicio</b><small>El equipo no puede operar mientras está en taller (Disponibilidad: En taller). No cambia el estado del viaje.</small></span><input type="checkbox" class="sw" name="outOfService" ${o.outOfService === false ? '' : 'checked'}></label>
    <label class="fld" data-f="reason"><span class="fl">Motivo del mantenimiento</span><textarea class="in" name="reason" rows="2" placeholder="¿Por qué ingresó el equipo al taller?">${esc(o.reason || (issue ? issue.description : ''))}</textarea><span class="ferr"></span></label>
    <label class="fld"><span class="fl">Descripción del servicio realizado</span><textarea class="in" name="description" rows="3" placeholder="Trabajos efectuados (también puedes agregarlos uno por uno en la orden)">${esc(o.description || '')}</textarea></label>
    <label class="fld"><span class="fl">Observaciones (opcional)</span><textarea class="in" name="notes" rows="2">${esc(o.notes || '')}</textarea></label>
    ${issue ? `<p class="op-warn">${icon.info}<span>La falla reportada «${esc(issue.description)}» quedará relacionada con esta orden (no se duplica).</span></p>` : ''}
    <div class="form-foot"><button type="submit" class="btn-primary block lg">${editing ? 'Guardar cambios' : 'Registrar mantenimiento'}</button></div>`;
  const sh = openSheet({ title: editing ? 'Editar mantenimiento' : 'Registrar mantenimiento', body: form, full: true, className: 'form-sheet' });
  const fail = failer(form); clearErr(form);
  const E = form.elements;
  const inTs = () => toTs(E.inDate.value, E.inTime.value || '00:00');
  const outTs = () => (E.outDate.value ? toTs(E.outDate.value, E.outTime.value || '00:00') : null);
  let hint = { reading: null };
  function refresh() {
    if (eq.type === 'vehicle') {
      hint = odoHint(eq, inTs(), o.id || null);
      form.querySelector('[data-odo]').innerHTML = hint.html;
      form.querySelector('[data-odo]').className = 'fhint' + (hint.stale ? ' warn-t' : '');
      const km = parseKm(E.odometer.value), ck = odometerCheck(km, mt.readingsOf(eq.id, { excludeOrder: o.id || null }), inTs());
      form.querySelector('[data-fix]').hidden = !ck.lower;
    }
    const st = E.status.value, out = outTs();
    form.querySelector('[data-out]').querySelector('.fl').textContent = st === 'finalizado' ? 'Salida del taller (obligatoria al finalizar)' : 'Salida del taller (opcional mientras esté abierto)';
    form.querySelector('[data-dur]').textContent = Number.isFinite(out) && Number.isFinite(inTs()) ? (out < inTs() ? 'La salida no puede ser anterior al ingreso.' : `Tiempo en taller: ${durationText(out - inTs())}`) : '';
  }
  form.addEventListener('input', refresh);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'status' && e.target.value === 'finalizado' && !E.outDate.value) { const p = splitTs(Date.now()); E.outDate.value = p.date; E.outTime.value = p.time; }
    refresh();
  });
  form.addEventListener('click', (e) => { if (e.target.closest('[data-useodo]') && hint.reading) { E.odometer.value = nf(hint.reading.km); refresh(); } });
  let saving = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); if (saving) return;
    const inAt = inTs(), outAt = outTs(), status = E.status.value;
    if (!Number.isFinite(inAt)) return fail('in', 'Escribe la fecha y hora de ingreso al taller.');
    if (E.outDate.value && !Number.isFinite(outAt)) return fail('out', 'La fecha de salida no es válida.');
    if (Number.isFinite(outAt) && outAt < inAt) return fail('out', 'La salida no puede ser anterior al ingreso.');
    if (status === 'finalizado' && !Number.isFinite(outAt)) return fail('out', 'Para finalizar, registra la fecha y hora de salida.');
    let odometer = null, odometerFix = o.odometerFix || null;
    if (eq.type === 'vehicle') {
      odometer = parseKm(E.odometer.value);
      if (Number.isNaN(odometer)) return fail('odometer', 'Escribe el kilometraje en km (solo números, sin negativos).');
      const ck = odometerCheck(odometer, mt.readingsOf(eq.id, { excludeOrder: o.id || null }), inAt);
      if (ck.lower) {
        if (!E.fixReason.value) { form.querySelector('[data-fix]').hidden = false; return fail('odometer', `El kilometraje es menor que el último conocido (${nf(ck.prev.km)} km del ${fmtD(ck.prev.ts)}). Revisa el dato o documenta la corrección.`); }
        odometerFix = { reason: E.fixReason.value, reasonText: E.fixText.value.trim() || ODOMETER_FIXES.find(([k]) => k === E.fixReason.value)[1], prevKm: ck.prev.km, prevTs: ck.prev.ts, source: ck.prev.source };
      } else odometerFix = null;
    }
    if (!E.reason.value.trim()) return fail('reason', 'Escribe el motivo del mantenimiento.');
    const outOfService = E.outOfService.checked;
    /* Viaje activo en Logística: se advierte antes de marcar el equipo como no disponible (el viaje no se modifica) */
    if (outOfService && isOpenStatus(status) && (!editing || o.outOfService === false || !isOpenStatus(o.status))) {
      const trip = mt.activeTripOf(eq.type, eq.id);
      if (trip) {
        const ok = await actionSheet({ title: `${eq.label} tiene una operación activa`, message: `En Logística está «${statusLabel(trip.status)}»${trip.destination ? ` rumbo a ${trip.destination}` : ''}. Marcarla «En taller» cambia su disponibilidad, pero no modifica el estado del viaje.`, actions: [{ label: 'Marcar como no disponible', value: true, style: 'primary' }], cancel: 'Revisar' });
        if (!ok) return;
      }
    }
    saving = true;
    try {
      const data = { equipmentType: eq.type, vehicleId: eq.type === 'vehicle' ? eq.id : null, trailerId: eq.type === 'trailer' ? eq.id : null, inAt, outAt, status, type: E.type.value, odometer, odometerFix, reason: E.reason.value, description: E.description.value, notes: E.notes.value, outOfService };
      const out = editing ? await mt.updateOrder(o.id, data) : await mt.createOrder(data);
      if (issue) await mt.linkIssue(issue.id, out.id);
      sh.close();
      toast(editing ? 'Mantenimiento actualizado' : `Mantenimiento ${out.folio} registrado`);
      if (onSaved) onSaved(out); else if (!editing) go(`/operacion/taller/orden/${out.id}`);
    } catch (err) { toast(err.message || 'No se pudo guardar el mantenimiento.', { type: 'warn', ms: 4500 }); } finally { saving = false; }
  });
  refresh();
}

/* ===== Estado y finalización ===== */
export function openStatusForm(order, onSaved) {
  const form = document.createElement('form');
  form.className = 'op-form'; form.noValidate = true;
  form.innerHTML = `<div class="lg-stlist">${ORDER_STATUSES.map((s) => `<label class="pk-row"><input type="radio" name="status" value="${s.key}" ${s.key === order.status ? 'checked' : ''}><span class="pk-tx"><b>${esc(s.label)}</b><small>${s.open ? 'El equipo sigue en el taller' : 'Registra la salida; se calcula el tiempo en taller'}</small></span>${statusChip(s.key)}</label>`).join('')}</div>
    <div data-out hidden>${dt2('out', 'Salida del taller', order.outAt || Date.now())}<p class="fhint" data-dur></p></div>
    <div class="form-foot"><button type="submit" class="btn-primary block lg">Guardar estado</button></div>`;
  const sh = openSheet({ title: 'Estado del mantenimiento', body: form, full: true, className: 'form-sheet' });
  const fail = failer(form), E = form.elements;
  const outTs = () => toTs(E.outDate.value, E.outTime.value || '00:00');
  const draw = () => {
    const fin = E.status.value === 'finalizado';
    form.querySelector('[data-out]').hidden = !fin;
    const out = outTs();
    form.querySelector('[data-dur]').innerHTML = fin && Number.isFinite(out) ? (out < order.inAt ? '<b>La salida no puede ser anterior al ingreso.</b>' : `Ingreso ${esc(fmtDT(order.inAt))} → salida ${esc(fmtDT(out))}<br><b>Tiempo en taller: ${esc(durationText(out - order.inAt))}</b>`) : '';
  };
  form.addEventListener('change', draw); form.addEventListener('input', draw);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = E.status.value, fin = status === 'finalizado';
    const outAt = fin ? outTs() : order.outAt;
    if (fin && !Number.isFinite(outAt)) return fail('out', 'Escribe la fecha y hora de salida.');
    if (fin && outAt < order.inAt) return fail('out', 'La salida no puede ser anterior al ingreso.');
    try {
      await mt.updateOrder(order.id, { status, outAt: fin ? outAt : null });
      sh.close(); toast(fin ? `Mantenimiento finalizado · ${durationText(outAt - order.inAt)} en taller` : `Estado: ${orderStatusOf(status).label}`); onSaved && onSaved();
    } catch (err) { toast(err.message, { type: 'warn', ms: 4200 }); }
  });
  draw();
}

/* ===== Componente (catálogo + agregados por el usuario) ===== */
export async function pickComponent(kind, current = '') {
  const comps = mt.componentsFor(kind);
  const r = await openPicker({ title: 'Componente intervenido', allowNew: true, newLabel: 'Agregar componente', placeholder: 'Buscar o escribir un componente', current,
    items: [{ value: '__none', label: 'Sin componente específico', sub: 'Servicio general, revisión, etc.' }, ...comps.map((c) => ({ value: c.id, label: c.name, sub: c.systemName }))] });
  if (!r) return null;
  if (r.value === '__none') return { id: '' };
  if (r.isNew || !comps.some((c) => c.id === r.value)) {
    const sys = await actionSheet({ title: `Agregar «${r.value}»`, message: 'Elige el sistema al que pertenece. Quedará disponible para este tipo de equipo (sin región en el diagrama; aparece en la lista).', actions: [...systemsOf(kind).map((s) => ({ label: s.name, value: s.id })), { label: 'Otros componentes', value: 'otros' }] });
    if (!sys) return null;
    try { const p = await mt.addPart(kind, sys, r.value); return { id: p.id }; } catch (err) { toast(err.message, { type: 'warn' }); return null; }
  }
  return { id: r.value };
}

/* ===== Trabajo (línea de servicio) ===== */
export function openServiceForm(order, svc = null, { componentId = '', onSaved = null } = {}) {
  const editing = !!svc, s = svc || { type: componentId ? 'reparacion' : 'reemplazo', componentId, workStatus: 'terminado', date: Date.now() };
  if (!editing && s.type === 'aceite') { openOilForm(order, null, onSaved); return; }
  const state = { severity: s.severity || '', action: s.action || '', workStatus: s.workStatus || 'terminado', componentId: s.componentId || '' };
  const form = document.createElement('form');
  form.className = 'op-form'; form.noValidate = true;
  form.innerHTML = `${sel('type', WORK_TYPES, s.type, 'Tipo de trabajo')}
    <div class="fld" data-f="component"><span class="fl">Componente intervenido</span><button type="button" class="in pick" data-comp><span class="pv"><span class="pv-v" data-compv></span></span><span class="pick-ic">${icon.chev}</span></button><span class="ferr"></span></div>
    <label class="fld"><span class="fl">Descripción</span><textarea class="in" name="description" rows="2">${esc(s.description || '')}</textarea></label>
    <div class="row2"><label class="fld" data-f="date"><span class="fl">Fecha</span><input class="in" type="date" name="date" value="${esc(splitTs(s.date).date)}"><span class="ferr"></span></label><span></span></div>
    <div class="fld" data-f="severity"><span class="fl">Severidad de la falla</span>${segH('severity', [['', 'Sin falla'], ...SEVERITIES], state.severity, true)}<span class="ferr"></span></div>
    <div class="fld" data-f="action"><span class="fl">Acción realizada</span>${segH('action', [['', 'Ninguna'], ...ACTIONS], state.action)}<span class="ferr"></span></div>
    <div class="fld"><span class="fl">Estado del trabajo</span>${segH('workStatus', WORK_STATUSES, state.workStatus)}</div>
    <label class="fld"><span class="fl">Observaciones (opcional)</span><textarea class="in" name="notes" rows="2">${esc(s.notes || '')}</textarea></label>
    <div data-ph></div>
    <div class="form-foot"><button type="submit" class="btn-primary block lg">${editing ? 'Guardar trabajo' : 'Agregar trabajo'}</button>
    ${editing ? `<button type="button" class="btn-danger block" data-del>${icon.trash}<span>Eliminar trabajo</span></button>` : ''}</div>`;
  const sh = openSheet({ title: editing ? 'Editar trabajo' : 'Agregar trabajo', body: form, full: true, className: 'form-sheet' });
  const photos = photoField(editing ? mt.photosOf(s.id) : []);
  form.querySelector('[data-ph]').replaceWith(photos.el);
  const fail = failer(form); clearErr(form); bindSegs(form, state);
  const drawComp = () => { form.querySelector('[data-comp]').classList.toggle('empty', !state.componentId); form.querySelector('[data-compv]').textContent = state.componentId ? mt.componentName(order.kind, state.componentId) : 'Sin componente específico'; };
  form.querySelector('[data-comp]').addEventListener('click', async () => { const r = await pickComponent(order.kind, state.componentId); if (r) { state.componentId = r.id; drawComp(); } });
  form.elements.type.addEventListener('change', () => {
    if (form.elements.type.value === 'aceite' && !editing) { sh.close(); openOilForm(order, null, onSaved); }
    if (form.elements.type.value === 'llantas' && !editing) { sh.close(); openTireForm(order, null, onSaved); }
  });
  drawComp();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = form.elements.date.value ? toTs(form.elements.date.value, splitTs(s.date).time || '12:00') : NaN;
    if (!Number.isFinite(date)) return fail('date', 'Escribe la fecha del trabajo.');
    if (state.componentId && !state.action) return fail('action', 'Elige la acción realizada sobre el componente.');
    if (state.componentId && state.action !== 'reemplazado' && state.action !== 'revisado' && !state.severity) return fail('severity', 'Elige la severidad (o marca el componente como reemplazado).');
    try {
      const out = await mt.saveService(order.id, { ...(editing ? { id: s.id, oilChangeId: s.oilChangeId, tireId: s.tireId } : {}), type: form.elements.type.value, componentId: state.componentId || null, description: form.elements.description.value, date, severity: state.severity, action: state.action, workStatus: state.workStatus, notes: form.elements.notes.value });
      await photos.apply('service', out.id, order.id);
      sh.close(); toast(editing ? 'Trabajo actualizado' : 'Trabajo agregado'); onSaved && onSaved();
    } catch (err) { toast(err.message, { type: 'warn', ms: 4200 }); }
  });
  const del = form.querySelector('[data-del]');
  if (del) del.addEventListener('click', async () => {
    if (!(await confirmDestructive('¿Eliminar este trabajo?', 'También se quita su registro en el diagrama.', 'Eliminar trabajo'))) return;
    await mt.deleteService(s.id); sh.close(); toast('Trabajo eliminado', { type: 'info' }); onSaved && onSaved();
  });
}

/* ===== Componente desde el diagrama ===== */
export function openComponentSheet(order, componentId, onSaved) {
  const kind = order.kind, name = mt.componentName(kind, componentId);
  const mine = mt.componentsOfOrder(order.id).filter((c) => c.componentId === componentId);
  const key = equipmentKey(order.equipmentType, order.vehicleId || order.trailerId);
  const prev = mt.ordersOf(key).filter((o) => o.id !== order.id).flatMap((o) => mt.componentsOfOrder(o.id).filter((c) => c.componentId === componentId).map((c) => ({ c, o })));
  const st = componentStates(mine).get(componentId);
  const state = { severity: '', action: 'reparado' };
  const svcOf = (c) => (c.serviceId ? mt.servicesOf(order.id).find((s) => s.id === c.serviceId) : null);
  const line = (c) => `${c.severity ? sevChip(c.severity) : '<span class="sev s-none"><i></i>Sin daño registrado</span>'}<span class="lg-st lg-t-gray"><i></i>${esc(actionLabel(c.action))}</span>`;
  const form = document.createElement('form');
  form.className = 'op-form'; form.noValidate = true;
  form.innerHTML = `<div class="cp-head">${st ? stateChip(st.state) : stateChip('none')}<div><b>${esc(name)}</b><small>${esc(systemsOf(kind, mt.parts()).find((s) => s.id === (mt.componentsFor(kind).find((c) => c.id === componentId) || {}).system)?.name || '')}</small></div></div>
    ${mine.length ? `<div class="cp-prev"><h4>En esta orden</h4><div class="mt-list">${mine.map((c) => `<button type="button" class="mt-row" data-edit="${esc(c.id)}"><span class="mt-row-tx"><b>${esc(c.description || (c.issueId ? 'Falla reportada' : c.tireId ? 'Reemplazo de llantas' : 'Intervención'))}</b><small>${esc(fmtD(c.date))}${c.issueId ? ' · desde la falla reportada' : ''}</small>${line(c)}</span>${svcOf(c) ? `<span class="chev">${icon.chev}</span>` : ''}</button>`).join('')}</div></div>` : ''}
    ${prev.length ? `<div class="cp-prev"><h4>Incidencias previas de este equipo</h4><div class="mt-list">${prev.slice(0, 8).map(({ c, o }) => `<a class="mt-row" href="${orderHref(o.id)}"><span class="mt-row-tx"><b>${esc(o.folio)}</b><small>${esc(fmtD(c.date))} · ${esc(c.description || '')}</small>${line(c)}</span><span class="chev">${icon.chev}</span></a>`).join('')}</div></div>` : '<p class="grp-note">Sin incidencias previas de este componente en el historial del equipo.</p>'}
    <div class="cp-form" data-w><div class="grp-h solo"><h3>Registrar intervención</h3></div>
    <div class="fld" data-f="severity"><span class="fl">Gravedad</span>${segH('severity', SEVERITIES, '', true)}<span class="ferr"></span></div>
    <div class="fld"><span class="fl">Acción</span>${segH('action', DIAGRAM_ACTIONS, 'reparado')}<span class="fhint">Reemplazado se muestra en azul; la gravedad original se conserva en el detalle.</span></div>
    <label class="fld"><span class="fl">Descripción</span><textarea class="in" name="description" rows="2" placeholder="Qué se encontró o qué se hizo"></textarea></label>
    <div data-ph></div>
    <div class="form-foot"><button type="submit" class="btn-primary block lg">Guardar en el diagrama</button></div></div>`;
  const sh = openSheet({ title: name, body: form, full: true, className: 'form-sheet' });
  const photos = photoField([]);
  form.querySelector('[data-ph]').replaceWith(photos.el);
  const fail = failer(form); clearErr(form); bindSegs(form, state);
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]'); if (!b) return;
    const c = mine.find((x) => x.id === b.dataset.edit), svc = c && svcOf(c);
    if (svc) { sh.close(); openServiceForm(order, svc, { onSaved }); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.action !== 'reemplazado' && !state.severity) return fail('severity', 'Elige la gravedad (Leve, Moderado o Daño total).');
    try {
      const out = await mt.saveService(order.id, { type: state.action === 'reemplazado' ? 'reemplazo' : state.action === 'pendiente' ? 'diagnostico' : 'reparacion', componentId, description: form.elements.description.value, date: Date.now(), severity: state.severity, action: state.action, workStatus: state.action === 'pendiente' ? 'pendiente' : 'terminado' });
      await photos.apply('service', out.id, order.id);
      sh.close(); toast(`${name}: ${state.action === 'reemplazado' ? STATE_LABELS.reemplazado : severityLabel(state.severity)}`); onSaved && onSaved();
    } catch (err) { toast(err.message, { type: 'warn', ms: 4200 }); }
  });
}

/* ===== Falla reportada ===== */
export async function openIssueForm({ issue = null, eq = null, onSaved = null } = {}) {
  await mt.loadMaintenance();
  const editing = !!issue;
  if (!eq) eq = editing ? mt.equipmentOf(issue.equipmentType, issue.vehicleId || issue.trailerId) || { ...issue.snap, type: issue.equipmentType, id: issue.vehicleId || issue.trailerId, kind: issue.kind, kindLabel: kindLabel(issue.kind) } : await chooseEquipment();
  if (eq && !editing && eq.type === 'trailer' && !eq.kind) eq = await classifyTrailer(eq);
  if (!eq) return;
  const kind = editing ? issue.kind : eq.kind;
  const i = issue || { date: Date.now(), severity: '' };
  const state = { severity: i.severity || '' };
  const comps = mt.componentsFor(kind), systems = systemsOf(kind, mt.parts());
  const sys0 = i.system || (comps.find((c) => c.id === i.componentId) || {}).system || systems[0].id;
  const form = document.createElement('form');
  form.className = 'op-form'; form.noValidate = true;
  form.innerHTML = `${eqWho(eq)}
    ${dt2('d', 'Fecha del reporte', i.date)}
    ${sel('system', systems.map((s) => [s.id, s.name]), sys0, 'Sistema afectado')}
    <label class="fld" data-f="component"><span class="fl">Componente</span><span class="sel-w"><select class="in" name="component"></select><span class="sel-ic">${icon.down}</span></span><span class="ferr"></span></label>
    <div class="fld" data-newcomp hidden><span class="fl">Nuevo componente</span><div class="row2"><input class="in" name="newComp" placeholder="Nombre del componente" autocapitalize="sentences"><button type="button" class="btn-secondary" data-addcomp>${icon.plus}<span>Agregar</span></button></div></div>
    <label class="fld" data-f="description"><span class="fl">Descripción de la falla</span><textarea class="in" name="description" rows="3">${esc(i.description || '')}</textarea><span class="ferr"></span></label>
    <div class="fld" data-f="severity"><span class="fl">Nivel de gravedad</span>${segH('severity', SEVERITIES, state.severity, true)}<span class="fhint">Clasificación administrativa: no determina si el equipo puede circular.</span><span class="ferr"></span></div>
    <label class="fld"><span class="fl">Observaciones (opcional)</span><textarea class="in" name="notes" rows="2">${esc(i.notes || '')}</textarea></label>
    <div data-ph></div>
    <div class="form-foot"><button type="submit" class="btn-primary block lg">${editing ? 'Guardar falla' : 'Reportar falla'}</button></div>`;
  const sh = openSheet({ title: editing ? 'Editar falla' : 'Reportar falla', body: form, full: true, className: 'form-sheet' });
  const photos = photoField(editing ? mt.photosOf(i.id) : []);
  form.querySelector('[data-ph]').replaceWith(photos.el);
  const fail = failer(form); clearErr(form); bindSegs(form, state);
  const drawComps = () => {
    const sys = form.elements.system.value;
    form.elements.component.innerHTML = `<option value="">Sin componente específico</option>${comps.filter((c) => c.system === sys).map((c) => `<option value="${esc(c.id)}"${c.id === i.componentId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__new">Agregar otro componente…</option>`;
  };
  form.elements.system.addEventListener('change', drawComps);
  form.elements.component.addEventListener('change', () => {
    const nw = form.elements.component.value === '__new';
    form.querySelector('[data-newcomp]').hidden = !nw;
    if (nw) form.elements.newComp.focus();
  });
  form.querySelector('[data-addcomp]').addEventListener('click', async () => {
    const name = form.elements.newComp.value.trim();
    if (!name) { toast('Escribe el nombre del componente.', { type: 'warn' }); return; }
    try {
      const p = await mt.addPart(kind, form.elements.system.value, name);
      comps.push({ id: p.id, name: p.name, system: p.system }); i.componentId = p.id; drawComps();
      form.querySelector('[data-newcomp]').hidden = true; form.elements.newComp.value = ''; toast('Componente agregado');
    } catch (err) { toast(err.message, { type: 'warn' }); }
  });
  drawComps();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = toTs(form.elements.dDate.value, form.elements.dTime.value || '00:00');
    if (!Number.isFinite(date)) return fail('d', 'Escribe la fecha del reporte.');
    if (!form.elements.description.value.trim()) return fail('description', 'Describe la falla.');
    if (!state.severity) return fail('severity', 'Elige el nivel de gravedad.');
    try {
      const out = await mt.saveIssue({ ...(editing ? { id: i.id } : {}), equipmentType: eq.type, vehicleId: eq.type === 'vehicle' ? eq.id : null, trailerId: eq.type === 'trailer' ? eq.id : null, date, system: form.elements.system.value, componentId: form.elements.component.value || null, description: form.elements.description.value, severity: state.severity, notes: form.elements.notes.value });
      await photos.apply('issue', out.id, out.orderId || null);
      sh.close(); toast(editing ? 'Falla actualizada' : 'Falla reportada');
      onSaved && onSaved(out);
    } catch (err) { toast(err.message, { type: 'warn', ms: 4200 }); }
  });
}
/* Detalle de una falla: relacionarla con una orden (sin duplicarla) o crear la orden */
export async function openIssueSheet(issue, onChange) {
  const eq = mt.equipmentOf(issue.equipmentType, issue.vehicleId || issue.trailerId);
  const key = equipmentKey(issue.equipmentType, issue.vehicleId || issue.trailerId);
  const open = mt.ordersOf(key).filter((o) => isOpenStatus(o.status));
  const linked = issue.orderId ? mt.orderById(issue.orderId) : null;
  const { photoStrip, viewPhoto } = await import('./workshopKit.js');
  const strip = await photoStrip(mt.photosOf(issue.id));
  const sh = openSheet({ title: 'Falla reportada', full: true, body: `<div class="op-form">
    ${eq ? eqWho(eq) : ''}
    <dl class="sumlist"><div><dt>Fecha</dt><dd>${esc(fmtDT(issue.date))}</dd></div>
      <div><dt>Componente</dt><dd>${esc(issue.componentId ? mt.componentName(issue.kind, issue.componentId) : 'Sin componente específico')}</dd></div>
      <div><dt>Gravedad</dt><dd>${sevChip(issue.severity)}</dd></div>
      <div><dt>Descripción</dt><dd>${esc(issue.description)}</dd></div>${issue.notes ? `<div><dt>Observaciones</dt><dd>${esc(issue.notes)}</dd></div>` : ''}
      <div><dt>Orden</dt><dd>${linked ? `<a href="${orderHref(linked.id)}">${esc(linked.folio)}</a>` : '<i>Sin relacionar</i>'}</dd></div></dl>
    ${strip}
    <div class="sheet-acts col" data-w>
      ${!linked && open.length ? open.map((o) => `<button type="button" class="btn-secondary" data-link="${esc(o.id)}">${icon.link}<span>Relacionar con ${esc(o.folio)}</span></button>`).join('') : ''}
      ${!linked ? `<button type="button" class="btn-primary" data-neworder>${icon.wrench}<span>Crear orden de mantenimiento</span></button>` : `<button type="button" class="btn-secondary" data-unlink>${icon.linkOff}<span>Desvincular de la orden</span></button>`}
      <button type="button" class="btn-secondary" data-editi>${icon.edit}<span>Editar falla</span></button>
      <button type="button" class="btn-danger" data-deli>${icon.trash}<span>Eliminar falla</span></button>
    </div></div>` });
  sh.body.addEventListener('click', async (e) => {
    const t = e.target.closest('button,[data-view-photo]'); if (!t) return;
    if (t.dataset.viewPhoto) return viewPhoto(t.dataset.viewPhoto);
    try {
      if (t.dataset.link) { await mt.linkIssue(issue.id, t.dataset.link); sh.close(); toast('Falla relacionada con la orden'); onChange && onChange(); }
      if (t.hasAttribute('data-neworder')) { sh.close(); startOrder({ type: issue.equipmentType, id: issue.vehicleId || issue.trailerId, issue }); }
      if (t.hasAttribute('data-unlink')) { await mt.unlinkIssue(issue.id); sh.close(); toast('Falla desvinculada', { type: 'info' }); onChange && onChange(); }
      if (t.hasAttribute('data-editi')) { sh.close(); openIssueForm({ issue, onSaved: onChange }); }
      if (t.hasAttribute('data-deli')) { if (!(await confirmDestructive('¿Eliminar la falla reportada?', issue.description, 'Eliminar falla'))) return; await mt.deleteIssue(issue.id); sh.close(); toast('Falla eliminada', { type: 'info' }); onChange && onChange(); }
    } catch (err) { toast(err.message, { type: 'warn', ms: 4200 }); }
  });
}

/* ===== Cambio de aceite ===== */
export function openOilForm(order, rec = null, onSaved = null) {
  if (order.equipmentType !== 'vehicle') { toast('El cambio de aceite se registra en tractocamiones.', { type: 'info' }); return; }
  const editing = !!rec, r = rec || { date: order.inAt, odometer: order.odometer, oilFilter: true };
  const prof = mt.profileOf(equipmentKey('vehicle', order.vehicleId));
  const form = document.createElement('form');
  form.className = 'op-form'; form.noValidate = true;
  form.innerHTML = `${dt2('d', 'Fecha del cambio', r.date)}
    <label class="fld" data-f="odometer"><span class="fl">Odómetro al momento del cambio (km)</span><input class="in" name="odometer" inputmode="numeric" autocomplete="off" value="${r.odometer != null ? esc(nf(r.odometer)) : ''}" placeholder="Ej. 125,000"><span class="fhint">${order.odometer != null ? `Kilometraje de la orden: ${esc(kmText(order.odometer))}` : 'La orden no tiene kilometraje registrado.'}</span><span class="ferr"></span></label>
    <div class="row2"><label class="fld"><span class="fl">Tipo de aceite</span><input class="in" name="oilType" value="${esc(r.oilType || '')}" placeholder="Mineral, sintético…"></label><label class="fld"><span class="fl">Viscosidad</span><input class="in" name="viscosity" value="${esc(r.viscosity || '')}" placeholder="15W-40" autocapitalize="characters"></label></div>
    <div class="row2"><label class="fld"><span class="fl">Marca</span><input class="in" name="brand" value="${esc(r.brand || '')}" autocapitalize="words"></label><label class="fld" data-f="liters"><span class="fl">Cantidad (litros)</span><input class="in" name="liters" inputmode="decimal" value="${r.liters != null ? esc(r.liters) : ''}"><span class="ferr"></span></label></div>
    <label class="sw-row"><span class="sw-tx"><b>Filtro de aceite reemplazado</b></span><input type="checkbox" class="sw" name="oilFilter" ${r.oilFilter ? 'checked' : ''}></label>
    <label class="fld"><span class="fl">Otros filtros reemplazados</span><input class="in" name="otherFilters" value="${esc(r.otherFilters || '')}" placeholder="Combustible, aire, separador…"></label>
    <label class="fld"><span class="fl">Observaciones (opcional)</span><textarea class="in" name="notes" rows="2">${esc(r.notes || '')}</textarea></label>
    <p class="grp-note">Intervalo de esta unidad: ${prof.oilKm ? `<b>${esc(nf(prof.oilKm))} km</b>` : '<b>sin configurar</b>'}${prof.oilDays ? ` o <b>${esc(prof.oilDays)} días</b>` : ''}. El próximo cambio se calcula con el odómetro de este cambio + el intervalo.</p>
    <div data-ph></div>
    <div class="form-foot"><button type="submit" class="btn-primary block lg">${editing ? 'Guardar cambio de aceite' : 'Registrar cambio de aceite'}</button>
    ${editing ? `<button type="button" class="btn-danger block" data-del>${icon.trash}<span>Eliminar cambio de aceite</span></button>` : ''}</div>`;
  const sh = openSheet({ title: 'Cambio de aceite', body: form, full: true, className: 'form-sheet' });
  const photos = photoField(editing ? mt.photosOf(r.id) : []);
  form.querySelector('[data-ph]').replaceWith(photos.el);
  const fail = failer(form); clearErr(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const E = form.elements, date = toTs(E.dDate.value, E.dTime.value || '00:00'), odometer = parseKm(E.odometer.value);
    const lt = String(E.liters.value || '').replace(',', '.').trim(), liters = lt ? Number(lt) : null;
    if (!Number.isFinite(date)) return fail('d', 'Escribe la fecha del cambio.');
    if (odometer == null || Number.isNaN(odometer)) return fail('odometer', 'Escribe el odómetro en km (solo números, sin negativos).');
    if (lt && (!Number.isFinite(liters) || liters <= 0)) return fail('liters', 'Los litros deben ser un número mayor a cero.');
    try {
      const out = await mt.saveOil(order.id, { ...(editing ? { id: r.id } : {}), date, odometer, oilType: E.oilType.value, brand: E.brand.value, viscosity: E.viscosity.value, liters, oilFilter: E.oilFilter.checked, otherFilters: E.otherFilters.value, notes: E.notes.value });
      await photos.apply('oil', out.id, order.id);
      sh.close(); toast('Cambio de aceite registrado'); onSaved && onSaved();
    } catch (err) { toast(err.message, { type: 'warn', ms: 4200 }); }
  });
  const del = form.querySelector('[data-del]');
  if (del) del.addEventListener('click', async () => { if (!(await confirmDestructive('¿Eliminar el cambio de aceite?', '', 'Eliminar'))) return; await mt.deleteOil(r.id); sh.close(); onSaved && onSaved(); });
}

/* ===== Reemplazo de llantas ===== */
export function openTireForm(order, rec = null, onSaved = null) {
  const editing = !!rec, key = equipmentKey(order.equipmentType, order.vehicleId || order.trailerId), prof = mt.profileOf(key);
  const r = rec || { date: order.inAt, quantity: null, positions: [], reason: 'desgaste' };
  let layout = r.layout || prof.tireLayout || '';
  const selected = new Set(r.positions || []);
  const form = document.createElement('form');
  form.className = 'op-form'; form.noValidate = true;
  form.innerHTML = `${dt2('d', 'Fecha del reemplazo', r.date)}
    <label class="fld" data-f="quantity"><span class="fl">Cantidad de llantas reemplazadas</span><input class="in" name="quantity" inputmode="numeric" autocomplete="off" value="${r.quantity != null ? esc(r.quantity) : ''}" placeholder="Ej. 4"><span class="ferr"></span></label>
    <div class="fld" data-f="positions"><span class="fl">Posición de las llantas (opcional)</span>
      ${sel('layout', [['', 'Elige la configuración de ejes…'], ...layoutsFor(order.equipmentType).map(([k, l]) => [k, l.label])], layout, 'Configuración de ejes del equipo')}
      <div data-tr></div><p class="tr-sum" data-sum></p><span class="ferr"></span></div>
    ${sel('reason', TIRE_REASONS, r.reason, 'Motivo del cambio')}
    <label class="fld"><span class="fl">Detalle del motivo (opcional)</span><input class="in" name="reasonText" value="${esc(r.reasonText || '')}"></label>
    <div class="row2"><label class="fld"><span class="fl">Marca (opcional)</span><input class="in" name="brand" value="${esc(r.brand || '')}" autocapitalize="words"></label><label class="fld"><span class="fl">Medida (opcional)</span><input class="in" name="size" value="${esc(r.size || '')}" placeholder="295/75R22.5"></label></div>
    <label class="fld"><span class="fl">Observaciones (opcional)</span><textarea class="in" name="notes" rows="2">${esc(r.notes || '')}</textarea></label>
    <div data-ph></div>
    <div class="form-foot"><button type="submit" class="btn-primary block lg">${editing ? 'Guardar reemplazo' : 'Registrar reemplazo de llantas'}</button>
    ${editing ? `<button type="button" class="btn-danger block" data-del>${icon.trash}<span>Eliminar reemplazo</span></button>` : ''}</div>`;
  const sh = openSheet({ title: 'Reemplazo de llantas', body: form, full: true, className: 'form-sheet' });
  const photos = photoField(editing ? mt.photosOf(r.id) : []);
  form.querySelector('[data-ph]').replaceWith(photos.el);
  const fail = failer(form); clearErr(form);
  function summary() {
    const q = parseCount(form.elements.quantity.value), n = selected.size, el = form.querySelector('[data-sum]');
    if (!layout) { el.className = 'tr-sum'; el.textContent = 'Sin configuración de ejes: se registra solo la cantidad; el esquema queda pendiente de especificar.'; return; }
    el.className = 'tr-sum' + (Number.isFinite(q) && n > q ? ' warn' : '');
    el.textContent = !n ? `Toca las posiciones que recibieron llanta nueva (se marcan en azul).${Number.isFinite(q) ? ` Si no las conoces, se registran ${q} llanta${q === 1 ? '' : 's'} con posiciones pendientes.` : ''}`
      : Number.isFinite(q) ? (n > q ? `Marcaste ${n} posiciones, pero la cantidad es ${q}.` : `${n} de ${q} posiciones identificadas${q - n ? ` · ${q - n} pendiente${q - n === 1 ? '' : 's'} de especificar` : ''}.`) : `${n} posiciones marcadas.`;
  }
  function drawTires() {
    const box = form.querySelector('[data-tr]');
    box.innerHTML = '';
    if (!layout) return;
    for (const id of [...selected]) if (!positionsOf(layout).some((p) => p.id === id)) selected.delete(id);
    box.appendChild(tirePicker(layout, selected, { onChange: summary }).el);
  }
  form.elements.layout.addEventListener('change', () => { layout = form.elements.layout.value; drawTires(); summary(); });
  form.addEventListener('input', summary);
  drawTires(); summary();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const E = form.elements, date = toTs(E.dDate.value, E.dTime.value || '00:00'), quantity = parseCount(E.quantity.value);
    if (!Number.isFinite(date)) return fail('d', 'Escribe la fecha del reemplazo.');
    if (!Number.isFinite(quantity)) return fail('quantity', 'Escribe cuántas llantas se reemplazaron (1 o más, sin negativos).');
    if (selected.size > quantity) return fail('positions', `Marcaste ${selected.size} posiciones, pero la cantidad es ${quantity}.`);
    try {
      if (layout && layout !== prof.tireLayout) await mt.saveProfile(key, { tireLayout: layout });
      const out = await mt.saveTires(order.id, { ...(editing ? { id: r.id } : {}), date, quantity, positions: [...selected], layout: layout || null, reason: E.reason.value, reasonText: E.reasonText.value, brand: E.brand.value, size: E.size.value, notes: E.notes.value });
      await photos.apply('tire', out.id, order.id);
      sh.close(); toast(`Reemplazo registrado: ${quantity} llanta${quantity === 1 ? '' : 's'}${pendingPositions(out) ? ` · ${pendingPositions(out)} sin posición` : ''}`); onSaved && onSaved();
    } catch (err) { toast(err.message, { type: 'warn', ms: 4200 }); }
  });
  const del = form.querySelector('[data-del]');
  if (del) del.addEventListener('click', async () => { if (!(await confirmDestructive('¿Eliminar el reemplazo de llantas?', '', 'Eliminar'))) return; await mt.deleteTires(r.id); sh.close(); onSaved && onSaved(); });
}

/* ===== Intervalos de aceite y ejes del equipo ===== */
export function openProfileForm(eq, onSaved) {
  const key = eq.key, p = mt.profileOf(key);
  const form = document.createElement('form');
  form.className = 'op-form'; form.noValidate = true;
  form.innerHTML = `${eqWho(eq)}
    ${eq.type === 'vehicle' ? `<label class="fld" data-f="oilKm"><span class="fl">Intervalo de cambio de aceite (km)</span><input class="in" name="oilKm" inputmode="numeric" value="${p.oilKm ? esc(nf(p.oilKm)) : ''}" placeholder="Ej. 25,000"><span class="fhint">Propio de esta unidad (no se asume el mismo para todas).</span><span class="ferr"></span></label>
    <label class="fld" data-f="oilDays"><span class="fl">Intervalo por tiempo (días, opcional)</span><input class="in" name="oilDays" inputmode="numeric" value="${p.oilDays ? esc(p.oilDays) : ''}" placeholder="Ej. 90"><span class="ferr"></span></label>` : ''}
    ${sel('layout', [['', 'Sin configurar'], ...layoutsFor(eq.type).map(([k, l]) => [k, l.label])], p.tireLayout || '', 'Configuración de ejes (para posiciones de llantas)')}
    <div class="form-foot"><button type="submit" class="btn-primary block lg">Guardar configuración</button></div>`;
  const sh = openSheet({ title: 'Configuración del equipo', body: form, full: true, className: 'form-sheet' });
  const fail = failer(form); clearErr(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = { tireLayout: form.elements.layout.value || null };
    if (eq.type === 'vehicle') {
      const km = parseKm(form.elements.oilKm.value), days = parseKm(form.elements.oilDays.value);
      if (Number.isNaN(km)) return fail('oilKm', 'Escribe el intervalo en km (solo números).');
      if (Number.isNaN(days)) return fail('oilDays', 'Escribe el intervalo en días (solo números).');
      patch.oilKm = km || null; patch.oilDays = days || null;
    }
    try { await mt.saveProfile(key, patch); sh.close(); toast('Configuración guardada'); onSaved && onSaved(); } catch (err) { toast(err.message, { type: 'warn' }); }
  });
}
export { TIRE_LAYOUTS };
