# Handoff: Thesisfy — identidad, landing B2B, editor y asistente

Repo destino: `soufyec/thesisfy-mvp` (Next 14 App Router · React 18 · Tailwind 3 · TipTap 2 · lucide-react).

## 0. Qué hay en este paquete

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` (se entrega aparte, fuera de esta carpeta) | Reglas del proyecto. Copiar a la raíz del repo. Claude Code lo lee en cada sesión. |
| `PLAN.md` | Diagnóstico, dirección y 7 fases (0–6) con archivos, tareas, aceptación y prompt. Copiar a la raíz del repo. |
| `PROMPTS.md` | Los prompts exactos a pegar en Claude Code, sesión por sesión. |
| `README.md` | Este documento: especificación visual precisa de los dos mockups finales. |
| `mockups/07 Landing Propuesta v3.dc.html` | **Referencia de la Fase 1** (sustituye a `05`). Abrir en un navegador (necesita `support.js` al lado). Añade motion al hacer scroll y la sección `#model` como scrollytelling. |
| `mockups/05 Landing Propuesta v2.dc.html` | Versión estática anterior; misma estructura y copy que `07`, sin motion. |
| `mockups/08 Editor Onboarding.dc.html` | `06` + onboarding del estudiante (modal de intro y tour de 6 coachmarks). Referencia de la Fase 5. Tweak `onboarding` para reproducirlo. |
| `mockups/06 Editor Propuesta v2.dc.html` | Referencia de las Fases 2, 3 y 4. Viewport mínimo 1440px. |
| `mockups/01 Landing Actual`, `02 Editor Actual` | Recreación del estado actual del repo, para comparar antes/después. |

### Sobre los mockups
Los `.dc.html` son **referencias de diseño hechas en HTML**, no código de producción. La tarea es **recrearlos dentro del codebase existente** (componentes React + Tailwind con los tokens de `tailwind.config.ts`), reutilizando `ui.tsx`, `Toolbar.tsx`, `AssistantPanel.tsx`, etc. No copiar HTML ni estilos inline al repo.

### Fidelidad
**Alta.** Colores, tipografías, tamaños, radios y copy son finales. Recrear tal cual con los tokens equivalentes. Donde el mockup usa un hex, abajo se indica el token.

---

## 1. Tokens (hex → token Tailwind)

**Marca**
- `#4c6ef5` → `brand-600` (principal). `#4263eb` → `brand-700` (hover, texto sobre fondo suave). `#3b5bdb` → `brand-800`. `#364fc7` → `brand-900`.
- `#5c7cfa` → `brand-500`. `#748ffc` → `brand-400`. `#91a7ff` → `brand-300`. `#bac8ff` → `brand-200`. `#dbe4ff` → `brand-100`. `#f0f4ff` → `brand-50`.
- `#20c997` → `accent-500`. `#0ca678` → `accent-700`. `#63e6be` → `accent-300`. `#96f2d7` → `accent-200`. `#e6fcf5` → `accent-50`.
- Gradiente de marca: `linear-gradient(135deg, brand-600, accent-500)`. Solo en: logo, una palabra del titular (`bg-clip-text`), bloque CTA de piloto.

**Procedencia** (nuevos tokens `prov.*`, Fase 0)
- `prov.ai` `#7c3aed`, fondo `rgba(124,58,237,.13)`, subrayado `rgba(124,58,237,.55)`. Texto de etiqueta oscuro: `#5b21b6` / `#6d28d9`. Fondo tarjeta: `#f5f3ff`, borde `#ddd6fe`.
- `prov.paste` `#f59e0b`, fondo `rgba(245,158,11,.16)`, subrayado `rgba(245,158,11,.6)`. Texto de etiqueta: `#b45309`.
- `prov.human` = `accent-500` `#20c997`.

**Neutros** (Tailwind `gray`): `#111827` 900 texto · `#374151` 700 · `#4b5563` 600 · `#6b7280` 500 · `#9ca3af` 400 · `#d1d5db` 300 · `#e5e7eb` 200 bordes · `#f3f4f6` 100 separadores · `#f9fafb` 50 fondos · `#f1f3f4` área del editor (ya existe en `.docs-workspace`).

**Estados**: `#16a34a`/`#059669` green-600, `#22c55e` green-500 (punto "Saved"/grabando), `#d97706` amber-600, `#d97757` punto del proveedor Claude (viene de `providers.ts`).

**Tipografía**: Inter 400/500/600/700/800. UI: 11 (solo etiquetas del gutter y chips), 12, 13, 14, 16. Landing: h1 58/800/1.05/−0.025em; h2 36/700/−0.02em; lead 19/1.6; cuerpo 14–16. Documento: Georgia 12pt / 1.6; h1 24pt; h2 16pt; h3 13pt.

**Radios**: 6 (iconos toolbar) · 8 (logo, chips de acción, pestañas arriba) · 10 (modos, popovers, botón nav) · 12 (inputs, CTAs, burbujas) · 16 (tarjetas, hoja preview) · 24 (bloque piloto) · 999 (píldoras, botones de cabecera del editor).

