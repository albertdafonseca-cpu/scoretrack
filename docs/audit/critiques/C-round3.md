# CRITIQUE — Élément C — tour 3 (final)

18 septembre 2026. Aucune modification du dépôt (la copie mutante vit dans `critic/C3/mutant/`).
Preuves : `scratchpad/critic/C3/` — sondes `q1`…`q4`, `pw-run3.log`, `mutant-run.log`, captures.
Base : `C-round2.md` (4/5, trois points bloquants). Déplacement `js/ui` → `js/platform` du module de
pré-rendu non compté comme défaut, conformément à la consigne.

---

## 1. Les trois points bloquants du tour 2

### 1.1 Bannière de reprise — **CORRIGÉE À LA RACINE**

`css/setup.css:438` : plus aucun `position: fixed`. Mesuré en exécution : `getComputedStyle
(#restore-banner).position === "static"`, bannière visible, aux trois formats (`q2.log`).

Reprise **exacte** des mesures qui avaient établi le défaut :

| Format   | défil. 0 %      | 35 %      | 70 %      | 100 % |
| -------- | --------------- | --------- | --------- | ----- |
| 390×844  | **0** (était 7) | **0** (1) | **0** (3) | 0     |
| 320×568  | **0** (6)       | **0** (7) | **0** (2) | 0     |
| 768×1024 | **0** (2)       | **0** (1) | **0** (2) | 0     |

(contrôles dont le centre est intercepté par un autre élément, `document.elementFromPoint`).

WCAG 2.4.11 : tabulation complète à 320×568 avec la bannière affichée → **aucun arrêt de
tabulation intercepté ni hors écran** (était : 8 arrêts masqués à 64–100 %). La régression est
éliminée, pas contournée : la boîte est réservée dès le premier rendu par
`js/platform/prepaint.js` (`blocking="render"`, deux attributs sur `<html>`), la bannière restant
dans le flux.

### 1.2 Le test de recouvrement manquant — **AJOUTÉ, ET IL A DES DENTS**

`a11y.spec.js:252` : pour chaque cible visible, `elementFromPoint(centre)` doit appartenir à la
cible, sur **4 conditions d'affichage × 6 états × 4 positions de défilement**.

Vérification par mutation, comme demandé : copie intégrale du dépôt dans `critic/C3/mutant/`,
`position: fixed` du tour 2 rétabli dans `css/setup.css`, port 8766, suite lancée telle quelle :

```
✘  1 … ni débordement ni recouvrement — 390x844
✘  2 … ni débordement ni recouvrement — 768x1024
✘  3 … ni débordement ni recouvrement — 320x568
✘  4 … ni débordement ni recouvrement — 390x844 · texte système 200 %
4 failed
```

Le test **échoue sur les quatre conditions d'affichage**, alors que la seule différence entre les
deux arbres est la règle `position: fixed` réintroduite. Sur le dépôt réel, les 4 conditions
passent. C'est le seul contrôle de la suite dont j'ai vérifié le pouvoir de détection par mutation ;
il est réel.

### 1.3 Perte de prénoms — **CORRIGÉE**, scénario du tour 2 rejoué à l'identique

```
maxlength à 2 joueurs = 18                    (était 17)
saisie « Christophe-Alexan » (17 car.)
mémoire : {"custom":["Christophe-Alexan",""]}
rouvert à 12 joueurs → case 1 = « Christophe-Alexan »   (était « Christophe »)
avertissement : « À 12 joueurs sur cet écran, un prénom de plus de 10 caractères
                  sera abrégé sur la carte ; … »        (avertissement, non plus troncature)
lancement à 12 → mémoire : ["Christophe-Alexan", "", …] ← prénom ENTIER conservé
carte de jeu : « Christophe-Alexan »
retour à 2 joueurs → case 1 = « Christophe-Alexan »
```

`maxlength = 18` et 18 caractères effectivement retenus à **1, 2, 6 et 12 joueurs** (compteur
`18/18`). Le critère D2.3 redevient atteignable au lieu d'être rendu impossible.

