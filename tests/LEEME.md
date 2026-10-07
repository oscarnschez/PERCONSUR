# Pruebas automatizadas

Requieren Python 3 y Playwright (`pip install playwright && playwright install chromium`). Se ejecutan desde esta carpeta:

- `python3 e2e.py` — recorrido completo emulando iPhone: migración, Puerto, Campo, catálogos, respaldo, modo oscuro. Capturas en `shots/`.
- `python3 fidelity.py` — compara la hoja generada por el HTML original con la de la app (copia el HTML original como `__orig.html` en la raíz de la app antes de correrlo).

`shims.js` sustituye a las librerías del CDN **solo en pruebas** (el entorno de pruebas no tenía internet). No se carga en la app.
