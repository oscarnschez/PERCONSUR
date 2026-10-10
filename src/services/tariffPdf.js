/*
 * Tarifas en PDF — vista previa y archivo de un apartado.
 * Misma infraestructura que el estado de cuenta y la cobranza: pdf-lib local (sin conexión), PDF vectorial con texto real
 * y una vista previa SVG que dibuja exactamente el mismo modelo de páginas.
 */
import { loadLib } from './libs.js';
import { getMeasure, getBrand } from './statementPdf.js';
import { pageToSVG, modelToPdf } from '../domain/operators/statement.js';
import { buildTariffReport } from '../domain/tariffs/report.js';

export async function prepareTariffReport(args) {
  const [measure, brand] = await Promise.all([getMeasure(), getBrand()]);
  const model = buildTariffReport({ ...args, measure, imgs: { mark: brand.mark, word: brand.word } });
  return { model, brand };
}
export const tariffSVGs = ({ model, brand }) => model.pages.map((p) => pageToSVG(p, { mark: brand.mark.src, word: brand.word && brand.word.src }));
export async function tariffBlob({ model, brand }, meta) {
  await loadLib('pdflib');
  const bytes = await modelToPdf(window.PDFLib, model.pages, { mark: brand.mark.bytes, word: brand.word && brand.word.bytes }, { subject: 'Tarifas de transporte', ...meta });
  return new Blob([bytes], { type: 'application/pdf' });
}
