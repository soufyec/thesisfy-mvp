# QA editor de documentos, segunda pasada

Servidor: http://localhost:3050 (build de producción, store en memoria, IA en modo demo). Cuenta creada con `00_setup.mjs`: qa.editor.1791543724973@example.edu, tesis `thesis_70d202461264`.
Scripts: `/tmp/claude-0/-home-user-thesisfy-mvp/4306acd1-1b1f-512f-8e05-a9c07969fd69/scratchpad/qa/editor/` (01, 02, 03, 04, 11, 12 más los de verificación 01b-01f, 02b-02d, 03b-03d, 08b, 12b). Capturas en `editor/shots/`, logs en `editor/logs2/`.
Se capturaron `pageerror`, `console.error` y respuestas >= 400: **en todas las ejecuciones hubo 0 pageerrors, 0 errores de consola y 0 respuestas >= 400**. Los únicos `requestfailed` fueron `net::ERR_ABORTED` de prefetch `?_rsc=` y de un `POST /api/sessions/...` cancelado al navegar, sin efecto para el estudiante.
Ajustes a los scripts previos: en `03_bubble.mjs` el fallo del enlace "In this document" era del script (el foco se perdía tras el diálogo anterior y el documento no tenía encabezados); verificado con `03b_link.mjs` y `03d_*`. En `12_mobile2.mjs`, `Input.synthesizeScrollGesture` colgaba la captura, así que se sustituyó por eventos táctiles CDP (`12b_mobile.mjs`). En `02_toolbar.mjs` los fallos de "estilo de párrafo", "Delete row" y "Header row" eran de locator; se reverificaron en `02b_verify.mjs`.

## Resumen

| Área | Probado | Estado |
|---|---|---|
| Cabecera | atrás, renombrar, indicador Saved/Unsaved, Share, pastilla de integridad, botón AI assistant | OK |
| Menú ⋯ (File/Edit/View/Insert/Format/Tools/Help) | las 7 secciones; ~70 ítems abiertos y comprobados | OK salvo 2 fallos (ver hallazgos) |
| Buscar y reemplazar | contar, siguiente/anterior, Enter, coincidir mayúsculas, reemplazar, reemplazar todo, sin resultados, caracteres especiales, cerrar con Escape o botón | OK |
| Descargas | .docx, .html, .md, .txt (contenido y nombre), PDF vía Print, Ctrl+P | OK. docx con encabezado, pie, número de página y estilo Heading2 |
| Configurar página | orientación, Letter/A4, interlineado, encabezado, pie, números de página (3 posiciones), persistencia tras recarga | **2 fallos**: márgenes sin efecto; pérdida de datos con autoguardado |
| Numerar encabezados | activar y desactivar; el H1 queda sin número | OK |
| Caracteres especiales, marcadores, detalles/recuento, privacidad, atajos | insertar, buscar, marcador duplicado (avisa), recuento, cambiar alcance de monitorización (el consentimiento POST y la session bar cambian), Ctrl+/ y Ctrl+Shift+C | OK |
| Versiones | guardar con nombre, historial, vista previa, restaurar (crea "Before restore") | OK |
| Barra de herramientas | todos los controles; estilos, fuente, tamaño, B/I/U/S, color y resaltado (con None), enlaces, comentario, cita, listas, sangrías, super/subíndice, borrar formato, zoom, interruptor Provenance | OK salvo corrector ortográfico |
| Imagen | insertar (PNG transparente conservado, imagen grande reducida a 1600 px y JPEG), pie, alt, alineación, flotante, anchos, restablecer, redimensionar, reemplazar, borrar, archivo no imagen rechazado | OK |
| Tabla y menú de tabla | insertar, filas y columnas, cabecera, formato de celda, borrar fila, columna o tabla, menú contextual | OK |
| Bubble menu | B/I/U, tipografía, color, resaltado, alineación, Cite, Comment, Ask AI | OK, 1 detalle de solape (baja) |
| Enlaces | URL, "In this document" (encabezados y marcadores), quitar, Ctrl+clic salta al encabezado, exportación HTML con ids | OK |
| Pestañas | Final submission bloqueada, +, renombrar, duplicar, cerrar con confirmación, "Use as Final submission", cambiar, outline popover, copiar entre pestañas sin diálogo, pegado externo con diálogo de atribución, persistencia tras recarga | OK |
| Insertar | fecha, línea, salto de página, nota al pie, tabla de contenidos | **1 fallo**: el cursor salta tras la nota al pie |
| Asistente (Ask AI, Critique) | selección como contexto, respuesta en modo demo, 200 en `/api/ai/chat` | OK |
| Móvil 390 px y 360 px | barra de herramientas con scroll táctil, diálogo de cita a ancho completo, hoja de comentarios, sin scroll horizontal de página | OK, 1 detalle de descubribilidad (baja) |

## Hallazgos

