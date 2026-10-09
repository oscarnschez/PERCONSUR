/*
 * Taller — reporte en PDF (individual por orden y consolidado por equipo y periodo).
 * Arma el modelo de páginas (carta, puntos, origen arriba) que dibujan pageToSVG (vista previa) y modelToPdf (archivo)
 * de domain/operators/statement.js: la vista previa es el mismo documento. Diseño de DOCGEN 3.1 (domain/shared/pageDoc.js).
 * El diagrama se dibuja con las mismas rutas vectoriales de la app (diagrams.js → pdfItems), con colores por estado,
 * números y leyenda.
 */
import { PAGE, COLOR } from '../operators/statement.js';
import { DOC, TR, createDoc } from '../shared/pageDoc.js';
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
  const compName = (id) => (componentOf(kind, id, parts) || { name: 'Componente' }).name;
  const issued = splitTs(issuedAt);
  const o0 = single ? entries[0].order : null;
  const dateRange = (p) => `${p.from ? fmtD(new Date(p.from + 'T00:00:00').getTime()) : 'Inicio'} – ${p.to ? fmtD(new Date(p.to + 'T00:00:00').getTime()) : 'Hoy'}`;
  const eqText = `${eq.label}${eq.placas && eq.placas !== eq.label ? ' · ' + eq.placas : ''}`;
  const D = createDoc({
    measure, imgs, company,
    head: {
      kicker: 'Operación · Taller', title: single ? 'Reporte de mantenimiento y reparación' : 'Reporte de servicios de mantenimiento',
      sub: single ? 'Orden de servicio de taller' : 'Historial de servicios del equipo', folio,
      meta: single
        ? [{ label: 'Folio', value: folio, folio: true, w: 1.7 }, { label: 'Generado', value: `${fmtD(issuedAt)} ${issued.time}`, w: 1.15 }, { label: 'Equipo', value: eqText, w: 1.1 }, { label: 'Tipo', value: typeLabel(o0.type), w: 1 }, { label: 'Estado', value: orderStatusOf(o0.status).label, w: 0.9 }]
        : [{ label: 'Referencia', value: folio, folio: true, w: 1.6 }, { label: 'Generado', value: `${fmtD(issuedAt)} ${issued.time}`, w: 1.15 }, { label: 'Equipo', value: eqText, w: 1.1 }, { label: 'Periodo', value: dateRange(args.period || {}), w: 1.45 }, { label: 'Servicios', value: String(entries.length), w: 0.7 }],
    },
    cont: { title: single ? 'Reporte de mantenimiento' : 'Reporte de servicios', sub: [[eqText, false]], asideLabel: single ? 'Folio' : 'Referencia', asideValue: folio },
    foot: { left: 'PERCONSUR | Operación · Taller', center: folio },
  });
  const { text, rect, line, image, fit, wrap } = D;
  const W = D.W;
  let y = 0;

  function newPage() { y = D.newPage(); }
  const ensure = (h) => { if (y + h > PAGE.bottom) { newPage(); return true; } return false; };

  /* ===== Bloques ===== */
  function section(t, minAfter = 30) { ensure(22 + minAfter); y = D.sectionHead(y, t).y; }
  function subTitle(t) { ensure(30); text(PAGE.ml, y + 9, t, { s: 8.2, b: true, c: COLOR.blueD }); y += 15; }
  /* Celdas en dos columnas (.s-cells): etiqueta en mayúsculas arriba y dato abajo (hasta dos líneas) */
  function kvGrid(rows) {
    const colW = CW / 2;
    for (let i = 0; i < rows.length; i += 2) {
      const pair = rows.slice(i, i + 2), ls = pair.map(([, v]) => wrap(v || '—', 8.6, true, colW - 15, 2));
      const h = Math.max(31, 20 + Math.max(...ls.map((l) => l.length)) * 10.5);
      ensure(h);
      rect(PAGE.ml, y, CW, h, { stroke: DOC.line, sw: 0.75 });
      pair.forEach(([k], j) => {
        const x = PAGE.ml + j * colW;
        if (j) line(x, y, x, y + h, { c: DOC.line2, w: 0.75 });
        text(x + 7.5, y + 11, k, { s: 6, b: true, up: true, tr: TR, c: DOC.mute });
        ls[j].forEach((l, li) => text(x + 7.5, y + 23 + li * 10.5, l, { s: 8.6, b: true }));
      });
      y += h;
    }
    y += 12;
  }
  /* Texto con título (.s-ob): franja azul clara con la etiqueta y el texto debajo */
  function paragraph(label, value, { maxLines = 8 } = {}) {
    const lines = wrap(value || '—', 7.8, false, CW - 18, maxLines), h = 14 + lines.length * 10 + 6;
    ensure(h);
    rect(PAGE.ml, y, CW, 14, { fill: DOC.c1l });
    rect(PAGE.ml, y, CW, h, { stroke: DOC.line, sw: 0.75 });
    line(PAGE.ml, y + 14, PAGE.ml + CW, y + 14, { c: DOC.line2 });
    text(PAGE.ml + 9, y + 9.6, label, { s: 6, b: true, up: true, tr: TR, c: DOC.c1 });
    lines.forEach((l, i) => text(PAGE.ml + 9, y + 25 + i * 10, l, { s: 7.8 }));
    y += h + 8;
  }
  const swatch = (x, yy, state) => rect(x, yy - 6.4, 7, 7, { fill: STATE_COLORS[state], stroke: '#2D3442', sw: 0.4 });
  /* Tabla con encabezado repetido en cada página (.s-t); cols: [{ h, w, get(row) → texto | { text, state } }] */
  function table(cols, rows, { maxLines = 3, empty = 'Sin registros.' } = {}) {
    const xs = []; let acc = PAGE.ml; cols.forEach((c) => { xs.push(acc); acc += c.w; });
    const hc = cols.map((c) => ({ label: c.h, w: c.w }));
    const head = () => { ensure(16 + 16); y = D.tableHead(y, hc, xs, 15); };
    head();
    if (!rows.length) { D.rowFrame(y, 20, 0); text(PAGE.ml + 6, y + 13, empty, { s: 7.4, c: COLOR.muted }); y += 20; D.tableEnd(y); y += 12; return; }
    rows.forEach((r, ri) => {
      const cells = cols.map((c) => { const v = c.get(r); const o = typeof v === 'object' && v ? v : { text: v }; return { ...o, lines: wrap(o.text || '—', 7.2, !!c.b, c.w - 10 - (o.state ? 10 : 0), maxLines) }; });
      const h = Math.max(...cells.map((c) => c.lines.length)) * 9.4 + 7;
      if (y + h > PAGE.bottom) { D.tableEnd(y); newPage(); head(); }
      D.rowFrame(y, h, ri);
      cells.forEach((c, ci) => {
        const x = xs[ci], ox = c.state ? 10 : 0;
        if (c.state) swatch(x + 6, y + 10.5, c.state);
        c.lines.forEach((l, li) => text(x + 6 + ox, y + 10.5 + li * 9.4, l, { s: 7.2, b: !!cols[ci].b }));
      });
      y += h;
    });
    D.tableEnd(y);
    y += 12;
  }
  function legend() {
    ensure(22);
    let x = PAGE.ml;
    text(x, y + 9, 'Leyenda', { s: 6.4, b: true, up: true, tr: TR, c: DOC.mute }); x += D.textW('Leyenda', { s: 6.4, b: true, up: true, tr: TR }) + 8;
    for (const k of ['none', 'leve', 'moderado', 'total', 'reemplazado']) {
      swatch(x, y + 9.4, k); x += 10;
      text(x, y + 9, STATE_LABELS[k], { s: 7 }); x += W(STATE_LABELS[k], 7, false) + 12;
    }
    y += 18;
  }
  /* Diagrama: vistas donde aparecen los componentes intervenidos (o la principal si no hay ninguno) */
  /* El título de la sección se dibuja aquí: así reserva el alto de la primera vista y nunca queda solo al pie */
  function diagram(records, { title, note = '' } = {}) {
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
    const firstH = wide.length ? CW * wide[0].h / wide[0].w : Math.max(...narrow.slice(0, 2).map((v) => ((CW - 14) / 2) * v.h / v.w));
    section(title, firstH + 26);
    const drawView = (v, box) => {
      text(box.x, y + 9, v.name, { s: 6.4, b: true, up: true, tr: TR, c: DOC.mute });
      const r = pdfItems(kind, v.id, { states, numbers: nums }, { x: box.x, y: y + 14, w: box.w, h: box.h });
      D.rrect(box.x, y + 12, box.w, r.h + 6, 3, { stroke: DOC.line, sw: 0.75 });
      r.items.forEach((it) => D.page.items.push(it));
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
        D.rrect(x, y, bw, bh, 3, { fill: DOC.photo, stroke: DOC.line, sw: 0.75 });
        const k = Math.min((bw - 8) / p.w, (bh - 8) / p.h), w = p.w * k, h = p.h * k;
        image(p.key, x + (bw - w) / 2, y + (bh - h) / 2, w, h);
        text(x + 1.5, y + bh + 10, fit(p.caption || 'Evidencia', 7.4, true, bw - 3), { s: 7.4, b: true, c: DOC.c1 });
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
      text(PAGE.ml, y + 9, 'Posiciones con llanta nueva', { s: 6.4, b: true, up: true, tr: TR, c: DOC.mute });
      const r = tirePdfItems(layout, replaced, { x: PAGE.ml, y: y + 14, w: 150, h: 260 });
      r.items.forEach((it) => D.page.items.push(it));
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
    const dg = diagram(e.components, { title: 'Diagrama de daños', note: 'Azul: componente reemplazado (la gravedad original se conserva en la tabla). Si un componente tiene varias incidencias se muestra la más alta.' });
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
    const folios = new Map(all.map((o) => [o.id, o.folio]));
    const dg = diagram(comps, { title: 'Diagrama consolidado', note: 'Diagrama consolidado del periodo: la tabla conserva cada intervención con su fecha y folio.' });
    componentTable(dg.list, dg.nums, true, folios);
    const ph = entries.flatMap((e) => e.photos);
    if (ph.length) { section('Evidencias', 180); photos(ph); }
  }

  /* Pie de página con folio y numeración */
  const pages = D.finish();
  return { pages, folio };
}
