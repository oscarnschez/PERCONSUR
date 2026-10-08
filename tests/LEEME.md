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
- `node ../gps-proxy/test.mjs` — intermediario GPS (Cloudflare Worker) contra un servidor que imita la Open API de IOPGPS.
- `python3 activity.py` — Actividad cuenta todos los viajes registrados y avisa los que quedan después del corte.
- `python3 statement.py` — estado de cuenta en PDF (requiere `pdftotext` y `pdfinfo` de poppler-utils).
- `python3 upgrade.py` — actualización de la base de datos v1 → v2 sin pérdida de datos.
- `python3 offline.py` — sin conexión con el service worker activo.
- `python3 fidelity.py` — compara la hoja generada por el HTML original con la de la app (copia el HTML original como `__orig.html` en la raíz de la app antes de correrlo).

`shims.js` sustituye a las librerías del CDN **solo en pruebas** (el entorno de pruebas no tenía internet). No se carga en la app.
