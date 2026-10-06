# Language review (F2)

Sugerencias lingüísticas nativas dentro del editor: ortografía, gramática, puntuación, estilo académico y
consistencia, con subrayado por categoría, tarjeta con motivo, Accept/Dismiss, filtros por categoría que se
recuerdan por tesis y diccionario personal. El corrector vive dentro de ProseMirror para que ninguna
reescritura externa entre como "Written".

## Piezas

| Archivo | Qué hace |
|---|---|
| `src/lib/language/languagetool.ts` | Cliente LanguageTool v2 (`checkAnnotated`), mapeo de categorías LT → 5 categorías propias, troceado a ≤ 15 KB, fallo suave en 429/5xx. |
| `src/lib/language/review.ts` | Capa opcional de estilo académico con el modelo de la institución (`academicStyleSuggestions`, salida JSON acotada a una frase, verificada literalmente) y la regla de procedencia `provenanceFor`. |
| `src/app/api/language/check/route.ts` | `POST /api/language/check`: aplica las preferencias de la tesis, llama a LT por párrafo (≤ 3 en paralelo), opcionalmente al modelo, y devuelve sugerencias con offsets por párrafo. Registra una `AIInteraction` (modo `grammar`) solo si corrió la capa de estilo. |
| `src/app/api/language/prefs/route.ts` | `GET/PUT /api/language/prefs?thesisId=`: idioma, lengua materna, categorías y reglas silenciadas, diccionario. Solo el dueño de la tesis puede cambiarlas. |
| `languageReview.ts` | Extensión TipTap `languageReview`: estado del plugin, decoraciones, comandos, serialización `paragraphsToAnnotated`, caché por hash y `runLanguageCheck` / `watchLanguageReview`. |
| `LanguageReviewPanel.tsx` | Panel lateral (400 px) con controles, chips, lista de tarjetas y contador de sesión. |
| `globals.css` (`/* Language review */`) | Subrayados por categoría con tokens vía `theme()`. |

## Flujo

1. `paragraphsToAnnotated(editor)` recorre cada textblock y produce items `data.annotation`: los nodos de texto
   van como `{ text }`; las marcas `citation`, `citedPassage`, `code`, `link`, los átomos inline, los `hardBreak`
   y los tramos con pinta de fórmula (`$…$`, `\(…\)`, cadenas con `=`, `≤`, `≥`, `≈`, `±`) van como `{ markup }` de la
   **misma longitud** que el tramo del documento. LanguageTool devuelve offsets sobre el texto original
   (texto + markup), así que `posDoc = from + offset` sin tabla de mapeo. Las coincidencias que tocan un rango
   protegido se descartan en servidor y en cliente.
2. La clave de cada párrafo es un hash FNV-1a de sus items. El panel llama a `runLanguageCheck` tras un
   debounce de 700 ms; solo viajan los párrafos cuya clave no está en la caché del `storage` de la extensión
   (máx. 600 entradas). Un párrafo que vuelve a un texto ya visto recupera sus sugerencias de la caché.
3. Las sugerencias viven en el estado del plugin como posiciones del documento y se mapean con `tr.mapping` en
   cada transacción. Si un paso toca el rango (incluidos sus bordes) o cambia su longitud, la sugerencia se
   elimina en vez de parpadear (regla de rebase de Grammarly). El párrafo se re-comprueba al siguiente silencio.
4. `acceptLanguageSuggestion` sustituye el rango. Si `provenance === "ai"` (reescritura de estilo del modelo que
   cambia más de tres palabras) el texto insertado lleva la marca `provenance { source: "ai", label: "Language review" }`;
   el panel muestra la frase de consecuencia antes del botón y el aviso después. Las correcciones mecánicas
   conservan las marcas que ya tenía el texto (nunca se degrada `ai` a `human`).

## Comandos de la extensión

`setLanguageSuggestions(key, list, range?)`, `acceptLanguageSuggestion(id)`, `acceptLanguageSuggestions(ids)`,
`dismissLanguageSuggestion(id)`, `dismissLanguageSuggestions(ids)`, `removeLanguageSuggestionsWhere({ category? | ruleId? })`,
`setActiveLanguageSuggestion(id | null)`, `clearLanguageSuggestions()`, `setLanguageReviewEnabled(bool)`.
Estado: `languageReviewKey.getState(editor.state)` → `{ suggestions, enabled, activeId, decorations, version }`.

## Límites y avisos

- **API pública de LanguageTool** (`https://api.languagetool.org/v2`): 20 peticiones/minuto por IP, 20 KB por
  petición, 75 KB por minuto, sin reglas premium. Con varios estudiantes detrás de la misma IP el límite se agota
  en segundos; el cliente devuelve `error` y el panel lo muestra sin romper nada.
- **RGPD**: el texto de la tesis viaja al servidor de LanguageTool. En producción hay que apuntar
  `LANGUAGETOOL_URL` a una instancia propia o del cliente (`languagetool-server.jar`, LGPL) y nunca usar la API
  pública. Opcionalmente `LANGUAGETOOL_USERNAME` / `LANGUAGETOOL_API_KEY` para la API premium.
- Las reglas `PASSIVE_VOICE`, `TOO_LONG_SENTENCE`, `SENTENCE_WHITESPACE` y `EN_QUOTES` van desactivadas por defecto
  (`THESIS_DEFAULT_DISABLED_RULES`), siguiendo el estudio de Heliyon sobre sobremarcado del registro académico.
- La capa de estilo se limita a 8 párrafos de ≥ 8 palabras por petición y pasa por el consentimiento `aiInteractions`
  y por `policy.allowedModes` (`grammar`). En modo demo devuelve una lista determinista de muletillas.
- `id` de sugerencia = `<hash párrafo>.<offset>.<rule>`: estable mientras el párrafo no cambie, por eso un
  `Dismiss` sobrevive a la caché.
- Los recuentos "Shown · accepted · dismissed" son estado del componente; no se añaden tipos de `SessionEvent`.
