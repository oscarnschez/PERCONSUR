/*
 * Combustible y rendimiento — cálculos.
 * Fuente de verdad: los registros base (fecha, hora, odómetro, litros, importe, tanque lleno).
 * Todo lo demás (km recorridos, precio por litro, km/L, L/100 km, promedios) se DERIVA aquí; no se guarda.
 *
 * Método de tanque lleno: un periodo va de una carga «tanque lleno» a la siguiente «tanque lleno».
 *   distancia = odómetro final − odómetro inicial
 *   litros    = suma de TODAS las cargas posteriores a la inicial hasta la final (parciales + final)
 *   km/L = distancia / litros        L/100 km = litros / distancia × 100
 * Sin un periodo cerrado no hay rendimiento («pendiente»): nunca se inventa.
 * Si el odómetro baja (corrección registrada con confirmación), la medición se reinicia en ese punto.
 * Importes en centavos, litros con 2 decimales, odómetro en km.
 */
import { isDate, todayStr } from '../operators/balance.js';

const p2 = (n) => String(n).padStart(2, '0');
const r2 = (n) => Math.round(n * 100) / 100;
const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
export const recKey = (r) => `${r.date}T${r.time || '00:00'}`;
export const liveSorted = (rs) => (rs || []).filter((r) => !r.deletedAt)
  .sort((a, b) => (recKey(a) < recKey(b) ? -1 : recKey(a) > recKey(b) ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));

/* Precio por litro (derivado) */
export const pricePerLiter = (r) => (r.liters > 0 && r.amount > 0 ? r.amount / 100 / r.liters : null);

/* Análisis completo de una unidad */
export function analyzeVehicle(records) {
  const rs = liveSorted(records);
  const rows = [], segments = [];
  let start = null, acc = [], prev = null;
  for (const r of rs) {
    const brk = !!(prev && r.odometer < prev.odometer);
    const km = prev && !brk ? r.odometer - prev.odometer : null;
    const row = { rec: r, prev, km, ppl: pricePerLiter(r), brk, segment: null, status: '' };
    if (brk) { start = null; acc = []; }
    if (r.fullTank) {
      if (start) {
        const included = [...acc, r], dist = r.odometer - start.odometer, liters = r2(sum(included, (x) => x.liters));
        if (dist > 0 && liters > 0) {
          const seg = { id: r.id, from: start, to: r, records: included, km: dist, liters, amount: sum(included, (x) => x.amount), kmL: dist / liters, l100: (liters / dist) * 100, startDate: start.date, endDate: r.date };
          segments.push(seg); row.segment = seg; row.status = 'cierra';
        } else row.status = 'invalido';
      } else row.status = brk ? 'reinicio' : 'inicia';
      start = r; acc = [];
    } else if (start) { acc.push(r); row.status = 'parcial'; }
    else row.status = brk ? 'reinicio' : 'sinbase';
    rows.push(row); prev = r;
  }
  const pending = start && acc.length ? { from: start, records: acc, liters: r2(sum(acc, (x) => x.liters)) } : start ? { from: start, records: [], liters: 0 } : null;
  const priced = rs.filter((r) => r.amount > 0 && r.liters > 0);
  return {
    records: rs, rows, segments, pending, first: rs[0] || null, last: rs[rs.length - 1] || null,
    totals: {
      count: rs.length, liters: r2(sum(rs, (r) => r.liters)), amount: sum(rs, (r) => r.amount), km: sum(rows, (x) => (x.km > 0 ? x.km : 0)),
      avgPrice: sum(priced, (r) => r.liters) > 0 ? sum(priced, (r) => r.amount) / 100 / sum(priced, (r) => r.liters) : null,
    },
  };
}

