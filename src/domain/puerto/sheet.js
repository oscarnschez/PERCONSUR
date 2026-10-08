/*
 * Hoja tamaño carta de la Nota de entrega – recepción y hojas de anexo fotográfico.
 * Port fiel de sheet() y annexSheets() del original: misma estructura, mismas clases
 * (estilos en styles/documents.css). Lo único que cambia es que la empresa, las fotos y
 * los QR llegan como parámetros en lugar de variables globales.
 *
 * ctx = {
 *   photoURL(foto) -> string   URL utilizable de la foto { id, t }
 *   qr(text) -> dataURL|null   QR (qrcode-generator) para la dirección
 * }
 */
import { LADOS, DOC_VERSION_PUERTO, modalLbl } from '../../config/reference.js';
import { esc, fmtFecha, fmtStamp, fmtKg, kg, naviera, trackURL, mapsSearchURL, ecoLabel } from '../shared/format.js';
import { filledConts, contsWithFotos } from './model.js';

const val = (x) => (x ? esc(x) : '<span class="blank"></span>');

/* Variables CSS de color de la empresa, aplicadas a cada hoja (antes se aplicaban a :root) */
export function coVars(co) {
  return Object.entries(co.colors).map(([k, v]) => `--${k}:${v}`).join(';');
}

function coText(co) {
  return `<div class="s-co"><strong>${esc(co.legal)}</strong><br><span class="nw">${esc(co.addr1)}</span><br>${esc(co.addr2)}<br>${esc(co.email)}${co.web ? ` &nbsp;|&nbsp; ${esc(co.web)}` : ''}</div>`;
}

function trackLink(state, co) {
  if (state.showTrack === false) return '';
  const u = trackURL(state.track);
  return u ? `<a class="s-track" href="${esc(u)}" target="_blank" rel="noopener" title="Rastreo GPS de la unidad"><img src="${esc(co.track)}" alt="">Rastreo GPS</a>` : '';
}

