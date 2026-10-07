/*
 * Estado de cuenta en PDF — preparación de recursos, vista previa y archivo.
 * Reutiliza pdf-lib (ya incluida localmente en /vendor, funciona sin conexión) para escribir un PDF vectorial:
 * texto real y nítido, archivo ligero y saltos de página exactos. La vista previa (SVG) y el PDF se dibujan
 * desde el mismo modelo de páginas (domain/operators/statement.js), por eso son idénticos.
 */
import { loadLib } from './libs.js';
import { buildStatement, pageToSVG, modelToPdf } from '../domain/operators/statement.js';

let measureP = null, brandP = null;
export function getMeasure() {
  if (!measureP) measureP = (async () => {
    await loadLib('pdflib');
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const d = await PDFDocument.create();
    const reg = await d.embedFont(StandardFonts.Helvetica), bold = await d.embedFont(StandardFonts.HelveticaBold);
    return (t, s, b) => (b ? bold : reg).widthOfTextAtSize(t, s);
  })().catch((e) => { measureP = null; throw e; });
  return measureP;
}
const toBytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

/* Logotipo y nombre PERCONSUR (tipografía de la marca dibujada en alta resolución) */
export function getBrand() {
  if (!brandP) brandP = (async () => {
    const r = await fetch('./assets/brand/perconsur-mark.png');
    const markBlob = await r.blob(), markBytes = await toBytes(markBlob);
    const markSrc = await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(markBlob); });
    const mi = await loadImg(markSrc);
    let word = null;
    try {
      if (document.fonts) await Promise.race([document.fonts.load('800 60px "Archivo"'), new Promise((x) => setTimeout(x, 1500))]);
      const px = 132, c = document.createElement('canvas'), set = (x) => { x.font = `800 ${px}px "Archivo", Arial, sans-serif`; if ('fontStretch' in x) x.fontStretch = 'condensed'; };
      let x = c.getContext('2d'); set(x);
      c.width = Math.ceil(x.measureText('PERCONSUR').width) + 6; c.height = Math.ceil(px * 0.78);
      x = c.getContext('2d'); set(x); x.fillStyle = '#354FA3'; x.textBaseline = 'alphabetic'; x.fillText('PERCONSUR', 3, Math.round(px * 0.74));
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      word = { w: c.width, h: c.height, src: c.toDataURL('image/png'), bytes: await toBytes(blob) };
      c.width = c.height = 0;
    } catch (e) { word = null; }
    return { mark: { w: mi.naturalWidth, h: mi.naturalHeight, src: markSrc, bytes: markBytes }, word };
  })().catch((e) => { brandP = null; throw e; });
  return brandP;
}

/* Arma el modelo de páginas con los datos actuales del operador */
export async function prepareStatement(args) {
  const [measure, brand] = await Promise.all([getMeasure(), getBrand()]);
  const model = buildStatement({ ...args, measure, imgs: { mark: brand.mark, word: brand.word } });
  return { model, brand };
}
export const statementSVGs = ({ model, brand }) => model.pages.map((p) => pageToSVG(p, { mark: brand.mark.src, word: brand.word && brand.word.src }));
export async function statementBlob({ model, brand }, meta) {
  await loadLib('pdflib');
  const bytes = await modelToPdf(window.PDFLib, model.pages, { mark: brand.mark.bytes, word: brand.word && brand.word.bytes }, meta);
  return new Blob([bytes], { type: 'application/pdf' });
}
