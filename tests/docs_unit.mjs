/* Diseño de documentos de DOCGEN 3.1: código de barras, íconos, hojas HTML y modelo de páginas (sin navegador) */
import { createRequire } from 'node:module';
import { code128, barcodeSVG } from '../src/domain/shared/barcode.js';
import { ICON_PATHS, sic } from '../src/domain/shared/docIcons.js';
import { createDoc, DOC } from '../src/domain/shared/pageDoc.js';
import { blankPuerto } from '../src/domain/puerto/model.js';
import { puertoSheetHTML, puertoAnnexHTML } from '../src/domain/puerto/sheet.js';
import { campoSheetHTML } from '../src/domain/campo/sheet.js';
import { COMPANY_DEFAULTS } from '../src/config/companies.js';
const ok = (c, m) => console.log((c ? 'OK  ' : 'FAIL') + ' ' + m);

/* Code 128-B del folio (mismo algoritmo que DOCGEN): inicio B, dígito de control, paro y 10 módulos en blanco por lado */
const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232'.split(' ');
const folio = '50-261009-007', bc = code128(folio);
/* Decodifica las barras de vuelta a símbolos para comprobar el contenido y el dígito de control */
const runs = []; let pos = 10;
bc.bars.forEach(([p, n], i) => { if (i) runs.push(p - pos); runs.push(n); pos = p + n; });
const widths = runs.join('');
const syms = []; for (let i = 0; i + 6 <= widths.length - 7; i += 6) syms.push(C128.indexOf(widths.slice(i, i + 6)));
const sum = syms.slice(1, -1).reduce((a, v, i) => a + v * (i + 1), syms[0]) % 103;
ok(syms[0] === 104 && widths.endsWith('2331112') && String.fromCharCode(...syms.slice(1, -1).map((v) => v + 32)) === folio && syms.at(-1) === sum,
  `código de barras del folio: inicio B, texto «${folio}», dígito de control ${sum} y paro`);
ok(bc.mods === 11 * (folio.length + 3) + 2 + 20 && barcodeSVG(folio).includes(`viewBox="0 0 ${bc.mods} 44" width="${bc.mods}" height="26"`) && code128('') === null, 'medidas de DOCGEN: 1 módulo por px, 44 de alto, zona en blanco de 10 módulos');

/* Íconos: misma geometría de DOCGEN; la ruta unida no arranca subrutas con «m» relativo tras otra figura */
ok(['shield', 'pen', 'seal', 'camera', 'target', 'corn', 'info'].every((k) => ICON_PATHS[k] && sic(k, '#000').includes('stroke-linecap="round"')), 'íconos de las hojas y reportes (escudo, firma, sello, cámara, rastreo, mazorca, información)');
ok(Object.values(ICON_PATHS).every((d) => /^M/.test(d)) && ICON_PATHS.shield.includes('zM9 12l2.2 2.2'), 'rutas de íconos para pdf-lib con inicio absoluto en cada figura');

/* Hoja de la nota de entrega y anexo */
const co = { ...COMPANY_DEFAULTS.perconsur };
const st = { ...blankPuerto({ folio, fecha: '2026-10-09', hora: '08:15' }), operador: 'Juan Pérez', eco: '21', track: 'tinyurl.com/MSCU1234565', showTrack: true,
  conts: [{ num: 'MSCU1234565', tipo: '45G1', sello: 'S-1', merc: 'Refacciones', bultos: '12', peso: '18500', fotos: { puertas: { id: 'f1', t: 1700000000000 } } }] };
