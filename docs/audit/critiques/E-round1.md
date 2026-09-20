# CRITIQUE — Élément E (PWA, hors-ligne, sauvegarde, résilience, haptique) — tour 1

Auditeur : critique E. Aucun fichier du dépôt modifié. Preuves : `scratchpad/critic/E/`
(logs `pwa-run1.log`, `pwa-head.log`, specs adverses `critic-e-*.spec.js`, serveur `critic-server.js`,
copies `head/` = `git archive HEAD` et `old/` = `git archive 3452b66`).

## 0. État de la suite au moment de l'audit

| Cible                                                          | Résultat                          |
| -------------------------------------------------------------- | --------------------------------- |
| `npx playwright test tests/e2e/pwa.spec.js` (arbre de travail) | **5 échecs / 9** — `pwa-run1.log` |
| Idem sur `git archive HEAD` (copie propre)                     | **9 / 9** — `pwa-head.log`        |

Les 5 échecs ont une cause unique et identique : **chaque `touchscreen.tap` compte double**
(attendu 3 → reçu 6 ; 14 → 18 ; 1 → 2 ; 22 → 24). `js/ui/game.js` est en chantier chez A
(+629/−340 lignes non committées). **Ce n'est pas un défaut de E** ; c'est en revanche exactement
le critère 3.5 « aucun double déclenchement souris+tactile », aujourd'hui violé dans l'arbre de travail.
Tous mes scénarios adverses ont donc été joués sur la copie HEAD, stable.

`npm run check:sw` échoue aussi sur l'arbre de travail (liste de précache périmée depuis l'ajout de
`js/fx/`) : chantier A, pas E. Le garde-fou est correctement branché en CI (`ci.yml:42`) **et** dans la
porte de déploiement (`deploy-pages.yml:36`) — c'est un bon point pour E.
Lint `eslint` sur les fichiers de E : **propre**.

## 1. Lecture critique de `tests/e2e/pwa.spec.js`

Bon niveau général (vrai hors-ligne par arrêt du serveur, vraie seconde version de SW servie,
comparaison du précache au fichier généré). Trois faiblesses réelles :

