# Fuentes y referencias: la biblioteca personal (F5)

Todo lo que un estudiante añade a una tesis (fuentes con texto completo y referencias bibliográficas) vive en **una sola biblioteca personal** ("Your library" / "Tu biblioteca"). Fuera del editor, el estudiante elige qué elementos de su biblioteca usa cada tesis; dentro del editor, el panel **Sources & references** muestra los de la tesis abierta.

- **Fuente** (`ThesisSource`): texto completo que el asistente puede citar por pasaje y página (DOI, URL, PDF, texto pegado). Referentes: SciSpace Chat with PDF, Elicit, PaperQA2 (ver `reports/Editores académicos con IA.md`, sección 5). Sin GROBID ni embeddings en este MVP: `pdf-parse` para el texto por página, BM25 para recuperar y, con un modelo real, rerank + resumen contextual (el RCS de PaperQA2). Toda cita que se muestra ha pasado una comprobación de cadena contra su fragmento.
- **Referencia** (`Reference` / `LibraryReference`): entrada bibliográfica. Las citas en el texto la apuntan por id (`data-citation`, `data-cite-ref`).

La página "Research databases" (`/dashboard/library`, `db.library`, `/api/research-databases`) es otra cosa: las bases de datos de la universidad. No se toca.

## Modelo de datos (`src/lib/db.ts`)

| Colección | Forma | Notas |
|---|---|---|
| `sources: ThesisSource[]` | `ownerId`, `thesisIds: string[]`, `thesisId` (legado) | `thesisIds` solo contiene tesis del mismo dueño; puede estar vacío (solo en la biblioteca). `thesisId = thesisIds[0] ?? ""`, recalculado en cada cambio, para clientes antiguos. |
| `sourceChunks: SourceChunk[]` | `sourceId`, `thesisId?` (legado, no se lee) | Los fragmentos pertenecen a la fuente; una tesis llega a ellos por los `thesisIds` de la fuente. |
| `libraryReferences: LibraryReference[]` | `Reference` + `ownerId`, `addedAt`, `updatedAt` | Identidad `(ownerId, id)`. El id es el mismo que usa el HTML de la tesis, así que una copia en otra tesis conserva el id y sus citas siguen resolviendo. Vacía en `seed()`: la construye la migración. |
| `theses[].references: Reference[]` | lista por tesis (sin cambios) | El editor y todas las rutas existentes la siguen usando. `Reference.sourceId?` enlaza con la fuente de la que salió. |

Reglas:

- **Vínculos de referencias derivados, nunca guardados**: una referencia de la biblioteca está vinculada a la tesis T si `T.references` contiene el mismo id y `T.studentId === ownerId`.
- **Sincronización**: cada escritura de `references` por `db.theses.update` inserta en la biblioteca del dueño las referencias que le faltan y sobrescribe un elemento existente **solo con las copias que esa escritura cambió** (contenido distinto del que tenía la tesis antes: una edición en el editor, una comprobación de referencias). Las copias que la escritura no tocó no se sincronizan: otra tesis puede guardar una copia antigua de una referencia compartida, y reenviarla junto con un cambio ajeno no debe deshacer ediciones ni verificaciones posteriores. Una copia nueva en la tesis cuyo id ya está en la biblioteca es un vínculo: la biblioteca no cambia. Una tesis creada con referencias solo inserta las que faltan. `updatedAt` solo cambia si cambia el contenido. Lo que se quita de una tesis se queda en la biblioteca. Las escrituras del editor **no** se propagan a otras tesis; las ediciones de campos desde la biblioteca (`PATCH fields`) **sí** se propagan a cada copia vinculada.
- **Bloqueo**: las tesis `approved` o `submitted` no admiten vincular ni desvincular fuentes o referencias (misma regla que `canEdit` del editor) → `409 { code: "locked" }`. Por eso tampoco se puede borrar de la biblioteca un elemento que use una tesis bloqueada, ni editar los campos de una referencia si el cambio alteraría la copia de una tesis bloqueada.
- **Topes**: 40 fuentes vinculadas por tesis, 150 fuentes por biblioteca, 250k caracteres por fuente.
- **Visibilidad**: solo el dueño escribe. Tutor y administración ven, en modo lectura, solo lo vinculado a una tesis a la que tienen acceso (rutas por tesis); nunca la biblioteca completa ni los ids o títulos de otras tesis del estudiante (por eso `PublicSource` no lleva `ownerId` ni `thesisIds`).
- **Anclaje**: "Use my sources", "Ask my sources", los resúmenes y el reconocimiento de pegados usan solo las fuentes vinculadas a la tesis (`db.sourceChunks.listByThesis`).
- Nunca se reescribe el HTML de la tesis, sus versiones ni sus snapshots (cadena de hashes).

