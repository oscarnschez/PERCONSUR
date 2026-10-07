import { analyzeVehicle, indicators, fleetSummary, fuelRange, compareUnits, odometerCheck, monthly } from '../src/domain/fuel/fuel.js';
const ok = (c, m) => console.log((c ? 'OK  ' : 'FAIL') + ' ' + m);
let i = 0; const R = (date, odo, liters, amount, full, time = '08:00') => ({ id: 'r' + (++i), vehicleId: 'v1', date, time, odometer: odo, liters, amount, fullTank: full, createdAt: i });
// Ejemplo de la especificación: tanque lleno, parciales 100 L y 80 L, tanque lleno 120 L, 900 km → 300 L → 3.00 km/L
let an = analyzeVehicle([R('2026-10-01', 125430, 300, 750000, true), R('2026-10-02', 125700, 100, 250000, false), R('2026-10-03', 126000, 80, 200000, false), R('2026-10-05', 126330, 120, 300000, true)]);
const s = an.segments[0];
ok(an.segments.length === 1 && s.km === 900 && s.liters === 300 && s.kmL.toFixed(2) === '3.00', `parciales sumadas: ${s.km} km / ${s.liters} L = ${s.kmL.toFixed(2)} km/L`);
ok(an.rows.map((x) => x.status).join(',') === 'inicia,parcial,parcial,cierra', 'estados de cada carga: ' + an.rows.map((x) => x.status).join(','));
ok(an.rows[1].km === 270 && an.totals.km === 900, 'km entre recargas consecutivas (270) y total recorrido (900)');
// 850 km / 280 L
an = analyzeVehicle([R('2026-10-01', 125430, 200, 0, true), R('2026-10-05', 126280, 280, 700000, true)]);
ok(an.segments[0].kmL.toFixed(2) === '3.04' && an.segments[0].l100.toFixed(2) === '32.94', `850 km / 280 L = ${an.segments[0].kmL.toFixed(2)} km/L y ${an.segments[0].l100.toFixed(2)} L/100 km`);
ok(an.rows[1].ppl === 25, 'precio por litro derivado: $7,000 / 280 L = $25.00');
// Pendiente: sin segunda carga llena no hay rendimiento
an = analyzeVehicle([R('2026-10-01', 1000, 200, 0, false), R('2026-10-02', 1500, 150, 0, true), R('2026-10-03', 1800, 90, 0, false)]);
ok(an.segments.length === 0 && an.pending && an.pending.liters === 90 && indicators(an, '2026-10-07').current === null, 'sin dos tanques llenos: rendimiento pendiente (no se inventa)');
ok(an.rows[0].status === 'sinbase', 'parcial antes del primer tanque lleno no entra en ningún periodo');
// Corrección de odómetro: reinicia la medición
an = analyzeVehicle([R('2026-09-01', 5000, 100, 0, true), R('2026-09-05', 5300, 100, 0, true), R('2026-09-07', 200, 100, 0, true), R('2026-09-09', 500, 100, 0, true)]);
ok(an.segments.length === 2 && an.segments.every((x) => x.km === 300) && an.rows[2].brk, 'odómetro menor (corrección): no hay distancia negativa, la medición se reinicia');
// Editar/eliminar recalcula: quitar la parcial de 80 L cambia el periodo
const base = [R('2026-10-01', 125430, 300, 0, true), R('2026-10-02', 125700, 100, 0, false), R('2026-10-03', 126000, 80, 0, false), R('2026-10-05', 126330, 120, 0, true)];
base[2].deletedAt = Date.now();
an = analyzeVehicle(base); ok(an.segments[0].liters === 220, 'al eliminar una recarga el periodo se recalcula (220 L)');
// Indicadores y variación
an = analyzeVehicle([R('2026-06-01', 0, 100, 0, true), R('2026-06-10', 950, 320, 0, true), R('2026-09-20', 1900, 330, 0, true), R('2026-10-05', 2700, 300, 0, true)]);
const ind = indicators(an, '2026-10-07');
ok(ind.current.kmL.toFixed(2) === '2.67' && ind.hist.kmL.toFixed(2) === (2700 / 950).toFixed(2) && ind.avg30.n === 2 && ind.avg90.n === 2, `actual ${ind.current.kmL.toFixed(2)}, histórico ponderado ${ind.hist.kmL.toFixed(2)}, 30 días ${ind.avg30.n} periodos, 90 días ${ind.avg90.n}`);
ok(ind.variation.toFixed(1) === (((800 / 300) - 2700 / 950) / (2700 / 950) * 100).toFixed(1) && ind.best.kmL > ind.worst.kmL, `variación ${ind.variation.toFixed(1)}%, mejor ${ind.best.kmL.toFixed(2)}, peor ${ind.worst.kmL.toFixed(2)}`);
// Flota y periodos
const fl = fleetSummary([{ id: 'v1', an }, { id: 'v2', an: analyzeVehicle([]) }], fuelRange('mes', {}, '2026-10-07'));
ok(fl.active === 1 && fl.liters === 300 && fl.perf.kmL.toFixed(2) === '2.67', 'resumen de flota del mes: 1 unidad activa, 300 L, 2.67 km/L');
ok(JSON.stringify(fuelRange('semana', {}, '2026-10-07')) === '{"from":"2026-10-05","to":"2026-10-07"}', 'esta semana (lunes a hoy): ' + JSON.stringify(fuelRange('semana', {}, '2026-10-07')));
// Validación de odómetro
const chk = odometerCheck(base.filter((x) => !x.deletedAt), { date: '2026-10-06', time: '09:00', odometer: 126000 });
ok(chk.lowerThanPrev && chk.prev.odometer === 126330, 'detecta odómetro menor al de la recarga anterior');
ok(monthly(an, 12, '2026-10-07').at(-1).liters === 300, 'serie mensual de litros');