/* Promedio ponderado de periodos (Σ km / Σ litros), no promedio simple de cocientes */
export function weighted(segs) {
  const km = sum(segs, (s) => s.km), liters = sum(segs, (s) => s.liters);
  return liters > 0 && km > 0 ? { kmL: km / liters, l100: (liters / km) * 100, km, liters: r2(liters), n: segs.length } : null;
}
export function daysBefore(today, n) { const [y, m, d] = today.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d - n)); return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`; }

export function indicators(an, today = todayStr()) {
  const segs = an.segments, cur = segs[segs.length - 1] || null, hist = weighted(segs);
  const by = (f) => segs.reduce((best, s) => (!best || f(s, best) ? s : best), null);
  return {
    current: cur, hist,
    avg30: weighted(segs.filter((s) => s.endDate >= daysBefore(today, 30))),
    avg90: weighted(segs.filter((s) => s.endDate >= daysBefore(today, 90))),
    best: by((s, b) => s.kmL > b.kmL), worst: by((s, b) => s.kmL < b.kmL),
    variation: cur && hist ? ((cur.kmL - hist.kmL) / hist.kmL) * 100 : null,
  };
}

/* ===== Periodos ===== */
export const FUEL_PERIODS = [['todo', 'Todo'], ['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mesAnt', 'Mes anterior'], ['anio', 'Este año'], ['custom', 'Personalizado']];
export function fuelRange(kind, custom = {}, today = todayStr()) {
  const [y, m] = today.split('-').map(Number), last = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (kind === 'hoy') return { from: today, to: today };
  if (kind === 'semana') { const [yy, mm, dd] = today.split('-').map(Number), dow = (new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() + 6) % 7; return { from: daysBefore(today, dow), to: today }; }
  if (kind === 'mes') return { from: `${y}-${p2(m)}-01`, to: `${y}-${p2(m)}-${p2(last(y, m))}` };
  if (kind === 'mesAnt') { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return { from: `${yy}-${p2(mm)}-01`, to: `${yy}-${p2(mm)}-${p2(last(yy, mm))}` }; }
  if (kind === 'anio') return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (kind === 'custom') return { from: isDate(custom.from) ? custom.from : null, to: isDate(custom.to) ? custom.to : null };
  return { from: null, to: null };
}
const inRange = (d, rg) => (!rg.from || d >= rg.from) && (!rg.to || d <= rg.to);

/* Métricas de una unidad dentro de un periodo (para flota, comparación y Excel) */
export function periodMetrics(an, rg) {
  const rows = an.rows.filter((x) => inRange(x.rec.date, rg));
  const segs = an.segments.filter((s) => inRange(s.endDate, rg));
  const priced = rows.filter((x) => x.rec.amount > 0 && x.rec.liters > 0);
  const pl = sum(priced, (x) => x.rec.liters);
  const pa = sum(priced, (x) => x.rec.amount);
  return {
    count: rows.length, liters: r2(sum(rows, (x) => x.rec.liters)), amount: sum(rows, (x) => x.rec.amount), km: sum(rows, (x) => (x.km > 0 ? x.km : 0)),
    /* Precio promedio solo con recargas que tienen importe (litros e importe de las mismas recargas) */
    avgPrice: pl > 0 ? pa / 100 / pl : null, pricedLiters: pl, pricedAmount: pa, perf: weighted(segs), segments: segs,
  };
}
export function fleetSummary(units, rg) {
  const ms = units.map((u) => ({ ...u, m: periodMetrics(u.an, rg) }));
  const active = ms.filter((u) => u.m.count > 0), segs = active.flatMap((u) => u.m.segments);
  const pl = sum(active, (u) => u.m.pricedLiters), pa = sum(active, (u) => u.m.pricedAmount);
  return {
    units: ms, active: active.length, count: sum(active, (u) => u.m.count), liters: r2(sum(active, (u) => u.m.liters)), amount: sum(active, (u) => u.m.amount),
    km: sum(active, (u) => u.m.km), perf: weighted(segs), avgPrice: pl > 0 ? pa / 100 / pl : null,
  };
}
export const COMPARE_SORTS = [['best', 'Mejor rendimiento'], ['worst', 'Peor rendimiento'], ['liters', 'Mayor consumo'], ['amount', 'Mayor gasto'], ['km', 'Mayor kilometraje']];
export function compareUnits(ms, sortKey) {
  const val = { best: (u) => (u.m.perf ? u.m.perf.kmL : -Infinity), worst: (u) => (u.m.perf ? -u.m.perf.kmL : -Infinity), liters: (u) => u.m.liters, amount: (u) => u.m.amount, km: (u) => u.m.km }[sortKey];
  return ms.filter((u) => u.m.count > 0).sort((a, b) => val(b) - val(a));
}

/* Series para gráficas (sin decoración: cada una responde una pregunta) */
export function monthly(an, months = 12, today = todayStr()) {
  const [y, m] = today.split('-').map(Number), out = [];
  for (let i = months - 1; i >= 0; i--) { const d = new Date(Date.UTC(y, m - 1 - i, 1)); out.push({ key: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}`, liters: 0, amount: 0 }); }
  for (const r of an.records) { const b = out.find((x) => x.key === r.date.slice(0, 7)); if (b) { b.liters = r2(b.liters + r.liters); b.amount += r.amount; } }
  return out;
}

/* Validación del odómetro contra las recargas vecinas (orden cronológico) */
export function odometerCheck(records, draft, editingId = null) {
  const rs = liveSorted(records.filter((r) => r.id !== editingId));
  const k = recKey(draft);
  const prev = [...rs].reverse().find((r) => recKey(r) <= k) || null, next = rs.find((r) => recKey(r) > k) || null;
  return {
    prev, next, km: prev ? draft.odometer - prev.odometer : null,
    lowerThanPrev: !!(prev && draft.odometer < prev.odometer), higherThanNext: !!(next && draft.odometer > next.odometer),
  };
}
