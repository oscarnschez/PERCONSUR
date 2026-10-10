/* Tarifas (sin navegador): siembra de BAYER INBOUND 2026, búsqueda, agrupación, validación de lo capturado, respaldo y PDF */
import { createRequire } from 'node:module';
import { TARIFFS, TARIFF_CONFIG, TARIFF_SEED_SHEET } from '../src/config/tariffs.js';
import { UNITS, routesFromRows, seedSheet, zonesOf, destinationsOf, filterRoutes, groupByZone, tariffStats, searchKey, plantShort, checkRoute, upsertRoute, checkSheetName, sanitizeSheet } from '../src/domain/tariffs/tariffs.js';
import { buildTariffReport, tariffReportFilename } from '../src/domain/tariffs/report.js';
import { SYNC_STORES } from '../src/domain/sync/sync.js';
const ok = (c, m) => console.log((c ? 'OK  ' : 'FAIL') + ' ' + m);

/* Siembra: solo combinaciones con monto, todas en configuración sencilla (Tolva y Jaula) */
const total = TARIFFS.reduce((a, r) => a + r[4], 0);
ok(TARIFFS.length === 170 && total === 5716300, `170 tarifas con monto en la siembra (suma $${total.toLocaleString('en-US')}, igual que la hoja)`);
ok(TARIFF_CONFIG === 'Sencillo' && TARIFFS.every((r) => UNITS.includes(r[3])) && TARIFFS.every((r) => Number.isInteger(r[4]) && r[4] > 0), 'configuración sencilla: solo Tolva y Jaula, sin full ni Torton y sin montos vacíos o en cero');
const sh = seedSheet(1000);
ok(sh.id === TARIFF_SEED_SHEET.id && sh.name === 'BAYER INBOUND 2026' && sh.source === 'seed' && sh.routes.length === 85 && new Set(sh.routes.map((r) => r.id)).size === 85, 'apartado inicial «BAYER INBOUND 2026» con 85 rutas (ids únicos)');
const all = sh.routes, st = tariffStats(all);
ok(st.routes === 85 && st.origins === 41 && st.zones === 6 && st.rates === 170 && all.every((r) => r.rates.Tolva > 0 && r.rates.Jaula > 0), '85 rutas de 41 orígenes en 6 zonas, cada una con Tolva y Jaula');
ok(zonesOf(all).join(' | ') === 'Occidente | Pacífico | Bajío zona A | Bajío zona B | Bajío zona C | Bajío zona D', 'zonas unificadas en el orden del tarifario');
ok(destinationsOf(all).join(' | ') === 'Planta Nextipac | Planta Villagrán | Planta Los Mochis' && plantShort('Planta Villagrán') === 'Villagrán', 'plantas con el nombre del catálogo');
const sayula = all.filter((r) => r.origin === 'Sayula');
ok(sayula.length === 2 && sayula[0].rates.Tolva === 2120000 && sayula[0].rates.Jaula === 1720000 && routesFromRows().length === 85, 'importe en centavos: Sayula → Nextipac Tolva $21,200 y Jaula $17,200');

/* Búsqueda y agrupación */
ok(searchKey('San Juan de Abajo, Nay.') === 'sanjuandeabajonay' && searchKey('PÉNJAMO') === 'penjamo', 'clave de búsqueda sin mayúsculas, acentos, espacios ni signos');
ok(filterRoutes(all, { origin: 'san juan' }).length === 3 && filterRoutes(all, { origin: 'SANJUAN' }).length === 3 && filterRoutes(all, { origin: 'pénjamo' }).length === 2, 'buscar origen sin importar espacios, mayúsculas ni acentos');
ok(filterRoutes(all, { dest: 'Planta Los Mochis' }).length === 3 && filterRoutes(all, { dest: 'mochis' }).length === 3 && filterRoutes(all, { origin: 'leon', dest: 'Planta Nextipac' }).length === 1, 'filtro por planta destino y combinado con el origen');
ok(filterRoutes(all, { zone: 'Bajío zona A' }).length === 18, 'filtro por zona: Bajío zona A con 18 rutas');
const g = groupByZone(all);
ok(g.length === 6 && g[0].origins.map((o) => o.origin).join(' | ') === 'Etzatlán | San Juan de Abajo, Nay. | Sayula | Villa Hidalgo, Nay.' && g[0].origins[0].routes.map((r) => plantShort(r.dest)).join(',') === 'Nextipac,Villagrán,Los Mochis', 'agrupado por zona; orígenes en orden alfabético y plantas en orden del catálogo');

