# Critique indépendante — Élément B (Logique de jeu & sécurité applicative), round 1

Agent critique de l'élément B. Commit audité : `7b68c4d` (intégré sur
`claude/audit-qualite-aaa-lmthte`, HEAD d'intégration `2456730`). Vérification
faite dans un `git worktree` détaché sur `2456730`
(`/tmp/audit-B/wt`, supprimé en fin de tâche), jamais dans le dépôt partagé,
conformément à la note de méthodologie de `DECISIONS-B.md` §0. Toutes les
commandes ci-dessous ont été exécutées réellement ; les extraits de sortie
sont copiés tels quels, pas reformulés.

## Verdict

**AAA : oui**, sous réserve de 2 défauts P2 mineurs listés en fin de document
(aucun P0/P1 trouvé). L'élément B corrige effectivement l'injection HTML par
nom de joueur aux 5 points annoncés, avec des tests capables d'échouer
(mutation testing vérifié deux fois : celui du constructeur, rejoué, et un
second indépendant avec des charges et des mutations différentes), et
n'introduit aucune régression fonctionnelle ni de changement d'interface
`window` incompatible.

## 1. Vérification indépendante et adversariale de l'injection HTML

### 1.1 Périmètre réel du correctif (lu sur le commit, pas paraphrasé)

`git show --stat 7b68c4d` : seuls les fichiers annoncés sont touchés —
`src/dom.ts` (+13), `src/game.ts` (+76/−19), 2 fichiers de test, 2 fichiers de
support de test, `docs/audit/DECISIONS-B.md`, `docs/audit/BRIEF.md` (ajout
§7 seulement). Aucune collision avec le périmètre d'un autre élément.

