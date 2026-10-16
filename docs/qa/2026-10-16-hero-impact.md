# Impacto por público debajo de los CTA

Se sustituyen los tres puntos de la cabecera por dos bloques, en el mismo lugar debajo de los CTA. El bloque estudiante relaciona la dispersión entre documento, fuentes y conversaciones con una investigación conectada y reglas claras. El bloque docente/institución relaciona la falta de contexto del resultado con la lectura del proceso, las reglas aplicadas y el feedback durante la elaboración.

La propuesta se basa en el caso de uso descrito por el usuario y en las funciones del producto, no en entrevistas o métricas de conversión verificadas. No se prometen mejores notas, un ahorro de tiempo cuantificado ni evaluación automática. Los beneficios se traducen a los cuatro idiomas de la landing: EN, ES, FR y DE.

El cambio se limita a `Hero.tsx` y al diccionario de landing. Los CTA conservan `/demo`, `#how` y el vídeo. Las dos tarjetas usan una columna en móvil y dos desde `sm`, con semántica de sección/artículos y títulos visibles. La escena orbital y la vista del editor se conservan.

El usuario proporcionó la captura anterior de los tres puntos, conservada en los archivos de trabajo.

Verificación: `npm run build`, `npx tsc --noEmit` y `git diff --check` correctos. Sobre la compilación local, solicitudes HTTP a `/en`, `/es`, `/fr` y `/de` devuelven 200. Un parser del HTML comprueba que el hero contiene exactamente dos artículos con los títulos traducidos, que los antiguos puntos están ausentes y que se conservan los destinos `/demo` y `#how` y la etiqueta accesible de sección. El CSS compilado contiene el fondo de las tarjetas y las clases de una/dos columnas.

Límite: no se pudo completar la revisión visual automática ni obtener una captura posterior. El navegador integrado dejó de estar disponible; su inventario devolvió cero navegadores y la consulta al navegador seleccionado devolvió `Browser is not available`. No se utilizaron herramientas de control alternativas. Se ofrece el servidor local en `http://127.0.0.1:3071/es` para revisión humana. No se afirma que se haya comprobado visualmente el diseño adaptable ni la animación.
