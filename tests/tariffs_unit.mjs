/* Tarifas (sin navegador): siembra de BAYER INBOUND 2026, divisiones Puerto y Campo, búsqueda, agrupación, validación de lo
   capturado, cargos adicionales, respaldo y PDF (todos los importes antes de impuestos) */
import { createRequire } from 'node:module';
import { TARIFFS, TARIFF_CONFIG, TARIFF_SEED_SHEET } from '../src/config/tariffs.js';
import { UNITS, DIVISIONS, TAX_NOTE, divisionOf, newSheet, routesFromRows, seedSheet, zonesOf, destinationsOf, filterRoutes, groupByZone, tariffStats, searchKey, plantShort, checkRoute, checkExtra, upsertRoute, checkSheetName, sanitizeSheet } from '../src/domain/tariffs/tariffs.js';
import { buildTariffReport, tariffReportFilename } from '../src/domain/tariffs/report.js';
import { SYNC_STORES } from '../src/domain/sync/sync.js';
const ok = (c, m) => console.log((c ? 'OK  ' : 'FAIL') + ' ' + m);

/* Siembra: solo combinaciones con monto, todas en configuración sencilla (Tolva y Jaula) */
const total = TARIFFS.reduce((a, r) => a + r[4], 0);
ok(TARIFFS.length === 170 && total === 5716300, `170 tarifas con monto en la siembra (suma $${total.toLocaleString('en-US')}, igual que la hoja)`);
ok(TARIFF_CONFIG === 'Sencillo' && TARIFFS.every((r) => UNITS.includes(r[3])) && TARIFFS.every((r) => Number.isInteger(r[4]) && r[4] > 0), 'configuración sencilla: solo Tolva y Jaula, sin full ni Torton y sin montos vacíos o en cero');
const sh = seedSheet(1000);
ok(sh.id === TARIFF_SEED_SHEET.id && sh.name === 'BAYER INBOUND 2026' && sh.source === 'seed' && sh.routes.length === 85 && new Set(sh.routes.map((r) => r.id)).size === 85, 'apartado inicial «BAYER INBOUND 2026» con 85 rutas (ids únicos)');
ok(sh.division === 'campo' && divisionOf(sh) === DIVISIONS.campo && Array.isArray(sh.extras) && !sh.extras.length, 'BAYER INBOUND 2026 pertenece a la División Campo (sin cargos adicionales)');
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