1. **3.5 est simulé, pas joué.** Le test « haptique » importe `haptics.js` et appelle `haptic('tap')`
   depuis `page.evaluate`. Il ne prouve **jamais** qu'un tap réel sur une carte déclenche une vibration,
   et il ne teste **pas du tout** le dédoublonnage souris/tactile exigé par 3.5. Au commit HEAD,
   `js/ui/game.js` n'appelait même pas `haptic()` sur un changement de score (il utilisait l'API
   dépréciée `vibrate(PATTERN_BLOCKED)`) : le test passait au vert avec la fonctionnalité absente.
   (A vient d'ajouter le vrai test dans `game.spec.js:400` — à re-vérifier après son atterrissage.)
2. **7.2 sous-mesuré.** `collectErrors` ne retient que `m.type() === 'error'` ; la grille exige
   « 0 erreur **et 0 avertissement** ». J'ai mesuré moi-même 0 avertissement sur le parcours complet
   (`critic-e-75.spec.js`), donc le critère tient — mais la suite ne le prouve pas.
3. **Assertion vide sur les raccourcis.** `pwa.spec.js:149` fait `page.goto('?action=resume')` et
   n'assère que `status === 200` + `#setup-page` visible. Cette assertion **prouve que le raccourci
   ne fait rien**, tout en donnant l'apparence d'une couverture. Idem `pwa.spec.js:461`
   (`request.get(s.url)` → 200). Voir §2(h).

## 2. Scénarios adverses (joués, pas raisonnés)

| #   | Scénario                                                                                                                                   | Résultat mesuré                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Verdict                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| a   | **Ancien SW `st-v1` (3452b66) réellement installé**, puis même port servant la version actuelle                                            | Caches avant : `["st-v1"]`. Rechargement 1 : DOM encore ancien, caches `["st-b4704f20","st-fonts-v1","st-v1"]`. Rechargement 2 : DOM neuf, caches `["st-b4704f20"]`. **Aucune intervention, 2 rechargements, anciens caches purgés.**                                                                                                                                                                                                                                                                                                                                                                                                                                        | OK (perfectible)          |
| a′  | (incident) le SW de 3452b66 précachait `./favicon.png`, absent de ce commit → `addAll` rejeté → **le SW d'origine ne s'installait jamais** | fait historique, sans conséquence sur E                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                         |
| b   | Mise à jour pendant une partie, **2 onglets**                                                                                              | Bannière dans les 2 onglets ; onglet 1 applique → rechargé, partie intacte, `["st-critic-b"]` ; onglet 2 : aucune erreur, DOM vivant, `fetch` OK                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | OK                        |
| b′  | Onglet **non initiateur** après application ailleurs                                                                                       | `announce(null)` (sw-client.js:57) **masque la bannière de l'onglet 2** ; celui-ci est alors contrôlé par le SW `critic-bp` alors que son DOM et ses modules sont de l'ancienne version, **sans aucun signal**                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **MAJEUR**                |
| c1  | Coupure sur 3 fichiers **essentiels** pendant le précache                                                                                  | Installation annulée : `controller: false`, `caches: []`, aucun `installing/waiting/active`. **Aucun message, aucune trace côté page** (les `console.warn` du SW ne remontent pas). L'utilisateur croit l'app installée                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **MAJEUR**                |
| c2  | Réseau rétabli, retour de l'utilisateur                                                                                                    | Installation réussie, 55/55 fichiers. Auto-guérison correcte                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | OK                        |
| c3  | Coupure sur 3 actifs **non essentiels** (2 woff2 + sprite)                                                                                 | **Installation déclarée réussie avec 52/55**. Hors ligne : `fontsInError: ["Orbitron","Inter"]`, sprite absent → **polices de secours visibles**, contraire à D8 « hors-ligne parfait » et à 5.1. `ESSENTIAL` (`sw-st.js:83`) exclut `.woff2` et `.svg`                                                                                                                                                                                                                                                                                                                                                                                                                      | **MAJEUR**                |
| d   | localStorage rempli (79 × 64 Kio, ~9,9 Mo UTF-16 = quota atteint) + 50 taps                                                                | Score 51 en mémoire **et** 51 sauvegardé (l'écrasement d'une clé existante ne consomme pas de quota) ; `.tmp` absent ; aucune perte. **Message utilisateur : AUCUN**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | OK (mais cf. e)           |
| e   | `Storage.prototype.setItem` lève sur les clés `scoretrack*`                                                                                | L'app démarre, joue, score = 2 correct en mémoire, **`scoretrack_save` = null**, 0 `pageerror`. **Message utilisateur : AUCUN.** Par conception : `logError(e,'storage.quota:…')` n'est pas notifié aux observateurs (`errors.js:64`)                                                                                                                                                                                                                                                                                                                                                                                                                                        | **MAJEUR (7.3)**          |
| e2  | `window.localStorage` inaccessible (getter lève)                                                                                           | Écran de configuration visible, partie lancée, tap → score 1. **0 `pageerror`.** Jeu en mémoire correct                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | OK, excellent             |
| f   | Horodatage 5 ans dans le futur                                                                                                             | `relativeTime` borne à 0 → « Sauvegardée à l'instant » ; aperçu correct ; pas de plantage. Reste l'attribut `datetime="2031-…"` incohérent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | mineur                    |
| g   | Sauvegardes **v0 réelles** (4 fixtures)                                                                                                    | Les 4 reprises sont transparentes, **0 erreur** : `v0-solo` 1 carte/2 pts ; `v0-fresh-4p` 4×40 ; `v0-advanced-4p` éliminé conservé ; `v0-12p-neg` 12 joueurs, −1 234 567 et 9 999 999 formatés. Nom `Bob <b>&'"` rendu en texte (pas d'injection)                                                                                                                                                                                                                                                                                                                                                                                                                            | OK, excellent             |
| h   | `?action=resume` **sans** sauvegarde / **avec** sauvegarde / `?action=new`                                                                 | Sans : écran de configuration, rien. **Avec : `gameVisible: false`, écran de configuration + bannière de reprise — identique à `./`.** `?action=new` : écran de configuration **avec la bannière de reprise encore affichée** — identique à `./`. `grep -rn "searchParams\|action=new"` sur `js/` : **0 occurrence**                                                                                                                                                                                                                                                                                                                                                         | **BLOQUANT (D14)**        |
| i   | Import de 20 Mo                                                                                                                            | Refusé en 105 ms, « Fichier trop volumineux. » (plafond 1 Mio)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | OK                        |
| i′  | `__proto__` et `constructor.prototype` à l'import                                                                                          | `Object.prototype` **intact** (aucune pollution). Mais `validateSettings` (`backup.js:60`) fait `{ ...raw, ...serializeSettings(...) }` : **toute clé inconnue du fichier importé est conservée et persistée**. Vérifié : `scoretrack_settings` stocké = `{"constructor":{"prototype":{"polluted4":"oui"}},"v":1,…}`. Contredit « validation stricte » du contrat                                                                                                                                                                                                                                                                                                            | **MAJEUR**                |
| j   | `navigator.storage` absent                                                                                                                 | `persist → null`, `estimate` = tout `null` sauf `localStorageBytes`, diagnostic « persistant : inconnu », 0 erreur, partie sauvegardée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | OK, excellent             |
| k   | Fermeture de l'onglet 0 / 10 / 60 ms après un tap                                                                                          | Sauvegarde présente `[1,0]` **dans les 3 cas** (`pagehide` + `visibilitychange`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | OK, excellent             |
| l   | CSP                                                                                                                                        | Meta seule (pas d'en-tête HTTP). Inline **réellement bloqué** (« Refused to execute inline script… script-src 'self' »), donc `eval` aussi ; aucun `eval`/`new Function` dans le code. **Manquent `base-uri` et `form-action`** (aucun repli depuis `default-src`). `worker-src` retombe sur `script-src 'self'` → SW autorisé. **Le SW lui-même n'est couvert par aucune CSP** (`sw-st.js` servi sans en-tête ; une meta ne s'applique pas au contexte worker) — infaisable sur GitHub Pages, donc **à documenter, pas à prétendre**. La page hors ligne générée par le SW contient `onclick=` et `<style>` **inline et sans CSP** : incohérente avec la politique de l'app | **MAJEUR (durcissement)** |

## 3. `sw-st.js` lu en exploitant hostile

- **Course installation/activation** : `precache()` échoue → installation annulée, aucun cache partiel
  laissé (`caches: []` mesuré en c1). `activate` = `cleanup()` puis `clients.claim()`. Correct.
- **Empoisonnement du cache** : `res.ok` garde toutes les écritures ; les origines tierces sont
  ignorées (`url.origin !== self.location.origin → return`) → **aucune réponse opaque ne peut entrer**. Correct.
- **Requêtes non-GET** : `request.method !== 'GET' → return` (pas de `respondWith`). Vérifié : POST passe au réseau. Correct.
- **Portée** : `./` = racine ; manifeste `scope: "./"`, `start_url: "./"`. Cohérent.
- **Requêtes `Range`** : **non gérées**. Mesuré : `Range: bytes=0-99` sur une woff2 → **statut 200, 48 256 octets** au lieu de 206/100. Sans effet aujourd'hui (aucun média), cassant dès qu'un `<audio>`/`<video>` apparaît. → mineur.
- **`caches.match` global** : `handleNavigation` (l.175) et `cacheFirst` (l.192) interrogent **tous les caches**, pas `CACHE`. Chromium itère par ordre de création : pendant la fenêtre migration (st-v1 créé avant st-VERSION, avant `cleanup()`), un `./index.html` **étranger** pourrait être servi par le SW neuf. Non reproduit (cleanup s'exécute avant claim), mais c'est une bombe à retardement gratuite. → majeur latent.
- **Cohérence de version** : **non, on ne peut pas servir un index.html neuf avec un module ancien** dans le cas nominal — un seul cache `st-<hash-du-contenu>`, précaché atomiquement, `cleanup()` supprime tout le reste et les entrées orphelines. C'est le point le plus solide du SW. La faille est ailleurs : **côté client** (scénario b′), un onglet garde des modules anciens pendant que le cache ne contient plus que les neufs ; tout `import()` dynamique tardif (`errors.js:104` importe `storage.js` et `sw-client.js`) mélange alors deux versions.
- **Contenu du précache** : 60 entrées, **600,3 Kio**. Inutiles au premier chargement et jamais requis à l'exécution : `assets/icons/sprite.svg` (les tracés vivent dans `js/ui/icons.js`, aucun `fetch`), `assets/brand/logo.svg`, `assets/brand/logo-mono.svg`, `icons/favicon-32.png` (référencé nulle part), `icons/icon-512.png` + `maskable-512.png` (34 Kio, utiles à l'installation seule). Les 12 woff2 (260 Kio) servent 14 thèmes : 2 à 3 suffisent au premier rendu. La liste est produite par **parcours de répertoire**, pas par dépendance : elle grossira silencieusement à chaque fichier ajouté.
- **Captures du manifeste** : `assets/screenshots/` n'est **pas** dans `DIRS` de `build-sw.mjs` → **non précachées. Bon choix** (elles ne servent qu'à l'invite d'installation, qui suppose le réseau) ; à ne pas « corriger ».
- **Stratégie du manifeste** : `manifest-st.json` est précaché → `cacheFirst`. Correct.

## 4. Comparaison à l'aveugle — D7 (BLIND-PROTOCOL)

App A = ScoreTrack. App B = LifeLinked (référence D7 de `RUBRIC.md`, **décrite, non exécutée** —
limite §6.1 du protocole : aucun INDÉTERMINÉ de B ne doit être converti en NON).

| Critère                              | A       | B                                                                                     | Preuve A                                                                     |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 7.1 hors-ligne complet               | OUI     | INDÉTERMINÉ (natif hors ligne par nature, mais dépendance réseau Scryfall documentée) | serveur arrêté + `setOffline`, partie complète jouée, 55/55 précachés, 0 404 |
| 7.2 0 erreur / 0 avertissement       | OUI     | INDÉTERMINÉ (« crash protection » suppose des plantages)                              | `critic-e-75.spec.js` : 0 / 0 sur le parcours complet                        |
| 7.3 sauvegarde corrompue / quota     | **NON** | INDÉTERMINÉ (rien de documenté)                                                       | quarantaine + `.prev` excellents ; quota/stockage muet (scénarios d, e)      |
| 7.4 mise à jour signalée             | OUI     | hors périmètre (mise à jour par magasin)                                              | bannière + application + purge `st-v1`, mesurés                              |
| 7.5 reprise (dont pile d'annulation) | **NON** | partiel documenté (« app state… recovery upon a crash »)                              | 0 annulation possible après reprise                                          |

**Préférence : Indécis, avec un net penchant pour A.** A prouve par mesure ce que B ne fait
qu'affirmer dans un README (7.1, 7.2, 7.4), et sa gestion de sauvegarde corrompue (quarantaine
`.corrupt`, restauration `.prev`, somme de contrôle FNV-1a, écriture `.tmp`→bascule) n'a aucun
équivalent documenté sur le marché. Mais A perd la pile d'annulation à la reprise alors que les
données sont sur le disque, et reste **totalement muet** quand le stockage refuse d'écrire : deux
défauts qu'un utilisateur ressent, là où B se contente de promettre une restauration d'état.
Confiance : 3/5 (preuves directes d'un seul côté). **D7 : 3/5 → non AAA.**

## 5. Verdict critère par critère

| Critère                                                                                           | Verdict          | Preuve                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7.1** Hors ligne complet, SW installé sans erreur, précache sans 404                            | **OUI**          | `pwa-head.log` test 1 ; `cachedCount === PRECACHE.length` (55) ; `server.stop()` réel. Réserve : c3 (installation « réussie » à 52/55)                                                        |
| **7.2** 0 erreur / 0 avertissement / 0 `unhandledrejection`                                       | **OUI** (à HEAD) | `critic-e-75.spec.js` : 0 avertissement, 0 erreur. Mais l'assertion du dépôt ne couvre pas les avertissements                                                                                 |
| **7.3** Sauvegarde corrompue, schéma inconnu, **quota dépassé** → message clair                   | **NON**          | JSON tronqué : parfait (`pwa.spec.js:264`). **Quota / stockage indisponible : aucun message** (scénarios d, e : `toast: null`, `saved: null`)                                                 |
| **7.4** Mise à jour signalée, appliquée sans perte, anciens caches purgés                         | **OUI**          | `pwa-head.log` tests 2 et 3 ; scénario (a) réel : 2 rechargements, `["st-b4704f20"]`. Réserve majeure : b′                                                                                    |
| **7.5** Reprise : scores, sièges, historique, **pile d'annulation**, éliminés ; écriture atomique | **NON**          | `#undo-btn` **désactivé** après reprise, 0 annulation, alors que `log.entries = 3, cursor = 3` est bien persisté et relu. Atomicité : OUI (`.tmp`/`.prev`/`sum`/flush `pagehide`, scénario k) |
| **3.5** Haptique sur chaque changement, motifs distincts, pas de double déclenchement             | **NON**          | Aucun test ne relie un tap réel à `navigator.vibrate` ; à HEAD `game.js` n'appelait pas `haptic()` ; l'arbre de travail **double** chaque tap (5 échecs)                                      |

### Sous-total D7 : **3 / 5** → **AAA : NON.**

`haptics.js` lui-même est irréprochable (motifs distincts, préférence lue et invalidée sur
`STORAGE_EVENT` + `storage`, no-op silencieux) ; c'est son câblage et sa preuve qui manquent.

## 6. Corrections, classées

### Bloquant

1. **`js/main.js` — `init()` : implémenter `?action=new` et `?action=resume` (D14).**
   Attendu : `?action=resume` + sauvegarde valide → l'écran de jeu directement (pas la bannière) ;
   `?action=resume` sans sauvegarde → configuration + message « aucune partie à reprendre » ;
   `?action=new` → configuration **sans** bannière de reprise (voire écran des noms). Puis
   `history.replaceState` pour retirer le paramètre. Sinon : **retirer `shortcuts` de
   `manifest-st.json`**. Preuve exigée : test qui compare l'état à celui de `./` et le voit **différent**.
2. **`tests/e2e/pwa.spec.js:149` — supprimer l'assertion trompeuse.** `status === 200` ne prouve rien
   d'un raccourci. Remplacer par l'assertion de comportement du point 1.

### Majeur

3. **`sw-st.js` — `ESSENTIAL` (l.83) : inclure `.woff2` et `.svg`**, ou (mieux) rendre l'installation
   tout-ou-rien. Aujourd'hui une installation à 52/55 est déclarée saine et dégrade en silence
   (polices de secours visibles hors ligne) — c3.
4. **`sw-st.js` — échec d'installation silencieux (c1).** Après un précache annulé, `registerServiceWorker`
   doit en informer la page (`reg.installing.statechange → 'redundant'`) et `js/ui/toast.js` afficher
   « Installation hors ligne incomplète, réessayez en ligne ». Actuellement : `caches: []`, 0 signal.
5. **`js/platform/sw-client.js:57` — `announce(null)` sur `'activated'` est faux dans le cas multi-onglets.**
   Attendu : ne lever la bannière que si l'activation vient de la migration héritée ; sinon, sur
   `controllerchange` avec `!applying`, **remplacer** le texte par « Nouvelle version active — recharger »
   et garder un bouton. Preuve : scénario b′ (`masquée: true`, SW `critic-bp`, modules anciens).
6. **`js/platform/storage.js` / `errors.js` — rendre le quota visible (7.3).** `setRaw` échoue →
   remonter un événement dédié (ou notifier les observateurs pour les contextes `storage.quota:*` /
   `storage.write:*`) → toast « Sauvegarde impossible : espace insuffisant. La partie continue en mémoire. »
   Aujourd'hui : `saved: null`, `toast: null` (scénario e).
7. **`js/platform/backup.js:60` `validateSettings` — cesser de recopier `{ ...raw }`.** Ne conserver que
   la sortie de `serializeSettings(parseSettings(raw))` (liste blanche). Preuve : `constructor.prototype`
   importé puis persisté dans `scoretrack_settings`.
8. **`sw-st.js:175,192` — remplacer `caches.match(...)` global par `(await caches.open(CACHE)).match(...)`.**
   Supprime toute possibilité de servir une entrée d'un cache étranger.
9. **`index.html` (CSP) — ajouter `base-uri 'none'; form-action 'none'`** (aucun repli depuis `default-src`).
   Et documenter que le service worker n'est couvert par **aucune** CSP sur GitHub Pages.
10. **`js/ui/game.js` (A) — `restoreGame` doit réhydrater la pile d'annulation (7.5).** Le journal est
    sur le disque (`log.entries = 3, cursor = 3`) ; le bouton Annuler ressort désactivé. **À confirmer
    après l'atterrissage de A.**
11. **`js/ui/game.js` (A) — double déclenchement souris/tactile (3.5).** Un tap = deux changements de
    score dans l'arbre de travail : 5 tests PWA en échec. **À confirmer après l'atterrissage de A.**

### Mineur

12. `scripts/build-sw.mjs` — exclure du précache `assets/icons/sprite.svg`, `assets/brand/*.svg`,
    `icons/favicon-32.png` ; envisager de repousser `icon-512`/`maskable-512` (34 Kio) hors du
    précache initial. Gain ~45 Kio et fin de la croissance automatique par parcours de répertoire.
13. `sw-st.js` — traiter `Range` (renvoyer 206 ou laisser passer au réseau). Mesuré : 200 / 48 256 octets
    pour `bytes=0-99`.
14. `sw-st.js` `OFFLINE_PAGE` — retirer `onclick=` inline et `<style>` inline, ou y ajouter une meta CSP,
    pour rester cohérent avec `index.html`.
15. `js/ui/setup.js:297` — horodatage futur : `relativeTime` borne le texte mais l'attribut
    `datetime` reste dans le futur (2031). Borner aussi.
16. `tests/e2e/pwa.spec.js` `collectErrors` — compter aussi `m.type() === 'warning'` (exigence 7.2).
17. `js/platform/haptics.js` — `floor` et `ceiling` partagent le même motif `[30,20,30]` ; les
    distinguer si la grille l'exige un jour.

## 7. Ce qui est déjà au niveau AAA (à ne pas casser)

Écriture atomique `.tmp` → bascule avec `.prev` et somme FNV-1a ; quarantaine `.corrupt` jamais
effacée en silence ; flush sur `pagehide`/`visibilitychange` prouvé à 0 ms (scénario k) ; dégradation
sans une seule exception quand `localStorage` est inaccessible (e2) ou quand `navigator.storage`
n'existe pas (j) ; migration v0 → v2 transparente sur 4 sauvegardes réelles y compris 12 joueurs et
scores à 7 chiffres (g) ; SW imperméable aux réponses opaques et aux requêtes non-GET ;
`check:sw` réellement branché en CI **et** dans la porte de déploiement.