Accesores: `db.sources.{list(thesisId), listByOwner, findById, findByDoi(ownerId, doi), create, update, link, unlink, remove}` (`remove` borra también los fragmentos; `update` protege `id` y `ownerId` y normaliza `thesisIds`), `db.sourceChunks.{listBySource, listByThesis, countBySource, replaceForSource, removeForSource}`, `db.libraryReferences.{listByOwner, find, findByDoi, upsert, remove, syncFromThesis, thesesUsing}`. `db.theses.remove` desvincula la tesis de cada fuente; las referencias se quedan en la biblioteca.

### Migración al cargar (`migrateLibrary`)

Corre tras `fillMissingCollections` en `load()` y en `ready()` (tras releer Postgres); si cambia algo se persiste. Idempotente y determinista (sin `uid()` ni reloj). Los tres pasos son comprobaciones permanentes, porque durante un despliegue gradual una instancia antigua puede escribir la forma vieja:

1. Fuentes sin `thesisIds`: dueño = dueño de su `thesisId`; si la tesis ya no existe, se elimina la fuente con sus fragmentos.
2. Cada fuente conserva solo vínculos a tesis existentes de su dueño; se recalcula `thesisId`. Se eliminan los fragmentos de fuentes inexistentes.
3. Cada referencia de cada tesis existe en `libraryReferences` para `(studentId, id)`; las que faltan se insertan con `addedAt = updatedAt = createdAt` de la tesis. Nunca se sobrescribe aquí. Una tesis sin array `references` recibe `[]`.

