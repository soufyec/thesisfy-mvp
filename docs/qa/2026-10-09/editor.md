# QA editor de documento (/dashboard/editor/<thesisId>) - INFORME PARCIAL

## Estado de la ejecucion (leer primero)

El servidor de produccion http://localhost:3050 NO responde durante esta sesion (ERR_CONNECTION_REFUSED / curl 000, comprobado durante ~6 minutos con reintentos; ningun proceso node/next en ejecucion). Tenia prohibido arrancarlo, asi que NO pude volver a ejecutar ningun script. Este informe se basa solo en lo que dejo el tester anterior: `run_all.log` (solo contiene los resultados de las secciones bubble, keyboard, pagination, autosave+versions, export, mobile y resilience), los scripts y las capturas en `shots/`.

NO HAY resultados (log) de: 01_header_menu, 02_toolbar, 04_tabs, 11_followup, 12_mobile2 (los scripts 11 y 12 llegaron a generar capturas; 12 termino con `12_error.png`). Esas areas figuran como "sin verificar". Para completarlas: reiniciar el servidor y ejecutar `node 01_header_menu.mjs`, `02_toolbar.mjs`, `04_tabs.mjs`, `11_followup.mjs`, `12_mobile2.mjs` y re-ejecutar `03_bubble.mjs` desde `/tmp/claude-0/-home-user-thesisfy-mvp/4306acd1-1b1f-512f-8e05-a9c07969fd69/scratchpad/qa/editor/` (cuenta guardada en state.json/info.json; si el servidor en memoria se reinicio, ejecutar antes `node 00_setup.mjs`).

## Resumen

| Area | Probado | Estado |
|---|---|---|
| Cabecera y menu ... (accordion, descargas, etc.) | Capturas 01_menu_*.png existen; sin log | Sin verificar (solo mobile More sheet y descargas OK) |
| Toolbar (estilos, imagen, tabla, enlace, color, Provenance) | Sin log de 02_toolbar | Sin verificar |
| Bubble menu | B/I/U, tipografia, fuente, tamano, resaltado, justificar, Cite, Comment, Ask AI | OK parcial; el script fallo antes de Ctrl+K/"In this document" (ver H-2) |
| Pestanas del documento | Solo mobile: lista, outline popover, pegado con dialogo | Parcial; 04_tabs sin log |
| Atajos de teclado | Tab/Shift+Tab, Ctrl+K, Ctrl+H, Ctrl+S, Ctrl+Enter, Ctrl+/, Shift+F3, Ctrl+Alt+B/E, Ctrl+Shift+C, Ctrl+P | OK con 2 dudas (H-1, H-3) |
| Paginacion | Salto de pagina, numeros de pagina, Page setup, print real cancelado | OK |
| Autosave / recarga / versiones | Unsaved -> Saved ~2.4 s; contenido persiste tras recarga; preview y "Restore this version" visibles | OK |
| Export | docx (10 704 B), md, html, txt, PDF por print | OK, no vacios |
| Mobile 390x844 | Sin scroll horizontal en ningun paso; bottom nav, More sheet (todas las entradas abren), toolbar | OK |
| Resiliencia | Escritura rapida 720 car., undo/redo tras pegado, 13 toggles Provenance, Escape en 12 dialogos, "Application error" ausente | OK con 1 hallazgo menor (H-4) |
| Errores de pagina/consola/red | pageErrors y consoleErrors vacios en todas las secciones con log; ningun status >= 400 | OK |

## Hallazgos

Ninguno bloqueante ni de severidad alta se pudo confirmar con la evidencia disponible. Los siguientes son los puntos reales o dudosos que aparecen en el log.

### H-1 Escape no cierra el panel Find & replace
- **Severidad:** baja (posible; no re-verificado)
- **Dónde:** /dashboard/editor/thesis_99f34b40098d, desktop 1280x900
- **Pasos:** Ctrl+H (abre "Find and replace", foco en input Find), buscar "words", pulsar Escape.
- **Esperado:** el panel se cierra (como los dialogos, que si cierran con Escape) o, al menos, devolver el foco al documento.
- **Observado:** `Escape in find closes panel: false` (el aside sigue visible). Se cierra con el boton "Close".
- **Errores de consola o red:** ninguno (pageErrors/consoleErrors/badResponses vacios).
- **Captura:** shots/05_find.png