**Sombras**
- Tarjeta: `shadow-sm` (`0 1px 2px rgba(0,0,0,.05)`).
- Botón primario: `0 10px 20px -8px rgba(76,110,245,.5)`. Nav CTA: `0 8px 16px -6px rgba(76,110,245,.45)`.
- Hoja preview: `0 25px 50px -12px rgba(17,24,39,.15)`. Tarjeta formulario: `0 25px 50px -12px rgba(0,0,0,.25)`.
- Hoja del editor: `0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)` (actual).
- Bubble menu: `0 8px 24px -8px rgba(0,0,0,.4)`.

**Iconos**: lucide 15–18px, trazo 2.

---

## 2. Componentes compartidos (`src/components/ui.tsx`)

### IntegrityPill
Botón `rounded-full`, borde `gray-200`, fondo blanco, padding `6px 12px 6px 8px`, gap 8, Inter 13/600.
- Anillo 18px: `conic-gradient(prov.ai 0 A%, prov.paste A% (A+P)%, prov.human (A+P)% 100%)` con disco blanco interior de 10px. A = % AI, P = % paste.
- Texto: `AI 12% ` + `<span gray-400 font-normal>of 25%</span>` + ` · Integrity ` + `<span green-600>94</span>`.
- Click: abre `IntegrityLedger` (Fase 3).
- Variante landing (preview): fondo `brand-50`, color `brand-700`, anillo 16px sin disco, texto "AI-assisted 12% · limit 25% · Integrity 94".

### QualitySeal
Se mantiene el componente actual. `SEAL_NAME = "thesisfy.edu"`. En el hero: 100px, caption "Academic quality seal" 11/600 gray-900 debajo. Rotación del texto circular 60s lineal.

---

## 3. Landing (`src/app/page.tsx`) — ref. `mockups/07`

Contenedor `max-w-[1200px] mx-auto px-8`. Fondo blanco. Secciones alternan blanco / `gray-50`.

### 3.1 Nav
Sticky, 64px, `bg-white/85 backdrop-blur-xl`, borde inferior `gray-100`. Izq: logo 32px radio 8 gradiente de marca + icono shield blanco 20px; "Thesisfy" 20/700 + ".edu" en `brand-600`. Der: enlaces 14/500 `gray-600` con gap 28: Integrity model (`#model`) · For institutions (`#roles`) · Pilot programme (`#pilot`) · Sign in (`/login`) · botón **Request a pilot** (`brand-600`, blanco, `9px 16px`, radio 10, 600, sombra nav).

### 3.2 Hero
Padding `72px 32px 56px`. Grid `minmax(0,1fr) 104px`, gap 32, `min-height 520px`, `position:relative; overflow:hidden`.

**Columna texto** (`max-w-[720px]`, z-index 1):
- Badge: `inline-flex gap-2 px-3.5 py-2 rounded-full bg-brand-50 text-brand-700 text-[13px] font-semibold`, icono shield 14px. Texto: `Academic integrity for the AI era`. Margen inferior 28.
- H1 58/800/1.05/−0.025em, `text-wrap:pretty`, margen inferior 24: `Evidence of the writing process, <gradient>not suspicion</gradient> of the result.`
- Párrafo 19/1.6 `gray-600`, `max-w-[560px]`, margen inferior 36: `Thesisfy attributes every sentence of a thesis as it is written: typed, quoted or AI-assisted. Advisors receive a provenance report. Students use the AI tools your policy allows, inside the editor, with their consent and under your budget.`
- CTAs (flex gap 12): primario `Request a pilot` + flecha 18px (`15px 26px`, radio 12, 16/600, sombra primaria) · secundario `Read the integrity model` (blanco, borde 2px `gray-200`, `gray-700`).
- Bullets (margen superior 36, flex gap 24, 13px `gray-500`, punto 8px): `accent-500` Consent-first, GDPR by design · `prov.ai` No AI-probability guessing · `prov.paste` AI costs billed to the institution.

**Columna sello**: `QualitySeal` 100px, `margin-top:-16px`, centrado, caption debajo.

**Escena orbital (`HeroScene.tsx`, canvas 2D)**: `position:absolute; inset:0` sobre el grid del hero, `opacity:.38`, `pointer-events:none`, `aria-hidden`. `devicePixelRatio` ≤ 2. Implementación de referencia: clase `Component` en `mockups/05`, método `componentDidMount`.
- Proyección: yaw = `t·0.02 + mouseX·0.5` rad, pitch = `−0.42 + mouseY·0.2`, F = 900, escala `S = clamp(min(W/640, H/330), 0.6, ∞)`. Centro X = `clamp(max(W·0.72, bordeDerechoDelTexto + 90), …, W − 60)`, centro Y = `H·0.55`.
- Cuerpos: **University** (sol, r 54, radial `brand-400 → brand-900`, glow `rgba(76,110,245,.28)`, icono shield-check blanco, pill "University / sets policy and budget"); **Student** (planeta, r 24, órbita 300, velocidad `t·0.08`, `accent-300 → accent-700`, pill "Student / writes the thesis"); **AI assistant** (luna, r 10, órbita 56 alrededor del estudiante, aplanada ×0.35, velocidad `t·0.38`, `#c4b5fd → #6d28d9`, etiqueta "AI"); **Advisor** (satélite, r 8, órbita 84 inclinada ×0.55, velocidad `t·0.26 + 1.3`, `brand-700`, etiqueta "Advisor", línea punteada `[2,4]` hacia el estudiante).
- Anillos: órbita principal `rgba(76,110,245,.18)`; luna `rgba(124,58,237,.3)`; satélite `rgba(76,110,245,.25)` discontinuo `[3,4]`. 80 partículas de fondo en `brand-200 / accent-200 / #ddd6fe`.
- Pills: fondo `rgba(255,255,255,.96)`, borde `gray-200`, radio 10, 12.5/600 + 10.25/500 `gray-500`; en hover (radio 70/44/26/26 px) fondo = color oscuro del cuerpo, texto blanco.
- Parallax: `pointermove` en la sección; mouse suavizado `lerp 0.05`. `prefers-reduced-motion`: ángulos fijos (yaw .4, estudiante .9, luna 2.1, satélite 4.0), sin rAF continuo.

