# Verificación — motores especializados, 17 octubre 2026

## Alcance

Cambios de backend, contratos y documentación, sin cambios visuales ni dependencias nuevas. No se han aprovisionado proveedores, enviado borradores reales ni desplegado a producción. Las nuevas pruebas usan respuestas simuladas, no acreditan exactitud real de NER ni disponibilidad de servicios externos.

## Comprobaciones

- `node scripts/test-specialized-engines.cjs`: correcto. Validación bibliográfica, deduplicación DOI, retractación conocida entre proveedores, fallos parciales/totales, fallback S2 y sugerencias con IDs cerrados.
- Mismo script: PII obligatoria, identidades conocidas, emails/teléfonos, NER privado, offsets Unicode/UTF-16, unión de intervalos solapados, tokens consistentes dentro de petición, aislamiento y destrucción del mapa.
- Mismo script: ruta con autenticación simulada, desactivación desde configuración global, límite de cuerpo, JSON/idioma inválidos, NER sin configurar -> 503 sin ninguna consulta externa, búsqueda de solo identidad -> 400, palabras públicas sin identidades conocidas y respuesta `no-store`.
- `node scripts/test-document-context.cjs`: correcto; conserva contexto guardado/en vivo, pestañas, cambios sin guardar y separación de fuentes.
- `NEXT_DIST_DIR=.next-questionnaire-build npm run build`: correcto, incluida nueva ruta `/api/academic/search` y generación de 60 páginas.
- HTTP sobre compilación de producción local: POST sin sesión a `/api/academic/search` -> 401. Datos de prueba locales, claves de modelos comerciales vacías.
- `npx tsc --noEmit --incremental false`: correcto. Se restauró el `tsconfig.json` original después de las comprobaciones (Next añade automáticamente el directorio temporal de compilación).

## Límites de integración

La nueva ruta académica está protegida por NER obligatorio; las rutas actuales del chat no se han migrado. Zotero/CSL, corpus vectorial y Compilatio siguen diseñados, no conectados. Se conservan los motores existentes de LanguageTool, fuentes y pegado. El documento de arquitectura detalla requisitos y pruebas de habilitación de cada fase.

## Integración y Next 15

- Next 15.5.28: compilación de producción y TypeScript correctos tras adaptar 61 handlers dinámicos y searchParams/cookies de páginas.
- PostCSS 8.5.30 por override de Next; auditoría de producción sin vulnerabilidades altas/críticas. Aviso moderado pendiente del árbol TipTap 2: `mergeAttributes` y claves `__proto__`; requiere revisión específica, sin migrar a TipTap 3 sin probar procedencia.
- Pruebas `test-specialized-engines.cjs`: validación/deduplicación académica, disponibilidad parcial, consultas privadas, límites, Unicode, solapamientos, aislamiento, restauración de tokens en cada frontera de streaming.
- `test-engine-integration.cjs`: BibTeX/RIS, cuatro estilos, autores estructurados, edición local, rechazo de parsers URL, pseudonimización de system/history antes de HTTP, bloqueo ante fallo NER y recuperación acotada por institución/tarea.
- Regresiones: documento vivo y guardado, filtros numéricos/temporales, configuración del producto, cuestionario y seis catálogos.
- HTTP local sobre build Next15: 401 sin sesión en rutas nuevas, importación BibTeX, CSL francés, 404 para referencia ajena, página de cuestionario con searchParams asíncronos.
- Navegador: inventario disponible, pero `createBrowserTab` devolvió `target closed while handling command`. No hay capturas ni prueba manual completa del editor nuevo; no confundir pruebas HTTP con validación visual.
- Primer preview remoto falló por Java 17 no disponible en la distribución base; corregido a `python:3.11-slim-bookworm`. Nuevo preview en curso. No se ha publicado producción.
