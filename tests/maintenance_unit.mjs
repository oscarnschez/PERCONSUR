/* Reglas del Taller (sin navegador): node maintenance_unit.mjs — también genera un PDF del reporte con pdf-lib */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { componentsOf, componentOf, SYSTEMS, ORDER_STATUSES, isOpenStatus } from '../src/domain/maintenance/catalog.js';
import {
  durationText, toTs, fmtDT, equipmentCode, folioOf, validateOrder, parseKm, parseCount, latestReading, readingAge, odometerCheck, componentStates, numbering,
  STATE_COLORS, oilStatus, oilLine, positionsOf, positionLabel, validateTires, pendingPositions, availabilityOf, filterOrders, matchOrder, equipmentSummary,
} from '../src/domain/maintenance/maintenance.js';
import { viewsOf, componentViews, svgMarkup, pdfItems, tireSvg } from '../src/domain/maintenance/diagrams.js';
import { buildMaintenanceReport } from '../src/domain/maintenance/report.js';
import { modelToPdf } from '../src/domain/operators/statement.js';
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1; };
const H = 3600000, D = 24 * H;

/* Tiempo en taller */
const tin = toTs('2026-10-08', '09:30'), tout = toTs('2026-10-10', '16:00');
ok(durationText(tout - tin) === '2 días, 6 horas y 30 minutos' && fmtDT(tin) === '08/10/2026 · 09:30', 'ejemplo: 08/10/2026 · 09:30 → 10/10/2026 · 16:00 = 2 días, 6 horas y 30 minutos');
ok(durationText(D) === '1 día' && durationText(H + 60000) === '1 hora y 1 minuto' && durationText(0) === '0 minutos' && durationText(-1) === '', 'singulares, partes en cero omitidas y duración negativa sin texto');

/* Folio */
ok(folioOf(equipmentCode({ type: 'vehicle', eco: '21' }), '20261008', 1) === 'MTTO-U21-20261008-001' && equipmentCode({ type: 'vehicle', eco: '5' }) === 'U05' && equipmentCode({ type: 'trailer', placas: '56-UH-2X' }) === '56UH2X', 'folio MTTO-U21-20261008-001 (unidad) y placas para remolque');

/* Validaciones */
const base = { equipmentType: 'vehicle', vehicleId: 'v1', inAt: tin, outAt: null, status: 'mantenimiento', odometer: 125000 };
ok(!Object.keys(validateOrder(base)).length, 'orden válida sin salida mientras está abierta');
ok(validateOrder({ ...base, outAt: tin - 60000 }).outAt && validateOrder({ ...base, status: 'finalizado' }).outAt, 'salida anterior al ingreso y finalizar sin salida: rechazados');
ok(validateOrder({ ...base, odometer: -5 }).odometer && validateOrder({ ...base, vehicleId: null }).equipment && validateOrder({ ...base, trailerId: 't1' }).equipment, 'kilometraje negativo, orden sin equipo o con dos equipos: rechazados');
ok(Number.isNaN(parseKm('-100')) && parseKm('125,000') === 125000 && parseKm('') === null && Number.isNaN(parseCount('-2')) && parseCount('4') === 4 && Number.isNaN(parseCount('0')), 'kilómetros y cantidades negativos no se aceptan');

/* Odómetro conocido (combustible y taller) */
const now = toTs('2026-10-20', '12:00');
const readings = [{ ts: toTs('2026-10-03', '08:00'), km: 124500, source: 'combustible', ref: 'f1' }, { ts: toTs('2026-09-01', '08:00'), km: 118000, source: 'taller', ref: 'o0' }];
ok(latestReading(readings).km === 124500 && latestReading(readings, toTs('2026-09-15')).km === 118000, 'último odómetro conocido (anterior a la fecha del servicio)');
ok(readingAge(latestReading(readings), now).stale && readingAge(latestReading(readings), now).text === 'hace 17 días', 'dato de odómetro desactualizado (más de 15 días)');
const ck = odometerCheck(120000, readings, tin);
ok(ck.lower && ck.prev.km === 124500 && !odometerCheck(125000, readings, tin).lower, 'kilometraje menor que el último conocido: se detecta (para documentar la corrección)');

