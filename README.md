# PERCONSUR — app de operación (PWA)

Aplicación web instalable para iPhone que reemplaza al HTML «Generador de documentos» (NER 3.0). Genera la **Nota de entrega – recepción** (División Puerto: PERCONSUR, OASC, OSC) y la **Asignación de unidades** (División Campo) con el mismo formato de PDF que el sistema anterior.

La correspondencia de cada función del sistema anterior con la nueva app está en [`MIGRACION.md`](MIGRACION.md).

## Publicar

No requiere compilación ni servidor propio: son archivos estáticos.

1. Sube **todo el contenido de esta carpeta** a un hosting con **HTTPS** (requisito para instalar la app y para que funcione sin conexión). Puede ser una subcarpeta, por ejemplo `https://www.perconsur.mx/app/`.
2. Abre la dirección una vez **con conexión**: se descargan la app, las librerías de PDF y la fuente para trabajar sin señal.
3. Para probar en la computadora: `python3 -m http.server 8080` en esta carpeta y abre `http://localhost:8080`.

### Instalar en iPhone
Safari → **Compartir** → **Añadir a pantalla de inicio** → **Añadir**. Se abre como app, sin barra de Safari.

### Datos del sistema anterior
- **Mismo dominio y navegador** donde se usaba el HTML anterior: la app detecta y migra automáticamente borradores (con fotos), consecutivos de folio y placas recordadas. No borra nada del sistema anterior.
- **Otro dominio**: sube `tools/exportar-datos-anteriores.html` al sitio donde estaba el HTML anterior, ábrelo en el mismo navegador, exporta el archivo e impórtalo en la app nueva desde **Ajustes → Importar respaldo**.

### Al publicar una actualización
Después de cambiar cualquier archivo ejecuta:

```
node scripts/precache.mjs
```

Actualiza la lista de archivos y la versión del service worker. Los teléfonos verán «Hay una nueva versión de la app → Actualizar». Los borradores se guardan antes de recargar.

## Estructura

```
index.html              entrada; pantalla de carga
manifest.json           instalación (nombre, íconos, standalone)
service-worker.js       sin conexión (lista generada por scripts/precache.mjs)
assets/brand/           logotipos, íconos de rastreo y marca de agua (extraídos del HTML original)
assets/icons/           íconos de la app (iPhone 180, 192, 512, maskable)
vendor/pdf-lib.min.js   librería incluida localmente
styles/
  tokens.css            colores, tipografía, claro/oscuro
  base.css, components.css, screens.css   interfaz
  documents.css         estilos de las hojas, EXTRAÍDOS del original (no modificar)
src/
  main.js               arranque, rutas, barra inferior, teclado, recuperación de borradores
  config/               empresas, datos de referencia (ISO, navieras, plantas), catálogos semilla
  core/                 enrutador (#/ruta) y utilidades DOM
  domain/               lógica de negocio sin interfaz
    shared/format.js    formatos y validaciones (ISO 6346, RFC, pedimento, municipio…)
    puerto/             modelo, cálculos, Excel, WhatsApp, pendientes, plantilla de hoja
    campo/              modelo, pendientes, plantilla media carta
  services/             persistencia y plataforma
    db.js               IndexedDB
    drafts.js           autoguardado + copia de seguridad al bloquear o cambiar de app
    documents.js, media.js, folios.js, catalogs.js, companies.js, settings.js
    migration.js        datos del sistema anterior
    backup.js           respaldo JSON (exportar / validar / importar combinando)
    pdf.js              generación de PDF
    share.js            compartir, guardar, WhatsApp, descarga
    codes.js            QR y código para Excel
    camera.js, libs.js, pwa.js, theme.js
  ui/
    flows.js            nuevo documento, empresa, borradores, generar
    components/         hojas inferiores, selector con buscador, campos, toasts, íconos, vista previa
    screens/            Inicio, Documentos, Detalle, Generado, Catálogos, Ajustes, asistentes Puerto y Campo
tools/exportar-datos-anteriores.html
tests/                  pruebas automatizadas (no se publican)
```

