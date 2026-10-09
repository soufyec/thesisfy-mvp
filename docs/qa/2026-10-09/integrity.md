# QA · Integridad y procedencia en el editor

Entorno: build de producción en `http://localhost:3050`, store en memoria, modo DEMO de IA (sin proveedor). Playwright + Chromium headless, escritorio 1280×900 y móvil 390×844 (`isMobile`, `hasTouch`).
Cuentas creadas: `qa.integrity@example.edu` (tesis `thesis_f8874afd4949`), `qa.integrity2@example.edu` (`thesis_f16f0e413a54`), `qa.integrity3@example.edu` (móvil, `thesis_d580f7184710`); tutor demo `prof.williams@stanford.edu` para resolver avisos. Política Stanford: límite IA 25 %, sensibilidad `medium` (aviso de pegado masivo a partir de 200 palabras), consentimiento obligatorio.
Scripts y capturas: `/tmp/claude-0/-home-user-thesisfy-mvp/4306acd1-1b1f-512f-8e05-a9c07969fd69/scratchpad/qa/integrity/` (`t1_consent.mjs` … `t12d_insert_cursor.mjs`, `*.log`, `*.png`).

En ninguna ejecución hubo `pageerror`. El único error de consola/red en todas las pruebas fue el 428 esperado al usar el asistente sin consentimiento (ver área 1).

## Resumen

| Área | Probado | Estado |
|---|---|---|
| 1. Modal de consentimiento (scopes, rechazar/aceptar, 428 en servidor, reapertura desde ⋯ → Tools → Privacy & monitoring choices y desde «change» de la session bar) | Sí | OK |
| 2. Session bar y sesiones (contadores, heartbeat, nueva sesión por visita, sesiones vacías descartadas, cambio de pestaña) | Sí | OK |
| 3. Diálogo de pegado ≥30 palabras (own / source / ai, cierre con X, Escape y fondo; marcas, gutter, ledger) | Sí | OK |
| 4. Pegado corto reconocido del asistente / pegado corto aleatorio | Sí | OK · observación (hallazgo 4) |
| 5. Copiar entre pestañas con el portapapeles real (Ctrl+C / Ctrl+V) | Sí | OK |
| 6. Provenance gutter (etiquetas, interruptor, `localStorage`, print) | Sí | OK |
| 7. Integrity pill / ledger / página de tesis (coherencia de cifras, barra «Who wrote this document») | Sí | OK |
| 8. Avisos (creación, respuesta del estudiante, resolución por el tutor, acción sugerida) | Sí | **Fallos** (hallazgos 1 y 3) |
| 9. Declaración de uso de IA (generar, insertar como apéndice, contenido vs. registro) | Sí | **Fallo** (hallazgo 2) |
| 10a. AI reviewer, Language review, Sources (texto/URL/DOI, Ask, «Use my sources», pegado desde fuente), Process | Sí | OK |
| 10b. Cite-verified (búsqueda) y Evidence check | Parcial | No evaluable: OpenAlex devuelve 429 desde este entorno; la UI lo muestra sin romperse |
| 10c. Comentarios (crear, responder, resolver, borrar) | Sí | OK |
| 10d. Citas (Cite desde bubble menu, panel de referencias, bibliografía, cambio de estilo) | Sí | OK · hallazgo 5 (baja) |
| 11. Móvil (consentimiento, Integrity sheet, diálogo de pegado, comentarios, Privacy choices, sin scroll horizontal) | Sí | OK |
| Copy de notificaciones al estudiante | Sí | hallazgo 6 (baja) |

## Hallazgos

