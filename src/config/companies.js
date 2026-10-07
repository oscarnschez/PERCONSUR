/*
 * Empresas / identidades corporativas.
 * Fuente única de verdad: todos los documentos, encabezados y folios leen de aquí.
 * Valores portados sin cambios del objeto COMPANIES del HTML original (NER 3.0).
 * El usuario puede sobrescribir los textos desde Ajustes → Empresa (se guardan en IndexedDB
 * como "overrides"); logos, colores y series de folio permanecen fijos aquí.
 */

const BRAND = './assets/brand/';

export const COMPANY_DEFAULTS = {
  perconsur: {
    key: 'perconsur',
    short: 'PERCONSUR',
    legal: 'PERCONSUR DE NAYARIT GROUP',
    addr1: 'Juan Manuel Ruvalcaba 18, San Francisco Tesistán,',
    addr2: 'C.P. 45200, Zapopan, Jalisco',
    email: 'logistica@perconsur.mx',
    web: 'www.perconsur.mx',
    foot: 'PERCONSUR | División Puerto',
    city: 'Zapopan, Jalisco',
    logo: BRAND + 'perconsur-mark.png',
    // mark=true: logotipo cuadrado + nombre tipográfico; false: logotipo horizontal completo
    mark: true,
    // lists=true: usa los catálogos semilla originales (operadores, unidades, remolques)
    lists: true,
    track: BRAND + 'track-perconsur.png',
    folioSerie: '50',
    colors: { c1: '#354FA3', c1d: '#233878', c1m: '#4A63B5', c1l: '#EEF1F8', c2: '#F26F22', c2d: '#D65B15', c2m: '#F58A4A', c2l: '#FEF3EC' },
  },
  oasc: {
    key: 'oasc',
    short: 'OASC',
    legal: 'OSCAR ALEJANDRO SANCHEZ CASTRO',
    addr1: 'Illescas 89, Nueva Galicia Residencial,',
    addr2: 'C.P. 45645, Tlajomulco de Zúñiga, Jalisco',
    email: 'oscarasanchez.c@outlook.com',
    web: '',
    foot: 'OASC',
    city: 'Tlajomulco de Zúñiga, Jalisco',
    logo: BRAND + 'oasc-logo.png',
    mark: false,
    lists: false,
    track: BRAND + 'track-oasc.png',
    folioSerie: '70',
    colors: { c1: '#545454', c1d: '#333333', c1m: '#6E6E6E', c1l: '#F0F0F0', c2: '#CF0909', c2d: '#A30707', c2m: '#E04444', c2l: '#FCEDED' },
  },
  osc: {
    key: 'osc',
    short: 'OSC',
    legal: 'OSWALDO SANCHEZ CASTRO',
    addr1: 'Illescas 89, Nueva Galicia Residencial,',
    addr2: 'C.P. 45645, Tlajomulco de Zúñiga, Jalisco',
    email: 'oswaldosc117@gmail.com',
    web: '',
    foot: 'OSC',
    city: 'Tlajomulco de Zúñiga, Jalisco',
    logo: BRAND + 'osc-logo.png',
    mark: false,
    lists: false,
    track: BRAND + 'track-osc.png',
    folioSerie: '90',
    colors: { c1: '#545454', c1d: '#333333', c1m: '#6E6E6E', c1l: '#F0F0F0', c2: '#004AAD', c2d: '#003680', c2m: '#3B78C9', c2l: '#E8F0FB' },
  },
};

/*
 * División Campo: en el original era COMPANIES.campo = {...perconsur, foot:'PERCONSUR | División Campo'}
 * y la hoja media carta usaba el correo divisioncampo@perconsur.mx.
 */
COMPANY_DEFAULTS.campo = {
  ...COMPANY_DEFAULTS.perconsur,
  key: 'campo',
  foot: 'PERCONSUR | División Campo',
  email: 'divisioncampo@perconsur.mx',
  mode: 'campo',
};

/* Empresas disponibles para Notas de entrega (División Puerto), en el orden del selector original */
export const PUERTO_COMPANIES = ['perconsur', 'oasc', 'osc'];

/* Campos de texto que el usuario puede editar desde Ajustes → Empresa */
export const EDITABLE_FIELDS = [
  ['legal', 'Razón social'],
  ['addr1', 'Dirección, línea 1'],
  ['addr2', 'Dirección, línea 2'],
  ['email', 'Correo'],
  ['web', 'Sitio web'],
  ['foot', 'Pie de página del documento'],
];

/* Empresa a la que pertenecen los catálogos de una identidad (Campo comparte con PERCONSUR) */
export function catalogOwner(key) {
  return key === 'campo' ? 'perconsur' : key;
}
