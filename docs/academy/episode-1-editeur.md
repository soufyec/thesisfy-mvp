# Academy · Épisode 1 · L'éditeur

Deux versions :

- `episode-1-editeur-narre.mp4` : 1080 x 1920, 63 s, **avec narration** (voix neuronale française, Henri) et un fond sonore discret généré. Zone caméra : carré en bas à droite, 500 x 420, à 40 px des bords (x 540–1040, y 1460–1880). Sous-titres incrustés, aussi dans `episode-1-editeur-narre.srt`.
- `episode-1-editeur.mp4` : même contenu sans son, 45 s, zone caméra large en bas (1080 x 640).

Pour un son « tendance » : les musiques populaires sont sous licence ; on ne peut pas les ajouter ici. Importe le mp4 dans Instagram ou TikTok et ajoute le son depuis leur bibliothèque, qui est licenciée pour la plateforme. Baisse alors le fond sonore généré ou remplace-le.

| Repère | Ce qu'on voit | Narration |
|---|---|---|
| 0:02 | L'éditeur Thesisfic : votre mémoire, comme dans Docs ou Word | Et si votre mémoire prouvait lui-même comment il a été écrit ? Voici l'éditeur Thesisfic. |
| 0:08 | Vous écrivez normalement : ce texte compte comme « Rédigé » | Vous écrivez, c'est tout. Chaque phrase tapée compte comme rédigée. Pas de détecteur, pas de soupçon. |
| 0:16 | Vous collez un passage : l'éditeur demande d'où il vient | Vous collez un passage ? L'éditeur vous demande simplement d'où il vient. |
| 0:21 | Déclaré comme cité : marqué en orange. Jamais une accusation, une attribution. | Cité d'une source, référence notée : le passage est attribué, en orange. Jamais une accusation. |
| 0:28 | Thesisfic AI pense avec vous : plan, critique, sources… jamais la rédaction | Thesisfic AI, payé par votre université, pense avec vous : plan, critique, sources. Il ne rédige jamais à votre place. |
| 0:37 | Avant d'insérer : le coût en mots et en % d'IA, visible par vous et par votre tuteur | Avant d'insérer, le coût s'affiche : combien de mots, et votre part d'IA face à la limite de votre formation. |
| 0:43 | Inséré et marqué « Assisté par IA », en violet, dans le document | Inséré, marqué en violet. Vous gardez le contrôle, et la provenance reste. |
| 0:49 | Le registre d'intégrité : l'étudiant et le tuteur voient exactement la même chose | Le registre d'intégrité : rédigé, cité, assisté. Votre directeur voit exactement la même chose que vous. |
| 0:57 | Thesisfic.edu We teach your students how to use AI, properly. | Thesisfic. We teach your students how to use AI, properly. |

## Re-enregistrer

```
JWT_SECRET=x npx next start -p 3043      # store en mémoire : redémarrer avant chaque prise (la part d'IA de la thèse démo monte à chaque insertion)
node scripts/academy/record-editor.mjs      # capture 1080 x 1280 via screencast → frames/, marks.json
python3 scripts/academy/compose.py          # version muette, zone caméra large
# narration : edge-tts (pip install edge-tts), voix fr-FR-HenriNeural, un mp3 par scène (nar_0.mp3 …) depuis episode-1-narration.json
python3 scripts/academy/compose-narrated.py # version narrée : scènes étirées pour la voix, carré caméra, fond sonore
```

Les réponses de l'assistant viennent du mode démo (pas de clé Gemini en local) ; le chip du modèle est renommé « Gemini 3.8 Flash » comme en production. Pour une prise avec les vraies réponses, lancer le serveur avec `GEMINI_API_KEY` et retirer ce remplacement dans le script.
