# CLAUDE.md — Thesisfic

Guía para cualquier cambio hecho con Claude Code en `soufyec/thesisfy-mvp`. Léela entera antes de tocar código. Si una petición contradice esta guía, pregunta antes de implementar. Especificación visual detallada en `docs/design-handoff/README.md` (mockups en `docs/design-handoff/mockups/`); donde el handoff diga "Thesisfy", léase **Thesisfic**.

## 1. Qué es Thesisfic (y qué no es)

Thesisfic es una plataforma B2B para universidades que **registra la procedencia del texto de una tesis mientras se escribe** (escrito, pegado/citado, asistido por IA) y da al tutor un informe de proceso en vez de una "probabilidad de IA". El comprador es la institución (oficina de integridad, decanato, biblioteca). Los usuarios son estudiantes y tutores.

No es un detector. No acusa. No puntúa "probabilidad de IA". Cualquier texto, copy o funcionalidad que insinúe detección a posteriori es un error de producto.

## 2. Principios de producto (no negociables)

1. **Atribución en el momento, nunca inferencia después.** Toda marca de procedencia nace de un evento real: inserción desde el asistente, pegado, o pegado que coincide con las huellas por frase de una respuesta del asistente o del Research copilot (`responseFingerprints`). No añadir heurísticas que "adivinen" IA. No existe extensión de navegador ni vigilancia de sitios externos: se eliminó a propósito.
2. **El estudiante ve lo mismo que el tutor.** Ninguna métrica, aviso o registro es visible para el tutor y oculto para el estudiante.
3. **Asistencia vinculada al objetivo del trabajo.** Por petición explícita del usuario (16 octubre 2026), **Research copilot** puede crear y revisar informes, materiales, plantillas, código y archivos relacionados con el objetivo de la tesis o tarea. La conversación libre sustituye a Ask, Brainstorm, Outline, Summarize y Explain en la navegación; Critique, Grammar, Citations, Find gaps y Paraphrase conservan sus funciones enfocadas. Paraphrase reformula texto suministrado sin añadir contenido; usa el identificador persistido `paraphrase_check`. Los modos antiguos permanecen compatibles con el historial. No inventar resultados, fuentes ni búsquedas; los cálculos de los datos adjuntos siguen en `src/lib/data/`. Toda inserción conserva procedencia y coste. Las restricciones de redacción de `BASE_SYSTEM` y `GENERATION_PATTERNS` permanecen para los modos enfocados; el copilot usa `COPILOT_SYSTEM`, sin saltarse consentimiento, propiedad ni límites de inserción.
4. **Consentimiento primero, aplicado en servidor.** Los scopes de monitorización (interacciones con IA, ritmo de tecleo, pegados, actividad de pestañas) se eligen en cliente y se filtran en servidor (`/api/monitor/consent`, `/api/sessions/*`). No registrar texto tecleado, solo recuentos y huellas.
5. **Cada inserción de IA muestra su coste antes de ocurrir.** Palabras añadidas y nuevo % de IA respecto al límite. Sin excepciones. No se muestra quién paga el modelo (ni en la landing ni en el producto); la facturación vive solo en `Admin → AI access & billing`.
6. **La universidad paga la IA.** Los modelos se ofrecen y presupuestan desde `Admin → AI access & billing` (`src/lib/ai/funding.ts`, `providers.ts`); el estudiante puede añadir su propia cuenta, nunca es obligatorio.
7. **Honestidad comercial.** Ninguna cifra inventada (universidades, precisión, estudiantes). Si no hay dato, no hay número.

## 3. Vocabulario de UI (usar exactamente estos nombres)