/* Captura de una tarifa */
const c1 = checkRoute({ zone: '  Occidente ', origin: 'Ameca', dest: 'Planta Nextipac', rates: { Tolva: 1500000, Jaula: null } }, all);
ok(c1.route && c1.route.zone === 'Occidente' && c1.route.rates.Tolva === 1500000 && !('Jaula' in c1.route.rates), 'tarifa nueva válida con solo Tolva (la unidad vacía no se registra)');
ok(checkRoute({ zone: 'Occidente', origin: 'Ameca', dest: 'Planta Nextipac', rates: { Tolva: 0, Jaula: null } }, all).errors.rates === 'Captura al menos un monto (Tolva o Jaula).', 'sin ningún monto no se guarda');
const dup = checkRoute({ zone: 'Occidente', origin: ' sayula ', dest: 'planta nextipac', rates: { Tolva: 100 } }, all);
ok(dup.errors && dup.errors.dest === 'Ya existe la ruta Sayula → Nextipac en este apartado.', 'no se repite origen + planta en el apartado (sin importar acentos ni mayúsculas)');
ok(checkRoute({ zone: 'Occidente', origin: 'Sayula', dest: 'Planta Nextipac', rates: { Tolva: 2200000 } }, all, sayula[0].id).route, 'editar la misma ruta no cuenta como repetida');
const e = checkRoute({ zone: '', origin: '', dest: '', rates: {} }, all).errors;
ok(e.zone && e.origin && e.dest && e.rates, 'zona, origen, planta y monto son obligatorios');
const edited = upsertRoute(all, { ...sayula[0], rates: { Tolva: 2200000, Jaula: 1720000 } });
ok(edited.length === 85 && edited.indexOf(edited.find((r) => r.id === sayula[0].id)) === all.indexOf(sayula[0]) && edited.find((r) => r.id === sayula[0].id).rates.Tolva === 2200000 && upsertRoute(all, { id: 'n1', zone: 'Z', origin: 'O', dest: 'D', rates: { Jaula: 1 } }).length === 86, 'editar conserva el lugar de la ruta; agregar la pone al final');

/* Apartados */
const sheets = [sh];
ok(checkSheetName('  BAYER  INBOUND 2027 ', sheets).name === 'BAYER INBOUND 2027' && checkSheetName('bayer inbound 2026', sheets).error === 'Ya existe el apartado «bayer inbound 2026».' && checkSheetName('', sheets).error && !checkSheetName('BAYER INBOUND 2026', sheets, sh.id).error, 'nombre de apartado: obligatorio, sin repetir y se puede conservar al renombrar');

/* Respaldo e información compartida */
const bad = sanitizeSheet({ id: 'x', name: ' Prueba ', routes: [{ id: 'a', zone: 'Z', origin: 'O', dest: 'D', rates: { Tolva: '150000', Jaula: -5, Otro: 9 } }, { id: 'b', zone: 'Z', origin: 'O2', dest: 'D', rates: {} }, { zone: 'sin id' }, 'texto'], source: 'otra' });
ok(bad.name === 'Prueba' && bad.routes.length === 1 && bad.routes[0].rates.Tolva === 150000 && !('Jaula' in bad.routes[0].rates) && !('Otro' in bad.routes[0].rates) && bad.source === 'user' && sanitizeSheet({ name: 'sin id' }) === null, 'un respaldo manipulado solo deja apartados y rutas con la forma esperada');
ok(SYNC_STORES.includes('tariffSheets'), 'las tarifas se comparten con los demás dispositivos');

/* PDF */
const require = createRequire(import.meta.url);
const PDFLib = require('../vendor/pdf-lib.min.js');
const d = await PDFLib.PDFDocument.create();
const reg = await d.embedFont(PDFLib.StandardFonts.Helvetica), bold = await d.embedFont(PDFLib.StandardFonts.HelveticaBold);
const measure = (t, s, b) => (b ? bold : reg).widthOfTextAtSize(t, s);
const model = buildTariffReport({ company: { legal: 'PERCONSUR DE NAYARIT GROUP' }, sheet: { ...sh, routes: edited }, issued: '2026-10-10', measure, imgs: { mark: { w: 334, h: 344 } } });
const texts = model.pages.flatMap((p) => p.items.filter((i) => i.t === 'text').map((i) => i.text));
ok(model.pages.length >= 3 && texts.includes('BAYER INBOUND 2026') && texts.includes('OCCIDENTE') && texts.includes('BAJÍO ZONA D') && texts.includes('$22,000.00') && texts.includes(`Página ${model.pages.length} de ${model.pages.length}`), `PDF: ${model.pages.length} páginas con el apartado, las 6 zonas, montos editados y numeración`);
ok(texts.filter((t) => t === 'Sayula').length === 1 && texts.filter((t) => t === 'TOLVA SENCILLA').length >= model.pages.length - 1, 'cada ciudad aparece una vez (con sus plantas) y el encabezado de la tabla se repite en cada página');
const empty = buildTariffReport({ company: {}, sheet: { name: 'VACÍO', routes: [] }, issued: '2026-10-10', measure, imgs: {} });
ok(empty.pages.length === 1 && empty.pages[0].items.some((i) => i.t === 'text' && /aún no tiene tarifas/.test(i.text)), 'apartado sin tarifas: PDF de una página con el aviso');
ok(tariffReportFilename('BAYER INBOUND 2026', '2026-10-10') === 'Tarifas-BAYER-INBOUND-2026-2026-10-10.pdf', 'nombre del archivo: Tarifas-BAYER-INBOUND-2026-2026-10-10.pdf');
