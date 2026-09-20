# CRITIQUE — Élément E — tour 3 (final)

Preuves : `scratchpad/critic/E3/` (`critic3.spec.js`, `critic2-*.spec.js` rejoués, copie `wt/`, `old/` = `git archive 3452b66`).
Aucun fichier du dépôt modifié par moi (mutations de vérification confinées à la copie).

## 1. Le test de non-régression de E a-t-il des dents ? (D17 — point capital)

Vérifié **par mutation, moi-même**, sur `tests/e2e/pwa.spec.js:403` :

| État du code                                                                           | Résultat                                                                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Code sain                                                                              | **passe**                                                                                         |
| **Mutant 1** — empreinte sans la logique du SW (comportement du tour 2)                | **ÉCHOUE** ligne 415 (`computeVersion(files, logicChanged)` == `computeVersion(files, swSource)`) |
| **Mutant 2** — précache direct dans `CACHE` + `caches.delete(CACHE)` en échec (tour 2) | **ÉCHOUE** ligne 442 : le cache vivant a disparu (attendu `["st-…"]`, reçu `[]`)                  |

Les deux moitiés du correctif sont donc couvertes **indépendamment** : le test ne peut pas passer avec
l'ancien comportement, ni avec l'une ou l'autre moitié restaurée. L'affirmation de E est exacte.

## 2. Mon scénario de reproduction du tour 2

`critic2-hash.spec.js`, inchangé, rejoué tel quel :

```
[hash] installation saine : {"k":["st-1c7cfafe"],"n":59}
[hash] hors ligne avant incident : application servie = true
[hash] après mise à jour du SW seule + précache en échec : {"k":["st-1c7cfafe"],"n":59,"controleur":true}
[hash] HORS LIGNE APRÈS INCIDENT : setup visible = true | corps = "SCORETRACK / COMPTEUR UNIVERSEL / PRÉRÉGLAGES…"
```

Le cache installé garde ses 59 entrées et l'utilisateur retrouve **son application**, plus la page de repli.
**Bloquant du tour 2 : levé.**

## 3. Empreinte : point fixe, circularité, sensibilité

| Propriété             | Mesure                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Idempotence           | 5 régénérations successives → `1c7cfafe` × 5 ; le texte est stable dès la première (`buildSw(src).next === src`) |
| Pas de circularité    | Trafiquer le bloc généré (`VERSION = 'zzzzzzzz'`) **ne change pas** l'empreinte (`1c7cfafe`)                     |
| Bloc réellement exclu | `swLogicSource` ne contient ni `const VERSION =`, ni entrée de précache, ni les marqueurs                        |
| Sensibilité           | Modifier la **seule** logique du SW : `1c7cfafe` → `b29fcf92`                                                    |

Le compromis est le bon : on hache la logique, pas le bloc qui contient le résultat du hachage.

## 4. Cache de travail (`st-<VERSION>-tmp`)

- **Orphelins** : 3 échecs d'installation consécutifs → `caches: []` à chaque fois, **aucun `-tmp`** ;
  réseau rétabli → réparation à **59/59** (`precache()` commence par `caches.delete(STAGING)`).
- **Bascule interrompue** : j'ai simulé un worker tué au milieu (cache définitif à 5 entrées bidon +
  `-tmp` à 20) puis relancé une installation → état final `["st-1c7cfafe"]`, **59/59**, `./index.html`
  sans résidu, et l'application fonctionne **hors ligne réel**. Un cache définitif partiel ne peut de
  toute façon jamais être activé : `install` attend `precache()`, qui ne résout qu'après la bascule.

## 5. Corrections mineures annoncées

| Annoncé                                   | Mesuré                                                                                                                                                                                                                | Verdict                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Nettoyage de tout paramètre `action`      | `?action=new`, `?action=resume`, `?action=nimportequoi`, `?ACTION=new`, `?Action=Resume`, `?action=%3Cscript%3E` → `location.search` vide ; `?action=new&garde=1` → `?garde=1` (les autres paramètres sont préservés) | **TENU**                 |
| Détection des références à chemin préfixé | `"./assets/icons/sprite.svg"` → **détecté** ; `"assets/…"` → détecté. (`"../assets/…"` non détecté, mais cette forme ne peut pas apparaître depuis des sources à la racine)                                           | **TENU**                 |
| Horodatage borné au présent               | Sauvegarde datée à +5 ans → `datetime = 2026-09-18T05:34:42Z` (≈ maintenant), texte « à l'instant »                                                                                                                   | **TENU**                 |
| Disparition de la bande de 1 px           | **NON TENU** : chevauchement toujours **0,25 px CSS**, `elementFromPoint` à 0,5 px et 1 px du bord bas renvoie encore `#update-banner`. **Mais un tap réel aux coordonnées à 1 px du bord bas compte bien** (0 → 1)   | **non tenu, sans effet** |

