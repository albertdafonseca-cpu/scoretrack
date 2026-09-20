# Critique élément F — tour 4 (final)

Audité : arbre de travail du 19 septembre 2026 (HEAD `57c88d9` + modifications non commitées de F, A et B),
copié dans `…/scratchpad/critic/F4/repo` ; sorties dans `…/critic/F4/*.log` (`chain.log` = journal horodaté).
Rapport rendu à 20:32 sur injonction du coordinateur alors que la fin de la chaîne (Lighthouse pessimiste,
liste blanche, lint, `check:sw`, unit, hors-ligne) tournait encore ; ces points s'appuient sur les mesures du
tour 3 et sont marqués comme tels.

## 1. Performance — texte honnête, VÉRIFIÉ ; job rouge, attribué à B

ADR-15 : « le job `lighthouse` est **rouge**, et il l'est de façon reproductible … pire 0,89 < 0,95, `npm run
lhci` sort **1** … le critique obtient la même chose deux fois sur deux » ; leçon « un résultat obtenu une fois
n'est pas un résultat » (DECISIONS.md:306). Aucun euphémisme ; cause et propriétaire (B, LCP 1,98–3,36 s)
nommés. CHANGELOG « Connu et non livré » reprend les deux travaux rouges avec attribution. Mes mesures du
tour 3 (machine calme : 0,90/0,93/0,91/0,98/0,95, EXIT=1) concordent. **Une contradiction subsiste** :
`docs/AUDIT-2026-09.md:118` affiche encore pour le 19 septembre « **0,95** (0,95–0,98) » alors que la ligne 124
du même document dit « rouge, pire 0,89 » (D15). À corriger : la cellule du tableau.

## 2. Plafond de précache — justifié, VÉRIFIÉ

ADR-21 + commentaire `ci.yml` : profils nommés (Slow 3G Chrome 400 kbit/s/RTT 2 s → 18,0 s ; 3G Lighthouse
750 kbit/s → 9,6 s ; 4G lente 1,6 Mbit/s → 4,4 s, arithmétique recalculée exacte à 0,1 s), poids 744 335 o
(82,7 %) daté, alerte à **90 %** (810 000) au-dessus du poids courant, `warnAt = 0.9` dans le YAML : plus de
bruit permanent. Les sept dégradations sont listées **dans le même ordre** dans ADR-21 et SECURITE § 3.
Quibble : le 7ᵉ item « emoji / `sw-st.js` périmé » en compte deux.

## 3. Captures — déterminisme PROUVÉ par moi

`npm run check:screenshots` deux fois de suite (charge 3,0–3,3) : **8 captures identiques aux fichiers
versionnés**, md5 des huit fichiers de la 2ᵉ génération = md5 des versionnés. Un octet écrasé dans
`docs/img/recap-390x844.png` → **EXIT=1**, message « octets différents … régénérez ». Légende « douze joueurs »
désormais sur `game-12-390x844.png` (douze cartes nommées) ; la tablette est légendée « quatre cartes ».
Le job `paquet` exécute `check:screenshots` avant `build:dist`, artefact `captures-regenerees` en cas d'échec.
Réserve « prouvé ici, pas sur le runner » : correctement écrite (ADR-19 « Limite connue », même Playwright
1.56.1/Chromium 1194 sur Ubuntu, réponse = régénérer depuis l'artefact, jamais relâcher). Le mécanisme de
reprise est suffisant pour le premier passage, avec **deux trous** : (a) si le runner devient la référence,
un contributeur non-Linux verra `check:screenshots` rouge en local — à écrire dans CONTRIBUTING ; (b)
`.github/dependabot.yml` groupe les bumps mineurs de `@playwright/test`, donc de Chromium : un bump silencieux
casserait la comparaison — exclure `@playwright/test` du groupe ou coupler tout bump à une régénération.
Point d'exécution : `docs/img/*.png` est **non suivi** (`?? docs/img/`) — à `git add` avant commit, sinon la
CI échoue sur « capture manquante ».

## 4. « Connu et non livré » — VÉRIFIÉ

Contraste (`design`, 40 écarts `span.pplayer` 4,10–4,69 < 4,70, sept thèmes, B) et performance (`lighthouse`,
0,89, LCP, B) avec attribution, plus fragilité de mesure, diagnostic, licence, SHA.

## Encore en cours au moment du rendu (résultats du tour 3 faisant foi)

Liste blanche : sain 0 / six dégradations 1 (tour 3, `…/F3/gate3.sh`) ; emoji → 1 (tours 2-3) ; `dist/` hors
ligne 59 entrées, 0 erreur console (tour 3). Lighthouse pessimiste : rouge attendu (0,89 chez F, 0,90 chez moi).

## Verdict final

| Domaine                                                                                                             | Note | Preuve principale                                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| CI                                                                                                                  | 8/10 | garde-fous prouvés, pessimiste, `lint:tokens`, `check:screenshots` ; rouge restant = B, documenté |
| Déploiement                                                                                                         | 9/10 | liste blanche, plafond justifié, captures déterministes ; `docs/img` à versionner                 |
| Sécurité                                                                                                            | 9/10 | CSP complète, permissions par job, 0 vuln ; SHA en attente (ADR-20 honnête)                       |
| Documentation                                                                                                       | 8/10 | D16–D21 fidèles, ADR-15/19/21 vrais ; une cellule fausse dans AUDIT:118                           |
| **AAA : non** — pour F il manque : AUDIT:118, `git add docs/img`, les deux compléments d'ADR-19 (plateforme locale, |
| Dependabot/Playwright). Le reste du rouge (LCP, contraste des prénoms) appartient à B et est honnêtement consigné.  |
