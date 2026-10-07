/*
 * Catálogos semilla de PERCONSUR, tomados literalmente de los <datalist> del HTML original
 * (#ops, #ecos, #rems) y del objeto PLACAS_DEF. En el original, OASC y OSC no tenían listas
 * (CO.lists=false), por eso sus catálogos inician vacíos.
 */

export const SEED_OPERATORS = [
  'Daniel Antonio Rivera Bautista',
  'José Castañeda Villalobos',
  'Juan Alberto García Correa',
  'Pedro Urzúa Serrano',
  'Raúl López Martínez',
  'Víctor Antonio Álvarez Haro',
];

/* Número económico → placas de la unidad (PLACAS_DEF) */
export const SEED_VEHICLES = [
  ['4', '59-BN-4J'], ['5', '56-BH-1L'], ['8', '64-BN-4J'], ['11', '63-BN-4J'], ['12', '60-BN-4J'],
  ['21', '61-BN-4J'], ['25', '20-BK-2N'], ['27', '70-BL-3W'], ['28', '42-BL-2W'],
];

/* Placas del remolque → descripción */
export const SEED_TRAILERS = [
  ['61-UT-2M', 'JJ Forza'], ['63-VB-1R', 'JJ Forza'], ['64-VB-1R', 'JJ Forza'],
  ['08-UW-6K', 'Margo'], ['09-UW-6K', 'Margo'], ['13-UW-6K', 'Margo, 40/20'],
  ['788-WR-4', 'MAGU, 40/20'], ['560-WT-2', 'Bush Hog Loadcraft, 20'],
];
