# PLAN.md — Thesisfic: identidad, editor + asistente y landing B2B

Estado: pre-piloto. Comprador: universidad. Foco: editor + asistente IA, landing y onboarding. Idioma UI: inglés.
Mockups de referencia en `docs/design-handoff/mockups/`: `01 Landing Actual`, `02 Editor Actual` (estado previo), `05 Landing Propuesta v2`, `06 Editor Propuesta v2` (dirección elegida). Especificación en `docs/design-handoff/README.md`.

Diferencias respecto al handoff original, decididas después y que prevalecen:
- La marca es **Thesisfic.edu** (sello `thesisfic.edu`).
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
- [x] `QualitySeal`: se mantiene `thesisfic.edu`.

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

### Fase 5 · Onboarding y consentimiento
Pendiente de propuesta de contenido y confirmación. Archivos: `ConsentModal.tsx`, `dashboard/page.tsx`, `admin/page.tsx`, `register/page.tsx`.

### Fase 6 · Instrumentación para el piloto
Pendiente. Archivos: `db.ts`, `api/stats`, nuevo `admin/report/page.tsx`, `export.ts`.

---

### Fase 7 · Funciones del editor IA (hecha)
Seis funciones construidas a partir de `reports/Editores académicos con IA.md`: revisor IA anclado, revisión lingüística en línea, citas verificadas + comprobador de referencias, informe de proceso + declaración de uso de IA, biblioteca de fuentes con respuestas citadas, comprobación de evidencia. Integradas en el menú `⋯ › Tools`, el bubble menu (Support · Evidence) y el asistente ("Use my sources").

### Fase 8 · Español y francés (hecha)
Infraestructura `src/lib/i18n` (cookie `locale`, rutas `/es` `/fr` `/en`, `useT`/`getT`/`useFormat`, diccionarios tipados por área: common, landing, dashboard, admin, editor, assistant, panelsReview, panelsResearch), `LanguageSwitcher` en landing, login y sidebar, metadatos por idioma. Pendiente: textos generados en servidor (líneas del ledger, descripciones de avisos, declaración de uso de IA, `BACKEND_META` de proveedores) siguen en inglés; la etiqueta "Page break" de `extensions.ts` no se tocó.

## 3. Fuera de alcance (por ahora)
Mobile nativo (Capacitor), migración a Postgres, SSO/LMS.

## 4. Pendiente
- Fase 5 (onboarding y consentimiento) y Fase 6 (informe del piloto): no empezadas; la Fase 5 requiere confirmar antes el contenido de las tres pantallas de primer uso.
- Rutas `/privacy` y `/contact` no existen: el pie de la landing enlaza a `#model` y `#pilot`.
- `MenuBar` (barra horizontal antigua) sigue exportado aunque ya no se renderiza; eliminar cuando nada lo use.
- ESLint no está instalado en el proyecto; `npm run lint` pide instalarlo.