### H-2 Ctrl+K y Ctrl+Alt+B no abrieron dialogo en la ejecucion del bubble menu
- **Severidad:** baja (probable artefacto del script, no re-verificado)
- **Dónde:** desktop 1280x900, tras usar el bubble menu y el dialogo Cite/Comment.
- **Pasos:** (03_bubble.mjs) seleccionar texto, usar bubble (Cite, Comment, Ask AI), cerrar, luego Ctrl+Alt+B y Ctrl+K.
- **Esperado:** dialogos "Insert bookmark" y "Link".
- **Observado:** `bookmark dialog via Ctrl+Alt+B: none dialogs open=0`, `Ctrl+K dialog: none`, y el script termino con `locator.click: Timeout 30000ms exceeded ... waiting for locator('[role=dialog]').getByRole('tab', { name: 'In this document' })`. En 05_keyboard.mjs los mismos atajos SI funcionan (Ctrl+K -> "Link"; Ctrl+Alt+B -> "Insert bookmark", marcador insertado), por lo que lo mas probable es que en 03 el foco no estuviera en el editor tras el panel Ask AI (el panel dejaba el foco fuera del ProseMirror). Si es asi, es el mismo comportamiento que H-3: tras cerrar un panel/dialogo el foco no vuelve al documento y los atajos dejan de funcionar hasta hacer clic. La pestana "In this document" del dialogo de enlace tampoco se pudo verificar aqui (11_followup.mjs la cubre; hay captura `shots/11_link_in_doc.png`, no revisada).
- **Errores de consola o red:** ninguno.
- **Captura:** shots/03_error.png, shots/03_ask_ai.png

### H-3 El foco no vuelve al editor tras cerrar algunos dialogos con Escape
- **Severidad:** baja
- **Dónde:** desktop 1280x900
- **Pasos:** abrir con Ctrl+K el dialogo "Link", pulsar Escape; o abrir desde el menu ⋯ "Bookmark...", "Special characters...", "Save named version" y cerrar con Escape.
- **Esperado:** el foco regresa al elemento que abrio el dialogo o al editor (Ctrl+H posterior sin hacer clic).
- **Observado:** `Escape closes link dialog: true editor focused=false`; para Link, Bookmark, Special characters y Save named version el foco queda en `BODY`. Los demas dialogos (Page setup, Document details, Image, Table, Shortcuts, About, Privacy, Submit) devuelven el foco al boton ⋯. Consecuencia: un usuario de teclado debe volver a hacer clic para seguir escribiendo. (En el log, `Ctrl+H right after Escape (no click): aside visible=false`: el atajo no actua con el foco perdido.)
- **Errores de consola o red:** ninguno.
- **Captura:** shots/05_find.png, shots/10_end.png

### H-4 Aviso menor: peticiones abortadas en navegacion/recarga
- **Severidad:** baja (informativo; probablemente benigno)
- **Dónde:** autosave+versions, mobile, resilience, pagination.
- **Observado:** `requestfailed` con `net::ERR_ABORTED` en `PATCH/POST /api/sessions/sess_...` y `GET /dashboard?_rsc=18bja` al recargar o navegar con el telemetria de sesion en curso. No hay respuestas >= 400 ni errores de consola. Es el comportamiento esperado al cancelar fetch durante `page.reload()`, solo se registra para trazabilidad.
- **Errores de consola o red (verbatim):** `PATCH http://localhost:3050/api/sessions/sess_eb9c357afe24 net::ERR_ABORTED`, `POST http://localhost:3050/api/sessions/sess_8b540c0846e3 net::ERR_ABORTED`, `GET http://localhost:3050/dashboard?_rsc=18bja net::ERR_ABORTED`
- **Captura:** n/a