### 3.3 Preview del editor (`HeroEditorPreview.tsx`, estático)
`margin-top:56px`. Halo detrás: `inset:-8px`, gradiente `rgba(76,110,245,.12) → rgba(32,201,151,.12)`, radio 28, `blur(48px)`. Tarjeta: blanco, borde `gray-200`, radio 16, sombra hoja, `overflow:hidden`.
- Cabecera 12×20, borde inferior `gray-100`, 13px `gray-500`: icono doc 28px `brand-600` + **Chapter 1 · Introduction** (600 gray-900) + `· Final submission`; a la derecha `IntegrityPill` variante landing.
- Grid `minmax(0,1fr) 320px`. Izquierda: `padding 28px 32px 28px 64px`, Georgia 15/1.7 `#202124`, borde derecho `gray-100`, gap 14. Tres párrafos con gutter a `left:-40px` (etiqueta 10px + barra 3px): ¶1 verde; AI violeta con texto resaltado y sufijo Inter 11/600 `Claude · Outline · 9 Mar`; Q ámbar con texto resaltado y sufijo `Quoted · Reichstein 2019`. Textos en el mockup; datos del seed `thesis_1`.
- Derecha `gray-50`, padding 20: título "INTEGRITY LEDGER" 12/600 `gray-500` tracking .08em; filas 13px con borde `gray-200`: Starting score 100 · Pasted text attributed −0 (green) · AI share 12% of 25% limit −0 (green) · 1 open notice · bulk paste 240 words −6 (amber) · **Integrity 94** (14/700 green). Nota 12px `gray-500`: `Every deduction maps to an action the student can take. Advisor and student see the same ledger.`
- Pie 10×20, borde superior, 12px `gray-500`, leyenda con barras 10×3: Written by the student · AI-assisted, declared · Quoted or pasted.

### 3.4 `#model` — tres pilares (scrollytelling, `IntegrityModelStory.tsx`)
`padding 80px 32px 40px` `bg-gray-50`. Título centrado 36/700: `Why a provenance report beats an <gradient>AI score</gradient>`; sub 16px `gray-600` `max-w-[600px]`: `Three design decisions that hold up in an appeal hearing.` Margen inferior 24.

**Layout ≥ 900px**: grid `minmax(0,1fr) minmax(0,1fr)` gap 48. Columna izquierda `position:sticky; top:104px; height:520px`, con **tres paneles superpuestos** (`position:absolute; inset:0`, blanco, radio 16, borde `gray-200`, sombra `0 20px 40px -20px rgba(17,24,39,.18)`, padding 24). Columna derecha: tres bloques de texto de `min-height:62vh` centrados verticalmente: número 44px radio 12 `brand-50`/`brand-600`; h3 26/700/1.2 −0.02em; p 17/1.65 `gray-600` `max-w-[480px]`.
- **Paso activo** = el bloque de texto cuyo rect cruza `innerHeight/2` (o el más cercano), calculado en el handler de scroll con rAF. El panel activo: `opacity 1; transform none`; anteriores `translateY(-24px) scale(.97)`; siguientes `translateY(24px) scale(.97)`; opacidad 0. Transición `opacity .5s, transform .6s cubic-bezier(.2,.7,.2,1)`. Los textos no activos bajan a `opacity .35`.
- Panel 0 (atribución): cabecera "Chapter 2 · Methods" + "Saved · 14:36"; tres párrafos Georgia 14/1.7 con gutter (¶3 verde · Q ámbar "Pasted 14:32 · attributed on entry" · AI violeta "Claude · Grammar · 14:36" con caret parpadeante 1s); abajo, tarjeta ámbar (`#fffbeb`, borde `#fde68a`, radio 12): "**240 words pasted.** Mark them so the ledger stays at 100." + chips "Quoted · add source" (`prov.paste` fondo) · "Copied from an AI tool" · "My own notes".
- Panel 1 (ledger): eyebrow "INTEGRITY LEDGER" + chip `accent-50`/`accent-700` "Visible to you and your advisor"; filas 14px con sub-línea 12px `gray-400` (§2 ¶4 · 14:32) y botón de acción `brand-50`/`brand-700` ("Add source", "Reply"); total "Integrity **94**" 28/700 green; nota "No probability. No hidden weighting. Resolve the notice and the score returns to 100."
- Panel 2 (consentimiento): eyebrow "MONITORING SCOPES · CHOSEN BY THE STUDENT, WITHIN POLICY"; cinco filas con toggle 34×20 (`brand-600` on / `gray-300` off; los bloqueados por política en `gray-400`): Pastes and quotes · AI assistant use · Session word counts · Keystrokes (off, "Not available under this institution's policy") · Clipboard contents (off, "Never recorded"); bloque terminal `gray-900` monoespaciado 12px: `server › event keystroke_sample dropped · outside granted scopes` / `server › event paste_count stored · receipt #4f2a` (`accent-300`); enlace "Download consent receipt" con icono `download`.