**Por qué sin framework:** toda la lógica original es HTML generado con plantillas; con módulos ES nativos se portó 1:1, no hay paso de compilación que mantener, Safari los soporta desde iOS 11 y el service worker guarda los mismos archivos que se editan.

## Almacenamiento

IndexedDB `perconsur`, con estos stores:

| Store | Contenido |
|---|---|
| `documents` | Documentos generados |
| `drafts` | Borradores |
| `operators`, `vehicles`, `trailers` | Catálogos por empresa |
| `places`, `plants`, `terminals` | Catálogos generales |
| `companies` | Textos editados de cada empresa |
| `settings` | Ajustes |
| `attachments` | Fotos, adjuntos, PDF y vistas previas |
| `counters` | Folios |

- **Autoguardado:** cada cambio se guarda en IndexedDB en menos de medio segundo. Al bloquear la pantalla, cambiar de app o cerrar Safari, además se escribe una copia sincrónica en localStorage; al abrir se usa la más reciente.
- **Copia de seguridad del dispositivo:** los datos viven solo en el dispositivo. Usa **Ajustes → Exportar respaldo** con regularidad. Instalada en la pantalla de inicio, iOS protege mejor el almacenamiento; el botón «Proteger» lo solicita al navegador.

## Sin conexión

Funcionan sin señal: abrir la app, capturar, catálogos, fotos, revisión, generar PDF, compartir y documentos guardados.

Requieren haber abierto la app **una vez con conexión**: las librerías de PDF/QR/Excel (html2canvas, jsPDF, qrcode-generator, bwip-js) y la fuente del logotipo. Ajustes → Aplicación indica si ya está lista.

Para no depender del CDN, descarga esas librerías a `vendor/` y agrega su ruta en `LIBS` (`src/config/reference.js`, propiedad `local`).

## Preparado para crecer

- La lógica de negocio (`src/domain`) no depende de la interfaz ni del almacenamiento.
- La persistencia está detrás de `src/services`. Para sincronizar con un servidor se agrega un servicio que lea y escriba los mismos stores (cada registro tiene `id` y `updatedAt`).
- Las empresas y los catálogos ya están separados por empresa, base para usuarios y roles.

## Pruebas realizadas

Automatizadas en Chromium emulando iPhone (390×844, táctil). Ver `tests/`; las librerías del CDN se sustituyen por versiones de prueba porque el entorno no tiene internet.

**35 verificaciones aprobadas:**
- Migración de borradores, fotos, folios por empresa y placas.
- Cálculos, ISO 6346, naviera y municipio.
- Límites de 2 contenedores y 6 unidades.
- Fotos y adjuntos, incluido el reordenamiento.
- Persistencia al recargar.
- PDF de 6 páginas: orden y orientación de anexos y adjuntos.
- Campo en media carta con enlaces QR.
- Resumen de WhatsApp idéntico, respaldo, serie OASC y modo oscuro.

**Fidelidad del documento:** la hoja de la nota se renderizó con los mismos datos en el HTML original y en la app nueva; son visualmente idénticas. La única diferencia es el QR de prueba.

## Lista de verificación en iPhone real

Pendiente porque no se puede emular aquí:

- [ ] Generar una nota con 2 contenedores y 8 fotos, y una asignación de Campo; revisar el PDF en el visor de iOS.
- [ ] Compartir → **Guardar en Archivos** y **WhatsApp** con el PDF.
- [ ] Instalar en pantalla de inicio. Abrir en modo avión: capturar y generar.
- [ ] Teclado: campo bajo el teclado, botón «siguiente» del teclado, barra inferior oculta al escribir.
- [ ] Dynamic Island / notch / barra inferior en iPhone pequeño (SE) y grande (Pro Max).
- [ ] Bloquear la pantalla a la mitad de una captura y cerrar Safari: al volver debe ofrecer continuar.
- [ ] Interruptores nativos con respuesta háptica (iOS 18).
