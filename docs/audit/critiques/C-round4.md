# CRITIQUE — Élément C — tour 4 (final)

18 septembre 2026. Dépôt non modifié (les deux mutants vivent dans `critic/C4/muet/` et
`critic/C4/regress/`). Preuves : `scratchpad/critic/C4/` — sondes `r1`…`r6`, `pw-run4.log`,
`muet.log`, `regress.log`, captures. Base : `C-round3.md` (4,5/5, un bloquant D11).

---

## 1. La régression du pré-rendu — **CORRIGÉE, sur les deux fronts**

`js/platform/prepaint.js` valide désormais au lieu de se fier à la présence de la clé :
`hasResumableSave()` exige une chaîne non vide commençant par `{`, analysable, avec
`players` tableau non vide ; `wantsNewGame()` lit `?action=new` avant le premier rendu.
`js/ui/setup.js:releaseReservedBox()` n'effondre la boîte qu'après un geste réel
(`navigator.userActivation.hasBeenActive`), et `css/setup.css:460` conserve la hauteur par
`visibility: hidden` au lieu de `display: none`. Le décalage, s'il survient, est alors consécutif
à un geste et exclu de la mesure — c'est correct, pas un contournement.

### Mesure indépendante (PerformanceObserver, 5 chargements par cas, CPU ×4, `r1.log`)

**Les sept chemins annoncés par C — tous conformes, chiffres exacts :**

| Chemin                            | tour 3 | tour 4     | Annonce de C      |
| --------------------------------- | ------ | ---------- | ----------------- |
| à froid, stockage vide            | 0,0171 | **0,0171** | inchangé ✔        |
| sauvegarde valide (2 joueurs)     | 0,0055 | **0,0055** | inchangé ✔        |
| sauvegarde valide (12 joueurs)    | 0,0055 | **0,0055** | — ✔               |
| sauvegarde corrompue              | 0,1819 | **0,0171** | 0,1819 → 0,0171 ✔ |
| clé vide `""`                     | 0,1819 | **0,0171** | ✔                 |
| clé « null »                      | 0,1819 | **0,0171** | ✔                 |
| sauvegarde valide + `?action=new` | 0,1819 | **0,0171** | ✔                 |

**Neuf chemins que C ne teste pas — tous conformes également :**
`?action=resume` avec sauvegarde **0,0000** · `?action=resume` sans sauvegarde 0,0171 ·
`players: []` 0,0171 · `players` non tableau 0,0171 · objet sans `players` 0,0171 ·
`"[]"` 0,0171 · accepté par prepaint mais rejeté par `parseGame` 0,0055 · thème ldm-day 0,0070 ·
thème inconnu 0,0171. **Aucun des seize chemins ne dépasse 0,0171**, soit six fois sous le budget D11.

## 2. Le test de décalage — **AJOUTÉ, ET IL A DES DENTS** (double mutation)

`tests/e2e/setup.spec.js:350` + `helpers.js:measureLayoutShift` (CPU bridé, service worker
désenregistré, observateur idempotent). Le défaut de double comptage est reconnu et neutralisé :
`if (window.__clsObserver) return;` — `addInitScript` s'accumulant sur une même page, deux
observateurs comptaient chaque décalage deux fois.

Vérification par mutation, sur deux copies intégrales du dépôt :

| Mutation                                                                                              | Résultat                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Instrumentation muette** (`if (false && !e.hadRecentInput)`)                                        | **1 failed** — `expect(measured.some(([, cls]) => cls > 0)).toBe(true)` reçoit `false`. Le garde anti-mutisme fonctionne.                                                                                                                                       |
| **Régression du tour 3 rétablie** (réservation sur simple présence de la clé + effondrement immédiat) | **1 failed** — journal du test : `[["à froid",0.0171],["sauvegarde valide",0.0055],…,["sauvegarde corrompue",0.1819],["clé vide",0.1819],["clé « null »",0.1819],["…?action=new",0.1819]]`. Le test **reproduit mes quatre valeurs du tour 3 au chiffre près**. |

