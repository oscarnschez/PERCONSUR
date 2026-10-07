/* Compresión de imágenes antes de guardarlas (mismos parámetros que el original). */
function loadImage(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => res({ im, done: () => URL.revokeObjectURL(u) });
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('No se pudo leer la imagen')); };
    im.src = u;
  });
}
const toBlob = (c, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo comprimir la imagen'))), 'image/jpeg', q));

/* Evidencia fotográfica: lado mayor 1400 px, JPEG 72 % (≈ 200–400 KB por foto) */
export async function compressPhoto(file) {
  const { im, done } = await loadImage(file);
  const M = 1400, k = Math.min(1, M / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); done();
  const blob = await toBlob(c, 0.72); c.width = c.height = 0;
  return blob;
}
/* Imágenes para combinar al PDF: lado mayor 2200 px, fondo blanco, JPEG 86 % */
export async function normImage(file) {
  const { im, done } = await loadImage(file);
  const M = 2200, k = Math.min(1, M / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); done();
  const w = c.width, h = c.height;
  const blob = await toBlob(c, 0.86); c.width = c.height = 0;
  return { blob, w, h };
}

/* Fotografía de operador: recorte cuadrado centrado, 480 px, JPEG 82 % (≈ 40–70 KB) */
export async function compressAvatar(file) {
  const { im, done } = await loadImage(file);
  const side = Math.min(im.naturalWidth, im.naturalHeight), S = Math.min(480, side);
  const c = document.createElement('canvas'); c.width = c.height = S;
  c.getContext('2d').drawImage(im, (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side, 0, 0, S, S); done();
  const blob = await toBlob(c, 0.82); c.width = c.height = 0;
  return blob;
}
