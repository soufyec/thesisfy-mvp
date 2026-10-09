# QA · Thesisfic AI (asistente del editor) y /dashboard/ai-chat

Build de producción en `http://localhost:3050`, modo DEMO (sin clave de proveedor). Cuenta propia registrada vía `/register`: `qa.assistant@example.edu` (Stanford University, política: límite IA 25 %, `blockGeneration`, copilot activo, la universidad paga). Tesis creada desde la UI: `thesis_e9e642f5805f` ("QA Assistant thesis 1791528549864"), con dos párrafos propios escritos a mano y después ~1 300 palabras más de texto propio para poder probar el límite.

Scripts, notas JSON y capturas en `scratchpad/qa/assistant/` (`t1_setup_panel.mjs`, `t2_modes.mjs`, `t3_insert.mjs`, `t3b_insert.mjs`, `t4_history.mjs`, `t5_provider_edge.mjs`, `t6_lang.mjs`; capturas `t1_*.png` … `t6_*.png`). Todos los scripts capturan `pageerror`, `console.error` y respuestas HTTP >= 400. Los únicos errores de red/consola en toda la sesión fueron el `401 GET /api/auth/me` de la página de login antes de iniciar sesión (y un `400 POST /api/auth/register` en el segundo intento de registro, "An account with this email already exists", porque la cuenta ya existía). Ningún `pageerror`.

## Resumen

| Área | Probado | Estado |
|---|---|---|
| Abrir/cerrar panel, redimensionar, persistencia de anchura | Desktop 1280×900: botón "AI assistant" abre/cierra; arrastre del borde 400→524→320 (mín.)→768 (máx. 60 %); `localStorage.assistant_width` guardado; tras recargar 524; doble clic vuelve a 400 | OK |
| Móvil 390×844 (bottom sheet) | Abrir desde la barra inferior "AI", cerrar con X, Escape y toque en el fondo; rejilla de modos sin scroll horizontal; enviar mensaje y acciones | OK |
| 11 modos (selección, línea de ayuda, sugerencias, envío, streaming, acciones) | Los 11 con sugerencia + mensaje escrito; copilot destacado en primera posición | OK salvo H7 (puntuación) |
| Insertar marcado como IA (tarjeta de coste → confirmar → marca morada, toast, píldora) | Tarjeta con palabras, % antes/después, límite 25 %, "Billed to your university"; cancelar no inserta; `span.prov-ai` con `data-provider`/`data-interaction`; toast "92 words inserted and marked as AI-assisted (demo)."; píldora 9 %→14 % | OK, pero ver H1 |
| Guardar como notas | Va a la pestaña "Research notes" (existente o creada), marcado IA, toast correcto, la Entrega final no cambia; segunda vez se añade a la misma pestaña | OK, pero ver H3 |
| Reemplazar selección (Grammar) | Selección → "Ask AI" → Grammar → aparece "Replace selection" → tarjeta → reemplaza con marca IA; píldora 0 %→10 % | OK |
| Añadir como comentario | Con selección: comentario anclado creado (`[data-comment-id]`, API `/comments`, toast); sin selección: toast "Select the passage the comment refers to, then try again." | OK |
| Límite de IA 25 % | La tarjeta desactiva el botón con "This insertion would take you to 29%, above the 25% limit."; forzar el clic no inserta; Insert/Replace/Notes quedan bloqueados | Ver H1 y H3 |
| Bloqueo por política (EN/ES/FR) | EN y ES bloqueados ("blocked by policy", burbuja ámbar, solo "Copy", registrados en `/api/ai/logs` con `blockedByPolicy`) | FR falla: H2; idioma del mensaje: H4 |
| Selección → "Ask AI", "Working on", quitar selección | Tarjeta "Working on · 12 words" con extracto; la petición lleva `selection`; X oculta la tarjeta y colapsa la selección (el bubble menu desaparece); nueva selección la reactiva | OK, ver H5 |
| Historial (reloj, por modo, +, reabrir, borrar) y /dashboard/ai-chat | Lista solo del modo activo ("History · Ask"); cambiar de modo inicia conversación nueva; "+" vacía; reabrir restaura mensajes y modo; continuar suma mensajes; borrar; ai-chat agrupa por modo, abre conversaciones, `?mode=` y `?conversation=` funcionan, borrar desde la página | OK |
| Selector de proveedor (chip, desplegable, cupo, Escape) | Chip "No model available" (demo); desplegable con "Provided by your university", bloque de cupo (1 395 interacciones, 0 %, barra, "Starts again on 1 November, in 23 days", coste por interacción), modelos "Not available", "Your own accounts", enlace "Connect your…" → `/dashboard/connections` | Escape/clic fuera no cierran: H6 |
| "Use my sources" | Sin fuentes: insignia "no matching passage in your library"; con una fuente de texto: "1 passage from your library" y respuesta demo con el pasaje citado; apagado: no se envía `useSources` | OK |
| Casos límite | Vacío y solo espacios: botón desactivado y Enter no envía; Shift+Enter inserta salto; 5 000 caracteres enviados y respondidos; doble Enter rápido = 1 petición; Enter durante streaming no envía y conserva el borrador; Stop corta sin error; cambiar de pestaña del documento en pleno streaming no rompe | OK, ver H8 (cerrar panel en streaming) |
| Cambio de idioma EN/ES/FR | Panel completo, desplegable, historial, tarjeta de coste, bubble menu, "Working on", sheet móvil y ai-chat (cambio en vivo sin recargar). 0 claves crudas (`assistant.*`, `glossary.*`…) en las tres lenguas | OK |

