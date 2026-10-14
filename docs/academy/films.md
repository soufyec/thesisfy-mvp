# Vídeos narrados · estudiantes, universidades y teaser

Tres vídeos con la misma historia (el enfoque de Chloé: la cifra, la pregunta, por qué existe Thesisfic y el ejemplo de Léa), cada uno en los cuatro idiomas de la interfaz y con voz de ElevenLabs.

| Vídeo | Dónde se ve | Duración | Lema final |
|---|---|---|---|
| `intro-student-<lang>` | Primera página del onboarding del editor (`IntroModal`, `ONBOARDING_VIDEO`) | ~1:30 | «Learn to use AI: properly, ethically, responsibly.» |
| `intro-university-<lang>` | Landing, bloque de la prueba gratuita: «Watch the overview for universities» | ~1:30 | «Teach your students how to use AI: properly, ethically, responsibly.» |
| `teaser-<lang>` | Landing, hero: «Watch the film» | ~0:32 | El de universidades, con «Request a free trial» |

Archivos en `public/videos/<nombre>-<lang>.{mp4,jpg,vtt}`: 1280 × 720, H.264 (CRF 26) + AAC 96 kbit/s, póster y subtítulos WebVTT en el idioma de la voz. Rutas y duraciones en `src/lib/films.ts`; capítulos del vídeo de estudiantes en `src/lib/onboarding.ts` (Por qué Thesisfic · Escritura y procedencia · Thesisfic AI · Registro de integridad · Tu tutor).

## Guion

Trece escenas. Las de universidades y estudiantes solo cambian en la 2, la 3 y el lema:

1. La cifra: el 95 % de los estudiantes de grado a tiempo completo del Reino Unido usa la IA de alguna forma (HEPI, *Student Generative AI Survey 2026*, n = 1.054, Savanta, diciembre de 2025). Es la única cifra del vídeo y lleva su fuente en pantalla.
2. La pregunta. Universidades: «ya no es cómo impedir que la usen, sino cómo guiarles para que la usen bien». Estudiantes: «ya no es si la usas, sino cómo la usas bien».
3. «Por eso creamos Thesisfic»: el marco para combinar la IA con el pensamiento propio.
4–12. Léa, de Stanford, con tres meses para su tesis: ajustes, tesis, editor con el margen verde, Research copilot, coste antes de insertar IA, pegado con su atribución, biblioteca de fuentes, registro de integridad y la vista del tutor.
13. El lema, con sus tres palabras apareciendo cuando la voz las dice.

El teaser usa la escena 1, la pregunta en dos líneas («ya no es si la usan; es si aprenden a pensar con ella»), tres destellos del producto («Cada palabra, atribuida» · «Cada sugerencia de la IA, declarada» · «Cada paso, visible para ellos y para ti») y el cierre con el logo, el lema y la invitación a la prueba gratuita. No enseña el recorrido completo.

## Voces

ElevenLabs, modelo `eleven_v4`, etiquetas `[warmly]`, `[confident]`, `[pause]` y `[long pause]`. Voces: Kayleigh (inglés), Paloma (español), Perle (francés) y Sonja (alemán). En español, «IA» se escribe en el guion como fonema `/i.ˈa/` para que se pronuncie en español y no como «A-I» en inglés. Las tomas están en el flow de ElevenLabs `KQdfKPzKk1Un1nylEVLu`.

El vídeo de estudiantes reutiliza la voz de universidades en las escenas 1 y 4–12 y solo graba aparte la 2, la 3 y el lema; los cortes caen en las pausas y el nivel se iguala por toma.

Sin música: la conexión de ElevenLabs disponible es la restringida (solo voz). Para añadirla hace falta el conector completo (`https://api.elevenlabs.io/v1/mcp`, en Ajustes → Conectores → conector personalizado).

## Cómo se fabrican

1. **Animática** (`docs/academy/films/animatic/index.html`): una página que dibuja las escenas con capturas reales del producto (`shots/`), el logo y los textos de los cuatro idiomas, y reproduce la narración. Tiene un selector de versión (universidades, estudiantes, teaser) y expone `window.__render.setup(lang, cut)` y `seek(t)` para renderizar fotograma a fotograma de forma determinista.
2. **Alineación** (`scripts/academy/films/align.py`): para cada toma, elige los cortes entre escenas con programación dinámica sobre las pausas (premia pausas largas y penaliza escenas cuya duración se aleja de su parte del texto) y localiza el arranque de las tres palabras del lema con la envolvente de energía.
3. **Montaje** (`assemble.py`): copia las tomas elegidas, empalma la versión de estudiantes y escribe `cuts.json` con los inicios de escena, las palabras y los subtítulos.
4. **Render** (`render.mjs` + `compose.py`): Playwright captura la animática a 1920 × 1080 y 25 fps; ffmpeg une fotogramas y voz y escribe los subtítulos.
5. **Web** (`web.py`): versión 720p, póster y VTT en `public/videos`, y actualiza las duraciones de `films.ts` y los capítulos de `onboarding.ts`.

```
python3 -m http.server 3095 --directory docs/academy/films/animatic &          # la animática, en local
npm run build && npx next start -p 3082 &                                       # para las capturas
OUT=<dir>/page/shots node scripts/academy/films/capture.mjs                     # s04–s12 desde la build local
python3 scripts/academy/films/align.py <dir>        # tomas en <dir>/narr/dl/<lang>_<uni|stu|tea>_v<n>.mp3, textos en <dir>/narr/scenes.json
python3 scripts/academy/films/assemble.py <dir>     # → <dir>/page/narration/<cut>-<lang>.mp3 y <dir>/narr/cuts.json
node scripts/academy/films/render.mjs <lang> <uni|stu|teaser> <dir>/video 25     # FROM/TO (segundos) para rehacer solo un tramo
python3 scripts/academy/films/compose.py <dir> <cut> <lang>
python3 scripts/academy/films/web.py <dir> . [cut:lang …]
```

`docs/academy/films/` guarda la animática con sus capturas y la narración final de cada versión, `cuts.json` (inicios de escena, palabras del lema y subtítulos) y `scenes.json` (el texto de cada escena de universidades). Las tomas originales siguen en el flow de ElevenLabs.

Las capturas se toman de una build local con las cuentas demo (Léa Martin, `thesis_1` a 91 días de la entrega); el chip del modelo se muestra como lo ve un estudiante cuya universidad ofrece un modelo.
