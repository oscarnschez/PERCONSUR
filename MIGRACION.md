# Tabla de migración: función actual → ubicación en la nueva app

Inventario completo del HTML original «PERCONSUR – Generador de documentos» (NER 3.0 / AU 2.0) y dónde quedó cada pieza. Ninguna función operativa se eliminó; las únicas piezas retiradas son decorativas o código que nunca se ejecutaba, y se indican como tal.

## Empresas e identidad

| Función original | Dónde estaba | Dónde quedó |
|---|---|---|
| Identidades PERCONSUR, OASC, OSC (razón social, dirección, correo, web, pie, logotipo, colores) | `COMPANIES` | `src/config/companies.js` (fuente única). Textos editables en Ajustes → Empresa (`services/companies.js`) |
| Campo = PERCONSUR con pie «PERCONSUR \| División Campo» y correo `divisioncampo@` (escrito a mano en la hoja) | `COMPANIES.campo`, `cpSheetHTML` | `COMPANY_DEFAULTS.campo`; la hoja lo lee de ahí |
| Logotipo cuadrado + nombre (mark) vs. logotipo horizontal | `CO.mark` | Igual, en la configuración de cada empresa |
| Catálogos solo para PERCONSUR (`CO.lists`) | vaciaba los datalist en OASC/OSC | Catálogos por empresa; OASC y OSC inician vacíos y pueden llenarse |
| Íconos de rastreo GPS por empresa | `TRACK_ICON_P`, `CO.track` | `assets/brand/track-*.png`, `company.track` |
| Selector de división → empresa (recargaba la página) | `#pick` | Inicio (tarjetas Puerto/Campo) + hoja «Empresa transportista» sin recargar |

## Folios y fechas

| Función original | Dónde quedó |
|---|---|
| Folio `serie-AAMMDD-NNN` con series 50 / 70 / 90 y consecutivo diario por empresa (`folioFor`) | `services/folios.js` (store `counters`, transacción atómica) |
| Folio nuevo al cambiar la fecha | Paso Información, evento `change` de Fecha |
| «Reiniciar a 001» | Paso Información; ahora con confirmación |
| Validación de formato del folio al cargar (`FOLIO_RE`) | `normalizePuerto()` |
| Hora automática + botón actualizar | Paso Información |
| Folio Campo `AU-` aleatorio sin caracteres ambiguos (`cpFolio`) | `domain/campo/model.js` |
| Código 128 del folio (`folioBarcode`) — **nunca se mostraba** | Conservado en `services/codes.js`, sin uso (igual que antes) |

## División Puerto — Nota de entrega

| Función original | Paso original | Dónde quedó |
|---|---|---|
| Carta porte (mayúsculas), pedimento con formato 2-2-4-7 y pegado limpio | Nota | Paso 1 Información |
| Operador con datalist y conversión a nombre propio; corrección de nombres en MAYÚSCULAS al cargar | Unidad | Paso 2 Transporte (selector con buscador) + `normalizePuerto` |
| No. económico → placas automáticas (`PLACAS_DEF`); placas editadas se recuerdan (`ner-placas2`) | Unidad | Paso 2; catálogo Unidades (`rememberPlacas`) |
| Placas del remolque con datalist (marca/medida) | Unidad | Paso 2, selector de Remolques |
| Mostrar botón de rastreo GPS + link `tinyurl.com/` que sigue al 1.er contenedor (`trackAuto`, `syncTrack`) | Unidad | Paso 2, sección Rastreo GPS (+ botón «Abrir link») |
| BL y detección de naviera por prefijo (30 navieras) | Contenedores | Paso 3; también en la etiqueta BL de la hoja |
| Modo de tráfico FCL/LCL | Contenedores | Paso 3 |
| Fecha/hora de cita y terminal (SSA, Contecon, TIMSA, OCUPA) — solo para WhatsApp | Contenedores | Paso 3; terminales ahora son catálogo editable |
| Máximo 2 contenedores; el nuevo copia tipo, mercancía e impuestos del anterior | Contenedores | Paso 3, tarjetas por contenedor |
| Número de contenedor (A-Z0-9) + dígito verificador ISO 6346 | Contenedores | Paso 3 + lista de pendientes en Revisión |
| 14 tipos ISO y conversión de nombres antiguos (`TIPO_OLD`) | Contenedores | `config/reference.js`; Catálogos → Tipos de contenedor (consulta) |
| Sello, bultos (6 dígitos), mercancía, peso, tara, peso bruto automático | Contenedores | Paso 3 |
| Lugar de entrega: nombre, RFC (12–13, A-ZÑ&0-9), dirección, contacto | Entrega | Paso 4 + catálogo Destinos (nuevo) |
| «Destino para Excel» (municipio, estado) a partir de la dirección | Entrega | Paso 4 (aviso) y código para Excel |
| QR «Ubicación de entrega» (Google Maps) en la hoja | Hoja | Igual; además botón «Abrir ubicación» |
| RFC emisor/receptor, custodia | Facturación | Paso 5 Servicio |
| Tarifa + IVA 16 % + retención ISR 4 % + sobrepeso → importe con desglose | Facturación | Paso 5 (misma fórmula `calcImporte`) |
| Daños, faltantes, notas | Observaciones | Paso 6 Evidencias |
| 4 fotos por contenedor (puertas, frente, laterales) con fecha de la foto; compresión 1400 px / JPEG 72 % | Observaciones | Paso 6: cámara directa, «Elegir de Fotos» (varias), ver, reemplazar, mover de lado, eliminar |
| Anexo de evidencia fotográfica (una hoja por contenedor) + aviso en la nota | Hoja | Igual (`puertoAnnexHTML`) |
| Combinar PDF/JPG/PNG al final, en orden; conteo de páginas; imágenes ajustadas a carta | Panel lateral | Paso 6; ahora se guardan en el borrador (antes se perdían al cerrar) |
| Código para Excel PDF417 por contenedor (Scan-IT to Office), sin acentos, celdas vacías = espacio, respaldo QR | Panel lateral | Revisión y Detalle → «Código para Excel» |
| Revisión con datos pendientes y vista previa | Revisión | Paso 7 Revisión: pendientes tocables que llevan al campo |
| Confirmación «¿Generar documento?» con resumen | Diálogo | Hoja de acción con el mismo resumen |
| Resumen para WhatsApp (mismo texto) con copiar y `wa.me` | Diálogo tras generar | Se abre al terminar; vista previa + Abrir en WhatsApp, Compartir, PDF con resumen, Copiar |
| Impresión del navegador si no carga el generador | `window.print()` | `printFallback()` con los mismos estilos de impresión |

