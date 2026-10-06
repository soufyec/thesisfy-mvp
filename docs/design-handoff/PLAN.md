# PLAN.md — Thesisfy: rediseño de identidad, editor + Coach y landing B2B

Estado: pre-piloto. Comprador: universidad. Foco: editor + asistente IA, landing y onboarding. Idioma UI: inglés.
Mockups de referencia en este proyecto: `01 Landing Actual`, `02 Editor Actual` (recreación del código actual), `05 Landing Propuesta v2`, `06 Editor Propuesta v2` (dirección elegida). `03`/`04` fueron una exploración de identidad descartada.

---

## 0. Diagnóstico

### Negocio
- **Posicionamiento confuso.** La landing habla al estudiante ("Stop punishing students") pero quien paga es la universidad. El eslogan "Anti-Turnitin" enfrenta a Thesisfy con un proveedor que la universidad ya ha comprado; mejor posicionarse como **evidencia de proceso** complementaria.
- **Credibilidad en riesgo.** Cifras inventadas ("50+ universities", "99.2% accuracy", "0 false accusations"), tres planes de precio y un sello "thesisfic.edu" con otro nombre. En pre-piloto esto resta más de lo que suma.
- **Activos poco explotados.** Tres diferenciadores reales no aparecen en el discurso: consentimiento granular aplicado en servidor (argumento GDPR/AI Act para Europa), IA pagada y presupuestada por la universidad (modelo "Copilot" ya implementado en `funding.ts`), y la puntuación de integridad explicable punto a punto (`integrity.ts`).
- **Modelo recomendado para esta etapa.** Venta liderada por piloto: un departamento, un semestre, informe final para el consejo académico. Precio por plaza/año después del piloto, con pass-through del gasto de IA. Retirar el plan "Free" individual: diluye el B2B y crea coste de soporte.

### UX del editor y el asistente
- **Cuatro filas de cromo** antes del documento (cabecera + menús, toolbar de 30 controles, session strip, pestañas). El clon de Google Docs compite por atención con la propuesta de valor.
- **La procedencia, que es el producto, está oculta.** Solo se ve activando "Show provenance highlights" en el menú View; el resto del tiempo son líneas punteadas. La session strip condensa integridad, IA y consentimiento en 11px.
- **Asistente genérico.** 10 modos como píldoras emoji en scroll horizontal (la mitad fuera de pantalla), selector de proveedor en el lugar más visible, "Insert (AI-marked)" como enlace de 11px sin explicar el efecto sobre el límite de IA.
- **Identidad visual aplicada sin criterio.** La paleta índigo/verde funciona, pero el gradiente aparece en siete sitios, el sello lleva otro nombre ("thesisfic.edu") y conviven tres estilos de botón. Se conserva la paleta y se fija dónde se usa cada cosa.

### Qué se mantiene (está bien resuelto)
Marcas de procedencia en TipTap, diálogo de atribución de pegado, pestañas con "Final submission" bloqueada, guardarraíles de política multilingües, modelo de consentimiento, versiones, citas con IA, exportación DOCX.

---

## 1. Dirección de diseño

- **Identidad:** la actual (Inter, índigo `brand`, verde `accent`, sello de calidad), con reglas de uso: gradiente solo en logo, una palabra por titular y bloque CTA; sombras de color solo en el botón primario.
- **La procedencia es visible siempre**, de forma serena: un *gutter* en el margen izquierdo con una barra fina por párrafo (verde = escrito, violeta = IA, ámbar = citado/pegado) y anotaciones en el margen derecho al pasar el ratón o al revisar.
- **Una píldora de integridad** en la cabecera (anillo cónico con el reparto + "AI 12% of 25% · Integrity 94") abre el *ledger* explicable.
- **El asistente conserva sus 10 modos**, todos visibles en una rejilla con icono y etiqueta, cada uno con su línea de ayuda y sugerencias. Se añade una tarjeta de contexto con la selección y una tarjeta de **previsualización de coste** antes de insertar texto de IA.
- **La landing habla a la institución**: titular de evidencia vs sospecha, sello de calidad en el hero, el editor con gutter y ledger como imagen de producto, modelo de integridad en tres puntos, tres lectores (oficina de integridad, tutores, estudiantes), formulario de piloto. Sin estadísticas inventadas, sin planes de precio.

