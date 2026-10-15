# Espacio de datos y edición de objetos — 15 octubre 2026

Pruebas locales con Chrome/Playwright, Next 14, cuentas demo y datos sintéticos. No se invocaron proveedores de IA de pago ni se cambiaron datos de producción.

## Verificado

- `node scripts/test-data-workspace.cjs`: coordenadas A1 con filas vacías, rangos inválidos, datos originales sin mutación, valores exactos de gráfico y tabla, X=0 en dispersión, 12 series, escape de SVG, color y tipografía, siete intervalos de histograma y 18 grupos de cajas sin agrupar.
- TypeScript y compilación de producción correctos.
- API: vista previa, selección para chat, rechazo de rangos inválidos, datos pegados y rechazo de un archivo que pertenece a otro trabajo. Usuario sin sesión: 401; otros estudiantes, tutor y administración: 404 al crear un artefacto del estudiante; trabajo aprobado: 409.
- Navegador: configurar rango, ver vista previa, crear gráfico, arrastrarlo desde su tarjeta al documento, cambiar valores negativos/decimales, tipo, color, tamaño de letra y cuadrícula. Guardar y recargar conserva el objeto, datos originales, cambios y origen AI-assisted. Recalcular usa los valores del nuevo rango.
- Tabla: arrastre real, celdas nativas editables, marcas AI-assisted, deshacer/rehacer y rechazo de una referencia de arrastre falsificada.
- Interfaz compacta: crear, renombrar, cambiar, duplicar y eliminar pestañas; promover conservando la entrega anterior; insertar texto IA con coste previo y marca; pegado externo abre atribución.
- Móvil a 390×844: editor de gráfico desplazable y sin desbordamiento horizontal. Capturas de escritorio y móvil inspeccionadas visualmente. Sin excepciones de página en los flujos completados.

## Alcance

La edición de tablas, ecuaciones y diagramas conserva sus mecanismos existentes; el nuevo editor de datos y formato es para gráficos. No se validó interoperabilidad de gráficos nativos editables en Word/Google Docs ni arrastre hacia aplicaciones externas. No se ejecutó una matriz exhaustiva de los 17 análisis ni todas las exportaciones en esta sesión. La vista previa remota depende de la compilación de Vercel y su protección de acceso.