## División Campo — Asignación de unidades

| Función original | Dónde quedó |
|---|---|
| Fecha de carga, planta destino (Nextipac, Villagrán, Los Mochis) con dirección y link de Maps | Paso 1 Carga; plantas como catálogo editable |
| Hasta 6 unidades: solicitud, unidad (llena placas), operador, placas, remolque, Tolva/Jaula; la nueva copia la solicitud | Paso 2 Unidades (+ atajos de solicitudes ya usadas) |
| Datos por solicitud: hora, lugar, encargado (nombre propio), teléfono (formato MX), link de Maps | Paso 3 Solicitudes (con validación del link y «Abrir ubicación») |
| Migración del formato viejo (`cp.horas`, `cp.hora`, `cp.lugar`, `cp.enc`, `cp.encTel`) | `normalizeCampo()` |
| Hoja media carta horizontal: agrupación por solicitud, QR por solicitud, QR de planta, marca de agua de maíz, planta con una mazorca por unidad, leyenda «no representa el orden de carga», pie AU 2.0 | `domain/campo/sheet.js` (idéntica) |
| Revisión con pendientes | Paso 4 Revisión |
| Nombre `Asignacion-campo-AAAA-MM-DD-AU-XXXX.pdf` | Igual |

## PDF

| Función original | Dónde quedó |
|---|---|
| html2canvas (escala 2.5) → JPEG → jsPDF carta / media carta | `services/pdf.js` (mismos parámetros) |
| Banda corrugada, textos condensados, renglones de observaciones y planta SVG convertidos a imagen antes de rasterizar | `prepare()` en `services/pdf.js` |
| Enlaces clicables sobre QR y rastreo | Igual |
| pdf-lib para combinar | Igual; incluido localmente en `vendor/` |
| Descarga (`a.download` / `window.claude.downloads`) | Compartir de iOS (archivo), Guardar en Archivos, descarga en escritorio |
| — | Nuevo: reintento con escala menor, liberación de memoria, vistas previas para el visor interno |

## Datos guardados (localStorage) → nuevo esquema

| Clave original | Destino | Notas |
|---|---|---|
| `ner-company` | ajustes `lastCompany` / `lastDivision` | |
| `ner-draft`, `@oasc`, `@osc` | `drafts` (`puerto:<empresa>`) | Fotos data URL → archivos en `attachments` |
| `ner-step`(+sufijo) | paso del borrador | |
| `ner-folios2`, `@oasc`, `@osc` | `counters` | Se conserva el mayor |
| `ner-folios2@campo`, `ner-draft@campo` | No se migran | El original los creaba vacíos en modo Campo; sumarlos adelantaría el folio de PERCONSUR |
| `ner-placas2` (+ `@campo`, `@oasc`, `@osc`) | catálogo Unidades | Lo capturado prevalece sobre los valores originales |
| `ner-campo2@campo` / `ner-campo2` | `drafts` (`campo`) | |
| `ner-xlmin` | Sin equivalente | Preferencia del panel de Excel, que ahora es una hoja |

Las claves originales **no se borran**.

## Retirado (decorativo o sin uso)

Cielo animado con hora/clima, reloj, estrellas, camiones y grúa animados, planta interactiva y animación del tractocamión al elegir Tolva/Jaula, fondos fotográficos (conservados en `assets/legacy/`), CSS de `data-theme` sin selector (sustituido por Apariencia real), `barcodesHTML()` (nunca se llamaba).