/* Divisiones: Puerto con origen Manzanillo, ciudad destino, un monto por ruta y cargos adicionales */
const P = DIVISIONS.puerto;
ok(P.defaultOrigin === 'Manzanillo' && P.destLabel === 'Ciudad destino' && P.units.join() === 'Sencillo' && DIVISIONS.campo.destLabel === 'Planta destino' && DIVISIONS.campo.units.join() === 'Tolva,Jaula' && divisionOf({}) === DIVISIONS.campo, 'Puerto: origen Manzanillo y «Ciudad destino» (sin planta); Campo: planta destino, Tolva y Jaula');
const ps = newSheet({ id: 'p1', name: 'PUERTO 2026', division: 'puerto', now: 5 });
ok(ps.division === 'puerto' && ps.routes.length === 0 && ps.extras.map((x) => `${x.label}=${x.amount}`).join(' | ') === 'Sobrepeso=300000 | Arrastre local de vacíos en Manzanillo=200000 | Arrastre local de llenos en Manzanillo=500000' && !newSheet({ id: 'c1', name: 'C', division: 'campo' }).extras.length && newSheet({ id: 'c2', name: 'C', division: 'otra' }).division === 'campo', 'apartado de Puerto nace con sobrepeso $3,000, arrastre de vacíos $2,000 y de llenos $5,000; el de Campo sin cargos');
const pr = checkRoute({ zone: 'Occidente', origin: 'Manzanillo', dest: ' Guadalajara ', rates: { Sencillo: 2850000, Tolva: 999 } }, [], null, 'puerto');
ok(pr.route && pr.route.dest === 'Guadalajara' && pr.route.rates.Sencillo === 2850000 && !('Tolva' in pr.route.rates), 'Puerto: la tarifa se guarda con un solo monto (sencillo) hacia la ciudad destino');
const pe = checkRoute({ zone: 'Occidente', origin: 'Manzanillo', dest: '', rates: {} }, [], null, 'puerto').errors;
ok(pe.dest === 'Escribe la ciudad destino.' && pe.rates === 'Captura el monto de la tarifa.' && checkRoute({ zone: 'Z', origin: 'O', dest: '', rates: {} }, []).errors.dest === 'Escribe la planta destino.', 'avisos por división: ciudad destino y monto (Puerto), planta destino (Campo)');
const pdup = checkRoute({ zone: 'Occidente', origin: 'manzanillo', dest: 'GUADALAJARA', rates: { Sencillo: 1 } }, [{ ...pr.route, id: 'r1' }], null, 'puerto');
ok(pdup.errors && pdup.errors.dest === 'Ya existe la ruta Manzanillo → Guadalajara en este apartado.', 'Puerto: no se repite la ciudad destino desde el mismo origen');
const xs = ps.extras;
const x1 = checkExtra({ label: '  Maniobra  en patio ', amount: 150000 }, xs);
ok(x1.extra && x1.extra.label === 'Maniobra en patio' && x1.extra.amount === 150000 && checkExtra({ label: 'Sobrepeso', amount: 350000 }, xs, xs[0].id).extra, 'cargo adicional nuevo válido; editar el sobrepeso no cuenta como repetido');
const xe = checkExtra({ label: 'SOBREPESO', amount: 0 }, xs).errors;
ok(xe.label === 'Ya existe el cargo «Sobrepeso».' && xe.amount === 'Captura el monto del cargo.' && checkExtra({ label: ' ', amount: 1 }, xs).errors.label === 'Escribe el concepto del cargo.', 'cargo adicional: concepto obligatorio y sin repetir, monto mayor a cero');
const pRoutes = [['Occidente', 'Guadalajara'], ['Occidente', 'Colima'], ['Bajío', 'León'], ['Occidente', 'Tepic']].map(([zone, dest], i) => ({ id: 'r' + i, zone, origin: 'Manzanillo', dest, rates: { Sencillo: 1000000 + i } }));
ok(filterRoutes(pRoutes, { text: 'leon' }).length === 1 && filterRoutes(pRoutes, { text: 'MANZANILLO' }).length === 4 && filterRoutes(all, { text: 'mochis' }).length === 5, 'búsqueda libre por ciudad destino u origen (Los Mochis: 3 como planta y 2 como origen)');
ok(groupByZone(pRoutes, pRoutes, { alphaDest: true })[0].origins[0].routes.map((r) => r.dest).join(',') === 'Colima,Guadalajara,Tepic' && tariffStats(pRoutes).dests === 4, 'Puerto: destinos en orden alfabético por zona');

/* Apartados */
const sheets = [sh];
ok(checkSheetName('  BAYER  INBOUND 2027 ', sheets).name === 'BAYER INBOUND 2027' && checkSheetName('bayer inbound 2026', sheets).error === 'Ya existe el apartado «bayer inbound 2026».' && checkSheetName('', sheets).error && !checkSheetName('BAYER INBOUND 2026', sheets, sh.id).error, 'nombre de apartado: obligatorio, sin repetir y se puede conservar al renombrar');

