/*
 * Dinero en centavos (enteros) para evitar errores de punto flotante.
 * $3,000.00 se guarda como 300000.
 */
/* Texto capturado → centavos. null si está vacío; NaN si no es un monto válido (máximo 2 decimales, sin negativos). */
export function toCents(v) {
  if (v == null) return null;
  let s = String(v).trim().replace(/[$\s,]/g, '').replace(/MXN$/i, '');
  if (s === '') return null;
  if (/^\.\d{1,2}$/.test(s)) s = '0' + s;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  const [i, d = ''] = s.split('.');
  return Number(i) * 100 + Number((d + '00').slice(0, 2));
}
/* Centavos → "3,000.00" (exacto, sin dividir flotantes) */
function plain(cents) {
  const a = Math.abs(Math.round(cents));
  return Math.floor(a / 100).toLocaleString('es-MX') + '.' + String(a % 100).padStart(2, '0');
}
/* Centavos → "$3,000.00"; sign: muestra +/− ; mxn: agrega "MXN" */
export function money(cents, { sign = false, mxn = false } = {}) {
  const c = Math.round(cents || 0);
  const pre = c < 0 ? '−' : sign && c > 0 ? '+' : '';
  return `${pre}$${plain(c)}${mxn ? ' MXN' : ''}`;
}
/* Valor para un campo de captura (sin símbolo ni comas): 300000 → "3000.00" */
export const centsInput = (c) => (c == null ? '' : (Math.round(c) / 100).toFixed(2));
/* Limpia lo que se escribe en un campo de monto */
/* Conserva un signo negativo inicial para poder rechazarlo con un mensaje claro (no se corrige en silencio) */
export const moneyClean = (v) => String(v || '').replace(/[^\d.\-]/g, '').replace(/(?!^)-/g, '').replace(/(\..*)\./g, '$1');