### 1. Citar un pasaje pegado no lo atribuye: la deducción del ledger no baja y la acción sugerida no funciona
- **Severidad:** alta
- **Dónde:** Integrity ledger → fila «Pasted text without attribution» → «Attribute the pasted text →» → bubble menu «Cite» → «Insert citation». Código implicado: `src/lib/integrity.ts` (`countUnattributedPaste` exige `data-source` en el `span[data-provenance="paste"]`), `src/components/editor/DocsEditor.tsx` (`handleFix("attribute_paste")`, `insertCitation`).
- **Pasos:** 1) Pegar ≥30 palabras y cerrar el diálogo (X/Escape/fondo) → texto «Quoted or pasted» sin atribución, fila «Pasted text without attribution (71 %) −20». 2) En el ledger pulsar «Attribute the pasted text →»: se selecciona el pasaje y aparece el toast «Pasted passage selected. Use Cite to name its source, or rewrite it in your own words». 3) Bubble menu → Cite → Authors «Jones, R.», Year 2020, Title, Journal → «Insert citation». 4) Esperar el guardado; reabrir el ledger.
- **Esperado:** el pasaje pasa a «Quoted or pasted text, attributed», la fila con −20 desaparece o se reduce y la puntuación sube (principio «cada deducción se corresponde con una acción»).
- **Observado:** el chip «(Jones, 2020)» y la marca `cited-passage` se insertan, pero el span de procedencia sigue sin `data-source`; ledger idéntico (−20, 71 %, Integrity 76), pill «AI 8% of 25% · Integrity 76», `/api/theses/:id` → `integrityScore: 76`. HTML guardado: `<span data-provenance="paste" class="prov prov-paste"><span data-cite-ref="ref_mv0mg9xa" class="cited-passage">Historical accounts …</span></span> <span data-citation="ref_mv0mg9xa" class="cite-chip">(Jones, 2020)</span>`. El gutter sigue mostrando «Q · Pasted · no source». Tampoco se cierra el aviso `bulk_paste` asociado (ver hallazgo 3).
- **Errores de consola o red:** ninguno.
- **Captura:** `71_attribute_fix_selected.png`, `72_after_cite_on_paste.png` (log `t8c.log`).

### 2. La declaración de uso de IA clasifica mal los pegados declarados y los reconocidos de la biblioteca
- **Severidad:** alta (es el documento que el estudiante firma y el tutor lee; afirma que «every figure comes from an event logged in the editor»)
- **Dónde:** Writing process & AI declaration → «Generate AI-use declaration»; `POST /api/theses/:id/declaration`. Causa en `src/lib/process.ts` → `pasteAttribution()`: devuelve `"source"` para cualquier evento con `data.attributed || data.label` (incluye `attribution: "own"` y `attribution: "ai"`) y nunca mira `matchedSource` (los pegados reconocidos de la biblioteca quedan como `"unattributed"`); el tipo `EventAttribution` tiene `"own"` pero nunca se asigna.
- **Pasos (tesis `thesis_f8874afd4949`):** eventos de pegado reales en las sesiones: `own 50`, `source "Smith 2021, p. 4" 44`, `ai "ChatGPT" 47`, `none` ×5 (3 cierres del diálogo, 1 pegado corto aleatorio, 1 pegado masivo), `none + matchedAi 14` (reconocido del asistente). Generar la declaración en inglés.
- **Esperado:** «1 attributed to a library source or a declared citation, 1 declared as the student's own writing, 1 declared as text from an AI tool (ChatGPT), 1 recognised as assistant text, 5 unattributed» (o categorías equivalentes).
- **Observado:** «Of the 9 pastes recorded, 3 were attributed to a library source or a declared citation, 1 was recognised as assistant text and 5 remain unattributed». El pegado declarado «From an AI tool (ChatGPT)» y el declarado «My own writing» figuran como atribuidos a una fuente/cita. Además: «AI-assisted text … They are insertions from the assistant (2 insertions)» cuando las dos inserciones son el pegado declarado ChatGPT y el pegado reconocido. En la tesis `thesis_f16f0e413a54` (eventos `none+matchedSource 15`, `source 42`, `none 15`, `own 42`) la declaración dice «2 were attributed … and 2 remain unattributed»: el pegado reconocido automáticamente de la biblioteca (marcado en el documento con `data-source="Feedback in doctoral education"`) se cuenta como sin atribuir, y el «own» como fuente. Mismas cifras en `ledgerSummary.pastes` del API y en el panel Process («4 pastes, 2 attributed to a source, 0 recognised as assistant text, 2 unattributed»).
- **Errores de consola o red:** ninguno.
- **Captura:** `48_declaration.png`, `48b_declaration_generated.png`, `49_declaration_appended.png`; logs `t8c.log` («declaration:» y «paste events:»), `chk_decl.mjs`.

