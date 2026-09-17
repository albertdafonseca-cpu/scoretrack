# Politique de sécurité

ScoreTrack est une application web statique qui s'exécute entièrement sur l'appareil de
l'utilisateur : aucun serveur, aucun compte, aucune donnée transmise. Le modèle de menace complet
est décrit dans [docs/SECURITE.md](docs/SECURITE.md).

## Signaler une vulnérabilité

- De préférence : l'onglet **Security → Report a vulnerability** du dépôt GitHub (signalement privé,
  si le propriétaire l'a activé).
- Sinon : ouvrez une issue intitulée « Sécurité » **sans détail exploitable** et demandez un canal
  privé ; le propriétaire vous répondra pour la suite.

Merci d'indiquer : la version (constante `VERSION` de `sw-st.js` servie, ou le commit),
le navigateur, les étapes de reproduction et l'impact constaté.

## Périmètre

Sont dans le périmètre : injection dans l'interface (noms de joueurs, données importées), intégrité
du service worker et du cache, corruption ou perte de données locales, faiblesse de la CSP.
Hors périmètre : l'hébergeur (GitHub Pages), le navigateur, et les dépendances de développement
qui ne sont jamais servies aux utilisateurs.

## Versions prises en charge

Seule la dernière version publiée sur la branche par défaut est prise en charge ; les PWA installées
se mettent à jour d'elles-mêmes (bannière « Nouvelle version disponible »).
