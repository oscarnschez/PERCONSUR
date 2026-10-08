/* Reglas del Centro de Monitoreo GPS y del rastreo para clientes (sin navegador): node fleet_unit.mjs */
import { motionOf, fleetKpis, filterRows, sortRows, MOVING_KMH } from '../src/domain/gps/fleet.js';
import { isTrackable, shareBlock, linkPayload, reconcile, destPoint, linkStateText } from '../src/domain/tracking/tracking.js';
import { buildStyle, PROVIDER } from '../src/ui/maps/mapStyle.js';
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1; };
const now = new Date(2026, 9, 8, 12, 0, 0).getTime(), min = 60000;
const P = (o) => ({ lat: 19.01, lng: -103.83, gpsTime: now - 20000, signalTime: now - 5000, ...o });

/* Movimiento reportado por GPS */
ok(motionOf(P({ speed: 62 }), null, now) === 'moving' && motionOf(P({ speed: MOVING_KMH - 1 }), null, now) === 'stopped', 'velocidad ≥ 5 km/h: en movimiento; menor: detenida');
ok(motionOf(P({ gpsTime: now - 40 * min, signalTime: now - min, speed: 0 }), null, now) === 'stopped', 'el equipo reporta pero la posición no cambia: detenida');
ok(motionOf(P({ gpsTime: now - 3 * 3600000, signalTime: now - 3 * 3600000, speed: 70 }), null, now) === 'nosignal', 'sin señal reciente: no se presenta como en movimiento (aunque la última velocidad sea 70)');
ok(motionOf(null, null, now) === 'nosignal' && motionOf({ lat: null, lng: null, gpsTime: now }, null, now) === 'nosignal', 'sin coordenadas: sin señal');
const prev = P({ lat: 19.0, lng: -103.83, gpsTime: now - 80000, speed: null });
ok(motionOf(P({ speed: null }), prev, now) === 'moving' && motionOf(P({ speed: null, lat: 19.0001 }), { ...prev, lat: 19.0 }, now) === 'stopped', 'sin velocidad del proveedor: se mueve si avanzó ≥ 80 m entre lecturas');

/* Indicadores, filtros y buscador */
const rows = [
  { id: 'a', label: 'U12', placas: '60-BN-4J', operator: 'Daniel Rivera', reference: 'MSCU1234567', division: 'puerto', status: 'to_destination', trailerType: 'chasis', operating: true, motion: 'moving' },
  { id: 'b', label: 'U05', placas: '56-BH-1L', operator: 'José Castañeda', reference: '', division: 'campo', status: 'unloading', trailerType: 'jaula', operating: true, motion: 'stopped' },
  { id: 'c', label: 'U21', placas: '61-BN-4J', operator: 'Juan García', reference: 'CAMPO-881', division: 'campo', status: 'empty', trailerType: 'tolva', operating: false, motion: 'nosignal' },
  { id: 'd', label: 'Camioneta oficina', placas: '', operator: '', reference: '', division: '', status: 'inactive', trailerType: '', operating: false, motion: 'stopped', deviceName: 'Camioneta oficina' },
];
const k = fleetKpis(rows);
ok(k.monitored === 4 && k.operating === 2 && k.moving === 1 && k.stopped === 2 && k.nosignal === 1, 'indicadores: monitoreadas, en operación (Logística) y movimiento (GPS) por separado');
const ids = (f) => filterRows(rows, f).map((r) => r.id).join(',');
ok(ids({ division: 'campo' }) === 'b,c' && ids({ division: 'puerto' }) === 'a', 'filtro por división');
ok(ids({ gps: 'moving' }) === 'a' && ids({ gps: 'stopped' }) === 'b,d' && ids({ gps: 'nosignal' }) === 'c', 'filtro por movimiento GPS');
ok(ids({ status: 'unloading' }) === 'b' && ids({ type: 'tolva' }) === 'c' && ids({ operating: true }) === 'a,b', 'filtro por estado del viaje, tipo de remolque y en operación');
ok(ids({ text: 'u12' }) === 'a' && ids({ text: '60bn4j' }) === 'a' && ids({ text: 'castaneda' }) === 'b' && ids({ text: 'mscu 1234567' }) === 'a' && ids({ text: 'camp' }) === 'c', 'buscador: número económico, placas, operador (sin acentos) y referencia');
ok(sortRows(rows, (s) => ({ to_destination: 1, unloading: 3 }[s] || 9)).map((r) => r.id).join(',') === 'a,b,d,c', 'orden: en operación primero, luego detenidas y sin señal');

