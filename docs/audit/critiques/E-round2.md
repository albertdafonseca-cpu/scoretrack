# CRITIQUE — Élément E — tour 2 (état committé f663e2c « Écran de jeu de niveau AAA… »)

Aucun fichier du dépôt modifié. Preuves : `scratchpad/critic/E2/` — specs `critic2-*.spec.js`, serveur jetable
`critic-server.js`, copies `wt2/` (= `git archive HEAD`) et `old/` (= `git archive 3452b66`), journaux
`pwa-r2.log`, `pwa-frozen.log`, `adverse-r2.log`, `check-r2.log`, captures `E2/shots/banniere-{2,4,12}j.png`.
Méthode : je ne me fie à aucun test de E ; je rejoue tout moi-même, aux coordonnées et sur les pixels rendus (D16).

## 0. État général

| Contrôle                                | Résultat                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` sur le dépôt committé   | 303 tests unitaires OK ; **59/60 e2e**. L'unique échec est `motion.spec.js:219` (**fichier de A**), qui **repasse au vert isolé** → instabilité de mesure de fps sous charge, hors périmètre E |
| `tests/e2e/pwa.spec.js`                 | **14/14**                                                                                                                                                                                      |
| `npm run check:sw`                      | vert (version `ffc4ea52`, 57 fichiers)                                                                                                                                                         |
| Assertions désactivées par défaut (D17) | **aucune** : pas de `test.skip`, pas de `fixme`, aucune assertion conditionnée à une variable d'environnement (seul `PWA_SHOTS_DIR` sert de dossier de sortie)                                 |

## 1. Vérification une par une des corrections annoncées

| Annoncé                                                               | Vérifié par moi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Verdict                 |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Raccourcis `?action=new` / `?action=resume` câblés, paramètre retiré  | `?action=resume` + sauvegarde → **écran de jeu ouvert**, `location.search === ''`, un rechargement ne rejoue pas ; `?action=new` → accueil **sans** bannière, **sauvegarde intacte (score 42 conservé)**, redevient proposable au rechargement ; `?action=resume` sans sauvegarde → « Aucune partie à reprendre. » ; **sauvegarde corrompue + resume** → même message, pas d'écran de jeu vide ; `?action=nimportequoi`, `?action=%3Cscript%3E`, `?action=new&action=resume`, `?ACTION=new` → aucun plantage, aucune erreur | **TENU (D14)**          |
| Assertion creuse remplacée                                            | `pwa.spec.js:182` compare désormais à une ouverture normale de référence et assère `#game-screen` visible, `location.search`, la survie de la sauvegarde et le toast. Ce n'est plus un `status === 200`                                                                                                                                                                                                                                                                                                                     | **TENU**                |
| Précache tout-ou-rien + auto-réparation                               | 1 police bloquée → `caches: []` (**aucun cache partiel**), puis rechargement réseau rétabli → **58/58**. Idem avec 3 actifs non bloquants. `ESSENTIAL` a disparu : plus de « 52/55 déclaré sain »                                                                                                                                                                                                                                                                                                                           | **TENU**                |
| Échec d'installation signalé                                          | Toast mesuré : « Installation hors ligne incomplète : reconnectez-vous puis rouvrez l'application. » Double canal (`redundant` côté client + `INSTALL_FAILED` posté par le SW)                                                                                                                                                                                                                                                                                                                                              | **TENU**                |
| Bannière multi-onglets qui change d'état                              | Onglet 2, après application dans l'onglet 1 : **« Nouvelle version active — rechargez »** avec boutons « Plus tard » / « Recharger », et non plus masquée. Idem après migration `st-v1`                                                                                                                                                                                                                                                                                                                                     | **TENU**                |
| Alerte quand le stockage refuse d'écrire                              | `setItem` qui lève sur `scoretrack_save` → « Sauvegarde impossible : espace insuffisant. La partie continue en mémoire. » ; `localStorage` inaccessible → « Sauvegarde indisponible sur cet appareil. » ; 0 `pageerror`, partie jouable                                                                                                                                                                                                                                                                                     | **TENU**                |
| Import à liste blanche stricte                                        | 6 vecteurs rejoués (`__proto__` littéral et brut, `constructor.prototype`, clés inconnues, `profiles.__proto__`, `save.__proto__`) : `Object.prototype` intact **et** réglages persistés réduits à `{v,theme,defPlayers,defStart,defMax,defNeg}` — **plus aucune clé étrangère**. 20 Mo refusés                                                                                                                                                                                                                             | **TENU**                |
| Recherche restreinte au cache courant                                 | Cache piège `aaa-poison` (trie avant `st-…`) contenant un `index.html`, un `main.js` et un `base.css` empoisonnés : **aucun n'est servi**, navigation comprise                                                                                                                                                                                                                                                                                                                                                              | **TENU**                |
| Page hors ligne sans code en ligne                                    | Plus de `onclick`, plus de `<script>` ; CSP propre `default-src 'none'` ; « Réessayer » = `<a href="./">`                                                                                                                                                                                                                                                                                                                                                                                                                   | **TENU**                |
| Requêtes partielles                                                   | `bytes=0-99` → **206**, 100 o, `Content-Range: bytes 0-99/48256` ; `bytes=100-` → 206, 48 156 o ; `bytes=-50` → 206, 50 o ; hors bornes → **416** avec `bytes */48256` ; `bytes=abc` → 200 complet (comportement légal)                                                                                                                                                                                                                                                                                                     | **TENU**                |
| Bannière qui ne recouvre plus la zone de jeu ni n'intercepte les taps | Mesuré à **2, 4 et 12 joueurs** : réserve `--sys-banner-h = 108px`, classe `sys-banner-open` posée, chevauchement **0,25 px CSS** (0,75 px appareil à DPR 3). **Tap réel aux coordonnées, à 3 px du bord bas de la carte la plus basse : le score change** (0→1) dans les trois cas. Après « Plus tard » la place est rendue **exactement** (bas de carte 596,0 px = valeur d'avant bannière), réserve à `0px`. Toast : `pointer-events: none` vérifié                                                                      | **TENU** (réserve : §3) |
| Motifs haptiques distincts aux deux butées                            | `floor = [30,20,30]` ≠ `ceiling = [20,30,20,30,20]`, mesurés à l'exécution                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **TENU**                |
| Capture large au manifeste                                            | `assets/screenshots/game-1280x800.png` servie en 200, **PNG réellement 1280×800** (en-tête IHDR lu) ; les deux captures étroites sont bien 390×844                                                                                                                                                                                                                                                                                                                                                                          | **TENU**                |