**Layout < 900px** (y `prefers-reduced-motion`): las tres tarjetas estáticas de la versión anterior (grid 1 col gap 24, radio 16, borde `gray-100`, `shadow-sm`, padding 28; número 44px; h3 17/600; p 14/1.65). Sin paneles.
1. **Attribution at the moment of writing** — Text inserted from the assistant, pasted from a source or copied from an external AI tool is marked when it enters the document. Nothing is inferred afterwards.
2. **A ledger the student can see and fix** — The integrity score is a sum of visible deductions: unattributed pastes, AI share above policy, open notices. Every point maps to an action the student can take.
3. **Consent and policy enforced on the server** — Students choose monitoring scopes within the institution's policy. Events outside the granted scopes are dropped even if a client sends them. Receipts are downloadable.

### 3.5 `#roles` — tres lectores
`py-20` blanco. Título centrado 36/700 `One record, three readers`. Grid 3 col gap 24, tarjetas como arriba. Chip 12/600 radio 999 `4px 10px`; h3 20/700/1.3; lista 14/1.55 `gray-600` gap 10 con check lucide 16px `accent-500`.
- **Integrity office** (chip `brand-50`/`brand-700`) · *Fewer accusations, better evidence* · A policy you set once: AI share limit, permitted tools and modes, monitoring scopes. / Provenance reports instead of probability scores in appeal hearings. / Monthly AI spend by model and department, with budget alerts.
- **Advisors** (`accent-50`/`accent-700`) · *Read the process, not just the draft* · Which passages were AI-assisted, pasted or written, with dates. / Session timeline and AI log alongside the chapter you are reviewing. / Approve, request revision or comment without leaving the document.
- **Students** (`#f5f3ff`/`#6d28d9`) · *Use AI openly, within the rules* · Claude, GPT, Gemini or Mistral inside the editor, paid by the university or their own account. / An assistant that outlines, critiques and corrects, but never writes the thesis. / Clear view of their own AI share and what each insertion costs.

### 3.6 `#pilot` — formulario
`padding 40px 32px 96px`. Bloque `linear-gradient(135deg, brand-600, brand-800)`, blanco, radio 24, padding 56, grid `6fr 5fr` gap 48.
- Izq: eyebrow 12/700 tracking .14em uppercase `brand-200` `Pilot programme`; h2 36/700/1.15 `One department. One semester. A report you can take to the academic board.`; p 16/1.6 `brand-100` `max-w-[520px]`: `We set up your AI policy together, onboard advisors and students in a 45-minute session, and deliver an end-of-term integrity report with provenance statistics, consent records and AI spend.`
- Der: tarjeta blanca radio 16 padding 28 gap 14, sombra formulario. Labels 13/600 `gray-700`; inputs radio 12 `12px 14px` 14px `gray-50` borde `gray-200`, en este orden: **Name** (`Full name`, requerido) · Institution (`University of …`) · Work email (`name@university.edu`) · Role (select: Integrity office / Dean / Library) · **Phone** (label con "Optional" 12/400 `gray-400` a la derecha; placeholder `+34 600 000 000`; `type="tel"`, no requerido). Botón primario `Request a pilot` 14px padding, 15/600. Nota 12px `gray-500` centrada: `Pilots are scoped per department. No public pricing yet.`
- Submit → `POST /api/leads { name, institution, email, role, phone? }` → `db.leads`. Validar `name`, `institution`, `email` (dominio no gratuito opcional), `role`; `phone` opcional. Éxito: sustituir el formulario por `Thanks. We will reply from a thesisfy.edu address within two working days.` Error: línea 12px `red-600` bajo el botón.

### 3.7 Footer
Borde superior `gray-100`, padding 32, 13px `gray-500`. Logo 24px + "Thesisfy.edu" 16/700 · enlaces Integrity model · Data & consent · Privacy · Contact · `© 2026 Thesisfy.edu`.

