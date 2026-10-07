# Pruebas automatizadas

Requieren Python 3 y Playwright (`pip install playwright && playwright install chromium`). Se ejecutan desde esta carpeta, con las credenciales de acceso en variables de entorno (no se guardan en ningún archivo):

```
PCS_TEST_USER='usuario' PCS_TEST_PASS='contraseña' python3 e2e.py
```


- `python3 e2e.py` — recorrido completo emulando iPhone: migración, Puerto, Campo, catálogos, respaldo, modo oscuro. Capturas en `shots/`.
- `python3 auth.py` — acceso: la app no carga antes de iniciar sesión, contraseña incorrecta, sesión, bloqueo por intentos, cerrar sesión.
- `python3 offline.py` — sin conexión con el service worker activo.
- `python3 fidelity.py` — compara la hoja generada por el HTML original con la de la app (copia el HTML original como `__orig.html` en la raíz de la app antes de correrlo).

`shims.js` sustituye a las librerías del CDN **solo en pruebas** (el entorno de pruebas no tenía internet). No se carga en la app.
