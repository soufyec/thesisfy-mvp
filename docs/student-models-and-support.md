# Modelos institucionales, esfuerzo y soporte

## Elección del estudiante

El catálogo se configura en `/admin/ai-access`. El estudiante elige el modelo
institucional exacto y después su esfuerzo. El servidor valida universidad,
catálogo habilitado, política y capacidades; una selección no disponible no se
sustituye silenciosamente. Las cuentas personales existentes conservan su acceso
según la política institucional. Una vez configurado un catálogo institucional,
las claves generales de la plataforma no añaden modelos fuera de ese catálogo.

Claude compatible recibe `output_config.effort`; Gemini 3+ recibe
`thinkingConfig.thinkingLevel`, y Gemini 2.5 un presupuesto compatible. Los
modelos e integraciones sin control verificado muestran esfuerzo fijo. Foundry
mantiene esfuerzo fijo hasta validar su contrato específico. Gemini Pro 3/3.1
ofrece bajo/alto. La elección no cambia los límites globales de salida y no
garantiza una respuesta más acertada. El coste real se calcula con la respuesta
del proveedor; no se aplican multiplicadores ficticios por nivel.

Gemini contabiliza respuesta y razonamiento una sola vez, sin mostrar bloques de
pensamiento. Claude ya informa del total de salida facturable. Las llamadas con
clave de plataforma usadas como oferta institucional cuentan ahora en el cupo.
Los tokens restantes siguen siendo una estimación basada en el presupuesto y el
uso anterior; los controles existentes no reservan saldo de forma transaccional
para consultas simultáneas. No se promete un número fijo de respuestas por nivel.

## Ayuda y tickets

El botón con el logo aparece abajo a la izquierda en las páginas del estudiante.
Puede reducirse a un botón discreto, conservando la preferencia en ese navegador.
El asistente de ayuda es guiado: responde con instrucciones localizadas sobre el
producto, sin enviar el problema a otro modelo ni consumir el cupo académico.
Ante una consulta de IA actualiza automáticamente las opciones disponibles y
restablece solo selecciones que ya no están disponibles. No recarga ni modifica
documentos, credenciales, reglas de privacidad, notas, fechas o cupos.

El estudiante puede escalar la consulta como ticket, seguirlo y contestar desde
«Mis tickets». La bandeja de plataforma está en `/equipe/support`, protegida por
sesión de equipo; el correo privado de destino no aparece en la interfaz ni en
las respuestas del API del estudiante. La institución no obtiene acceso a los
tickets de otros centros. Solo el equipo de plataforma gestiona la bandeja global.

Categorías: cuenta/acceso, editor/guardado, IA/modelos/saldo, archivos/fuentes,
tareas/entregas, privacidad/seguridad y otras consultas/sugerencias. El servidor
asigna urgencia según categoría y síntomas; el equipo puede corregirla. La cola
ordena primero vencidos y después urgencia y vencimiento. Los tickets abiertos
se priorizan en la consulta; se muestran hasta 500 tickets por lectura.

El compromiso solicitado es primera respuesta humana en un máximo de dos horas
continuas desde la apertura. El acuse automático no satisface ese plazo. Se
guarda la hora límite, se marca el vencimiento y se registra la primera respuesta
del equipo; no se puede resolver un ticket sin respuesta humana previa. El equipo
debe atender la bandeja para cumplir el compromiso: no hay cobertura humana ni
vigilancia de vencimientos en segundo plano creada automáticamente por este PR.

Los tickets se guardan en una tabla Postgres independiente, con actualizaciones
bajo bloqueo y control de propietario. Sin base de datos, producción rechaza el
envío en lugar de confirmar un ticket efímero. Desarrollo admite memoria local.
Los mensajes están limitados, se rechazan orígenes ajenos y se limita la creación
de tickets por estudiante. Las respuestas del equipo generan una notificación
interna al estudiante con enlace al hilo.

## Resend y publicación

Variables **solo de servidor**:

- `RESEND_API_KEY`: clave de envío de la cuenta existente, añadir como secreto
  directamente en Vercel. No pegarla en chats ni publicarla en el repositorio.
- `SUPPORT_NOTIFY_TO`: destinatario privado, configurado en Vercel a petición del
  propietario. No hay dirección personal predeterminada en el código.
- `SUPPORT_FROM_EMAIL`: remitente autorizado por Resend. Para el caso confirmado
  por el propietario se ha configurado `Thesisfic <onboarding@resend.dev>`, que solo
  puede enviar al correo de esa misma cuenta de Resend. Para otros destinatarios
  se necesita un dominio propio verificado.

El aviso contiene referencia, categoría, prioridad y plazo; no el texto del
problema. El equipo lee los mensajes y responde desde la bandeja autenticada.
La aceptación del envío por Resend no demuestra entrega en la bandeja de entrada.
Si falta configuración o falla el envío, el ticket se conserva y la bandeja avisa
al equipo y permite reintentar con clave de idempotencia.

No se ha desplegado en producción. Antes de publicar: configurar
`RESEND_API_KEY`, desplegar la rama revisada, abrir un ticket de prueba, comprobar
el correo en Resend y en el buzón, responder desde `/equipe/support` y verificar
la notificación y el hilo del estudiante. Comprobar también los niveles con las
credenciales reales de los modelos de la institución; las pruebas locales usan
transportes simulados y claves ficticias.

Validación: `test-ai-effort.cjs`, `test-support.cjs`, pruebas existentes de motores
y privacidad, TypeScript, build Next.js, y recorrido local en navegador de
estudiante → ticket → bandeja de equipo → respuesta. Las capturas locales de QA
se guardan en `reports/`, excluido del repositorio.
