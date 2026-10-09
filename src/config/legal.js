/*
 * Aviso de derechos de autor que muestran el inicio de sesión, Ajustes, el menú lateral de computadora y el portal de
 * clientes. El titular es la razón social de PERCONSUR; el año se toma del reloj del dispositivo.
 */
import { COMPANY_DEFAULTS } from './companies.js';

export const COPYRIGHT_HOLDER = COMPANY_DEFAULTS.perconsur.legal;
export const copyrightShort = (year = new Date().getFullYear()) => `© ${year} ${COPYRIGHT_HOLDER}`;
export const copyrightText = (year = new Date().getFullYear()) => `${copyrightShort(year)}. Todos los derechos reservados.`;
