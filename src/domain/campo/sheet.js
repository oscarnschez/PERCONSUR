/*
 * Hoja media carta (8.5 × 5.5 in, horizontal) de Asignación de unidades.
 * Port fiel de cpSheetHTML(), cpTables(), cpRowHTML(), cobSVG() y plantStaticSVG().
 * La planta de maíz del documento lleva una mazorca por unidad asignada (máx. 6).
 *
 * ctx = {
 *   plant(name) -> { name, address, maps } | null   (catálogo de plantas)
 *   qr(url, cell, margin) -> dataURL | null
 * }
 */
import { DOC_VERSION_CAMPO } from '../../config/reference.js';
import { esc, fmtFecha, fmtTel, mapsURL, ecoLabel } from '../shared/format.js';
import { cpSols, cpRows } from './model.js';
import { coVars } from '../puerto/sheet.js';

export const CORN_WM = './assets/brand/corn-watermark.png';

const CP_THEAD = '<tr><th>#</th><th>Unidad</th><th>Operador</th><th>Placas unidad</th><th>Placas remolque</th><th>Tipo de transporte</th></tr>';

function cpRowHTML(u, i) {
  return `<tr><td class="n">${i + 1}</td><td class="u">${u && u.eco ? esc(ecoLabel(u.eco)) : ''}</td><td>${u ? esc(u.op) : ''}</td><td>${u ? esc(u.pu) : ''}</td><td>${u ? esc(u.pr) : ''}</td><td>${u && u.tipo ? `<span class="h-tipo">${esc(u.tipo)}</span>` : ''}</td></tr>`;
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

/* ===== Planta de maíz (una mazorca por unidad) ===== */
const PL_SLOTS = [{ y: 222, d: 1 }, { y: 176, d: -1 }, { y: 246, d: -1 }, { y: 150, d: 1 }, { y: 200, d: 1 }, { y: 128, d: -1 }];
function cobSVG() {
  return `<g><path d="M0 -4 C-9 -14 -8 -40 0 -48 C8 -40 9 -14 0 -4 Z" fill="#E0B23A"/>
    <g fill="#C9921C"><circle cx="-3" cy="-38" r="1.9"/><circle cx="3" cy="-38" r="1.9"/><circle cx="-4" cy="-30" r="2"/><circle cx="1" cy="-30" r="2"/><circle cx="5" cy="-31" r="1.8"/><circle cx="-4" cy="-22" r="2"/><circle cx="1" cy="-22" r="2"/><circle cx="5" cy="-22" r="1.8"/><circle cx="-2" cy="-14" r="1.9"/><circle cx="3" cy="-14" r="1.9"/></g>
    <path d="M0 2 C-14 -8 -14 -30 -7 -42 C-8 -26 -4 -12 2 -2 Z" fill="#43A047"/>
    <path d="M0 2 C14 -8 14 -30 7 -42 C8 -26 4 -12 -2 -2 Z" fill="#388E3C"/>
    <path d="M0 -48 C-2 -54 1 -59 5 -61" fill="none" stroke="#B8860B" stroke-width="1.4" stroke-linecap="round"/></g>`;
}
const PL_BODY = '<g fill="none" stroke="#2E7D32" stroke-linecap="round"><path d="M100 52 L100 14" stroke-width="3"/><path d="M100 28 Q88 20 80 4" stroke-width="2.4"/><path d="M100 31 Q113 22 121 6" stroke-width="2.4"/><path d="M100 38 Q84 34 72 22" stroke-width="2.4"/><path d="M100 40 Q118 36 130 24" stroke-width="2.4"/><path d="M100 48 C98 130 102 220 100 296" stroke-width="7"/></g><g fill="#2E7D32"><path d="M100 118 C74 98 40 98 10 118 C42 110 72 112 100 128 Z"/><path d="M100 96 C126 74 160 70 192 86 C160 82 130 90 100 106 Z"/><path d="M100 186 C70 168 38 176 12 204 C42 186 72 186 100 196 Z"/><path d="M100 236 C130 216 164 218 192 240 C162 230 130 234 100 246 Z"/><path d="M100 270 C76 258 48 266 24 290 C50 276 76 274 100 280 Z"/></g>';

export function plantStaticSVG(n) {
  n = Math.min(PL_SLOTS.length, n);
  const cobs = PL_SLOTS.slice(0, n).map((sl) => `<g transform="translate(100 ${sl.y}) rotate(${sl.d * 32})">${cobSVG()}</g>`).join('');
  return `<svg class="h-plant" viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">${PL_BODY}${cobs}<path d="M40 297 Q100 290 160 297" stroke="#6D4C2F" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
}

export function campoSheetHTML(cp, co, ctx, id = 'hsheet') {
  const rows = cpRows(cp);
  const pl = ctx.plant(cp.planta);
  const plantMaps = pl ? mapsURL(pl.maps) : '';
  const destQr = plantMaps ? ctx.qr(plantMaps, 5, 10, true) : null;
  return `<article class="hsheet" id="${id}" style="${coVars(co)}">
    <img class="h-wm" src="${CORN_WM}" alt="" aria-hidden="true">
    ${cp.units.length && !pl ? plantStaticSVG(cp.units.length) : ''}
    <div class="h-head">
      <div class="h-id"><img src="${esc(co.logo)}" alt="${esc(co.short)}"><div><div class="s-logo">${esc(co.short)}</div><div class="h-co"><strong>${esc(co.legal)}</strong><br><span style="white-space:nowrap">${esc(co.addr1)}</span><br>${esc(co.addr2)}<br>${esc(co.email)}${co.web ? ` &nbsp;|&nbsp; ${esc(co.web)}` : ''}</div></div></div>
      <div class="h-box"><h1>ASIGNACIÓN DE UNIDADES</h1><dl>
        <dt>Fecha de carga</dt><dd>${cp.fecha ? esc(fmtFecha(cp.fecha)) : '&nbsp;'}</dd>
        <dt>Planta destino</dt><dd>${esc((cp.planta || '').replace(/^Planta /, '')) || '&nbsp;'}</dd>
        <dt>Unidades</dt><dd>${rows.length || '&nbsp;'}</dd></dl></div>
    </div>
    <div class="h-div">División Campo</div>
    <div class="h-band"></div>
    <div class="h-tabs">${cpTables(cp, ctx)}</div>
    ${pl ? `<div class="h-destw">${destQr ? `<a class="h-dqr" href="${esc(plantMaps)}" target="_blank" rel="noopener"><img src="${destQr}" alt="QR de ubicación de la planta"><span>Ubicación destino</span></a>` : ''}<div class="h-dest">${cp.units.length ? plantStaticSVG(cp.units.length) : ''}<span class="h-dest-t">${esc(pl.name)}</span><span class="h-dest-a">${esc(pl.address)}</span></div></div>` : ''}
    <p class="h-disc">Esta asignación no representa el orden de carga real en campo. Documento de uso interno.</p>
    <div class="h-foot" style="margin-top:auto"><span>${esc(co.foot)}</span><span class="h-fol">${esc(cp.folio || '')}</span><span>${DOC_VERSION_CAMPO}</span></div>
  </article>`;
}
