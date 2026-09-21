# Constat initial — reprise de l'audit sur la base réelle de `main` (20 septembre 2026)

## Ce qui a changé depuis le premier audit
Le premier audit portait sur le commit `3452b66`, une version isolée du projet. Pendant cet audit, cinq autres demandes de fusion, sans lien avec lui, ont été acceptées sur `main` :
1. Dés 3D : refonte du rendu (d4, d48, d60, d100, d120), arrondi des arêtes
2. Lanceur de dés : feuille à hauteur fixe, fermeture par glissement
3. **Migration TypeScript** : sources dans `src/`, construction par esbuild, typage strict
4. Dés 3D : chiffres cerclés plus lumineux
5. Lanceur de dés : le d100 compte des points, sans notion de pourcentage

`main` est aujourd'hui une base TypeScript de 7 750 lignes (`src/`) plus un `index.html` de 1 743 lignes, avec un moteur de dés 3D en Three.js, dix-huit langues d'interface, un export du récapitulatif en PDF, et un déploiement Vercel. Le travail du premier audit (modules JS natifs, PWA GitHub Pages) ne s'applique plus : cette branche a été développée séparément et n'a hérité d'aucune des corrections précédentes.

## Défauts bloquants (P0) — identiques dans l'esprit au premier audit, réapparus indépendamment
1. **Politique de confidentialité inexacte**, à l'identique du premier audit : le texte affirme « ScoreTrack ne collecte aucune donnée personnelle » alors qu'à chaque ouverture l'application contacte `fonts.googleapis.com`/`fonts.gstatic.com` (police) et, à l'export PDF, `cdnjs.cloudflare.com` (bibliothèque jsPDF). Le service worker précache même ces URLs externes, ce qui automatise la fuite plutôt que de la corriger.
2. **Injection HTML par les noms de joueurs**, identique au premier audit : `game.ts:510` construit un gestionnaire `onclick` en interpolant le nom dans une chaîne, protégé seulement contre l'apostrophe (`name.replace(/'/g,"\\'")`). Un nom contenant `<`, `"` ou `</span>` casse l'affichage ou exécute du code. Cinq autres constructions `innerHTML` du même fichier interpolent des données sans échappement générique.
3. **Aucun test, aucune intégration continue, aucun lint.** `npm run check` ne fait que vérifier les types et construire. Aucun test unitaire, aucun test de bout en bout, aucun contrôle de style, aucun contrôle d'accessibilité ou de contraste n'existe. Une régression fonctionnelle ou visuelle ne serait détectée que par un utilisateur.

## Défauts majeurs (P1)
4. **Accessibilité quasi nulle** : un seul attribut `role`/`aria-*` dans tout `index.html` ; soixante-cinq gestionnaires `onclick` inline ; textes descendant à 4, 7, 8 et 9 pixels ; aucune structure de focus visible identifiée.
5. **État mutable global dispersé** : `game.ts` (1 988 lignes, le plus gros module) mêle état, réglages, logique de partie, rendu de carte et récapitulatif, avec au moins huit propriétés `window._*` utilisées comme variables globales partagées entre modules (`window._pendingEndgame`, `window._lastAdjustPrev`, etc.). C'est la même architecture que le monolithe du premier audit, simplement redistribuée sur plusieurs fichiers TypeScript sans découplage réel.
6. **jsPDF chargé par CDN sans contrôle de version figée dans le dépôt** (balise `<script>` externe) : absent hors ligne au premier lancement, comme documenté par l'équipe elle-même dans `CLAUDE.md` — c'est un aveu écrit d'un défaut connu et non corrigé.
7. **Emojis système comme icônes** (💀, 🏆, 🔒 notamment) : rendu non maîtrisé selon la plateforme, incohérent avec la charte visuelle par ailleurs soignée du moteur de dés.

## Ce qui est bon et doit être conservé tel quel
- **Le moteur de dés 3D est un travail précis et déjà validé par le propriétaire.** `CLAUDE.md` documente un ensemble de choix explicitement arbitrés (angle du d4 à 30°, rayon d'arrondi 0.18, facteur de sphérisation du d48/d120, absence de notion de pourcentage sur le d100, hauteur fixe de la feuille de lancer) avec la mention « ne pas modifier sans demande ». Ces choix sont des décisions au sens du journal du premier audit : elles ne doivent pas être rediscutées ni « améliorées » esthétiquement par cet audit. Le seul traitement légitime ici est la qualité d'ingénierie (robustesse, types, gestion des erreurs, testabilité géométrique), jamais l'esthétique.
- La convention déjà fixée du contraste par luminance (pas par teinte seule) pour l'accessibilité daltonienne, appliquée au moteur de dés.
- La séparation en modules TypeScript typés strictement, même si l'état reste trop couplé : c'est une meilleure base de départ que l'ancien fichier unique.
- Le principe d'un service worker en vrai fichier (pas une URL `blob:`), correctement diagnostiqué et corrigé par l'équipe précédente comme non fonctionnel sous l'ancien mode.
- Dix-huit langues d'interface déjà en place : à auditer pour la cohérence, pas à refaire.

## Infrastructure et déploiement
Hébergement Vercel (`vercel.json` : construction par `npm run build`, répertoire `dist/`). Aucun secret requis. Aucune CI visible sur GitHub. Pas de licence déclarée dans `package.json`.