---

## 2. Fases

Cada fase es un PR independiente. Orden obligatorio: 0 → 1 → 2 → 3 → 4; 5 y 6 pueden ir en paralelo tras la 2.

### Fase 0 · Fundamentos
**Objetivo:** tokens de procedencia, limpieza de primitivas y sello corregido, sin cambiar todavía ninguna pantalla.
**Archivos:** `tailwind.config.ts`, `src/app/globals.css`, `src/components/ui.tsx`, `src/components/QualitySeal.tsx`, `src/lib/ai/prompts.ts`.
**Tareas**
- [ ] Añadir tokens `prov.ai`, `prov.paste`, `prov.human` en `tailwind.config.ts` (valores en `CLAUDE.md §4`); `.show-provenance` y `.prov` en `globals.css` pasan a usarlos.
- [ ] `.btn-primary`: quitar `hover:-translate-y-0.5`. Eliminar `.btn-secondary` (sin uso) y las animaciones `fadeIn/slideUp` de las páginas de dashboard.
- [ ] `ui.tsx`: `ScoreRing` → `IntegrityPill` (anillo cónico con tres segmentos + etiqueta "AI x% of y% · Integrity n").
- [ ] `QualitySeal.tsx`: `SEAL_NAME = "thesisfy.edu"`.
- [ ] `prompts.ts`: `MODES[].icon` pasa de emoji a nombre de icono lucide (`MessageSquare, Lightbulb, List, Search, Pencil, FileText, GraduationCap, BookMarked, CircleAlert, Shuffle`).
**Aceptación:** `npm run build` pasa; ninguna pantalla cambia de layout; `grep` de la sección 8 de CLAUDE.md pasa.
**Prompt para Claude Code:** "Ejecuta la Fase 0 de PLAN.md. No cambies layouts ni copy; solo tokens, primitivas, sello e iconos de modos."

### Fase 1 · Landing B2B
**Objetivo:** reemplazar `src/app/page.tsx` por la estructura de `05 Landing Propuesta v2`.
**Archivos:** `src/app/page.tsx`, nuevo `src/app/api/leads/route.ts`, `src/lib/db.ts` (colección `leads`), `src/app/login/page.tsx` (panel izquierdo).
**Tareas**
- [ ] Nav: Integrity model · For institutions · Pilot programme · Sign in · **Request a pilot**.
- [ ] Hero: badge "Academic integrity for the AI era", titular "Evidence of the writing process, not suspicion of the result." (gradiente solo en "not suspicion") + párrafo + dos CTAs + tres bullets (consentimiento, sin probabilidad de IA, IA facturada a la institución). A la derecha, `QualitySeal`.
- [ ] Bajo el hero, componente estático `HeroEditorPreview`: hoja con gutter de procedencia a la izquierda e `Integrity ledger` a la derecha, datos del seed `thesis_1`. Sustituye al preview oscuro del dashboard.
- [ ] Sección `#model`: tres pilares (atribución al escribir · ledger visible y corregible · consentimiento aplicado en servidor).
- [ ] Sección `#roles`: tres tarjetas (Integrity office · Advisors · Students) con tres bullets cada una.
- [ ] Sección `#pilot`: bloque `ink` con formulario (institution, work email, role) → `POST /api/leads`; guardar en `db.leads` y notificar a admins demo.
- [ ] Eliminar: stats inventadas, tabla Turnitin, pricing, preview oscuro del dashboard. El bloque CTA degradado se mantiene como sección de piloto.
- [ ] Nuevo `src/components/landing/HeroScene.tsx`: canvas 2D detrás del texto del hero (opacidad .38, `pointer-events:none`) con la escena orbital Universidad (sol) · Estudiante (planeta) · AI assistant (luna) · Advisor (satélite). Especificación completa en `design_handoff_thesisfy/README.md §3.2`. Respeta `prefers-reduced-motion` (escena estática).
- [ ] Login: panel izquierdo con el mismo titular, sin "Trusted by 50+ universities".
**Aceptación:** sin ninguna cifra no verificable; Lighthouse accesibilidad ≥ 95; formulario funciona con las cuentas demo.
**Prompt:** "Ejecuta la Fase 1 de PLAN.md usando el mockup `05 Landing Propuesta v2` como referencia de jerarquía y copy. Copy en inglés tal cual aparece en el plan."

