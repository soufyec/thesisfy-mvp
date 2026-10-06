# CLAUDE.md — Thesisfic.edu

Guía para cualquier cambio hecho con Claude Code en `soufyec/thesisfy-mvp`. Léela entera antes de tocar código. Si una petición contradice esta guía, pregunta antes de implementar. Especificación visual detallada en `docs/design-handoff/README.md` (mockups en `docs/design-handoff/mockups/`); donde el handoff diga "Thesisfy", léase **Thesisfic**.

## 1. Qué es Thesisfic (y qué no es)

Thesisfic es una plataforma B2B para universidades que **registra la procedencia del texto de una tesis mientras se escribe** (escrito, pegado/citado, asistido por IA) y da al tutor un informe de proceso en vez de una "probabilidad de IA". El comprador es la institución (oficina de integridad, decanato, biblioteca). Los usuarios son estudiantes y tutores.

No es un detector. No acusa. No puntúa "probabilidad de IA". Cualquier texto, copy o funcionalidad que insinúe detección a posteriori es un error de producto.

## 2. Principios de producto (no negociables)

1. **Atribución en el momento, nunca inferencia después.** Toda marca de procedencia nace de un evento real: inserción desde el asistente, pegado, o pegado que coincide con las huellas por frase de una respuesta del asistente o del Research copilot (`responseFingerprints`). No añadir heurísticas que "adivinen" IA. No existe extensión de navegador ni vigilancia de sitios externos: se eliminó a propósito.
2. **El estudiante ve lo mismo que el tutor.** Ninguna métrica, aviso o registro es visible para el tutor y oculto para el estudiante.
3. **La IA piensa contigo, no escribe por ti.** El asistente puede esquematizar, criticar, corregir texto del estudiante, explicar, citar y, en modo **Research copilot**, conversar libremente sobre cualquier tema de la investigación. Nunca redacta texto de tesis. `src/lib/ai/policy.ts` y `prompts.ts` son la fuente de verdad; no relajar `GENERATION_PATTERNS` ni `BASE_SYSTEM`.
4. **Consentimiento primero, aplicado en servidor.** Los scopes de monitorización (interacciones con IA, ritmo de tecleo, pegados, actividad de pestañas) se eligen en cliente y se filtran en servidor (`/api/monitor/consent`, `/api/sessions/*`). No registrar texto tecleado, solo recuentos y huellas.
5. **Cada inserción de IA muestra su coste antes de ocurrir.** Palabras añadidas, nuevo % de IA respecto al límite, quién paga. Sin excepciones.
6. **La universidad paga la IA.** Los modelos se ofrecen y presupuestan desde `Admin → AI access & billing` (`src/lib/ai/funding.ts`, `providers.ts`); el estudiante puede añadir su propia cuenta, nunca es obligatorio.
7. **Honestidad comercial.** Ninguna cifra inventada (universidades, precisión, estudiantes). Si no hay dato, no hay número.

## 3. Vocabulario de UI (usar exactamente estos nombres)

| Concepto | Nombre en UI (EN) | Identificador en código |
|---|---|---|
| Asistente de IA | **Thesisfic AI** / **AI assistant** | `AssistantPanel` |
| Modo libre pagado por la universidad | **Research copilot** | `AIMode = "copilot"`, `Policy.researchCopilot` |
| Modos del asistente | **Research copilot · Ask · Brainstorm · Outline · Critique · Grammar · Summarize · Explain · Citations · Find gaps · Paraphrase** | `AIMode` (11), rejilla visible sin scroll horizontal; el copilot va destacado en primera posición |
| Marcas de procedencia en el margen | **Provenance gutter** | `ProvenanceGutter`, decoraciones en `extensions.ts` |
| Texto escrito por el estudiante | **Written** | `provenance: "human"` (no cambiar el valor almacenado) |
| Texto insertado desde IA | **AI-assisted** | `provenance: "ai"` |
| Texto pegado / citado | **Quoted or pasted** | `provenance: "paste"` |
| Desglose de la puntuación | **Integrity ledger** | `IntegrityLedger` (sustituye a `IntegrityPanel`) |
| Píldora resumen en la cabecera | **Integrity pill** | `IntegrityPill` (`ui.tsx`) |
| Sello de calidad de la landing | **Academic quality seal** | `QualitySeal` (`SEAL_NAME = "thesisfic.edu"`) |
| Pestaña que se entrega y evalúa | **Final submission** | `SUBMISSION` |
| Barra inferior de estado de sesión | **Session bar** | `SessionBar` |
| Aviso de integridad | **Notice** (nunca "flag" de cara al estudiante) | `IntegrityFlag` en datos |
| Modelos pagados por la universidad | **Provided by your university** | `InstitutionModel`, `/admin/ai-access` |

