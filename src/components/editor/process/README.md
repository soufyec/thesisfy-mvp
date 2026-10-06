# Writing process (F4): informe reproducible y declaración de uso de IA

Implementa la sección 4 del informe `reports/Editores académicos con IA.md`: instantáneas periódicas del documento (no teclas), encadenadas por hash, una línea temporal reproducible y una declaración de uso de IA generada desde el ledger con plantilla determinista. El estudiante y el tutor ven exactamente el mismo panel (principio 2).

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/process.ts` | `computeHash`, `makeSnapshot`, `replaySnapshots`, `verifyChain`, `diffLines`/`applyDiff` (LCS propio, sin dependencias), `scanHtml` (palabras por `data-provenance` y por H1/H2), `processTimeline`, `ledgerSummary`, `gatherProcess`, `buildLedgerSummary`. Solo servidor (usa `node:crypto` y `db`). El cliente importa únicamente tipos. |
| `src/lib/ai/declaration.ts` | `renderDeclaration(summary, { studentName, thesisTitle, university, lang })` → texto determinista en en/es/fr. `rephraseWithModel(text, user, policy)` → propuesta de reformulación vía `resolveProvider`/`streamCompletion`; en demo devuelve el mismo texto. |
| `src/app/api/theses/[id]/snapshots/route.ts` | POST (solo autor, throttle 3 min / 150 palabras) y GET (`?tabId=`, `?replay=1`). |
| `src/app/api/theses/[id]/process/route.ts` | GET → `{ timeline, summary }`. |
| `src/app/api/theses/[id]/declaration/route.ts` | GET, POST (genera), PATCH (edita texto / firma). |
| `src/components/editor/process/ProcessPanel.tsx` | Panel lateral (400 px) o embebido (`embedded`). |
| `src/components/editor/process/useSnapshots.ts` | `recordSnapshot(thesisId, payload)` y hook `useSnapshots`, con throttle en cliente. |
| `src/app/admin/theses/[id]/page.tsx` | Tarjeta "Writing process" con `ProcessPanel` (`isOwner=false`). |

## Modelo de datos (ya en `db.ts`)

- `Snapshot { thesisId, tabId, userId, sessionId?, wordCount, provenance, html? | diff?, hash, prevHash?, createdAt }`. HTML completo en la primera instantánea y cada 20; el resto guarda un diff de líneas (párrafos del texto plano) contra la anterior.
- `hash = sha256(prevHash + "\n" + JSON canónico de { thesisId, tabId, userId, sessionId, wordCount, provenance, html, diff })`. `createdAt` e `id` los asigna el servidor y no entran en el hash.
- `verifyChain` recomputa cada hash y comprueba `prevHash === anterior.hash`. Si la cadena está truncada (la base guarda 600 por tesis), el primer elemento no se compara con un predecesor.
- `Declaration { thesisId, version, text, ledgerSummary, signedAt?, signedBy? }`. `ledgerSummary` guarda el `LedgerSummary` más `lang`, `template`, `editedAt`, `aiReworded`.

### Formato del diff

```
@@ -<oldStart>,<oldLen> +<newStart>,<newLen> @@
-línea eliminada
+línea añadida
```

Índices 0-based sobre la lista de párrafos, sin líneas de contexto. `applyDiff` es tolerante: ante una cabecera inválida devuelve el texto anterior sin lanzar.

## Contratos API

**POST `/api/theses/:id/snapshots`** (autor)
Body `{ tabId?: string = "submission", html: string, wordCount?: number, provenance?: { human, ai, paste }, sessionId?: string }`.
→ `201 { snapshot: { …sin html/diff, full }, chainLength }` · `200 { skipped: true, reason: "throttled" | "unchanged", nextAt? }`.

**GET `/api/theses/:id/snapshots?tabId=submission`** (autor, tutor, admin vía `canAccessThesis`)
→ `{ snapshots: SnapshotMeta[], chain: { ok, brokenAt?, checked } }`.
Con `&replay=1` → `{ states: [{ id, at, text, wordCount, full }], chain, total }` (últimos 200 estados).

**GET `/api/theses/:id/process`** → `{ timeline: ProcessTimeline, summary: LedgerSummary }`.
`timeline.segments[]`: `{ sessionId, start, end, minutes, words, keystrokes, pastes, aiInserts, aiPrompts, device, consented }`.
`timeline.events[]`: `{ id, at, kind: "paste"|"ai_insert"|"ai_prompt"|"snapshot"|"version", sessionId?, words?, attribution?: "source"|"copilot"|"assistant"|"unattributed"|"own", interactionId?, mode?, model?, provider?, costUsd?, blocked?, label?, tabId? }`.
`timeline.chapters[]`: `{ heading, level, words, ai, paste, human }` a partir del HTML de la Final submission.

**GET `/api/theses/:id/declaration`** → `{ declarations: (Declaration & { signedByName? })[] }` (más reciente primero).
**POST** (autor) `{ lang?: "en"|"es"|"fr", rephrase?: boolean, provider?: string, sessionId?: string }` → `201 { declaration, rephrased?: { text, provider, model, demo, interactionId?, costUsd?, error? } }`. Si `rephrase` usó un modelo real se registra una `AIInteraction` con `mode: "chat"`.
**PATCH** (autor) `{ id, text?, sign?: true, aiReworded?: boolean }` → `{ declaration }`. El texto se puede editar hasta firmar (409 después); firmar es definitivo para esa versión y notifica al tutor.

## Panel

`ProcessPanel` props: `{ thesisId, isOwner, onClose, onOpenConsent?, onInsertDeclaration?(html), embedded?, sessionId? }`.

Secciones: línea "Record integrity"; totales; **timeline** (segmentos escalados por duración, marcadores paste = `prov-paste`, AI insert = `prov-ai`, AI prompt = `brand`, snapshot = gris, versión = gris oscuro; hover muestra el detalle; clic lista los eventos del segmento); **por capítulo** (barras apiladas Written / Quoted or pasted / AI-assisted); **replay** (slider sobre los estados, palabras añadidas respecto al estado anterior resaltadas); **declaración** (generar con frase de consecuencia, textarea editable, "Ask the model to reword" como propuesta aparte que se acepta y se marca `ai`, firmar con frase de consecuencia, descargar `.txt`/`.html`, insertar como apéndice).

Con `isOwner=false` se ven los mismos datos sin generar, editar ni firmar.

## Qué debe cablear el coordinador en `DocsEditor`

1. `SidebarKind` incluye `"process"`; en `sidebarPanel()`:
   `case "process": return <ProcessPanel thesisId={thesisId} isOwner={canEdit} sessionId={sessionId} onClose={() => setSidebar("none")} onOpenConsent={() => setDialog("consent")} onInsertDeclaration={(html) => { if (activeTabRef.current !== SUBMISSION) switchTab(SUBMISSION); editor.chain().focus("end").insertContent(html).run(); saveNow(); }} />`
2. Tras cada guardado correcto en `saveNow`:
   `recordSnapshot(thesisId, { tabId: activeTabRef.current, html: contentsRef.current[activeTabRef.current], wordCount, provenance: thesis.provenance, sessionId })` (para pestañas de trabajo, `provenance` puede omitirse: el servidor lo calcula del HTML). El helper ya aplica el throttle y nunca lanza.
3. Entrada "Writing process" en el menú `⋯` o en el Integrity ledger para abrir el panel.

## Lo que el registro no demuestra

El texto generado por una IA externa y transcrito a mano no deja rastro. La declaración lo dice expresamente y el panel lo repite; no hay puntuación de probabilidad.
