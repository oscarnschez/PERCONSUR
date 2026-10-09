/*
 * Taller — reporte en PDF (individual por orden y consolidado por equipo y periodo).
 * Arma el modelo de páginas (carta, puntos, origen arriba) que dibujan pageToSVG (vista previa) y modelToPdf (archivo)
 * de domain/operators/statement.js: la vista previa es el mismo documento. El diagrama se dibuja con las mismas rutas
 * vectoriales de la app (diagrams.js → pdfItems), con los colores por estado, números y leyenda.
 */
import { PAGE, COLOR, pdfSafe, longDate } from '../operators/statement.js';
import { kindLabel, orderStatusOf, ORDER_TYPES, severityLabel, actionLabel, workTypeLabel, workStatusLabel, tireReasonLabel, componentOf, SYSTEMS, CUSTOM_SYSTEM } from './catalog.js';
import { STATE_COLORS, STATE_LABELS, componentStates, numbering, fmtDT, fmtD, durationText, orderDuration, kmText, nf, positionLabel, positionsOf, pendingPositions, splitTs } from './maintenance.js';
import { viewsOf, pdfItems, componentViews, tirePdfItems } from './diagrams.js';

const CW = PAGE.w - PAGE.ml - PAGE.mr, RX = PAGE.w - PAGE.mr;
const typeLabel = (k) => (ORDER_TYPES.find(([x]) => x === k) || [null, 'Servicio'])[1];
const sysName = (kind, sys) => ((SYSTEMS[kind] || []).find((s) => s.id === sys) || CUSTOM_SYSTEM).name;
export const reportFilename = (folio) => `${String(folio || 'Mantenimiento').replace(/[^\w.-]+/g, '-')}.pdf`;
export const servicesFilename = (code, from, to) => `Servicios-${code}-${(from || 'inicio').replace(/-/g, '')}-${(to || 'hoy').replace(/-/g, '')}.pdf`;

/*
 * args = {
 *   mode: 'orden' | 'consolidado', company, equipment { type, label, placas, kind, kindLabel },
 *   entries: [{ order, services, components, issues, tires, oil, photos: [{ key, w, h, caption }] }],
 *   period: { from, to, typesText, statusesText } (consolidado), reference (consolidado), issuedAt, measure, imgs, parts
 * }
 */
