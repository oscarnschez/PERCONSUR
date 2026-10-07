/*
 * División Puerto — Nota de entrega / recepción (NER 3.0)
 * Lógica portada del HTML original: blank(), blankCont(), calcImporte(), bruto(), syncTrack(),
 * excelRow(), waText() y las advertencias de rvOpenPuerto().
 * Cambio de almacenamiento: las fotos ya no se guardan como data URL dentro del borrador;
 * cada foto es { id, t } donde id apunta al archivo en IndexedDB (store "attachments").
 */
import { MAX_CONT, MODALES, TIPO_OLD, TIPO_DEFAULT, TRACK_PREFIX, modalLbl } from '../../config/reference.js';
import { kg, fmtFecha, nameCase, isoCheck, ecoLabel, destinoMunicipio, xlCell } from '../shared/format.js';

export const FOLIO_RE = /^\d{2}-\d{6}-\d{3,}$/;

/* Pasos del asistente (la revisión es el último) */
export const PUERTO_STEPS = [
  { key: 'info', title: 'Información' },
  { key: 'transporte', title: 'Transporte' },
  { key: 'contenedores', title: 'Contenedores' },
  { key: 'entrega', title: 'Entrega' },
  { key: 'servicio', title: 'Servicio' },
  { key: 'evidencias', title: 'Evidencias' },
  { key: 'revision', title: 'Revisión' },
];

export function blankCont(prev) {
  return {
    num: '', tipo: prev ? prev.tipo : TIPO_DEFAULT, sello: '', merc: prev ? prev.merc : '', bultos: '',
    peso: '', tara: '', tarifa: '', iva: prev ? !!prev.iva : true, isr: prev ? !!prev.isr : true,
    sobre: false, sobreMonto: '', fotos: {},
  };
}

/* Documento vacío. El folio lo asigna el servicio de folios (consecutivo por empresa y día). */
export function blankPuerto({ folio, fecha, hora }) {
  return {
    folio, fecha, hora, bl: '', cartaPorte: '', pedimento: '', operador: '', eco: '', placasU: '', placasR: '', chasis: '',
    destNombre: '', destRFC: '', destDir: '', destContacto: '', obsDan: '', obsFal: '', obs: '',
    recAd: '', recVer: '', recHora: '', recFoto: null, modal: 'imp', trafico: '', custodia: false,
    track: TRACK_PREFIX, trackAuto: true, showTrack: true, copia: true,
    citaFecha: '', citaHora: '', terminal: '', rfcE: '', rfcR: '',
    conts: [blankCont()],
    attachments: [],
  };
}

/*
 * Normaliza un borrador (también los migrados del sistema anterior).
 * Replica las correcciones que el original aplicaba al cargar ner-draft.
 * Devuelve true en needsFolio si el folio guardado no tiene el formato serie-AAMMDD-NNN.
 */
export function normalizePuerto(s) {
  const state = { ...s };
  if (!Array.isArray(state.conts) || !state.conts.length) state.conts = [blankCont()];
  if (state.conts.length > MAX_CONT) state.conts = state.conts.slice(0, MAX_CONT);
  state.conts = state.conts.map((c) => ({ ...blankCont(), ...c, fotos: { ...(c.fotos || {}) } }));
  state.conts.forEach((c) => { if (TIPO_OLD[c.tipo]) c.tipo = TIPO_OLD[c.tipo]; });
  if (!state.track) state.track = TRACK_PREFIX;
  if (!MODALES[state.modal]) state.modal = 'imp';
  if (state.showTrack === undefined) state.showTrack = true;
  if (state.obsDan === undefined) state.obsDan = '';
  state.recFoto = null;
  if (state.obsFal === undefined) state.obsFal = '';
  if (state.operador && state.operador === state.operador.toUpperCase() && /[A-Z]/.test(state.operador)) state.operador = nameCase(state.operador);
  state.conts.forEach((c) => { if (c.iva === undefined) c.iva = true; if (c.isr === undefined) c.isr = true; if (c.tarifa === undefined) c.tarifa = ''; });
  if (state.trackAuto === undefined) {
    const n = (state.conts[0] && state.conts[0].num) || '';
    state.trackAuto = [TRACK_PREFIX, TRACK_PREFIX + n].includes(state.track);
  }
  for (const k of ['citaFecha', 'citaHora', 'terminal', 'rfcE', 'rfcR', 'trafico', 'bl', 'cartaPorte', 'pedimento', 'destNombre', 'destRFC', 'destDir', 'destContacto', 'obs']) {
    if (state[k] == null) state[k] = '';
  }
  if (!Array.isArray(state.attachments)) state.attachments = [];
  return { state, needsFolio: !FOLIO_RE.test(state.folio || '') };
}

/* Peso bruto = peso mercancía + tara */
export function bruto(c) {
  const a = kg(c.peso), b = kg(c.tara);
  return a == null && b == null ? null : (a || 0) + (b || 0);
}

/* Importe = (tarifa + sobrepeso) + IVA 16% − retención ISR 4% */
export function calcImporte(c) {
  const t = kg(c.tarifa), x = c.sobre ? kg(c.sobreMonto) : null;
  if (t == null && x == null) return null;
  const b = t || 0, e = x || 0, sub = b + e;
  const iva = c.iva ? sub * 0.16 : 0, isr = c.isr ? sub * 0.04 : 0;
  const r2 = (n) => Math.round(n * 100) / 100;
  return { base: r2(b), extra: r2(e), iva: r2(iva), isr: r2(isr), importe: r2(sub + iva - isr) };
}

