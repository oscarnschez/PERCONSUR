/*
 * Hoja media carta (8.5 × 5.5 in, horizontal) de Asignación de unidades.
 * Mismo diseño que cpSheetHTML(), cpTables() y cpRowHTML() de DOCGEN 3.1: encabezado con letrero «División Campo»
 * (ícono de mazorca) y título, banda de marca, tira de datos clave (folio, fecha, planta, unidades, solicitudes),
 * tablas por solicitud y recuadro de la planta destino con su QR.
 *
 * ctx = {
 *   plant(name) -> { name, address, maps } | null   (catálogo de plantas)
 *   qr(url, cell, margin) -> dataURL | null
 * }
 */
import { DOC_VERSION_CAMPO } from '../../config/reference.js';
import { esc, fmtFecha, fmtTel, mapsURL, ecoLabel } from '../shared/format.js';
import { sic } from '../shared/docIcons.js';
import { cpSols, cpRows } from './model.js';
import { coVars } from '../puerto/sheet.js';

const CP_THEAD = '<tr><th>#</th><th>Unidad</th><th>Operador</th><th>Placas unidad</th><th>Placas remolque</th><th>Tipo de transporte</th></tr>';

function cpRowHTML(u, i) {
  return `<tr><td class="n">${String(i + 1).padStart(2, '0')}</td><td class="u">${u && u.eco ? esc(ecoLabel(u.eco)) : ''}</td><td>${u ? esc(u.op) : ''}</td><td class="pl">${u ? esc(u.pu) : ''}</td><td class="pl">${u ? esc(u.pr) : ''}</td><td>${u && u.tipo ? `<span class="h-tipo">${esc(u.tipo)}</span>` : ''}</td></tr>`;
}

function cpTables(cp, ctx) {
  const rows = cpRows(cp);
  const tbl = (list) => `<table class="h-t"><thead>${CP_THEAD}</thead><tbody>${list.map((u, i) => cpRowHTML(u, i)).join('')}</tbody></table>`;
  const SD = (k) => (cp.sols && cp.sols[k]) || {};
  const hora = (k) => (SD(k).hora ? `<em class="h-hora">Hora: <b>${esc(SD(k).hora)}</b></em>` : '');
  const qr = (k) => {
    const u = mapsURL(SD(k).maps), src = u ? ctx.qr(u, 5, 10, true) : null;
    return src ? `<a class="h-qr" href="${esc(u)}" target="_blank" rel="noopener"><img src="${src}" alt="QR de ubicación"><span>Ubicación</span></a>` : '';
  };
  const det = (k) => {
    const d = SD(k);
    return (d.lugar || d.enc || d.tel) ? `<div class="h-grp-d"><span><i>Lugar de carga:</i> ${esc(d.lugar) || '—'}</span><span><i>Encargado de cosecha:</i> ${esc(d.enc) || '—'}${d.tel ? ` &nbsp;Tel. ${esc(fmtTel(d.tel))}` : ''}</span></div>` : '';
  };
  if (!rows.length) {
    const k = cpSols(cp)[0] || '';
    return `<section class="h-grpbox"><div class="h-gl"><div class="h-grp-h">${k ? `Solicitud <b>${esc(k)}</b>` : 'Unidades asignadas'}${hora(k)}</div>${det(k)}${tbl([null])}</div>${qr(k)}</section>`;
  }
  const order = [], groups = {};
  rows.forEach((u) => { const k = (u.sol || '').trim(); if (!(k in groups)) { groups[k] = []; order.push(k); } groups[k].push(u); });
  order.sort((a, b) => (a === '') - (b === ''));
  const only = order.length === 1 && order[0] === '';
  return order.map((k) => `<section class="h-grpbox"><div class="h-gl"><div class="h-grp-h">${k ? `Solicitud <b>${esc(k)}</b>` : (only ? 'Unidades asignadas' : 'Sin número de solicitud')}${hora(k)}<span>${groups[k].length} unidad${groups[k].length > 1 ? 'es' : ''}</span></div>${det(k)}${tbl(groups[k])}</div>${qr(k)}</section>`).join('');
}

export function campoSheetHTML(cp, co, ctx, id = 'hsheet') {
  const rows = cpRows(cp);
  const nSol = new Set(rows.map((u) => (u.sol || '').trim()).filter(Boolean)).size;
  const pl = ctx.plant(cp.planta);
  const plantMaps = pl ? mapsURL(pl.maps) : '';
  const destQr = plantMaps ? ctx.qr(plantMaps, 5, 10, true) : null;
  const nb = (v) => (v ? esc(v) : '&nbsp;');
  return `<article class="hsheet" id="${id}" style="${coVars(co)}">
    <header class="h-head">
      <div class="h-id"><img src="${esc(co.logo)}" alt="${esc(co.short)}"><div><div class="s-logo">${esc(co.short)}</div><div class="h-co"><strong>${esc(co.legal)}</strong><br><span class="nw">${esc(co.addr1)}</span><br>${esc(co.addr2)}<br>${esc(co.email)}${co.web ? ` &nbsp;|&nbsp; ${esc(co.web)}` : ''}</div></div></div>
      <div class="h-title"><div class="d-kicker">${sic('corn', co.colors.c2d, 11, 2)}División Campo</div><h1 class="s-title">Asignación de unidades</h1></div>
    </header>
    <div class="d-band h-band"><i></i><i></i></div>
    <div class="d-meta h-meta">
      <div><label>Folio</label><b class="folio">${esc(cp.folio || '')}</b></div>
      <div><label>Fecha de carga</label><b>${cp.fecha ? esc(fmtFecha(cp.fecha)) : '&nbsp;'}</b></div>
      <div><label>Planta destino</label><b>${nb((cp.planta || '').replace(/^Planta /, ''))}</b></div>
      <div><label>Unidades</label><b>${rows.length || '&nbsp;'}</b></div>
      <div><label>Solicitudes</label><b>${nSol || '&nbsp;'}</b></div>
    </div>
    <div class="h-tabs">${cpTables(cp, ctx)}</div>
    ${pl ? `<div class="h-destw">${destQr ? `<a class="h-dqr" href="${esc(plantMaps)}" target="_blank" rel="noopener"><img src="${destQr}" alt="QR de ubicación de la planta"><span>Ubicación</span></a>` : ''}<div class="h-dest"><span class="h-dest-k">Planta destino</span><span class="h-dest-t">${esc(pl.name)}</span><span class="h-dest-a">${esc(pl.address)}</span></div></div>` : ''}
    <p class="h-disc">Esta asignación no representa el orden de carga real en campo. Documento de uso interno.</p>
    <div class="h-foot"><span>${esc(co.foot)}</span><span class="h-fol">${esc(cp.folio || '')}</span><span>${DOC_VERSION_CAMPO}</span></div>
  </article>`;
}