export function buildMaintenanceReport(args) {
  const { mode, company, equipment: eq, entries, measure, imgs, parts = [], issuedAt = Date.now() } = args;
  const kind = eq.kind;
  const single = mode === 'orden';
  const folio = single ? entries[0].order.folio : args.reference;
  const pages = [];
  let page = null, y = 0;
  const W = (t, s, b) => measure(pdfSafe(t), s, b);
  const compName = (id) => (componentOf(kind, id, parts) || { name: 'Componente' }).name;

  /* ===== Primitivas ===== */
  const text = (x, yy, str, o = {}) => page.items.push({ t: 'text', x, y: yy, text: pdfSafe(str), s: o.s || 7.6, b: !!o.b, c: o.c || COLOR.ink, a: o.a || 'start' });
  const rect = (x, yy, w, h, o = {}) => page.items.push({ t: 'rect', x, y: yy, w, h, fill: o.fill || null, stroke: o.stroke || null, sw: o.sw || 0.6 });
  const line = (x1, y1, x2, y2, o = {}) => page.items.push({ t: 'line', x1, y1, x2, y2, c: o.c || COLOR.line, w: o.w || 0.6 });
  const image = (key, x, yy, w, h) => page.items.push({ t: 'image', key, x, y: yy, w, h });
  function fit(str, s, b, maxW) {
    let t = pdfSafe(str);
    if (W(t, s, b) <= maxW) return t;
    while (t.length > 1 && W(t + '…', s, b) > maxW) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }
  function wrap(str, s, b, maxW, maxLines = 3) {
    const words = pdfSafe(str).split(' ').filter(Boolean);
    if (!words.length) return [''];
    const lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (cur && W(t, s, b) > maxW) { lines.push(cur); cur = w; } else cur = t; });
    lines.push(cur);
    if (lines.length > maxLines) { const rest = lines.slice(maxLines - 1).join(' '); lines.length = maxLines - 1; lines.push(rest + '…'); }
    return lines.map((l) => fit(l, s, b, maxW));
  }
  const band = (yy, h) => { rect(PAGE.ml, yy, CW * 0.78, h, { fill: COLOR.blue }); rect(PAGE.ml + CW * 0.78, yy, CW * 0.22, h, { fill: COLOR.orange }); };
  const wordmark = (x, yy, h) => {
    if (imgs.word) { const w = h * imgs.word.w / imgs.word.h; image('word', x, yy, w, h); return w; }
    text(x, yy + h * 0.82, 'PERCONSUR', { s: h * 0.95, b: true, c: COLOR.blue }); return W('PERCONSUR', h * 0.95, true);
  };
  const title = single ? 'REPORTE DE MANTENIMIENTO Y REPARACIÓN' : 'REPORTE DE SERVICIOS DE MANTENIMIENTO';
  const issued = splitTs(issuedAt);

  /* ===== Encabezados ===== */
  function firstHeader() {
    const mh = 42, mw = mh * imgs.mark.w / imgs.mark.h;
    image('mark', PAGE.ml, 38, mw, mh);
    const x = PAGE.ml + mw + 10;
    wordmark(x, 40, 19);
    text(x, 72, company.legal, { s: 7.4, b: true });
    text(x, 81.5, company.addr1 || '', { s: 6.8, c: COLOR.muted });
    text(x, 90.5, company.addr2 || '', { s: 6.8, c: COLOR.muted });
    text(x, 99.5, [company.email, company.web].filter(Boolean).join('  |  '), { s: 6.8, c: COLOR.muted });
    text(RX, 52, title, { s: single ? 11.5 : 11, b: true, c: COLOR.blue, a: 'end' });
    const kv = [[single ? 'Folio' : 'Referencia', folio], ['Fecha de generación', `${longDate(issued.date)} · ${issued.time}`], ['Equipo', `${eq.label}${eq.placas && eq.placas !== eq.label ? ' · ' + eq.placas : ''}`]];
    kv.forEach(([k, v], i) => {
      const yy = 70 + i * 11.5;
      text(RX, yy, v, { s: 8, b: true, a: 'end', c: i === 0 ? COLOR.orange : COLOR.ink });
      text(RX - W(v, 8, true) - 8, yy, k, { s: 7.2, c: COLOR.muted, a: 'end' });
    });
    band(112, 3.2);
    return 130;
  }
  function contHeader() {
    const mh = 22, mw = mh * imgs.mark.w / imgs.mark.h;
    image('mark', PAGE.ml, 32, mw, mh);
    wordmark(PAGE.ml + mw + 7, 37, 11);
    text(RX, 41, single ? 'Reporte de mantenimiento y reparación' : 'Reporte de servicios de mantenimiento', { s: 8, b: true, c: COLOR.blue, a: 'end' });
    text(RX, 51, fit(`${eq.label}  |  ${folio}`, 7, false, 300), { s: 7, c: COLOR.muted, a: 'end' });
    band(62, 1.6);
    return 78;
  }
  function newPage() { page = { w: PAGE.w, h: PAGE.h, items: [] }; pages.push(page); y = pages.length === 1 ? firstHeader() : contHeader(); }
  const ensure = (h) => { if (y + h > PAGE.bottom) { newPage(); return true; } return false; };

  /* ===== Bloques ===== */
  function section(t, minAfter = 30) {
    ensure(26 + minAfter);
    text(PAGE.ml, y + 11, t.toUpperCase(), { s: 9, b: true, c: COLOR.blue });
    line(PAGE.ml, y + 16, RX, y + 16, { c: COLOR.blue, w: 0.8 });
    y += 24;
  }
  function subTitle(t) { ensure(30); text(PAGE.ml, y + 9, t, { s: 8.2, b: true, c: COLOR.blueD }); y += 15; }
  /* Pares dato/valor en dos columnas */
  function kvGrid(rows) {
    const colW = CW / 2, lw = 104;
    for (let i = 0; i < rows.length; i += 2) {
      const pair = rows.slice(i, i + 2), hs = pair.map(([, v]) => wrap(v || '—', 7.8, true, colW - lw - 8, 2).length);
      const h = Math.max(...hs) * 10 + 6;
      ensure(h);
      pair.forEach(([k, v], j) => {
        const x = PAGE.ml + j * colW;
        text(x, y + 9, k, { s: 7, c: COLOR.muted });
        wrap(v || '—', 7.8, true, colW - lw - 8, 2).forEach((l, li) => text(x + lw, y + 9 + li * 10, l, { s: 7.8, b: true }));
      });
      line(PAGE.ml, y + h, RX, y + h, { c: '#E8EBF1', w: 0.5 });
      y += h + 2;
    }
    y += 6;
  }
  function paragraph(label, value, { maxLines = 8 } = {}) {
    const lines = wrap(value || '—', 7.8, false, CW - 4, maxLines);
    ensure(14 + lines.length * 10);
    text(PAGE.ml, y + 8, label, { s: 7, c: COLOR.muted, b: true });
    y += 12;
    lines.forEach((l) => { text(PAGE.ml, y + 8, l, { s: 7.8 }); y += 10; });
    y += 6;
  }
  const swatch = (x, yy, state) => rect(x, yy - 6.4, 7, 7, { fill: STATE_COLORS[state], stroke: '#2D3442', sw: 0.4 });
  /* Tabla con encabezado repetido en cada página; cols: [{ h, w, get(row) → texto | { text, state } }] */
  function table(cols, rows, { maxLines = 3, empty = 'Sin registros.' } = {}) {
    const head = () => {
      ensure(18 + 14);
      rect(PAGE.ml, y, CW, 15, { fill: COLOR.blueL });
      let x = PAGE.ml;
      cols.forEach((c) => { text(x + 4, y + 10, c.h, { s: 6.8, b: true, c: COLOR.blueD }); x += c.w; });
      y += 15;
    };
    head();
    if (!rows.length) { text(PAGE.ml + 4, y + 11, empty, { s: 7.4, c: COLOR.muted }); y += 18; return; }
    rows.forEach((r, ri) => {
      const cells = cols.map((c) => { const v = c.get(r); const o = typeof v === 'object' && v ? v : { text: v }; return { ...o, lines: wrap(o.text || '—', 7.2, !!c.b, c.w - 8 - (o.state ? 10 : 0), maxLines) }; });
      const h = Math.max(...cells.map((c) => c.lines.length)) * 9.4 + 7;
      if (y + h > PAGE.bottom) { newPage(); head(); }
      if (ri % 2 === 1) rect(PAGE.ml, y, CW, h, { fill: COLOR.faint });
      let x = PAGE.ml;
      cells.forEach((c, ci) => {
        const ox = c.state ? 10 : 0;
        if (c.state) swatch(x + 4, y + 10.5, c.state);
        c.lines.forEach((l, li) => text(x + 4 + ox, y + 10.5 + li * 9.4, l, { s: 7.2, b: !!cols[ci].b }));
        x += cols[ci].w;
      });
      line(PAGE.ml, y + h, RX, y + h, { w: 0.4 });
      y += h;
    });
    y += 10;
  }
  function legend() {
    ensure(22);
    let x = PAGE.ml;
    text(x, y + 9, 'Leyenda:', { s: 7, b: true, c: COLOR.muted }); x += W('Leyenda:', 7, true) + 8;
    for (const k of ['none', 'leve', 'moderado', 'total', 'reemplazado']) {
      swatch(x, y + 9.4, k); x += 10;
      text(x, y + 9, STATE_LABELS[k], { s: 7 }); x += W(STATE_LABELS[k], 7, false) + 12;
    }
    y += 18;
  }
  /* Diagrama: vistas donde aparecen los componentes intervenidos (o la principal si no hay ninguno) */
  function diagram(records, { note = '' } = {}) {
    const states = componentStates(records), nums = numbering(states, kind, parts), cv = componentViews(kind), views = viewsOf(kind);
    let show = views.filter((v) => [...states.keys()].some((c) => (cv.get(c) || []).includes(v.id)));
    /* Lateral izquierda y derecha: si una no muestra ningún componente intervenido que no esté ya en la otra, basta con
       una (las llantas de cada lado sí distinguen una de otra) */
    const inView = (id) => new Set([...states.keys()].filter((c) => (cv.get(c) || []).includes(id)));
    for (const [a, b] of [['izq', 'der'], ['lado', 'lado_der']]) {
      if (!show.some((v) => v.id === a) || !show.some((v) => v.id === b)) continue;
      const A = inView(a), B = inView(b);
      if ([...B].every((c) => A.has(c))) show = show.filter((v) => v.id !== b);
      else if ([...A].every((c) => B.has(c))) show = show.filter((v) => v.id !== a);
    }
    if (!show.length) show = views.slice(0, 1);
    const wide = show.filter((v) => v.w > 700), narrow = show.filter((v) => v.w <= 700);
    const drawView = (v, box) => {
      text(box.x, y + 9, v.name.toUpperCase(), { s: 6.8, b: true, c: COLOR.muted });
      const r = pdfItems(kind, v.id, { states, numbers: nums }, { x: box.x, y: y + 14, w: box.w, h: box.h });
      rect(box.x, y + 12, box.w, r.h + 6, { stroke: COLOR.line, sw: 0.5 });
      r.items.forEach((it) => page.items.push(it));
      return r.h + 22;
    };
    for (const v of wide) { const h = CW * v.h / v.w; ensure(h + 26); y += drawView(v, { x: PAGE.ml, w: CW, h }); }
    for (let i = 0; i < narrow.length; i += 2) {
      const pair = narrow.slice(i, i + 2), bw = (CW - 14) / 2, h = Math.max(...pair.map((v) => bw * v.h / v.w));
      ensure(h + 26);
      let used = 0;
      pair.forEach((v, j) => { used = Math.max(used, drawView(v, { x: PAGE.ml + j * (bw + 14), w: bw, h })); });
      y += used;
    }
    legend();
    if (note) { ensure(14); text(PAGE.ml, y + 8, note, { s: 7, c: COLOR.muted }); y += 14; }
    const list = [...states.values()].sort((a, b) => nums.get(a.componentId) - nums.get(b.componentId));
    return { states, nums, list };
  }
  function photos(list) {
    const bw = (CW - 14) / 2, bh = 168;
    for (let i = 0; i < list.length; i += 2) {
      ensure(bh + 26);
      list.slice(i, i + 2).forEach((p, j) => {
        const x = PAGE.ml + j * (bw + 14);
        rect(x, y, bw, bh, { fill: COLOR.faint, stroke: COLOR.line, sw: 0.5 });
        const k = Math.min((bw - 8) / p.w, (bh - 8) / p.h), w = p.w * k, h = p.h * k;
        image(p.key, x + (bw - w) / 2, y + (bh - h) / 2, w, h);
        text(x, y + bh + 10, fit(p.caption || 'Evidencia', 7, false, bw), { s: 7, c: COLOR.muted });
      });
      y += bh + 18;
    }
  }
  const workRows = (services) => services.map((s) => ({ s }));
  const workCols = [
    { h: 'Fecha', w: 52, get: (r) => fmtD(r.s.date) },
    { h: 'Componente', w: 96, get: (r) => (r.s.componentId ? compName(r.s.componentId) : '—'), b: true },
    { h: 'Servicio', w: 104, get: (r) => [workTypeLabel(r.s.type), r.s.description].filter(Boolean).join(': ') },
    { h: 'Gravedad', w: 66, get: (r) => (r.s.severity ? { text: severityLabel(r.s.severity), state: r.s.severity } : '—') },
    { h: 'Acción', w: 72, get: (r) => (r.s.action ? { text: `${actionLabel(r.s.action)} · ${workStatusLabel(r.s.workStatus)}`, state: r.s.action === 'reemplazado' && r.s.componentId ? 'reemplazado' : '' } : workStatusLabel(r.s.workStatus)) },
    { h: 'Observaciones', w: CW - 52 - 96 - 104 - 66 - 72, get: (r) => r.s.notes || '—' },
  ];
  const replacedOf = (components) => components.filter((c) => c.replaced || c.action === 'reemplazado');
  function replacements(components) {
    const reps = replacedOf(components);
    table([
      { h: 'Componente', w: 150, get: (c) => ({ text: compName(c.componentId), state: 'reemplazado' }), b: true },
      { h: 'Fecha', w: 60, get: (c) => fmtD(c.date) },
      { h: 'Daño original', w: 90, get: (c) => (c.severity ? { text: severityLabel(c.severity), state: c.severity } : 'Sin registrar') },
      { h: 'Detalle', w: CW - 300, get: (c) => c.description || '—' },
    ], reps, { empty: 'No se reemplazaron componentes.' });
  }
  function tires(list, layoutHint) {
    table([
      { h: 'Fecha', w: 54, get: (t) => fmtD(t.date) },
      { h: 'Cantidad', w: 46, get: (t) => String(t.quantity) },
      { h: 'Posiciones', w: 190, get: (t) => [t.positions.map((p) => positionLabel(p, (positionsOf(t.layout).find((x) => x.id === p) || {}).axleKind)).join('; '), pendingPositions(t) ? `${pendingPositions(t)} pendiente${pendingPositions(t) === 1 ? '' : 's'} de especificar` : ''].filter(Boolean).join(' · ') },
      { h: 'Motivo', w: 80, get: (t) => [tireReasonLabel(t.reason), t.reasonText].filter(Boolean).join(': ') },
      { h: 'Marca y medida', w: CW - 54 - 46 - 190 - 80, get: (t) => [t.brand, t.size].filter(Boolean).join(' ') || '—' },
    ], list, { maxLines: 4, empty: 'Sin reemplazo de llantas.' });
    const withPos = list.filter((t) => t.layout && t.positions.length);
    const layout = (withPos[0] || {}).layout || layoutHint;
    if (withPos.length && layout) {
      const replaced = new Set(withPos.filter((t) => t.layout === layout).flatMap((t) => t.positions));
      const r0 = tirePdfItems(layout, replaced, { x: 0, y: 0, w: 150, h: 260 });
      ensure(r0.h + 24);
      text(PAGE.ml, y + 9, 'POSICIONES CON LLANTA NUEVA', { s: 6.8, b: true, c: COLOR.muted });
      const r = tirePdfItems(layout, replaced, { x: PAGE.ml, y: y + 14, w: 150, h: 260 });
      r.items.forEach((it) => page.items.push(it));
      const lx = PAGE.ml + 170;
      swatch(lx, y + 30, 'reemplazado'); text(lx + 10, y + 30, 'Llanta reemplazada', { s: 7 });
      swatch(lx, y + 44, 'none'); text(lx + 10, y + 44, 'Sin reemplazo registrado', { s: 7 });
      y += r.h + 22;
    }
  }
  function oilBlock(list) {
    for (const x of list) kvGrid([
      ['Fecha', fmtDT(x.date)], ['Odómetro al cambio', kmText(x.odometer)],
      ['Tipo de aceite', x.oilType || '—'], ['Marca', x.brand || '—'], ['Viscosidad', x.viscosity || '—'], ['Cantidad', x.liters ? `${nf(x.liters, 1)} L` : '—'],
      ['Filtro de aceite', x.oilFilter ? 'Reemplazado' : 'No reemplazado'], ['Otros filtros', x.otherFilters || '—'],
      ...(x.notes ? [['Observaciones', x.notes]] : []),
    ]);
  }
  function componentTable(list, nums, withHistory = false, orderFolio = new Map()) {
    table([
      { h: 'N.°', w: 28, get: (v) => String(nums.get(v.componentId)), b: true },
      { h: 'Componente', w: 122, get: (v) => compName(v.componentId), b: true },
      { h: 'Sistema', w: 92, get: (v) => sysName(kind, (componentOf(kind, v.componentId, parts) || {}).system) },
      { h: 'Gravedad original', w: 80, get: (v) => (v.severity ? { text: severityLabel(v.severity), state: v.severity } : 'Sin registrar') },
      withHistory
        ? { h: 'Intervenciones', w: CW - 28 - 122 - 92 - 80 - 84, get: (v) => v.items.map((i) => `${fmtD(i.date)} ${i.severity ? severityLabel(i.severity) : ''}${i.action ? ' · ' + actionLabel(i.action) : ''}${orderFolio.get(i.orderId) ? ' (' + orderFolio.get(i.orderId) + ')' : ''}`).join('; ') }
        : { h: 'Acción', w: CW - 28 - 122 - 92 - 80 - 84, get: (v) => [...new Set(v.items.map((i) => actionLabel(i.action)).filter((x) => x !== '—'))].join(', ') || '—' },
      { h: 'En el diagrama', w: 84, get: (v) => ({ text: STATE_LABELS[v.state], state: v.state }) },
    ], list, { maxLines: withHistory ? 6 : 3, empty: 'No hay componentes intervenidos.' });
  }

  newPage();
  /* ===== Datos del equipo ===== */
  section('Datos del equipo');
  const isV = eq.type === 'vehicle';
  if (single) {
    const o = entries[0].order;
    kvGrid([
      [isV ? 'Número económico' : 'Identificador', eq.label], ['Placas', eq.placas || '—'],
      ['Tipo de equipo', isV ? 'Tractocamión' : 'Remolque'], [isV ? 'Kilometraje registrado' : 'Tipo de remolque', isV ? kmText(o.odometer) : kindLabel(kind)],
      ['Tipo de mantenimiento', typeLabel(o.type)], ['Estado', orderStatusOf(o.status).label],
    ]);
    section('Fechas');
    const d = orderDuration(o, issuedAt);
    kvGrid([
      ['Ingreso al taller', fmtDT(o.inAt)], ['Salida del taller', Number.isFinite(o.outAt) ? fmtDT(o.outAt) : 'Sin salida (en taller)'],
      ['Tiempo total en mantenimiento', d ? (d.running ? `${d.text} (en curso)` : d.text) : '—'], ['Disponibilidad', o.status !== 'finalizado' && o.outOfService !== false ? 'En taller (no disponible)' : 'Disponible'],
    ]);
    section('Motivo');
    paragraph('Motivo del mantenimiento', o.reason);
    paragraph('Descripción del servicio realizado', o.description);
    if (o.notes) paragraph('Observaciones', o.notes);
    const e = entries[0];
    section('Trabajos realizados');
    table(workCols, workRows(e.services), { empty: 'Sin trabajos registrados.' });
    if (e.issues.length) {
      section('Fallas reportadas');
      table([
        { h: 'Fecha', w: 60, get: (i) => fmtD(i.date) },
        { h: 'Componente', w: 120, get: (i) => (i.componentId ? compName(i.componentId) : '—'), b: true },
        { h: 'Descripción', w: CW - 60 - 120 - 90, get: (i) => [i.description, i.notes].filter(Boolean).join(' · ') },
        { h: 'Gravedad', w: 90, get: (i) => ({ text: severityLabel(i.severity), state: i.severity }) },
      ], e.issues);
    }
    section('Reemplazos');
    replacements(e.components);
    if (e.tires.length) { section('Llantas'); tires(e.tires); }
    if (e.oil.length) { section('Cambio de aceite'); oilBlock(e.oil); }
    section('Diagrama de daños', 200);
    const dg = diagram(e.components, { note: 'Azul: componente reemplazado (la gravedad original se conserva en la tabla). Si un componente tiene varias incidencias se muestra la más alta.' });
    componentTable(dg.list, dg.nums);
    const ph = e.photos;
    if (ph.length) { section('Evidencias', 180); photos(ph); }
  } else {
    const all = entries.map((e) => e.order), p = args.period || {};
    kvGrid([
      [isV ? 'Número económico' : 'Identificador', eq.label], ['Placas', eq.placas || '—'],
      ['Tipo de equipo', isV ? 'Tractocamión' : 'Remolque'], [isV ? 'Último kilometraje' : 'Tipo de remolque', isV ? kmText([...all].reverse().find((o) => Number.isFinite(o.odometer))?.odometer ?? null) : kindLabel(kind)],
    ]);
    section('Periodo y filtros');
    kvGrid([['Desde', p.from ? fmtD(new Date(p.from + 'T00:00:00').getTime()) : 'Inicio del historial'], ['Hasta', p.to ? fmtD(new Date(p.to + 'T00:00:00').getTime()) : 'Hoy'], ['Tipos de mantenimiento', p.typesText || 'Todos'], ['Estados', p.statusesText || 'Todos']]);
    const comps = entries.flatMap((e) => e.components), works = entries.flatMap((e) => e.services), tl = entries.flatMap((e) => e.tires);
    const ms = all.reduce((a, o) => { const d = orderDuration(o, issuedAt); return a + (d ? d.ms : 0); }, 0);
    section('Resumen');
    kvGrid([
      ['Servicios (órdenes)', String(all.length)], ['Tiempo total en taller', all.length ? durationText(ms) : '—'],
      ['Trabajos registrados', String(works.length)], ['Componentes intervenidos', String(new Set(comps.map((c) => c.componentId)).size)],
      ['Reemplazos de componentes', String(replacedOf(comps).length)], ['Llantas reemplazadas', String(tl.reduce((a, t) => a + (t.quantity || 0), 0))],
      ['Cambios de aceite', String(entries.reduce((a, e) => a + e.oil.length, 0))], ['Fallas relacionadas', String(entries.reduce((a, e) => a + e.issues.length, 0))],
    ]);
    section('Servicios del periodo');
    table([
      { h: 'Folio', w: 116, get: (o) => o.folio, b: true },
      { h: 'Ingreso', w: 70, get: (o) => fmtDT(o.inAt) },
      { h: 'Salida', w: 70, get: (o) => (Number.isFinite(o.outAt) ? fmtDT(o.outAt) : 'En taller') },
      { h: 'Tiempo', w: 70, get: (o) => { const d = orderDuration(o, issuedAt); return d ? d.text : '—'; } },
      { h: 'Tipo y estado', w: 80, get: (o) => `${typeLabel(o.type)} · ${orderStatusOf(o.status).label}` },
      { h: 'Motivo', w: CW - 116 - 70 - 70 - 70 - 80, get: (o) => o.reason || '—' },
    ], all, { maxLines: 4, empty: 'No hay servicios con estos filtros.' });
    for (const e of entries) {
      subTitle(`${e.order.folio} · ${typeLabel(e.order.type)} · ingreso ${fmtDT(e.order.inAt)}`);
      table(workCols, workRows(e.services), { empty: 'Sin trabajos registrados en esta orden.' });
    }
    section('Reemplazos');
    replacements(comps);
    if (tl.length) { section('Llantas'); tires(tl); }
    const oilAll = entries.flatMap((e) => e.oil);
    if (oilAll.length) {
      section('Cambios de aceite');
      table([
        { h: 'Fecha', w: 80, get: (x) => fmtDT(x.date) }, { h: 'Odómetro', w: 80, get: (x) => kmText(x.odometer) },
        { h: 'Aceite', w: 150, get: (x) => [x.brand, x.viscosity, x.oilType].filter(Boolean).join(' ') || '—' }, { h: 'Litros', w: 50, get: (x) => (x.liters ? nf(x.liters, 1) : '—') },
        { h: 'Filtros', w: CW - 360, get: (x) => [x.oilFilter ? 'Filtro de aceite' : '', x.otherFilters].filter(Boolean).join(', ') || '—' },
      ], oilAll);
    }
    section('Diagrama consolidado', 200);
    const folios = new Map(all.map((o) => [o.id, o.folio]));
    const dg = diagram(comps, { note: 'Diagrama consolidado del periodo: la tabla conserva cada intervención con su fecha y folio.' });
    componentTable(dg.list, dg.nums, true, folios);
    const ph = entries.flatMap((e) => e.photos);
    if (ph.length) { section('Evidencias', 180); photos(ph); }
  }

  /* Pie de página con numeración */
  pages.forEach((pg, i) => {
    pg.items.push({ t: 'line', x1: PAGE.ml, y1: 750, x2: RX, y2: 750, c: COLOR.line, w: 0.5 });
    pg.items.push({ t: 'text', x: PAGE.w / 2, y: 763, text: pdfSafe(`PERCONSUR · ${single ? 'Reporte de mantenimiento' : 'Reporte de servicios'} · ${folio} · Página ${i + 1} de ${pages.length}`), s: 6.8, b: false, c: COLOR.muted, a: 'middle' });
  });
  return { pages, folio };
}
