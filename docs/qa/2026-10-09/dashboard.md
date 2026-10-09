# QA — Panel del estudiante y flujos de cuenta (Thesisfic.edu)

Build de producción en `http://localhost:3050`, almacén en memoria, IA en modo demo (esperado). Pruebas con Playwright (Chromium) en escritorio 1280×900 y móvil 390×844. Cuentas propias creadas vía `/register` (`qa.dash3.*`, `qa.home`, `qa.settings`, `qa.conn`, `qa.chat`, `qa.misc@example.edu`) y la cuenta demo `jane.cooper@stanford.edu` para datos con historial. Scripts y capturas en `scratchpad/qa/dashboard/` (`t1_auth.mjs` … `t7_scroll.mjs`, logs `*.log.json`).

## Resumen

| Área | Probado | Estado |
|---|---|---|
| `/register` | validación nativa (vacío, contraseña <6), "Otra" universidad, alta correcta, email duplicado, EN/ES/FR | OK con 1 hallazgo (error duplicado sin traducir) |
| `/login` | campos vacíos, contraseña incorrecta, botones demo, `next=`, redirección anónima, EN/ES/FR | 1 hallazgo (open redirect con `next=//host`) |
| Cerrar sesión | sidebar escritorio y móvil, re-visita `/dashboard` | OK |
| `/dashboard` (inicio) | tarjetas, 7 enlaces de acciones rápidas, banner de consentimiento, avatar, campana, sidebar plegable, nav inferior móvil | OK con 2 hallazgos menores (copy "Welcome back" en cuenta nueva; desplegable no cierra con Esc) |
| `/dashboard/theses` | crear con todos los campos, `?new=1`, vacío/espacios, target 0, borrar con confirmación, Esc, tap fuera | 2 hallazgos (tarjeta desbordada en móvil; fecha límite desplazada por zona horaria) |
| `/dashboard/settings` | nombre, idioma (guardar + recargar), contraseña (actual errónea, corta, cambio real), consentimiento (aceptar/declinar/actualizar/retirar/historial/recibo), exportar datos, instalación móvil | OK con 2 hallazgos menores (sin confirmación al retirar; mínimo 6 vs 8 caracteres). No existen controles de fuente/zoom del editor ni proveedor por defecto en esta página |
| `/dashboard/connections` | alta con clave falsa en Claude/OpenAI/Gemini, "Sign in with", `?oauth=error`, EN/ES/FR | 1 hallazgo (error crudo del proveedor, sin traducir) |
| Notificaciones | campana, lista con datos (Jane), marcar todo leído, persistencia, enlace de cada aviso | OK (`/dashboard/notifications` no existe como página: 404; viven en la campana) |
| `/dashboard/ai-chat` | modal de consentimiento, envío sin consentimiento, rejilla de 11 modos, mensajes en Copilot/Critique/Outline, historial agrupado por modo, nueva conversación, abrir, borrar, `?mode=`, `?conversation=`, selector de proveedor, EN/ES/FR | OK (borrado de conversación sin confirmación: menor) |
| `/dashboard/library` | listado, búsqueda, filtros por materia, "How to access", enlaces externos, EN/ES/FR | OK. Es un directorio de bases de datos: aquí no se añaden fuentes por DOI/URL (eso vive en el editor) |
| `/dashboard/analytics` | con y sin datos, NaN, desbordamiento, EN/ES/FR | OK |
| Selector de idioma | inline (login/register), select del sidebar, `?lang=`, persistencia en `preferences.language`, claves crudas `dashboard.xxx`, `{var}` sin interpolar | OK: 0 claves crudas y 0 variables sin interpolar en todas las páginas |
| Accesibilidad por teclado | foco visible (outline), Esc en modales, orden de tabulación | 2 hallazgos (sidebar oculto en móvil recibe el foco; desplegable de notificaciones ignora Esc) |

## Hallazgos

