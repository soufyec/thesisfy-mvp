# QA — Tutor, administración, landing y cuestionario público

Servidor: `http://localhost:3050` (build de producción, almacén en memoria, modo DEMO de IA, `TEAM_PASSWORD` sin configurar). Herramienta: Playwright/Chromium, escritorio 1280×900 y móvil 390×844. Cuentas: `prof.williams@stanford.edu` / `demo123`, `admin@stanford.edu` / `admin123`; para comprobaciones del lado del estudiante `jane.cooper@stanford.edu` (solo lectura: no se tocó el contenido de `thesis_1`; los comentarios de prueba se añadieron en `thesis_2`).

Scripts y registros: `scratchpad/qa/admin/*.mjs`, `*.log`; capturas en `scratchpad/qa/admin/shots/`. Ningún `pageerror` en ninguna ejecución; los únicos errores de consola son `Failed to load resource` de respuestas 4xx esperadas en pruebas negativas (401 sin sesión, 400 de validación, 404 de ids inexistentes, 503 de `/api/equipe/login`).

## Resumen

| Área | Probado | Estado |
|---|---|---|
| Landing `/`, `/es`, `/fr` (escritorio y móvil) | Nav, CTA, enlaces de pie, menú móvil, selector de idioma, teclado, animación «properly» sin scroll horizontal, formulario de piloto (validación + envío + llegada al admin) | OK con 2 incidencias (cookie de idioma en URL con prefijo; error de servidor sin traducir) |
| Tutor `/admin` | Panel, lista de tesis, detalle de cada tesis (procedencia, sesiones, registro IA, comentarios), decisión de revisión, documento en modo revisión (comentar, responder, historial de versiones), avisos (filtros, resolver), estudiantes (alta manual), políticas (solo lectura), biblioteca, informe (periodos, CSV, DOCX, imprimir), notificaciones, barra lateral, cierre de sesión, móvil | OK con incidencias (cifras contradictorias en `thesis_2`, id inexistente, menú File en modo revisión) |
| Administración | Políticas (límite, modos, copilot, bloqueo, consentimiento → verificado en el estudiante), rúbrica, acceso a IA (añadir modelo con clave falsa, test, predeterminado, activar/desactivar, editar, eliminar, financiación → verificado en el selector del estudiante), invitaciones (estudiante y tutor, 14 días, copiar, aceptar, revocar, token inválido), alta manual con rol, enlace de restablecimiento (flujo completo, reutilización, token inválido), biblioteca (ajustes, alta, edición, borrado), solicitudes de piloto | OK con incidencias (sin vista de solicitudes de piloto; estado tras test fallido) |
| Control de acceso | Anónimo en `/dashboard`, `/admin`; 22 rutas API sin token; estudiante en 10 páginas `/admin/*` y 20 rutas API; tutor en API solo-admin; ids inexistentes; otra universidad | **2 incidencias altas** (estudiante entra en `/admin/*`; resolución de avisos sin comprobar acceso) |
| Cuestionario público | Ruta docente completa en modo entrevista (con software + demo), ruta estudiante en línea (móvil), pila de «Retour», borrador tras recarga, validación (obligatorias, 3 máx., e-mail), envío → confirmación, `/questionnaire` raíz, `/equipe`, API 422 y honeypot | OK con 1 incidencia menor (`lang` del documento). Parte de equipo no comprobable (`TEAM_PASSWORD` sin configurar; el mensaje de «no configurado» se muestra bien) |
| Idiomas ES/FR en admin (9 páginas × 2 idiomas) | Claves crudas, restos en inglés, formato de fechas/números | OK con incidencias (textos de avisos y notificaciones en inglés fijo; etiqueta «Flags») |
| `/api/health` | JSON | OK: `{"ok":true,"store":"memory","version":null,"users":25}` |

## Incidencias

### 1. Un estudiante puede abrir todas las páginas `/admin/*`

