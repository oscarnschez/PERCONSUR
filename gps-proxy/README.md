# PERCONSUR · Intermediario GPS (IOPGPS)

Cloudflare Worker que conecta PERCONSUR con la Open API de IOPGPS sin poner credenciales en la app.

```
open.iopgps.com  ←(appid + secreto, firma, accessToken)—  Worker «perconsur-gps»  ←(clave PCS_KEY)—  PERCONSUR (PWA)
```

- Guarda `IOP_APPID` e `IOP_SECRET` como **secretos de Cloudflare** (nunca en el código ni en el repositorio).
- Renueva el permiso de IOPGPS (dura 2 h) automáticamente.
- Pide las posiciones de **toda la flota en una sola llamada** y las guarda 30 s: varias pantallas abiertas no multiplican las consultas al proveedor.
- Solo responde a la app (clave `PCS_KEY`) desde el sitio autorizado (`ALLOWED_ORIGIN`).
- Si IOPGPS no responde, entrega la última posición conocida marcada como `stale: true` (antigua) o un error claro.

Este archivo no contiene credenciales; se puede publicar sin riesgo.

## Instalación (panel web, sin instalar nada)

1. **Cuenta:** https://dash.cloudflare.com/sign-up (plan gratuito).
2. **Crear el Worker:** Workers & Pages → Create → Create Worker → nombre `perconsur-gps` → Deploy.
   La primera vez elige tu subdominio `workers.dev`. La dirección queda como `https://perconsur-gps.<tu-subdominio>.workers.dev`.
3. **Secretos:** en el Worker → Settings → Variables and Secrets → Add:

   | Nombre | Tipo | Valor |
   |---|---|---|
   | `IOP_APPID` | Secret | appid de la Open API de IOPGPS (p. ej. `LOG_PERCONSUR`) |
   | `IOP_SECRET` | Secret | clave de la Open API (de preferencia **regenerada** si alguna vez se compartió) |
   | `PCS_KEY` | Secret | clave larga inventada (30+ letras y números al azar); la misma se captura en PERCONSUR → Ajustes → GPS |
   | `ALLOWED_ORIGIN` | Text | `https://oscarnschez.github.io` |

4. **Código:** en el Worker → Edit code → borra el ejemplo → pega el contenido completo de [`worker.js`](worker.js) → Deploy.
5. **Prueba:** abre `https://perconsur-gps.<tu-subdominio>.workers.dev/salud` en el navegador.
   - `"autenticacion": "correcta"` y `"dispositivos": N` → listo.
   - `"secretos": { … false }` → falta algún secreto del paso 3.
   - `"error": "IOPGPS rechazó la autenticación…"` → revisa appid/secreto, o confirma con IOPGPS que la Open API esté activa para tu cuenta.
   - Para ver los **nombres** de los campos que entrega IOPGPS (sin credenciales): `/salud?key=TU_PCS_KEY`.

> Con terminal (opcional): `npx wrangler deploy` desde esta carpeta usa [`wrangler.toml`](wrangler.toml); los secretos se cargan con `npx wrangler secret put IOP_SECRET` (y los demás).

## Endpoints

| Ruta | Acceso | Devuelve |
|---|---|---|
| `GET /salud` | libre (sin datos sensibles) | estado de secretos, autenticación y número de dispositivos |
| `GET /v1/posiciones[?imeis=865…,867…]` | `X-PCS-Key` | `{ ok, fetchedAt, stale, devices: [{ imei, name, lat, lng, gpsTime, signalTime, speed, course, acc, positionType, address }] }` |
| `GET /v1/ubicacion?imei=865…` | `X-PCS-Key` | `{ ok, fetchedAt, stale, device: { …, address, signalTime } }` (dirección y estado; guardado 2 min) |

Tiempos en milisegundos (epoch). Los campos que IOPGPS no entregue llegan como `null`: la app no inventa datos.

## Consumo

La app consulta cada 30 s (detalle de la unidad) o 60 s (Inicio), solo con la pantalla visible. El Worker llama a IOPGPS como máximo una vez cada 30 s para toda la flota, muy por debajo del límite gratuito de Cloudflare (100 000 peticiones al día).

## Prueba local

```
node gps-proxy/test.mjs
```

Ejecuta el Worker contra un servidor que imita la API de IOPGPS (firma `md5(md5(secreto)+time)`, `accessToken`, posiciones, ubicación, token vencido y proveedor caído). No usa credenciales reales.

## Rotar el secreto

1. En IOPGPS genera una clave nueva.
2. En Cloudflare reemplaza `IOP_SECRET` y pulsa Deploy.
3. Abre `/salud` para confirmar. La app no cambia.

Si sospechas que `PCS_KEY` se filtró, cámbiala en Cloudflare y en PERCONSUR → Ajustes → GPS.
