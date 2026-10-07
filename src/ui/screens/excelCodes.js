/* Hoja "Código para Excel": un PDF417 por contenedor para escanear con Scan-IT to Office. */
import { openSheet } from '../components/sheet.js';
import { loadLibs, tryLibs } from '../../services/libs.js';
import { excelCode, bcError } from '../../services/codes.js';
import { excelRow } from '../../domain/puerto/model.js';
import { esc } from '../../domain/shared/format.js';

export async function openExcelCodes(s) {
  const sh = openSheet({ title: 'Código para Excel', className: 'xl-sheet', body: '<p class="sheet-lead">Preparando códigos…</p>' });
  const missing = await tryLibs(['bwipjs', 'qrcode']);
  let mode = '';
  const cards = s.conts.map((c, i) => {
    const b = excelCode(excelRow(s, c));
    if (b) mode = mode === 'qr' ? 'qr' : b.kind;
    const img = b ? `<img src="${b.src}" alt="Código para Excel, contenedor ${i + 1}" class="${b.kind === 'qr' ? 'xl-qr' : 'xl-pdf'}">` : '<div class="xl-err">Código no disponible</div>';
    return `<figure class="xl-card">${img}<figcaption><b>${c.num ? esc(c.num) : 'Sin número de contenedor'}</b><span>Contenedor ${i + 1}</span></figcaption></figure>`;
  }).join('');
  const status = !mode ? `No se pudo generar el código para Excel: ${esc(bcError || (missing.length ? 'se necesita conexión la primera vez' : ''))}` : mode === 'qr' ? 'Códigos QR listos para escanear.' : 'Códigos listos para escanear.';
  sh.body.innerHTML = `<p class="sheet-lead">Escanéalo con Scan-IT to Office. Sube el brillo de la pantalla si el lector no lo detecta.</p><div class="xl-codes">${cards}</div><p class="grp-note center ${mode ? '' : 'warn-t'}">${status}</p>`;
}
