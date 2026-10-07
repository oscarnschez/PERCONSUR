/*
 * Módulos de las secciones principales. Para agregar un módulo operativo nuevo (p. ej. mantenimiento, llantas)
 * basta con añadirlo aquí y registrar su ruta en main.js: la navegación no cambia.
 */
export const OPERATION_MODULES = [
  { key: 'combustible', title: 'Combustible y rendimiento', desc: 'Recargas por unidad, rendimiento km/L, gráficas y reporte en Excel.', route: '/operacion/combustible', icon: 'fuel' },
];
export const ADMIN_MODULES = [
  { key: 'operadores', title: 'Operadores', desc: 'Información y control de operadores.', route: '/operadores', icon: 'people' },
  { key: 'documentos', title: 'Documentos', desc: 'Historial de documentos generados.', route: '/documentos', icon: 'docs' },
  { key: 'catalogos', title: 'Catálogos', desc: 'Unidades, remolques, operadores, destinos y demás registros.', route: '/catalogos', icon: 'catalog' },
];
export const DIVISION_IMG = { puerto: './assets/divisions/puerto.png', campo: './assets/divisions/campo.png' };