/* Colores del diagrama: reemplazado azul > gravedad más alta; desglose conservado */
const st = componentStates([
  { componentId: 'frenos_tras', severity: 'leve', action: 'reparado' }, { componentId: 'frenos_tras', severity: 'total', action: 'pendiente' },
  { componentId: 'susp_tras', severity: 'moderado', action: 'reemplazado', replaced: true }, { componentId: 'cofre', severity: 'leve', action: 'reparado' },
  { componentId: 'filtro', severity: '', action: 'revisado' }, { componentId: 'puertas', severity: 'moderado', action: 'reparado', deletedAt: 1 },
]);
ok(st.get('frenos_tras').state === 'total' && st.get('frenos_tras').items.length === 2, 'varias incidencias: se usa la gravedad más alta sin perder el desglose');
ok(st.get('susp_tras').state === 'reemplazado' && st.get('susp_tras').severity === 'moderado', 'reemplazado: azul y conserva el daño original (moderado)');
ok(st.get('cofre').state === 'leve' && st.get('filtro').state === 'none' && !st.has('puertas'), 'leve amarillo; sin gravedad gris; registros eliminados no cuentan');
ok(STATE_COLORS.none === '#C4CAD4' && STATE_COLORS.leve === '#FACC15' && STATE_COLORS.moderado === '#F97316' && STATE_COLORS.total === '#DC2626' && STATE_COLORS.reemplazado === '#2563EB', 'codificación: gris, amarillo, naranja, rojo y azul');
const nums = numbering(st, 'tractor');
ok(nums.get('cofre') < nums.get('frenos_tras') || nums.get('frenos_tras') < nums.get('susp_tras'), 'numeración estable según el catálogo');

/* Catálogo y diagramas: cada componente del catálogo tiene región en algún diagrama */
for (const k of ['tractor', 'chasis', 'jaula', 'tolva']) {
  const cv = componentViews(k), missing = componentsOf(k).filter((c) => !cv.has(c.id)).map((c) => c.id);
  ok(!missing.length && viewsOf(k).length >= 3, `${k}: ${componentsOf(k).length} componentes, ${viewsOf(k).length} vistas, todos seleccionables ${missing.join(',')}`);
}
ok(viewsOf('tractor').map((v) => v.id).join() === 'izq,der,frente,trasera,sistemas', 'tractocamión: lateral izquierda y derecha, frontal, trasera y esquema de sistemas');
const custom = [{ id: 'x_1', kind: 'tolva', system: 'descarga', name: 'Lona' }];
ok(componentOf('tolva', 'x_1', custom).name === 'Lona' && !componentOf('jaula', 'x_1', custom), 'componentes agregados por el usuario, solo para su tipo de equipo');
const svg = svgMarkup('tractor', 'izq', { states: st, numbers: nums, interactive: true });
ok(svg.includes('data-c="susp_tras"') && svg.includes('#2563EB') && svg.includes('class="dg-n"'), 'SVG interactivo con regiones, colores y números');
const der = svgMarkup('tractor', 'der'), izq = svgMarkup('tractor', 'izq');
ok(der !== izq && /M916,298/.test(der), 'vista lateral derecha reflejada (no la misma imagen)');
const items = pdfItems('jaula', 'lado', { states: componentStates([{ componentId: 'paneles', severity: 'moderado' }]), numbers: new Map([['paneles', 1]]) }, { x: 48, y: 100, w: 516, h: 200 });
ok(items.items.some((i) => i.t === 'path' && i.fill === '#F97316') && items.w <= 516 && !items.items.some((i) => i.t === 'path' && /[A]/.test(i.d)), 'trazos del PDF: misma geometría, sin arcos (compatibles con pdf-lib)');