## 6. Scénarios adverses rejoués (non-régression)

| Scénario                                          | Résultat                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| (a) ancien `st-v1` réellement installé, même port | 2 rechargements, caches finaux `["st-1c7cfafe"]`                                                  |
| (b) deux onglets, mise à jour pendant une partie  | onglet 2 : « Nouvelle version active — rechargez » + bouton ; 0 erreur                            |
| Cache étranger piégé (`aaa-poison`)               | index.html, main.js, base.css empoisonnés **jamais servis**, navigation comprise                  |
| Requêtes `Range`                                  | 206/100 o, 206 ouverte, 206 suffixe, **416** hors bornes, 200 si en-tête malformé                 |
| Haptique                                          | `floor ≠ ceiling` ; 1 tap = 1 vibration = 1 point ; touch + click synthétique = 1 seul changement |
| 7.5 reprise                                       | 11 entrées → **11 annulations** après rechargement ; 0 avertissement, 0 erreur                    |
| Manifeste                                         | capture large réellement 1280×800                                                                 |
| `tests/e2e/pwa.spec.js`                           | **15/15**                                                                                         |

(Le cas « 3 modules dont la page a besoin » reste le seul sans toast : aucun JS ne tourne alors — hors
de portée de E, déjà acté au tour 2.)

## 7. Comparaison à l'aveugle — D7

App A = ScoreTrack (exécutée, mesurée par moi). App B = LifeLinked (décrite, jamais exécutée).
A est OUI sur les cinq critères avec preuve directe ; B est INDÉTERMINÉ sur 7.1–7.3, hors périmètre
sur 7.4, partiellement documentée sur 7.5.

**Préférence : ScoreTrack, nettement. Confiance : 4/5.**
Le dernier grief qui me retenait est tombé, et il est tombé avec un test que j'ai moi-même essayé de
faire mentir sans y parvenir. Quarantaine `.corrupt` + restauration `.prev` + somme de contrôle,
précache tout-ou-rien avec cache de travail et bascule, bannière multi-onglets, message explicite sur
le quota : je ne connais aucune référence documentée qui réunisse cela. Confiance plafonnée à 4/5 par
la limite §6.1 du protocole — la référence n'a jamais été exécutée, ses défauts restent non prouvés.

## 8. Verdict final — dimension D7 « Robustesse & hors-ligne »

| Critère                                                               | Verdict | Preuve                                                                         |
| --------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| 7.1 hors ligne complet, installation sans erreur, précache sans 404   | **OUI** | 59/59, serveur arrêté ; tout-ou-rien + auto-réparation ; aucun orphelin        |
| 7.2 0 erreur / 0 avertissement / 0 rejet non géré                     | **OUI** | 0/0 sur `critic2-75` et sur tous les scénarios adverses                        |
| 7.3 corrompue, schéma inconnu, quota → message clair                  | **OUI** | quarantaine + `.prev` ; toasts quota et stockage indisponible mesurés          |
| 7.4 mise à jour signalée, appliquée sans perte, anciens caches purgés | **OUI** | migration `st-v1` réelle ; 2 onglets ; tap au ras du bord bas à 2/4/12 joueurs |
| 7.5 reprise dont pile d'annulation ; écriture atomique                | **OUI** | 11 annulations après rechargement ; `.tmp`/`.prev`/`sum` ; fermeture à 0 ms    |
| 3.5 haptique, motifs distincts, pas de double déclenchement           | **OUI** | motifs distincts ; 1 tap = 1 vibration ; pas de doublon souris/tactile         |

### Score : **5 / 5**. **AAA : oui.**

Reste un unique résidu cosmétique, sans effet mesurable et non bloquant : la bande de 0,25 px sous la
bannière n'a pas disparu (`Math.ceil` au lieu de `Math.round` dans `reserveSpace`, `update-banner.js`),
alors que E l'annonçait corrigée — le tap à 1 px du bord bas fonctionne néanmoins.
