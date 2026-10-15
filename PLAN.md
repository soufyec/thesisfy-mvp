# PLAN.md — Thesisfic: identidad, editor + asistente y landing B2B

Estado: pre-piloto. Comprador: universidad. Foco: editor + asistente IA, landing y onboarding. Idioma UI: inglés.
Mockups de referencia en `docs/design-handoff/mockups/`: `01 Landing Actual`, `02 Editor Actual` (estado previo), `05 Landing Propuesta v2`, `06 Editor Propuesta v2` (dirección elegida). Especificación en `docs/design-handoff/README.md`.

Diferencias respecto al handoff original, decididas después y que prevalecen:
- La marca es **Thesisfic** (sello `Thesisfic`; el nombre ya no lleva «.edu»).
- El asistente tiene **11 modos**: los 10 del handoff más **Research copilot**, el modo libre pagado por la universidad, que va destacado y abre por defecto cuando la institución lo ofrece. El historial de conversaciones se guarda y se muestra en `/dashboard/ai-chat`.
- **No hay extensión de navegador**. La atribución de texto de IA pegado se hace con huellas por frase de las respuestas del asistente.
- Los modelos los paga la universidad (`/admin/ai-access`); el BYOK del estudiante es opcional.

---

## 1. Dirección de diseño

- Identidad actual (Inter, índigo `brand`, verde `accent`, sello), con reglas de uso del gradiente y las sombras.
- La procedencia es visible siempre: gutter en el margen izquierdo (verde = escrito, violeta = IA, ámbar = citado/pegado) y anotaciones en el margen derecho al pasar el ratón o al revisar.
- Una píldora de integridad en la cabecera abre el ledger explicable.
- El asistente conserva todos sus modos, visibles en rejilla con icono y etiqueta; tarjeta de contexto con la selección y tarjeta de coste antes de insertar texto de IA.
- La landing habla a la institución: evidencia vs sospecha, sello en el hero, editor con gutter y ledger como imagen de producto, modelo de integridad, tres lectores, formulario de piloto. Sin estadísticas inventadas, sin planes de precio.

---

## 2. Fases

### Fase 0 · Fundamentos
**Archivos:** `tailwind.config.ts`, `src/app/globals.css`, `src/components/ui.tsx`, `src/lib/ai/prompts.ts`, `src/lib/db.ts`, `src/app/api/leads/route.ts`.
- [x] Tokens `prov-*` en `tailwind.config.ts`; `.show-provenance` usa `theme()`.
- [x] `.btn-primary` sin `hover:-translate-y-0.5`; `.btn-secondary` eliminado; animaciones `fadeIn/slideUp` fuera de las páginas.
- [x] `ui.tsx`: `IntegrityPill` (anillo cónico + "AI x% of y% · Integrity n", variante landing).
- [x] `prompts.ts`: `MODES[].icon` pasa de emoji a nombre de icono lucide.
- [x] `db.leads` + `POST /api/leads` (notifica a administradores).
- [x] `QualitySeal`: ahora `Thesisfic`.

### Fase 1 · Landing B2B
**Archivos:** `src/app/page.tsx`, `src/components/landing/HeroScene.tsx`, `src/components/landing/HeroEditorPreview.tsx`, `src/app/login/page.tsx`.
- [x] Nav: Integrity model · For institutions · Pilot programme · Sign in · **Request a pilot**.
- [x] Hero con badge, titular (gradiente solo en "not suspicion"), párrafo, dos CTAs, tres bullets; `QualitySeal` a la derecha; escena orbital en canvas.
- [x] `HeroEditorPreview`: hoja con gutter e Integrity ledger, datos del seed `thesis_1`.
- [x] `#model` tres pilares · `#roles` tres lectores · `#pilot` formulario → `POST /api/leads`.
- [x] Eliminar stats inventadas, tabla Turnitin, pricing, preview oscuro.
- [x] Login: mismo titular, sin "Trusted by 50+ universities".

### Fase 2 · Cromo del editor
**Archivos:** `DocsEditor.tsx`, `Toolbar.tsx`, `MenuBar.tsx`, nuevo `SessionBar.tsx`.
- [x] Cabecera 52px: volver · icono · título · Saved · `IntegrityPill` · **AI assistant** · Share · `⋯` con los menús como lista.
- [x] Toolbar 40px blanca con todos los controles y el interruptor **Provenance**.
- [x] Session bar inferior 30px.
- [x] Bubble menu: B · I · U · Cite · Comment · **Ask AI**.
- [x] Mantener todos los `MenuAction` y atajos.

### Fase 3 · Provenance gutter e Integrity ledger
**Archivos:** `extensions.ts`, nuevo `ProvenanceGutter.tsx`, `Sidebars.tsx`, `src/lib/integrity.ts`, `src/app/api/theses/[id]/route.ts`.
- [x] Plugin ProseMirror con proporción `human/ai/paste` por bloque; gutter con barra y etiqueta (¶n, AI, Q).
- [x] Anotación de margen derecho al hover: proveedor · modo · fecha · palabras.
- [x] Interruptor Provenance persistido en `localStorage.provenance_gutter`; en `reviewMode` siempre activo.
- [x] `computeIntegrityScore` devuelve el desglose; `IntegrityLedger` lo lista con acciones; `IntegrityPill` abre el ledger.