### Fase 2 · Cromo del editor
**Objetivo:** tres filas arriba (cabecera 52 · toolbar 40 · pestañas 34), una abajo (session bar 30); toolbar completa sobre fondo blanco; bubble menu con Cite/Comment/Ask AI.
**Archivos:** `src/components/editor/DocsEditor.tsx` (solo JSX de cabecera, toolbar, strip, tabs, footer), `Toolbar.tsx`, `MenuBar.tsx`, nuevo `SessionBar.tsx`.
**Tareas**
- [ ] Cabecera 52px: volver · icono de documento · título (Inter 16/600, trunca con ellipsis, `min-width:200px`) · Saved · `IntegrityPill` · botón **AI assistant** · Share · menú `⋯` que abre los menús File/Edit/View/Insert/Format/Tools/Help actuales como lista.
- [ ] `Toolbar` 40px con todos los controles actuales (CLAUDE.md §5); quitar fondo `#edf2fa` y forma de píldora; añadir el interruptor `Provenance` al final.
- [ ] Mover la session strip a `SessionBar` inferior (30px): estado de grabación con scopes activos + "change" · "In progress · Advisor: …" · palabras/objetivo · página · estilo de cita.
- [ ] Bubble menu: B · I · U · Cite · Comment · **Ask AI** (abre el asistente con la selección como contexto, modo actual).
- [ ] Eliminar botón Share azul Google (`#c2e7ff`). La fila de pestañas se conserva tal cual (`.doc-tab`).
- [ ] Mantener todos los atajos y `MenuAction`.
**Aceptación:** altura total de cromo superior ≤ 128px (52+40+34 + bordes); todas las acciones del menú siguen accesibles; prueba manual de `extensions.ts` (CLAUDE.md §7).
**Prompt:** "Ejecuta la Fase 2 de PLAN.md. Referencia visual: `06 Editor Propuesta v2`. No toques la lógica de guardado, pestañas ni sesión: solo mueve y rediseña la UI."

### Fase 3 · Provenance gutter e Integrity ledger
**Objetivo:** hacer visible la procedencia por defecto y explicable la puntuación.
**Archivos:** `src/components/editor/extensions.ts`, nuevo `ProvenanceGutter.tsx`, `Sidebars.tsx` (`IntegrityPanel` → `IntegrityLedger`), `src/lib/integrity.ts` (exportar desglose), `src/app/api/theses/[id]/route.ts` (añadir `integrityBreakdown` opcional).
**Tareas**
- [ ] Plugin ProseMirror que calcula, por bloque de nivel superior, la proporción `human/ai/paste` y expone posiciones; `ProvenanceGutter` dibuja una barra de 3px por bloque alineada a la izquierda de la hoja y una etiqueta corta (¶n, AI, Q).
- [ ] Anotación de margen derecho al hover/clic sobre un bloque con marcas: proveedor · modo · fecha · palabras (datos de `interactionId` / `label`).
- [ ] Interruptor "Provenance" en la toolbar, persistido en `localStorage.provenance_gutter`; en `reviewMode` siempre activo.
- [ ] `computeIntegrityScore` devuelve también `[{ reason, points, fix }]`; el `IntegrityLedger` lo lista con el enlace a la acción (abrir pegado sin atribuir, abrir notice, abrir el asistente).
- [ ] `IntegrityPill` en la cabecera abre el ledger.
**Aceptación:** con el seed `thesis_1` el gutter muestra al menos un bloque AI y uno paste; el ledger suma exactamente `100 − score`.
**Prompt:** "Ejecuta la Fase 3 de PLAN.md. Empieza por el plugin de cálculo en extensions.ts y muéstrame el shape de datos antes de dibujar el gutter."