/* Aceite */
const ch = [{ ts: toTs('2026-08-01'), odometer: 125000 }];
const o1 = oilStatus({ changes: ch, plan: { oilKm: 25000 }, current: { ts: toTs('2026-10-15'), km: 148500 }, now });
ok(o1.nextKm === 150000 && o1.remainingKm === 1500 && o1.state === 'proximo' && /Restan aproximadamente 1,500 km/.test(oilLine(o1)), 'próximo cambio = 125,000 + 25,000 = 150,000 km; restan 1,500 km → «Próximo cambio de aceite»');
ok(oilStatus({ changes: ch, plan: { oilKm: 25000 }, current: { ts: toTs('2026-10-15'), km: 151000 }, now }).state === 'vencido', 'alcanzado o superado → cambio de aceite pendiente');
ok(oilStatus({ changes: ch, plan: {}, current: null, now }).state === 'sin_intervalo' && oilStatus({ changes: [], plan: { oilKm: 1 }, now }).state === 'sin_registro', 'sin intervalo o sin cambio registrado: no se calcula (no se inventa)');
ok(oilStatus({ changes: ch, plan: { oilKm: 25000, oilDays: 60 }, current: { ts: toTs('2026-08-10'), km: 126000 }, now }).state === 'vencido', 'intervalo por tiempo opcional (60 días vencidos)');
ok(oilStatus({ changes: ch, plan: { oilKm: 25000 }, current: { ts: toTs('2026-07-01'), km: 100000 }, now }).remainingKm === 25000, 'una lectura anterior al último cambio no se usa');

/* Llantas */
ok(positionsOf('t6x4').length === 10 && positionsOf('t4x2').length === 6 && positionsOf('r2d').length === 8 && positionsOf('r3s').length === 6, 'posiciones por configuración (6×4: 10, 4×2: 6, 2 ejes dobles: 8, 3 súper single: 6)');
ok(positionLabel('E2-IE', 'trac') === 'Eje 2 (de tracción) · izquierda exterior' && positionLabel('E1-D', 'dir') === 'Eje 1 (direccional) · derecha', 'nombre de cada posición');
ok(!Object.keys(validateTires({ quantity: 4, positions: ['E2-IE', 'E2-II'], layout: 't6x4' })).length && pendingPositions({ quantity: 4, positions: ['E2-IE', 'E2-II'] }) === 2, 'cantidad 4 con 2 posiciones conocidas: 2 pendientes de especificar');
ok(validateTires({ quantity: 2, positions: ['E2-IE', 'E2-II', 'E3-DE'], layout: 't6x4' }).positions && validateTires({ quantity: 2, positions: ['E9-IE'], layout: 't6x4' }).positions && validateTires({ quantity: 0 }).quantity, 'más posiciones que la cantidad, posiciones inexistentes o cantidad 0: rechazados');
ok(tireSvg('t6x4', { replaced: new Set(['E2-IE']) }).split('#2563EB').length === 2, 'esquema de llantas: posiciones reemplazadas en azul');

/* Disponibilidad independiente del viaje */
const orders = [{ id: 'a', equipmentType: 'vehicle', vehicleId: 'v1', status: 'mantenimiento', inAt: tin, outOfService: true }, { id: 'b', equipmentType: 'vehicle', vehicleId: 'v2', status: 'diagnostico', inAt: tin, outOfService: false }, { id: 'c', equipmentType: 'trailer', trailerId: 't1', status: 'finalizado', inAt: tin, outAt: tout }];
ok(availabilityOf(orders, 'v:v1').inShop && !availabilityOf(orders, 'v:v2').inShop && !availabilityOf(orders, 't:t1').inShop, 'En taller solo con orden abierta y fuera de servicio (finalizada o que puede operar: disponible)');
ok(ORDER_STATUSES.length === 6 && isOpenStatus('refacciones') && !isOpenStatus('finalizado'), 'estados de la orden');

