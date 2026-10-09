# QA verify-a: resultados (servidor localhost:3050, build fresco)

Capturas y scripts: `/tmp/claude-0/-home-user-thesisfy-mvp/4306acd1-1b1f-512f-8e05-a9c07969fd69/scratchpad/qa/verify-a/` (prefijo = id del item).

| Item | Resultado | Evidencia |
|---|---|---|
| A1 | PASS | `/login?next=//evil.example.com` + login jane -> `http://localhost:3050/dashboard`. Con `next=https://evil.example.com` tambien -> `/dashboard`. Con `/%5Cevil.example.com` se queda en localhost (ruta del propio sitio). |
| A2 | **FAIL** | Movil 390x844, titulo de 80-82 caracteres: la tarjeta mide 840 px (l=16, r=856), anillo en x=779-835 y papelera en x=795-819: ambos fuera del viewport; el texto sale cortado a la derecha. Con descripcion de una palabra larga sin espacios, 2008 px. `A2-list.png`, `A2-list-normal.png`. Ver detalle. |
| A3 | PASS | Contexto `America/Los_Angeles`, deadline `2027-06-01`: la lista muestra "Due 1 Jun 2027"; API guarda `2027-06-01T12:00:00.000Z`. |
| A4 | PASS | Clave falsa de 20 caracteres, Claude. EN: "Claude did not accept this key. Check it in your provider account and try again." ES: "Claude no ha aceptado esta clave. Compruebala en tu cuenta del proveedor e intentalo de nuevo." FR: "Claude n'a pas accepté cette clé. Vérifiez-la dans votre compte chez le fournisseur et réessayez." (la API devuelve 422 `key_invalid`; ese 422 en consola es esperado). `A4-en/es/fr.png`. |
| A5 | PASS | `/es/register`: email duplicado -> "Ya existe una cuenta con este email." Password de 6 caracteres: input `minLength=8`, `validity.tooShort=true`, el submit no se envia. `POST /api/auth/register` con 6 caracteres -> 400 `{"error":"Password must be at least 8 characters","code":"password_short"}`. |
| A6 | PASS | Movil, menu cerrado, 17 Tab seguidos: Open menu, logo, Notifications, avatar, banner de consentimiento, contenido del dashboard (New thesis, Research copilot, ...), y luego la barra inferior (Dashboard, My Theses, Copilot, Databases, Settings; `inAside=false`). Ningun enlace del sidebar (`aside`, que tiene `inert`) recibe foco. |
| A7 | PASS | Campana abierta (cabecera "Notifications" visible); tras Escape el panel desaparece del DOM. |
| A8 | PASS | Settings -> Withdraw: `window.confirm` "Withdraw your consent? Monitoring stops and the assistant pauses until you choose again."; al descartarlo el consentimiento sigue (`GET /api/monitor/consent` -> consent presente); al aceptar se retira. |
| A9 | PASS | Cuenta nueva (Vera Verify) -> h1 "Welcome, Vera." |
| A10 | PASS | Clic en "Sign in with Claude (soon)" -> `/dashboard/connections?oauth=unavailable&provider=anthropic`; el aviso dice "Sign-in with Claude is not available yet: this provider has not opened account sign-in to third-party apps. Use an API key from your account instead." |
| A11 | PASS | Movil, jane y cuenta nueva: tarjeta "Provided by your university" scrollWidth 356 = clientWidth 356; ningun descendiente supera el borde derecho de la tarjeta; sin scroll horizontal (docSW 390). `A11-jane.png`. |
| B1 | PASS | Jane: `/admin`, `/admin/theses`, `/admin/policies`, `/admin/ai-access`, `/admin/report` -> `/dashboard`. `GET /api/stats` 403, `GET /api/ai/access` 403. **Pero ver hallazgo extra E1.** |
| B2 | PASS | Admin crea profesor (201, `temporaryPassword`), login OK (Stanford, role professor). `GET /api/flags` del nuevo profesor: `{"flags":[]}`. `PATCH /api/flags/flag_2` (thesis_3, Sorbonne, id obtenido via marie) `{note:"x"}` -> 403 `{"error":"Forbidden"}`. Tambien 403 con admin de Stanford. |
| B3 | PASS | `/es` (html lang es) -> clic en EN -> URL `/en`, h1 en ingles; luego `/login` -> "Welcome back", `html lang="en"`, cookie `locale=en`. |
| B4 | PASS | Profesor, thesis_2: API 5% IA, integridad 100, 40 palabras. Tarjeta Provenance report: 95% escrito (38 w), 0% pegado, 5% IA (2 w) limite 25%; anillo 100%; fila de lista 100% / 5% / 40; pill del editor "AI 5% of 25% · Integrity 100"; barra "40 of 15,000 words". Nada por encima del limite. `B4-thesis2.png`, `B4-editor.png`. |
| B5 | PASS | Admin: sidebar incluye "Pilot requests"; `/admin/pilot-requests` lista "QA Verify University, pilot.qa@verify.edu, Integrity office" (enviada desde la landing). Profesor: sin item en el nav; `/admin/pilot-requests` muestra "No pilot request yet" (sin crash, sin errores de consola). |
| B6 | PASS | Profesor `/admin/theses/does-not-exist`: "This thesis does not exist or you cannot access it. Check the link, or open the list of theses." con enlace "Back". |
| B7 | PASS | Email `a@b` (valido para HTML5, llega al servidor, 400): `/es#pilot` -> "Introduce un correo de trabajo válido."; `/fr#pilot` -> "Saisissez une adresse e-mail professionnelle valide." |
| B8 | PASS | Estudiante registrada en `/es/register` (language `es`), tesis creada, profesor (EN) comenta desde `/admin/theses/<id>/document` (UI, boton Comment). `GET /api/notifications` del estudiante y la campana: titulo "Nuevo comentario". Barra inferior movil del profesor en EN: Overview / All Theses / Students / **Notices** (no "Flags"). Ver observacion O2. |
| B9 | PASS | Profesor en `/admin/theses/thesis_1/document`: menu `More options` -> File: Open (My theses), Rename, Save now, Save named version, Version history, Submit for review, Download, Print, Page setup, Document details. Sin "New thesis" y sin "Share with advisor…" (jane si los tiene). Ver observacion O3. |
| B10 | PASS | Admin: Add model (Anthropic, `sk-ant-fake-key-for-qa-12345`, etiqueta "QA Fake Claude") -> Save without testing -> aparece "Ready" (clave aun sin probar) -> Test -> badge "Last error" y `ready:false`, `lastError` "401 ... invalid x-api-key". Estudiante (jane): el picker (`Choose AI provider`) lista "QA Fake Claude | Not available" (deshabilitado) y `/api/ai/providers` da `ready:false`. Al desactivarlo (toggle): badge "Disabled" y desaparece de la lista del estudiante. Modelo borrado al terminar. Ver observacion O4. |
| B11 | PASS | `/questionnaire` -> `document.documentElement.lang === "fr"`. `/equipe/resultats` anonimo -> `/equipe?next=/equipe/resultats`; tras login con `equipe-test` -> `/equipe/resultats` renderiza "Résultats du questionnaire". |
| B12 | PASS | Landing anonima: `GET /api/auth/me` -> 200 `{"user":null}`; sin errores de consola ni respuestas >= 400. |

