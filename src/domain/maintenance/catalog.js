/*
 * Taller — catálogos fijos: sistemas y componentes por tipo de equipo, tipos de mantenimiento, estados, gravedad,
 * acciones y tipos de trabajo. Los valores internos (key/id) se guardan; los textos solo se muestran.
 * Ampliable: agregar un componente aquí basta para que aparezca en las listas (y en el diagrama si se le dibuja una
 * región en domain/maintenance/diagrams.js). Los componentes que el usuario agrega se guardan aparte
 * (store maintenanceParts) y se muestran junto a estos, sin región en el diagrama.
 * No todos los componentes aplican a todos los modelos: solo se listan para elegir; nada se asume.
 */

/* Tipo de equipo del Taller: tractocamión o tipo de remolque del catálogo (chasis, jaula, tolva) */
export const EQUIPMENT_KINDS = [
  ['tractor', 'Tractocamión'], ['chasis', 'Chasis portacontenedor'], ['jaula', 'Jaula'], ['tolva', 'Tolva'],
];
export const kindLabel = (k) => (EQUIPMENT_KINDS.find(([x]) => x === k) || [null, 'Remolque sin clasificar'])[1];

/* Componentes de versiones anteriores (antes de separar las llantas por lado): se conservan para leer y dibujar los
   registros existentes (se pintan en ambos lados), pero ya no se ofrecen para capturar */
const LEGACY = { legacy: true };
const TRAILER_TIRES = [['llantas_izq', 'Llantas · lado izquierdo'], ['llantas_der', 'Llantas · lado derecho'], ['llantas', 'Llantas (ambos lados)', LEGACY]];
export const LEGACY_ALIASES = {
  tractor: { llantas_del: ['llantas_del_izq', 'llantas_del_der'], llantas_trac: ['llantas_trac_izq', 'llantas_trac_der'] },
  chasis: { llantas: ['llantas_izq', 'llantas_der'] }, jaula: { llantas: ['llantas_izq', 'llantas_der'] }, tolva: { llantas: ['llantas_izq', 'llantas_der'] },
};
/* Un componente y los anteriores que también lo cubren (historial de «Llantas de tracción · lado izquierdo» incluye
   los registros de «Llantas de tracción (ambos lados)») */
export function relatedIds(kind, id) {
  const al = LEGACY_ALIASES[kind] || {};
  return [id, ...Object.keys(al).filter((k) => al[k].includes(id))];
}
/* Componente de llanta según el lado de la posición (E2-IE → izquierda) y el tipo de eje */
export function tireComponentOf(kind, side, axleKind) {
  const s = side === 'D' ? 'der' : 'izq';
  if (kind === 'tractor') return `${axleKind === 'dir' ? 'llantas_del' : 'llantas_trac'}_${s}`;
  return `llantas_${s}`;
}

