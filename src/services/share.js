/*
 * Compartir y guardar en iPhone.
 * Safari iOS 15+ permite compartir archivos con navigator.share (incluye "Guardar en Archivos" y WhatsApp).
 * IMPORTANTE: navigator.share debe llamarse dentro del toque del usuario, sin esperas previas;
 * por eso las pantallas tienen el archivo listo en memoria antes de mostrar los botones.
 */
export function canShareFiles(file) {
  try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch (e) { return false; }
}
export const canShareText = () => !!navigator.share;

/* Devuelve 'shared' | 'cancelled' | 'unsupported' | 'error' */
export async function shareFile(file, { title, text } = {}) {
  if (!canShareFiles(file)) return 'unsupported';
  try { await navigator.share({ files: [file], title: title || file.name, ...(text ? { text } : {}) }); return 'shared'; }
  catch (e) { return e && e.name === 'AbortError' ? 'cancelled' : 'error'; }
}
export async function shareText(text, title) {
  if (!navigator.share) return 'unsupported';
  try { await navigator.share({ text, ...(title ? { title } : {}) }); return 'shared'; }
  catch (e) { return e && e.name === 'AbortError' ? 'cancelled' : 'error'; }
}
export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
/*
 * Abre el PDF en el visor del sistema (pestaña nueva en navegador).
 * Un blob: se abre con el origen de la app, así que solo se abren tipos inertes (PDF o imagen). Cualquier otro tipo
 * (HTML, SVG, XML… p. ej. de un adjunto importado de un respaldo) se abre como PDF para que nunca se ejecute como página.
 */
const OPEN_SAFE = /^(application\/pdf|image\/(jpeg|png|webp|gif))$/i;
export function openBlob(blob) {
  const safe = OPEN_SAFE.test(blob.type || '') ? blob : new Blob([blob], { type: 'application/pdf' });
  const u = URL.createObjectURL(safe);
  const w = window.open(u, '_blank');
  if (w) { try { w.opener = null; } catch (e) { /* */ } } else location.href = u;
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
export const waURL = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);
export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    try { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e2) { return false; }
  }
}
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
