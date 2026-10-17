# Chat y materiales de investigación — 16 octubre 2026

Petición: más espacio de conversación, dos sugerencias breves, cinco funciones útiles, logo de Thesisfic y creación de materiales vinculados al objetivo del trabajo.

## Verificación

- `npx tsc --noEmit` y compilación de producción correctos.
- `node scripts/test-research-files.cjs`: validación de archivos y formatos, nombres seguros, límites, JSON inválido, bloques parciales, CSV con fórmulas inertes y números negativos preservados, permiso de creación del copilot, restricciones de los modos enfocados, objetivo en las instrucciones, traducciones EN/ES/FR/DE y búsqueda con fallo explícito.
- Chrome/Playwright, UI francesa: cinco modos; dos sugerencias pequeñas; logo de marca; sin subtítulo ni tarjeta de explicación. Capturas de escritorio y móvil inspeccionadas.
- Proveedor local de prueba con respuestas conocidas (sin llamadas de pago): respuesta SSE → archivos validados → historial → descarga autenticada Markdown y Word (DOCX comprobado como ZIP), vista previa, inserción con coste y marcas AI-assisted, arrastre de informe al documento y edición posterior del archivo desde la conversación.
- Descarga de otra cuenta: 404. Los archivos se restauran con la conversación al cambiar a móvil; no se reinicia el chat.
- Búsqueda real de Crossref desde la API del chat: HTTP 200, seis publicaciones, todas con DOI. La interfaz distingue metadatos y resúmenes de lectura de texto completo. Un fallo de búsqueda no se presenta como resultados inventados.
- Regresiones del espacio de datos: selección, cálculos, tablas, gráficos, SVG y atribución conservadas.

## Límites de lo verificado

El proveedor de prueba valida el flujo y el contexto enviado, no la calidad ni el cumplimiento semántico de un modelo real. La restricción al objetivo se aplica mediante las instrucciones del copilot; no constituye una clasificación infalible del tema. La búsqueda usa el catálogo académico de Crossref, no toda la web, y no verifica hallazgos ni realiza una revisión sistemática. No se ejecuta el código descargado. La generación requiere un proveedor conectado; sin él se informa de la limitación. No se modifica la producción.

Documentación del catálogo: https://www.crossref.org/documentation/retrieve-metadata/rest-api/.
