# Pruebas automatizadas

Requieren Python 3 y Playwright (`pip install playwright && playwright install chromium`). Se ejecutan desde esta carpeta, con las credenciales de acceso en variables de entorno (no se guardan en ningún archivo):

```
PCS_TEST_USER='usuario' PCS_TEST_PASS='contraseña' python3 e2e.py
```


- `python3 e2e.py` — recorrido completo emulando iPhone: migración, Puerto, Campo, catálogos, respaldo, modo oscuro. Capturas en `shots/`.
- `python3 auth.py` — acceso: la app no carga antes de iniciar sesión, contraseña incorrecta, sesión, bloqueo por intentos, cerrar sesión.
- `python3 operators.py` — módulo Operadores: fórmula del balance con los ejemplos oficiales, comisión ampliada, validaciones, resumen, CSV, respaldo.
- `python3 v140.py` — versión 1.4: navegación, perfil, remolques por división, combustible, Excel y respaldo.
- `node fuel_unit.mjs` — cálculos de combustible (sin navegador).
- `python3 logistics.py` — Logística: asignación con unidad/operador/remolque del catálogo, avisos de doble asignación, filtros y buscador, Inicio → Unidades en operación en vivo, historial, protección del catálogo y respaldo.
- `node logistics_unit.mjs` — reglas de Logística: estados, regla de Inicio, filtros, buscador y conflictos (sin navegador).
- `python3 trip_docs.py` — documentos adicionales de viajes y expediente consolidado: varios archivos a la vez, orden, renombrar, eliminar, archivo dañado, vista previa, PDF consolidado (páginas copiadas e imágenes centradas), documento original intacto, persistencia y respaldo.
- `python3 doc_dossier.py` — expediente consolidado desde el detalle del documento y desde Logística («Ver documento relacionado»).
- `python3 empties.py` — Control de vacíos: creación automática al pasar a Vacío, sin duplicados, programación, otro transportista, vencidas, entregado, movimientos, filtros, código para Excel, persistencia y respaldo.
- `node empties_unit.mjs` — reglas de Control de vacíos: fila para Excel (columnas y orden de la hoja), validación, vencidas y prioridad (sin navegador).
- `python3 gps.py` — rastreo GPS con un intermediario simulado: Ajustes → GPS, vinculación de IMEI, ubicación y mapa en Inicio con fichas deslizables, mapa en vivo, posición antigua, proveedor caído y respaldo sin la clave.
- `node gps_unit.mjs` — reglas del GPS: antigüedad, «Señal GPS sin actualización reciente», detenida y sugerencia de unidad (sin navegador).
- `python3 destinations.py` — destino en el mapa: dirección de entrega de la nota, terminal en exportación, patio del control de vacíos, ciudad aproximada, ajuste a mano y terminales con dirección (intermediario GPS y buscador de direcciones simulados).
- `node geo_unit.mjs` — reglas de ubicación de destinos: coordenadas en links de Google Maps, limpieza de direcciones, búsquedas por precisión y distancia (sin navegador).
- `node ../gps-proxy/test.mjs` — intermediario GPS (Cloudflare Worker) contra un servidor que imita la Open API de IOPGPS, con límite de intentos, espera de 30 s si el proveedor falla y enlaces de rastreo para clientes (permisos del portal público, caducidad, revocación y bloqueo de códigos inexistentes) e información compartida (claves de capturista y consulta, 409 si otro dispositivo publicó, archivos como descarga).
- `python3 monitor.py` — Centro de Monitoreo GPS (MapLibre) y Portal de rastreo para clientes, de punta a punta: indicadores, marcadores por tipo de remolque, filtros, buscador, detalle, centrar, toda la flota, movimiento en vivo, estado de Logística independiente del GPS, panel inferior en iPhone; compartir, portal con el operador solo por nombre y apellido y sin velocidad, mapa amplio en computadora, IOPGPS sin horas en la consulta de la flota, revocar y caducidad al terminar la entrega. Usa `worker_local.mjs` (el Worker real en Node con IOPGPS simulado y KV en memoria); los mosaicos del mapa se simulan.
- `node fleet_unit.mjs` — reglas del monitor y del rastreo (sin navegador): movimiento según el GPS, indicadores, filtros, buscador, qué se comparte con el cliente (nombre y apellido del operador), caducidad automática, datos de la flota completados con la consulta por unidad y estilo del mapa.
- `python3 workshop.py` — Operación → Taller de punta a punta (iPhone): mantenimiento de tractocamión y de remolque (clasificación del remolque), folio automático, varios trabajos en una orden, diagrama interactivo (leve amarillo, moderado naranja, daño total rojo, reemplazado azul con el daño original conservado, números, leyenda, lista de componentes y zoom), cambio de aceite y próximo cambio con intervalo propio de la unidad, alerta de aceite, falla reportada y relacionada sin duplicarse, llantas con posiciones y solo con cantidad (pendientes de especificar), salida anterior al ingreso rechazada, tiempo en taller, fotos, odómetro menor documentado, Logística (disponibilidad «En taller» sin cambiar el estado del viaje y aviso con viaje activo), acceso desde Catálogos, reporte individual y consolidado con vista previa, PDF (texto real y diagrama vectorial), compartir en iPhone, persistencia al reabrir y respaldo. Requiere `pdftotext` y `pdfinfo`.
- `node maintenance_unit.mjs` — reglas del Taller (sin navegador): tiempo en taller, folio, validaciones, odómetro conocido y desactualizado, colores del diagrama (reemplazado > gravedad más alta, desglose conservado), componentes con región en algún diagrama, vista derecha reflejada, aceite (próximo cambio, alertas, intervalo por tiempo), posiciones de llantas, disponibilidad, filtros del reporte, búsqueda y un PDF del reporte con pdf-lib.
- `python3 sync.py` — Información compartida entre dispositivos, de punta a punta, con tres dispositivos: el capturista publica (archivos uno por uno y la información comprimida, sin borradores ni claves) y vuelve a publicar solo tras un cambio; la consulta recibe sin importar respaldos y queda en solo lectura (sin botones de captura, la base rechaza cambios, sin pantallas de captura ni importar respaldos) y recibe cambios y archivos borrados; cambio de teléfono del capturista (recibir la de la nube o reemplazarla, el anterior recibe 409) y dejar de compartir. Usa `worker_local.mjs` (claves de prueba `datos-captura` y `datos-consulta`).
- `node sync_unit.mjs` — reglas de la información compartida (sin navegador): qué se publica, archivos por subir, descargar y quitar, validación de la información recibida y regla para no pisar a otro dispositivo.
- `python3 security.py` — respaldo manipulado: no ejecuta código, no cambia el GPS, adjuntos HTML se abren como PDF, CSP activa.
- `python3 activity.py` — Actividad cuenta todos los viajes registrados y avisa los que quedan después del corte.
- `python3 statement.py` — estado de cuenta en PDF (requiere `pdftotext` y `pdfinfo` de poppler-utils).
- `python3 upgrade.py` — actualización de la base de datos v1 → v2 sin pérdida de datos.
- `python3 offline.py` — sin conexión con el service worker activo.
- `python3 fidelity.py` — compara la hoja generada por el HTML original con la de la app (copia el HTML original como `__orig.html` en la raíz de la app antes de correrlo).

`shims.js` sustituye a las librerías del CDN **solo en pruebas** (el entorno de pruebas no tenía internet). No se carga en la app.