## 2. Les réserves du tour 2 — toutes levées

| Réserve                               | Vérification                                                                                                                                                                                                                  | Verdict                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Débordements à 200 % de texte système | `Page.setFontSizes(32)` : accueil, noms, réglages, modale → **0 débordement** (était 2 : `#app-title` `right=488`, un `span.btn-text`), 0 cible < 44 px, aucun défilement horizontal (`q3.log`)                               | **LEVÉE**                   |
| 4ᵉ condition dans la suite            | `a11y.spec.js:28` — « 390x844 · texte système 200 % », mêmes assertions que les trois autres                                                                                                                                  | **LEVÉE**                   |
| Contraste : couleur déclarée          | `helpers.js:172` `parseColor(cs.color)` en premier plan, fond = mode de l'histogramme **avec exclusion des pixels de glyphe** (seuil 60), `color(srgb …)` correctement converti — exactement le correctif que j'avais formulé | **LEVÉE**                   |
| Nœuds écartés comptés et plafonnés    | `skipped` collecté, affiché dans le message d'échec, `expect(skipped.length).toBeLessThanOrEqual(10)`                                                                                                                         | **LEVÉE**                   |
| Seuil de mesure                       | `expect(measured).toBeGreaterThanOrEqual(300)` (j'en mesurais 308 au tour 2) ; `expect(audits).toBe(themes.length * 6)` en égalité stricte                                                                                    | **LEVÉE**                   |
| Assertion tautologique sur `tabIndex` | remplacée par un parcours réel aux flèches comptant les éléments distincts et le bouclage                                                                                                                                     | **LEVÉE**                   |
| Coût de la suite                      | **142 s** mesurés pour **18 tests** (C annonce 234 s ; était 377 s pour 17 tests). Plus de couverture, moins de temps.                                                                                                        | **LEVÉE, mieux qu'annoncé** |

Non-régressions revérifiées (`q3.log`) : 14 tabulations jusqu'au CTA ; 6/6, 12/12, 6/6 et 6/6
éléments atteints aux flèches, rôles `radiogroup`/`group` conformes ; modale `inert=true`,
`userSelect: text`, arbre d'accessibilité sans « Exporter mes données » ; Échap rend le focus ;
suppression totale en deux temps → focus sur `#app-title`, stockage vidé ; `?action=resume` ouvre
l'écran de jeu et nettoie l'URL ; **0 erreur console, 0 `pageerror`** ; suite complète : **18 passed**.

## 3. **CE QUE LA CORRECTION A CASSÉ** — nouvelle régression bloquante

`prepaint.js` réserve la boîte de la bannière sur la **simple présence de la clé** :
`if (localStorage.getItem('scoretrack_save') !== null)`. Aucune validation. Or
`setRestoreBannerVisible(false)` (`js/ui/setup.js`) **retire `data-has-save`** dès que la
sauvegarde est illisible ou que la bannière ne doit pas s'afficher : la boîte réservée
s'effondre et toute la page remonte.

Mesure `PerformanceObserver({type:'layout-shift'})`, 5 chargements par cas, CPU ×4 (`q1.log`, `q4.log`) :

| Cas                                         | CLS        | Budget D11 ≤ 0,1                   |
| ------------------------------------------- | ---------- | ---------------------------------- |
| à froid, stockage vide                      | 0,0171     | OK — **conforme à l'annonce de C** |
| sauvegarde valide, 2 joueurs                | 0,0055     | OK — **conforme à l'annonce de C** |
| sauvegarde valide, 12 joueurs (aperçu long) | 0,0055     | OK                                 |
| sauvegarde + thème ldm-day                  | 0,0070     | OK                                 |
| sauvegarde + profils + derniers noms        | 0,0055     | OK                                 |
| **sauvegarde corrompue (`'{"players":['`)** | **0,1819** | **DÉPASSE de 82 %**                |
| **`scoretrack_save = ""`**                  | **0,1819** | **DÉPASSE**                        |
| **`scoretrack_save = "null"`**              | **0,1819** | **DÉPASSE**                        |
| **sauvegarde valide + `?action=new`**       | **0,1819** | **DÉPASSE**                        |

Identique sur les 5 chargements de chaque cas ; source unique : `["setup-section","setup-section"]`.

Deux aggravations :

1. Le dernier cas est **le raccourci « Nouvelle partie » du manifeste**, que C a lui-même câblé au
   titre de D14. Un point d'entrée annoncé et documenté saute la mise en page de 0,18 à chaque usage.
2. **Aucun test ne mesure le décalage.** `grep -rn "layout-shift" tests/` ne renvoie rien ; seul
   `lighthouserc.json` porte un budget, et Lighthouse démarre sur un profil vierge : il ne verra
   jamais aucun de ces quatre cas. La métrique que C déclare corrigée n'est gardée nulle part là
   où elle casse. C'est la leçon de D11 (« un correctif ne se décide pas sans avoir mesuré la
   cause ») qui se rejoue à l'identique, un cran plus loin.