### 3.8 Motion al hacer scroll (`useScrollMotion.ts`, `Reveal.tsx`)
Toda la landing respeta `prefers-reduced-motion` (todo estático, elementos visibles). Implementación de referencia: `setupScroll()` en `mockups/07`.
- **Barra de progreso**: `fixed top-0` 2px `brand-600`, `transform: scaleX(scrollY / (scrollHeight − innerHeight))`, `transform-origin: left`.
- **Nav**: a partir de `scrollY > 8`, sombra `0 8px 24px -16px rgba(17,24,39,.25)` y borde `gray-200`; transición .3s.
- **Reveal** (`<Reveal variant="up|left|right|scale" delay={ms}>`): estado inicial `opacity 0` + `translateY(28px)` / `translateX(∓36px)` / `translateY(44px) scale(.96)`; al entrar (IntersectionObserver, `threshold .12`, `rootMargin 0 0 -6%`) pasa a `opacity 1; transform none`; transición `opacity .7s cubic-bezier(.2,.7,.2,1), transform .9s` + `transition-delay`. Se dispara una vez. Dónde: badge, h1 (80ms), párrafo (160), CTAs (240), bullets (320), sello (scale, 300), caption (450), preview del editor (scale, 200), títulos de sección, tarjetas de roles (0/120/240), columnas del bloque piloto (left / right 120).
- **Parallax del hero**: columna de texto `translateY(scrollY·0.1)`, sello `translateY(scrollY·0.18)`; `will-change: transform`.
- **Escena orbital**: yaw suma `scrollY·0.0012` rad al ángulo (gira al hacer scroll además del ratón).
- **Ledger del preview** (al 40% visible, una vez): filas con `opacity 0; translateX(12px)` entran cada 170ms a partir de 350ms; después el total y la píldora cuentan 100 → 94 en 900ms (ease-out cúbico, `tabular-nums`).
- **Tarjetas de roles**: hover `box-shadow 0 20px 40px -24px rgba(17,24,39,.25)`, borde `gray-200`, .3s.
- Todos los listeners de scroll pasivos y agrupados en un rAF.

### 3.9 Responsive
< 1024px: hero a una columna (sello encima del texto, 80px), preview a una columna (ledger debajo), roles a 1 col, bloque piloto a 1 col. `#model` pasa a tarjetas < 900px (ver 3.4). Escena orbital oculta < 768px. Sin parallax < 768px.

---

## 4. Editor (`DocsEditor.tsx` + hijos) — ref. `mockups/06` (onboarding: `mockups/08`)

Columna flex a `100vh`, fondo `#f1f3f4`, `min-width` de diseño 1440px. Cromo: cabecera 52 · toolbar 40 · pestañas 34 · (documento + panel) · session bar 30.

### 4.1 Cabecera (52px, blanco, borde inferior `gray-200`, gap 12, padding `0 12px 0 8px`)
Volver (32px, lucide `arrow-left` 18 `gray-500`) · icono doc 30px radio 8 `brand-600` · título 16/600 ellipsis `min-width:200px; flex:1` · `Saved` 12px `gray-400` con punto 6px `green-500` · `IntegrityPill` · botón **AI assistant** (`rounded-full`, `7px 12px`, 13/600, icono `bot` 15; activo `brand-600`/blanco, inactivo `brand-50`/`brand-700`) · **Share** (`rounded-full`, borde `gray-200`, blanco, 13/600) · `⋯` 32px `gray-500` (abre File/Edit/View/Insert/Format/Tools/Help como lista; conserva `MenuAction` y atajos).

### 4.2 Toolbar (40px, blanco, borde inferior `gray-200`, padding `0 10px`, gap 1)
Botones 30×30 radio 6, icono 16, `gray-700`; deshabilitado opacidad .3; separadores 1×18 `gray-200` margen `0 4px`. Orden: Undo · Redo · Print · Spelling | Zoom (icono + `100%`) | Estilo (`Normal text` ▾, 112px) | Fuente (`Default` ▾, 104px) | − `12` + | B · I · U · S | Color (A + barra 3px) · Highlight (icono + barra `#fff59d`) | Link · Comment · Cite · Image · Table | Align ▾ · `Spacing` ▾ (84px) · Checklist · Bullets · Numbered · Outdent · Indent | Super · Sub · Clear formatting | `margin-left:auto` **Provenance** toggle (track 28×16 radio 999, `brand-600` on / `gray-300` off, knob 12px blanco; label 12px `gray-500`). Persistir en `localStorage.provenance_gutter`. `overflow:hidden; white-space:nowrap`.

### 4.3 Pestañas (34px, fondo `#f1f3f4`, borde inferior `gray-200`, padding `6px 16px 0`)
Estilo `.doc-tab` actual: `6px 12px`, radio `8 8 0 0`, 13px. Activa: blanco, borde `gray-200` sin inferior, `gray-900` 500, icono `file-check` `brand-600` 16 + candado `lock` 12 `gray-400` (Final submission, bloqueada a la izquierda). Inactivas: `gray-600`, icono `file` 14 `gray-400`. Al final `+` 16px `gray-500`.

### 4.4 Documento
`main` scroll, padding `28px 0 60px`. Hoja 21cm, `padding 2.2cm 2.54cm 2.54cm`, sombra hoja, Georgia 12pt/1.6 `#202124`. Citas inline `#0b7a5a`.

**Provenance gutter** (`ProvenanceGutter.tsx`, Fase 3): por bloque de nivel superior, `position:absolute; left:-52px; top:4px; bottom:4px`, flex gap 6: etiqueta Inter 10px (`¶n` `gray-400` 400 · `AI` `prov.ai` 700 · `Q` `#b45309` 700) + barra 3px radio 2 del color dominante. Dentro del texto, los tramos AI/paste llevan fondo + `border-bottom:2px` según tokens `prov.*`.

