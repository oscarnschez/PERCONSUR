/*
 * Hoja tamaño carta de la Nota de entrega – recepción y hojas de anexo fotográfico.
 * Mismo diseño que sheet() y annexSheets() de DOCGEN 3.1: encabezado con letrero de modalidad y título, banda de marca,
 * tira de datos clave con código de barras del folio, secciones numeradas, íconos de trazo y pie con folio y hoja.
 * Estilos en styles/documents.css. La empresa, las fotos y los QR llegan como parámetros en lugar de variables globales.
 *
 * ctx = {
 *   photoURL(foto) -> string   URL utilizable de la foto { id, t }
 *   qr(text) -> dataURL|null   QR (qrcode-generator) para la dirección
 * }
 */
import { LADOS, TIPOS, DOC_VERSION_PUERTO, modalLbl } from '../../config/reference.js';
import { esc, fmtFecha, fmtStamp, fmtKg, kg, naviera, trackURL, mapsSearchURL, ecoLabel } from '../shared/format.js';
import { sic } from '../shared/docIcons.js';
import { barcodeSVG } from '../shared/barcode.js';
import { filledConts, contsWithFotos } from './model.js';

const val = (x) => (x ? esc(x) : '<span class="blank"></span>');
const tipoDesc = (t) => (TIPOS.find(([v]) => v === t) || [])[1] || '';
const pad2 = (n) => String(n).padStart(2, '0');
/* Encabezado de sección numerado: 01 TRANSPORTE ───── (dato a la derecha) */
const H = (n, t, aside = '') => `<h2 class="s-h"><span class="s-n">${n}</span>${t}<span class="s-hl"></span>${aside}</h2>`;

/* Variables CSS de color de la empresa, aplicadas a cada hoja (antes se aplicaban a :root) */
export function coVars(co) {
  return Object.entries(co.colors).map(([k, v]) => `--${k}:${v}`).join(';');
}

export function coText(co) {
  return `<div class="s-co"><strong>${esc(co.legal)}</strong><br><span class="nw">${esc(co.addr1)}</span><br>${esc(co.addr2)}<br>${esc(co.email)}${co.web ? ` &nbsp;|&nbsp; ${esc(co.web)}` : ''}</div>`;
}

function trackLink(state, co) {
  if (state.showTrack === false) return '';
  const u = trackURL(state.track);
  return u ? `<a class="s-track" href="${esc(u)}" target="_blank" rel="noopener" title="Rastreo GPS de la unidad">${sic('target', co.colors.c1, 13, 2.2)}Rastreo GPS</a>` : '';
}

function evSummary(state, co) {
  const list = contsWithFotos(state);
  if (!list.length) return '';
  const n = list.reduce((a, { c }) => a + Object.keys(c.fotos).length, 0), m = list.length;
  return `<div class="s-ev">${sic('camera', co.colors.c1, 13)}<span><b>Evidencia fotográfica:</b> ${n} foto${n > 1 ? 's' : ''} de ${m} contenedor${m > 1 ? 'es' : ''}. Ver anexo en ${m > 1 ? `hojas 2 a ${m + 1}` : 'hoja 2'}.</span></div>`;
}