### 3. Los avisos no se cierran cuando desaparece su causa y el estudiante no puede resolverlos: la puntuación no se recupera
- **Severidad:** media
- **Dónde:** Integrity ledger (filas «Open notice ·…», botón «Open the notice →»); `src/lib/monitor.ts` → `evaluatePolicyLimit` (solo abre, nunca cierra); `src/app/api/flags/[id]/route.ts` (el estudiante solo puede añadir `studentNote`; `resolved` solo lo cambia el personal).
- **Pasos:** 1) Con ~180 palabras en el documento, pegar 47 palabras y declararlas «From an AI tool → ChatGPT» → IA 26 % > 25 % → aviso `policy_limit` (−8) y toast «New notice: AI share above the limit». 2) Pegar más texto propio o citado hasta que la IA baje al 15 % (y luego al 8 %). 3) Pulsar «Open the notice →» (solo hace scroll a la tarjeta del aviso, cuyo único control es «Send» una respuesta). 4) Ídem con `bulk_paste`: pegar 384 palabras, cerrar el diálogo → aviso (−4); después citar/atribuir el pasaje (hallazgo 1) o responder.
- **Esperado:** según el texto del propio ledger («Every deduction maps to an action you can take») y el comentario de `integrity.ts` («resolve a notice»), al volver por debajo del límite o atribuir el pegado el aviso debería cerrarse (o existir una acción del estudiante que lo cierre) y la puntuación recuperarse.
- **Observado:** el ledger muestra a la vez «AI share 15% of the 25% limit −0» y «Open notice · AI share above the limit −8» con el texto «AI-assisted content is 26% of the document…», que ya no es cierto. Siguió abierto con IA al 8 %. Solo tras resolverlo el tutor (`/admin/theses/:id` → Resolve…) subió la puntuación de 68 a 76. `PATCH /api/flags/:id {resolved:true}` como estudiante responde 200 sin cambiar `resolved`.
- **Errores de consola o red:** ninguno.
- **Captura:** `14_after_dismissed_pastes.png` (aviso abierto con IA 15 %), `24_notice_focused.png`, `27_prof_thesis.png`, `29_student_after_resolve.png`.

### 4. Un pegado corto (<30 palabras) de texto ajeno queda como «Written» en el documento, pero cuenta como pegado sin atribuir en el registro
- **Severidad:** baja (coincide con la regla implementada en `DocsEditor.tsx` «Small paste: let ProseMirror handle it…», pero deja dos vistas contradictorias para el mismo evento)
- **Dónde:** editor (`handlePaste`), ledger «This session · Pastes», declaración de uso de IA.
- **Pasos:** pegar «Completely original words typed elsewhere by the student about weather patterns.» (11 palabras).
- **Esperado:** una única lectura del evento: o bien se marca como «Quoted or pasted» (principio 1: toda marca nace de un evento real, y el pegado lo es), o bien no se contabiliza como pegado sin atribuir.
- **Observado:** sin marca (gutter «¶10», barra «Who wrote» lo suma a Written 100 % del párrafo), pero el contador «Pastes» de la sesión sube, el evento se guarda con `attribution: "none"` y la declaración lo incluye entre los «5 remain unattributed». El pegado corto que sí coincide con una respuesta del asistente se marca correctamente (ver «Qué funcionó»).
- **Errores de consola o red:** ninguno.
- **Captura:** `17_short_ai_paste.png` (¶10 sin marca vs. «AI» en ¶9), logs `t4.log`.