| Concepto | Nombre en UI (EN) | Identificador en código |
|---|---|---|
| Asistente de IA | **Thesisfic AI** / **AI assistant** | `AssistantPanel` |
| Modo libre pagado por la universidad | **Research copilot** | `AIMode = "copilot"`, `Policy.researchCopilot` |
| Modos del asistente | **Research copilot · Critique · Grammar · Citations · Find gaps · Paraphrase** | `AIMode` mantiene identificadores antiguos; seis accesos compactos, copilot primero |
| Marcas de procedencia en el margen | **Provenance gutter** | `ProvenanceGutter`, decoraciones en `extensions.ts` |
| Texto escrito por el estudiante | **Written** | `provenance: "human"` (no cambiar el valor almacenado) |
| Texto insertado desde IA | **AI-assisted** | `provenance: "ai"` |
| Texto pegado / citado | **Quoted or pasted** | `provenance: "paste"` |
| Desglose de la puntuación | **Integrity ledger** | `IntegrityLedger` (sustituye a `IntegrityPanel`) |
| Píldora resumen en la cabecera | **Integrity pill** | `IntegrityPill` (`ui.tsx`) |
| Sello de calidad de la landing | **Academic quality seal** | `QualitySeal` (`SEAL_NAME = "Thesisfic"`) |
| Pestaña que se entrega y evalúa | **Final submission** | `SUBMISSION` |
| Barra inferior de estado de sesión | **Session bar** | `SessionBar` |
| Aviso de integridad | **Notice** (nunca "flag" de cara al estudiante) | `IntegrityFlag` en datos |
| Modelos pagados por la universidad | **Provided by your university** | `InstitutionModel`, `/admin/ai-access` |
| Trabajos del estudiante (tesis, ensayos, informes…) | **My papers** · **paper** | `/dashboard/papers`, `Thesis.kind` (`PaperKind`, `src/lib/papers/kinds.ts`); `Thesis` y `/api/theses` no se renombran |
| Trabajo encargado por un docente | **Assignment** | `Assignment`, `/api/assignments`, `/admin/assignments` |
| Enunciado de la tarea | **Brief** | `AssignmentBrief`, panel `SidebarKind = "brief"` |
| Docente del trabajo | **Advisor** (tesis) · **Teacher** (resto) | `teacherLabel` |
| Archivos propios del estudiante (Excel, CSV, Word, PDF) | **Primary data** / **primary source** | `ThesisSource.role = "primary"`, `Dataset` |
| Gráfico calculado e insertado desde el copilot | **AI-assisted figure** («Fig · AI» en el gutter) | nodo `chart` (`chart.ts`), `Artifact`, línea `ai_figures` |
| Ecuación | **Equation** («Eq · AI» si viene del copilot) | nodos `math` / `mathBlock`, `src/lib/math/`, línea `ai_equations` |
| Cronograma, PRISMA, mapa conceptual | **Diagram** (Timeline · PRISMA flow · Concept map) | nodo `chart` con `spec.figure`, `src/lib/diagrams/` |

Cada modo lleva icono `lucide` (campo `icon` de `MODES` es el nombre del icono), dos sugerencias breves al iniciar; ayuda en el título del control. No introducir agrupaciones intermedias.

## 4. Sistema visual

Definido en `tailwind.config.ts` y `globals.css`. Usar tokens, nunca hex sueltos en componentes. **Identidad actual: verde abeto + menta, Inter** (propuesta C del lienzo); se corrige la ejecución, no la paleta.

**Color**
- `brand` (primario, acciones): `brand-600` `#037947` (verde abeto) como principal, `brand-400` `#4f9a78` como extremo claro de los degradados, `brand-800` `#122e22` como extremo oscuro, `brand-50/100` para fondos suaves.
- `accent` (éxito, texto escrito por el estudiante, checks): `accent-500` `#20c997`.
- Gradientes de marca solo en verde (`brand-800 → brand-600 → brand-400` en bandas, `brand-600 → brand-400` en texto): una palabra destacada por titular, las cifras de la evidencia y los bloques ENT y CTA. Nunca en tarjetas ni botones. El logo tiene sus propios colores (`Logo.tsx`) y no usa la escala.
- Neutros: `gray-50…900`. Fondo de app `gray-50`, tarjetas `white`, área del editor `#f1f3f4` (`.docs-workspace`).
- Gráficos: paleta propia en `src/lib/charts/palette.ts` (verde `#037947`, rosa `#e87ba4`, azul `#2a78d6`, naranja `#eb6834`, gris «Other»; validada para daltonismo), nunca `prov-*`. Miniaturas de plantillas sobre el token `paper.well` (`bg-paper-well`).
- Procedencia (tokens `prov-*`): `prov-ai` `#7c3aed` (`prov-ai-deep`, `prov-ai-soft`, `prov-ai-line`), `prov-paste` `#f59e0b` (`prov-paste-deep`), `prov-human` = `accent-500`.
- Estados: `green-600`, `amber-600`, `red-600`. Colores de proveedores de IA viven en `providers.ts`.