Corollaire mineur (`q4.log`) : un identifiant de thème inconnu écrit dans le stockage
(`{"theme":"evil"}`) reste posé sur `<html>` après chargement — `parseSettings` ne le normalise
pas. Aucune conséquence visuelle (repli sur `:root`), mais l'attribut est faux.
Autre réserve : `blocking="render"` sur un `<script type="module">` n'est honoré que par les
navigateurs qui l'implémentent ; ailleurs le module redevient différé, la réservation est perdue
et le décalage de 0,19 revient. Toute la correction repose sur cet attribut, testé ici sur
Chromium uniquement.
Enfin, la liste des nœuds indéterminés du test de contraste est calculée **une fois par écran**
sur le thème par défaut puis réutilisée pour les 14 thèmes : un nœud que seul un autre thème
rendrait indéterminé n'entrerait pas dans la mesure.

---

## 4. Verdict final

### D1 — Première prise en main (périmètre C)

| #                                                                                 | Verdict              | Preuve                                          |
| --------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------- |
| 1.1 ≤ 2 taps                                                                      | **OUI**              | 2 taps, `#sc-0 = 1`                             |
| 1.2 < 1 500 ms CPU ×4                                                             | **OUI**              | 605–941 ms (tour 2), architecture inchangée     |
| 1.3 CTA actif par défaut                                                          | **OUI**              | `#go-btn` actif, résumé prérempli               |
| 1.4 affordance +/−                                                                | **HORS PÉRIMÈTRE C** | écran de jeu (A)                                |
| 1.5 reprise 1 tap + aperçu                                                        | **OUI**              | aperçu daté, **plus aucune obstruction** (§1.1) |
| → **4/4 dans le périmètre.** Réserve : `?action=new` coûte 0,18 de décalage (§3). |

### D6 — Accessibilité (périmètre C)

| #                                                 | Verdict | Preuve                                                                                             |
| ------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| 6.1 contraste 14 thèmes                           | **OUI** | 84 audits axe → 0 ; 308 nœuds mesurés indépendamment → 0 échec (tour 2), méthode désormais alignée |
| 6.2 cibles ≥ 44 px                                | **OUI** | 4 conditions × 6 états → 0, y compris à 200 % de texte système                                     |
| 6.3 clavier, focus visible, piège                 | **OUI** | 38 contrôles atteignables ; **0 arrêt masqué** (était 8) ; modale inerte ; Échap rend le focus     |
| 6.4 sémantique, 0 violation                       | **OUI** | 0 violation toutes gravités + bonnes pratiques                                                     |
| 6.5 signes non chromatiques                       | **OUI** | numéro de pastille en `--text`, ⚠ + texte, coche + anneau                                          |
| → **5/5.** D6 est atteint dans le périmètre de C. |

### Décisions du brief

