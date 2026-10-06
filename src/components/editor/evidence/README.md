# Evidence check (F6)

Comprobación de evidencia a favor, con matices y en contra de una afirmación seleccionada en la tesis. Referentes: Consensus Meter (citas textuales de los 20 primeros resultados, etiquetadas yes/no/possibly) y las Smart Citations de Scite (supporting/contrasting/mentioning). Diferencia deliberada: **no hay medidor agregado ni porcentaje**; solo la lista auditada, con la advertencia de que la clasificación es automática y de que cada estudio cuenta igual (Consensus declara ~10 % de error; Scite publicó 64 %/59 % de precisión en supporting/contrasting en 2021).

## Archivos

| Archivo | Papel |
|---|---|
| `src/lib/ai/evidence.ts` | `evidenceForClaim(claim, { cfg })`: candidatos (OpenAlex + Semantic Scholar) → clasificación por el modelo → verificación de cadena (`quoteAppearsIn`) → enriquecimiento OpenAlex. `gatherCandidates`, `summarizeStances`. |
| `src/app/api/ai/evidence/route.ts` | `POST` ejecuta y guarda un `EvidenceCheck`; `GET ?thesisId=` devuelve los últimos 20. |
| `src/components/editor/evidence/EvidencePanel.tsx` | Panel lateral de 400px: afirmación, botón con frase de consecuencia, tres grupos apilados, menciones plegadas, historial, atribución. |

## Pipeline

1. `openAlexSearch(claim, { perPage: 15, semantic: true })` (semántico si hay `OPENALEX_API_KEY`, por palabras clave si no) y `s2SnippetSearch(claim, 10)` cuando hay `S2_API_KEY`. Se intercalan, se deduplican por DOI/OpenAlex id y se recortan a 20 candidatos `{ id, work, passage }` (resumen o fragmento de cuerpo; se descartan pasajes de menos de 8 palabras).
2. El modelo recibe la afirmación y los pasajes literales y devuelve solo JSON `[{ candidateId, quote, stance, confidence }]`. La cita es un tramo contiguo ≤ 40 palabras copiado del pasaje. Nunca emite cadenas bibliográficas.
3. Verificación en servidor: toda cita que no aparezca normalizada dentro de su pasaje se descarta (se informa en `warnings`). Un resultado por candidato.
4. Se eliminan las `mentions` salvo que queden menos de 3 resultados con postura.
5. Enriquecimiento: `cited_by_count`, `type`, `publication_year`, `is_retracted` ya vienen de OpenAlex; para obras que solo llegaron de S2 y tienen DOI se llama a `openAlexWork(doi)` (máximo 5 consultas).
6. Orden: supports → qualifies → contradicts → mentions, por confianza descendente dentro de cada grupo.

**Modo demo (sin proveedor):** devuelve los 6 primeros candidatos con `stance: "mentions"`, la primera frase del pasaje como cita y `aiUsed: false`. La interfaz lo explica en una nota. No se finge ninguna etiqueta.

## Contratos

`POST /api/ai/evidence`

```json
{ "thesisId": "th_…", "claim": "…", "anchorId": "cmt_…", "sessionId": "ses_…", "provider": "im_… | anthropic | …" }
```

- Consentimiento: igual que `/api/ai/chat` (428 `consent_required`).
- Modo: `gaps`; si la política no lo permite, `critique`; si tampoco, 403. `checkPolicy` se aplica a la afirmación; un bloqueo se registra con `blockedByPolicy: true` y devuelve 403.
- Respuesta: `{ check: EvidenceCheck, aiUsed, aiAvailable, attribution, mode, candidates, warnings, billedTo, interactionId }`. Los `results` del check llevan, además de los campos de `db.ts`, los opcionales `venue`, `url`, `source`, `verified`.
- Registro: `db.evidenceChecks.create(...)` y `db.interactions.create({ mode, promptPreview: "Evidence check: …", responsePreview: "3 support · 1 qualifies · 2 contradict", billedTo, costUsd, institutionModelId, responseFingerprints: [] })`. Si hay `sessionId`, evento `ai_prompt` en la sesión.

`GET /api/ai/evidence?thesisId=` → `{ checks: EvidenceCheck[] }` (últimos 20; `canAccessThesis`, así que el tutor ve lo mismo que el estudiante).

## Props del panel

```ts
{
  editor: Editor;
  thesisId: string;
  sessionId?: string;
  selectionText?: string;            // afirmación por defecto
  canEdit: boolean;
  onFindSupport?: (claim: string) => void;   // abre Find support con la afirmación; la cita se inserta solo allí
  onAnchor?: (claim: string) => string | undefined; // aplica un commentMark a la selección y devuelve su id
  onClose: () => void;
}
```

`onAnchor` solo se llama cuando la afirmación coincide con la selección viva y `canEdit` es true; el `anchorId` resultante se guarda en el `EvidenceCheck` y el panel ofrece "Show in document" para volver a la frase.

## Cableado pendiente (coordinador, `DocsEditor.tsx`)

- Añadir `"evidence"` a `SidebarKind` y un `case "evidence"` que monte `<EvidencePanel editor thesisId sessionId selectionText canEdit onFindSupport onAnchor onClose />`.
- Entrada **Evidence** en el bubble menu de selección (junto a Ask AI) que abra el panel con la selección.
- `onFindSupport(claim)` → abrir el panel Find support con la afirmación como consulta.
- `onAnchor(claim)` → `const id = \`cmt_${Date.now().toString(36)}\`; editor.chain().setComment(id).run(); return id;` (mismo patrón que `addCommentFromAssistant`), opcionalmente creando el comentario "Evidence check: …" vía `/api/theses/:id/comments` para que el tutor lo vea en Comments.

## Copy y reglas

Inglés, sobrio, sin exclamaciones. Nunca "detected" ni veredictos. La nota bajo los grupos es fija: "No overall score: n passages were classified automatically; read before you cite." Atribución visible: "Data: OpenAlex · Semantic Scholar". Tokens de color: `accent-*` (supports), `amber-*` (qualifies), `red-*` (contradicts), `gray-*` (mentions).