### 1. Open redirect en `/login?next=//host`
**Severidad:** alta
**Dónde:** `/login?next=//evil.example.com` (escritorio y móvil)
**Pasos:** abrir esa URL, iniciar sesión con credenciales válidas.
**Esperado:** solo se aceptan rutas internas; el usuario acaba en `/dashboard`.
**Observado:** `router.push(next)` acepta cualquier cadena que empiece por `/`, incluida la forma protocol-relative `//evil.example.com`; el navegador navega al dominio externo (en el sandbox: `chrome-error://chromewebdata/`, con `GET http://evil.example.com/ net::ERR_NAME_NOT_RESOLVED`). Un enlace de phishing con `?next=//sitio-falso` llevaría al estudiante, ya autenticado, fuera de Thesisfic. Causa: `src/app/login/page.tsx` → `if (next && next.startsWith("/"))`.
**Errores de consola o red:** `requestfailed GET http://evil.example.com/ net::ERR_NAME_NOT_RESOLVED`
**Captura:** n/a (navegación externa); log en `t1_auth.log.json`.

### 2. En móvil la tarjeta de tesis desborda: el anillo de integridad y el botón "Delete" quedan fuera de pantalla
**Severidad:** alta
**Dónde:** `/dashboard/theses`, móvil 390×844
**Pasos:** con una tesis cuyo título o descripción ocupen más de una línea, abrir "My Theses" en móvil.
**Esperado:** la tarjeta ocupa el ancho de la pantalla; título truncado, metadatos en varias líneas, anillo y papelera visibles.
**Observado:** la tarjeta mide 1134 px de ancho en un viewport de 390 px (`card.scrollWidth=1134`, `cardRight=1152`); la papelera está en x=1091 y el anillo en x=1075. `main` es `overflow-x: hidden`, así que no hay desplazamiento horizontal con el dedo (`mainScrollLeft=0` tras gesto): el estudiante no puede borrar una tesis ni ver su puntuación desde el móvil, y la descripción/metadatos se cortan. Causa: `h3` con `truncate` dentro de un `flex-1 min-w-0` que no se propaga (`.flex.items-start.justify-between` sin `min-w-0` y el `<p class="line-clamp-2">` con texto sin espacios de corte). Ocurre con títulos normales de 60–80 caracteres, no solo con el extremo.
**Errores de consola o red:** ninguno
**Captura:** `mobile_theses_list.png`, `m_theses_touch.png`

### 3. La fecha límite se guarda un día antes en zonas horarias con desfase negativo
**Severidad:** media
**Dónde:** `/dashboard/theses` → "New thesis" → campo Deadline (cualquier viewport, navegador en `America/Los_Angeles`)
**Pasos:** crear una tesis con Deadline `2027-06-01`.
**Esperado:** la lista muestra "Due 1 Jun 2027".
**Observado:** la lista muestra **"Due 31 May 2027"**. El cliente envía `new Date("2027-06-01").toISOString()` = `2027-06-01T00:00:00.000Z` (medianoche UTC) y `format.date()` lo vuelve a mostrar en hora local, retrocediendo un día. Afecta a cualquier estudiante en América.
**Errores de consola o red:** ninguno
**Captura:** `tz_theses.png`

### 4. Error de clave de API mostrado como JSON crudo del proveedor y sin traducir
**Severidad:** media
**Dónde:** `/dashboard/connections` → "Connect with API key" (Claude), escritorio y móvil, también con UI en ES/FR
**Pasos:** pegar una clave inválida de ≥12 caracteres y pulsar Connect.
**Esperado:** mensaje corto y traducido ("La clave no es válida para Anthropic").
**Observado:** `Could not validate the key with Anthropic: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":null}`. OpenAI y Gemini devuelven frases legibles pero igualmente en inglés aunque la UI esté en español/francés. El mensaje sale de `src/app/api/ai/connections/route.ts` (`error(\`Could not validate…: ${test.error}\`, 422)`), que el cliente pinta tal cual.
**Errores de consola o red:** `POST /api/ai/connections → 422` (esperado) y `console.error Failed to load resource: 422`
**Captura:** `desktop_connect_error.png`, `mobile_connect_error.png`

### 5. En móvil el sidebar oculto sigue en el orden de tabulación
**Severidad:** media (accesibilidad)
**Dónde:** cualquier página de `/dashboard/*`, móvil 390×844, con el menú cerrado
**Pasos:** pulsar Tab repetidamente desde el inicio de la página.
**Esperado:** el foco salta de la cabecera (menú, campana, avatar) al contenido principal.
**Observado:** orden real: `Thesisfic.edu (aside) > Close menu > Dashboard > My Theses > Research copilot > Research databases > Analytics > AI Connections > Settings & Privacy > Language > Sign out > Open menu > …`. Los 11 primeros elementos están en el `aside` desplazado con `-translate-x-full`, invisibles pero focalizables; un usuario de teclado o lector de pantalla recorre un menú que no ve. Falta `inert`/`aria-hidden` + `tabindex=-1` cuando está cerrado.
**Errores de consola o red:** ninguno
**Captura:** `mobile_settings_focus.png` (foco fuera de pantalla)