Con Postgres, `load()` no persiste su copia local (semilla o `DATA_FILE`): el documento autoritativo es la fila, que migra `ready()`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/sources/library.ts` | Módulo compartido por las rutas de biblioteca y de tesis: `readSourceInput` (multipart o JSON, más `thesisIds`), `createLibrarySource` (crea, extrae, trocea e indexa), `checkLinkable` (bloqueo y tope por tesis), `resolveOwnTheses`, vistas (`librarySourceViews`, `libraryReferenceViews`, `libraryReferenceView`, `libraryTheses`), `sanitizeReferenceFields`, `newReferenceId`, `addReferenceToThesis`, `removeReferenceFromThesis`, `fail(...)` con `code`. |
| `src/lib/sources/cited.ts` | Puro (sin db ni DOM), válido en cliente y servidor: `addCitationCounts(html)`, `citationCounts(htmls)`, `thesisCitationCounts(thesis)` → `{ [refId]: n }` contando `data-citation` + `data-cite-ref`. |
| `src/lib/sources/extract.ts` | `extractFromPdf` (pdf-parse con `pagerender` que separa páginas con `\f`; < 50 caracteres/página → `no_text`), `extractFromUrl` (página pública, mismas reglas anti-SSRF que `citations.ts`, tope 200k caracteres, metadatos `citation_*`), `extractFromDoi` (OpenAlex → Crossref; PDF OA vía Unpaywall u `oaUrl`, ≤ 15 MB, 20 s, solo `application/pdf`; si no, abstract). |
| `src/lib/sources/chunk.ts` | `chunkText(pages \| text, { targetWords: 300, overlap: 40 })` → `{ index, page?, section?, text, wordCount }`. Secciones por encabezados numerados, líneas cortas en mayúsculas y nombres habituales (EN/ES/FR). Se detiene en References/Bibliografía una vez leído el cuerpo. |
| `src/lib/sources/retrieve.ts` | `tokenize`, `bm25Rank` (k1 = 1,5, b = 0,75, stopwords EN/ES/FR, sin acentos), `retrieve(thesisId, query, k, sourceIds?)` sobre las fuentes vinculadas, `rerankAndSummarize`, `groundingBlock`, `matchPasteFingerprintsToSources(thesisId, fps)` (≥ 60 % de las huellas de frase en una misma fuente vinculada, o 2+ frases), `matchPasteToChunks` (puro), `publicSource(s, thesisId, counts?)`, `librarySourceView(s, counts?)`, `coverageOf`. |
| `src/app/api/library/route.ts` | `GET` de la biblioteca del estudiante. |
| `src/app/api/library/sources/route.ts`, `…/[id]/route.ts` | Alta de fuentes en la biblioteca; `PATCH` (vínculos y metadatos), `DELETE`. |
| `src/app/api/library/references/route.ts`, `…/[id]/route.ts` | Alta de referencias (manual o por DOI); `PATCH` (vínculos y campos), `DELETE`. |
| `src/app/api/theses/[id]/sources/route.ts`, `…/[sourceId]/route.ts` | Rutas por tesis (contratos anteriores; ver abajo). |
| `src/app/api/ai/sources/ask/route.ts` | Pregunta a las fuentes de la tesis: consentimiento, `checkPolicy`, BM25 → RCS → respuesta JSON `{ answer, citations }` con citas verificadas; interacción `chat` con `responseFingerprints`. |
| `src/app/api/ai/chat/route.ts` | Campo opcional `useSources` en el body: antepone `groundingBlock` al system prompt. |
| `src/lib/i18n/messages/library.ts` | Mensajes del servidor (`library.*`) en EN/ES/FR/DE; los errores que ve la UI pasan por `getT()`. Glosario: `glossary.sourcesReferences`, `glossary.library` en `common.ts`. |
| `src/components/editor/types.ts` | Tipos de cliente: `Reference.sourceId`, `LibrarySourceView`, `LibraryReferenceView`, `LibraryThesisOption`, `LibraryResponse`, `LibraryErrorBody`. |

## Contratos de API

Errores: `{ error: string, code?: "locked" | "cited" | "thesis_cap" | "library_cap" | "duplicate" | "conflict" | "owner_only", citedIn? }`, con `error` traducido al idioma de la petición.

### Por tesis (los campos nuevos son opcionales)

- `GET /api/theses/:id/sources` → `{ sources: PublicSource[] }`: las fuentes **vinculadas** a la tesis. `PublicSource` = `ThesisSource` sin `text`, `ownerId` ni `thesisIds`, con `thesisId` = la tesis pedida, más `coverage: "full_text" | "abstract" | "none"` y `chunkCount`. Acceso: `canAccessThesis` (dueño, tutor, administración).
- `POST /api/theses/:id/sources` (solo el dueño, 403 `owner_only` si no) → crea la fuente en la biblioteca del dueño y la vincula a esta tesis: `201 { source: PublicSource }`. Si el DOI ya está en la biblioteca, la vincula: `200 { source, linked: true }` (409 `duplicate` si ya estaba vinculada a esta tesis). Errores: 400 (valor inválido), 409 `locked` / `thesis_cap` (40) / `library_cap` (150), 413 (> 15 MB), 415 (no PDF). Una fuente que no se pudo indexar se crea igualmente con `parseStatus: "no_text" | "failed"` y el motivo en `abstract`.
- `GET /api/theses/:id/sources/:sourceId` → `{ source, chunks: [{ id, index, page?, section?, text }] }`; 404 si la fuente no está vinculada a esa tesis.
- `DELETE …/:sourceId` (solo el dueño; 409 `locked`) → **desvincula** de esta tesis; la fuente sigue en la biblioteca: `{ ok: true, unlinked: true }`.
- `POST …/:sourceId` `{ action: "summarize", sessionId?, provider? }` → `{ summary, meta, interactionId, usage }`; 428 `consent_required`, 403 si el modo `summarize` no está permitido.
- `GET /api/theses` → cada tesis añade `sourceCount?` (fuentes vinculadas) y `referenceCount?`.
- `PUT /api/theses/:id` con `references` y `POST /api/theses/:id/references/check`: sin cambios de contrato; la escritura pasa por `db.theses.update`, que sincroniza la biblioteca.
- `POST /api/ai/sources/ask` `{ thesisId, question, sourceIds?, sessionId?, provider? }` → `{ answer, citations: [{ ref, sourceId, chunkId, page?, section?, quote, label, title, authors?, year? }], meta }`. Solo fuentes vinculadas; `sourceIds` restringe dentro de ellas. Sin pasajes → `meta.code` `"no_match"` o `"no_index"`; con `"no_index"`, el dueño recibe además `meta.librarySources` (opcional): fuentes indexadas de su biblioteca que esta tesis aún no usa.
- `POST /api/ai/chat` acepta `useSources?: boolean`; `meta` añade `useSources` y `groundedPassages`.

### Biblioteca (solo estudiantes; el personal recibe 403 en escrituras y listas vacías en `GET`)

- `GET /api/library` → `{ sources: LibrarySourceView[], references: LibraryReferenceView[], theses: { id, title, status, citationStyle, locked }[] }`.
  - `LibrarySourceView` = `PublicSource` + `thesisIds: string[]` (aquí `thesisId` es el primer vínculo o `""`). Orden: `addedAt` descendente.
  - `LibraryReferenceView` = `Reference` + `thesisIds: string[]` (derivado) + `citedIn: { [thesisId]: n }` (solo tesis con alguna cita; cuenta `data-citation` y `data-cite-ref` en `content` y en cada `tabs[].content`) + `addedAt` + `updatedAt`. Orden: primer autor, año, título.
- `POST /api/library/sources` → mismos cuerpos que la ruta por tesis (multipart `file` o JSON `{ kind, value, title?, authors?, year? }`) más `thesisIds?` (array JSON, o campo multipart `thesisIds` repetido o separado por comas). `201 { source: LibrarySourceView }`. DOI ya en la biblioteca → `200 { source, existing: true }` y se vincula a las tesis indicadas. Cada tesis debe ser del estudiante (404 si no), no estar bloqueada (409 `locked`) y tener sitio (409 `thesis_cap`); 409 `library_cap`.
- `PATCH /api/library/sources/:id` `{ thesisIds?, title?, authors?, year?, venue? }` → `thesisIds` fija los vínculos exactamente (propiedad, bloqueo al añadir y al quitar, tope). En JSON, `thesisIds` es siempre un array: `null`, una cadena u otro tipo → 400 (nunca se lee como «desvincular de todas»). Título vacío → 400; otros campos vacíos se borran. `{ source: LibrarySourceView }`.
- `DELETE /api/library/sources/:id` → borra la fuente y sus fragmentos de la biblioteca y de todas las tesis (409 `locked` si la usa una tesis bloqueada). `{ ok: true }`.
- `POST /api/library/references` → `{ reference: { type?, authors?, title, year?, source?, url?, doi?, pages?, volume?, issue? }, thesisIds? }` o `{ doi, thesisIds? }` (búsqueda en Crossref con `lookupDoi`; 404 si no hay registro). Id nuevo `ref_<12 hex>`, único en la biblioteca y en las tesis del estudiante. Mismo DOI ya en la biblioteca → se reutiliza: `200 { reference, existing: true }`. Vincular = añadir una copia (mismo id) a `references` de cada tesis. `201 { reference: LibraryReferenceView }`.
- `PATCH /api/library/references/:id` `{ thesisIds?, fields?, confirmCited? }` → `fields` (solo campos bibliográficos: type, authors, year, title, source, url, doi, pages, volume, issue) actualiza la biblioteca y cada copia vinculada que cambie (409 `locked` si una de ellas es de una tesis bloqueada); si cambia título, autores, año, DOI o fuente se descarta la `verification` anterior. `thesisIds` fija los vínculos: copia a las tesis nuevas, quita de las demás. Quitar de una tesis donde está citada exige `confirmCited: true`; si no, `409 { error, code: "cited", citedIn }`. `{ reference: LibraryReferenceView }`.
- `DELETE /api/library/references/:id?confirmCited=1` → la quita de la biblioteca y de todas las tesis (mismo control `cited`; 409 `locked`). Las citas del texto no se reescriben: se quedan sin entrada en la bibliografía. `{ ok: true }`.

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

## Límites conocidos

- Sin OCR: los PDF escaneados se detectan y se avisa; no se indexan.
- Sin embeddings: la recuperación es léxica; preguntas muy parafraseadas pueden no encontrar el pasaje. El rerank con modelo mitiga cuando hay proveedor.
- La licencia por fuente se guarda (`license` de Unpaywall) pero no se aplica ninguna restricción automática.
- Documento único con "el último que escribe gana": una elección hecha en la página de biblioteca puede pisarse con un `PUT` de referencias de un editor abierto con datos viejos. El editor recarga `thesis.references` al volver a la pestaña (`visibilitychange`).
- Los ids de referencia no son globales: dos tesis del mismo estudiante con el mismo id y contenido distinto (caso heredado) cuentan como la misma referencia de biblioteca; la última escritura de una de ellas fija el contenido de la biblioteca.
- `Reference.sourceId` que apunte a una fuente borrada no se limpia: la UI debe comprobar que la fuente exista (y recurrir al DOI).