C'est le deuxième contrôle de la suite dont je vérifie le pouvoir de détection par mutation, après
celui du recouvrement au tour 3. Les deux tiennent.

## 3. Les quatre points restants — tous vérifiés

| Point                                       | Vérification indépendante                                                                                                                                                                                                                                                                                                        | Verdict  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Thème inconnu normalisé                     | `{"theme":"evil"}` → `data-theme=""`, carte `cyber` en `aria-checked="true"` ; `settings.js:22` `THEMES.some(...) ? id : DEFAULT_THEME` ; test dédié `setup.spec.js:393`                                                                                                                                                         | **TENU** |
| Liste des indéterminés recalculée par thème | `a11y.spec.js` : la boucle `for (const theme of themes)` englobe désormais `undecidedContrastNodes(page, sel)`                                                                                                                                                                                                                   | **TENU** |
| Garde-fou de taille retiré                  | `--fs-min: max(var(--fs-1,12px),12px)` supprimé de `css/base.css` (redondant : `--fs-1` vaut déjà `max(0.75rem,12px)`) ; `.splash-sub` bascule sur `--fs-1`. **Mon audit : 0 texte < 12 px** sur 4 conditions × 6 états                                                                                                          | **TENU** |
| Coche des cartes de thème (défaut de B)     | `.theme-check` utilise `var(--theme-a)` — l'accent **de la carte**, posé en propriété personnalisée — et non l'accent du thème actif. **Ma mesure indépendante sur les 14 thèmes : minimum 4,58 (dark), 0 échec** — identique au chiffre annoncé. Test dédié `a11y.spec.js:209`, qui compte un nœud non mesurable comme un échec | **TENU** |

Détail des 14 coches mesurées (`r2.log`) : cyber 15,32 · dark **4,58** · neon-pink 5,98 ·
arcade 14,78 · nature 8,86 · sunset 6,66 · ocean 6,51 · gold 10,43 · sobre 13,89 · mono 20,03 ·
light 5,76 · mono-light 21,00 · ldm 8,92 · ldm-day 5,92.

## 4. Le garde-fou du rendu bloquant — **correct**

```js
const BEFORE_FIRST_PAINT =
  typeof performance.getEntriesByType === 'function'
    ? performance.getEntriesByType('paint').length === 0
    : document.readyState === 'loading';
```

La détection par `readyState` était effectivement fausse : un module s'exécute quand `readyState`
vaut déjà `interactive`, même en rendu bloqué — le garde-fou n'aurait jamais rien réservé. La
détection par entrée `paint` est directe et juste. Là où `blocking="render"` n'est pas honoré,
rien n'est réservé : la bannière apparaît simplement après coup, sans décalage imputé (le module
s'exécute alors après le premier rendu et la condition est fausse). Repli sain, dépendance
documentée dans l'en-tête du module.

## 5. Ce que les corrections ont cassé

### 5.1 Inversion de hiérarchie à 200 % de texte système — **majeur**

Séquelle du correctif du tour 3 (`font-size: min(var(--fs-7), 9vw)` sur `.logo-name`,
`min(var(--fs-5), 7vw)` sur les titres de page). Facteur d'agrandissement réel mesuré
(`Page.setFontSizes` 16 → 32 px, `r3.log`) :

| Élément                                        | 100 %    | 200 %    | facteur   |
| ---------------------------------------------- | -------- | -------- | --------- |
| `#app-title` (mot-symbole)                     | 32 px    | 35,1 px  | **×1,10** |
| `#names-title`, `#settings-title` (H1 de page) | 22 px    | 27,3 px  | **×1,24** |
| sous-titres, libellés, résumé, CTA, boutons    | 12–15 px | 24–30 px | ×2,00     |

Conséquence mesurée : à 200 %, **le H1 « Joueurs » (27,3 px) devient plus petit que le libellé du
CTA et que le texte de résumé (30 px)** ; idem pour « Réglages ». La hiérarchie s'inverse.

