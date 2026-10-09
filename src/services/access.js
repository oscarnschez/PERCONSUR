/*
 * Modo «solo consulta» (dispositivos que reciben la información del capturista; ver services/sync.js).
 * La protección real está en la base de datos local: con el modo activo, db.js rechaza cualquier escritura en los
 * registros compartidos (lanza ReadOnlyError) y el Worker además rechaza publicar con la clave de consulta.
 * La interfaz oculta los botones de captura (html.ro) para que el aviso casi nunca aparezca.
 */
import * as db from './db.js';
import { READER_WRITABLE } from '../domain/sync/sync.js';

export const READ_ONLY_TEXT = 'Este dispositivo es de solo consulta: la información la captura el dispositivo capturista.';
export class ReadOnlyError extends Error {
  constructor() { super(READ_ONLY_TEXT); this.name = 'ReadOnlyError'; this.readOnly = true; }
}
let on = false;
export const isReadOnly = () => on;
export function setReadOnly(value) {
  on = !!value;
  db.setWriteGuard(on ? (store) => { if (!READER_WRITABLE.has(store)) throw new ReadOnlyError(); } : null);
  document.documentElement.classList.toggle('ro', on);
  window.dispatchEvent(new CustomEvent('pcs:readonly', { detail: { on } }));
}
/* Para pantallas que inician una captura: avisa y devuelve true si no se puede */
export function blockedHere(toastFn) {
  if (!on) return false;
  if (toastFn) toastFn(READ_ONLY_TEXT, { type: 'warn', ms: 3500 });
  return true;
}