### Dudas no concluyentes (no son hallazgos)
- `Ctrl+Alt+M -> aside: none`: el atajo de comentario no abrio el panel de comentarios con la seleccion `Shift+Home`; el comentario si abre desde el bubble menu y la barra (`bubble comment: aside=Comments...`). Re-verificar con una seleccion de texto real antes de tratarlo como fallo (05_keyboard.mjs).
- `Control+b: false` en la tabla de atajos, mientras Ctrl+I y Ctrl+U dan true. Posible artefacto: el texto ya estaba en negrita y el segundo Ctrl+B la quito. Re-verificar.
- 07_autosave_versions: `preview dialog: none`, `restore button: 0` se debe a un localizador debil del script; la captura `shots/11_version_preview.png` (11_followup) muestra que la vista previa ("Preview: QA followup v") y el boton "Restore this version" existen y funcionan. No es un fallo del producto.
- Version history (captura 11_version_preview.png): el cuerpo del panel muestra entradas "autosave" cuyo titulo queda tapado por el overlay; sin problema visible.

## Lo que funciono (con evidencia en log)
- Estilos de parrafo (H1-H4, Normal) por cursor; bubble menu con Bold/Italic/Underline (on/off y bubble persiste), fila de tipografia (fuente Arial, tamano 14pt, colores 37 swatches, resaltado, justificar), Cite abre "Add citation" y cierra con Escape, Comment abre panel con comentario y marca, Ask AI abre el panel Thesisfic AI con la seleccion; el bubble se oculta en mobile.
- Tab / Shift+Tab sangran y des-sangran parrafos; Tab en lista anida; "- " crea lista; Ctrl+K abre "Link"; Ctrl+H busca/reemplaza uno y todos; Ctrl+S dispara `PUT 200 /api/theses/thesis_99f34b40098d` y el indicador muestra "Saved"; Ctrl+Enter inserta salto de pagina; Ctrl+/ lista los atajos; Shift+F3 cicla MAYUSCULAS / minusculas / Title Case conservando la seleccion; Ctrl+Alt+B inserta marcador; Ctrl+Alt+E abre Cite; Ctrl+Shift+C abre "Document details" (paginas, palabras, % IA, % pegado); Ctrl+Shift+7/8, Ctrl+Alt+0/2, Ctrl+Shift+E, Ctrl+\ y Ctrl+Z/Ctrl+Y funcionan; Ctrl+P llama a window.print una vez y la pagina sigue viva.
- Paginacion: hueco de pagina, numero de pagina en pie (`footerCenter` persiste tras recarga), Page setup con orientacion/tamano/margenes/encabezado/pie/numeros; impresion real cancelada sin romper la pagina.
- Autosave: "Unsaved" -> "Saved" en ~2.4 s; el contenido persiste tras recarga; historial de versiones con nombre, autosave, Preview y Restore.
- Export: .docx 10 704 B, .md, .html, .txt y PDF por print, no vacios; el .md de una pestana de trabajo se exporta con su nombre.
- Mobile 390x844: `pageScrollX: 0` y sin overflow horizontal en cada paso (hojas AI, Comments, Outline, Integrity, More y todos sus dialogos); barra inferior AI/Comments/Outline/Integrity/More; hoja More con 16 entradas que abren sus dialogos (Find & replace, Page setup, Document details, Hide/Show provenance, Share, Privacy choices, Rename, Shortcuts, Version history, Save named version, Citations); la barra de herramientas se desplaza horizontalmente dentro de si misma; imagen insertada con herramientas; pestanas y outline de pestana; dialogo de pegado.
- Resiliencia: 720 caracteres tecleados rapido sin perdida; dialogo de pegado con 3 opciones (My own writing / Quoted / From an AI tool); undo/redo tras pegado; 13 toggles de Provenance sin fallos y persistencia en localStorage; caracteres especiales (59 botones) con insercion `±` y persistencia tras recarga; sin "Application error" en ningun momento; pageErrors, consoleErrors y badResponses vacios en todas las secciones con log.
