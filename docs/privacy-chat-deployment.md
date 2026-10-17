# Chat: privacy_unavailable

El despliegue de producción examinado el 17 de octubre de 2026 corresponde a
`fe464381084d713b801cb464de310c23bea762b2`, rama `codex/compact-ai-workspace`,
proyecto Vercel `thesisfy-mvp-bbe1`. Vercel lo marca READY, pero no se ha podido
verificar su servicio privado: el conector rechaza logs y acceso al preview.

## Corrección incluida

La selección automática de idioma rechazaba cualquier resultado de langdetect
fuera de EN/FR/ES/DE con HTTP 422. El chat convertía ese rechazo en
`privacy_unavailable`. Ahora, ante detección no soportada o fallida, se ejecutan
los cuatro modelos NER instalados, igual que con mensajes cortos. No se omite NER.
Los idiomas explícitos no soportados siguen rechazándose.

El cliente muestra una explicación traducida. Los errores de configuración,
red y HTTP generan únicamente una categoría y un estado en el log del servidor;
nunca texto del chat, respuestas del servicio, claves ni URLs privadas.

Esta corrección resuelve ese caso reproducible. No demuestra que sea la causa
de la indisponibilidad observada en producción; falta comprobar el servicio remoto.

## Comprobación al desplegar

1. Integrar el PR en `codex/compact-ai-workspace` y desplegar esa revisión en el
   proyecto existente. El despliegue debe incluir `web`, `privacy` y `language`
   definidos en `vercel.json`, y reconstruir la imagen de privacidad (incluye
   el nuevo archivo `languages.py`).
2. Vercel debe inyectar `PRIVACY_INTERNAL_URL` mediante el binding de `web`.
   No sustituirlo por una URL pública ni desactivar el filtrado de privacidad.
   `JWT_SECRET` debe estar disponible con el mismo valor en los servicios que
   participan en la autenticación interna.
3. Con sesión de equipo en producción, consultar `/api/health/engines`.
   `privacyConfiguration` indica si hay endpoint y autenticación configurados;
   `privacyError` distingue categorías sin revelar valores. Comprobar
   `privacy: true` y enviar un mensaje de prueba desde el chat con el modelo real.
4. Si falla, consultar `[privacy] Chat blocked` en logs de `web`:

| reason | Acción |
| --- | --- |
| missing_endpoint | Comprobar que se desplegaron todos los servicios y que el binding se inyecta en runtime. |
| invalid_endpoint | Revisar configuración de URL interna o `PRESIDIO_ANALYZER_URL` si se usa un servicio externo privado. |
| http, status 403 | Comprobar autenticación interna y `JWT_SECRET` compartido. |
| http, status 422 | Revisar validación de idioma/entidades y confirmar que la nueva imagen está desplegada. |
| http, status 5xx / network | Revisar arranque, recursos, conectividad y logs del contenedor privacy. |
| invalid_response / analysis | Revisar contrato del analizador y estado de sus modelos. |

La verificación remota y la publicación quedan a cargo del usuario. No se ha
publicado ni promovido ningún despliegue desde esta corrección.