## 2. Scénarios adverses du tour 1, rejoués en entier sur l'état committé

| #      | Résultat mesuré                                                                                                                                                                                                                                                               | Écart vs tour 1         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| a      | Ancien `st-v1` réellement installé (serveur `git archive 3452b66`, même port) → **2 rechargements**, sans intervention ; caches finaux **`["st-ffc4ea52"]`** (`st-v1` et `st-fonts-v1` purgés)                                                                                | inchangé, conforme à D3 |
| b      | Deux onglets, mise à jour pendant une partie : onglet 1 applique, partie intacte ; **onglet 2 averti** (« … rechargez ») ; 0 erreur                                                                                                                                           | **corrigé**             |
| c      | 1 police manquante et 3 actifs non bloquants → aucun cache partiel + toast + auto-réparation 58/58. Cas « 3 modules dont la page a besoin » : aucun toast, mais **aucun JS ne tourne** (graphe de modules cassé) — hors de portée de E, ce n'est pas un défaut de signalement | **corrigé**             |
| d      | Stockage saturé (79 blocs de 64 Kio) + 50 taps : score 51 affiché **et** 51 sauvegardé, aucune perte, aucun `pageerror`. Pas de toast car aucune écriture n'échoue (réécrire une clé de taille égale ne consomme pas de quota) — l'alerte est prouvée en (e)                  | conforme                |
| e / e2 | Écriture refusée → toast « espace insuffisant » ; `localStorage` inaccessible → toast « indisponible », app jouable en mémoire, 0 erreur                                                                                                                                      | **corrigé**             |
| f      | Horodatage à +5 ans → « Sauvegardée à l'instant », pas de plantage ; **l'attribut `datetime` reste `2031-…`**                                                                                                                                                                 | mineur non corrigé      |
| g      | 4 sauvegardes v0 réelles : reprises transparentes, 0 erreur, 12 joueurs, −1 234 567 et 9 999 999 formatés, `Bob <b>&'"` rendu en texte                                                                                                                                        | inchangé, excellent     |
| h      | Voir §1 (raccourcis) ; valeur inconnue → le paramètre **reste dans l'URL** (`cleanUrl()` n'est appelé que pour une action valide)                                                                                                                                             | mineur nouveau          |
| i      | 20 Mo refusés ; 6 vecteurs de pollution neutralisés ; aucune clé étrangère persistée                                                                                                                                                                                          | **corrigé**             |
| j      | `navigator.storage` absent : 0 erreur, sauvegarde OK, diagnostic « inconnu »                                                                                                                                                                                                  | inchangé                |
| k      | Onglet fermé 0 / 10 / 60 ms après un tap → sauvegarde présente dans les 3 cas                                                                                                                                                                                                 | inchangé                |
| l      | CSP désormais `default-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; … worker-src 'self'` ; script en ligne **réellement bloqué** ; `frame-ancestors` absent (impossible en `<meta>`, nécessite un en-tête HTTP : limite de GitHub Pages, à documenter) | **corrigé**             |