### 6. Mensajes de error del registro sin traducir
**Severidad:** baja
**Dónde:** `/register` con UI en ES o FR (ambos viewports)
**Pasos:** cambiar a ES, registrar un email ya existente.
**Esperado:** "Ya existe una cuenta con este email".
**Observado:** "An account with this email already exists" (texto literal del servidor, `src/lib/auth.ts`). Igual pasaría con "All fields are required". El placeholder del email `you@university.edu` tampoco se traduce.
**Errores de consola o red:** `POST /api/auth/register → 400` (esperado)
**Captura:** `desktop_register_duplicate_es.png`, `mobile_register_duplicate_es.png`

### 7. El desplegable de notificaciones no se cierra con Escape
**Severidad:** baja (accesibilidad)
**Dónde:** cabecera de `/dashboard/*` (ambos viewports)
**Pasos:** pulsar la campana, pulsar Esc.
**Esperado:** el panel se cierra (como hacen los modales).
**Observado:** sigue abierto (`count=1` tras Esc); solo cierra con clic fuera. `DashboardLayout.tsx` solo escucha `mousedown`.
**Captura:** `desktop_notifications_open.png`

### 8. Retirar el consentimiento no pide confirmación ni avisa antes de la consecuencia
**Severidad:** baja
**Dónde:** `/dashboard/settings` → Monitoring & consent → "Withdraw"
**Pasos:** con consentimiento activo pulsar "Withdraw".
**Esperado:** según la regla de copy (toda acción con consecuencia muestra una frase antes del botón), un diálogo o una frase previa: "El asistente queda en pausa y el editor monitorizado deja de estar disponible".
**Observado:** se retira al instante; la consecuencia ("Monitoring stopped and the assistant is paused until you choose again") aparece solo en el toast posterior. Borrar una conversación del historial del chat tampoco confirma (fila desaparece al pulsar la papelera, `rows=0`).
**Captura:** `desktop_consent_withdrawn.png`

### 9. Longitud mínima de contraseña inconsistente
**Severidad:** baja
**Dónde:** `/register` (mín. 6) vs `/dashboard/settings#password` (mín. 8)
**Observado:** se puede crear la cuenta con `qa-pas` (6) pero el cambio de contraseña exige 8 ("The password needs at least 8 characters"). El placeholder del registro dice "Password (min. 6 characters)".
**Captura:** `desktop_pw_wrong.png`

### 10. Copy: cuenta recién creada recibe "Welcome back, QA."
**Severidad:** baja
**Dónde:** `/dashboard` inmediatamente tras `/register` (ambos viewports; ES "Hola de nuevo" equivalente)
**Observado:** el saludo asume retorno aunque sea la primera visita. Además "Integrity score 0%" en verde para una cuenta sin texto.
**Captura:** `mobile_after_register.png`

### 11. Toast de OAuth usa el id interno del proveedor
**Severidad:** baja
**Dónde:** `/dashboard/connections` → "Sign in with Claude (soon)"
**Observado:** redirige a `?oauth=unavailable&provider=anthropic` y el toast dice "Sign-in with **anthropic** is not available yet…" (id en minúsculas en vez de "Claude"/"Anthropic"). El botón se muestra activo aunque esté marcado "(soon)".
**Captura:** `desktop_oauth_result.png`

### 12. Tarjetas de modelos institucionales se cortan en móvil
**Severidad:** baja
**Dónde:** `/dashboard/connections`, móvil, bloque "Provided by your university"
**Observado:** la rejilla `sm:grid-cols-2` con `truncate` no limita el ancho: "GPT-4.1 (Azure) · Azure OpenAI (Microsoft) · US (East US 2) · not configu…" sobresale del card.
**Captura:** `mobile_connections.png`

