/*
 * Módulos de las secciones principales. Para agregar un módulo operativo nuevo (p. ej. mantenimiento, llantas)
 * basta con añadirlo aquí y registrar su ruta en main.js: la navegación no cambia.
 */
export const OPERATION_MODULES = [
  { key: 'logistica', title: 'Logística', desc: 'Estado y asignación actual de las unidades.', route: '/operacion/logistica', icon: 'truck' },
  { key: 'combustible', title: 'Combustible y rendimiento', desc: 'Recargas por unidad, rendimiento km/L, gráficas y reporte en Excel.', route: '/operacion/combustible', icon: 'fuel' },
  { key: 'taller', title: 'Taller', desc: 'Control de mantenimiento y reparaciones de unidades y remolques.', route: '/operacion/taller', icon: 'wrench' },
];
export const ADMIN_MODULES = [
  { key: 'operadores', title: 'Operadores', desc: 'Información y control de operadores.', route: '/operadores', icon: 'people' },
  { key: 'cobranza', title: 'Cobranza', desc: 'Viajes y demoras en planta por cobrar y pagados; reporte en PDF.', route: '/cobranza', icon: 'cash' },
  { key: 'documentos', title: 'Documentos', desc: 'Historial de documentos generados.', route: '/documentos', icon: 'docs' },
  { key: 'catalogos', title: 'Catálogos', desc: 'Unidades, remolques, operadores, destinos y demás registros.', route: '/catalogos', icon: 'catalog' },
];
export const DIVISION_IMG = { puerto: './assets/divisions/puerto.png', campo: './assets/divisions/campo.png' };