## Hallazgos

### H1 · La tarjeta de coste permite una inserción que deja la tesis por encima del límite y genera un aviso
**Severidad**: alta
**Dónde**: `AssistantPanel.tsx` → `renderCostCard` (cálculo `next` redondeado y `over = next > ctx.limitPct`).
**Pasos**: Entrega final con 22 % de IA (1 800 palabras aprox.). Modo Outline → "Outline section 5" → "Insert, marked as AI". La tarjeta dice "Your AI share goes from **22% to 25%** of the 25% your institution allows" y el botón está activo. Confirmar.
**Esperado**: si la inserción real supera el 25 %, la tarjeta debe desactivar el botón con el mensaje "above the limit" (principio 5: el coste se muestra antes).
**Observado**: se inserta; la píldora pasa a "AI 25% of 25% · Integrity 91" y aparece el toast rojo "New notice: AI share above the limit. Open the Integrity ledger to respond." La API devuelve `provenance.ai = 474 / wordCount 1892` = 25,1 %, aviso `policy_limit` (severidad high: "AI-assisted content is 25.1% of the document, above the 25% institutional limit.") y −9 puntos de integridad. La tarjeta compara porcentajes redondeados a entero (25 > 25 es falso) mientras el servidor usa un decimal.
**Errores de consola o red**: ninguno.
**Captura**: `qa/assistant/t3b_04_over_limit.png` (estado justo después; notas en `t3b_notes.json`, "limit loop 2/3").

### H2 · "Écris mon introduction pour moi" no se bloquea (patrón francés con "écris")
**Severidad**: alta
**Dónde**: `src/lib/ai/policy.ts` → `GENERATION_PATTERNS[2]` (`/\b(écris|rédige|génère|produis)\b…/i`).
**Pasos**: Modo Ask (o cualquiera). Enviar "Écris mon introduction pour moi", "écris mon introduction pour moi" o "Écris la conclusion pour moi".
**Esperado**: respuesta bloqueada ("blocked by policy", burbuja ámbar, registrado como bloqueado), como ocurre con "Write my introduction for me", "Redacta mi conclusión", "Rédige mon introduction pour moi" o "Génère mon chapitre".
**Observado**: el asistente responde con normalidad (respuesta demo en francés "Bonne question. Précisons…", con "Add as comment"), nada se registra como bloqueado (`/api/ai/logs`: solo 2 bloqueos tras EN y ES). Causa: `\b` sin flag `u` no reconoce la frontera de palabra antes de "é", así que la alternativa `écris` nunca casa. El mismo problema afecta a cualquier verbo que empiece por vocal acentuada.
**Errores de consola o red**: ninguno.
**Captura**: `qa/assistant/t3b_06_blocked.png`, `qa/assistant/t6_fr_03_blocked.png`.

### H3 · "Keep as notes" se bloquea por el límite de la Entrega final aunque las notas no cuentan
**Severidad**: media
**Dónde**: `AssistantPanel.tsx` → `renderCostCard` usa `insertContext` (números de la Entrega final) para las tres acciones, incluida `notes`.
**Pasos**: Entrega final al 21–25 % de IA. Modo Summarize → respuesta → "Keep as notes".
**Esperado**: las notas van a la pestaña "Research notes", que no entra en el recuento de la entrega (el propio toast dice "Nothing was added to the Final submission" y `scheduleProvenance` solo cuenta `SUBMISSION`), así que no debería estar sujeta al límite, o la tarjeta debería explicar el coste de la pestaña de notas.
**Observado**: la tarjeta dice "Your AI share goes from 25% to 27% of the 25%… This insertion would take you to 27%, above the 25% limit." y el botón "Keep as notes" queda desactivado. El estudiante no puede guardar notas de IA en cuanto la entrega llega al límite.
**Errores de consola o red**: ninguno.
**Captura**: `qa/assistant/t6_00_notes_over_limit.png` (y `t3_notes.json`, "cost card (notes)").