### 1. Configurar página: al escribir en el diálogo mientras se autoguarda, se pierden los valores introducidos
- **Severidad**: alta (pérdida silenciosa de datos del usuario)
- **Dónde**: File > Page setup (`PageSetupDialog`, `src/components/editor/Dialogs.tsx` líneas 111-112: `useEffect(() => setV(value), [value, open])`).
- **Pasos**:
  1. Escribir algo en el documento (queda un autoguardado pendiente, aprox. 2-4 s).
  2. Abrir ⋯ > File > Page setup.
  3. Escribir "Header while saving" en *Header text* y "Footer while saving" en *Footer text*.
  4. Esperar unos 4 s sin pulsar OK.
- **Esperado**: los campos conservan lo escrito; OK aplica el encabezado y el pie.
- **Observado**: cuando termina el autoguardado, los campos vuelven a los valores anteriores ("QA running header" / "QA footer text"). Si el estudiante pulsa OK, se guardan los valores antiguos y lo escrito se pierde sin aviso. La respuesta del PUT sustituye `thesis.pageSetup` por un objeto nuevo, y el efecto reinicia el estado local del diálogo cada vez que `value` cambia de referencia, no solo al abrirlo. Sin autoguardado pendiente funciona bien (probado en 11_followup, caso A).
- **Errores de consola o red**: ninguno (`pageerrors: []`, `consoleErrors: []`, `badResponses: []`).
- **Captura**: `editor/shots/11_hf_pending.png`. Log: `editor/logs2/11.log`, líneas "B typed" y "B after 4.5s wait".

### 2. Configurar página: el campo Margins (cm) no cambia nada en el editor
- **Severidad**: media (ajuste visible que no hace nada; solo podría afectar al .docx exportado)
- **Dónde**: File > Page setup > Margins (cm). CSS en `src/app/globals.css`, línea 117, dentro de `.docs-workspace`.
- **Pasos**: abrir Page setup, poner Margins = 4 (o 3.5), pulsar OK, mirar la hoja.
- **Esperado**: la hoja, el gutter, el encabezado y el pie y la impresión usan el nuevo margen.
- **Observado**: el wrapper recibe `--page-margin: 4cm` (inline en `DocsEditor.tsx` línea 1313), pero `<main class="docs-workspace">` redeclara `--page-margin: 2.54cm` y gana por herencia. El padding de `.docs-page` sigue en 96 px (2,54 cm). El valor se guarda (el código lo pasa al export .docx como `marginCm`; no verifiqué un .docx con margen distinto de 2,54 cm), por lo que la vista y el documento exportado pueden no coincidir.
- **Errores de consola o red**: ninguno.
- **Captura**: `editor/shots/01c_margin4.png` (margen 4 cm, texto sigue a 96 px). Salida de `01c.mjs`: `wrapperVar:"4cm"`, `mainVar:"2.54cm"`, `padL:"96px"`.

### 3. Insert > Footnote: el cursor salta a mitad del siguiente párrafo
- **Severidad**: media
- **Dónde**: ⋯ > Insert > Footnote.
- **Pasos**:
  1. Escribir dos párrafos: "Alpha line." y "Second line here.".
  2. Colocar el cursor al final del primero.
  3. Insert > Footnote.
  4. Escribir "X".
- **Esperado**: la marca [1] queda tras "Alpha line." y el cursor sigue justo después de ella (o en el cuerpo de la nota).
- **Observado**: la marca [1] y la nota "[1] Footnote text" al final se crean bien, pero el cursor queda en "Second line here." en el desplazamiento 4, así que lo siguiente que escribe el estudiante aparece partido en medio de la palabra ("SecoXnd line here."). Una inserción posterior (por ejemplo Table of contents) parte ese párrafo ("SecoX" | TOC | "nd line here."). Reproducido dos veces (`01d.mjs` y `01e.mjs`). Parece un error de mapeo de posición al añadir la nota al final del documento.
- **Errores de consola o red**: ninguno.
- **Captura**: `editor/shots/01e_after_toc.png`. Log: `editor/logs2/01d.log` (texto final "9 OctobeTable of Contents...r 2026") y salida de `01e.mjs`.

### 4. Corrector ortográfico: el botón y la entrada del menú Tools no hacen nada
- **Severidad**: baja
- **Dónde**: botón "Spelling & grammar" de la barra y Tools > Spelling & grammar. `DocsEditor.tsx` línea 336 fija `attributes: { spellcheck: "true" }` y el estado `spellcheck` (línea 185) nunca se aplica al editor (solo se usa para el estado visual del botón).
- **Pasos**: pulsar el botón (o Tools > Spelling & grammar) y comprobar `.ProseMirror`.
- **Esperado**: se desactiva o activa el subrayado ortográfico del navegador.
- **Observado**: el botón cambia a inactivo (`tb-btn active` pasa a `tb-btn`) y la casilla del menú pasa a desmarcada, pero `spellcheck` del editor sigue en `true` (`pm.spellcheck === true` tras cada clic).
- **Errores de consola o red**: ninguno.
- **Captura**: sin captura (es un atributo DOM). Log: salida de `02c.mjs`.