### Fase 4 · Asistente de IA
**Archivos:** `AssistantPanel.tsx`, `src/app/dashboard/ai-chat/page.tsx`.
- [x] Cabecera "Thesisfic AI · Thinks with you. Never writes your thesis." + chip de proveedor + historial.
- [x] Modos en rejilla con icono lucide; **Research copilot** destacado en primera posición; descripción y sugerencias del modo activo.
- [x] Tarjeta "Working on · §n ¶m · N words" con la selección.
- [x] Acciones contextuales por modo (Guiding questions · Add as comment · Insert, marked as AI · Keep as notes · Replace selection).
- [x] **Tarjeta de coste** obligatoria antes de cualquier inserción (palabras, % actual → nuevo, quién paga; deshabilitada si supera el límite).

### Fase 5 · Onboarding y consentimiento (onboarding hecho)
**Archivos:** `src/components/onboarding/{StudentOnboarding,IntroModal,TourCoachmark}.tsx`, `src/lib/onboarding.ts`, `src/lib/i18n/messages/onboarding.ts`, `DocsEditor.tsx` (`data-tour`, menú ⋯ → Help → "Show the tour again"), `Toolbar.tsx`, `AssistantPanel.tsx`, `MenuBar.tsx`, `db.ts` (`users.onboardedAt`), `api/auth/me` (PATCH `onboarded`). Spec: `docs/design-handoff/README.md §4.10`, mockup `08 Editor Onboarding`.
- [x] Modal de intro de 4 páginas (vídeo con capítulos · Provenance · Thesisfic AI · Integrity) en EN/ES/FR.
- [x] Tour de 6 coachmarks sobre la UI real (toolbar · integrity pill · modelo · comentario del tutor · pestañas · pasaje pegado), con foco recortado, tarjeta posicionada y scroll del `main` sin `scrollIntoView`; anclas de documento con fallback a los botones Comment / Cite.
- [x] Una sola vez por cuenta y dispositivo (`localStorage onboarding_v1` + `users.onboardedAt`); Skip termina las dos partes; solo escritorio (≥ 1024px), solo estudiante propietario, nunca en revisión.
- [x] Vídeo configurable por idioma en `src/lib/onboarding.ts` (`ONBOARDING_VIDEO`); con `src: null` se muestra el placeholder con capítulos.
- [ ] `ConsentModal` de una pantalla, mini-gutter en el dashboard del tutor y código de invitación obligatorio en el registro (sin empezar).

### Fase 6 · Instrumentación para el piloto (hecha)
**Archivos:** `src/app/api/admin/report/route.ts`, `src/app/admin/report/page.tsx`, `src/lib/export.ts` (`toCsv`), `src/lib/nav.tsx`, `globals.css` (print).
- [x] `GET /api/admin/report?from&to`: adopción, escritura y procedencia agregada, IA (modo, proveedor, coste, quién paga), avisos, consentimiento, registro de proceso, serie semanal. Todo recuentos reales; sin cifras por persona.
- [x] Página `/admin/report` con periodo, tarjetas, barras CSS, Export CSV / DOCX / Print.
- [x] `IntegrityFlag.resolvedAt` para el tiempo de resolución (solo avisos resueltos desde ahora).

### Fase 9 · Cuentas reales para el piloto (hecha)
**Archivos:** `src/lib/invitations.ts`, `src/app/api/invitations/**`, `src/app/api/auth/password`, `src/app/api/users/[id]/reset-link`, `src/app/api/reset/[token]`, `src/app/invite/[token]`, `src/app/reset/[token]`, `src/components/accounts/*`, `admin/students`, `dashboard/settings`.
- [x] Invitaciones por enlace (14 días, pegado masivo, copiar/revocar), aceptación con nombre y contraseña.
- [x] Cambio de contraseña en Ajustes; enlaces de restablecimiento generados por administración (48 h).
- [x] `DEMO_ACCOUNTS=off` + `NEXT_PUBLIC_DEMO_ACCOUNTS=off` apagan las cuentas demo en producción.
- [ ] Envío de correo: `deliverInvitation()` devuelve el enlace; falta un proveedor (p. ej. Resend) cuando la institución lo pida.

---

### Fase 7 · Funciones del editor IA (hecha)
Seis funciones construidas a partir de `reports/Editores académicos con IA.md`: revisor IA anclado, revisión lingüística en línea, citas verificadas + comprobador de referencias, informe de proceso + declaración de uso de IA, biblioteca de fuentes con respuestas citadas, comprobación de evidencia. Integradas en el menú `⋯ › Tools`, el bubble menu (Support · Evidence) y el asistente ("Use my sources").

### Fase 8 · Español y francés (hecha)
Infraestructura `src/lib/i18n` (cookie `locale`, rutas `/es` `/fr` `/en`, `useT`/`getT`/`useFormat`, diccionarios tipados por área: common, landing, dashboard, admin, editor, assistant, panelsReview, panelsResearch), `LanguageSwitcher` en landing, login y sidebar, metadatos por idioma. Pendiente: textos generados en servidor (líneas del ledger, descripciones de avisos, declaración de uso de IA, `BACKEND_META` de proveedores) siguen en inglés; la etiqueta "Page break" de `extensions.ts` no se tocó.