### H4 · Con una selección activa, el mensaje de bloqueo (y el idioma detectado) sale en inglés aunque el estudiante escriba en español o francés
**Severidad**: media
**Dónde**: `src/app/api/ai/chat/route.ts`: `lastUser` incluye el envoltorio `Selected passage from my thesis:\n"""…"""` y `detectLang(lastUser)` cuenta las palabras del pasaje seleccionado.
**Pasos**: UI en español (`?lang=es`), seleccionar una línea de la tesis (texto en inglés), "Preguntar a la IA", enviar "Escribe mi introducción por mí". Igual en francés con "Rédige mon introduction pour moi".
**Esperado**: mensaje de bloqueo en el idioma de la UI/del mensaje (como ocurre sin selección: "No puedo escribir esa parte de tu tesis por ti…").
**Observado**: insignia "bloqueado por la política" correcta, pero el texto es "I can't write that part of your thesis for you: your institution's policy…". El servidor solo usa `preferences.language` o la detección; la cookie `locale` de la UI no se tiene en cuenta.
**Errores de consola o red**: ninguno.
**Captura**: `qa/assistant/t6_es_03_blocked.png`, `qa/assistant/t6_fr_03_blocked.png`.

### H5 · El título de la conversación y el mensaje guardado incluyen el envoltorio de la selección
**Severidad**: media
**Dónde**: `src/app/api/ai/chat/route.ts` (título `lastUser.slice(0, 60)` y `db.conversations.append(... content: lastUser)` tras anteponer la selección).
**Pasos**: Seleccionar un pasaje → "Ask AI" → Grammar → "Correct the grammar of this passage". Abrir el historial (reloj) o `/dashboard/ai-chat`; reabrir la conversación.
**Esperado**: título "Correct the grammar of this passage" y burbuja de usuario con lo que escribió el estudiante (la selección como contexto aparte).
**Observado**: título `Selected passage from my thesis: """ The second chapter comp` (ilegible en el historial del panel y en ai-chat: dos conversaciones de Grammar y Critique con el mismo título) y, al reabrir, la burbuja del usuario muestra `Selected passage from my thesis:\n"""\nThe second chapter compares…` en vez de su pregunta.
**Errores de consola o red**: ninguno.
**Captura**: `qa/assistant/t5_06_reopened_selection_conv.png`; `t4_notes.json` ("API conversations").

### H6 · Los desplegables de proveedor e historial no se cierran con Escape ni con clic fuera, y pueden abrirse a la vez
**Severidad**: media
**Dónde**: `AssistantPanel.tsx` (`providerOpen`, `historyOpen`: solo se alternan con el propio botón).
**Pasos**: Clic en el chip de proveedor → Escape; o clic en el área de texto del compositor. Repetir con el icono del reloj. Después abrir chip y reloj seguidos.
**Esperado**: Escape y clic fuera cierran el menú; abrir uno cierra el otro.
**Observado**: tras Escape `aria-expanded="true"` y el menú sigue abierto; el clic fuera tampoco lo cierra (solo el chip). Los dos menús se superponen (captura).
**Errores de consola o red**: ninguno.
**Captura**: `qa/assistant/t5_02_both_dropdowns.png`.

### H7 · Línea de ayuda de "Paraphrase" con doble puntuación
**Severidad**: baja
**Dónde**: `AssistantPanel.tsx` (conversación vacía: `` `${modeDescription…}.` `` añade un punto a una descripción que ya termina en "?").
**Pasos**: Change mode → Paraphrase, sin mensajes.
**Esperado**: "Paraphrase — is this too close to the source?"
**Observado**: "Paraphrase — is this too close to the source?." (EN; en ES/FR la descripción no termina en "?" y no se ve).
**Errores de consola o red**: ninguno.
**Captura**: `qa/assistant/t2_paraphrase_check_a_empty.png`.