## Observaciones (no son defectos)
- `/dashboard/notifications` → 404: no existe página; las notificaciones viven en la campana de la cabecera. `/dashboard/library` es el directorio de bases de datos de la universidad, no el gestor de fuentes (DOI/URL/texto), que está en el editor.
- En Settings no hay controles de fuente/zoom del editor ni de proveedor por defecto, aunque `preferences.editorFont/editorZoom/defaultProvider` existen en el modelo; el proveedor por defecto se cambia desde Connections ("Make default", solo con una conexión activa).
- Usuario anónimo en `/dashboard/*` va a `/` (landing) por diseño del middleware; se pierde el deep link (no hay `?next=`).
- Cada página pública (`/login`, `/register`) lanza `GET /api/auth/me → 401` y un `console.error` "Failed to load resource" (ruido, sin efecto).
- Target words = 0 en el formulario se ignora silenciosamente y se guarda 20 000.
- "Research Copilot" (mayúscula) en Analytics frente a "Research copilot" en el resto.
- Formato numérico en ES: "2847 / 20.000 palabras" (Intl no agrupa los números de 4 cifras en `es-ES`, sí los de 5); cosmético pero visible en cada tarjeta (`jane_desktop_es__dashboard_theses.png`).
- Los títulos y cuerpos de las notificaciones ("New comment", "Deadline Reminder", "Integrity Score Updated"…) llegan en inglés con la UI en ES/FR: son contenido almacenado al generarse, no cadenas de UI; el cuarto aviso enlaza a `#`.

## Lo que funcionó correctamente
- Registro: validación nativa de campos vacíos y contraseña corta, campo "Other university", cookie de sesión y redirección a `/dashboard`; duplicado rechazado.
- Login: campos vacíos bloqueados por el navegador, credenciales incorrectas con mensaje traducido, botones demo rellenan credenciales, `?next=/dashboard/settings` respetado, `role` admin/profesor → `/admin`.
- Logout limpia cookie y `localStorage`; volver a `/dashboard` no entra.
- Inicio: los 7 enlaces de acciones rápidas, banner de consentimiento, avatar → Settings, "View all", `#mobile` hace scroll a la sección; sidebar plegable persistido en `localStorage`; nav inferior móvil con 5 destinos; sin NaN/undefined con y sin datos.
- Tesis: `?new=1` abre el diálogo, autofoco en el título, Create deshabilitado con título vacío o espacios, todos los campos (descripción con `<b>` escapada, fecha, target, estilo de cita IEEE) persisten vía API, redirección al editor, borrado con diálogo de confirmación cuyo texto nombra la tesis, Esc y tap fuera cierran.
- Settings: nombre e idioma persisten tras recargar y en `preferences.language`; el select del sidebar y `?lang=` también persisten; nombre vacío no se guarda; cambio de contraseña real (la antigua devuelve 401, la nueva 200), campos vaciados, errores de contraseña actual/corta; consentimiento: "AI interactions" bloqueado como requerido, los otros 3 conmutables, "Not now"/Esc no guardan, aceptar/actualizar actualizan badges, historial y versión, recibo JSON descargable, retirada efectiva; exportación JSON sin hash de contraseña.
- Connections: Connect deshabilitado hasta 12 caracteres, estado "Validating…", clave no se guarda si falla (`connections: []`), error se limpia al reabrir, `?oauth=error&message=` muestra toast, textos ES/FR completos.
- AI chat: el modal de consentimiento aparece al entrar sin consentimiento; enviar sin aceptar responde "Please review and accept the monitoring consent…" y reabre el modal; 11 modos visibles sin scroll horizontal (rejilla 358 px en móvil); respuestas en Copilot, Critique y Outline con etiqueta "demo" y aviso de modo demo; historial agrupado por modo (COPILOT/OUTLINE/CRITIQUE), nueva conversación limpia el panel, abrir conversación y `?conversation=` restauran, `?mode=outline` fija el modo, historial en móvil vía botón del panel.
- Library: 8 bases de datos, búsqueda y filtros por materia, "How to access" despliega instrucciones, enlaces en nueva pestaña con `rel=noopener`, bloque de ayuda.
- i18n: 0 claves crudas y 0 `{variables}` sin interpolar en todas las páginas, diálogos (nueva tesis, borrar, consentimiento, conectar clave) y desplegable de notificaciones en ES y FR; sin desbordamiento horizontal del documento.
- Teclado: foco visible (outline nativo) en enlaces y botones, ring en selects; Esc cierra modales de tesis, borrado, consentimiento y conexión.