### 5. Cambiar el estilo de cita no actualiza los chips ya insertados; la bibliografía se inserta en el cursor sin control de duplicados
- **Severidad:** baja
- **Dónde:** panel «Citations & references» (selector APA/MLA/Chicago/IEEE/Harvard, «Insert bibliography»); `src/components/editor/DocsEditor.tsx` → `insertBibliography` (`insertContent` en la posición actual).
- **Pasos:** 1) Insertar una cita vía Cite (APA → chip «(Smith et al., 2021)»). 2) Cambiar el selector a MLA: la session bar y `thesis.citationStyle` pasan a MLA y el panel ofrece «Insert (Smith) at cursor». 3) «Insert bibliography (MLA)» con el cursor en el título; cambiar a APA y volver a pulsar.
- **Esperado:** los chips existentes se re-renderizan en el nuevo estilo (o se avisa de que no se hará); la bibliografía se inserta al final del documento y se reemplaza si ya existe.
- **Observado:** el chip sigue «(Smith et al., 2021)» con el estilo MLA activo; el documento acaba con dos secciones `<h2>References</h2>` (una MLA y otra APA) colocadas antes del título y un `<h1></h1>` vacío creado al insertar dentro del título. HTML guardado: `<h2>References</h2><p>Smith, J.; Doe, A.. "Feedback timing…" Studies in Higher Education, 2021.</p><h1></h1><h2>References</h2><p>Smith, J.; Doe, A. (2021). …</p><h1>QA no-consent thesis</h1>`.
- **Errores de consola o red:** ninguno.
- **Captura:** `69_style_mla.png`, `70b_bibliography.png`, `70c_bibliography_apa.png`.

### 6. Las notificaciones al estudiante hablan de «flag»
- **Severidad:** baja (contradice el vocabulario obligatorio de CLAUDE.md §3 y §6: «Notice», nunca «flag» de cara al estudiante)
- **Dónde:** `src/app/api/flags/[id]/route.ts` (`title: "Flag resolved"`, `message: "… resolved a flag on …"`, `title: "Student responded to a flag"`); `GET /api/notifications`.
- **Pasos:** el tutor resuelve un aviso; consultar las notificaciones del estudiante.
- **Esperado:** «Notice resolved» / «… resolved a notice on …».
- **Observado:** `{"title":"Flag resolved","message":"Prof. James Williams resolved a flag on \"QA Integrity thesis\".","type":"success"}`.
- **Errores de consola o red:** ninguno.
- **Captura:** log `t8b.log` («student notifications:»).

### No evaluable en este entorno
- Cite-verified («Find support») y Evidence check dependen de OpenAlex/Semantic Scholar; desde este contenedor OpenAlex responde 429 y la UI lo indica («OpenAlex search unavailable (OpenAlex search failed (429))», «No passages about this claim were found…») sin errores de página. La inserción de cita desde resultados verificados no se pudo probar. «Reference check» se abre y muestra la lista de referencias, pero no se ejecutó la comprobación por el mismo motivo.
- El scope «AI assistant interactions» está bloqueado como «required by policy» con la política de Stanford, así que el flujo «aiInteractions desactivado → 428» no es alcanzable desde la UI; en servidor `POST /api/monitor/consent` con `aiInteractions:false` devuelve `422 {"error":"AI interaction logging is required by your institution's policy to use the assistant."}` y sin consentimiento alguno `/api/ai/chat` devuelve 428 (ver abajo).

