# Critique élément F — CI/CD, déploiement, documentation (round 2)

Agent critique indépendant, round 2. Vérification faite dans un nouveau
`git worktree` détaché isolé (`git worktree add --detach <tmp>/wt-F-r2
eb73132`, supprimé en fin de tâche). Aucun fichier du dépôt partagé modifié
par cet agent hormis ce rapport. Base vérifiée : commit `eb73132`
(« Audit AAA — round 1 : critiques E/F, correction du P0 fetch SW mort »),
dernier commit de la branche `claude/audit-qualite-aaa-lmthte` au moment du
lancement de ce round.

## Verdict

**AAA : oui**, pour le périmètre de l'élément F (CI/CD, déploiement,
documentation).

Les trois défauts du round 1 (P0 fetch SW mort / CSP non resserrée / README
obsolète) sont corrigés et revérifiés de façon indépendante, avec la même
rigueur méthodologique qu'au round 1 (exécution réelle du code compilé, pas
seulement lecture du diff). Le reste du périmètre (build.mjs, CI, .gitignore)
est stable et reste AAA depuis le round 1. Seul un point mineur, déjà classé
P2 au round 1 et hors du périmètre d'édition de F, reste ouvert : la licence.

---

## 1. Fetch mort vers Google Fonts — disparition confirmée indépendamment

**Confirmé disparu**, avec la même méthode qu'au round 1 (bac à sable Node
exécutant le vrai binaire compilé — pas seulement des écouteurs réseau
Playwright, structurellement aveugles au trafic émis depuis un service
worker, comme démontré au round 1).

- `grep -rn "cdnjs.cloudflare\|fonts.googleapis\|fonts.gstatic" src/
  index.html` → **aucune occurrence**.
- `src/sw-worker.ts` relu intégralement : `FONT_CSS_URLS`, `FONT_HOSTS`,
  `FONTS_CACHE` et la branche `fetch` dédiée ont bien disparu ; seul un
  commentaire explique que l'ancien cache `st-fonts-v4` sera nettoyé de
  lui-même par la logique `activate` existante chez les visiteurs qui
  l'avaient encore.
- **Exécution réelle du `dist/sw.js` compilé** (`npm run build` puis
  `vm.createContext` avec `self`/`caches`/`fetch` simulés, déclenchement de
  l'événement `install`) : 29 URLs demandées, **toutes relatives** (`./`,
  `./fonts/*.woff2`, etc.), zéro URL absolue. Rejoué **3 fois consécutives**,
  résultat identique (`Externes (absolues, hors localhost): []`, exit 0)
  conformément à la règle de mesure D16/D21 du brief.
