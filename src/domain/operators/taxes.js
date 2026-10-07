/*
 * Impuestos y retenciones por viaje — ÚNICA implementación del cálculo fiscal.
 * La usan el formulario de viaje, el detalle, los listados, los resúmenes, Cobranza, el PDF y el Excel.
 *
 *   TOTAL DESPUÉS DE IMPUESTOS = TARIFA BASE + IVA − ISR − RETENCIÓN IVA
 *
 * Reglas:
 *   - La tarifa base es el campo «fare» del viaje (centavos): el importe ANTES de impuestos.
 *   - Cada concepto se activa por viaje y se calcula sobre la tarifa base, redondeado a centavos.
 *   - La comisión del operador NO se calcula aquí ni depende de esto: sigue siendo tarifa base × % (balance.js).
 *   - Un viaje sin datos fiscales (históricos, importados) equivale a «nada aplicado»: total = tarifa base.
 *   - La Retención IVA jamás se activa sola: no existe ningún valor predeterminado que la encienda.
 *
 * Campos guardados en cada viaje (uno por concepto, para auditoría):
 *   applyVat, vatRate, vatAmount | applyIsr, isrRate, isrAmount |
 *   applyVatWithholding, vatWithholdingRate, vatWithholdingAmount | totalAfterTaxes
 */
export const VAT_RATE = 16;               // IVA, %
export const ISR_RATE = 4;                // ISR (retención), %
export const VAT_WITHHOLDING_RATE = 4;    // Retención de IVA, %

/* Valores iniciales de un viaje NUEVO según la división. La retención de IVA siempre inicia apagada. */
export function defaultTaxFlags(division) {
  const campo = division === 'campo';
  return { applyVat: campo, applyIsr: campo, applyVatWithholding: false };
}

const rateOf = (v, def) => (Number.isFinite(v) && v >= 0 ? v : def);
const part = (base, rate) => Math.round(base * rate / 100);

/*
 * Cálculo a partir de la tarifa base (centavos) y de qué conceptos aplican.
 * flags = { applyVat, applyIsr, applyVatWithholding }; rates opcional = { vatRate, isrRate, vatWithholdingRate }.
 */
export function computeTaxes(fare, flags = {}, rates = {}) {
  const base = Number.isFinite(fare) && fare > 0 ? Math.round(fare) : 0;
  const applyVat = !!flags.applyVat, applyIsr = !!flags.applyIsr, applyVatWithholding = !!flags.applyVatWithholding;
  const vatRate = rateOf(rates.vatRate, VAT_RATE), isrRate = rateOf(rates.isrRate, ISR_RATE), vatWithholdingRate = rateOf(rates.vatWithholdingRate, VAT_WITHHOLDING_RATE);
  const vatAmount = applyVat ? part(base, vatRate) : 0;
  const isrAmount = applyIsr ? part(base, isrRate) : 0;
  const vatWithholdingAmount = applyVatWithholding ? part(base, vatWithholdingRate) : 0;
  return {
    fareBase: base, applyVat, vatRate, vatAmount, applyIsr, isrRate, isrAmount, applyVatWithholding, vatWithholdingRate, vatWithholdingAmount,
    totalAfterTaxes: base + vatAmount - isrAmount - vatWithholdingAmount, any: applyVat || applyIsr || applyVatWithholding,
  };
}

/* Situación fiscal de un viaje guardado (los que no tienen datos fiscales: nada aplicado) */
export const tripTaxes = (trip) => computeTaxes(trip.fare, trip, trip);

/* Campos fiscales que se guardan en el viaje */
export function taxFields(fare, flags, rates) {
  const { fareBase, any, ...fields } = computeTaxes(fare, flags, rates);
  return fields;
}

/* Totales de un conjunto de viajes, sumados viaje por viaje con la configuración de cada uno */
export function sumTaxes(trips) {
  const s = { count: 0, fares: 0, vat: 0, isr: 0, vatWithholding: 0, total: 0, withVat: 0, withIsr: 0, withVatWithholding: 0 };
  for (const t of trips) {
    const x = tripTaxes(t);
    s.count += 1; s.fares += x.fareBase; s.vat += x.vatAmount; s.isr += x.isrAmount; s.vatWithholding += x.vatWithholdingAmount; s.total += x.totalAfterTaxes;
    if (x.applyVat) s.withVat += 1; if (x.applyIsr) s.withIsr += 1; if (x.applyVatWithholding) s.withVatWithholding += 1;
  }
  return s;
}

/* Texto corto de lo aplicado, p. ej. «IVA 16% + ISR 4%»; vacío si no aplica nada */
export function taxLabel(x) {
  return [x.applyVat && `IVA ${x.vatRate}%`, x.applyIsr && `ISR ${x.isrRate}%`, x.applyVatWithholding && `Ret. IVA ${x.vatWithholdingRate}%`].filter(Boolean).join(' + ');
}