**Severidad**: alta
**Dónde**: `src/middleware.ts` (solo comprueba que exista la cookie), `DashboardLayout` y páginas `src/app/admin/**` (ninguna comprueba el rol); `GET /api/stats`, `GET /api/ai/access`.
**Pasos**: iniciar sesión como `jane.cooper@stanford.edu` y abrir `/admin`, `/admin/theses`, `/admin/theses/thesis_1`, `/admin/students`, `/admin/flags`, `/admin/policies`, `/admin/ai-access`, `/admin/library`, `/admin/report`, `/admin/theses/thesis_1/document`.
**Esperado**: redirección a `/dashboard` o 403; las API de administración devuelven 403.
**Observado**: las 10 páginas se renderizan dentro del layout del estudiante. `/admin` muestra «Institution dashboard» con «Students 16» y «Avg integrity» (recuento de toda la universidad: `GET /api/stats` responde 200 con `totalStudents: 16, totalProfessors: 3`); `/admin/policies` muestra la política completa; `/admin/ai-access` muestra la financiación de la universidad con los campos vacíos y los literales «Alert administrators at {pct}% of budget» y «costs about NaN–NaN USD» (`GET /api/ai/access` responde 200 a un estudiante). `GET /api/flags` y `GET /api/ai/logs` responden 200 (acotados a la propia estudiante). Solo `/api/users`, `/api/admin/report` y las escrituras devuelven 403.
**Errores de consola o red**: `Failed to load resource: the server responded with a status of 403 (Forbidden)` en `GET /api/users` y `GET /api/admin/report?from=2026-07-12&to=2026-10-09` (el resto responde 200).
**Captura**: `shots/student-on_admin.png`, `shots/student-on_admin_policies.png`, `shots/student-on_admin_ai-access.png`, `shots/student-on_admin_report.png`, `shots/student-on_admin_students.png`.

### 2. Cualquier tutor o administrador puede resolver avisos de tesis a las que no tiene acceso (incluida otra universidad)

**Severidad**: alta
**Dónde**: `PATCH /api/flags/[id]` (`src/app/api/flags/[id]/route.ts`): para `role !== "student"` resuelve sin pasar por `canAccessThesis`.
**Pasos**: como admin, `POST /api/users` `{name, email, role: "professor"}` (tutor de Stanford que no dirige ninguna tesis); iniciar sesión con la contraseña temporal; `GET /api/theses/thesis_3` (tesis de Marie Dupont, Sorbonne) → 404; `PATCH /api/flags/flag_2` `{note: "QA cross-check"}`.
**Esperado**: 403 o 404, igual que la lectura de la tesis.
**Observado**: `200 {"flag":{"id":"flag_2","thesisId":"thesis_3","type":"bulk_paste",…,"resolved":true}}`; además se envía a la estudiante la notificación «Flag resolved».
**Errores de consola o red**: ninguno (la llamada responde 200).
**Captura**: `access.log` líneas «second professor PATCH flag_2 (thesis_3, Sorbonne): 200».

### 3. El selector de idioma no persiste cuando la URL lleva prefijo `/es` o `/fr`

**Severidad**: media
**Dónde**: `LanguageSwitcher` + `setLocale` (`src/lib/i18n/client.tsx`, `router.refresh()`) y `src/middleware.ts` (reescribe la cookie a partir del prefijo en cada petición).
**Pasos**: abrir `/es`; pulsar «EN» en el selector; esperar; abrir `/login`.
**Esperado**: cookie `locale=en`; `/login` en inglés.
**Observado**: la portada cambia a inglés al instante, pero la cookie vuelve a `es` (el `router.refresh()` pide `/es?_rsc=…` y el middleware vuelve a fijar `locale=es`); `/login` y cualquier página posterior salen en español (`<html lang="es">`). Idéntico con `/fr` → EN. Desde `/` sin prefijo funciona.
**Errores de consola o red**: ninguno.
**Captura**: `shots/locale-after-es-login.png`, `shots/locale-after-fr-login.png`; `locale.mjs`.

### 4. `thesis_2`: la misma tesis muestra 5 % de IA en el informe de procedencia y 63 % en el resto

