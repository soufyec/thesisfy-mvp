# Vídeo del onboarding · «A two-minute tour»

Tres vídeos, uno por idioma de la interfaz, que se reproducen en la primera página del onboarding del editor (`IntroModal`). Cada uno recorre la aplicación real con un ratón virtual mientras una voz narra en ese idioma: dashboard → editor → escribir → pegar y atribuir → Thesisfic AI (Critique) → tarjeta de coste e inserción (Outline) → Integrity ledger → la misma vista del tutor → lema.

| Archivo | Qué es |
|---|---|
| `public/videos/tour-{en,es,fr}.mp4` | 1280 × 720, H.264 + AAC mono, ~100 s, ~6 MB |
| `public/videos/tour-{en,es,fr}.vtt` | Subtítulos de la narración, una frase por cue |
| `public/videos/tour-{en,es,fr}.jpg` | Póster (fotograma del editor) |
| `src/lib/onboarding.ts` → `ONBOARDING_VIDEO` | Rutas, duración y capítulos (Writing & provenance · Thesisfic AI · Integrity ledger · Your advisor) |

## Voces

Kokoro 82M (licencia Apache 2.0, voces libres para uso comercial): `af_heart` en inglés, `ef_dora` en español, `ff_siwis` en francés, velocidad 0,97. Los textos están en `scripts/academy/tour-narration.json`; se sintetiza un clip por escena para poder alinear cada frase con la acción en pantalla.

## Volver a generar

```
pip install kokoro soundfile && apt-get install espeak-ng          # una vez
npm run build                                                        # el grabador usa la build de producción
TOUR_OUT=/tmp/tour-video python3 scripts/academy/tts-tour.py        # → nar/<lang>_<escena>.wav + durations.json
TOUR_OUT=/tmp/tour-video scripts/academy/make-tour.sh en es fr      # graba y compone cada idioma
```

`make-tour.sh` reinicia el servidor antes de cada toma (el store es de memoria y la parte de IA de `thesis_1` sube con cada inserción), ejecuta `record-tour.mjs` (Playwright, cursor virtual, una escena por clip de narración; cada escena dura al menos lo que su audio) y `compose-tour.py` (ffmpeg: mezcla los clips en su marca de tiempo, normaliza, recorta, codifica y escribe VTT y póster). Al final imprime un JSON con `duration` y `chapters` para pegar en `ONBOARDING_VIDEO`.

El servidor local no tiene clave de IA: las respuestas vienen del modo demo y el chip del modelo se renombra a «Gemini 3.8 Flash» como se ve en producción con un modelo ofrecido por la universidad. Para una toma con respuestas reales, arranca el servidor con `GEMINI_API_KEY` y quita el renombrado en `record-tour.mjs`.

Para cambiar el guion: edita `tour-narration.json`, vuelve a sintetizar y vuelve a grabar; las escenas se alargan solas a la nueva duración.
