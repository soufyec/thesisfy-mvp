# Impacto por público debajo de los CTA

El hero presenta dos encabezados con un párrafo breve cada uno, en el lugar de los tres puntos originales. Se eliminan las tarjetas, fondos, bordes, iconos y títulos secundarios de la primera propuesta. Los textos se apilan con un espaciado de 16 px, encabezados de 14 px y cuerpo de 13 px, sin relleno adicional.

«As a student» destaca el tiempo dedicado a cambiar entre herramientas, mover archivos y repetir contexto. «As an institution» destaca el registro automático del uso de IA dentro de Thesisfic, menos recopilación manual de declaraciones y feedback directamente en el documento, con acceso a la evolución del trabajo y las decisiones del estudiante. La declaración del uso no se confunde con la política institucional, que sigue siendo necesaria.

La propuesta se basa en el caso de uso descrito por el usuario y las funciones del producto. No se prometen mejores notas, ahorros económicos, horas concretas ni pruebas de autoría, esfuerzo o ausencia de IA externa. Los cuatro idiomas de la landing (EN/ES/FR/DE) tienen la misma estructura y significado.

El cambio se limita a `Hero.tsx` y al diccionario de landing. Los CTA conservan `/demo`, `#how` y el vídeo. La escena orbital y la vista del editor se conservan.

Verificación de esta revisión: `npm run build`, `npx tsc --noEmit` y `git diff --check` correctos. Las rutas `/en`, `/es`, `/fr` y `/de` devuelven HTTP 200. Un parser del HTML confirma dos encabezados traducidos, ausencia de artículos/tarjetas y títulos secundarios anteriores, etiqueta accesible y destinos `/demo` y `#how` conservados. Se ofrece la compilación local en `http://127.0.0.1:3071/es` para revisión humana.

Límite visual: el inventario del navegador integrado volvió a devolver cero navegadores en esta revisión. No se puede obtener una captura posterior ni comprobar visualmente el diseño adaptable o la animación. No se utilizan herramientas de control alternativas. La captura anterior facilitada por el usuario se conserva en los archivos de trabajo.