Cada modo lleva icono `lucide` (campo `icon` de `MODES` es el nombre del icono), una línea de ayuda y 2–4 sugerencias rápidas propias. No introducir agrupaciones intermedias.

## 4. Sistema visual

Definido en `tailwind.config.ts` y `globals.css`. Usar tokens, nunca hex sueltos en componentes. **Se conserva la identidad actual** (índigo + verde, Inter); se corrige la ejecución, no la paleta.

**Color**
- `brand` (primario, acciones): `brand-600` `#4c6ef5` como principal, `brand-50/100` para fondos suaves.
- `accent` (éxito, texto escrito por el estudiante, checks): `accent-500` `#20c997`.
- Gradiente de marca `brand-600 → accent-500`: solo en el logo, una palabra destacada por titular y el bloque CTA. Nunca en tarjetas, botones ni fondos de sección.
- Neutros: `gray-50…900`. Fondo de app `gray-50`, tarjetas `white`, área del editor `#f1f3f4` (`.docs-workspace`).
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
- Las pestañas del documento se mantienen como fila propia sobre la hoja, con "Final submission" bloqueada a la izquierda y `+` al final.
- La barra de herramientas conserva el conjunto completo (`Toolbar.tsx`); fondo blanco, sin forma de píldora, 40px de alto, y el interruptor **Provenance** al final a la derecha.
- El bubble menu de selección ofrece: B, I, U, Cite, Comment, **Ask AI** (abre el asistente con la selección como contexto).
- El provenance gutter es visible por defecto y se apaga con el interruptor de la barra; su estado se persiste en `localStorage` (`provenance_gutter`).
- Panel del asistente: 400px, a la derecha, desmontable. En móvil, bottom sheet.

## 6. Reglas de copy

- Idioma de la UI: inglés. Documentación interna: español.
- Tono: sobrio, concreto, segunda persona. Sin signos de exclamación, sin "¡Bienvenido!", sin "empower", "transform", "revolutionary".
- Hablar de "notices", "attributed", "declared"; nunca de "detected", "caught", "suspicious", "cheating".
- Toda acción irreversible o con coste muestra una frase de consecuencia antes del botón (principio 5).

## 7. Arquitectura y límites técnicos

- Stack fijo: Next 14 (App Router), React 18, Tailwind 3, TipTap 2, `lucide-react`. No añadir librerías de UI ni de estado global.
- `src/lib/db.ts` es el único acceso a datos (memoria + `DATA_FILE` opcional). Cambios de esquema se hacen ahí y en `src/components/editor/types.ts`.
- No tocar `extensions.ts` (Provenance, CommentMark, CitationMark) sin la prueba manual: insertar IA → marca; pegar → diálogo; pegar texto de una respuesta del copilot → reconocido y marcado; copiar entre pestañas → sin diálogo.
- Las rutas `/api/*` mantienen sus contratos; si se añade un campo a una respuesta, es opcional.
- Componentes compartidos viven en `src/components/ui.tsx`. Si un patrón se repite 3 veces, se extrae ahí.
- Accesibilidad mínima: cada control con `aria-label` o texto visible, foco visible, contraste 4.5:1.
- `docs/design-handoff/` es documentación: excluida del build y del lint.

## 8. Definición de hecho (cada cambio)

- [ ] `npm run build` y `npm run lint` pasan.
- [ ] Captura antes/después para cualquier cambio visual.
- [ ] Copy revisado contra la sección 6.
- [ ] Sin hex sueltos: `grep -rn "#[0-9a-fA-F]\{6\}" src/components src/app --include=*.tsx` solo devuelve `QualitySeal.tsx`, paletas del editor en `types.ts`, el canvas de `HeroScene.tsx` y colores de proveedores.
- [ ] Probado con las cuentas demo (estudiante, tutor, administración).
- [ ] Si toca el editor: prueba manual de la sección 7.

## 9. Cómo trabajar con PLAN.md

`PLAN.md` define las fases y su orden. Cada sesión empieza leyendo esta guía y la fase activa, enumera los archivos que va a tocar, implementa solo esa fase, y al terminar marca las tareas y resume en 5 líneas qué cambió y qué queda.
