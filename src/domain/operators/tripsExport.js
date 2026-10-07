/*
 * Excel de viajes de operadores (identidad PERCONSUR), con el desglose fiscal de cada viaje en columnas independientes.
 * Los importes salen de tripTaxes() (domain/operators/taxes.js), la misma función que usan las pantallas y el PDF.
 * La fila de totales lleva fórmulas SUBTOTAL (respetan los filtros de Excel) con su valor ya calculado.
 */
import { Workbook, xlDate } from '../../services/xlsx.js';
import { tripTaxes } from './taxes.js';

const C = { blue: '#354FA3', blueD: '#233878', orange: '#F26F22', light: '#EEF1F8', zebra: '#F7F8FB', ink: '#1A2233', muted: '#5D6778' };
const F = { money: '"$"#,##0.00', date: 'dd/mm/yyyy', pct: '0%' };
export const TRIP_EXPORT_HEADS = ['Fecha', 'Operador', 'División', 'Origen', 'Destino', 'Referencia', 'Tarifa base', 'Aplica IVA', 'Porcentaje IVA', 'Monto IVA', 'Aplica ISR', 'Porcentaje ISR', 'Monto ISR',
  'Aplica Retención IVA', 'Porcentaje Retención IVA', 'Monto Retención IVA', 'Total después de impuestos', 'Gastos', 'Comisión base', 'Comisión final', 'Estatus de pago'];
const MONEY_COLS = [6, 9, 12, 15, 16, 17, 18, 19];

/* Valores de un viaje, en el orden de TRIP_EXPORT_HEADS (dinero en pesos) */
export function tripExportRow({ trip: t, operator, paid }) {
  const x = tripTaxes(t), p = (c) => Math.round(c || 0) / 100, yn = (b) => (b ? 'Sí' : 'No');
  return [t.date, operator, t.division === 'campo' ? 'Campo' : 'Puerto', t.origin || '', t.destination || '', t.reference || '', p(x.fareBase),
    yn(x.applyVat), x.applyVat ? x.vatRate / 100 : '', p(x.vatAmount), yn(x.applyIsr), x.applyIsr ? x.isrRate / 100 : '', p(x.isrAmount),
    yn(x.applyVatWithholding), x.applyVatWithholding ? x.vatWithholdingRate / 100 : '', p(x.vatWithholdingAmount), p(x.totalAfterTaxes),
    p(t.travelExpenses), p(t.baseCommission), p(t.finalCommission), paid ? 'Pagado' : 'Por cobrar'];
}

/* items: [{ trip, operator, paid }]; meta: { company, scope, periodLabel, generated } */
export function buildTripsWorkbook(items, meta) {
  const wb = new Workbook(); wb.title = 'Viajes de operadores';
  const S = {
    co: wb.style({ b: true, sz: 13, color: C.blue }), title: wb.style({ b: true, sz: 11, color: C.ink }), sub: wb.style({ sz: 9, color: C.muted }),
    bandB: wb.style({ fill: C.blue }), bandO: wb.style({ fill: C.orange }),
    th: wb.style({ b: true, sz: 10, color: '#FFFFFF', fill: C.blue, h: 'center', v: 'center', wrap: true, border: 'all', borderColor: C.blueD }),
    note: wb.style({ i: true, sz: 9, color: C.muted, wrap: true, v: 'top' }),
  };
  const cell = (fmt, zebra, extra = {}) => wb.style({ sz: 10, color: C.ink, border: 'bottom', fmt, ...(zebra ? { fill: C.zebra } : {}), ...extra });
  const tot = (fmt) => wb.style({ b: true, sz: 10, color: C.blueD, fill: C.light, border: ['top', 'bottom'], borderColor: C.blue, fmt });
  const heads = TRIP_EXPORT_HEADS, n = heads.length;
  const sh = wb.sheet('Viajes', { cols: [12, 30, 10, 22, 28, 16, 15, 9, 11, 14, 9, 11, 14, 11, 12, 15, 17, 14, 15, 15, 14], tab: C.blue });
  sh.height(0, 24).height(1, 18).height(2, 16).height(3, 5).height(4, 10);
  sh.set(0, 0, meta.company, S.co).merge(0, 0, 0, n - 1);
  sh.set(1, 0, 'Viajes de operadores | desglose fiscal por viaje', S.title).merge(1, 0, 1, n - 1);
  sh.set(2, 0, `${meta.scope}   |   Periodo: ${meta.periodLabel}   |   Generado: ${meta.generated}`, S.sub).merge(2, 0, 2, n - 1);
  const split = Math.round(n * 0.78);
  for (let c = 0; c < n; c++) sh.set(3, c, '', c < split ? S.bandB : S.bandO);
  const H0 = 5; sh.height(H0, 42); heads.forEach((h, c) => sh.set(H0, c, h, S.th));
  const first = H0 + 1; let r = first;
  const sorted = [...items].sort((a, b) => (a.trip.date < b.trip.date ? -1 : a.trip.date > b.trip.date ? 1 : String(a.operator).localeCompare(String(b.operator), 'es')));
  const sums = new Array(n).fill(0);
  for (const it of sorted) {
    const z = (r - first) % 2 === 1, v = tripExportRow(it);
    v.forEach((val, c) => {
      if (c === 0) sh.set(r, c, /^\d{4}-\d{2}-\d{2}$/.test(val) ? xlDate(val) : val, cell(F.date, z, { h: 'center' }));
      else if (MONEY_COLS.includes(c)) { sh.set(r, c, val, cell(F.money, z, c === 16 ? { b: true } : {})); sums[c] += Math.round(val * 100); }
      else if ([8, 11, 14].includes(c)) sh.set(r, c, val, cell(F.pct, z, { h: 'center' }));
      else sh.set(r, c, val, cell(null, z, [2, 7, 10, 13, 20].includes(c) ? { h: 'center' } : {}));
    });
    r++;
  }
  const last = Math.max(first, r - 1), tr = r, col = (c) => String.fromCharCode(65 + c);
  sh.set(tr, 0, `Total (${sorted.length} ${sorted.length === 1 ? 'viaje' : 'viajes'})`, tot(null)).merge(tr, 0, tr, 5);
  for (let c = 1; c < n; c++) sh.set(tr, c, '', tot(null));
  for (const c of MONEY_COLS) sh.set(tr, c, sums[c] / 100, tot(F.money), `SUBTOTAL(109,${col(c)}${first + 1}:${col(c)}${last + 1})`);
  sh.freeze(H0 + 1).filter(H0, 0, last, n - 1);
  sh.set(tr + 2, 0, 'Total después de impuestos = Tarifa base + IVA − ISR − Retención IVA, calculado viaje por viaje. La comisión se calcula siempre sobre la tarifa base, antes de impuestos.', S.note).merge(tr + 2, 0, tr + 2, 12).height(tr + 2, 28);
  return wb;
}
