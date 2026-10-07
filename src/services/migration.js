/*
 * Migración de datos del sistema anterior (HTML "NER 3.0", localStorage).
 * Claves detectadas en el original (las de empresa distinta de PERCONSUR llevan sufijo @oasc / @osc / @campo):
 *   ner-company   empresa elegida            → ajuste "lastCompany" / "lastDivision"
 *   ner-folios2   consecutivos por día       → store counters (se conserva el mayor)
 *   ner-placas2   placas recordadas por eco  → catálogo de unidades de la empresa
 *   ner-draft     nota en captura (fotos en data URL) → borrador + fotos como archivos
 *   ner-step      paso actual de la nota     → paso del borrador
 *   ner-campo2    asignación de Campo        → borrador de Campo
 *   ner-xlmin     panel de Excel minimizado  → sin equivalente (la app muestra el código en una hoja dedicada)
 * La migración NUNCA borra las claves originales: es repetible y no destructiva.
 * Nota: ner-folios2@campo y ner-draft@campo se generaban vacíos en modo Campo y no se usan
 * (sumarlos adelantaría el consecutivo de PERCONSUR), por eso se omiten.
 */
import * as db from './db.js';
import * as media from './media.js';
import { getSetting, setSetting } from './settings.js';
import { mergeCounter, nextFolio } from './folios.js';
import { save as saveCat, vehicleByEco } from './catalogs.js';
import { normalizePuerto, puertoHasData } from '../domain/puerto/model.js';
import { normalizeCampo, campoHasData } from '../domain/campo/model.js';
import { normEco, nowParts } from '../domain/shared/format.js';
import { PUERTO_STEPS } from '../domain/puerto/model.js';

const SUFFIX = { '': 'perconsur', '@oasc': 'oasc', '@osc': 'osc' };

export function readLegacyLocalStorage() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('ner-')) out[k] = localStorage.getItem(k);
    }
  } catch (e) { /* sin acceso */ }
  return out;
}
const parse = (raw) => { if (raw == null) return null; if (typeof raw !== 'string') return raw; try { return JSON.parse(raw); } catch (e) { return null; } };

export async function migrateLegacy(kv, { source = 'localStorage' } = {}) {
  const report = { source, company: null, counters: 0, vehicles: 0, drafts: [], campo: false, skipped: [] };
  if (!kv || !Object.keys(kv).length) return report;

  const co = parse(kv['ner-company']);
  if (co === 'campo') { await setSetting('lastDivision', 'campo'); report.company = 'campo'; }
  else if (SUFFIX['@' + co] || co === 'perconsur') { await setSetting('lastCompany', co); await setSetting('lastDivision', 'puerto'); report.company = co; }

  for (const [suf, company] of Object.entries(SUFFIX)) {
    const map = parse(kv['ner-folios2' + suf]);
    if (map && typeof map === 'object') for (const [day, n] of Object.entries(map)) {
      if (/^\d{6}$/.test(day) && Number.isFinite(+n)) { await mergeCounter(company, day, +n); report.counters++; }
    }
  }
  if (kv['ner-folios2@campo']) report.skipped.push('ner-folios2@campo (consecutivos no usados en Campo)');

  /* Placas recordadas: @campo primero y luego PERCONSUR, para que lo capturado en Puerto prevalezca */
  for (const [suf, company] of [['@campo', 'perconsur'], ['', 'perconsur'], ['@oasc', 'oasc'], ['@osc', 'osc']]) {
    const map = parse(kv['ner-placas2' + suf]);
    if (!map || typeof map !== 'object') continue;
    for (const [eco, placas] of Object.entries(map)) {
      const e = normEco(eco);
      if (!e || !placas) continue;
      const v = vehicleByEco(company, e);
      if (v) { if (v.placas !== placas) await saveCat('vehicles', { ...v, placas }); }
      else await saveCat('vehicles', { company, eco: e, placas, desc: '', source: 'migrado' });
      report.vehicles++;
    }
  }

  for (const [suf, company] of Object.entries(SUFFIX)) {
    const raw = parse(kv['ner-draft' + suf]);
    if (!raw || !Array.isArray(raw.conts) || !puertoHasData(raw)) continue;
    const id = `puerto:${company}`;
    if (await db.get(db.S.drafts, id)) { report.skipped.push(`ner-draft${suf} (ya existe un borrador)`); continue; }
    for (const c of raw.conts) {
      const fotos = {};
      for (const [lado, ph] of Object.entries(c.fotos || {})) {
        if (ph && typeof ph.src === 'string' && ph.src.startsWith('data:')) {
          const mid = await media.saveBlob(media.dataURLtoBlob(ph.src), { owner: 'draft:' + id, kind: 'photo', name: `${lado}.jpg` });
          fotos[lado] = { id: mid, t: ph.t || Date.now() };
        } else if (ph && ph.id) fotos[lado] = ph;
      }
      c.fotos = fotos;
    }
    const { state, needsFolio } = normalizePuerto(raw);
    if (needsFolio) state.folio = await nextFolio(company, state.fecha || nowParts().fecha);
    const step = Math.min(Math.max(+parse(kv['ner-step' + suf]) || 0, 0), PUERTO_STEPS.length - 2);
    await db.put(db.S.drafts, { id, type: 'puerto', company, data: state, step, updatedAt: Date.now(), migrated: true });
    report.drafts.push(company);
  }

  const cpRaw = parse(kv['ner-campo2@campo']) || parse(kv['ner-campo2']);
  if (cpRaw && campoHasData(cpRaw)) {
    if (await db.get(db.S.drafts, 'campo')) report.skipped.push('ner-campo2 (ya existe un borrador de Campo)');
    else {
      const cp = normalizeCampo(cpRaw, nowParts().fecha);
      await db.put(db.S.drafts, { id: 'campo', type: 'campo', company: 'campo', data: cp, step: 0, updatedAt: Date.now(), migrated: true });
      report.campo = true;
    }
  }
  if (kv['ner-xlmin'] != null) report.skipped.push('ner-xlmin (preferencia de interfaz sin equivalente)');
  return report;
}

/* Se ejecuta una vez al iniciar si hay datos del sistema anterior en este mismo dominio */
export async function autoMigrate() {
  if (getSetting('legacyMigrated')) return null;
  const kv = readLegacyLocalStorage();
  if (!Object.keys(kv).length) { await setSetting('legacyMigrated', { at: Date.now(), found: false }); return null; }
  const report = await migrateLegacy(kv, { source: 'localStorage' });
  await setSetting('legacyMigrated', { at: Date.now(), found: true, report });
  return report;
}