**Tipografía**
- UI: `Inter` 400/500/600/700. Tamaños 12 / 13 / 14 / 16; 11px solo en etiquetas del gutter y chips.
- Titulares de landing: Inter 700/800, 36–58px, `letter-spacing: -0.02em`.
- Documento (`.ProseMirror`): Georgia 12pt, interlineado 1.6.

**Forma**
- Radios: 6–8px controles, 10px chips, 12px inputs, 16px tarjetas, 24px solo en el bloque CTA de la landing, 999px para píldoras y botones de cabecera del editor.
- Sombras: `shadow-sm` en tarjetas, sombra de color `brand` solo en el botón primario y la tarjeta del formulario de piloto. La hoja del documento mantiene su sombra Docs.
- Botón primario: `.btn-primary` (sin desplazamiento en hover).
- Iconos: `lucide-react` 15–18px, trazo 2. Sin emojis en la UI.

## 5. Reglas de layout del editor

- Máximo **tres filas de cromo** encima del documento: cabecera (52px), barra de herramientas (40px) y fila de pestañas del documento (34px, `.doc-tab`). El resto va al menú `⋯`, al bubble menu de selección o a la session bar inferior (30px).
- Las pestañas se eligen desde un selector compacto sobre la hoja: muestra la pestaña activa y abre un menú con Final submission y las pestañas de trabajo. El menú conserva crear, renombrar, duplicar, promover y borrar. Toolbar y selector pertenecen a la columna del documento; el asistente empieza justo debajo de la cabecera.
- La barra de herramientas conserva el conjunto completo (`Toolbar.tsx`); fondo blanco, sin forma de píldora, 40px de alto, y el interruptor **Provenance** al final a la derecha.
- El bubble menu de selección ofrece: B, I, U, Cite, Comment, **Ask AI** (abre el asistente con la selección como contexto).
- El provenance gutter es visible por defecto y se apaga con el interruptor de la barra; su estado se persiste en `localStorage` (`provenance_gutter`).
- Panel del asistente: 400px, a la derecha, desmontable. En móvil, bottom sheet. Los adjuntos permiten configurar hoja, rango y resultado; sus tarjetas se arrastran al documento con coste visible y procedencia conservada. Los gráficos admiten edición de datos y formato, conservando la primera versión y el origen.
- Los trabajos de una tarea abren el panel **Brief** (solo lectura, también en revisión) desde la session bar, el menú `⋯` y el menú móvil; sin tarea no aparece.
- Las plantillas solo escriben encabezados; la guía de cada sección es un placeholder (`data-hint`) que no cuenta, no se exporta y no se ve en revisión.

## 6. Reglas de copy