/* Rastreo para clientes */
ok(isTrackable('to_destination') && isTrackable('unloading') && !isTrackable('empty_transit') && !isTrackable('empty') && !isTrackable('inactive') && !isTrackable('x'), 'se comparte solo En ruta a destino o Descargando');
const op = { id: 'lg_1', vehicleId: 'v1', status: 'to_destination', origin: 'Manzanillo', destination: 'Guadalajara', deliveryPlace: 'CEDIS', operatorId: 'o1' };
ok(shareBlock(op, '865190071363660') === '' && /operación activa/.test(shareBlock({ ...op, closedAt: now }, '1')) && /En ruta a destino o Descargando/.test(shareBlock({ ...op, status: 'empty' }, '1')) && /GPS vinculado/.test(shareBlock(op, '')), 'motivos para no compartir');
const pay = linkPayload(op, { label: 'U12', trailerType: 'chasis', operator: 'Daniel Rivera', placas: '60-BN-4J' }, '865190071363660', { loc: { lat: 20.66, lng: -103.35, precision: 'city' } });
ok(pay.opId === 'lg_1' && pay.place === 'CEDIS' && pay.dest.approx === true && !JSON.stringify(pay).includes('Daniel') && !JSON.stringify(pay).includes('60-BN-4J'), 'al compartir no se envían operador ni placas; destino aproximado marcado');
ok(destPoint(null) === null && destPoint({ loc: { lat: 1, lng: 2, precision: 'manual' } }).approx === false, 'destino solo si ya está ubicado');
const L = (o) => ({ id: 'x' + o.opId, state: 'active', status: 'to_destination', hasDest: true, ...o });
const acts = reconcile([L({ opId: 'a' }), L({ opId: 'b' }), L({ opId: 'c' }), L({ opId: 'd' }), L({ opId: 'e', hasDest: false }), L({ opId: 'f' }), L({ opId: 'g', state: 'finished' })],
  (id) => ({ a: { status: 'to_destination' }, b: { status: 'empty_transit' }, c: { status: 'inactive', closedAt: now }, d: null, e: { status: 'unloading' }, g: { status: 'empty' } }[id]),
  () => ({ lat: 20, lng: -103, approx: false }));
const by = Object.fromEntries(acts.map((a) => [a.link.opId, a]));
ok(!by.a && by.b.action === 'finish' && by.b.body.reason === 'delivered' && by.c.action === 'finish' && by.c.body.reason === 'closed' && by.d.action === 'finish', 'caducidad: al terminar la entrega, cerrar o borrar la operación el enlace se finaliza');
ok(by.e.action === 'update' && by.e.body.status === 'unloading' && by.e.body.dest.lat === 20 && !by.f && !by.g, 'cambio de estado y destino recién ubicado se envían; operaciones de otro dispositivo y enlaces cerrados no se tocan');
ok(/vence en 72 h/.test(linkStateText({ state: 'active', expiresAt: now + 72 * 3600000 }, now)) && /Revocado/.test(linkStateText({ state: 'revoked' }, now)), 'texto del estado del enlace');

/* Estilo cartográfico */
const light = buildStyle('light'), dark = buildStyle('dark');
ok(light.sources.omt.url === PROVIDER.tilejson && /OpenStreetMap/.test(light.sources.omt.attribution) && /OpenFreeMap/.test(PROVIDER.attribution), 'proveedor OpenFreeMap con atribución de OpenStreetMap y OpenMapTiles');
ok(light.layers.length === dark.layers.length && light.layers[0].paint['background-color'] !== dark.layers[0].paint['background-color'] && !light.sprite, 'estilo propio claro y oscuro (sin íconos de terceros)');
ok(JSON.stringify(light).includes('name:es'), 'nombres en español cuando existen');