/* El link de rastreo sigue al primer contenedor mientras el usuario no lo edite */
export function syncTrack(state) {
  if (!state.trackAuto) return;
  const n = (state.conts[0] && state.conts[0].num) || '';
  state.track = TRACK_PREFIX + n;
}
export function onTrackEdited(state) {
  const n = (state.conts[0] && state.conts[0].num) || '';
  state.trackAuto = [TRACK_PREFIX, TRACK_PREFIX + n, ''].includes(String(state.track || '').trim());
}

/* Contenedores con algún dato (los que se imprimen en la tabla) */
export const filledConts = (state) => state.conts.filter((c) => c.num || c.sello || c.merc || c.bultos || c.peso);
export const contsWithFotos = (state) => state.conts.map((c, i) => ({ c, i })).filter(({ c }) => c.fotos && Object.keys(c.fotos).length);
export const photoCount = (state) => state.conts.reduce((a, c) => a + Object.keys(c.fotos || {}).length, 0);

/* Renglón tabulado para Excel (Scan-IT to Office), uno por contenedor — idéntico al original */
export function excelRow(state, c) {
  const b = bruto(c);
  const f = fmtFecha(state.fecha);
  return [
    f, state.cartaPorte || '', state.eco || '', c.num || '', c.tipo || '', modalLbl().toUpperCase(), 'PROGRAMADO',
    state.pedimento || '', state.operador || '', b == null ? '' : String(Math.round(b * 100) / 100), '',
    destinoMunicipio(state.destDir), state.destNombre || '',
    ((r) => (r ? r.base.toFixed(2) : ''))(calcImporte(c)), ((r) => (r ? r.importe.toFixed(2) : ''))(calcImporte(c)),
    state.rfcE || '', state.rfcR || '',
  ].map(xlCell).join('\t');
}

/* Resumen del servicio para WhatsApp — idéntico al original */
export function waText(state) {
  const MES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const dest = destinoMunicipio(state.destDir) || '';
  const L = [];
  L.push(`*Servicio${dest ? ' ' + dest : ''}*`);
  if (state.destNombre) L.push(String(state.destNombre).toUpperCase());
  const conts = state.conts.filter((c) => c.num || c.peso);
  conts.forEach((c) => {
    L.push('');
    L.push(`${c.num || '—'} | ${c.tipo || ''}`.trim());
    const p = kg(c.peso);
    L.push(`Peso: ${p == null ? '—' : p.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG`);
  });
  if (!conts.length) L.push('');
  let cita = '—';
  if (state.citaFecha) { const [y, m, d] = state.citaFecha.split('-'); cita = `${d}/${MES[(+m) - 1]}/${y}${state.citaHora ? ' ' + state.citaHora : ''}`; }
  else if (state.citaHora) cita = state.citaHora;
  L.push(`Fecha cita: ${cita}`);
  if (state.terminal) L.push(`Terminal: ${state.terminal}`);
  if (state.operador) L.push(state.operador);
  const u = ecoLabel(state.eco);
  if (u || state.placasU) L.push([u, state.placasU].filter(Boolean).join(' | '));
  return L.join('\n');
}

/*
 * Datos pendientes antes de generar (mismas reglas que la revisión original).
 * El original permitía generar de todos modos porque la nota imprime líneas en blanco
 * para llenar a mano; se conserva ese comportamiento con confirmación.
 * Cada aviso indica el paso y el campo para llevar al usuario directamente.
 */
export function puertoIssues(state) {
  const w = [];
  const add = (msg, step, field) => w.push({ msg, step, field });
  if (!state.operador) add('Debes seleccionar un operador', 1, 'operador');
  if (!state.eco) add('Falta el número económico de la unidad', 1, 'eco');
  if (!state.placasU) add('Faltan las placas de la unidad', 1, 'placasU');
  if (!state.placasR) add('Faltan las placas del remolque', 1, 'placasR');
  state.conts.forEach((c, i) => {
    const n = `Contenedor ${i + 1}`;
    if (!c.num) add(`${n}: falta el número de contenedor`, 2, `conts.${i}.num`);
    if (!c.sello) add(`${n}: falta el sello`, 2, `conts.${i}.sello`);
    if (!c.merc) add(`${n}: falta la mercancía`, 2, `conts.${i}.merc`);
    if (c.num) { const r = isoCheck(c.num); if (r.state === 'bad') add(`${n}: el dígito verificador de ${c.num} no coincide`, 2, `conts.${i}.num`); }
  });
  if (!state.destNombre) add('Falta a quién se entrega', 3, 'destNombre');
  if (!state.destDir) add('Falta la dirección de entrega', 3, 'destDir');
  return w;
}

/* Resumen corto para listas y detalle */
export function puertoSummary(state, co) {
  const conts = filledConts(state);
  return {
    folio: state.folio,
    fecha: state.fecha,
    empresa: co.short,
    operador: state.operador || '',
    unidad: ecoLabel(state.eco),
    placas: state.placasU || '',
    destino: state.destNombre || '',
    municipio: destinoMunicipio(state.destDir),
    contenedores: conts.map((c) => c.num).filter(Boolean),
    contCount: conts.length,
    fotos: photoCount(state),
    archivos: (state.attachments || []).length,
  };
}

/* ¿El borrador tiene información capturada? (para avisos de "documento sin terminar") */
export function puertoHasData(state) {
  if (!state) return false;
  const keys = ['cartaPorte', 'pedimento', 'operador', 'eco', 'placasU', 'placasR', 'bl', 'destNombre', 'destDir', 'destRFC', 'destContacto', 'obsDan', 'obsFal', 'obs', 'rfcE', 'rfcR', 'citaFecha', 'terminal'];
  if (keys.some((k) => state[k])) return true;
  if ((state.attachments || []).length) return true;
  return (state.conts || []).some((c) => c.num || c.sello || c.bultos || c.peso || c.tara || c.tarifa || Object.keys(c.fotos || {}).length);
}
