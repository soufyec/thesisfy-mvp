# Filtros del copilot y configuración global del producto

## Causa y cambio

El motor solo aceptaba operaciones/columnas y selección A1; `AnalysisSpec` no podía expresar condiciones sobre los valores. El prompt enumeraba esas operaciones sin filtros. Por eso el modelo respondía que no podía limitar los años y generaba todo el período.

Se añade `filters` a las operaciones de datos, con conjunción AND: `eq`, `neq`, `in`, `gt`, `gte`, `lt`, `lte`, `between` inclusivo, `isMissing` y `isNotMissing`. Los filtros se validan y aplican antes de agrupaciones, estadísticas y pruebas. Se conservan en la especificación y en la configuración para recalcular el gráfico, junto al hash del archivo y las coordenadas originales. La fuente no cambia. Columnas, operadores, tipos, límites invertidos y condiciones sin coincidencias producen un error, nunca una figura del período completo como sustituto.

El prompt documenta el contrato. Para intervalos explícitos como «desde 2012 hasta 2014», el servidor conserva la condición aunque el modelo la omita, siempre que identifique una columna temporal inequívoca. En casos ambiguos el modelo debe preguntar; no se usa un parser general de lenguaje natural. El planificador sin modelo también entiende este intervalo en EN/ES/FR/DE. Los límites de año sobre fechas incluyen el año completo. Una nota visible indica condiciones y filas utilizadas.

## Panel del equipo

`/equipe/produit` reutiliza el acceso del equipo (`TEAM_PASSWORD`), con enlace desde los resultados del cuestionario. El API `/api/equipe/product` exige esa sesión para leer y guardar. Una sesión de estudiante no basta. El guardado valida el origen del navegador, la revisión y todos los campos, con límites de texto y enteros.

Controles: asistente global, modo predeterminado, disponibilidad de los seis modos, instrucciones adicionales generales y por modo, descripción breve en EN/ES/FR/DE, búsqueda académica remota, creación de archivos de investigación descargables, tokens de respuesta, mensajes de conversación enviados como contexto y artefactos por respuesta. Los modelos/credenciales, presupuestos y política institucional conservan su administración existente. No se incluyen claves de proveedores ni instrucciones privadas en el API de metadatos para estudiantes.

Las instrucciones complementan las reglas del producto; no sustituyen consentimiento, permisos de documentos, procedencia ni límites de inserción. El servidor comprueba desactivación global y del modo antes de llamar al modelo. La creación manual de artefactos del copilot también respeta ese control; se permite previsualizar/recalcular objetos existentes sin una nueva interacción IA. El límite de mensajes cambia el contexto conversacional enviado, no borra el historial ni limita el contexto del documento. Desactivar archivos impide crear nuevas tarjetas de archivo; los materiales anteriores siguen en su historial.

Se puede descartar la edición y cargar valores predeterminados en el formulario antes de guardar. El modo predeterminado debe seguir activado. Los chats ya abiertos requieren recarga para actualizar la lista de modos y las descripciones; las nuevas peticiones reciben inmediatamente las restricciones del servidor. La explicación del modo activo ocupa una línea breve debajo del selector, con tooltip por modo.

## Persistencia

La configuración se guarda en el Store existente mediante `db.productSettings`, compatible con Postgres/DATA_FILE y con valor predeterminado cuando el campo aún no existe. Sin almacenamiento persistente, el panel avisa que la configuración puede perderse al reiniciar. La revisión detecta ediciones concurrentes sobre la copia actual del Store; no se sustituye la arquitectura de persistencia del documento completo por transacciones independientes entre réplicas. Este cambio no configura ni migra el almacenamiento de producción.

## Evidencia

- `node scripts/test-data-filters.cjs`: años y fechas inclusivos, valores por grupo, operadores numéricos, inclusión, nulos, combinación AND, filas originales, datos sin mutación, planificador en cuatro idiomas, filtro omitido por el modelo, recreación editable, condiciones inválidas/sin filas y límite de artefactos.
- `node scripts/test-product-settings.cjs`: acceso del equipo, denegación sin sesión y con origen ajeno, validación de campos/límites, conflicto de revisión, descripciones traducidas, instrucciones privadas, reglas base conservadas, lecturas separadas y persistencia en archivo temporal.
- Regresiones existentes de workspace, contexto del documento y archivos de investigación correctas.
- Recorrido HTTP local con datos aislados y un proveedor de respuestas conocidas: login estudiante/equipo, subida de CSV con 132 filas de 2010–2020, petición exacta de 2012–2014 → gráfica con esos tres años y 36 observaciones. Respuestas JSON y SSE correctas. Instrucciones y límite de 512 tokens presentes en la petición real al proveedor. Configuración privada ausente en `/api/ai/providers`; cambios globales/de modo bloquean el chat con 403. Se restauraron los valores predeterminados del entorno de prueba.
- Navegador: login de equipo redirige al panel, edición y guardado de descripción española de Crítica, confirmación de revisión guardada y controles/localización EN/ES/FR/DE comprobados en accesibilidad. Se inspeccionó una captura estrecha del formulario y se acortó el botón para cargar predeterminados. El navegador dejó de estar disponible durante la revisión posterior; no se completaron capturas de escritorio/móvil ni revisión visual del chat o la gráfica.

La respuesta conocida del proveedor prueba el contrato y las restricciones del servidor, no la calidad o fiabilidad de un modelo comercial. Ninguna petición de prueba se envió a un proveedor de pago. `npm run build`, `npx tsc --noEmit` y `git diff --check` finales correctos. Se repitió una prueba HTTP sobre la compilación de producción: página de equipo protegida y en español, cálculo real del planificador demo de 2012–2014 con 36 filas, guardado con origen válido y bloqueo de creación directa de artefactos con el asistente desactivado. Se conserva una vista local de prueba con datos ficticios y sin claves de proveedores de pago en `http://127.0.0.1:3072/equipe/produit`.
