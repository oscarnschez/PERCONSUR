/*
 * Control de operadores — cálculos.
 *
 * FÓRMULA ÚNICA Y OFICIAL (no existe otra en la aplicación):
 *   BALANCE = COMISIONES − SÁBADOS PAGADOS − GASTOS DE VIAJE − PRÉSTAMOS
 * Cada componente incluye los ajustes administrativos registrados para ese componente.
 * Nada se guarda como balance: siempre se deriva de los registros (viajes, préstamos, ajustes, configuración).
 * Montos en centavos; fechas como texto local AAAA-MM-DD (sin conversión de zona horaria).
 */
export const COMMISSION_RATE = 15;           // % sobre la tarifa del viaje
export const DEFAULT_WEEKLY = 300000;        // $3,000.00 por sábado
export const DEFAULT_MIN = 250000;           // $2,500.00 comisión mínima garantizada

export const DEFAULT_SETTINGS = { startDate: '', cutoffDate: '', satMode: 'auto', satManual: null, weekly: DEFAULT_WEEKLY, minEnabled: false, minAmount: DEFAULT_MIN };
export const settingsOf = (s) => ({ ...DEFAULT_SETTINGS, ...(s || {}) });

/* La única implementación de la fórmula del balance */
export const balanceOf = (c) => c.commissions - c.saturdaysPaid - c.expenses - c.loans;