- **Mutation testing du nouveau test `tests/sw-worker.test.ts`** : j'ai
  réintroduit moi-même un bloc `FONT_CSS_URLS`/`FONTS_CACHE` minimal dans une
  copie de travail de `src/sw-worker.ts` (mutation indépendante de celle du
  constructeur) et relancé `npx vitest run tests/sw-worker.test.ts` :
  **2 des 3 tests échouent bien** (le test d'inspection de source et celui
  d'exécution du binaire compilé). Restauration confirmée (`git diff
  --stat src/sw-worker.ts` vide), les 3 tests repassent au vert. Le test
  n'est donc pas un test qui « ne peut pas échouer » (D17 du brief) : il
  détecte réellement une régression de ce type précis.

### Note annexe, hors périmètre, pas un défaut
`dist/app.js` contient toujours une chaîne littérale
`https://cdnjs.cloudflare.com/ajax/libs/pdfobject/2.1.1/pdfobject.min.js` —
mais c'est du code **interne à la bibliothèque jsPDF elle-même** (chemin
`doc.output('pdfobjectnewwindow', ...)`, une fonctionnalité de prévisualisation
que jsPDF embarque pour tous ses utilisateurs). Vérifié dans
`src/recap-pdf.ts` : seul `doc.save(filename)` est appelé, jamais
`output('pdfobjectnewwindow', ...)` — ce chemin de code est mort et
inatteignable dans ScoreTrack. Différent du bug du round 1 (qui, lui,
s'exécutait *sans condition* à chaque installation) : signalé ici par souci
d'exhaustivité, pas comme un défaut.

---

## 2. CSP resserrée — vérification qu'elle ne casse rien

**Confirmée resserrée et fonctionnelle**, testée sur le parcours complet le
plus à risque (export PDF + polices auto-hébergées), pas seulement au
chargement de la page.

`vercel.json` — toutes les occurrences de `cdnjs.cloudflare.com`,
`fonts.googleapis.com`, `fonts.gstatic.com` ont disparu de **toutes** les
directives où elles apparaissaient (`script-src`, `style-src`, `font-src`,
`connect-src`) :
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
font-src 'self' data:; img-src 'self' data:; connect-src 'self'; worker-src 'self';
manifest-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none';
form-action 'self'
```

**Validation Playwright réelle** (serveur HTTP local posant exactement ces
en-têtes, écouteur `securitypolicyviolation`, écouteurs `pageerror` et
`console.error`), parcours complet :
1. chargement, attente de l'installation effective du service worker ;
2. vérification que les polices auto-hébergées sont **chargées** (`document.fonts`
   → `Inter:loaded` et 60 entrées `*:loaded` au total, aucune police externe
   requise) ;
3. **parcours réel de jeu** (préréglage → lancement → noms → carte de score
   visible) jusqu'à l'**export PDF réel** via le bouton `#btn-pdf-dl`,
   téléchargement intercepté et fichier vérifié avec en-tête `%PDF-` valide ;
4. second chargement (cache du service worker actif).

Résultat, rejoué **3 fois consécutives** (identique à chaque fois) :
```
Requêtes externes : AUCUNE
Violations CSP : AUCUNE
Erreurs JS (pageerror) : AUCUNE
console.error : AUCUN
Export PDF : déclenché = true, en-tête %PDF- valide = true
```

**Suite officielle également revérifiée** (`npm run ci` complet : lint,
typecheck, 82/82 tests unitaires, build ; puis `npm run test:e2e`, 8/8 après
un ré-essai — un seul timeout isolé sur `accessibility-basics.spec.ts`
disparu au ré-essai en isolation puis en suite complète, identifié comme
un flake d'environnement dû à la contention des 2 workers Playwright dans ce
bac à sable, non lié aux changements de ce round : reproductible à 0/2 après
coup). Notamment `e2e/pdf-export-offline.spec.ts` et
`e2e/fonts-self-hosted.spec.ts` passent tels quels sur le nouvel état.

**Aucune régression trouvée.** La CSP n'autorise plus aucune origine externe
devenue inutile, et rien ne casse — build, export PDF hors ligne et polices
auto-hébergées fonctionnent identiquement à avant le resserrement.

---

## 3. README à jour ?

**Oui, les trois imprécisions du round 1 sont corrigées, vérifiées mot pour
mot contre l'état actuel du dépôt :**

| Défaut round 1 | État round 2 | Vérification |
|---|---|---|
| `recap-pdf.ts` décrit comme « jsPDF, chargé depuis un CDN » | Corrigé : « jsPDF, dépendance npm bundlée par esbuild, plus de chargement CDN » | Conforme à `package.json.dependencies.jspdf` et à `src/recap-pdf.ts:1` (`import { jsPDF } from 'jspdf'`) |
| `fonts/` absent de la section Structure | Ajouté : entrée dédiée expliquant l'auto-hébergement et la copie vers `dist/fonts/` | Conforme au `cpSync('fonts', 'dist/fonts', ...)` de `build.mjs` (déjà vérifié stable, voir §4) |
| Description de `test:e2e` ignorait `pretest:e2e` | Corrigée : « relance automatiquement `npm run build` avant (`pretest:e2e`), pour ne jamais tester un `dist/` périmé » | Conforme à `package.json.scripts["pretest:e2e"]` |

Tous les autres scripts du tableau (`build`, `watch`, `typecheck`, `lint`,
`test`, `test:watch`, `check`, `ci`) toujours présents et décrits fidèlement
dans le `package.json` actuel. Aucune autre dérive trouvée en relisant le
README intégralement contre l'état du dépôt.

---

## 4. Reste du périmètre (build.mjs, CI, .gitignore) — stable, non re-testé en profondeur

Conforme à la demande du coordinateur : ces fichiers n'ont pas changé depuis
le round 1 (`git diff 2456730 eb73132 -- build.mjs .gitignore
.github/workflows/ci.yml` → vide, vérifié). Seule revérification faite :
`npm run ci` (qui exerce indirectement `build.mjs` et la même séquence que
la CI) reste vert de bout en bout sur l'état `eb73132` (§2 ci-dessus). Le
détail exhaustif (injection de syntaxe dans `main.ts`/`sw-worker.ts`,
vérification de `.gitignore` après un cycle complet) reste tel que documenté
au round 1 (`docs/audit/F-critique-round1.md`, points 2, 4 et 5) : rien n'a
changé qui remettrait ces conclusions en cause.

---

## 5. Licence — toujours ouverte, hors périmètre F

`package.json` n'a toujours pas de champ `license`, confirmé
(`require('./package.json').license === undefined`). Le coordinateur
confirme que ce n'était pas dans le périmètre du commit d'intégration
`eb73132`. **Jugement inchangé depuis le round 1 : P2**, à trancher par
l'utilisateur ou l'élément A, ne bloque pas le verdict AAA de l'élément F
lui-même (ce n'est ni un défaut de CI, ni de build, ni de sécurité HTTP —
les trois axes de cet élément).

---

## Défauts consolidés round 2

| # | Sévérité | Défaut | État |
|---|---|---|---|
| 1 (round 1) | P0 | Fetch mort vers `fonts.googleapis.com` dans `src/sw-worker.ts` | **Corrigé et revérifié indépendamment** (exécution réelle + mutation testing) |
| 2 (round 1) | P1 | README décrit jsPDF comme chargé par CDN | **Corrigé et revérifié** |
| 3 (round 1) | P1 | Test e2e structurellement incapable de détecter le fetch SW mort | **Corrigé** par un nouveau test dédié (`tests/sw-worker.test.ts`), qui exécute le vrai binaire compilé — mutation testée par mes soins, échoue bien sur la régression |
| 4 (round 1) | P2 | README omettait `fonts/` | **Corrigé** |
| 5 (round 1) | P2 | Description de `test:e2e` datée | **Corrigée** |
| 6 (round 1) | P2 | Licence absente de `package.json` | **Toujours ouvert**, hors périmètre F, jugement inchangé (P2, non bloquant) |

**Verdict final élément F : AAA : oui.** Le seul point encore ouvert (licence)
est un P2 documenté depuis le round 1, hors du périmètre d'édition de cet
élément, et ne relève d'aucun des trois axes (CI/CD, build, sécurité HTTP)
sur lesquels porte cette critique.