**Anotación de margen derecho** (hover o `reviewMode`): `position:absolute; right:-2.2cm; width:1.9cm`, Inter 10.5/1.35, `border-left:2px` color de procedencia, `padding-left:8px`. Línea 1 en color (`Claude · Outline` / `Pasted · attributed`), línea 2 `gray-400` (`9 Mar, 48 words` / `Reichstein 2019`). Datos de `interactionId`/`label` de la marca.

**Bubble menu** (selección): fondo `gray-900`, radio 10, padding 4, gap 2, sombra bubble, 12px blanco. B · I · U (28×28) | separador `rgba(255,255,255,.2)` | Cite · Comment (icono 13 + texto, `0 9px`) · **Ask AI** (`brand-600`, 600, `0 10px`) → abre el panel con la selección como "Working on".

### 4.5 Panel del asistente (`AssistantPanel.tsx`, 400px, borde izquierdo `gray-200`, blanco)
- **Cabecera** `12px 16px`, borde inferior `gray-100`: icono 30px radio 8 `brand-600` sólido con `bot` blanco (sin gradiente) · `Thesisfy AI` 14/600 + `Thinks with you. Never writes your thesis.` 12px `gray-400` · chip proveedor 12px radio 999 `gray-100` con punto 7px color proveedor: `Claude · your account` + `chevron-down` 11 `gray-400` (click → popover con el selector completo) · historial `history` 16 `gray-500`.
- **Modos** `12px 16px 0` (`ModePicker.tsx`, estado `pickerOpen`, por defecto cerrado):
  - *Cerrado*: una barra `brand-600` radio 10, `8px 10px 8px 12px`, blanco, gap 10: icono del modo 16 · etiqueta 13/600 `flex:1` · `Change mode` 12px opacidad .85 + `chevron-down` 12. Click → abre.
  - *Abierto*: grid `repeat(5,1fr)` gap 6. Cada celda: columna centrada, gap 4, `padding 8px 2px 6px`, radio 10, borde 1px, icono 16 + etiqueta 11/500/1.1; `title` = description. Inactivo: blanco, borde `gray-200`, `gray-600`. Activo: `brand-600` fondo y borde, blanco. Click en una celda → cambia el modo **y cierra**. Sin línea de descripción debajo.
  Orden e iconos lucide: Ask `message-square` · Brainstorm `lightbulb` · Outline `list` · Critique `search` · Grammar `pencil` · Summarize `file-text` · Explain `graduation-cap` · Citations `book-marked` · Find gaps `circle-alert` · Paraphrase `shuffle`. Descripciones y sugerencias rápidas (**2 por modo**, recortar `QUICK` a dos): ver `MODES` en `mockups/06` (script final).
- **Working on**: margen `12px 16px 0`, `10px 12px`, borde `gray-200`, radio 10, `gray-50`, barra izquierda 3px `brand-600`. Eyebrow 11/600 uppercase tracking .06em `gray-400`: `Working on · §1 ¶2 · 48 words`; extracto Georgia 13/1.45 `gray-700` clamp 2 líneas; `✕` 12px `gray-400`.
- **Conversación** (scroll, `14px 16px`, gap 14): chips rápidos 12px `6px 10px` radio 8 `brand-50`/`brand-700`. Usuario: derecha, `max-w 85%`, 14/1.5, `9px 12px`, radio `12 12 2 12`, `brand-600` blanco. Asistente: meta 11px `gray-400` `Claude · Critique` + chip `logged` (`brand-50`/`brand-700` 600); burbuja `10px 12px` radio `12 12 12 2` `gray-100`. Acciones bajo la respuesta: 12px `5px 10px` radio 8 borde `gray-200` blanco `brand-700` 500 (`Guiding questions` · `Add as comment` / `Insert, marked as AI` · `Keep as notes` / `Replace selection`).
- **Tarjeta de coste** (obligatoria antes de cualquier inserción): borde `#ddd6fe`, fondo `#f5f3ff`, radio 12, padding 12. Cabecera punto 8px `prov.ai` + `Before you insert AI text` 12/600 `#5b21b6`. Cuerpo 12.5/1.5 `gray-700`: `Inserting this outline adds <b>64 AI-assisted words</b>. Your AI share goes from <b>12% to 14%</b> of the 25% your institution allows. It is marked in the document and visible to your advisor.` Botones: `Insert, marked as AI` (`prov.ai` blanco 600) · `Keep as notes` (borde `#ddd6fe`, `#5b21b6`). Si el nuevo % supera el límite: botón deshabilitado y la frase `This insertion would take you to 27%, above the 25% limit.` Añadir quién paga cuando el proveedor es institucional: `Billed to University of … (AI budget).`
- **Estado de carga** (mientras llega la respuesta): meta `Claude · {Mode}` y burbuja `gray-100` radio `12 12 12 2`, `min-width 220px`, `overflow:hidden`, `position:relative`, con tres capas:
  1. brillo: pseudo-capa `inset:0`, `linear-gradient(100deg, transparent 30%, rgba(255,255,255,.75) 50%, transparent 70%)`, `background-size 220% 100%`, `@keyframes shimmer { from { background-position:120% 0 } to { background-position:-120% 0 } }` 1.6s lineal infinito;
  2. fila 12px `gray-600`: tres puntos 6px `brand-600` con `@keyframes dot { 0%,80%,100% { translateY(0); opacity:.4 } 40% { translateY(-4px); opacity:1 } }` 1.2s, retardos 0 / .15s / .3s, + etiqueta de estado que rota cada 1.8s: `Reading your selection` → `Checking the citation` → `Drafting questions` → `Almost there` (por modo, 3–4 etiquetas; las de arriba son las de Critique);
  3. dos líneas esqueleto 8px radio 4 `gray-200` al 92% y 70%.
  Al llegar el primer token, la burbuja se sustituye por la respuesta en streaming. Respeta `prefers-reduced-motion` (sin brillo ni rebote; puntos estáticos).