D10 **OUI** · D14 **OUI** · D16 **OUI** · D17 **OUI** · D19 **OUI** (clause de vérification
désormais satisfaite) · **D11 : NON** — budget dépassé sur quatre déclencheurs (§3).

### Note globale : **4,5 / 5** — **AAA : NON**

Les trois points bloquants du tour 2 sont réglés à la racine et non contournés, les six réserves
sont levées, et le test de recouvrement a démontré son pouvoir de détection par mutation. Une
seule chose l'empêche : la correction du décalage a introduit un dépassement du budget D11 sur
quatre chemins, dont un raccourci annoncé du manifeste, et rien ne le garde.

### Ce qui manque

1. **`js/platform/prepaint.js`** — ne réserver la boîte que si la sauvegarde est plausible
   (chaîne non vide commençant par `{` et analysable), et traiter le cas `?action=new` avant le
   premier rendu (lire `location.search` dans le pré-rendu, qui le fait déjà pour le thème).
   Alternative plus sûre : ne jamais effondrer la boîte réservée — masquer par
   `visibility: hidden` en conservant la hauteur jusqu'au premier geste de l'utilisateur.
   Attendu : CLS ≤ 0,1 sur les quatre cas du tableau §3.
2. **`tests/e2e/`** — un test de décalage cumulé (`PerformanceObserver({type:'layout-shift'})`,
   CPU ×4) sur au moins : à froid, sauvegarde valide, sauvegarde corrompue, `scoretrack_save=""`,
   `?action=new`. Sans lui, le point 1 régressera sans bruit.
3. Mineur — normaliser un identifiant de thème inconnu au chargement (`parseSettings`).
4. Mineur — replier proprement si `blocking="render"` n'est pas honoré, ou documenter la
   dépendance ; recalculer la liste des nœuds indéterminés par thème.

---

## 5. Comparaison à l'aveugle — application finale

Limites du protocole reproduites : ScoreTrack est mesuré en exécution réelle, les références sont
décrites depuis des sources publiques **sans exécution** ; un critère non prouvé côté référence
reste INDÉTERMINÉ et n'est jamais converti en « NON » au bénéfice de ScoreTrack.

**D1 — A = ScoreTrack, B = Carbon.** Au tour 2 j'étais indécis, l'obstruction de la bannière
m'interdisant de trancher. Elle a disparu, mesures à l'appui. A offre désormais : 2 taps,
premier score modifiable en moins d'une seconde sous CPU ×4, CTA prérempli, reprise en un tap
avec aperçu daté, raccourcis système fonctionnels, décalage de 0,0055 avec une partie en cours.
B ouvre directement sur la table — avantage réel — mais rien de public n'atteste d'un aperçu de
reprise, et ses critiques mentionnent plantages et taps manqués. Contre A : l'écran de
configuration reste un préalable, et `?action=new` saute de 0,18. → **Préférence : ScoreTrack.
Confiance 3/5.**

**D6 — A = ScoreTrack, B = Mutility.** Au tour 2 je préférais déjà A malgré un échec AA prouvé ;
cet échec est maintenant mesuré comme corrigé. A apporte 84 audits axe sans filtre de gravité sur
14 thèmes × 6 états, 308 mesures de contraste recoupées par deux méthodes indépendantes, 38
contrôles atteignables au clavier avec des groupes radio conformes au motif APG, un dialogue
réellement inerte, des cibles ≥ 44 px tenues jusqu'à 200 % de texte système, une échelle
typographique relative, et un contrôle de recouvrement dont le pouvoir de détection est démontré
par mutation. B ne documente que « formes ou texte en plus de la couleur » et un mouvement
réduit, sans une seule mesure : **4 critères sur 5 restent INDÉTERMINÉS** de son côté.
→ **Préférence : ScoreTrack, nettement. Confiance 3/5** — plafonnée par l'asymétrie de preuve du
protocole, pas par le résultat. Un test utilisateur réel sur table, ou une exécution côte à côte
sur téléphone, primerait sur ce verdict (§6.6 du protocole).
