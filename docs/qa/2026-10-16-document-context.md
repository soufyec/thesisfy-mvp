# Acceso del asistente al documento — 16 octubre 2026

## Causa y cambio

El chat enviaba metadatos del trabajo y, opcionalmente, una selección; no incluía el cuerpo del documento. El proveedor podía afirmar correctamente que solo veía título, descripción y número de palabras.

`DocsEditor` proporciona una instantánea de la pestaña abierta mediante una función consultada al enviar cada mensaje. `AssistantPanel` la envía como campo opcional. La ruta autentica el acceso al trabajo y acepta instantáneas sin guardar solo de su propietario. Otros casos usan el texto guardado de la entrega final. El documento se incorpora como material delimitado, separado de las instrucciones y de la biblioteca. Las reglas de referencias externas se limitan a la biblioteca; una búsqueda sin coincidencias no impide revisar el documento.

Todos los modos reciben este contexto. Una selección centra la respuesta. Un documento largo se limita a fragmentos con posiciones, apertura, cierre y coincidencias con la pregunta; se etiqueta explícitamente como parcial. No se afirma una lectura completa si solo se envían fragmentos. No se modifica el texto ni se guarda la instantánea en el historial.

## Pruebas

- `npx tsc --noEmit` y compilación de producción correctos.
- `node scripts/test-document-context.cjs`: texto guardado y extracción HTML, pestaña activa, cambios sin guardar, borrador vacío sin recuperar texto antiguo, instantáneas de personal ignoradas, fragmentos de documentos largos y separación de biblioteca.
- Regresiones de archivos, política, traducciones, datos, SVG e historial correctas.
- Chrome sobre la compilación de producción local: se impide expresamente el autoguardado; se escribe un marcador y se pide «Évaluez mon argument» sin seleccionar texto. Se comprueba el cuerpo de la solicitud y el mensaje de sistema recibido por un proveedor local de prueba. Ambos contienen el texto sin guardar, ausente en la copia guardada.
- Cambio a otra pestaña: el siguiente turno transmite su contenido y nombre, sin reutilizar la instantánea anterior.
- Petición sin instantánea y con biblioteca vacía: el proveedor recibe el documento guardado.
- Otro estudiante con consentimiento: 404. Administrador autorizado con instantánea manipulada: se ignora y se usa el documento guardado. Sin errores JavaScript.

El proveedor local devuelve respuestas conocidas para comprobar el recorrido de datos; no evalúa la calidad de una crítica de Claude u otro modelo. No hay llamadas de pago ni publicación en producción.