export function puertoSheetHTML(state, co, ctx, label = '') {
  const filled = filledConts(state);
  const rows = [...filled];
  if (!rows.length) rows.push(null);
  const qty = filled.length;
  const anySP = state.conts.some((c) => c.sobre);
  const totB = filled.reduce((a, c) => a + (parseInt(c.bultos, 10) || 0), 0);
  const totKg = filled.reduce((a, c) => {
    const p = kg(c.peso), t = kg(c.tara);
    if (p != null || t != null) { a.any = true; a.peso += p || 0; a.tara += t || 0; a.bruto += (p || 0) + (t || 0); }
    return a;
  }, { any: false, peso: 0, tara: 0, bruto: 0 });
  const qrUrl = mapsSearchURL(state.destDir);
  const qrSrc = qrUrl ? ctx.qr(qrUrl, 4, 2) : null;
  const nav = naviera(state.bl);
  const K = co.colors, pages = 1 + contsWithFotos(state).length;
  const bc = barcodeSVG(state.folio);

  return `<article class="sheet" style="${coVars(co)}">
    <header class="d-head">
      ${co.mark ? `<div class="d-co"><img class="s-mark" src="${esc(co.logo)}" alt="${esc(co.short)}">
        <div><div class="s-logo">${esc(co.short)}</div>${coText(co)}</div></div>`
    : `<div class="d-co s-id-w"><div><img class="s-wlogo" src="${esc(co.logo)}" alt="${esc(co.short)}">${coText(co)}</div></div>`}
      <div class="d-title">
        <div class="d-kicker">${modalLbl()}</div>
        <h1 class="s-title">Nota de entrega</h1>
        <p class="d-sub">Recepción de mercancía</p>
        ${label ? `<p class="d-sub" style="color:${K.c1}">${label}</p>` : ''}
        ${bc ? `<div class="d-bc">${bc}</div>` : ''}
      </div>
    </header>
    <div class="d-band"><i></i><i></i></div>
    <div class="d-meta">
      <div><label>Folio</label><b class="folio">${val(state.folio)}</b></div>
      <div><label>Fecha</label><b>${val(fmtFecha(state.fecha))}</b></div>
      <div><label>Hora</label><b>${val(state.hora)}</b></div>
      <div><label>Carta porte</label><b class="mono">${val(state.cartaPorte)}</b></div>
      <div><label>Pedimento</label><b class="mono">${val(state.pedimento)}</b></div>
    </div>

    <section class="s-sec">${H('01', 'Transporte', trackLink(state, co))}
      <div class="s-cells c4">
        <div class="s-cell"><label>Operador</label><div>${val(state.operador)}</div></div>
        <div class="s-cell"><label>No. económico</label><div class="mono">${state.eco ? esc(ecoLabel(state.eco)) : '<span class="blank"></span>'}</div></div>
        <div class="s-cell"><label>Placas unidad</label><div class="mono">${val(state.placasU)}</div></div>
        <div class="s-cell"><label>Placas remolque</label><div class="mono">${val(state.placasR)}</div></div>
      </div>
    </section>

    <section class="s-sec">${H('02', 'Contenedores transportados', `<small>${state.trafico ? `Tráfico <b class="s-traf">${esc(state.trafico)}</b> &nbsp;·&nbsp; ` : ''}Cantidad <b>${qty || '____'}</b></small>`)}
      <table class="s-t"><thead><tr><th>#</th><th>Número de contenedor</th><th>Tipo</th><th>Sello</th><th>Mercancía</th><th class="r">Bultos / pallets</th><th class="r">Peso mercancía</th></tr></thead>
      <tbody>${rows.map((c, i) => `<tr><td class="n">${pad2(i + 1)}</td>
        <td class="num">${c ? esc(c.num) : ''}</td><td>${c && (c.num || c.merc) ? esc(c.tipo) : ''}</td>
        <td class="sello">${c ? esc(c.sello) : ''}</td><td>${c ? esc(c.merc) : ''}</td><td class="r">${c && c.bultos ? (+c.bultos).toLocaleString('es-MX') : ''}</td>
        <td class="r">${c ? fmtKg(kg(c.peso)) : ''}</td></tr>`).join('')}</tbody>
      ${totKg.peso || totB || state.bl || anySP || state.custodia ? `<tfoot><tr><td colspan="5"><div class="t-foot"><div class="t-tags">${state.bl ? `<div class="s-bl"><span>BL</span><b>${esc(state.bl)}${nav ? `<i>${esc(nav)}</i>` : ''}</b></div>` : ''}${anySP ? '<div class="s-sp">Sobrepeso</div>' : ''}${state.custodia ? '<div class="s-sp s-cus">Custodia</div>' : ''}</div><span>Total</span></div></td><td class="r">${totB ? totB.toLocaleString('es-MX') : ''}</td><td class="r">${totKg.peso ? fmtKg(totKg.peso) : ''}</td></tr></tfoot>` : ''}</table>
    </section>

    <section class="s-sec">${H('03', 'Lugar de entrega')}
      <div class="s-dest">
      <div class="s-cells cdest">
        <div class="s-cell"><label>Entregar a</label><div>${val(state.destNombre)}</div></div>
        <div class="s-cell"><label>RFC</label><div class="mono">${val(state.destRFC)}</div></div>
        <div class="s-cell"><label>Contacto</label><div>${val(state.destContacto)}</div></div>
        <div class="s-cell full"><label>Dirección</label><div>${state.destDir ? esc(state.destDir).replace(/\n/g, '<br>') : '<span class="blank"></span>'}</div></div>
      </div>
      ${qrSrc ? `<a class="s-qr" href="${esc(qrUrl)}" target="_blank" rel="noopener"><img src="${qrSrc}" alt="Código QR de la dirección de entrega"><span>Ubicación de entrega</span></a>` : ''}
      </div>
    </section>

    <section class="s-sec">${H('04', 'Observaciones')}
      <div class="s-obs3">
        <div class="s-ob"><label>Daños</label><div class="s-obs">${esc(state.obsDan)}</div></div>
        <div class="s-ob"><label>Faltantes</label><div class="s-obs">${esc(state.obsFal)}</div></div>
        <div class="s-ob"><label>Notas</label><div class="s-obs">${esc(state.obs)}</div></div>
      </div>
      ${evSummary(state, co)}
    </section>

    <p class="s-decl">${sic('shield', K.c2d, 14)}<span>Se confirma la recepción de la mercancía descrita, deslindando a la empresa transportista de daños, pérdidas o faltantes posteriores a la entrega que no le sean imputables.</span></p>

    <div class="s-sign">
      <div><h3>${sic('pen', K.c1, 12)}Recibe (almacén)</h3>
        <div class="s-line first">Nombre de quien recibe</div>
        <div class="s-line">Firma</div></div>
      <div><h3>${sic('seal', K.c1, 12)}Sello del almacén</h3><div class="s-seal">Sello oficial del almacén receptor</div></div>
    </div>

    <div class="s-foot s-foot3"><span>${esc(co.foot)}</span><span class="s-ffol">${esc(state.folio)}</span><span>${DOC_VERSION_PUERTO} · Hoja 1 de ${pages}</span></div>
  </article>`;
}