La clause de vérification de D19 reste satisfaite (0 débordement, 0 cible < 44 px, rien de tronqué,
aucun défilement horizontal — revérifié §6) et il n'y a pas de perte de contenu au sens de WCAG
1.4.4. Mais l'intention de D19 — le texte suit la taille système — est défaite pour trois titres.
Correctif : borner par le bas plutôt que par le haut, par exemple
`font-size: max(min(var(--fs-5), 7vw), var(--fs-4))`, afin qu'un titre ne descende jamais sous
l'échelle du corps de texte. Aucun test ne regarde l'ordre relatif des tailles : la condition
« 200 % » ne contrôle que débordement, cibles et plancher.

### 5.2 Boîte fantôme — **mineur**

`hasResumableSave()` est volontairement plus permissif que `parseGame`. Avec
`{"players":[{"zz":1}],"v":99}` : prepaint réserve, `parseGame` rejette, et faute de geste
utilisateur la boîte n'est pas libérée. Résultat (`r4.log`) : `display: flex`,
`visibility: hidden`, **160 px de vide permanent** en haut de l'accueil — « Préréglages » passe de
y ≈ 202 à **y = 362**. Hors de l'arbre d'accessibilité, aucune erreur console, décalage conforme
(0,0055) : c'est le prix assumé du choix « ne jamais effondrer », mais un trou visible reste un
défaut. Correctif : aligner `hasResumableSave()` sur les préconditions réelles de `parseGame`, ou
libérer la boîte par une transition de hauteur (animation exclue du calcul de décalage).

### 5.3 Cosmétique

Le titre du test dit « six chemins d'entrée » pour sept cas (`setup.spec.js:350`).

### 5.4 Contrôlé, rien de cassé

Reprise d'une sauvegarde dégradée `{"players":[1,2,3]}` : aperçu « Joueur 1 0 · Joueur 2 0 ·
Joueur 3 0 », « Reprendre » ouvre une partie à 3 cartes, **0 erreur** — dégradation gracieuse.

## 6. Non-régressions revérifiées (4 conditions × 6 états, `r6.log`)