/* Historial y reportes por periodo */
const hist = [{ id: '1', inAt: toTs('2026-09-02'), type: 'preventivo', status: 'finalizado', folio: 'MTTO-U21-20260902-001' }, { id: '2', inAt: toTs('2026-10-08'), type: 'correctivo', status: 'mantenimiento', folio: 'MTTO-U21-20261008-001', reason: 'Frenos' }];
ok(filterOrders(hist, { from: '2026-10-01' }).length === 1 && filterOrders(hist, { types: new Set(['preventivo']) })[0].id === '1' && filterOrders(hist, { statuses: new Set(['finalizado']) }).length === 1, 'reporte de servicios: periodo, tipos y estados');
ok(matchOrder(hist[1], 'mtto-u21-20261008') && matchOrder(hist[1], '08/10/2026') && matchOrder(hist[1], 'suspension', { componentNames: ['Suspensión trasera'] }) && !matchOrder(hist[0], 'frenos'), 'búsqueda por folio, fecha y componente (sin acentos)');
const sum = equipmentSummary({ orders: [{ ...hist[0], outAt: hist[0].inAt + 2 * D }, hist[1]], components: [{ orderId: '1', action: 'reemplazado', replaced: true }, { orderId: '2', action: 'reparado' }], issues: [{ id: 'i', orderId: null }], now: hist[1].inAt + D });
ok(sum.count === 2 && sum.daysInShop === 3 && sum.replacements === 1 && sum.repairs === 1 && sum.openIssues.length === 1, 'resumen del equipo: servicios, días en taller, reparaciones y reemplazos');

/* Reporte en PDF (pdf-lib en Node): mismo modelo que la vista previa */
const require = createRequire(import.meta.url);
const PDFLib = require('../vendor/pdf-lib.min.js');
const doc = await PDFLib.PDFDocument.create();
const reg = await doc.embedFont(PDFLib.StandardFonts.Helvetica), bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
const measure = (t, s, b) => (b ? bold : reg).widthOfTextAtSize(t, s);
const order = { id: 'o1', folio: 'MTTO-U21-20261008-001', equipmentType: 'vehicle', vehicleId: 'v21', kind: 'tractor', type: 'correctivo', status: 'finalizado', inAt: tin, outAt: tout, odometer: 125000, reason: 'Frenos y suspensión', outOfService: true };
const comps = [{ orderId: 'o1', componentId: 'frenos_tras', severity: 'moderado', action: 'reparado', date: tin }, { orderId: 'o1', componentId: 'susp_tras', severity: 'moderado', action: 'reemplazado', replaced: true, date: tin }, { orderId: 'o1', componentId: 'cofre', severity: 'leve', action: 'reparado', date: tin }];
const services = comps.map((c, i) => ({ id: 's' + i, ...c, type: 'reparacion', workStatus: 'terminado', description: 'Trabajo ' + i }));
const model = buildMaintenanceReport({ mode: 'orden', company: { legal: 'PERCONSUR', addr1: '', addr2: '' }, equipment: { type: 'vehicle', label: 'U21', placas: '61-BN-4J', kind: 'tractor', kindLabel: 'Tractocamión' },
  entries: [{ order, services, components: comps, issues: [], tires: [{ date: tin, quantity: 4, positions: ['E2-IE', 'E2-II'], layout: 't6x4', reason: 'desgaste' }], oil: [], photos: [] }], issuedAt: tout, measure, imgs: { mark: { w: 100, h: 100 }, word: null } });
const flat = model.pages.flatMap((p) => p.items), texts = flat.filter((i) => i.t === 'text').map((i) => i.text).join(' ');
ok(/REPORTE DE MANTENIMIENTO/.test(texts) && /2 días, 6 horas y 30 minutos/.test(texts) && /pendientes de especificar/.test(texts) && /Daño moderado|Moderado/.test(texts), 'modelo del reporte: encabezado, tiempo en taller, llantas pendientes y gravedad');
ok(flat.some((i) => i.t === 'path' && i.fill === '#2563EB') && flat.some((i) => i.t === 'path' && i.fill === '#F97316') && flat.some((i) => i.t === 'path' && i.fill === '#FACC15'), 'el PDF lleva el diagrama con los colores de las intervenciones');
const png = readFileSync(new URL('../assets/brand/perconsur-mark.png', import.meta.url));
const bytes = await modelToPdf(PDFLib, model.pages, { mark: new Uint8Array(png) }, { title: 'Prueba' });
const back = await PDFLib.PDFDocument.load(bytes);
ok(back.getPageCount() === model.pages.length && bytes.length > 5000 && bytes.length < 400000, `PDF vectorial válido (${model.pages.length} páginas, ${Math.round(bytes.length / 1024)} KB)`);
ok(SYSTEMS.tractor.length === 8 && componentsOf('tractor').length === 38, 'catálogo del tractocamión: 8 sistemas, 38 componentes');