**Severidad**: media
**Dónde**: semilla de `thesis_2` en `src/lib/db.ts` (`wordCount: 0`, `aiUsagePercent: 5`, `integrityScore: 98`, `provenance: {human: 495, paste: 0, ai: 25}` para un contenido de 40 palabras) + `refreshThesisMetrics` (`src/lib/integrity.ts`, recalcula `ai / wordCount`) + `admin/theses/[id]/page.tsx` (calcula el porcentaje con los recuentos de `provenance`).
**Pasos**: como tutor, abrir `/admin/theses/thesis_2`; comparar con la lista `/admin/theses`, el panel y la cabecera de `/admin/theses/thesis_2/document`.
**Esperado**: un único porcentaje de IA y una única puntuación.
**Observado**: tarjeta «Provenance report»: 95 % / 0 % / 5 % («AI-assisted (25 words) · limit 25 %», en morado, dentro del límite). Anillo de integridad de la misma página: 70. Lista, panel y píldora del editor: «AI 63% of 25% · Integrity 70» (por encima del límite). `GET /api/theses/thesis_2` → `wordCount: 40, aiUsagePercent: 63, integrityScore: 70, provenance: {human: 495, paste: 0, ai: 25}`. Antes de la primera visita al detalle, el panel mostraba 98 % / 5 % (valores sembrados), de modo que las cifras cambian solo por abrir la página.
**Errores de consola o red**: ninguno.
**Captura**: `shots/prof-detail-thesis_2-numbers.png`, `shots/prof-mobile_admin_theses_thesis_2.png` (anillo 70 % junto a 5 %), `shots/prof-document.png` (píldora 63 %).

### 5. No existe ninguna vista de solicitudes de piloto para la administración

**Severidad**: media
**Dónde**: `GET /api/leads` existe (solo admin), pero ninguna página lo consume; `adminNav` no tiene entrada.
**Pasos**: enviar el formulario de piloto desde la landing; iniciar sesión como admin; recorrer el menú.
**Esperado**: lista de solicitudes (institución, correo, rol, mensaje, fecha).
**Observado**: solo llega una notificación «Pilot request — QA University (…) asked for a pilot.» en la campana (texto fijo en inglés, truncado); al marcar como leídas no hay forma de volver a verlas desde la interfaz. `GET /api/leads` devuelve las 12 solicitudes.
**Errores de consola o red**: ninguno.
**Captura**: `shots/admin-notifications-pilot.png`.

### 6. `/admin/theses/<id inexistente>` se queda en «Loading…» para siempre

**Severidad**: baja
**Dónde**: `src/app/admin/theses/[id]/page.tsx` (`.catch(() => {})` sin estado de error).
**Pasos**: como tutor, abrir `/admin/theses/does-not-exist`.
**Esperado**: mensaje «no encontrada» con enlace a la lista (como hace `/admin/theses/does-not-exist/document`, que muestra «Thesis not found · Back to dashboard»).
**Observado**: «Loading…» indefinido.
**Errores de consola o red**: `Failed to load resource: the server responded with a status of 404 (Not Found)` en `GET /api/theses/does-not-exist` y `GET /api/theses/does-not-exist/sessions`.
**Captura**: `shots/prof-thesis-invalid-id.png`.

### 7. Formulario de piloto: los errores del servidor llegan en inglés en `/es` y `/fr`

**Severidad**: baja
**Dónde**: `POST /api/leads` (`src/app/api/leads/route.ts`, mensajes literales) y `PilotForm.tsx` (`setError(data.error)`).
**Pasos**: en `/es#pilot` o `/fr#pilot`, institución «QA University», correo `a@b` (pasa la validación del navegador), enviar.
**Esperado**: mensaje en el idioma de la página.
**Observado**: «Enter a valid work email.» bajo el formulario en español y francés (lo mismo ocurriría con «Tell us which institution you are writing from.»).
**Errores de consola o red**: `POST http://localhost:3050/api/leads` → 400; consola `Failed to load resource: the server responded with a status of 400 (Bad Request)`.
**Captura**: `shots/landing-desktop-es-pilot-servererror.png`, `shots/landing-desktop-fr-pilot-servererror.png`.

### 8. Notificaciones y descripciones de avisos con texto fijo en inglés y con la palabra «flag»

**Severidad**: baja
**Dónde**: `db.notifications.create` en `api/flags/[id]`, `api/theses/[id]/comments`, `api/leads`, `api/users`, etc.; descripciones de avisos generadas al vuelo y guardadas en inglés.
**Pasos**: resolver un aviso como tutor y abrir las notificaciones de la estudiante; cambiar el admin a ES/FR y abrir `/admin/flags` y la campana.
**Esperado**: textos traducidos y vocabulario «Notice/Aviso/Avis» de cara al estudiante.
**Observado**: la estudiante recibe `{"title":"Flag resolved","message":"Prof. James Williams resolved a flag on \"L'impact de l'intelligence artificielle \"."}`; el tutor recibe «Student responded to a flag». Títulos fijos: «Flag resolved», «Student responded to a flag», «New comment», «Pilot request», «Thesis submitted for review», «Welcome to Thesisfic», «AI-use declaration signed». En `/es/admin/flags` y `/fr/admin/flags` las descripciones siguen en inglés: «Large text block pasted (384 words) without attribution.», «AI-assisted content is 25.1% of the document, above the 25% institutional limit.».
**Errores de consola o red**: ninguno.
**Captura**: `shots/i18n-es_admin_flags.png`, `shots/prof-notifications.png`.

