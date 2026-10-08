/*
 * Logística — estados operativos y divisiones.
 * Los valores internos (key) se guardan; el texto (label) solo se muestra. Para agregar un estado nuevo basta con
 * añadirlo aquí: filtros, agrupación, chips, colores y hoja de «Actualizar estado» se construyen desde esta lista.
 *   tone      color discreto del estado (ver styles/logistics.css: .lg-t-<tone>)
 *   rank      orden de los grupos y filtros (menor = primero)
 *   working   la unidad está trabajando: impide una segunda operación para la misma unidad
 *   closable  al elegirlo se ofrece cerrar la operación y pasarla al historial
 *   track     con este estado se puede compartir el rastreo con el cliente; al pasar a un estado sin «track» la entrega
 *             se considera finalizada y el enlace público deja de dar la ubicación (el texto que ve el cliente lo define
 *             el Worker gps-proxy: TRACK_STATUS_TEXT)
 */
export const LOGISTICS_STATUSES = [
  { key: 'to_destination', label: 'En ruta a destino', short: 'En ruta', tone: 'blue', rank: 1, working: true, track: true, hint: 'Cargada, rumbo al lugar de entrega' },
  { key: 'empty', label: 'Vacío', short: 'Vacío', tone: 'light', rank: 4, working: false, hint: 'Sin carga, disponible' },
  { key: 'empty_transit', label: 'En ruta vacío', short: 'En ruta vacío', tone: 'teal', rank: 2, working: true, hint: 'Circulando sin carga' },
  { key: 'unloading', label: 'Descargando', short: 'Descargando', tone: 'amber', rank: 3, working: true, track: true, hint: 'En el lugar de entrega' },
  { key: 'inactive', label: 'Inactiva', short: 'Inactiva', tone: 'gray', rank: 5, working: false, closable: true, hint: 'Sin operación' },
];
/* Estado de una unidad sin operación abierta */
export const DEFAULT_STATUS = 'inactive';
/* Estado inicial de una asignación nueva */
export const NEW_STATUS = 'to_destination';

const BY_KEY = new Map(LOGISTICS_STATUSES.map((s) => [s.key, s]));
export const statusOf = (key) => BY_KEY.get(key) || BY_KEY.get(DEFAULT_STATUS);
export const statusLabel = (key) => statusOf(key).label;
export const isStatus = (key) => BY_KEY.has(key);
/* Estados ordenados para filtros y grupos */
export const STATUS_ORDER = [...LOGISTICS_STATUSES].sort((a, b) => a.rank - b.rank);
/* La unidad está trabajando (no admite una segunda operación activa) */
export const isWorking = (key) => !!(BY_KEY.get(key) || {}).working;
/* Regla de Inicio → «Unidades en operación»: estado ≠ Inactiva y estado ≠ Vacío */
export const showOnHome = (key) => key !== 'inactive' && key !== 'empty';

export const LOGISTICS_DIVISIONS = [['puerto', 'División Puerto', 'Puerto'], ['campo', 'División Campo', 'Campo']];
export const divisionLabel = (k, short = false) => { const d = LOGISTICS_DIVISIONS.find(([x]) => x === k); return d ? d[short ? 2 : 1] : ''; };
/* División que normalmente usa cada tipo de remolque (solo sugerencia: no se bloquean excepciones) */
export const TYPE_DIVISION = { chasis: 'puerto', jaula: 'campo', tolva: 'campo' };