## Detalle de FAIL

### A2 - La tarjeta de tesis desborda en movil
- Pasos: cuenta nueva en 390x844 (isMobile), crear tesis con titulo de 80 caracteres ("Longitudinal analysis ... higher educ") y descripcion larga con espacios (y, aparte, una con palabra larga sin espacios); abrir `/dashboard/theses`.
- Observado: `.card` ancho 840 px (r=856 > 390), `h3` 730 px (el titulo no se trunca), `ScoreRing` x=779-835 y boton Delete (`aria-label="Delete"`) x=795-819, fuera de pantalla; `main` tiene `overflow-x-hidden`, asi que no hay scroll y los controles son inalcanzables. Con la palabra larga sin espacios la tarjeta llega a 2008 px. `document.documentElement.scrollWidth` sigue en 390 (oculto por `overflow-x-hidden`).
- Causa (cadena de ancestros medida): `DIV.grid.gap-4` (width 358) con pista implicita `auto` -> el min-content de la tarjeta (titulo `truncate` = nowrap) ensancha la pista; la `.card` tiene `min-width:auto`. Solucion probable: `grid-cols-1` / `grid-cols-[minmax(0,1fr)]` en el grid o `min-w-0` en la tarjeta.
- Errores de consola: ninguno. Capturas: `A2-list.png`, `A2-list-normal.png`, `A2-modal.png`.
- Nota: en desktop no se probo; el boton de borrar si abre el dialogo ("Delete thesis? ...") cuando se hace clic por script en la tarjeta mal dimensionada (`A2-delete-dialog.png`), pero un usuario movil no puede verlo.

