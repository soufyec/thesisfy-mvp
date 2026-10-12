# PROMPTS.md — Qué pegar en Claude Code, en orden

## Preparación (una vez)

1. Descarga y descomprime `design_handoff_thesisfy.zip` en la raíz de `thesisfy-mvp`.
2. Descarga `CLAUDE.md` (va aparte) y colócalo en la raíz del repo. Copia `design_handoff_thesisfy/PLAN.md` también a la raíz (la copia de la raíz manda).
3. Añade `design_handoff_thesisfy/` a `.eslintignore` y `"design_handoff_thesisfy/**"` al `exclude` de `tsconfig.json` para que no entre en el build.
4. Para ver un mockup: abre `design_handoff_thesisfy/mockups/07 Landing Propuesta v3.dc.html` en el navegador (necesita `support.js` al lado, ya incluido).
5. Crea una rama por fase: `git checkout -b fase-0-fundamentos`.
6. Abre Claude Code en la raíz del repo.

## Sesión 0 · Fundamentos

```
Lee CLAUDE.md entero y la Fase 0 de PLAN.md. Ejecuta la Fase 0 de PLAN.md. No cambies layouts ni copy; solo tokens, primitivas, sello e iconos de modos. Antes de escribir código, enumera los archivos que vas a tocar y confirma que están en la lista de la fase. Al terminar, ejecuta npm run build y npm run lint, marca las tareas en PLAN.md y resume en 5 líneas qué cambió y qué queda.
```

## Sesión 1 · Landing B2B

```
Lee CLAUDE.md y la Fase 1 de PLAN.md. La especificación visual exacta está en design_handoff_thesisfy/README.md §3 y el mockup de referencia en design_handoff_thesisfy/mockups/07 Landing Propuesta v3.dc.html (es una referencia HTML, no código a copiar: recréala con componentes React + Tailwind y los tokens del proyecto; la lógica de motion de referencia está en los métodos setupScroll y setupScene de su clase Component). Ejecuta la Fase 1 en este orden: 1) página estática completa sin motion, 2) HeroScene.tsx (§3.2), 3) Reveal + useScrollMotion (§3.8), 4) IntegrityModelStory (§3.4). Enséñame el resultado al final de cada paso antes de seguir. Copy en inglés tal cual aparece en el README; no inventes cifras. Todo el motion debe desactivarse con prefers-reduced-motion.
```

## Sesión 2 · Cromo del editor

```
Lee CLAUDE.md y la Fase 2 de PLAN.md. Especificación en design_handoff_thesisfy/README.md §4.1–4.3, 4.6 y mockup en design_handoff_thesisfy/mockups/06 Editor Propuesta v2.dc.html. Ejecuta la Fase 2, incluidas las correcciones de README §4.9 que afectan a cabecera y toolbar (Share with advisor, regla de colapso). No toques la lógica de guardado, pestañas ni sesión: solo mueve y rediseña la UI. Mantén todos los MenuAction y atajos. Al terminar, haz la prueba manual de CLAUDE.md §7 y dime el alto total del cromo superior en px.
```

## Sesión 3 · Provenance gutter e Integrity ledger

```
Lee CLAUDE.md y la Fase 3 de PLAN.md. Especificación en design_handoff_thesisfy/README.md §2 (IntegrityPill) y §4.4. Ejecuta la Fase 3. Empieza por el plugin de cálculo en extensions.ts y muéstrame el shape de datos por bloque antes de dibujar el gutter. El ledger debe sumar exactamente 100 − score con el seed thesis_1.
```

## Sesión 4 · Asistente de IA

```
Lee CLAUDE.md y la Fase 4 de PLAN.md. Especificación en design_handoff_thesisfy/README.md §4.5 y §4.7; mockup 06. Ejecuta la Fase 4. Mantén streamChat, onInsert y onReplaceSelection intactos; cambia la UI y añade la tarjeta de coste como paso obligatorio antes de cualquier inserción; la tarjeta siempre indica quién paga (README §4.9). El selector de modos es plegable (README §4.5): barra con el modo activo que despliega la rejilla 5×2; elegir un modo cierra la rejilla y cambia chips y placeholder. Dos sugerencias por modo. Icono del asistente sin gradiente. Implementa también el estado de carga animado de la respuesta. Al abrir la rejilla, los 10 modos deben verse completos a 400px de ancho, sin scroll horizontal y sin emojis.
```

## Sesión 5 · Onboarding y consentimiento

```
Lee CLAUDE.md y la Fase 5 de PLAN.md. Spec del onboarding en design_handoff_thesisfy/README.md §4.10 y mockup en design_handoff_thesisfy/mockups/08 Editor Onboarding.dc.html (ábrelo y pulsa Next para recorrer el modal y los 6 coachmarks; el tweak "onboarding" lo reinicia). Ejecuta la Fase 5 en este orden: 1) StudentOnboarding con el modal de 4 páginas (vídeo como placeholder configurable), 2) los 6 coachmarks con data-tour sobre el editor real, con scroll del documento al ancla y sin scrollIntoView, 3) persistencia (localStorage + users.onboardedAt) y "Show the tour again" en el menú ⋯, 4) ConsentModal y dashboards. Copy en inglés tal cual aparece en el README. Enséñame el tour funcionando a 1440×900 y 1280×720 antes de pasar al punto 4.
```

## Sesión 6 · Instrumentación

```
Lee CLAUDE.md y la Fase 6 de PLAN.md. Ejecuta la Fase 6. Ningún evento puede contener texto del estudiante, solo recuentos y huellas. Genera el informe con los datos del seed y muéstrame el DOCX resultante.
```

## Si Claude Code se sale de la fase

```
Eso está fuera de la fase activa. Anótalo en PLAN.md › Pendiente y sigue con la fase.
```

## Al cerrar cada sesión

```
Marca las tareas hechas en PLAN.md, añade a Pendiente lo que hayas encontrado fuera de la fase, y dame el resumen de 5 líneas. Haz commit con el mensaje "Fase N: <título>".
```