### Fase 10 · Estructura de tesis en el editor (hecha)
**Archivos:** `src/components/editor/thesisBlocks.ts`, `DocsEditor.tsx`, `MenuBar.tsx`, `TableMenu.tsx`, `globals.css`, `src/lib/export.ts`, `src/lib/db.ts` (`countWords`), `messages/editor.ts`.
- [x] Notas al pie reales: marcador numerado en línea + sección de notas al final, sincronizados en cada cambio (borrar el marcador borra la nota, pegar un marcador crea su nota, la numeración sigue el orden del texto). Clic en el marcador lleva a la nota; Escape vuelve al marcador; Ctrl+Alt+F inserta. Exportan como notas al pie nativas de Word.
- [x] Índice automático: bloque que se redibuja con los títulos 2–4, su numeración (si está activa) y la página en la que empiezan; clic lleva al título. En Word se exporta como campo de tabla de contenido.
- [x] Leyendas numeradas: "Figura n." en las imágenes con leyenda y "Tabla n." con Insertar › Leyenda de tabla (o el menú de tabla), localizadas; incluidas en DOCX, HTML, Markdown y texto.
- [x] Contador de palabras único en cliente y servidor (las marcas en línea ya no parten palabras); el menú flotante de tablas no se desmonta al cambiar de disposición (fallo al abrir la vista previa de impresión).

### Fase 11 · My papers, tareas y datos primarios (activa)
Especificación completa en `docs/papers.md`.
**Archivos:** `src/lib/papers/*`, `src/lib/data/*`, `src/lib/charts/*`, `src/lib/sources/{zip,ooxml,csv}.ts`, `src/lib/demo/papers.ts`, `src/lib/db.ts`, `src/components/editor/types.ts`, `src/app/dashboard/papers/**`, `src/app/admin/assignments/**`, `src/app/api/assignments/**`, `src/app/api/ai/chat/route.ts`, `src/components/papers/**`, `src/components/assignments/**`, `src/components/ai/**`, `src/components/editor/{chart.ts,ChartView.tsx,figureStats.ts,templateHints.ts}`, `messages/{papers,assignments,data}.ts`.
- [ ] A · Base: `Thesis.kind` y 12 tipos con plantillas (solo encabezados + placeholders), colección `assignments`, `datasets` por columnas, acceso del profesor restringido a sus trabajos y tareas, línea `ai_figures`, componentes `KindTile`/`KindChip`/`DeadlineChip`, áreas i18n.
- [ ] B · Servidor: rutas de tareas (crear, editar, empezar), bloqueo de trabajos entregados, lectura de `.xlsx/.csv/.docx/.txt/.md` sin dependencias, análisis descriptivo y gráficos SVG deterministas, artefactos del copilot (`thesisfic-artifact`), datos de demo.
- [ ] C · Interfaz: «My papers» (asignados, continuar con tira de secciones, galería de plantillas, trabajos por tipo), tareas del profesor con roster, adjuntos y tarjetas de tabla/gráfico en el asistente, nodo `chart` en el editor con coste antes de insertar, panel Brief.
- [ ] B+ · Ampliación (§9 de `docs/papers.md`): tarta, caja y bigotes, pruebas inferenciales con p-valores, Gantt, PRISMA 2020, mapas conceptuales y ecuaciones (también hechas por el estudiante desde Insertar).
- [ ] D · Revisión, build, capturas antes/después, prueba manual ampliada de §7.

## 3. Fuera de alcance (por ahora)
Mobile nativo (Capacitor), migración a Postgres, SSO/LMS. De la fase 11: OCR, codificación cualitativa, descarga de tablas y gráficos, límite de IA y ampliaciones por tarea, notas, correo, grupos, LTI por tarea, plantillas por universidad.

## 4. Pendiente
- Fase 5: el onboarding del editor está hecho; quedan `ConsentModal`, el mini-gutter del tutor y el código de invitación.
- Rutas `/privacy` y `/contact` no existen: el pie de la landing enlaza a `#model` y `#pilot`.
- `MenuBar` (barra horizontal antigua) sigue exportado aunque ya no se renderiza; eliminar cuando nada lo use.
- ESLint no está instalado en el proyecto; `npm run lint` pide instalarlo.


## Ajuste solicitado · 15 octubre 2026

- [x] Conexiones de IA y selector del asistente: uso en interacciones y tokens, sin importes; restantes estimados según el consumo y el límite individual/compartido.
- [x] Ocultar modelos institucionales sin configurar; conservar los modelos disponibles y las conexiones personales activas en el selector.
- [x] Selector compacto de pestañas sobre el documento; herramientas y selector dejan libre la columna del asistente desde la cabecera.
- [x] Modos compactos, una línea de capacidades del Research copilot y retirada de su explicación redundante.
- [x] Traducciones EN/ES/FR/DE; comprobación TypeScript, build y capturas antes/después.