/* Respaldo e información compartida */
const bad = sanitizeSheet({ id: 'x', name: ' Prueba ', routes: [{ id: 'a', zone: 'Z', origin: 'O', dest: 'D', rates: { Tolva: '150000', Jaula: -5, Otro: 9 } }, { id: 'b', zone: 'Z', origin: 'O2', dest: 'D', rates: {} }, { zone: 'sin id' }, 'texto'], source: 'otra' });
ok(bad.name === 'Prueba' && bad.routes.length === 1 && bad.routes[0].rates.Tolva === 150000 && !('Jaula' in bad.routes[0].rates) && !('Otro' in bad.routes[0].rates) && bad.source === 'user' && sanitizeSheet({ name: 'sin id' }) === null, 'un respaldo manipulado solo deja apartados y rutas con la forma esperada');
const old122 = sanitizeSheet({ id: 'v122', name: 'Anterior', config: 'Sencillo', routes: [{ id: 'a', zone: 'Z', origin: 'O', dest: 'Planta X', rates: { Tolva: 100 } }], source: 'user' });
ok(old122.division === 'campo' && old122.extras.length === 0 && old122.routes.length === 1, 'un apartado de la versión 1.22 (sin división) queda en División Campo');
const sp = sanitizeSheet({ id: 'p', name: 'P', division: 'puerto', routes: [{ id: 'a', zone: 'Z', origin: 'Manzanillo', dest: 'Colima', rates: { Sencillo: 5, Tolva: 7 } }, { id: 'b', zone: 'Z', origin: 'Manzanillo', dest: 'León', rates: { Tolva: 7 } }], extras: [{ id: 'x1', label: ' Sobrepeso ', amount: '300000' }, { id: 'x2', label: '', amount: 5 }, { label: 'sin id', amount: 5 }, { id: 'x3', label: 'Cero', amount: 0 }] });
ok(sp.division === 'puerto' && sp.routes.length === 1 && sp.routes[0].rates.Sencillo === 5 && !('Tolva' in sp.routes[0].rates) && sp.extras.length === 1 && sp.extras[0].label === 'Sobrepeso' && sp.extras[0].amount === 300000, 'respaldo de Puerto: solo el monto sencillo y cargos con concepto, id y monto');
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
const joined = texts.join(' ');
ok(texts.includes('DIVISIÓN CAMPO · TARIFAS') && texts.includes('Antes de impuestos') && /TARIFARIO DE TRANSPORTE SENCILLO( ·)? ANTES DE IMPUESTOS/.test(joined) && joined.includes(TAX_NOTE) && texts.includes('PLANTA DESTINO') && !texts.includes('CARGOS ADICIONALES'), 'PDF de Campo: división, planta destino y «antes de impuestos» en el encabezado, los datos y la nota');
const pModel = buildTariffReport({ company: { legal: 'PERCONSUR DE NAYARIT GROUP' }, sheet: { ...ps, routes: pRoutes }, issued: '2026-10-10', measure, imgs: { mark: { w: 334, h: 344 } } });
const pt = pModel.pages.flatMap((p) => p.items.filter((i) => i.t === 'text').map((i) => i.text)), pj = pt.join(' ');
ok(pModel.pages.length === 1 && pt.includes('DIVISIÓN PUERTO · TARIFAS') && pt.includes('CIUDAD DESTINO') && pt.includes('TARIFA SENCILLO') && !pt.includes('PLANTA DESTINO') && !pt.includes('TOLVA SENCILLA') && pt.includes('Manzanillo') && pt.includes('Guadalajara'), 'PDF de Puerto: origen Manzanillo y ciudad destino, sin planta ni Tolva/Jaula');
ok(pt.includes('CARGOS ADICIONALES') && pt.includes('Sobrepeso') && pt.includes('$3,000.00') && pt.includes('Arrastre local de vacíos en Manzanillo') && pt.includes('$2,000.00') && pt.includes('Arrastre local de llenos en Manzanillo') && pt.includes('$5,000.00') && pj.includes(TAX_NOTE) && pt.includes('Antes de impuestos'), 'PDF de Puerto: cargos adicionales ($3,000, $2,000 y $5,000) y la nota de antes de impuestos');
const long = buildTariffReport({ company: {}, sheet: { ...ps, routes: Array.from({ length: 70 }, (_, i) => ({ id: 'q' + i, zone: ['Occidente', 'Bajío', 'Centro', 'Norte'][i % 4], origin: 'Manzanillo', dest: `Ciudad ${String(i).padStart(2, '0')}`, rates: { Sencillo: 100000 } })) }, issued: '2026-10-10', measure, imgs: {} });
const lastOnPage = long.pages.map((p) => p.items.filter((i) => i.t === 'text' && i.y < 700).map((i) => i.text));
ok(long.pages.length === 3 && long.pages.every((pg, k) => { const ts = lastOnPage[k], h = ts.lastIndexOf('TARIFA SENCILLO'); return h < 0 || ts.slice(h + 1).some((t) => /^Ciudad \d/.test(t)); }), `PDF de Puerto con 70 rutas: ${long.pages.length} páginas, sin encabezados de zona sueltos al pie de la página`);
const empty = buildTariffReport({ company: {}, sheet: { name: 'VACÍO', routes: [] }, issued: '2026-10-10', measure, imgs: {} });
ok(empty.pages.length === 1 && empty.pages[0].items.some((i) => i.t === 'text' && /aún no tiene tarifas/.test(i.text)), 'apartado sin tarifas: PDF de una página con el aviso');
ok(tariffReportFilename('BAYER INBOUND 2026', '2026-10-10') === 'Tarifas-BAYER-INBOUND-2026-2026-10-10.pdf', 'nombre del archivo: Tarifas-BAYER-INBOUND-2026-2026-10-10.pdf');