const ctx = { photoURL: () => 'blob:x', qr: () => 'data:image/png;base64,AA', plant: () => null };
const html = puertoSheetHTML(st, co, ctx), annex = puertoAnnexHTML(st, co, ctx);
ok(['class="d-head"', 'class="d-kicker">Importación', 'class="s-title">Nota de entrega', 'class="d-band"><i></i><i></i>', 'class="d-meta"', 'class="d-bc"><svg'].every((x) => html.includes(x)), 'nota: encabezado con letrero, título, banda 78/22, tira de datos y código de barras');
ok(['01', '02', '03', '04'].every((n) => html.includes(`<span class="s-n">${n}</span>`)) && /class="s-track"[^>]*><svg class="sic"[^>]*>[^]*?<\/svg>Rastreo GPS<\/a>/.test(html), 'nota: secciones numeradas 01–04 y rastreo GPS con ícono');
ok(html.includes('NER 3.0 · Hoja 1 de 2') && annex.includes('NER 3.0 · Hoja 2 de 2') && annex.includes('45G1 <span class="s-tdesc">40&#39; High Cube</span>') && annex.includes('1 / 1'), 'pie con hoja n de N, anexo con descripción del tipo y contenedor 1 / 1');
ok(html.includes('stroke="#D65B15"') && html.includes('Recibe (almacén)') && html.includes('stroke="#354FA3"'), 'declaración con escudo naranja y firmas con íconos azules');

/* Asignación de unidades (media carta) */
const cp = { folio: 'AU-7K3M9PQ2', fecha: '2026-10-09', planta: 'Planta Nextipac', sols: {}, units: [{ sol: 'S-1', eco: '21', op: 'Juan', pu: '61-BN-4J', pr: '08-UW-6K', tipo: 'Tolva' }, { sol: 'S-2', eco: '7', op: 'José', pu: '', pr: '', tipo: 'Jaula' }] };
const ch = campoSheetHTML(cp, { ...COMPANY_DEFAULTS.campo }, { qr: () => null, plant: (n) => ({ name: n, address: 'Zapopan', maps: '' }) });
ok(ch.includes('División Campo</div>') && ch.includes('<svg class="sic"') && ch.includes('class="d-meta h-meta"') && ch.includes('<label>Solicitudes</label><b>2</b>') && !ch.includes('h-plant') && !ch.includes('h-wm'), 'asignación: letrero con mazorca, tira de datos (2 solicitudes) y sin marca de agua');

/* Modelo de páginas: título condensado y etiquetas espaciadas con la posición resuelta para el SVG y pdf-lib */
const require = createRequire(import.meta.url);
const PDFLib = require('../vendor/pdf-lib.min.js');
const d = await PDFLib.PDFDocument.create();
const reg = await d.embedFont(PDFLib.StandardFonts.Helvetica), bold = await d.embedFont(PDFLib.StandardFonts.HelveticaBold);
const measure = (t, s, b) => (b ? bold : reg).widthOfTextAtSize(t, s);
const D = createDoc({ measure, imgs: { mark: { w: 334, h: 344 } }, company: { legal: 'PERCONSUR DE NAYARIT GROUP' },
  head: { kicker: 'Operación · Taller', title: 'Reporte de prueba', sub: 'Subtítulo', folio: 'MTTO-U21-001', meta: [{ label: 'Folio', value: 'MTTO-U21-001', folio: true }] }, foot: { left: 'PERCONSUR', center: 'MTTO-U21-001' } });
let y = D.newPage();
y = D.sectionHead(y, 'Datos del equipo').y; y = D.sectionHead(y, 'Trabajos').y;
const pages = D.finish(), items = pages[0].items, txt = items.filter((i) => i.t === 'text');
const title = txt.find((i) => i.text === 'REPORTE DE PRUEBA');
ok(title && title.sx === 0.8 && title.a === 'start' && Math.abs(title.x + measure('REPORTE DE PRUEBA', title.s, true) * 0.8 - 564) < 0.01, 'título en mayúsculas, condensado al 80 % y alineado al margen derecho');
ok(txt.some((i) => i.text === 'OPERACIÓN · TALLER' && i.ls > 0) && txt.some((i) => i.text === '01') && txt.some((i) => i.text === '02') && txt.some((i) => i.text === 'Página 1 de 1'), 'letrero espaciado, secciones 01 y 02 y pie con número de página');
ok(items.some((i) => i.t === 'rect' && i.fill === DOC.c1 && i.h === 3.75) && items.some((i) => i.t === 'rect' && i.fill === DOC.c2) && items.filter((i) => i.t === 'rect' && i.fill === '#1A2233').length === code128('MTTO-U21-001').bars.length, 'banda azul/naranja y código de barras del folio con sus barras');