### H8 · Cerrar el panel en pleno streaming descarta la vista de la conversación y vuelve al modo por defecto
**Severidad**: baja
**Dónde**: `DocsEditor.tsx` (`sidebar === "ai"` desmonta `AssistantPanel`; no se conserva modo ni `conversationId`).
**Pasos**: Modo Ask, enviar un mensaje, pulsar "AI assistant" en la cabecera mientras la respuesta se escribe, volver a pulsar.
**Esperado**: al reabrir, la conversación en curso (o al menos el modo) se mantiene; la respuesta interrumpida queda clara.
**Observado**: el panel vuelve vacío y en "Research copilot"; la conversación de Ask solo se recupera desde el historial (los mensajes sí están guardados en el servidor). Sin errores.
**Errores de consola o red**: ninguno.
**Captura**: ninguna (notas en `t5_notes.json`, "panel closed mid-stream").

### H9 · Error crudo del proveedor mostrado al estudiante (observado de forma incidental)
**Severidad**: media (no reproducible en modo demo puro; hace falta un modelo institucional con clave inválida)
**Dónde**: `AssistantPanel.tsx` → `onError` muestra `e.message` tal cual.
**Pasos**: Durante la sesión otro probador añadió en Admin → AI access un modelo "QA Claude …" con clave inválida para Stanford; el panel lo eligió por defecto (chip "QA Claude 1791529612861 · tu universidad"). Enviar cualquier mensaje.
**Esperado**: un mensaje comprensible ("el modelo de tu universidad no responde, avisa a…") y sin cobrar.
**Observado**: en la burbuja aparece el texto `401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-…` (JSON del proveedor) con la insignia "pagado por la universidad"; sin acciones. No se registró interacción (texto vacío). Además, con un modelo institucional "listo", desaparece la opción "Auto" y el estudiante no tiene alternativa en el selector.
**Errores de consola o red**: ninguno en el navegador (el 401 lo devuelve el proveedor al servidor).
**Captura**: ninguna (el modelo fue retirado antes de poder repetir; texto en la salida de `t6_lang.mjs`, segunda ejecución).

## Lo que funcionó

- Registro propio, creación de tesis desde la UI, modal de consentimiento y sesión de monitorización.
- Panel: abrir/cerrar, arrastre del borde con límites 320 px – 60 % del ancho, persistencia en `localStorage` tras recargar, doble clic = 400 px. Sheet móvil con X, Escape y toque en el fondo; sin scroll horizontal.
- Los 11 modos con icono, línea de ayuda, 3–4 sugerencias propias, placeholder por modo, streaming con cursor y botón Stop, etiqueta "Demo assistant · <modo> · logged · demo". Acciones por modo: copilot / Critique / Find gaps / Paraphrase → Guiding questions, Add as comment, Copy; Ask → Add as comment, Copy; Brainstorm / Summarize / Explain / Citations → Insert, Keep as notes, Copy; Outline → + Dismiss; Grammar → Insert (o Replace selection con selección), Copy, Dismiss. Los mensajes bloqueados solo ofrecen Copy.
- Tarjeta de coste con palabras, % antes/después, límite y pagador en las tres lenguas; cancelar no inserta; marca `prov-ai` morada con `data-provider` y `data-interaction`; toast; píldora e Integrity ledger actualizados; límite respetado para Insert, Replace y Notes una vez superado; forzar el clic no inserta.
- Bloqueo por política en EN y ES, registrado con `blockedByPolicy`, burbuja ámbar, la UI sigue funcionando después.
- "Ask AI" desde el bubble menu, tarjeta "Working on · N words", `selection` en la petición, X limpia la selección y vuelve a activarse con una nueva.
- Historial filtrado por modo, "+" y nueva conversación al cambiar de modo, reabrir, continuar, borrar; `/dashboard/ai-chat` agrupado por modo (copilot primero), `?mode=`, `?conversation=`, selector de tesis, versión móvil.
- Selector de proveedor: bloque de cupo completo (interacciones restantes, %, barra, fecha de reinicio, coste por interacción, qué pasa al agotarse), modelos y cuentas marcados "Not available", enlace a Conexiones.
- "Use my sources" con y sin fuentes, insignias de pasajes y respuesta demo fundamentada.
- Casos límite: vacío, espacios, Shift+Enter, 5 000 caracteres, doble envío, envío durante streaming, Stop, cambio de pestaña del documento en streaming.
- EN/ES/FR: sin claves sin traducir en panel, desplegables, tarjeta de coste, bubble menu, sheet móvil y ai-chat; cambio en vivo desde el selector de idioma.
