# Citas verificadas (F3): reglas y costes

1. El modelo nunca escribe una referencia. Los candidatos salen de OpenAlex (`search` o `search.semantic` con clave) y, con `S2_API_KEY`, de `/snippet/search`; el modelo solo elige `candidateId` entre ellos (`src/lib/ai/citeVerified.ts`).
2. Cada sugerencia lleva una cita literal de ≤ 40 palabras del resumen o fragmento del candidato; el servidor la comprueba con `quoteAppearsIn` y descarta la que no coincide. Nada que se muestre ha fallado esa comprobación.
3. Sin proveedor de IA (demo) se devuelven los primeros resultados de búsqueda con la primera frase del pasaje como cita, `aiUsed: false`; la interfaz lo dice.
4. "No encontrado" se muestra como **Unverified**, nunca "fabricated": fuentes impresas, capítulos y literatura gris suelen carecer de DOI o registro (lección de HALLMARK sobre falsos positivos).
5. Retractaciones: `is_retracted` de OpenAlex (lookup único, gratuito) marca el candidato o la referencia como **Retracted** en rojo.
6. El comprobador (`/api/theses/[id]/references/check`) resuelve DOI → Crossref `/works/{doi}` → `query.bibliographic` (similitud de título Dice ≥ 0,8) → S2 `/paper/search/match`; informa discrepancias concretas de título, año y autores (**Mismatch**).
7. Límites respetados: Crossref polite pool (3 concurrentes, ~350 ms entre comprobaciones por trabajador, `mailto`), 40 referencias por ejecución; S2 1 req/s con clave (sin clave responde 429 y se trata como "sin veredicto").
8. Coste: OpenAlex search 0,001 $ por llamada (1 $/día gratis por clave; sin clave 0,10 $/día compartido), lookups individuales gratis; Crossref y Unpaywall gratis; el modelo se imputa como cualquier interacción `citations` (`billedTo`, `costUsd`).
9. Registro: cada búsqueda crea una `AIInteraction` modo `citations` con `responseFingerprints: []` (las citas son texto publicado, no prosa del asistente); el comprobador no usa modelo y no se registra como uso de IA. Estudiante y tutor ven lo mismo.
10. Atribución visible "Data: OpenAlex · Semantic Scholar" en el pie del panel (exigida por la licencia de S2); cobertura limitada de literatura en español y francés declarada en la interfaz.
