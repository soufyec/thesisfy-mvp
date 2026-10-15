# Paráfrasis y arrastre de figuras — 16 octubre 2026

Se incorpora Paráfrasis como sexto acceso compacto. El identificador persistido `paraphrase_check` conserva el historial y los permisos institucionales existentes. El modelo recibe el pasaje suministrado o seleccionado y debe conservar significado, datos, matices y citas; pide un pasaje si falta. El resultado puede insertarse o sustituir la selección, con coste previo y procedencia. Sin proveedor se informa de que hace falta conectar un modelo.

«Lagunas» se denomina «Carencias» en español: identifica afirmaciones sin evidencia, saltos lógicos y aspectos sin abordar.

Los gráficos y diagramas usan un SVG independiente como imagen del arrastre. La tarjeta, herramientas, avisos y pie de figura permanecen en su lugar. La transferencia sigue usando la referencia local validada; no cambia el contenido guardado ni su procedencia. Dentro del documento se sustituye la imagen predeterminada de TipTap después de su manejador de arrastre.

Se elimina el aviso verde posterior a la inserción de texto, archivos y figuras. Permanecen las marcas moradas, el coste previo, los límites, el registro y los errores.

## Validación

- Regresiones de archivos, política, traducciones, instrucciones de paráfrasis y datos/SVG/historial correctas.
- El proveedor local de respuestas conocidas comprueba el flujo de integración; no evalúa la calidad de una paráfrasis de un proveedor real ni consume llamadas de pago.
- TypeScript y compilación de producción correctos.
- Chrome sobre la compilación de producción: seis modos en una fila, dos sugerencias, descargas e historial conservados, sin errores JavaScript ni desbordamiento móvil.
- Arrastre real de un gráfico al documento: el elemento pasado a `setDragImage` contiene solo un SVG, sin botones ni `figcaption`. Un evento de arrastre dentro del documento también sustituye la imagen de TipTap por el SVG. Sin aviso verde posterior; edición de datos, color, tipo, recálculo, guardado/recarga y origen IA conservados.
- Paráfrasis : pasaje suministrado → respuesta transmitida → coste previo → inserción marcada, sin toast verde.
- Selección real del editor → Paráfrasis → sustituir selección con coste previo: marcas de procedencia presentes y sin aviso verde.