### 9. Barra inferior móvil en inglés: «Flags» en vez de «Notices»

**Severidad**: baja
**Dónde**: `dashboard.nav.short.notices` = «Flags» en `src/lib/i18n/messages/dashboard.ts` (ES «Avisos», FR «Avis» son correctos).
**Pasos**: tutor en móvil, cualquier página `/admin`.
**Esperado**: «Notices» (glosario de la sección 3 de CLAUDE.md).
**Observado**: «Flags».
**Captura**: `shots/prof-mobile_admin_theses.png`.

### 10. Modo revisión del tutor: «New thesis» y «Share» con comportamiento de estudiante

**Severidad**: baja
**Dónde**: `MenuBar.tsx` (menú File) y diálogo de compartir en `DocsEditor.tsx` con `reviewMode`.
**Pasos**: tutor en `/admin/theses/thesis_2/document`; menú ⋯ → File → «New thesis»; botón «Share».
**Esperado**: opciones de estudiante ocultas o desactivadas; diálogo de compartir redactado para el tutor.
**Observado**: «New thesis» lleva al tutor a `/dashboard/theses?new=1` con el diálogo «New thesis · Create & open editor» (rutas de estudiante). «Share» muestra «Your advisor sees your document, your comments, the provenance report and your writing sessions…» al propio tutor. «Share with advisor…» y «Download» aparecen activos; «Rename», «Save now», «Save named version» y «Submit for review» sí están desactivados.
**Errores de consola o red**: ninguno.
**Captura**: `shots/prof-new-thesis.png`, `shots/prof-share-dialog.png`, `shots/prof-overflow-menu.png`.

### 11. Acceso a IA: estado del modelo tras un test fallido

**Severidad**: baja
**Dónde**: `src/app/admin/ai-access/page.tsx` (insignias `ready` / «Key missing») y `/api/ai/access/models/[id]` (POST test).
**Pasos**: «Add model» → Anthropic, clave `sk-ant-fake-key-for-qa` → «Test & add» (falla correctamente) → «Save without testing» → «Test» en la tarjeta → «Default».
**Esperado**: tras el fallo, el modelo no debería mostrarse «Ready» ni ofrecerse como predeterminado sin aviso; si hay clave guardada, no decir «Key missing».
**Observado**: con el modelo activado, tras el test fallido la tarjeta muestra a la vez «Ready» y «Last error»; se puede marcar como predeterminado y la estudiante lo ve en `GET /api/ai/providers` como `ready=true, default=true`. Con el modelo desactivado, la tarjeta muestra «Key missing» aunque `hasKey=true` y se enseña la pista «key ····fake». El mensaje del test es correcto: «Test failed: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":null}».
**Errores de consola o red**: ninguno en el navegador (la API responde 200 con `ok:false`).
**Captura**: `shots/admin-add-model-error.png`, `shots/admin-model-test-toast.png`.

### 12. Cuestionario: `<html lang="en">` con contenido en francés

**Severidad**: baja
**Dónde**: `src/app/questionnaire/layout.tsx` fuerza el `LocaleProvider` a `fr`, pero el `lang` del documento lo pone el layout raíz según la cookie.
**Pasos**: abrir `/questionnaire` sin cookie (o con cookie `en`).
**Esperado**: `lang="fr"`.
**Observado**: `<html lang="en">` (lectores de pantalla pronuncian el francés como inglés).
**Captura**: `shots/q-teacher-start.png`.

### 13. La portada anónima registra un 401 en consola en cada carga

**Severidad**: baja
**Dónde**: `LanguageSwitcher` → `useUser()` → `GET /api/auth/me` sin sesión.
**Pasos**: abrir `/` sin sesión con la consola abierta.
**Observado**: `GET http://localhost:3050/api/auth/me` → 401 y «Failed to load resource: the server responded with a status of 401 (Unauthorized)» en cada visita y en cada cambio de idioma. Ruido para quien depure; sin efecto funcional.