## Hallazgos extra (no estaban en la lista)

### E1 (alta) - `/api/stats` ahora 403 para estudiantes rompe el dashboard y analytics del estudiante
- Tras B1 (`requireStaff` en `src/app/api/stats/route.ts`, commit f828ed6), `GET /api/stats` devuelve 403 al estudiante, pero `src/app/dashboard/page.tsx` (linea ~50) hace `Promise.all([/api/theses, /api/stats])` y `src/app/dashboard/analytics/page.tsx` pide `/api/stats`.
- Observado como jane (que tiene 2 tesis, `GET /api/theses` las devuelve): `/dashboard` muestra "Total words 0", "Integrity score –%", "No theses yet. Start your first one."; `/dashboard/analytics` muestra Total words 0, Integrity 0%. Consola: `HTTP 403 GET http://localhost:3050/api/stats` + "Failed to load resource: ... 403 (Forbidden)" en cada carga (tambien en cuentas nuevas). Capturas: `EXTRA-jane-dashboard-stats403.png`, `EXTRA-jane-analytics.png`.
- La ruta ya contiene ramas `user.role === "student"`, asi que el `requireStaff` es probablemente el error: el item B1 pide 403 para jane en `/api/stats`, lo que choca con que el dashboard del estudiante dependa de ese endpoint. Hay que decidir: o `/api/stats` vuelve a aceptar estudiantes (solo sus datos) y B1 se limita a las paginas `/admin/*` y `/api/ai/access`, o el dashboard debe dejar de usar `/api/stats` y no depender de el en `Promise.all`.

## Observaciones menores
- O1: B1/B2 etc. no mostraron errores de consola salvo los 4xx esperados (400 register/leads, 422 key_invalid, 403 stats).
- O2: Un usuario con `preferences.language = "es"` que entra desde un navegador nuevo (sin cookie `locale`) ve la UI en ingles tras login (cookie vacia, `html lang="en"`); el titulo de la notificacion si sale en espanol. No era parte del item.
- O3: En modo revision, el profesor sigue viendo en File: Rename, Save now, Save named version, Submit for review, y el boton de cabecera "Share" abre un dialogo con texto de estudiante ("Your advisor sees your document... Reviewers cannot edit your text"). No pedido en B9; posible incoherencia.
- O4: En `/admin/ai-access`, un modelo con error muestra dos badges "Last error" seguidos (uno warning y otro danger, `ai-access/page.tsx` lineas 223-224). Ademas "Save without testing" deja el modelo como "Ready" hasta pulsar Test, de modo que un estudiante podria elegirlo con una clave sin verificar.
- O5: En A6 la barra inferior movil (Dashboard, My Theses, Copilot, Databases, Settings) recibe foco, lo cual es correcto (no es el sidebar).

## Datos de prueba creados en el servidor
Cuentas `qa.verify.a@example.edu` (Passw0rd!x), `qa.verify.es72843@example.edu`, profesor `qa.prof1791543761746@stanford.edu`; una solicitud de piloto "QA Verify University"; tesis de prueba de esas cuentas; modelo "QA Fake Claude" ya borrado.