`escapeHtml` réellement ajoutée à `src/dom.ts` :
```ts
export function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, c => map[c]);
}
```
Les 5 points cités par le constructeur sont bien tous corrigés dans le diff
réel (`buildCard` ×3 : `nameHtml`, tuile vainqueur, tuile éliminé ;
`showRecap` : `recapPlayerName` ; `renderProfileChips` : reconstruction DOM
complète, plus d'`innerHTML`/`onclick` construit). J'ai aussi vérifié
moi-même par grep qu'aucun autre point d'interpolation de `playerName` n'a
été oublié : toutes les autres occurrences (`animations.ts` ×3,
`recap-pdf.ts` ×2, `dice-ui.ts` ×1, et le reste de `game.ts`) passent par
`.textContent=` (safe par construction, aucune interprétation HTML possible
quel que soit le contenu) ou par `doc.text()` de jsPDF (rendu texte, pas de
DOM/HTML). Confirmé par lecture directe des lignes citées :
`src/animations.ts:161/540/801` (`.textContent = name`), `src/dice-ui.ts:574`
(`nm.textContent=p.playerName...`), `src/recap-pdf.ts:130/181`
(`doc.text(...)`). Le tableau des 6 lignes hors-périmètre laissées telles
quelles (`renderPresets`/`renderThemeGrid`, `t(p.nameKey)`/couleurs de thème)
est correct : ce sont des littéraux du code, jamais des données utilisateur.

### 1.2 Mes propres tests, charges différentes de celles du constructeur

Le constructeur teste une seule charge composite
(`<script>...</script><img ...onerror...>"'</span>`) dans
`tests/game.injection.test.ts` (7 tests). J'ai écrit
`tests/critic-b.injection.test.ts` (52 tests, dans mon worktree, jamais
commité au dépôt partagé) avec **10 charges indépendantes**, appliquées aux 4
points d'affichage HTML + `renderProfileChips`/`deleteProfile` :

| Charge | But |
|---|---|
| `<img src=x onerror=...>` | balise active demandée explicitement par la mission |
| `"><svg onload=...>` | évasion d'attribut + balise active, demandée explicitement |
| `<a href="javascript:...">` | contexte `href` javascript:, demandé explicitement |
| `＜script＞...＜/script＞` (fullwidth Unicode U+FF1C/FF1E) | homoglyphes de `<`/`>`, demandé explicitement |
| `"'"'"'` | nom composé uniquement de guillemets, demandé explicitement |
| `''` (chaîne vide) | nom vide, demandé explicitement |
| `'A'.repeat(20000) + '<img ...>'` | nom très long, demandé explicitement |
| `'Bob\u0000<img ...>'` | octet nul |
| `` '${alert(1)}`;window.__x=1;`' `` | tentative d'évasion de template literal JS |
| `'-->\<img ...\><!--'` | évasion de commentaire HTML |

Résultat réel (`npx vitest run tests/critic-b.injection.test.ts`) :
```
Test Files  1 passed (1)
     Tests  52 passed (52)
```
(Un seul ajustement a été nécessaire pendant l'écriture : le cas `\u0000` ne
préserve pas l'octet nul tel quel après un aller-retour dans `innerHTML`
jsdom — comportement du parseur HTML standard, sans lien avec le correctif ;
`__critPwned6` reste bien `undefined` dans tous les cas, donc aucune
exécution de code, juste un octet nul silencieusement absorbé comme le ferait
un vrai navigateur.) Pour chacune des 10 charges, sur les 4 points
(`buildCard` ×3, `showRecap`), et pour `renderProfileChips`+`deleteProfile` :
zéro `<script>`/`<img>`/`<svg>`/`<a>` réellement créé dans le DOM, zéro
exécution de charge (8 sentinelles `window.__critPwnedN` toutes restées
`undefined`), et **`deleteProfile` continue de fonctionner avec un nom
piégé** — vérifié en cliquant réellement (`dispatchEvent`) le bouton de
suppression et en confirmant que `localStorage.scoretrack_profiles` ne
contient plus que l'entrée saine restante, pour les 9 charges non vides.

### 1.3 Parcours de bout en bout réel (Playwright/Chromium, dist/ de prod)

`e2e/critic-b-full-playthrough.spec.ts` (nouveau, écrit par moi, non commité
au dépôt partagé) : ouvre `dist/index.html` réel, accepte la politique de
confidentialité, choisit un préréglage, **contourne volontairement le
`maxlength` du champ de nom** (3 à 10 caractères selon la largeur d'écran —
une commodité de saisie côté UI, pas une frontière de sécurité, contournable
trivialement par un copier-coller, une extension de navigateur ou de
l'automatisation) pour injecter une charge composite
`<img src=x onerror=...><svg onload=...>` comme nom du premier joueur, joue
un tour, enregistre le nom comme profil, appelle `showRecap()` via
`window.ScoreTrack.game`. Résultat réel :
```
✓  1 [chromium] › e2e/critic-b-full-playthrough.spec.ts ... (2.0s)
1 passed (3.3s)
```
Assertions vérifiées réellement : 0 balise active dans `.pcard`, le nom
piégé apparaît bien **textuellement** dans `.pplayer`, 0 balise
`img[src="x"]`/`svg[onload]` nulle part dans le document, sentinelle
`window.__e2ePwned` jamais déclenchée, **0 `pageerror`, 0 `console.error`, 0
`dialog`** (donc pas d'`alert()` déclenché). J'ai aussi fait tourner la
suite e2e complète du dépôt (`npx playwright test`, 9 tests dont le mien) :
```
9 passed (9.2s)
```
— aucune régression sur les tests e2e des autres éléments (accessibilité,
polices auto-hébergées, export PDF hors ligne, fumée).

## 2. Mutation testing indépendant

Deux mutations, **différentes de celles du constructeur**, appliquées dans
mon worktree isolé, jamais dans le dépôt partagé.

### 2.1 `escapeHtml` — laisser passer `<` sans échappement (le constructeur avait testé un bypass total `return String(s)`)

```diff
-  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
-  return String(s).replace(/[&<>"']/g, c => map[c]);
+  const map: Record<string, string> = { '&': '&amp;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
+  return String(s).replace(/[&>"']/g, c => map[c]);
```
Rejoué : `npx vitest run tests/critic-b.injection.test.ts tests/game.injection.test.ts`
→ **28 tests échouent sur 59**, avec des messages précis, p. ex. :
```
AssertionError: expected '12－＋' to be '<script>window.__pwned=true</script>...'
```
(le nom réel affiché n'est plus le texte piégé mais le contenu suivant dans
la carte — preuve concrète qu'une vraie balise a été créée et a avalé le
texte). Restauré : `git checkout -- src/dom.ts`, `git diff --stat` vide
confirmé, suite revérifiée verte (52+7 tests).

### 2.2 `renderProfileChips` — revert vers `innerHTML` (variante différente : sans même la protection partielle de l'apostrophe que l'ancien code avait)

```diff
-    const chip=document.createElement('div');chip.className='profile-chip';
-    const label=document.createElement('span');label.textContent=name;
-    const del=document.createElement('span');del.className='profile-chip-del';del.textContent='✕';
-    del.addEventListener('click',e=>{e.stopPropagation();deleteProfile(name);});
-    chip.appendChild(label);chip.appendChild(del);
-    chip.onclick=()=>fillName(name);
+    const chip=document.createElement('div');chip.className='profile-chip';
+    chip.innerHTML=`<span>${name}</span><span class="profile-chip-del" onclick="event.stopPropagation();deleteProfile('${name}')">✕</span>`;
+    chip.onclick=()=>fillName(name);
```
Rejoué : **11 tests échouent** avec des erreurs concrètes et parlantes, pas
de simples égalités ratées :
```
ReferenceError: deleteProfile is not defined
SyntaxError: Invalid or unexpected token   (parseur d'attribut onclick de jsdom)
```
— la preuve la plus forte possible que le motif d'origine casse réellement
l'exécution, pas seulement le texte affiché. Restauré : `git checkout --
src/game.ts`, `git diff --stat` vide confirmé, suite revérifiée verte.

Les deux mutations confirment : les tests ne peuvent structurellement pas
passer si le correctif est annulé (règle D17 du brief), avec des charges et
des variantes de casse indépendantes de celles du constructeur.

## 3. `computeClampedScore` — cas limites, mutations indépendantes

Nouveau fichier `tests/critic-b.score-logic.test.ts` (7 tests), cas
explicitement demandés par la mission :

- **Score déjà au plafond** (`prevScore=100`, mode win `maxPoints=100`,
  `delta=+7`) → `newScore=100`, `realDelta=0`, `rawScore=107` (mémorisé).
- **Score déjà au plancher** (`prevScore=0`, négatif interdit, `delta=-12`)
  → `newScore=0`, `realDelta=0`, `rawScore=-12`.
- **Delta négatif dépassant le plancher** (`bloquerMode='min'`,
  `prevScore=45`, `delta=-1000`) → `newScore=40` (le plancher exact, pas
  au-delà), `realDelta=-5`.
- **Delta positif dépassant le plafond** (`bloquerMode='max'`,
  `prevScore=35`, `delta=+1000`) → `newScore=40` (le plafond exact),
  `realDelta=+5`.
- **Plafond et plancher désactivés** (`bloquerMode='none'`, `allowNeg=true`,
  `maxPoints=Infinity`) → aucun clamp dans les deux sens, testé avec des
  valeurs extrêmes (±10⁹).
- Deux cas de bord supplémentaires (pile sur le plafond, dépassement d'une
  seule unité) pour vérifier que le clamp est exact au point près.

Résultat réel : `7 passed (7)`.

**Mutation indépendante** (différente de celle du constructeur, qui avait
testé `newScore=rawScore`, suppression totale du clamp) : suppression du
seul plafond `capMax`, plancher conservé :
```diff
-  const newScore=Math.min(capMax,Math.max(minVal,rawScore));
+  const newScore=Math.max(minVal,rawScore);
+  void capMax;
```
Rejoué : **5 tests échouent sur 23** (mes 7 + les 9 du constructeur), avec
des messages précis (`expected 1035 to be 40`, `expected 140 to be 40`,
`expected 1050 to be 1000`, `expected 101 to be 100`). Restauré,
`git diff --stat` vide confirmé, 138/138 tests verts revérifiés
(`npm run test`).

## 4. Non-régression fonctionnelle (Playwright, parcours complet)

Voir §1.3 : le parcours joué (profil au nom piégé → partie → ajustement de
score → sauvegarde de profil → récapitulatif) s'est déroulé sans accroc, et
la suite e2e complète du dépôt (9 tests, tous les éléments confondus) reste
verte après le correctif de B. Aucune régression visible constatée sur
l'écran de jeu, le récapitulatif, ou le mécanisme de suppression de profil.

## 5. Respect du périmètre et de l'interface `window`

- `git show --stat 7b68c4d` (§1.1) : seuls les fichiers annoncés sont
  touchés, aucune collision.
- `git diff adf4b1d 7b68c4d -- src/types.ts src/globals.d.ts` → **vide** :
  ces deux fichiers, cités comme "lus, non modifiés" par `DECISIONS-B.md`,
  sont bien restés intacts.
- Les propriétés `window._*` consommées par `animations.ts`/`dice-ui.ts`
  (`_afterElimAnim`, `_afterFinAnim`, `_afterWinAnim`, `_stopElimAnim`,
  `_stopWinAnim`, `_winAnimDelayTID`) correspondent exactement à celles
  déclarées dans `src/globals.d.ts` — vérifié par grep croisé, aucun écart.
- `git diff adf4b1d 7b68c4d -- src/game.ts | grep "window\._"` : les 2
  occurrences de `window._lastAdjustPrev=...` apparaissent en lignes de
  contexte inchangées dans le diff (pas des `+`), confirmant qu'elles n'ont
  pas été altérées par le refactor `computeClampedScore`.
- **Build complet réel, sur l'état actuel du dépôt** (worktree isolé sur
  `2456730`, donc avec les correctifs C/D/E/F déjà intégrés) :
  ```
  npm run typecheck   → vert, aucune erreur (0 sortie = succès)
  npm run build       → dist/sw.js 2.5kb, dist/app.js 1.6mb, aucune erreur
  npm run test        → 138 passed (79 constructeur/autres éléments + 59 miens)
  npm run lint        → 0 erreur, 566 avertissements (identique au chiffre de DECISIONS-A/B)
  ```

## 6. Comparaison à l'aveugle contre une application grand public de référence

Sans connaître d'application précise à exécuter, le principe de sécurité
communément admis pour ce type de produit (compteur de score / companion de
jeu de plateau grand public, où le nom de joueur est un champ texte libre
affiché à plusieurs endroits de l'interface) est simple et bien établi :
**toute donnée utilisateur affichée dans un contexte HTML doit être soit
échappée systématiquement au moment de la sérialisation, soit posée par
l'API DOM (`textContent`/`createElement`) qui ne l'interprète jamais comme
balisage.** Une application professionnelle grand public de cette catégorie
respecte cette règle de façon uniforme, sans laisser un seul point
d'affichage du nom en dehors de cette garantie — sans quoi un unique champ
oublié rouvre entièrement la faille (le format même de l'attaque, un seul
nom piégé partagé en local ou en photo d'écran d'un ami, la rend triviale à
déclencher, contrairement à une injection qui demanderait un accès serveur).

ScoreTrack, après ce correctif, atteint effectively ce niveau : **tous** les
points d'affichage du nom que j'ai pu identifier (carte joueur active,
tuiles vainqueur/éliminé, chip de profil, récapitulatif, tuiles d'animation,
export PDF) sont soit échappés (`escapeHtml`), soit construits par DOM
(`renderProfileChips`), soit intrinsèquement sûrs (`.textContent=`,
`doc.text()` de jsPDF) — vérifié exhaustivement par grep de toutes les
occurrences de `playerName` dans `src/*.ts` (§1.1), pas seulement sur les 5
points annoncés par le constructeur. C'est exactement l'uniformité qu'une
application grand public professionnelle est censée avoir : pas de
rustine ponctuelle sur un seul champ pendant que les autres restent
vulnérables. Sur ce critère précis (protection contre l'injection HTML par
nom d'utilisateur), ScoreTrack est donc **au moins à égalité** avec ce
qu'on attendrait d'une application de référence du marché dans cette
catégorie, et la profondeur de la preuve fournie (mutation testing réel,
charges adversariales variées, parcours e2e complet) va au-delà de ce que
la plupart des applications grand public documentent publiquement.

## 7. Défauts trouvés (P0/P1 : aucun ; P2 mineurs)

Aucun défaut P0 ou P1 reproductible trouvé. Deux nits P2, sans impact sur le
verdict AAA :

- **P2-1 — Commentaire obsolète dans `src/main.ts:32`** (hors périmètre
  strict de B, mais introduit comme conséquence directe de son changement) :
  `deleteProfile: game.deleteProfile, // appelé par un onclick construit
  dans renderProfileChips (game.ts)` — ce commentaire décrit exactement le
  mécanisme que B vient de supprimer (l'`onclick` construit en chaîne
  n'existe plus, remplacé par `addEventListener`). Le commentaire induit en
  erreur un futur lecteur qui chercherait ce mécanisme. `window.deleteProfile`
  reste exporté et fonctionnel (vérifié, aucun code ne l'appelle plus via
  `window` nulle part dans le dépôt — confirmé par grep), donc aucun risque
  fonctionnel ; correction suggérée : mettre à jour ou retirer le
  commentaire lors d'un prochain passage sur `main.ts`.
- **P2-2 — Redondance inoffensive héritée (pas introduite par B)** :
  `capMax=limits.bloquerMode==='max'?limits.startPoints:(limits.maxPoints===Infinity?Infinity:limits.maxPoints)`
  — la branche `limits.maxPoints===Infinity?Infinity:limits.maxPoints`
  équivaut toujours simplement à `limits.maxPoints`. Ce n'est pas une
  régression : la formule est une extraction fidèle du code dupliqué
  préexistant (vérifié par diff, la même formule existait déjà littéralement
  dans `adjust()` avant le refactor). Signalé pour une future simplification,
  sans lien avec la sécurité ni un bug fonctionnel.

## Annexe — artefacts de vérification (worktree, non commités au dépôt partagé)

- `/tmp/audit-B/wt/tests/critic-b.injection.test.ts` (52 tests, 10 charges indépendantes)
- `/tmp/audit-B/wt/tests/critic-b.score-logic.test.ts` (7 tests, cas limites de `computeClampedScore`)
- `/tmp/audit-B/wt/e2e/critic-b-full-playthrough.spec.ts` (parcours complet Playwright avec nom piégé)
- Worktree supprimé après vérification finale (`git worktree remove`).
