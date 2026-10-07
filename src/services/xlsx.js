/*
 * Generador .xlsx mínimo y sin dependencias (funciona sin conexión).
 * Soporta: estilos (fuente, relleno, bordes, alineación, formato numérico), celdas combinadas, anchos de columna,
 * alto de filas, panel fijo, autofiltro, fórmulas con su valor calculado (para visores que no recalculan,
 * como la vista previa de iPhone) e imagen PNG (logotipo). Empaquetado ZIP sin compresión (STORE).
 */
const enc = new TextEncoder();
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zipStore(files) {
  const parts = [], central = []; let offset = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const head = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(33), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    parts.push(new Uint8Array([...u32(0x04034b50), ...head]), name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...head, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
const x = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
export const colName = (c) => { let s = ''; c += 1; while (c) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
export const ref = (r, c) => `${colName(c)}${r + 1}`;
const argb = (h) => 'FF' + h.replace('#', '').toUpperCase();
/* Fecha AAAA-MM-DD → número de serie de Excel; hora HH:MM → fracción del día */
export const xlDate = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000 + 25569; };
export const xlTime = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return (h * 60 + m) / 1440; };

class Sheet {
  constructor(name, opts = {}) { this.name = name; this.cols = opts.cols || []; this.tab = opts.tab || null; this.rows = new Map(); this.heights = new Map(); this.merges = []; this.freezeAt = null; this.filterRef = null; this.images = []; this.landscape = opts.landscape !== false; }
  set(r, c, v, s = 0, f = null) { if (!this.rows.has(r)) this.rows.set(r, new Map()); this.rows.get(r).set(c, { v, s, f }); return this; }
  height(r, h) { this.heights.set(r, h); return this; }
  merge(r1, c1, r2, c2) { this.merges.push(`${ref(r1, c1)}:${ref(r2, c2)}`); return this; }
  freeze(row, col = 0) { this.freezeAt = { row, col }; return this; }
  filter(r1, c1, r2, c2) { this.filterRef = { r1, c1, r2, c2 }; return this; }
  image(png, { row = 0, col = 0, w, h, dx = 6, dy = 6 }) { this.images.push({ png, row, col, w, h, dx, dy }); return this; }
}

export class Workbook {
  constructor({ font = 'Arial', creator = 'PERCONSUR' } = {}) {
    this.sheets = []; this.creator = creator;
    this.fonts = [`<font><sz val="10"/><name val="${font}"/><family val="2"/></font>`]; this.fontName = font;
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.numFmts = []; this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']; this.cache = new Map();
  }
  sheet(name, opts) { const s = new Sheet(name, opts); this.sheets.push(s); return s; }
  /* spec = { b, i, sz, color, fill, border: 'all'|'bottom'|'top', borderColor, h, v, wrap, indent, fmt } → índice de estilo */
  style(spec = {}) {
    const k = JSON.stringify(spec); if (this.cache.has(k)) return this.cache.get(k);
    const fontXml = `<font>${spec.b ? '<b/>' : ''}${spec.i ? '<i/>' : ''}<sz val="${spec.sz || 10}"/>${spec.color ? `<color rgb="${argb(spec.color)}"/>` : ''}<name val="${this.fontName}"/><family val="2"/></font>`;
    const add = (arr, xml) => { let i = arr.indexOf(xml); if (i < 0) { arr.push(xml); i = arr.length - 1; } return i; };
    const fontId = add(this.fonts, fontXml);
    const fillId = spec.fill ? add(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(spec.fill)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const bc = spec.borderColor ? `<color rgb="${argb(spec.borderColor)}"/>` : '<color rgb="FFD5DAE4"/>', side = (on) => (on ? `style="thin">${bc}` : '>');
    const b = spec.border, bx = (n) => b === 'all' || b === n || (Array.isArray(b) && b.includes(n));
    const borderId = b ? add(this.borders, `<border><left ${side(bx('left'))}</left><right ${side(bx('right'))}</right><top ${side(bx('top'))}</top><bottom ${side(bx('bottom'))}</bottom><diagonal/></border>`) : 0;
    let numFmtId = 0;
    if (spec.fmt) { let i = this.numFmts.indexOf(spec.fmt); if (i < 0) { this.numFmts.push(spec.fmt); i = this.numFmts.length - 1; } numFmtId = 164 + i; }
    const align = spec.h || spec.v || spec.wrap || spec.indent ? `<alignment${spec.h ? ` horizontal="${spec.h}"` : ''} vertical="${spec.v || 'center'}"${spec.wrap ? ' wrapText="1"' : ''}${spec.indent ? ` indent="${spec.indent}"` : ''}/>` : '';
    this.xfs.push(`<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1"${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${numFmtId ? ' applyNumberFormat="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`);
    const id = this.xfs.length - 1; this.cache.set(k, id); return id;
  }
  _sheetXml(sh, idx) {
    const rows = [...sh.rows.keys(), ...sh.heights.keys()].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
    let maxR = 0, maxC = 0;
    const data = rows.map((r) => {
      const cells = sh.rows.get(r) || new Map(); maxR = Math.max(maxR, r);
      const cs = [...cells.keys()].sort((a, b) => a - b).map((c) => {
        maxC = Math.max(maxC, c); const { v, s, f } = cells.get(c), rf = ref(r, c), st = s ? ` s="${s}"` : '';
        if (f != null) {
          if (typeof v === 'number' && isFinite(v)) return `<c r="${rf}"${st}><f>${x(f)}</f><v>${v}</v></c>`;
          return `<c r="${rf}"${st} t="str"><f>${x(f)}</f><v>${x(v ?? '')}</v></c>`;
        }
        if (v == null || v === '') return `<c r="${rf}"${st}/>`;
        if (typeof v === 'number' && isFinite(v)) return `<c r="${rf}"${st}><v>${v}</v></c>`;
        return `<c r="${rf}"${st} t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
      }).join('');
      const h = sh.heights.get(r);
      return `<row r="${r + 1}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cs}</row>`;
    }).join('');
    const fz = sh.freezeAt ? `<pane${sh.freezeAt.col ? ` xSplit="${sh.freezeAt.col}"` : ''} ySplit="${sh.freezeAt.row}" topLeftCell="${ref(sh.freezeAt.row, sh.freezeAt.col)}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${ref(sh.freezeAt.row, 0)}" sqref="${ref(sh.freezeAt.row, 0)}"/>` : '';
    const cols = sh.cols.length ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const af = sh.filterRef ? `<autoFilter ref="${ref(sh.filterRef.r1, sh.filterRef.c1)}:${ref(sh.filterRef.r2, sh.filterRef.c2)}"/>` : '';
    const mg = sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr>${sh.tab ? `<tabColor rgb="${argb(sh.tab)}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${ref(maxR, maxC)}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"${idx === 0 ? ' tabSelected="1"' : ''}>${fz}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${data}</sheetData>${af}${mg}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="1" orientation="${sh.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>${sh.images.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
  }
  bytes() {
    const files = [], ct = [], rels = [], sheetsXml = [], defined = [];
    let imgN = 0;
    this.sheets.forEach((sh, i) => {
      const n = i + 1;
      files.push({ name: `xl/worksheets/sheet${n}.xml`, data: this._sheetXml(sh, i) });
      ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
      rels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`);
      sheetsXml.push(`<sheet name="${x(sh.name)}" sheetId="${n}" r:id="rId${n}"/>`);
      const q = `'${sh.name.replace(/'/g, "''")}'`;
      if (sh.filterRef) { const f = sh.filterRef; defined.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${x(q)}!$${colName(f.c1)}$${f.r1 + 1}:$${colName(f.c2)}$${f.r2 + 1}</definedName>`); }
      if (sh.images.length) {
        const pics = sh.images.map((im, k) => {
          imgN++; files.push({ name: `xl/media/image${imgN}.png`, data: im.png });
          const cx = Math.round(im.w * 9525), cy = Math.round(im.h * 9525);
          return { rel: `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${imgN}.png"/>`,
            xml: `<xdr:oneCellAnchor><xdr:from><xdr:col>${im.col}</xdr:col><xdr:colOff>${im.dx * 9525}</xdr:colOff><xdr:row>${im.row}</xdr:row><xdr:rowOff>${im.dy * 9525}</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${k + 2}" name="Logotipo PERCONSUR"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${k + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>` };
        });
        files.push({ name: `xl/drawings/drawing${n}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pics.map((p) => p.xml).join('')}</xdr:wsDr>` });
        files.push({ name: `xl/drawings/_rels/drawing${n}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${pics.map((p) => p.rel).join('')}</Relationships>` });
        files.push({ name: `xl/worksheets/_rels/sheet${n}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>` });
        ct.push(`<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      }
    });
    const N = this.sheets.length;
    rels.push(`<Relationship Id="rId${N + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.unshift(
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${ct.join('')}</Types>` },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(this.title || '')}</dc:title><dc:creator>${x(this.creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
      { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>PERCONSUR</Application></Properties>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheetsXml.join('')}</sheets>${defined.length ? `<definedNames>${defined.join('')}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>` },
      { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${x(f)}"/>`).join('')}</numFmts>` : ''}<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts><fills count="${this.fills.length}">${this.fills.join('')}</fills><borders count="${this.borders.length}">${this.borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    );
    return zipStore(files);
  }
}