/* Sistemas → componentes (id único dentro del tipo de equipo) */
export const SYSTEMS = {
  tractor: [
    { id: 'motor', name: 'Motor', parts: [['motor', 'Motor'], ['lubricacion', 'Sistema de lubricación'], ['enfriamiento', 'Sistema de enfriamiento'], ['turbo', 'Turbo'], ['combustible', 'Sistema de combustible'], ['radiador', 'Radiador']] },
    { id: 'tren', name: 'Transmisión y tren motriz', parts: [['transmision', 'Transmisión'], ['embrague', 'Embrague (cuando aplique)'], ['cardan', 'Cardán'], ['diferenciales', 'Diferenciales'], ['ejes', 'Ejes']] },
    { id: 'frenos', name: 'Frenos', parts: [['frenos_del', 'Frenos delanteros'], ['frenos_tras', 'Frenos traseros'], ['lineas_aire', 'Líneas de aire'], ['camaras', 'Cámaras de freno'], ['compresor', 'Compresor']] },
    { id: 'suspension', name: 'Suspensión', parts: [['susp_del', 'Suspensión delantera'], ['susp_tras', 'Suspensión trasera'], ['amortiguadores', 'Amortiguadores'], ['bolsas_aire', 'Bolsas de aire']] },
    { id: 'direccion', name: 'Dirección', parts: [['direccion', 'Sistema de dirección'], ['terminales', 'Terminales'], ['caja_dir', 'Caja de dirección']] },
    { id: 'electrico', name: 'Sistema eléctrico', parts: [['baterias', 'Baterías'], ['alternador', 'Alternador'], ['marcha', 'Marcha'], ['luces', 'Luces'], ['cableado', 'Cableado']] },
    { id: 'cabina', name: 'Cabina y carrocería', parts: [['cabina', 'Cabina'], ['parabrisas', 'Parabrisas'], ['espejos', 'Espejos'], ['puertas', 'Puertas'], ['defensas', 'Defensas'], ['cofre', 'Cofre']] },
    { id: 'neumaticos', name: 'Neumáticos', parts: [['llantas_del_izq', 'Llantas delanteras · lado izquierdo'], ['llantas_del_der', 'Llantas delanteras · lado derecho'],
      ['llantas_trac_izq', 'Llantas de tracción · lado izquierdo'], ['llantas_trac_der', 'Llantas de tracción · lado derecho'], ['rines', 'Rines'], ['valvulas', 'Válvulas'],
      ['llantas_del', 'Llantas delanteras (ambos lados)', LEGACY], ['llantas_trac', 'Llantas de tracción (ambos lados)', LEGACY]] },
  ],
  chasis: [
    { id: 'estructura', name: 'Estructura y acoplamiento', parts: [['estructura', 'Estructura'], ['largueros', 'Largueros'], ['patines', 'Patines'], ['acoplamiento', 'Quinta rueda / perno rey (acoplamiento)'], ['seguros', 'Seguros del contenedor']] },
    { id: 'rodamiento', name: 'Rodamiento y frenos', parts: [['ejes', 'Ejes'], ['suspension', 'Suspensión'], ['frenos', 'Frenos'], ...TRAILER_TIRES] },
    { id: 'electrico', name: 'Sistema eléctrico', parts: [['luces', 'Luces'], ['conectores', 'Conectores']] },
  ],
  jaula: [
    { id: 'carroceria', name: 'Estructura y carrocería', parts: [['estructura', 'Estructura'], ['paneles', 'Paneles'], ['puertas', 'Puertas'], ['piso', 'Piso'], ['acoplamiento', 'Acoplamiento']] },
    { id: 'rodamiento', name: 'Rodamiento y frenos', parts: [['ejes', 'Ejes'], ['frenos', 'Frenos'], ['suspension', 'Suspensión'], ...TRAILER_TIRES] },
    { id: 'electrico', name: 'Sistema eléctrico', parts: [['luces', 'Luces']] },
  ],
  tolva: [
    { id: 'carroceria', name: 'Estructura y caja', parts: [['estructura', 'Estructura'], ['caja', 'Caja']] },
    { id: 'descarga', name: 'Descarga', parts: [['descarga', 'Sistema de descarga'], ['compuertas', 'Compuertas'], ['hidraulico', 'Mecanismos hidráulicos (si aplica)']] },
    { id: 'rodamiento', name: 'Rodamiento y frenos', parts: [['suspension', 'Suspensión'], ['ejes', 'Ejes'], ['frenos', 'Frenos'], ...TRAILER_TIRES] },
    { id: 'electrico', name: 'Sistema eléctrico', parts: [['luces', 'Luces']] },
  ],
};
/* Sistema «Otros» para los componentes agregados por el usuario */
export const CUSTOM_SYSTEM = { id: 'otros', name: 'Otros componentes' };

/* Componentes de un tipo de equipo (fijos + agregados por el usuario para ese tipo); withLegacy: también los anteriores */
export function componentsOf(kind, custom = [], { withLegacy = false } = {}) {
  const out = [];
  for (const s of SYSTEMS[kind] || []) for (const [id, name, o] of s.parts) if (withLegacy || !(o && o.legacy)) out.push({ id, name, system: s.id, systemName: s.name, custom: false, legacy: !!(o && o.legacy) });
  for (const c of custom) if (c && c.kind === kind && !c.deletedAt) {
    const sys = (SYSTEMS[kind] || []).find((s) => s.id === c.system) || CUSTOM_SYSTEM;
    out.push({ id: c.id, name: c.name, system: sys.id, systemName: sys.name, custom: true });
  }
  return out;
}
export const componentOf = (kind, id, custom = []) => componentsOf(kind, custom, { withLegacy: true }).find((c) => c.id === id) || null;
export const systemsOf = (kind, custom = []) => {
  const list = (SYSTEMS[kind] || []).map((s) => ({ id: s.id, name: s.name }));
  if (custom.some((c) => c.kind === kind && !c.deletedAt && !list.some((s) => s.id === c.system))) list.push({ ...CUSTOM_SYSTEM });
  return list;
};

