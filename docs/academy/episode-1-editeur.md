# Academy · Épisode 1 · L'éditeur

Vidéo verticale 1080 x 1920, 45 s, sans son. Zone caméra : bande inférieure 1080 x 640 (y = 1280 à 1920). Sous-titres : `episode-1-editeur.srt`.

Montage : importe le mp4 dans CapCut ou Premiere, pose ta vidéo caméra sur la zone « Ton visage ici » (recadrage 1080 x 640), supprime ou garde les sous-titres incrustés. La voix doit suivre les repères ci-dessous.

| Repère | Ce qu'on voit | Ce que tu dis |
|---|---|---|
| 0:02 | L'éditeur Thesisfic : votre mémoire, comme dans Docs ou Word | Voici l'éditeur Thesisfic. Vous écrivez votre mémoire ici, comme dans Docs ou Word : onglets, mise en forme, export. Rien à apprendre. |
| 0:06 | Vous écrivez normalement : ce texte compte comme « Rédigé » | Quand vous tapez, le texte compte simplement comme « rédigé ». Pas de détecteur, pas de score : l'éditeur note ce qui se passe, au moment où ça se passe. |
| 0:12 | Vous collez un passage : l'éditeur demande d'où il vient | Vous collez un passage de plus de trente mots ? L'éditeur vous demande d'où il vient : vos notes, une source, ou un outil d'IA. |
| 0:16 | Déclaré comme cité : marqué en orange. Jamais une accusation, une attribution. | Je choisis « cité d'une source » et j'indique la référence. Le passage est marqué en orange. Ce n'est pas une accusation, c'est une attribution, visible par moi et par mon directeur. |
| 0:21 | Thesisfic AI pense avec vous : plan, critique, sources… jamais la rédaction | L'assistant Thesisfic AI est payé par l'université. Il fait un plan, critique, explique, cherche des sources. Il ne rédige jamais à votre place : si vous le lui demandez, il refuse et vous propose un plan ou des questions. |
| 0:27 | Avant d'insérer : le coût en mots et en % d'IA, visible par vous et par votre tuteur | Avant d'insérer quoi que ce soit, l'éditeur affiche le coût : combien de mots, et où en est votre part d'IA par rapport à la limite fixée par votre formation. |
| 0:33 | Inséré et marqué « Assisté par IA », en violet, dans le document | Une fois inséré, le texte est marqué en violet, « assisté par IA ». Vous pouvez l'utiliser, le modifier, mais sa provenance reste. |
| 0:37 | Le registre d'intégrité : l'étudiant et le tuteur voient exactement la même chose | Le registre d'intégrité résume tout : rédigé, cité, assisté. Et le point clé : votre directeur voit exactement le même registre que vous. Rien de caché. |
| 0:41 | Thesisfic.edu We teach your students how to use AI, properly. | Thesisfic : we teach your students how to use AI, properly. Épisode 2 : comment faire critiquer un argument par l'IA sans qu'elle l'écrive pour vous. |

## Re-enregistrer

```
JWT_SECRET=x npx next start -p 3043   # store en mémoire : le redémarrer avant chaque prise (la part d'IA de la thèse démo augmente à chaque insertion)
node scripts/academy/record-editor.mjs   # capture 1080 x 1280 via screencast, écrit frames/ et marks.json dans le scratchpad
python3 scripts/academy/compose.py       # montage ffmpeg : zone caméra, sous-titres, srt
```

Les réponses de l'assistant dans cette prise viennent du mode démo (pas de clé Gemini en local) ; le chip du modèle est renommé « Gemini 3.8 Flash » comme en production. Pour une prise avec les vraies réponses, lancer le serveur avec `GEMINI_API_KEY` et retirer ce remplacement dans le script.