**7.5 (mon bloquant du tour 1)** : 10 taps espacés + rotation → journal de **11 entrées** persisté → rechargement → reprise → **11 annulations effectives**, retour à 20/20/20/20, `undo` actif, **0 avertissement et 0 erreur console**. Corrigé.
**3.5** : tap réel aux coordonnées → **exactement une vibration `[10]` et un seul point** ; `touchstart`+`touchend` puis `click` synthétique → **un seul changement de score, aucune vibration supplémentaire**. Corrigé.

## 3. Ce que j'ai trouvé de neuf

### BLOQUANT — une mise à jour du SW seule, dont le précache échoue, détruit le cache hors-ligne installé

`scripts/build-sw.mjs` calcule `VERSION` sur `ROOT_FILES = [index.html, manifest-st.json]` + `DIRS` :
**`sw-st.js` est exclu de son propre hachage** (vérifié : `collectFiles()` → 57 fichiers, `sw-st.js` absent).
Une correction portant uniquement sur la logique du SW laisse donc `VERSION` inchangée — et
**`npm run check:sw` renvoie 0**, donc la CI et la porte de déploiement laissent passer (vérifié).
Le nouveau SW s'installe alors dans **le cache déjà servi par le SW actif** ; si son précache échoue,
le `await caches.delete(CACHE)` ajouté ce tour-ci efface ce cache vivant.

Reproduction (`critic2-hash.spec.js`) :

```
[hash] installation saine : {"k":["st-ffc4ea52"],"n":58}
[hash] hors ligne avant incident : application servie = true
[hash] après mise à jour du SW seule + précache en échec : {"k":[],"n":0,"controleur":true}
[hash] HORS LIGNE APRÈS INCIDENT : setup visible = false | corps = "ScoreTrack est hors ligne…"
```

Un utilisateur qui avait l'application hors ligne se retrouve devant la page de repli après un simple
déploiement de maintenance accompagné d'une requête réseau qui échoue. C'est précisément le sinistre
que le « tout-ou-rien » voulait empêcher.

**Correctif (2 endroits, quelques lignes) :**

1. `scripts/build-sw.mjs` — ajouter `'sw-st.js'` aux entrées hachées (en excluant le bloc `PRECACHE`
   généré du calcul pour éviter le point fixe), afin que toute modification du SW change `VERSION`.
2. `sw-st.js` — `precache()` : ne jamais supprimer un cache qui peut être le cache actif. Soit précacher
   dans un nom temporaire (`st-<VERSION>-tmp`) renommé à la réussite, soit garder
   `if (!self.registration.active) await caches.delete(CACHE);`.
   Test de non-régression attendu : celui de `critic2-hash.spec.js`.

### Mineurs

3. `js/platform/shortcuts.js` — `cleanUrl()` n'est appelé que pour une action reconnue : `?action=xxx`
   et `?ACTION=new` restent dans l'URL. Nettoyer dès que le paramètre `action` est présent.
4. `scripts/build-sw.mjs` — `assertUnreferenced` détecte `"assets/icons/sprite.svg"` mais **pas**
   `"./assets/icons/sprite.svg"` (vérifié). Ajouter les préfixes `"./`, `'./`, `url(./`.
5. `js/ui/setup.js` — horodatage futur : le texte est borné, l'attribut `datetime` reste dans le futur.
6. Bannière : bande de **1 px CSS** au ras du bord bas de la carte la plus basse appartenant à la
   bannière (`elementFromPoint` à 1 px → `#update-banner`, à 2 px → `.tap-half.plus`). Arrondi de
   `Math.round(offsetHeight + gap)` ; inatteignable au doigt, mais un `Math.ceil` le supprimerait.
