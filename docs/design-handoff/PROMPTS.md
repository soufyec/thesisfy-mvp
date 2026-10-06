# PROMPTS.md — Qué pegar en Claude Code, en orden

## Preparación (una vez)

1. Copia `CLAUDE.md` (está en la raíz de este proyecto, no dentro de la carpeta) y `PLAN.md` a la raíz de `thesisfy-mvp`.
2. Copia la carpeta `design_handoff_thesisfy/` también a la raíz (Claude Code necesita leer `README.md` y los mockups). Añádela a `.eslintignore` y excluye `design_handoff_thesisfy/**` en `tsconfig.json` para que no entre en el build.
3. Crea una rama por fase: `git checkout -b fase-0-fundamentos`.
4. Abre Claude Code en la raíz del repo.

## Sesión 0 · Fundamentos

```
Lee CLAUDE.md entero y la Fase 0 de PLAN.md. Ejecuta la Fase 0 de PLAN.md. No cambies layouts ni copy; solo tokens, primitivas, sello e iconos de modos. Antes de escribir código, enumera los archivos que vas a tocar y confirma que están en la lista de la fase. Al terminar, ejecuta npm run build y npm run lint, marca las tareas en PLAN.md y resume en 5 líneas qué cambió y qué queda.
```

## Sesión 1 · Landing B2B

```
Lee CLAUDE.md y la Fase 1 de PLAN.md. La especificación visual exacta está en design_handoff_thesisfy/README.md §3 y el mockup de referencia en design_handoff_thesisfy/mockups/05 Landing Propuesta v2.dc.html (es una referencia HTML, no código a copiar: recréala con componentes React + Tailwind y los tokens del proyecto). Ejecuta la Fase 1. Copy en inglés tal cual aparece en el README; no inventes cifras. Empieza por HeroScene.tsx (README §3.2) y enséñame el resultado antes de seguir con el resto de la página.
```

## Sesión 2 · Cromo del editor

```
Lee CLAUDE.md y la Fase 2 de PLAN.md. Especificación en design_handoff_thesisfy/README.md §4.1–4.3, 4.6 y mockup en design_handoff_thesisfy/mockups/06 Editor Propuesta v2.dc.html. Ejecuta la Fase 2. No toques la lógica de guardado, pestañas ni sesión: solo mueve y rediseña la UI. Mantén todos los MenuAction y atajos. Al terminar, haz la prueba manual de CLAUDE.md §7 y dime el alto total del cromo superior en px.
```

## Sesión 3 · Provenance gutter e Integrity ledger

```
Lee CLAUDE.md y la Fase 3 de PLAN.md. Especificación en design_handoff_thesisfy/README.md §2 (IntegrityPill) y §4.4. Ejecuta la Fase 3. Empieza por el plugin de cálculo en extensions.ts y muéstrame el shape de datos por bloque antes de dibujar el gutter. El ledger debe sumar exactamente 100 − score con el seed thesis_1.
```

## Sesión 4 · Asistente de IA

```
Lee CLAUDE.md y la Fase 4 de PLAN.md. Especificación en design_handoff_thesisfy/README.md §4.5 y §4.7; mockup 06. Ejecuta la Fase 4. Mantén streamChat, onInsert y onReplaceSelection intactos; cambia la UI y añade la tarjeta de coste como paso obligatorio antes de cualquier inserción. Los 10 modos deben verse completos a 400px de ancho, sin scroll horizontal y sin emojis.
```

## Sesión 5 · Onboarding y consentimiento

```
Lee CLAUDE.md y la Fase 5 de PLAN.md. Ejecuta la Fase 5. No hay mockup para esta fase: sigue el sistema visual de CLAUDE.md §4 y los patrones ya implementados en las fases 1–4 (tarjetas, píldoras, tokens prov.*). Antes de implementar, propón en texto el contenido de las tres pantallas de primer uso y espera mi confirmación.
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