/* ===== Fechas locales ===== */
const p2 = (n) => String(n).padStart(2, '0');
export function todayStr(d = new Date()) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
function dayNum(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return NaN;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return NaN;
  return Date.UTC(y, m - 1, d) / 86400000;
}
function fromDay(n) { const dt = new Date(n * 86400000); return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`; }
export const isDate = (s) => !Number.isNaN(dayNum(s));
export const fmtDate = (s) => (isDate(s) ? s.split('-').reverse().join('/') : '');
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fmtDateShort = (s) => (isDate(s) ? `${s.slice(8, 10)} ${MES[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : '');

/* Sábados comprendidos entre dos fechas, incluyendo ambas. Aritmética de días en UTC: no depende de la zona horaria. */
export function saturdaysBetween(a, b) {
  const s = dayNum(a), e = dayNum(b);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return [];
  const dow = (((s + 4) % 7) + 7) % 7;          // 1970-01-01 fue jueves (0 = domingo)
  const out = [];
  for (let d = s + ((6 - dow + 7) % 7); d <= e; d += 7) out.push(fromDay(d));
  return out;
}

/* Periodos para filtros: { from, to } en AAAA-MM-DD (to incluido) */
export function periodRange(kind, custom = {}, today = todayStr()) {
  const [y, m] = today.split('-').map(Number);
  const last = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (kind === 'mes') return { from: `${y}-${p2(m)}-01`, to: `${y}-${p2(m)}-${p2(last(y, m))}` };
  if (kind === 'mesAnt') { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return { from: `${yy}-${p2(mm)}-01`, to: `${yy}-${p2(mm)}-${p2(last(yy, mm))}` }; }
  if (kind === 'anio') return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (kind === 'custom') return { from: isDate(custom.from) ? custom.from : null, to: isDate(custom.to) ? custom.to : null };
  return { from: null, to: null };
}
export const PERIODS = [['todo', 'Todo'], ['mes', 'Este mes'], ['mesAnt', 'Mes anterior'], ['anio', 'Este año'], ['custom', 'Personalizado']];

/* ===== Comisión de un viaje ===== */
/* rule = { rate, minEnabled, minAmount }. La comisión final nunca se reduce por los gastos del viaje. */
export function commissionFor(fare, rule) {
  const rate = rule.rate ?? COMMISSION_RATE;
  const base = Math.round((fare || 0) * rate / 100);
  if (rule.minEnabled && base < rule.minAmount) return { base, adjustment: rule.minAmount - base, final: rule.minAmount, expanded: true, rate };
  return { base, adjustment: 0, final: base, expanded: false, rate };
}
export const ruleFromSettings = (st) => ({ rate: COMMISSION_RATE, minEnabled: !!st.minEnabled, minAmount: st.minAmount });
export const ruleFromTrip = (t) => ({ rate: t.commissionRate ?? COMMISSION_RATE, minEnabled: !!t.minEnabled, minAmount: t.minAmount ?? DEFAULT_MIN });

/* Efecto con signo de un ajuste sobre su componente */
export const adjSigned = (a) => (a.direction === 'decrease' ? -a.amount : a.amount);
export const ADJ_TARGETS = [['commissions', 'Comisiones'], ['saturdays', 'Sábados pagados'], ['expenses', 'Gastos de viaje'], ['loans', 'Préstamos']];
/* Efecto de un ajuste en el balance: + en comisiones suma; + en los demás resta */
export const adjBalanceEffect = (a) => (a.target === 'commissions' ? adjSigned(a) : -adjSigned(a));

const live = (arr) => (arr || []).filter((x) => !x.deletedAt);

/*
 * Cálculo completo de un operador.
 * period = { from, to } opcional. La fecha de corte de la configuración limita todo (cortes históricos).
 * cutoff (opcional) sustituye la fecha de corte de la ficha: lo usa el estado de cuenta en PDF para
 * calcular el balance a otra fecha con esta MISMA función (no existe un cálculo paralelo).
 */
export function computeOperator(rec, { from = null, to = null, today = todayStr(), cutoff = null } = {}) {
  const st = settingsOf(rec.settings);
  const configuredCut = isDate(st.cutoffDate) ? st.cutoffDate : today;
  const baseCut = isDate(cutoff) ? cutoff : configuredCut;
  const hi = to && to < baseCut ? to : baseCut;
  const inRange = (d) => isDate(d) && d <= hi && (!from || d >= from);
  const trips = live(rec.trips).filter((t) => inRange(t.date));
  const loans = live(rec.loans).filter((l) => inRange(l.date));
  const adjs = live(rec.adjustments).filter((a) => inRange(a.date));
  /* Todo lo registrado en el periodo, aunque quede después del corte (para la actividad y los avisos) */
  const inPeriod = (d) => !from || !isDate(d) || d >= from;
  const regTrips = live(rec.trips).filter((t) => inPeriod(t.date) && (!to || !isDate(t.date) || t.date <= to));
  const outside = (arr, kept) => arr.filter((x) => !kept.includes(x));
  const exTrips = outside(regTrips, trips);
  const exLoans = outside(live(rec.loans).filter((l) => inPeriod(l.date) && (!to || l.date <= to)), loans);
  const exAdjs = outside(live(rec.adjustments).filter((a) => inPeriod(a.date) && (!to || a.date <= to)), adjs);

  const fullPeriod = !from && !to;
  const satFrom = isDate(st.startDate) ? (from && from > st.startDate ? from : st.startDate) : null;
  const satDates = satFrom ? saturdaysBetween(satFrom, hi) : [];
  const manual = st.satMode === 'manual' && Number.isInteger(st.satManual) && st.satManual >= 0;
  /* El ajuste manual de sábados corresponde al corte de la ficha; a otra fecha de corte se calcula automáticamente */
  const manualApplies = manual && fullPeriod && baseCut === configuredCut;
  const satCount = manualApplies ? st.satManual : satDates.length;

  const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  const adj = (target) => sum(adjs.filter((a) => a.target === target), adjSigned);
  const tripCommissions = sum(trips, (t) => t.finalCommission);
  const tripExpenses = sum(trips, (t) => t.travelExpenses);
  const loanTotal = sum(loans, (l) => l.amount);

  const comp = {
    commissions: tripCommissions + adj('commissions'),
    saturdaysPaid: satCount * st.weekly + adj('saturdays'),
    expenses: tripExpenses + adj('expenses'),
    loans: loanTotal + adj('loans'),
  };
  return {
    settings: st, cutoff: hi, cutoffIsToday: !isDate(cutoff) && !isDate(st.cutoffDate), fullPeriod, configuredCut,
    sat: { count: satCount, auto: saturdaysBetween(isDate(st.startDate) ? st.startDate : '', baseCut).length, dates: satDates, manual: manualApplies, manualIgnored: manual && !manualApplies, manualValue: manual ? st.satManual : null, weekly: st.weekly },
    /* Registros que entraron en el cálculo (los muestra el estado de cuenta) */
    included: { trips, loans, adjustments: adjs },
    comp, balance: balanceOf(comp),
    stats: {
      trips: trips.length, puerto: trips.filter((t) => t.division === 'puerto').length, campo: trips.filter((t) => t.division === 'campo').length,
      fares: sum(trips, (t) => t.fare), tripCommissions, tripExpenses, loanTotal,
      expanded: trips.filter((t) => t.isExpanded).length, expandedAmount: sum(trips, (t) => t.expandedCommission),
      adjustments: adjs.length,
    },
    /* Actividad registrada: todos los viajes, incluidos los posteriores al corte */
    registered: {
      trips: regTrips.length, puerto: regTrips.filter((t) => t.division === 'puerto').length, campo: regTrips.filter((t) => t.division === 'campo').length,
      fares: sum(regTrips, (t) => t.fare), expanded: regTrips.filter((t) => t.isExpanded).length, expandedAmount: sum(regTrips, (t) => t.expandedCommission),
    },
    /* Registros que NO entran en el balance por tener fecha posterior al corte */
    excluded: { trips: exTrips.length, loans: exLoans.length, adjustments: exAdjs.length, dates: [...exTrips, ...exLoans, ...exAdjs].map((x) => x.date).filter(isDate).sort() },
    warnings: [
      ...(!isDate(st.startDate) ? ['Configura la fecha de inicio para contabilizar los sábados.'] : []),
      ...(isDate(st.startDate) && baseCut < st.startDate ? ['La fecha de corte es anterior a la fecha de inicio: no se contabilizan sábados.'] : []),
    ],
  };
}

/* Suma de varios operadores (el balance acumulado usa la misma fórmula) */
export function aggregate(results) {
  const comp = { commissions: 0, saturdaysPaid: 0, expenses: 0, loans: 0 };
  const stats = { trips: 0, puerto: 0, campo: 0, fares: 0, expanded: 0, expandedAmount: 0, saturdays: 0 };
  for (const r of results) {
    for (const k of Object.keys(comp)) comp[k] += r.comp[k];
    for (const k of ['trips', 'puerto', 'campo', 'fares', 'expanded', 'expandedAmount']) stats[k] += r.stats[k];
    stats.saturdays += r.sat.count;
  }
  return { comp, stats, balance: balanceOf(comp) };
}

/* ===== Movimientos (cronológico, más reciente primero) ===== */
const TARGET_LBL = Object.fromEntries(ADJ_TARGETS);
export function movementsOf(rec, res) {
  const out = [];
  const after = (d) => d > res.cutoff;
  if (res.sat.manual) {
    out.push({ kind: 'sabado', date: res.cutoff, title: 'Sábados pagados (ajuste manual)', sub: '', count: res.sat.count, weekly: res.sat.weekly, amount: -(res.sat.count * res.sat.weekly), manual: true });
  } else {
    res.sat.dates.forEach((d) => out.push({ kind: 'sabado', date: d, title: 'Sábado pagado', amount: -res.sat.weekly }));
  }
  live(rec.loans).forEach((l) => out.push({ kind: 'prestamo', id: l.id, date: l.date, title: l.concept || 'Préstamo', sub: l.notes || '', amount: -l.amount, after: after(l.date), at: l.createdAt }));
  live(rec.trips).forEach((t) => out.push({
    kind: 'viaje', id: t.id, date: t.date, title: `${t.origin} → ${t.destination}`, division: t.division, expanded: t.isExpanded,
    commission: t.finalCommission, expenses: t.travelExpenses, fare: t.fare, amount: t.finalCommission - t.travelExpenses, after: after(t.date), at: t.createdAt,
  }));
  live(rec.adjustments).forEach((a) => out.push({ kind: 'ajuste', id: a.id, date: a.date, target: a.target, title: a.reason || 'Ajuste', sub: `${TARGET_LBL[a.target]}: ${a.direction === 'decrease' ? 'disminuye' : 'aumenta'}`, amount: adjBalanceEffect(a), after: after(a.date), at: a.createdAt }));
  const st = rec.settings || {};
  (st.history || []).forEach((h) => out.push({ kind: 'config', date: h.date, title: 'Configuración actualizada', sub: h.changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join('; '), amount: null, at: h.at }));
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.at || 0) - (a.at || 0)));
}
export const MOVE_FILTERS = [['todos', 'Todos'], ['sabado', 'Sábados'], ['prestamo', 'Préstamos'], ['viaje', 'Viajes'], ['comision', 'Comisiones'], ['ajuste', 'Ajustes']];
export function filterMovements(list, f) {
  if (f === 'todos') return list;
  if (f === 'comision') return list.filter((m) => (m.kind === 'viaje' && m.commission > 0) || (m.kind === 'ajuste' && m.target === 'commissions'));
  if (f === 'ajuste') return list.filter((m) => m.kind === 'ajuste' || m.kind === 'config');
  return list.filter((m) => m.kind === f);
}