- **Composer** `12px 16px 14px`, borde superior `gray-100`: caja `gray-50` borde `gray-200` radio 12 `9px 12px`; placeholder 14px `gray-400` `{Mode}… (Enter to send, Shift+Enter for a new line)`; botón enviar 28px radio 8 `brand-600` `arrow-up` 14.

### 4.6 Session bar (30px, blanco, borde superior `gray-200`, 12px `gray-500`, gap 18, padding `0 16px`)
Izq: punto 7px `green-500` con pulso 2.4s + `Session recording <b gray-900>pastes and AI use</b>, not keystrokes · <a underline dotted>change</a>` (abre `ConsentModal`). Der: `In progress · Advisor: Prof. Williams` · `3,214 of 20,000 words` · `Page 1 of 10` · `APA 7`.

### 4.7 Estado
`aiOpen` (bool, por defecto true en ≥1280px) · `provenanceGutter` (bool, `localStorage`) · `mode: AIMode` · `workingOn: {from,to,text,section,paragraph,words} | null` · `pendingInsert: {words, currentPct, newPct, limitPct, payer} | null`. Al abrir desde el bubble menu: `aiOpen=true`, `workingOn=selección`, modo sin cambiar.

### 4.8 Móvil (< 768px)
Panel como bottom sheet (base existente), toolbar con scroll horizontal, gutter oculto, modos en grid 5×2 igual (celdas 56px mínimo).

---

### 4.9 Correcciones pendientes detectadas en la revisión (aplicar en Fases 2–4)
- Tarjeta de coste: siempre indica quién paga. Cuenta personal: `Paid by your Claude account (≈ 0.4¢).`; institucional: `Billed to University of … (AI budget).` Ya reflejado en `mockups/06`.
- Etiquetas del gutter y anotación de margen: mínimo **11px** (el mockup usa 10–10.5; subir).
- El `✕` de "Working on" es icono lucide `x` 14px, no carácter de texto.
- Toolbar con `overflow:hidden` a 1440px oculta controles en portátiles de 1280. Regla de colapso: por debajo de 1366px, Super/Sub/Clear formatting y Checklist pasan al menú `⋯`; por debajo de 1280, también Image/Table/Spacing.
- La `IntegrityPill` muestra el nº de notices abiertos cuando > 0: punto 6px `amber-600` tras el score + `title="1 open notice"`. Sin él, el "−6" del ledger no tiene origen visible.
- Botón "Share" → "Share with advisor" (el único destinatario posible para un estudiante).
- Formulario de piloto: `input`/`select` reales con `aria-label`, nunca `span`.

### 4.10 Onboarding del estudiante (`StudentOnboarding.tsx`) — ref. `mockups/08`
Se muestra una vez al primer acceso al editor tras crear la cuenta (`localStorage onboarding_v1 = "done"`; también `users.onboardedAt` en `db` para que no se repita en otro dispositivo). Reproducible desde el menú `⋯` → "Show the tour again". Dos partes encadenadas; `Skip` en cualquier momento termina las dos.