function evSummary(state) {
  const list = contsWithFotos(state);
  if (!list.length) return '';
  const n = list.reduce((a, { c }) => a + Object.keys(c.fotos).length, 0), m = list.length;
  return `<div class="s-ev"><b>Evidencia fotográfica:</b> ${n} foto${n > 1 ? 's' : ''} de ${m} contenedor${m > 1 ? 'es' : ''}. Ver anexo en ${m > 1 ? `hojas 2 a ${m + 1}` : 'hoja 2'}.</div>`;
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

  return `<article class="sheet" style="${coVars(co)}">
    <div class="s-head">
      <div>
        ${co.mark ? `<div class="s-id"><img class="s-mark" src="${esc(co.logo)}" alt="${esc(co.short)}">
        <div><div class="s-logo">${esc(co.short)}</div>${coText(co)}</div></div>`
    : `<div class="s-id s-id-w"><img class="s-wlogo" src="${esc(co.logo)}" alt="${esc(co.short)}">${coText(co)}</div>`}
      </div>
      <div>
        <div class="s-box"><h1>NOTA DE ENTREGA - RECEPCIÓN</h1>
          <dl><dt>Folio</dt><dd class="folio">${val(state.folio)}</dd>
              <dt>Fecha</dt><dd>${val(fmtFecha(state.fecha))}</dd>
              <dt>Hora de generación</dt><dd>${val(state.hora)}</dd>
              ${state.cartaPorte ? `<dt>Carta porte</dt><dd>${esc(state.cartaPorte)}</dd>` : ''}${state.pedimento ? `<dt>Pedimento</dt><dd>${esc(state.pedimento)}</dd>` : ''}</dl>
        </div>
        ${label ? `<p class="s-copy">${label}</p>` : ''}
      </div>
    </div>
    <div class="s-mod">${modalLbl()}</div>
    <div class="s-band"></div>

    <section class="s-sec"><h2>Transporte ${trackLink(state, co)}</h2>
      <div class="s-cells c5">
        <div class="s-cell"><label>Operador</label><div>${val(state.operador)}</div></div>
        <div class="s-cell"><label>No. económico</label><div>${state.eco ? esc(ecoLabel(state.eco)) : '<span class="blank"></span>'}</div></div>
        <div class="s-cell"><label>Placas unidad</label><div>${val(state.placasU)}</div></div>
        <div class="s-cell"><label>Placas remolque</label><div>${val(state.placasR)}</div></div>
      </div>
    </section>

    <section class="s-sec"><h2>Contenedores transportados <small>${state.trafico ? `Tráfico: <b class="s-traf">${esc(state.trafico)}</b> &nbsp;|&nbsp; ` : ''}Cantidad: ${qty || '____'}</small></h2>
      <table class="s-t"><thead><tr><th>#</th><th>Número de contenedor</th><th>Tipo</th><th>Sello</th><th>Mercancía</th><th class="r">Bultos / pallets</th><th class="r">Peso mercancía</th></tr></thead>
      <tbody>${rows.map((c, i) => `<tr><td class="n">${i + 1}</td>
        <td class="num">${c ? esc(c.num) : ''}</td><td>${c && (c.num || c.merc) ? esc(c.tipo) : ''}</td>
        <td>${c ? esc(c.sello) : ''}</td><td>${c ? esc(c.merc) : ''}</td><td class="r">${c && c.bultos ? (+c.bultos).toLocaleString('es-MX') : ''}</td>
        <td class="r">${c ? fmtKg(kg(c.peso)) : ''}</td></tr>`).join('')}</tbody>
      ${totKg.peso || totB || state.bl || anySP || state.custodia ? `<tfoot><tr><td colspan="5"><div class="t-foot"><div class="t-tags">${state.bl ? `<div class="s-bl"><span>BL</span><b>${esc(state.bl)}${nav ? `<i>${esc(nav)}</i>` : ''}</b></div>` : ''}${anySP ? '<div class="s-sp">Sobrepeso</div>' : ''}${state.custodia ? '<div class="s-sp s-cus">Custodia</div>' : ''}</div><span>Total</span></div></td><td class="r">${totB ? totB.toLocaleString('es-MX') : ''}</td><td class="r">${totKg.peso ? fmtKg(totKg.peso) : ''}</td></tr></tfoot>` : ''}</table>
    </section>

    <section class="s-sec"><h2>Lugar de entrega</h2>
      <div class="s-dest">
      <div class="s-cells cdest">
        <div class="s-cell"><label>Entregar a</label><div>${val(state.destNombre)}</div></div>
        <div class="s-cell"><label>RFC</label><div>${val(state.destRFC)}</div></div>
        <div class="s-cell"><label>Contacto</label><div>${val(state.destContacto)}</div></div>
        <div class="s-cell full"><label>Dirección</label><div>${state.destDir ? esc(state.destDir).replace(/\n/g, '<br>') : '<span class="blank"></span>'}</div></div>
      </div>
      ${qrSrc ? `<a class="s-qr" href="${esc(qrUrl)}" target="_blank" rel="noopener"><img src="${qrSrc}" alt="Código QR de la dirección de entrega"><span>Ubicación de entrega</span></a>` : ''}
      </div>
    </section>

    <section class="s-sec"><h2>Observaciones</h2>
      <div class="s-obs3">
        <div class="s-ob"><label>Daños</label><div class="s-obs">${esc(state.obsDan)}</div></div>
        <div class="s-ob"><label>Faltantes</label><div class="s-obs">${esc(state.obsFal)}</div></div>
        <div class="s-ob"><label>Notas</label><div class="s-obs">${esc(state.obs)}</div></div>
      </div>
      ${evSummary(state)}
    </section>

    <p class="s-decl">Se confirma la recepción de la mercancía descrita, deslindando a la empresa transportista de daños, pérdidas o faltantes posteriores a la entrega que no le sean imputables.</p>

    <div class="s-sign">
      <div><h3>Recibe (almacén)</h3>
        <div class="s-line first">Nombre de quien recibe</div>
        <div class="s-line">Firma</div></div>
      <div><h3>Sello del almacén</h3><div class="s-seal">Sello oficial del almacén receptor</div></div>
    </div>

    <div class="s-foot s-foot3"><span>${esc(co.foot)}</span><span class="s-ffol">${esc(state.folio)}</span><span>${DOC_VERSION_PUERTO}</span></div>
  </article>`;
}

/* Una hoja de anexo por cada contenedor con fotos (cuadrícula 2×2 por lado) */
export function puertoAnnexHTML(state, co, ctx) {
  const list = contsWithFotos(state);
  return list.map(({ c, i }) => `<article class="sheet annex" style="${coVars(co)}">
    <div class="a-head"><img class="a-mark${co.mark ? '' : ' a-wide'}" src="${esc(co.logo)}" alt="">
      <div><div class="a-title">Evidencia fotográfica</div>
      <div class="a-sub">Anexo de la nota ${esc(state.folio)} &nbsp;|&nbsp; ${esc(fmtFecha(state.fecha))}</div></div>
      <div class="a-cont">Contenedor<b>${i + 1} de ${state.conts.length}</b></div></div>
    <div class="s-band"></div>
    <div class="s-cells c3">
      <div class="s-cell"><label>Número de contenedor</label><div>${val(c.num)}</div></div>
      <div class="s-cell"><label>Tipo</label><div>${val(c.tipo)}</div></div>
      <div class="s-cell"><label>Sello</label><div>${val(c.sello)}</div></div>
    </div>
    <div class="a-grid">${LADOS.map(([k, l]) => {
      const ph = c.fotos[k];
      const url = ph ? ctx.photoURL(ph) : '';
      return `<figure class="a-ph">${url ? `<div class="a-img" style="background-image:url('${url}')"></div>` : '<div class="a-img">Sin foto</div>'}
        <figcaption><b>${l}</b><span>${ph ? 'Foto: ' + fmtStamp(ph.t) : ''}</span></figcaption></figure>`;
    }).join('')}</div>
    <div class="s-foot s-foot3"><span>${esc(co.foot)}</span><span class="s-ffol">${esc(state.folio)}</span><span>${DOC_VERSION_PUERTO}</span></div>
  </article>`).join('');
}
