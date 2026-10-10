/* Tarifario de transporte sencillo (sin navegador): datos importados, búsqueda por origen y destino y agrupación por zona */
import { TARIFFS, TARIFF_CONFIG } from '../src/config/tariffs.js';
import { UNITS, tariffRoutes, zonesOf, destinationsOf, filterRoutes, groupByZone, tariffStats, searchKey, plantShort } from '../src/domain/tariffs/tariffs.js';
const ok = (c, m) => console.log((c ? 'OK  ' : 'FAIL') + ' ' + m);

/* Datos: solo combinaciones con monto, todas en configuración sencilla (Tolva y Jaula) */
const total = TARIFFS.reduce((a, r) => a + r[4], 0);
ok(TARIFFS.length === 170 && total === 5716300, `170 tarifas con monto importadas (suma $${total.toLocaleString('en-US')}, igual que la hoja)`);
ok(TARIFF_CONFIG === 'Sencillo' && TARIFFS.every((r) => UNITS.includes(r[3])) && TARIFFS.every((r) => Number.isInteger(r[4]) && r[4] > 0), 'configuración sencilla: solo Tolva y Jaula, sin full ni Torton y sin montos vacíos o en cero');
const keys = TARIFFS.map((r) => `${r[1]}|${r[2]}|${r[3]}`);
ok(new Set(keys).size === keys.length, 'sin tarifas duplicadas (origen, planta y unidad)');

const all = tariffRoutes(), st = tariffStats(all);
ok(st.routes === 85 && st.origins === 41 && st.zones === 6 && st.rates === 170 && all.every((r) => r.rates.Tolva > 0 && r.rates.Jaula > 0), '85 rutas de 41 orígenes en 6 zonas, cada una con Tolva y Jaula');
ok(zonesOf(all).join(' | ') === 'Occidente | Pacífico | Bajío zona A | Bajío zona B | Bajío zona C | Bajío zona D', 'zonas unificadas en el orden del tarifario («Bajio zona C» = «Bajío zona C», «Pacífico» con acento)');
ok(destinationsOf(all).join(' | ') === 'Planta Nextipac | Planta Villagrán | Planta Los Mochis' && plantShort('Planta Villagrán') === 'Villagrán', 'plantas con el nombre del catálogo');
const sayula = all.filter((r) => r.origin === 'Sayula');
ok(sayula.length === 2 && sayula[0].dest === 'Planta Nextipac' && sayula[0].rates.Tolva === 2120000 && sayula[0].rates.Jaula === 1720000, 'importe en centavos: Sayula → Nextipac Tolva $21,200 y Jaula $17,200');
ok(all.some((r) => r.origin === 'San Juan de Abajo, Nay.') && all.some((r) => r.origin === 'Apaseo el Alto (incluye San Antonio Calichar)') && !all.some((r) => /[a-z][A-Z]/.test(r.origin.replace(/\(.*\)/, ''))), 'nombres de origen con espacios y acentos (el Excel los traía pegados)');

/* Búsqueda */
ok(searchKey('San Juan de Abajo, Nay.') === 'sanjuandeabajonay' && searchKey('PÉNJAMO') === 'penjamo', 'clave de búsqueda sin mayúsculas, acentos, espacios ni signos');
const sj = filterRoutes(all, { origin: 'san juan' });
ok(sj.length === 3 && sj.every((r) => r.origin === 'San Juan de Abajo, Nay.'), 'buscar origen «san juan»: 3 rutas de San Juan de Abajo');
ok(filterRoutes(all, { origin: 'SANJUAN' }).length === 3 && filterRoutes(all, { origin: 'penjamo' }).length === 2 && filterRoutes(all, { origin: 'pénjamo' }).length === 2, 'sin importar espacios, mayúsculas ni acentos');
ok(filterRoutes(all, { origin: 'villagran' }).map((r) => r.origin).every((o) => /Villagrán/.test(o)) && filterRoutes(all, { origin: 'villagran' }).length === 4, 'origen «villagran» encuentra Villagrán y Sarabia (Villagrán), no la planta destino');
const mochis = filterRoutes(all, { dest: 'Planta Los Mochis' });
ok(mochis.length === 3 && mochis.every((r) => r.zone === 'Occidente') && filterRoutes(all, { dest: 'mochis' }).length === 3, 'destino Los Mochis: 3 rutas (todas de Occidente), también escribiendo «mochis»');
ok(filterRoutes(all, { origin: 'leon', dest: 'Planta Nextipac' }).length === 1 && filterRoutes(all, { origin: 'leon', dest: 'Planta Los Mochis' }).length === 0, 'origen y destino combinados');
ok(filterRoutes(all, { zone: 'Bajío zona A' }).every((r) => r.zone === 'Bajío zona A') && filterRoutes(all, { zone: 'Bajío zona A' }).length === 18, 'filtro por zona: Bajío zona A con 18 rutas');

/* Agrupación por zona */
const g = groupByZone(all);
ok(g.length === 6 && g.reduce((a, z) => a + z.origins.length, 0) === 41 && g.reduce((a, z) => a + z.routes.length, 0) === 85, 'agrupado por zona: 6 secciones, 41 orígenes, 85 rutas');
const occ = g[0].origins.map((o) => o.origin);
ok(occ.join(' | ') === 'Etzatlán | San Juan de Abajo, Nay. | Sayula | Villa Hidalgo, Nay.' && g[0].origins[0].routes.map((r) => plantShort(r.dest)).join(',') === 'Nextipac,Villagrán,Los Mochis', 'orígenes en orden alfabético y plantas en orden del catálogo');
const gf = groupByZone(filterRoutes(all, { dest: 'Planta Los Mochis' }), all);
ok(gf.length === 1 && gf[0].zone === 'Occidente' && gf[0].origins.every((o) => o.routes.length === 1), 'con filtro solo aparecen las zonas con resultados');