## No comprobable en este servidor

- Parte de equipo del cuestionario (`/equipe/resultats`, edición en línea): `TEAM_PASSWORD` no está configurado. `/equipe` muestra correctamente «Le mot de passe de l'équipe n'est pas configuré sur le serveur (TEAM_PASSWORD).» (`POST /api/equipe/login` → 503); `/equipe/resultats` redirige a `/equipe?next=/equipe/resultats`; `/api/equipe/responses` → 401. `/equipe` sí muestra el logotipo Thesisfic (las páginas `/questionnaire*` no muestran marca ni enlaces, como se pretende).

## Lo que funcionó

- Landing en EN/ES/FR, escritorio y móvil: anclas de navegación, CTA, pie, menú hamburguesa (`aria-expanded`), orden de tabulación y activación con Enter, sin enlace de inicio de sesión, sin scroll horizontal durante ni después de la animación del titular, sin claves crudas. Formulario de piloto: `required` y formato de correo del navegador, confirmación tras envío, llegada a `GET /api/leads` y a la campana del admin; `GET /api/leads` es 403 para tutor y estudiante.
- Tutor: panel con tarjetas y enlaces; lista de tesis con búsqueda y filtros; detalle de 11 tesis (porcentajes de procedencia suman 100, sesiones desplegables con eventos, registro de IA, proceso, comentarios); decisión de revisión guardada y notificada; avisos con filtros «Open/All», resolución con nota y nombre del resolutor; documento en modo revisión: selección → bubble «Comment» → comentario y respuesta guardados, visibles en el detalle y notificados a la estudiante; historial de versiones; alta manual de estudiante con contraseña temporal y error por duplicado; políticas en solo lectura (todos los controles desactivados, `PUT` → 403); biblioteca y acceso a IA en modo lectura; informe con cuatro periodos, rango personalizado, CSV (202 filas, BOM), DOCX (12,9 KB) e impresión; notificaciones (abrir, marcar leídas, enlace); barra lateral plegable persistente; cierre de sesión invalida la cookie. Móvil: 9 páginas sin scroll horizontal, barra inferior, menú lateral, panel de notificaciones y modal de resolución dentro del viewport.
- Administración: política guardada (límite 15 %, modo Outline retirado, copilot, bloqueo y consentimiento) y reflejada en `GET /api/ai/providers`, `/api/auth/me` y la rejilla de modos del estudiante; rúbrica guardada y restablecida; modelo con clave falsa rechazado en «Test & add» con el error del proveedor, guardado sin test, predeterminado, activar/desactivar, edición (aviso de clave conservada), eliminación con frase de consecuencia; financiación (GBP, 500, 7,5, bloquear, alerta 60 %) guardada y visible en el selector y la asignación del estudiante; al desactivar «University provides models» la asignación desaparece. Invitaciones: parseo de `email,professor`, omisión de correo ya registrado, caducidad a 14 días con frase de consecuencia, copiar enlace, aceptación de estudiante (móvil) y tutor con contraseña corta rechazada, redirección por rol, «ya aceptada» al reabrir, token inválido y revocación (404). Enlace de restablecimiento: generado y copiado, contraseña corta rechazada, nueva contraseña válida e inicio de sesión, enlace reutilizado → «ya usado», antigua contraseña rechazada, token falso → 404. Biblioteca: ajustes guardados y visibles para la estudiante, alta, edición y borrado de base de datos.
- Control de acceso: `/dashboard` y `/admin` sin sesión → 307 a `/`; 21 rutas API sin token → 401; estudiante y tutor → 403 en todas las escrituras de administración y 404 en tesis ajenas; autorregistro no permite rol de personal; id de tesis inexistente → 404 en API.
- Cuestionario: ruta docente en entrevista (9 pasos, con detalle de software y sección de demostración), ruta estudiante en línea en móvil (demostración omitida), «Retour» conserva respuestas, borrador restaurado tras recarga con aviso y «Recommencer», obligatorias, correo, 3 respuestas máximo (cuarta casilla desactivada), confirmación sin exclamaciones, borrador borrado al enviar, «Nouvel entretien»; `POST /api/questionnaire` incompleto → 422; honeypot → 201 «ignored».
- ES/FR en las 9 páginas de administración: sin claves crudas, fechas localizadas («12 mar 2026», «9 oct. 2026»), números con separador local («1 500 USD», «0,42»).