/* Una hoja de anexo por cada contenedor con fotos (cuadrícula 2×2 por lado) */
export function puertoAnnexHTML(state, co, ctx) {
  const list = contsWithFotos(state), tot = list.length + 1;
  return list.map(({ c, i }, p) => `<article class="sheet annex" style="${coVars(co)}">
    <div class="a-head"><img class="a-mark${co.mark ? '' : ' a-wide'}" src="${esc(co.logo)}" alt="">
      <div><div class="a-title">Evidencia fotográfica</div>
      <div class="a-sub">Anexo de la nota <b>${esc(state.folio)}</b> &nbsp;·&nbsp; ${esc(fmtFecha(state.fecha))}</div></div>
      <div class="a-cont">Contenedor<b>${i + 1} / ${state.conts.length}</b></div></div>
    <div class="d-band a-band"><i></i><i></i></div>
    <div class="s-cells c3">
      <div class="s-cell"><label>Número de contenedor</label><div class="mono">${val(c.num)}</div></div>
      <div class="s-cell"><label>Tipo</label><div>${c.tipo ? `${esc(c.tipo)} <span class="s-tdesc">${esc(tipoDesc(c.tipo))}</span>` : val('')}</div></div>
      <div class="s-cell"><label>Sello</label><div class="mono">${val(c.sello)}</div></div>
    </div>
    <div class="a-grid">${LADOS.map(([k, l]) => {
      const ph = c.fotos[k];
      const url = ph ? ctx.photoURL(ph) : '';
      return `<figure class="a-ph">${url ? `<div class="a-img" style="background-image:url('${url}')"></div>` : '<div class="a-img">Sin foto</div>'}
        <figcaption><b>${l}</b><span>${ph ? fmtStamp(ph.t) : ''}</span></figcaption></figure>`;
    }).join('')}</div>
    <div class="s-foot s-foot3"><span>${esc(co.foot)}</span><span class="s-ffol">${esc(state.folio)}</span><span>${DOC_VERSION_PUERTO} · Hoja ${p + 2} de ${tot}</span></div>
  </article>`).join('');
}
