# Biblioteca de fuentes por tesis (F5)

Fuentes añadidas por el estudiante (DOI, URL, PDF, texto pegado) que el asistente puede citar por pasaje y página. Referentes: SciSpace Chat with PDF, Elicit, PaperQA2 (ver `reports/Editores académicos con IA.md`, sección 5). Sin GROBID ni embeddings en este MVP: `pdf-parse` para el texto por página, BM25 para recuperar y, con un modelo real, rerank + resumen contextual (el RCS de PaperQA2). Toda cita que se muestra ha pasado una comprobación de cadena contra su fragmento.

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/sources/extract.ts` | `extractFromPdf` (pdf-parse con `pagerender` que separa páginas con `\f`; < 50 caracteres/página → `no_text`), `extractFromUrl` (página pública, mismas reglas anti-SSRF que `citations.ts`, tope 200k caracteres, metadatos `citation_*`), `extractFromDoi` (OpenAlex → Crossref; PDF OA vía Unpaywall u `oaUrl`, ≤ 15 MB, 20 s, solo `application/pdf`; si no, abstract). |
| `src/lib/sources/chunk.ts` | `chunkText(pages \| text, { targetWords: 300, overlap: 40 })` → `{ index, page?, section?, text, wordCount }`. Secciones por encabezados numerados, líneas cortas en mayúsculas y nombres habituales (EN/ES/FR). Se detiene en References/Bibliografía una vez leído el cuerpo. |
| `src/lib/sources/retrieve.ts` | `tokenize`, `bm25Rank` (k1 = 1,5, b = 0,75, stopwords EN/ES/FR, sin acentos), `retrieve(thesisId, query, k, sourceIds?)`, `rerankAndSummarize(cfg, question, passages, 5)`, `groundingBlock(passages)`, `matchPasteToSources(thesisId, text)` (≥ 60 % de las frases de ≥ 8 palabras en una misma fuente), `publicSource`/`coverageOf`. |
| `src/app/api/theses/[id]/sources/route.ts` | `GET` lista; `POST` añade (multipart `file` o JSON `{ kind, value, title?, authors?, year? }`), extrae, trocea e indexa en la misma petición. Tope 40 fuentes/tesis y 250k caracteres/fuente. |
| `src/app/api/theses/[id]/sources/[sourceId]/route.ts` | `GET` fuente + chunks; `DELETE`; `POST { action: "summarize" }` (interacción `summarize`). |
| `src/app/api/ai/sources/ask/route.ts` | Pregunta a la biblioteca: consentimiento, `checkPolicy`, BM25 → RCS → respuesta JSON `{ answer, citations }` con citas verificadas; interacción `chat` con `responseFingerprints`. |
| `src/app/api/ai/chat/route.ts` | Campo opcional `useSources` en el body: antepone `groundingBlock` al system prompt. |
| `src/components/editor/sources/SourcesPanel.tsx` | Panel lateral: añadir, listar (chips de estado), Open / Passages / Summarize / Cite / Remove, "Ask my sources" con citas y visor de pasajes con la cita resaltada. |

## Contratos de API

- `GET /api/theses/:id/sources` → `{ sources: PublicSource[] }`. `PublicSource` = `ThesisSource` sin `text`, más `coverage: "full_text" | "abstract" | "none"` y `chunkCount`.
- `POST /api/theses/:id/sources` → `201 { source: PublicSource }`. Errores: 400 (valor inválido), 409 (tope o DOI duplicado), 413 (> 15 MB), 415 (no PDF). Una fuente que no se pudo indexar se crea igualmente con `parseStatus: "no_text" | "failed"` y el motivo en `abstract`.
- `GET /api/theses/:id/sources/:sourceId` → `{ source, chunks: [{ id, index, page?, section?, text }] }`.
- `DELETE …/:sourceId` → `{ ok: true }`.
- `POST …/:sourceId` `{ action: "summarize", sessionId?, provider? }` → `{ summary, meta, interactionId, usage }`; 428 `consent_required`, 403 si el modo `summarize` no está permitido.
- `POST /api/ai/sources/ask` `{ thesisId, question, sourceIds?, sessionId?, provider? }` → `{ answer, citations: [{ ref, sourceId, chunkId, page?, section?, quote, label, title, authors?, year? }], meta: { provider, model, label, billedTo, demo, passages, reranked, structured?, interactionId, blocked?, empty? } }`. Cada `quote` aparece literalmente en su chunk; las referencias `[Sn]` a pasajes descartados llevan "(passage not verified)". Modo demo: respuesta extractiva con las primeras frases de los 3 mejores pasajes.
- `POST /api/ai/chat` acepta `useSources?: boolean`; `meta` añade `useSources` y `groundedPassages`.

## Props del panel

```ts
<SourcesPanel
  thesisId={string}
  canEdit={boolean}
  selectionText={string | undefined}          // precarga la pregunta
  onInsertCitation={(ref: { authors; year; title; source; doi?; url? }) => void}
  onClose={() => void}
  sessionId={string | undefined}              // opcional, para el registro de sesión
  onConsentRequired={() => void}              // opcional, 428 del servidor
/>
```

## Qué queda por cablear (coordinador)

1. `SidebarKind` con `"sources"`, botón en el menú y caso en `sidebarPanel()` de `DocsEditor.tsx`; `onInsertCitation` → `insertCitation` con una `Reference` nueva (tipo `article`/`web`).
2. Atribución al pegar: en el diálogo de pegado, consultar `matchPasteToSources(thesisId, text)` (vía una ruta o dentro de `/api/sessions/*`) y, si hay fuente, preseleccionar "Quoted or adapted from a source" con la etiqueta `Autor (Año), p. N` y ofrecer insertar la cita.
3. Interruptor "Use my sources" en `AssistantPanel`, que envía `useSources: true` en el body de `/api/ai/chat`.

## Límites conocidos

- Sin OCR: los PDF escaneados se detectan y se avisa; no se indexan.
- Sin embeddings: la recuperación es léxica; preguntas muy parafraseadas pueden no encontrar el pasaje. El rerank con modelo mitiga cuando hay proveedor.
- La licencia por fuente se guarda (`license` de Unpaywall) pero no se aplica ninguna restricción automática.
