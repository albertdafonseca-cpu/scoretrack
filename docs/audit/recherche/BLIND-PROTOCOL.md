# Protocole de comparaison à l'aveugle — ScoreTrack vs références

## 1. Objectif et contrainte

Répondre, dimension par dimension, à la question du brief (§5) : « un critique très dur, comparant à l'aveugle avec la meilleure app du marché, préfère-t-il ScoreTrack ou ne peut-il pas trancher ? »

Contrainte : dans cet environnement, **aucune application tierce ne peut être exécutée** (pas d'iOS/Android, stores et sites de critiques bloqués par le proxy). La comparaison porte donc sur des **dossiers descriptifs anonymisés**, pas sur des manipulations. Ce protocole est conçu pour rester honnête malgré cette asymétrie.

## 2. Rôles

- **Préparateur** (agent RECHERCHE ou auditeur principal) : constitue les dossiers, anonymise, tient la clé d'identité sous scellé.
- **Critique(s)** : un ou plusieurs agents ou personnes n'ayant pas participé à la construction de ScoreTrack ni lu `REFERENCES.md`. Idéalement 3 critiques indépendants ; minimum 1.
- **Arbitre** : l'auditeur principal ; ne note pas, vérifie la conformité du protocole et publie la clé après notation.

## 3. Constitution des dossiers

Pour chaque dimension D1–D8 de `RUBRIC.md`, deux dossiers **de forme strictement identique** :

- **App A** et **App B** (attribution aléatoire, tirée au sort par dimension, consignée dans `key.json` chiffré ou tenu hors du dossier du critique).
- Chaque dossier contient :
  1. `description.md` — 150 à 250 mots, ton neutre, **même gabarit** (Comportement / Détails d'exécution / Limites connues). Vocabulaire normalisé : « panneau », « zone + / zone − », « appui long », « journal », jamais de nom de produit, de marque, de format (« Commander », « PV », « Loi du Milieu »), de langue d'interface ni de plateforme.
  2. `captures/` — 2 à 4 images au même format (1170×2532 ou redimensionnées à 585×1266), **toutes retouchées de la même façon** : bandeau supérieur (heure, batterie) masqué, logo/nom d'application flouté, titres textuels remplacés par un rectangle gris, police d'interface non identifiable dans les zones de chrome (les chiffres de score restent visibles car c'est l'objet de l'évaluation).
  3. `mesures.md` — uniquement pour les critères mesurables (fps, contraste, tailles) : la valeur, la méthode, et la mention **« mesuré »** ou **« non mesuré — déclaré par la source »**.
- Pour ScoreTrack : descriptions écrites à partir de l'exécution réelle ; captures Playwright réelles ; mesures réelles (scripts versionnés).
- Pour la référence : descriptions rédigées à partir de `REFERENCES.md` (fiches, critiques, dépôts) ; captures = **images publiques de la fiche store ou du site éditeur** quand elles sont accessibles au préparateur, sinon **aucune capture** et la mention « capture indisponible » apparaît **dans les deux dossiers** pour cette dimension (on retire alors aussi les captures du dossier ScoreTrack afin de garder la symétrie).
- La référence retenue par dimension est celle nommée dans `RUBRIC.md` ; si elle ne couvre pas un critère (ex. Mutility limité à 4 joueurs), le dossier le dit explicitement (« non couvert par cette application ») plutôt que de le taire.

## 4. Séance de notation

1. Le critique lit `RUBRIC.md` (grille seule, sans le nom des références : une version `RUBRIC-blind.md` est générée automatiquement en supprimant la ligne « Meilleure référence » et les noms propres).
2. Ordre des dimensions tiré au sort par critique.
3. Pour chaque dimension, le critique remplit `score-Dn.md` :
   - pour chaque critère : A = OUI/NON/INDÉTERMINÉ, B = OUI/NON/INDÉTERMINÉ, et la **preuve citée** (nom de capture, ligne de mesure). « INDÉTERMINÉ » est obligatoire si le dossier ne permet pas de conclure ; il n'est pas pénalisé.
   - une **préférence globale** : A / B / Indécis, avec une justification de 2 phrases.
   - un **niveau de confiance** 1–5 (5 = preuves directes des deux côtés ; 1 = descriptions seules).
4. Le critique ne peut ni ouvrir ScoreTrack ni chercher sur le web pendant la séance (il ne doit pas pouvoir reconnaître une capture publique).
5. Durée indicative : 10 min par dimension.

## 5. Dévoilement et exploitation

- Après remise de tous les `score-Dn.md`, l'arbitre publie `key.json`. Les fichiers de notation sont **figés** (hash SHA-256 consigné avant dévoilement).
- Verdict par dimension :
  - **ScoreTrack AAA** si préférence = ScoreTrack ou Indécis **ET** 5/5 critères OUI pour ScoreTrack avec preuve.
  - **Non AAA** sinon ; les critères NON/INDÉTERMINÉ alimentent `GAPS.md` (mise à jour).
- Avec 3 critiques : majorité simple ; un « préférence référence » unanime sur une dimension à 5/5 impose de réviser la grille (un critère manque).
- On publie aussi le **taux d'INDÉTERMINÉ** côté référence : c'est la mesure de l'incertitude du protocole.

## 6. Limites d'honnêteté (à reproduire dans tout rapport qui cite ce protocole)

1. **Asymétrie de preuve.** ScoreTrack est mesuré et capturé en exécution réelle ; les références sont **décrites depuis des sources publiques** (fiches stores, critiques, dépôts GitHub, extraits de moteur de recherche), sans exécution. Une référence peut être meilleure ou pire que sa description. Le critique doit noter INDÉTERMINÉ chaque fois que le dossier de la référence ne prouve pas un critère, et ce résultat ne doit **jamais** être converti en « NON » au bénéfice de ScoreTrack.
2. **Biais de rédaction.** Les descriptions des deux dossiers sont écrites par la même équipe qui a construit ScoreTrack. Parades : gabarit identique, vocabulaire normalisé, longueur ±20 %, relecture croisée par un agent qui ne connaît pas la clé, et inclusion obligatoire de la section « Limites connues » remplie pour les deux apps (pour ScoreTrack, à partir de `GAPS.md`).
3. **Biais de reconnaissance.** Les captures publiques des références peuvent être connues du critique ; les captures de ScoreTrack ont un style propre. On floute le chrome et on normalise le format, mais l'aveugle n'est **pas parfait** ; le niveau de confiance et le tirage au sort A/B par dimension en limitent l'effet, sans l'annuler.
4. **Périmètre.** Les références sont pour la plupart spécialisées (Magic : 1–6 joueurs, compteurs de vie ; Skyjo : feuilles de manches). Aucune ne couvre exactement « 1–12 joueurs, cartes orientées, thèmes, français ». Une supériorité de ScoreTrack sur un critère non couvert par la référence (ex. 12 joueurs) est signalée comme « hors périmètre de la référence », pas comme une victoire.
5. **Fraîcheur.** Les fiches et critiques datent de 2017–2026 ; les applications évoluent. La date de consultation (16 septembre 2026) et l'URL sont conservées pour chaque fait dans `REFERENCES.md`.
6. **Ce que le protocole ne remplace pas.** Il ne remplace ni un test utilisateur réel sur table (5 personnes, 1 m, lumière de salon), ni une exécution côte à côte sur téléphone. Si l'un ou l'autre devient possible, il **prime** sur ce protocole et ses résultats remplacent les verdicts correspondants.

## 7. Livrables du protocole

```
research/blind/
  RUBRIC-blind.md
  D1/  A/description.md  A/captures/  A/mesures.md
       B/description.md  B/captures/  B/mesures.md
  …
  D8/
  scores/<critique>/score-D1.md … score-D8.md
  key.json            (publié après notation)
  hashes.txt          (SHA-256 des scores avant dévoilement)
  VERDICT.md          (tableau 8 dimensions × critiques, taux d'indéterminé, écarts renvoyés vers GAPS.md)
```