### Fase 4 · Asistente de IA
**Objetivo:** mismos 10 modos, más claros; contexto explícito y previsualización de coste antes de insertar.
**Archivos:** `src/components/ai/AssistantPanel.tsx`, `src/lib/ai/prompts.ts` (iconos ya cambiados en Fase 0), `src/app/dashboard/ai-chat/page.tsx`.
**Tareas**
- [ ] Cabecera: "Thesisfy AI" + subtítulo "Thinks with you. Never writes your thesis." + chip de proveedor (texto; el selector completo va a un popover secundario) + historial.
- [ ] Modos: rejilla 5×2 con icono lucide + etiqueta, todos visibles, sin scroll horizontal. Debajo, la `description` del modo activo y las sugerencias `QUICK` del modo (ya existen).
- [ ] Tarjeta "Working on · §n ¶m · N words" con la selección truncada y botón ✕; sustituye al checkbox ámbar.
- [ ] Respuestas: etiqueta "{provider} · {mode} · logged"; acciones contextuales: *critique/gaps/paraphrase_check* → "Guiding questions", "Add as comment" (crea un `CommentItem` anclado a la selección); *outline/summarize/citations* → "Insert, marked as AI", "Keep as notes" (inserta en la pestaña "Research notes"); *grammar* → "Replace selection".
- [ ] **Tarjeta de coste** antes de cualquier inserción: palabras, % actual → % nuevo respecto al límite, quién paga. Si el nuevo % supera el límite, el botón se deshabilita con la razón.
- [ ] Modo página (`/dashboard/ai-chat`) reutiliza el mismo componente con `variant="page"`.
**Aceptación:** ningún texto se inserta sin pasar por la tarjeta de coste; los 10 modos visibles a 400px de ancho; sin emojis.
**Prompt:** "Ejecuta la Fase 4 de PLAN.md. Mantén `streamChat`, `onInsert` y `onReplaceSelection` intactos; cambia la UI y añade la tarjeta de coste como paso obligatorio."

### Fase 5 · Onboarding y consentimiento
**Objetivo:** primer uso claro para estudiante y tutor; consentimiento legible.
**Archivos:** `src/components/ConsentModal.tsx`, `src/app/dashboard/page.tsx`, `src/app/admin/page.tsx`, `src/app/register/page.tsx`.
**Tareas**
- [ ] `ConsentModal`: una pantalla, lista de scopes con "qué se guarda / qué no" por cada uno, los exigidos por política marcados y bloqueados, enlace al recibo. Sin texto legal largo.
- [ ] Dashboard estudiante: primer uso con tres pasos (tu tesis · tus elecciones de monitorización · tu asistente) y, tras el primer guardado, la vista normal.
- [ ] Dashboard tutor: lista de tesis con mini-gutter (barra apilada human/ai/paste) en vez de "integrity %" aislado.
- [ ] Registro: campo de código de invitación institucional obligatorio (eliminar alta libre).
**Aceptación:** un estudiante nuevo llega al editor en ≤ 3 pantallas; el tutor entiende el reparto sin abrir la tesis.

### Fase 6 · Instrumentación para el piloto
**Objetivo:** medir lo que el consejo académico va a preguntar.
**Archivos:** `src/lib/db.ts`, `src/app/api/stats/route.ts`, nuevo `src/app/admin/report/page.tsx`, `src/lib/export.ts`.
**Tareas**
- [ ] Eventos de producto (sin texto): apertura del asistente por modo, inserciones aceptadas/rechazadas, atribuciones de pegado, cambios de consentimiento.
- [ ] Página `/admin/report`: periodo, nº tesis, reparto de procedencia agregado, notices por tipo y resolución, gasto IA por modelo, consentimientos por scope. Exportable a DOCX con `export.ts`.
- [ ] Deshabilitar en producción las cuentas demo y el botón "Quick demo access".
**Aceptación:** el informe se genera con los datos del seed y se descarga.

---

## 3. Fuera de alcance (por ahora)
Mobile nativo (Capacitor), extensión de navegador, migración a Postgres, SSO/LMS. Se mantienen tal cual; cualquier cambio necesario se anota en *Pendiente*.

## 4. Pendiente
_(Claude Code añade aquí lo que encuentre fuera de la fase activa.)_
