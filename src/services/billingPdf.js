/*
 * Reporte de cobranza en PDF — vista previa y archivo.
 * Usa la misma infraestructura que el estado de cuenta (pdf-lib local, PDF vectorial, vista previa SVG idéntica).
 */
import { loadLib } from './libs.js';
import { getMeasure, getBrand } from './statementPdf.js';
import { pageToSVG, modelToPdf } from '../domain/operators/statement.js';
import { buildBillingReport } from '../domain/billing/report.js';

export async function prepareBillingReport(args) {
  const [measure, brand] = await Promise.all([getMeasure(), getBrand()]);
  const model = buildBillingReport({ ...args, measure, imgs: { mark: brand.mark, word: brand.word } });
  return { model, brand };
}
export const billingSVGs = ({ model, brand }) => model.pages.map((p) => pageToSVG(p, { mark: brand.mark.src, word: brand.word && brand.word.src }));
export async function billingBlob({ model, brand }, meta) {
  await loadLib('pdflib');
  const bytes = await modelToPdf(window.PDFLib, model.pages, { mark: brand.mark.bytes, word: brand.word && brand.word.bytes }, { subject: 'Reporte de cobranza', ...meta });
  return new Blob([bytes], { type: 'application/pdf' });
}
