# Descripción del software en el cuestionario

Se sustituye únicamente la descripción de «Une autre approche» para docentes (`p_solution`) y estudiantes (`e_solution`). El francés reproduce exactamente el párrafo de `description logiciel questionnaire.docx`, facilitado por el usuario. Se actualizan sus versiones en inglés, español, alemán, portugués y árabe.

Se conserva la indicación para el entrevistador en el segundo párrafo. El catálogo mantiene sus 286 entradas y la descripción permanece en el índice 141. No cambian preguntas, opciones, claves, navegación ni respuestas guardadas.

Verificación estructural frente a HEAD: únicamente cambian las dos descripciones en la definición y una entrada en cada catálogo. La extracción OOXML confirma coincidencia exacta del francés con el documento. `node scripts/test-questionnaire-editor.cjs` pasa, incluida la cobertura de los catálogos y la validación de respuestas canónicas.

`npm run build` y `npx tsc --noEmit`: correctos. Navegador integrado sobre la compilación de producción local: las seis lenguas muestran el nuevo párrafo en ambos recorridos, con coincidencia entre las versiones docente y estudiante. Se inspeccionan capturas de español y árabe; el español se muestra completo y el árabe conserva RTL. Se guarda captura anterior para comparación. No se envía ninguna respuesta ni se modifica la base de datos del entorno publicado.