### 5. El bubble menu con la fila de tipografía abierta tapa las líneas siguientes
- **Severidad**: baja
- **Dónde**: bubble menu de selección cuando la selección está cerca de la parte superior de la vista.
- **Pasos**: seleccionar texto de la primera línea visible, abrir "Text formatting" (Aa) en el bubble y llevar el ratón al párrafo siguiente.
- **Esperado**: el menú no impide editar el texto vecino, o se coloca encima.
- **Observado**: sin hueco arriba, el bubble (dos filas, aprox. 70 px) se coloca debajo de la selección y cubre el párrafo siguiente. Un clic sobre esa línea cae en el bubble y activó "Cite" (se abrió "Add citation"). Se cierra con Escape.
- **Errores de consola o red**: ninguno.
- **Captura**: `editor/shots/03_bubble_overlap.png`, `editor/shots/03_ask_ai.png`.

### 6. Móvil: la barra de herramientas oculta B/I/U y enlace sin pista visual de scroll
- **Severidad**: baja
- **Dónde**: editor a 390 px.
- **Pasos**: abrir el editor en móvil y mirar la barra de herramientas sin desplazarla.
- **Esperado**: algún indicio de que hay más controles (degradado, flecha) o los controles básicos a la vista.
- **Observado**: se ven Undo, Redo, estilo, fuente, "-" y el interruptor Provenance; B/I/U, color, enlace, imagen, tabla y listas quedan a la derecha (scrollW 1163 / clientW 324), con `no-scrollbar` y sin degradado. El scroll táctil funciona (scrollLeft 0 a 638). El control de tamaño de fuente queda recortado en "-".
- **Errores de consola o red**: ninguno.
- **Captura**: `editor/shots/12_toolbar_before_swipe.png`, `editor/shots/12_toolbar_after_swipe.png`.

### 7. Enlaces internos con `target="_blank"`
- **Severidad**: baja
- **Dónde**: enlaces creados con "In this document" (`href="#h_..."`, `target="_blank"`). Ctrl+clic en el editor salta bien al encabezado.
- **Esperado**: los enlaces internos no abren pestaña nueva.
- **Observado**: en el HTML descargado (`downloads2/link.html`) el enlace interno conserva `target="_blank" rel="noopener noreferrer nofollow"`, de modo que en el archivo exportado abriría una pestaña nueva en lugar de desplazarse. Solo afecta al export.
- **Errores de consola o red**: ninguno.
- **Captura**: sin captura; fragmento en `editor/logs2` (salida de `08b.mjs`).

Nota (no es hallazgo): el chip del asistente muestra "No model available" aunque Research copilot responde (200 en `/api/ai/chat`, texto canned de Critique). Puede ser propio del modo demo.

## Qué funcionó
- Cabecera, renombrado (actualiza el título y el nombre de las descargas), guardado Unsaved/Saved y Share (asesor con permisos explicados).
- Menú ⋯ completo: acordeón, atajos mostrados, Escape cierra, ítems deshabilitados correctos (Redo vacío, Format > Table sin tabla).
- Buscar y reemplazar, coincidir mayúsculas, reemplazo único y total, limpieza de resaltado al cerrar.
- Descargas .docx (header1/footer1, PAGE, Heading2, negrita), .html (con marcas de procedencia), .md y .txt con nombre correcto; Ctrl+P y "PDF (via Print)" llaman a `window.print`.
- Numeración de encabezados, caracteres especiales (diálogo multi-inserción), marcadores (duplicado rechazado con aviso), recuento y detalles de documento.
- Diálogo de privacidad: el cambio de alcance se envía a `/api/monitor/consent`, la session bar lo refleja y se restaura.
- Barra de herramientas: todos los controles, interruptor Provenance (aria-checked, `localStorage provenance_gutter`, sincronizado con View).
- Imágenes: pie, alt, alineaciones, flotante, anchos, redimensionado, reemplazar, borrar; PNG transparente conservado; imágenes grandes reducidas; archivo no imagen rechazado con mensaje.
- Tablas: insertar, filas y columnas, cabecera, formato de celda, borrar fila, columna o tabla, menú contextual.
- Enlaces: URL, internos a encabezados y marcadores, quitar enlace.
- Pestañas: Final submission bloqueada y sin menú, +, doble clic para renombrar, duplicar, cerrar con confirmación, "Use as Final submission", outline popover con navegación, copia entre pestañas sin diálogo, pegado externo de más de 30 palabras con diálogo de atribución, pegado corto directo, persistencia tras recarga.
- Versiones: guardado con nombre, vista previa, restauración con versión "Before restore".
- Móvil 390 y 360 px: sin scroll horizontal de página, diálogos a ancho completo, hoja de comentarios.