## Qué funcionó
- Consentimiento: modal en la primera visita con los 4 scopes; «Not now» deja «Monitoring paused · change» y no crea sesión; sin consentimiento el asistente devuelve `428 POST /api/ai/chat :: {"error":"Please review and accept the monitoring consent before using the assistant.","code":"consent_required"}` (consola: `[error] Failed to load resource: the server responded with a status of 428 (Precondition Required)`), el panel muestra el mensaje y reabre el modal sin romperse; al aceptar arranca la sesión y el asistente responde (texto demo con nota). Los scopes se filtran en servidor (keystrokes off → sin eventos `typing`); reapertura desde ⋯ → Tools → «Privacy & monitoring choices», desde «change» de la session bar y, en móvil, desde More → «Privacy choices».
- Sesiones: una por visita (`sess_…` distinto en cada apertura), las vacías se eliminan (`removed: true` / no aparecen en la lista), heartbeat `PATCH` cada 60 s (`lastHeartbeatAt` avanza), `pagehide` cierra la sesión; contadores de keystrokes, palabras, AI assists, pastes y tab switches (`visibilitychange`) coinciden entre `/api/sessions/:id`, el bloque «This session» del ledger y la vista del tutor. La session bar indica exactamente los scopes concedidos.
- Diálogo de pegado: aparece con ≥30 palabras y muestra el recuento; «own» inserta como Written sin marca; «source» + etiqueta → `data-provenance="paste" data-source="Smith 2021, p. 4"`, gutter «Q», fila «Quoted or pasted text, attributed −0»; «ai» + «ChatGPT» → `data-provenance="ai" data-source="ChatGPT"`, gutter «AI», cuenta para el límite; X, Escape y clic en el fondo insertan como «Quoted or pasted» sin atribución (fila con deducción, 0,5 pt/% con tope 20) y, por encima de 200 palabras, abren el aviso `bulk_paste` con toast y notificación. Los pegados declarados no crean aviso. Suma de filas = 100 − score en todos los casos.
- Reconocimiento: una frase de una respuesta Ask del asistente pegada (14 palabras) se marca morada «Thesisfic assistant» con toast «Pasted text came from the Thesisfic assistant: marked as AI-assisted»; un pegado largo que coincide con una fuente de la biblioteca preselecciona «Quoted… from a source» con la fuente, y uno corto se atribuye solo (`data-source="Feedback in doctoral education"`).
- Copiar/pegar entre pestañas con el portapapeles real: sin diálogo y con las marcas (`data-provenance="ai" data-source="ChatGPT"`) conservadas en «Research notes».
- Gutter: etiquetas ¶n / Q / AI por bloque y nota en el margen derecho; el interruptor «Provenance» lo oculta, guarda `provenance_gutter = "0"/"1"`, persiste tras recargar y en `@media print` el gutter es `display: none`.
- Pill ↔ ledger ↔ `/api/theses` ↔ página «My Theses» ↔ vista del tutor: mismas cifras (AI 8 %, Integrity 68/76, 722 palabras, 2 avisos). Clic en la pill abre/cierra el ledger; «Who wrote this document» coincide con `provenance` del API.
- Resolución por el tutor: «Resolve…» con nota → score 68 → 76, ledger del estudiante marca «resolved», notificación al estudiante.
- Declaración: se genera en 3 idiomas, versiona, se puede exportar (.txt/.html) e insertar como apéndice con `data-declaration="true"` (excluida de los totales: el score no cambia).
- Paneles: AI reviewer crea 2 comentarios anclados con `source: "ai"`, Locate/Resolve/Dismiss y «Share with advisor»; Language review detecta ortografía/gramática, «Accept» corrige sin marca de IA y el toggle de estilo añade sugerencias «AI model» con la nota de marcado; Sources añade texto/URL/DOI (con estados «Parsed», «No text» explicados), «Ask my sources» responde con pasajes verificados y «Use my sources» en el copilot muestra «1 passage from your library»; Process muestra la cadena de snapshots verificada, timeline y desglose por capítulo.
- Comentarios: crear desde el bubble menu (escritorio) o el botón «Add comment» de la toolbar (móvil), responder (input «Reply…» + Enter), resolver, borrar; filtro «resolved».
- Citas: diálogo Cite con registro de referencia, chip en texto, panel de referencias con estilos, «Insert (…) at cursor», bibliografía.
- Móvil 390×844: modal de consentimiento con pie fijo y cuerpo desplazable, Integrity sheet desde la barra inferior, diálogo de pegado usable (radios y «Continue» visibles), hoja de comentarios, Privacy choices, hoja del asistente; `scrollWidth == innerWidth` (sin scroll horizontal).
