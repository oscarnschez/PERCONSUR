/*
 * División Campo — Asignación de unidades para carga (AU 2.0)
 * Portado de cpBlank(), cpUnit(), cpFolio(), cpSols(), cpSD() y las advertencias de rvOpen().
 */
import { fmtTel, ecoLabel } from '../shared/format.js';

export const CAMPO_STEPS = [
  { key: 'carga', title: 'Carga' },
  { key: 'unidades', title: 'Unidades' },
  { key: 'solicitudes', title: 'Solicitudes' },
  { key: 'revision', title: 'Revisión' },
];

export function cpUnit() { return { sol: '', eco: '', op: '', pu: '', pr: '', tipo: '' }; }

/* Folio aleatorio AU-XXXXXXXX (alfabeto sin caracteres ambiguos) */
export function cpFolio() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = new Uint32Array(8);
  try { crypto.getRandomValues(r); } catch (e) { for (let i = 0; i < 8; i++) r[i] = Math.random() * 4e9; }
  return 'AU-' + [...r].map((n) => A[n % A.length]).join('');
}

export function cpBlank(fecha) {
  return { folio: cpFolio(), fecha, sols: {}, planta: '', units: [cpUnit()] };
}

/* Solicitudes en el orden en que aparecen; "sin número" al final */
export function cpSols(cp) {
  const o = [];
  cp.units.forEach((u) => { const k = (u.sol || '').trim(); if (!o.includes(k)) o.push(k); });
  o.sort((a, b) => (a === '') - (b === ''));
  return o;
}

/* Datos por solicitud (hora, lugar de carga, encargado, teléfono, link de Maps) */
export function cpSD(cp, k) {
  cp.sols = cp.sols || {};
  return cp.sols[k] || (cp.sols[k] = { hora: '', lugar: '', enc: '', tel: '', maps: '' });
}

export const cpRows = (cp) => cp.units.filter((u) => u.eco || u.op || u.pu || u.pr);

/* Normaliza asignaciones guardadas (incluye el formato antiguo con cp.horas / cp.hora / cp.lugar / cp.enc) */
export function normalizeCampo(c, fecha) {
  let cp = c && Array.isArray(c.units) && c.units.length ? { ...c } : null;
  if (!cp) return cpBlank(fecha);
  if (cp.encTel) cp.encTel = fmtTel(cp.encTel);
  cp.units = cp.units.map((u) => ({ ...cpUnit(), ...u, sol: u.sol === undefined ? '' : u.sol }));
  if (!cp.folio) cp.folio = cpFolio();
  if (!cp.sols) {
    cp.sols = {};
    cpSols(cp).forEach((k) => {
      cp.sols[k] = { hora: (cp.horas && cp.horas[k]) || cp.hora || '', lugar: cp.lugar || '', enc: cp.enc || '', tel: cp.encTel ? fmtTel(cp.encTel) : '', maps: '' };
    });
  }
  if (cp.planta == null) cp.planta = '';
  if (!cp.fecha) cp.fecha = fecha;
  return cp;
}

/* Datos pendientes (mismas reglas que la revisión original) con destino para navegar */
export function campoIssues(cp) {
  const w = [];
  const add = (msg, step, field) => w.push({ msg, step, field });
  if (!cp.planta) add('Falta la planta destino', 0, 'planta');
  cp.units.forEach((u, i) => {
    const n = `Unidad ${i + 1}`;
    if (!u.eco) add(`${n}: falta el número de unidad`, 1, `units.${i}.eco`);
    if (!u.op) add(`${n}: debes seleccionar un operador`, 1, `units.${i}.op`);
    if (!u.pu) add(`${n}: faltan las placas`, 1, `units.${i}.pu`);
    if (!u.tipo) add(`${n}: falta el tipo de transporte`, 1, `units.${i}.tipo`);
  });
  cpSols(cp).forEach((k, idx) => {
    const d = (cp.sols && cp.sols[k]) || {};
    const n = k ? `Solicitud ${k}` : 'Datos de carga';
    if (!d.hora) add(`${n}: falta la hora`, 2, `sols.${idx}.hora`);
    if (!d.lugar) add(`${n}: falta el lugar de carga`, 2, `sols.${idx}.lugar`);
    if (!d.enc) add(`${n}: falta el encargado de cosecha`, 2, `sols.${idx}.enc`);
  });
  return w;
}

export function campoSummary(cp) {
  const rows = cpRows(cp);
  return {
    folio: cp.folio,
    fecha: cp.fecha,
    empresa: 'PERCONSUR',
    planta: (cp.planta || '').replace(/^Planta /, ''),
    unidades: rows.map((u) => ecoLabel(u.eco)).filter(Boolean),
    operadores: rows.map((u) => u.op).filter(Boolean),
    operador: rows.map((u) => u.op).filter(Boolean).join(', '),
    unidad: rows.map((u) => ecoLabel(u.eco)).filter(Boolean).join(', '),
    unitCount: rows.length,
    solCount: new Set(cp.units.map((u) => (u.sol || '').trim()).filter(Boolean)).size,
  };
}

export function campoHasData(cp) {
  if (!cp) return false;
  if (cp.planta) return true;
  if (Object.values(cp.sols || {}).some((d) => d && (d.hora || d.lugar || d.enc || d.tel || d.maps))) return true;
  return (cp.units || []).some((u) => u.sol || u.eco || u.op || u.pu || u.pr || u.tipo);
}