- Idiomas de la UI: inglés (base), español, francés y alemán. Documentación interna: español.
- Ninguna cadena visible se escribe literal en un componente: pasa por `useT()` (cliente) o `getT()` (servidor) de `src/lib/i18n`. Las claves viven en `src/lib/i18n/messages/<área>.ts`, con el inglés como fuente de claves y `es`/`fr`/`de` tipados contra él (falta una traducción → error de compilación). Fechas y números con `useFormat()`.
- Español en segunda persona informal (tú); francés con vous; alemán con Sie. Mismo tono sobrio, sin exclamaciones. Glosario obligatorio en `messages/common.ts` (`glossary.*`): Written → Escrito / Rédigé; AI-assisted → Con ayuda de IA / Assisté par IA; Quoted or pasted → Citado o pegado / Cité ou collé; Integrity ledger → Registro de integridad / Registre d'intégrité; Final submission → Entrega final / Dépôt final; Notice → Aviso / Avis. En alemán: Geschrieben / KI-unterstützt / Zitiert oder eingefügt / Integritätsregister / Endabgabe / Hinweis. Paper → Trabajo / Travail / Arbeit; Assignment → Tarea / Devoir / Aufgabe; Brief → Enunciado / Consigne / Aufgabenstellung; Teacher → Docente / Enseignant / Lehrkraft; Primary data → Datos primarios / Données primaires / Primärdaten. "Thesisfic AI" y "Research copilot" no se traducen.
- Entrada por idioma: `/es`, `/fr`, `/de`, `/en` (y `?lang=`) fijan la cookie `locale`; el selector `LanguageSwitcher` la cambia sin recargar y guarda `preferences.language` si hay sesión.
- Tono: sobrio, concreto, segunda persona. Sin signos de exclamación, sin "¡Bienvenido!", sin "empower", "transform", "revolutionary".
- Hablar de "notices", "attributed", "declared"; nunca de "detected", "caught", "suspicious", "cheating".
- Toda acción irreversible o con coste muestra una frase de consecuencia antes del botón (principio 5).

## 7. Arquitectura y límites técnicos

- Stack fijo: Next 14 (App Router), React 18, Tailwind 3, TipTap 2, `lucide-react`. No añadir librerías de UI ni de estado global.
- `src/lib/db.ts` es el único acceso a datos (memoria + `DATA_FILE` opcional). Cambios de esquema se hacen ahí y en `src/components/editor/types.ts`.
- No tocar `extensions.ts` (Provenance, CommentMark, CitationMark) sin la prueba manual: insertar IA → marca; pegar → diálogo; pegar texto de una respuesta del copilot → reconocido y marcado; copiar entre pestañas → sin diálogo. Si se toca el nodo `chart`, el pegado o la inserción de artefactos, además: insertar tabla y gráfico del copilot → tarjeta de coste, marca y «Fig · AI»; pegar desde notas a Final submission contenido IA → tarjeta de coste antes de pegar; copiar o arrastrar el gráfico → no entra como imagen sin origen.
- Los cuatro contadores de procedencia (cliente, `db.ts`, `integrity.ts`, `process.ts`) quitan las figuras `figure[data-chart]` antes de contar palabras; las figuras se cuentan aparte (`computeFigures` ≡ `figureStats.ts`).
- Las rutas `/api/*` mantienen sus contratos; si se añade un campo a una respuesta, es opcional.
- Componentes compartidos viven en `src/components/ui.tsx`. Si un patrón se repite 3 veces, se extrae ahí.
- Accesibilidad mínima: cada control con `aria-label` o texto visible, foco visible, contraste 4.5:1.
- `docs/design-handoff/` es documentación: excluida del build y del lint.

## 8. Definición de hecho (cada cambio)

- [ ] `npx tsc --noEmit` y `npm run build` pasan (`npm run lint` no funciona hasta que se instale ESLint).
- [ ] Captura antes/después para cualquier cambio visual.
- [ ] Copy revisado contra la sección 6.
- [ ] Sin hex sueltos: `grep -rn "#[0-9a-fA-F]\{6\}" src/components src/app --include=*.tsx` solo devuelve `QualitySeal.tsx`, el logo (`Logo.tsx`), paletas del editor en `types.ts`, los canvas de `HeroScene.tsx` y `FallingPapers.tsx` y colores de proveedores.
- [ ] Probado con las cuentas demo (estudiante, tutor, administración).
- [ ] Si toca el editor: prueba manual de la sección 7.

## 9. Cómo trabajar con PLAN.md

`PLAN.md` define las fases y su orden. Cada sesión empieza leyendo esta guía y la fase activa, enumera los archivos que va a tocar, implementa solo esa fase, y al terminar marca las tareas y resume en 5 líneas qué cambió y qué queda.