390×844, 768×1024, 320×568 et 390×844 à 200 % de texte système :
**0 texte < 12 px · 0 débordement · 0 recouvrement réel · 0 violation axe**
(tags wcag2a+2aa+21a+21aa+best-practice, sans filtre de gravité, `meta-viewport` écarté au titre
de D12). Mes premiers relevés annonçaient 32 à 158 recouvrements : c'étaient **trois défauts de ma
propre sonde** — splash non attendu, centre du rectangle écrêté au bord de l'écran, et
interception par un ancêtre comptée comme obstruction. L'aide de C (`obstructedTargets`) traite
correctement les trois cas (`hit.contains(n)`, pas d'écrêtage, hors écran ignoré).

Suite complète : **21 tests, 181 s, tous verts** (`pw-run4.log`).

---

## 7. Verdict final

### D1 — Première prise en main (périmètre C)

| #                            | Verdict              | Preuve                                                     |
| ---------------------------- | -------------------- | ---------------------------------------------------------- |
| 1.1 ≤ 2 taps                 | **OUI**              | test vert, 2 taps mesurés                                  |
| 1.2 < 1 500 ms CPU ×4        | **OUI**              | 605–941 ms (tour 3), architecture inchangée                |
| 1.3 CTA actif par défaut     | **OUI**              | `#go-btn` actif, résumé prérempli                          |
| 1.4 affordance +/−           | **HORS PÉRIMÈTRE C** | écran de jeu (A)                                           |
| 1.5 reprise 1 tap + aperçu   | **OUI**              | aperçu daté, aucune obstruction, `?action=resume` à 0,0000 |
| → **4/4 dans le périmètre.** |

### D6 — Accessibilité (périmètre C)

| #                                 | Verdict | Preuve                                                            |
| --------------------------------- | ------- | ----------------------------------------------------------------- |
| 6.1 contraste 14 thèmes           | **OUI** | 0 violation axe ; coche des thèmes mesurée à 4,58 minimum par moi |
| 6.2 cibles ≥ 44 px                | **OUI** | 4 conditions × 6 états → 0                                        |
| 6.3 clavier, focus visible, piège | **OUI** | 0 recouvrement, 0 focus masqué, modale inerte                     |
| 6.4 sémantique, 0 violation       | **OUI** | toutes gravités + bonnes pratiques                                |
| 6.5 signes non chromatiques       | **OUI** | pastille en `--text`, ⚠ + texte, coche + anneau                   |
| → **5/5.**                        |

### Décisions d'arbitrage

D10 **OUI** · **D11 OUI** (16 chemins ≤ 0,0171, gardé par un test à dents prouvées) · D14 **OUI** ·
D16 **OUI** · D17 **OUI** · D19 **OUI** sur sa clause de vérification (réserve §5.1 sur son intention).

### Note : **5 / 5** — **AAA : OUI**

Le seul point bloquant du tour 3 est corrigé à la racine, vérifié sur seize chemins au lieu des
sept annoncés, et désormais gardé par un test dont j'ai prouvé les dents par deux mutations
indépendantes. Les quatre points restants sont tenus, chiffres vérifiés à la décimale près, y
compris le 4,58 de la coche des cartes de thème. Tous les critères de la grille dans le périmètre
de C sont atteints avec preuve, toutes les décisions d'arbitrage tiennent, et je préfère
ScoreTrack à la référence sur les deux dimensions (§8) : c'est la définition de AAA donnée au §5
du brief.

AAA ne veut pas dire sans défaut. Deux points subsistent, aucun bloquant :

1. **Majeur** — inversion de hiérarchie à 200 % de texte système (§5.1) : borner les titres par le
   bas (`max(min(var(--fs-5), 7vw), var(--fs-4))`) et ajouter à la condition « 200 % » une
   assertion d'ordre relatif (titre de page ≥ libellé de CTA).
2. **Mineur** — boîte fantôme de 160 px (§5.2) : aligner `hasResumableSave()` sur les
   préconditions de `parseGame`.
3. Cosmétique — « six chemins » pour sept cas dans le titre du test.

---

## 8. Comparaison à l'aveugle — application finale

Limites du protocole reproduites : ScoreTrack est mesuré en exécution réelle, les références sont
décrites depuis des sources publiques **sans exécution** ; un critère non prouvé côté référence
reste INDÉTERMINÉ et n'est jamais converti en « NON » au bénéfice de ScoreTrack.

**D1 — A = ScoreTrack, B = Carbon. Préférence : ScoreTrack. Confiance 3/5.**
A : 2 taps mesurés, premier score modifiable en moins d'une seconde sous CPU ×4, CTA prérempli,
reprise en un tap avec aperçu daté, raccourcis système fonctionnels et — nouveau depuis le tour 3 —
stables sur seize chemins d'entrée, décalage maximal 0,0171. La dernière réserve que j'émettais
(`?action=new` à 0,18) est levée. B ouvre directement sur la table, avantage réel et non mesuré ;
ses critiques publiques mentionnent plantages et taps manqués. Reste contre A l'écran de
configuration préalable, qui est un choix de produit, pas un défaut.

**D6 — A = ScoreTrack, B = Mutility. Préférence : ScoreTrack, nettement. Confiance 3/5.**
A aligne : 0 violation axe sur 14 thèmes × 6 états sans filtre de gravité, contraste des pixels
rendus mesuré par deux méthodes indépendantes qui concordent, 38 contrôles atteignables au clavier
avec des groupes radio conformes au motif APG, dialogue réellement inerte, cibles ≥ 44 px tenues
jusqu'à 200 % de texte système, échelle relative, et **trois contrôles dont le pouvoir de détection
est démontré par mutation** (recouvrement, décalage, mutisme de l'instrumentation). B ne documente
que « formes ou texte en plus de la couleur » et un mouvement réduit, sans une seule mesure :
quatre critères sur cinq restent INDÉTERMINÉS de son côté. Aucun échec AA ne subsiste côté A.
La confiance reste plafonnée à 3/5 par l'asymétrie de preuve, non par le résultat : un test
utilisateur réel sur table ou une exécution côte à côte sur téléphone primerait sur ce verdict
(§6.6 du protocole).