7. `frame-ancestors` absent de la CSP (impossible en `<meta>`) et SW non couvert par une CSP sur
   GitHub Pages : à écrire dans `docs/SECURITE.md` plutôt qu'à laisser croire l'inverse (D15).

## 4. Comparaison à l'aveugle — D7 (BLIND-PROTOCOL)

App A = ScoreTrack (exécutée et mesurée par moi). App B = LifeLinked (**décrite, jamais exécutée** —
limite §6.1 : aucun INDÉTERMINÉ de B n'est converti en NON).

| Critère                             | A                                              | B                                                           |
| ----------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| 7.1 hors-ligne complet              | OUI (58/58, serveur coupé, partie complète)    | INDÉTERMINÉ (natif ; dépendance réseau Scryfall documentée) |
| 7.2 0 erreur / 0 avertissement      | OUI (0/0 sur tous mes parcours)                | INDÉTERMINÉ (« crash protection » suppose des plantages)    |
| 7.3 corrompu / quota / indisponible | OUI (quarantaine + `.prev` + messages mesurés) | INDÉTERMINÉ (rien de documenté)                             |
| 7.4 mise à jour signalée            | OUI (bannière, 2 onglets, purge `st-v1`)       | hors périmètre (mise à jour par magasin)                    |
| 7.5 reprise dont pile d'annulation  | OUI (11 annulations après rechargement)        | partiel documenté (état, pas l'annulation)                  |

**Préférence : A (ScoreTrack), sans hésitation. Confiance : 4/5.**
Au premier tour j'étais « indécis » : A perdait sa pile d'annulation et restait muet sur le quota.
Ces deux reproches sont tombés, mesures à l'appui. Sur la reprise d'une sauvegarde corrompue
(quarantaine `.corrupt` jamais effacée, restauration de `.prev`, somme de contrôle FNV-1a, écriture
`.tmp` → bascule) et sur la mise à jour multi-onglets, je ne connais aucune référence documentée qui
fasse l'équivalent. Confiance à 4 et non 5 : B n'a jamais été exécutée (ses défauts restent non prouvés),
et j'ai reproduit chez A une régression d'exploitation (§3).

## 5. Verdict

| Critère                                                                   | Verdict | Preuve                                                                                         |
| ------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| **7.1** hors ligne complet, installation sans erreur, précache sans 404   | **OUI** | `pwa-frozen.log` test 1 (58/58, serveur arrêté) ; `critic2-c` (tout-ou-rien + auto-réparation) |
| **7.2** 0 erreur / 0 avertissement / 0 rejet non géré                     | **OUI** | `critic2-75` : 0/0 ; 0 `pageerror` sur les 16 scénarios adverses ; 303 unitaires               |
| **7.3** corrompue, schéma inconnu, **quota** → message clair              | **OUI** | `pwa.spec:446` ; `critic2-dl` (e) et (e2) : toasts mesurés                                     |
| **7.4** mise à jour signalée, appliquée sans perte, anciens caches purgés | **OUI** | `critic2-a` (a) et (b) ; `critic2-banner` : tap réel au ras du bord bas à 2/4/12 joueurs       |
| **7.5** reprise dont pile d'annulation ; écriture atomique                | **OUI** | `critic2-75` : 11 entrées → 11 annulations ; `.tmp`/`.prev`/`sum`, fermeture à 0 ms            |
| **3.5** haptique, motifs distincts, pas de double déclenchement           | **OUI** | `critic2-sw` : `floor ≠ ceiling` ; 1 tap = 1 vibration = 1 point ; touch + click = 1 seul      |

### Score D7 : **5 / 5**. **AAA : non** — pour un seul point.

Il manque exactement une chose, et elle est reproductible :

1. **(bloquant)** `scripts/build-sw.mjs` + `sw-st.js` — inclure `sw-st.js` dans le hachage de `VERSION`
   **et** empêcher `precache()` de supprimer un cache susceptible d'être le cache actif. Sans cela, une
   mise à jour du SW seule dont le précache échoue détruit le hors-ligne d'une installation existante
   (`critic2-hash.spec.js`, sortie ci-dessus). Tout le reste de la grille est tenu, preuves à l'appui.

Les points 3 à 7 du §3 sont des mineurs qui ne bloquent pas l'obtention du AAA.