/* Tipos de mantenimiento (orden de taller) */
export const ORDER_TYPES = [
  ['preventivo', 'Preventivo'], ['correctivo', 'Correctivo'], ['diagnostico', 'Diagnóstico'], ['dano', 'Reparación por daño'],
  ['aceite', 'Cambio de aceite'], ['reemplazo', 'Reemplazo de componentes'], ['general', 'Servicio general'],
];
/* Estados de la orden. open: el equipo sigue en el taller. */
export const ORDER_STATUSES = [
  { key: 'reportado', label: 'Reportado', tone: 'gray', open: true },
  { key: 'pendiente', label: 'Pendiente de revisión', tone: 'amber', open: true },
  { key: 'diagnostico', label: 'En diagnóstico', tone: 'teal', open: true },
  { key: 'mantenimiento', label: 'En mantenimiento', tone: 'blue', open: true },
  { key: 'refacciones', label: 'Esperando refacciones', tone: 'orange', open: true },
  { key: 'finalizado', label: 'Finalizado', tone: 'ok', open: false },
];
export const orderStatusOf = (k) => ORDER_STATUSES.find((s) => s.key === k) || ORDER_STATUSES[0];
export const isOpenStatus = (k) => orderStatusOf(k).open;

/* Gravedad capturada por el usuario (clasificación administrativa; no decide si el equipo puede circular) */
export const SEVERITIES = [['leve', 'Leve'], ['moderado', 'Moderado'], ['total', 'Daño total']];
export const SEVERITY_RANK = { leve: 1, moderado: 2, total: 3 };
export const severityLabel = (k) => (SEVERITIES.find(([x]) => x === k) || [null, 'Sin daño registrado'])[1];
/* Acción sobre un componente */
export const ACTIONS = [['reparado', 'Reparado'], ['reemplazado', 'Reemplazado'], ['pendiente', 'Pendiente'], ['revisado', 'Revisado']];
export const actionLabel = (k) => (ACTIONS.find(([x]) => x === k) || [null, '—'])[1];
/* Acciones que se ofrecen desde el diagrama */
export const DIAGRAM_ACTIONS = ACTIONS.filter(([k]) => k !== 'revisado');
/* Estado de cada trabajo dentro de la orden */
export const WORK_STATUSES = [['pendiente', 'Pendiente'], ['proceso', 'En proceso'], ['terminado', 'Terminado']];
export const workStatusLabel = (k) => (WORK_STATUSES.find(([x]) => x === k) || [null, '—'])[1];
/* Tipos de trabajo (cada línea de servicio de una orden) */
export const WORK_TYPES = [
  ['aceite', 'Cambio de aceite de motor'], ['filtros', 'Cambio de filtros'], ['reparacion', 'Reparación'], ['reemplazo', 'Reemplazo de componente'],
  ['llantas', 'Reemplazo de llantas'], ['ajuste', 'Ajuste o calibración'], ['lubricacion', 'Lubricación y engrase'], ['diagnostico', 'Revisión o diagnóstico'],
  ['electrico', 'Trabajo eléctrico'], ['soldadura', 'Soldadura o estructura'], ['otro', 'Otro trabajo'],
];
export const workTypeLabel = (k) => (WORK_TYPES.find(([x]) => x === k) || [null, 'Trabajo'])[1];

/* Motivos del cambio de llantas */
export const TIRE_REASONS = [['desgaste', 'Desgaste'], ['ponchadura', 'Ponchadura'], ['dano', 'Daño o corte'], ['reventada', 'Reventada'], ['preventivo', 'Preventivo'], ['otro', 'Otro']];
export const tireReasonLabel = (k) => (TIRE_REASONS.find(([x]) => x === k) || [null, 'Sin motivo'])[1];

/* Motivo documentado cuando el odómetro capturado es menor que el último conocido */
export const ODOMETER_FIXES = [['reemplazo', 'Reemplazo de odómetro o del equipo GPS'], ['captura', 'Error de captura en el registro anterior'], ['otro', 'Otro (explicar en observaciones)']];