**A. Modal de intro** (4 páginas). Overlay `fixed inset-0 z-100 rgba(17,24,39,.55) backdrop-blur(4px)`, centrado, padding 24. Diálogo 720px, `max-height calc(100vh − 48px)`, blanco, radio 16, sombra `0 25px 50px -12px rgba(0,0,0,.35)`, columna flex. Media arriba (se encoge, `min-height 140px`), texto (`20px 28px 16px`: eyebrow 12/600 uppercase `brand-700`, h2 22/700/1.25, p 14/1.6 `gray-600`), pie (`0 28px 20px`: `Skip` 13px `gray-500` · puntos 6px (`activo 18×6 brand-600`, resto `gray-200`, clicables) · `Back` secundario · primario `brand-600` radio 8 13/600).
1. **Vídeo** (`aspect-ratio 16/9`, `max-height 42vh`, fondo `gray-900`, botón play 64px blanco con `play` `brand-600`): capítulos con barra segmentada 3px y marcas `0:00 Writing & provenance · 0:50 Thesisfy AI · 1:40 Integrity ledger · 2:10 Your advisor`; duración 2:40. **El vídeo no existe aún**: componente `<video>` con `poster` y `src` configurables en `src/lib/onboarding.ts`; hasta tenerlo, mostrar el placeholder del mockup. Eyebrow `Welcome to Thesisfy` · h2 `A two-minute tour of how your thesis is written here` · p `Watch the video or skip ahead. Afterwards we will point out six parts of the editor you will use every week.` · botón `Next`.
2. **Provenance** (media `aspect-ratio 16/7`, `max-height 36vh`, fondo `brand-50`, tarjeta blanca con un párrafo Georgia 14 y las tres marcas + leyenda Written / AI-assisted / Quoted or pasted). Eyebrow `Provenance` · h2 `Every sentence keeps a record of where it came from` · p `Nothing is guessed afterwards. Text you write, text you paste and text you insert from the assistant are each marked the moment they enter the document.`
3. **Thesisfy AI** (fondo `#f5f3ff`; tarjeta con la rejilla de 10 modos, Outline activo, y la tarjeta de coste). Eyebrow `Thesisfy AI` · h2 `The assistant thinks with you. It never writes your thesis.` · p `Ten modes to outline, critique, correct and cite. Before any AI text is inserted you see the words added, your new AI share and who pays.`
4. **Integrity** (fondo `accent-50`; tarjeta con tres filas de ledger y chip `Same view as your advisor`). Eyebrow `Integrity` · h2 `You and your advisor see exactly the same ledger` · p `Your score is a sum of visible items you can fix. There are no hidden metrics and no accusations, only notices with an action attached.` · botón `Start the tour`.

**B. Tour de 6 coachmarks** sobre la UI real. Capa `fixed inset-0 z-100 pointer-events:none`. *Foco*: div posicionado sobre el rect del ancla + 6px de margen, radio 10, `box-shadow 0 0 0 9999px rgba(17,24,39,.5), 0 0 0 3px rgba(76,110,245,.9), 0 0 0 8px rgba(76,110,245,.25)`, transición `all .45s cubic-bezier(.2,.7,.2,1)`. *Tarjeta*: 320px, blanco, radio 12, sombra `0 20px 40px -12px rgba(17,24,39,.35)`, padding `18px 18px 14px`: fila eyebrow 11/600 uppercase `brand-700` + contador `n / 6` `gray-400`; h3 16/700; p 13/1.55 `gray-600`; pie `Skip tour` 12px `gray-500` · `Back` · primario (`Next`, último `Start writing`). Colocación: `below` (centrada bajo el ancla, 14px), `left` o `right`; se recorta a 12px del viewport y si no cabe abajo se pone encima. Anclas con `data-tour`. Si el ancla está dentro del `main` desplazable, antes de medir se ajusta `main.scrollTop` para que el ancla quede visible con sitio para la tarjeta (no usar `scrollIntoView`). Re-medir en `resize`.

| # | `data-tour` | Ancla | Eyebrow / título | Texto | Pos. |
|---|---|---|---|---|---|
| 1 | `editor` | Toolbar completa | The editor / `Write as you would anywhere` | `Full formatting, comments, citations, images and tables. The Provenance switch at the far right shows or hides the margin marks; your work is recorded either way.` | below |
| 2 | `integrity` | `IntegrityPill` | Integrity pill / `Your AI share and score, always in view` | `12% of your text is AI-assisted against a 25% limit. Click to open the ledger and see each item behind the score. Your advisor sees the same.` (valores reales) | below |
| 3 | `model` | Chip de proveedor del panel | Change model / `Choose which AI model you work with` | `Claude, GPT, Gemini or Mistral, on your university's budget or your own account. Every reply is logged with the model used.` | below |
| 4 | `feedback` | Comentario del tutor en el margen (si no hay, el botón Add comment de la toolbar) | Feedback / `Your advisor comments in the margin` | `Replies stay attached to the paragraph. Resolving a comment clears its notice from the ledger. Use Add comment in the toolbar to ask a question of your own.` | left |
| 5 | `tabs` | Fila de pestañas | Parts of the thesis / `Move between chapters and notes` | `Final submission is what gets evaluated. Add tabs for notes or drafts; copying between your own tabs needs no attribution.` | below |
| 6 | `citations` | Primer bloque `paste` del documento (si no hay, el botón Cite) | Citations / `Quote, paste and cite without penalty` | `Pasted text is marked in amber and asks for a source. Select it and press Cite, or ask the Citations mode to format the reference in APA 7.` | right |

El comentario del tutor en el margen (ancla 4) sigue el estilo de las anotaciones de margen: 11px, borde izquierdo 2px `brand-600`, `Prof. Williams` `brand-700` · texto `gray-500` · `Reply` `gray-400`. Si el panel del asistente está cerrado, el paso 3 lo abre antes de medir. Con `prefers-reduced-motion`, sin transiciones de posición.

## 5. Copy
Inglés, sobrio, segunda persona. Prohibido: detected, caught, suspicious, cheating, flag (de cara al estudiante), signos de exclamación. Usar: attributed, declared, notice, logged. Cualquier acción con coste muestra la frase de consecuencia antes del botón.
