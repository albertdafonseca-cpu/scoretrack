// Élément H, round 2 (docs/audit/H-critique-round1.md, P1-2) puis round 3
// (docs/audit/H-critique-round2.md, P1 nouveau) — la garantie D-PREF-1/
// D-CLAUDE-2 (« distinguable sans la couleur ») n'était vérifiée qu'une
// seule fois à la main (capture + désaturation, DECISIONS-H.md §3.1) et par
// un test qui ne compte que le NOMBRE de balises SVG
// (`tests/ui-icons.test.ts`, « signatures structurelles ») — une mutation
// purement géométrique (même nombre de `<path>`/`<rect>`, coordonnées
// changées) ne change aucune de ces signatures.
//
// Round 2 : un premier correctif (`measureIcon`/`distance` ci-dessous,
// conservés tels quels) mesurait 8 métriques GLOBALES (couverture d'encre,
// aspect de la boîte englobante, centre de masse, répartition par quadrant)
// sur les pixels réellement rasterisés à la taille réelle d'usage.
//
// Round 3 : le critique a démontré que ces moments globaux ne suffisent
// pas — une géométrie de cadenas structurellement très différente (corps
// circulaire + 2 trous ronds façon orbites + museau, au lieu d'un corps
// rectangulaire + trou de serrure + anse ouverte) reproduit des valeurs
// globales proches (même couverture d'encre, boîte à peu près carrée,
// masse en haut) sans partager la structure locale, et se lit à l'écran
// comme une tête de mort miniature plutôt qu'un cadenas — démontré par une
// mesure réelle : `lock(mutant)↔skull = 0.220`, juste au-dessus du seuil
// de 0,20 alors même resté visuellement confondant.
//
// Correctif round 3 : `measureAHash`/`hammingDistance` ci-dessous ajoutent
// une empreinte de similarité perceptuelle grossière (average hash 16×16,
// composée sur fond blanc puis seuillée par rapport à sa propre moyenne de
// luminance) — approche suggérée par le critique lui-même (« un budget de
// similarité perceptuelle SSIM/pHash »), choisie plutôt qu'une simple
// grille de couverture d'encre : mesuré réellement (voir
// docs/audit/DECISIONS-H.md §12) qu'une grille fine 12×12 ne séparait PAS
// mieux la géométrie de contournement du critique qu'une comparaison
// globale (distance quasi identique, parfois même plus grande alors que la
// silhouette est plus confondante) — l'average hash, qui compare un
// résumé perceptuel grossier plutôt qu'une carte de densité brute, sépare
// nettement mieux dans les faits (mesuré : distance de Hamming ~41-44 pour
// 4 géométries de contournement différentes construites indépendamment,
// contre un minimum de 58 entre les 4 icônes d'origine — marge réelle).
//
// Import direct de `src/ui-icons.ts` : compare toujours la source
// réellement livrée, jamais une recopie qui se périmerait.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path, { extname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ICON_FLAG, ICON_LOCK, ICON_SKULL, ICON_TROPHY } from '../src/ui-icons';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

async function startStaticServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    (async () => {
      const reqPath = (req.url || '/').split('?')[0];
      const filePath = path.join(DIST, reqPath === '/' ? 'index.html' : reqPath);
      if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      try {
        const body = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    })();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

/** Prépare une icône pour rasterisation autonome : ajoute `xmlns` (superflu
 *  inline dans du HTML, requis pour un document SVG chargé isolément via une
 *  URI `data:image/svg+xml` — sinon Chromium rejette l'image silencieusement)
 *  et remplace `currentColor` par un noir opaque. */
function prepareSvgForRaster(svg: string): string {
  return svg
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace(/currentColor/g, '#000000');
}

/** Métriques GLOBALES mesurées sur les pixels réellement rasterisés (round 2). */
interface ShapeMetrics {
  inkRatio: number;      // part de la surface totale couverte d'encre
  bboxAspect: number;    // largeur/hauteur de la boîte englobante de l'encre
  centroidX: number;     // centre de masse, normalisé [0,1]
  centroidY: number;
  q1: number; q2: number; q3: number; q4: number; // répartition de l'encre par quadrant (somme = 1)
}

const SIZE = 24; // taille réelle d'usage de `.ui-icon` dans l'app (index.html)

/** Rasterise une icône sur un vrai canvas du navigateur, puis calcule les 8
 *  métriques globales à partir des pixels réels (`getImageData`) — pas une
 *  valeur déduite du code source SVG. Le damier `none`/`currentColor` du
 *  drapeau reste tel quel : `none` reste transparent, ce qui EST son encre
 *  réelle à l'écran. */
async function measureIcon(page: Page, svg: string): Promise<ShapeMetrics> {
  return page.evaluate(async ({ svg, size }) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; });
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const ALPHA_THRESHOLD = 40; // ignore l'anti-aliasing quasi transparent des bords
    let inkCount = 0, sumX = 0, sumY = 0;
    let minX = size, maxX = -1, minY = size, maxY = -1;
    const quadCount = [0, 0, 0, 0]; // TL, TR, BL, BR
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const alpha = data[(y * size + x) * 4 + 3];
        if (alpha > ALPHA_THRESHOLD) {
          inkCount++; sumX += x; sumY += y;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          const half = size / 2;
          const qi = (x < half ? 0 : 1) + (y < half ? 0 : 2);
          quadCount[qi]++;
        }
      }
    }
    const total = size * size;
    const bboxW = Math.max(1, maxX - minX + 1);
    const bboxH = Math.max(1, maxY - minY + 1);
    return {
      inkRatio: inkCount / total,
      bboxAspect: bboxW / bboxH,
      centroidX: inkCount ? sumX / inkCount / size : 0,
      centroidY: inkCount ? sumY / inkCount / size : 0,
      q1: inkCount ? quadCount[0] / inkCount : 0,
      q2: inkCount ? quadCount[1] / inkCount : 0,
      q3: inkCount ? quadCount[2] / inkCount : 0,
      q4: inkCount ? quadCount[3] / inkCount : 0,
    };
  }, { svg: prepareSvgForRaster(svg), size: SIZE });
}

/** Distance euclidienne dans l'espace des 8 métriques globales ci-dessus. */
function distance(a: ShapeMetrics, b: ShapeMetrics): number {
  const keys: (keyof ShapeMetrics)[] = ['inkRatio', 'bboxAspect', 'centroidX', 'centroidY', 'q1', 'q2', 'q3', 'q4'];
  let sum = 0;
  for (const k of keys) { const d = a[k] - b[k]; sum += d * d; }
  return Math.sqrt(sum);
}

// Marge minimale exigée entre CHAQUE paire d'icônes sur les 8 métriques
// globales. Distances réellement mesurées entre les 4 icônes d'origine
// (pixels réels, 24×24) :
//   trophy↔flag=0.470  trophy↔skull=0.323  trophy↔lock=0.551
//   flag↔skull=0.333   flag↔lock=0.539     skull↔lock=0.276  (la plus proche)
// Seuil fixé à 0.20 : nettement sous le minimum observé, marge réelle
// d'environ 30 %. Insuffisant à lui seul contre l'attaque du round 3 (voir
// AVERAGE_HASH_MIN_DISTANCE plus bas, le vrai gardien de ce round) mais
// conservé : signal bon marché, complémentaire, qui détecte d'autres
// classes de régression (ex. une icône qui s'effondre en un point ou qui
// déborde du cadre).
const MIN_DISTANCE = 0.2;

// ── Empreinte perceptuelle grossière (structure LOCALE, round 3) ───────
const HASH_SIZE = 16; // résolution de l'average hash (16×16 = 256 bits)

/** Average hash : rendu composé sur fond blanc (une icône transparente doit
 *  être comparée telle qu'elle apparaît réellement, fond compris) à
 *  `HASH_SIZE`×`HASH_SIZE`, converti en niveaux de gris, puis chaque cellule
 *  vaut `vrai` si elle est plus sombre que la luminance moyenne de l'image
 *  (« encre ») — un résumé perceptuel grossier bien établi (aHash), pas une
 *  simple carte de densité brute : deux silhouettes qui diffèrent par la
 *  taille/position relative de leurs zones sombres/claires s'écartent plus
 *  nettement dans cet espace qu'en comparant des sommes/moments globaux. */
async function measureAHash(page: Page, svg: string): Promise<boolean[]> {
  return page.evaluate(async ({ svg, n }) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; });
    const canvas = document.createElement('canvas');
    canvas.width = n; canvas.height = n;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, n, n); // fond réel (icône transparente comprise)
    ctx.drawImage(img, 0, 0, n, n);
    const { data } = ctx.getImageData(0, 0, n, n);
    const gray: number[] = [];
    for (let i = 0; i < data.length; i += 4) gray.push((data[i] + data[i + 1] + data[i + 2]) / 3);
    const mean = gray.reduce((a, b) => a + b, 0) / gray.length;
    return gray.map(g => g < mean);
  }, { svg: prepareSvgForRaster(svg), n: HASH_SIZE });
}

/** Distance de Hamming entre deux empreintes de même longueur. */
function hammingDistance(a: boolean[], b: boolean[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) d++; }
  return d;
}

// Distances de Hamming (average hash 16×16, 256 bits) réellement mesurées
// entre les 4 icônes d'origine :
//   trophy↔flag=61  trophy↔skull=58  trophy↔lock=82
//   flag↔skull=65   flag↔lock=81     skull↔lock=64   (la plus proche : trophy↔skull=58)
// Reproduction de la géométrie de contournement exacte du critique
// (H-critique-round2.md §6.3, corps circulaire + 2 trous ronds + museau +
// anse réduite) : lock(critique)↔skull = 41. Trois géométries
// supplémentaires construites indépendamment pour cette correction
// (docs/audit/DECISIONS-H.md §12, ma propre tentative de contournement
// avant de considérer ce correctif comme fiable) : 44, 36, 31 — toutes
// nettement sous le minimum d'origine (58). Seuil fixé à 48 : marge de 10
// sous le minimum d'origine, marge de 4 au-dessus de la plus haute valeur
// de contournement trouvée (44) — un balayage du rayon de l'anse (la
// dimension que le critique réduit pour « cacher » le cadenas) montre que
// la distance ne repasse au-dessus de 48 (50-52) qu'une fois l'anse revenue
// à une taille proche de l'original (rayon ≥ 3,5 sur un original à 3,8) :
// le seuil sépare bien « anse décorative token » de « vraie anse de
// cadenas », ce qui est exactement la distinction sémantique recherchée.
const AVERAGE_HASH_MIN_DISTANCE = 48;

// ── Taux d'encre ABSOLU (round 4, H-critique-round3.md) ─────────────────
// L'average hash ci-dessus seuille chaque image par rapport à SA PROPRE
// luminance moyenne — un dessin à faible taux d'encre (contour fin, sans
// remplissage) a une moyenne très différente d'un dessin plein, ce qui
// déplace le comportement du seuillage indépendamment de la silhouette
// réelle. Démontré par le critique : un cadenas dessiné entièrement en
// `stroke` (cercle-tête + 2 petits cercles-yeux + nez + anse, sans aucun
// `fill`) mesure `skull↔lock = 52` (>= 48, donc PASSE l'average hash) tout
// en se lisant, à l'écran réel, comme un petit visage rond plutôt qu'un
// cadenas.
//
// Contre-mesure : un taux d'encre ABSOLU (fraction de pixels dont le canal
// alpha dépasse un seuil FIXE, indépendant de la luminance propre de
// l'image — c'est exactement le champ `inkRatio` déjà calculé par
// `measureIcon` ci-dessus pour les 8 métriques globales du round 2, jamais
// jusqu'ici vérifié par lui-même contre une bande absolue) doit rester dans
// une bande calibrée sur les 4 icônes légitimes actuelles, à la taille
// réelle d'usage (24×24) :
//   trophy=0.3403  flag=0.1944  skull=0.3229  lock=0.3247
// (le drapeau, avec son damier à moitié transparent, a le taux le plus
// bas ; le trophée, plein, le plus haut). Bande retenue : [0.15, 0.45] —
// marge d'environ 0,044 (23 %) sous le minimum légitime (0,194) et marge
// large au-dessus du maximum légitime (0,340), pour ne pas braquer sur les
// 4 valeurs actuelles tout en excluant nettement un dessin en contour fin :
// le cadenas-contour du critique mesure 0,1215, sous la borne basse. Les
// DEUX vérifications (average hash ET bande de taux d'encre) doivent
// passer — un test Playwright séparé par condition, toutes deux dans le
// même fichier, réalisent cette exigence en ET logique (le fichier n'est
// vert que si tous ses tests le sont).
const MIN_ABS_INK_RATIO = 0.15;
const MAX_ABS_INK_RATIO = 0.45;

// ── Topologie des trous internes du CORPS (round 5, H-critique-round4.md) ──
// Le critique round 4 a démontré un 3e contournement, avec marge confortable
// cette fois : une reproduction indépendante de la « configuration E » que
// LE CONSTRUCTEUR lui-même avait décrite (DECISIONS-H.md §12, round 3) sans
// jamais la rendre ni la regarder — corps « gélule » (arrondi extrême) + anse
// à sa taille ORIGINALE + 2 trous ronds + nez positionnés comme le crâne.
// Rendue réellement : une tête ronde à deux yeux, aucun indice de cadenas.
// Facteur commun aux 3 contournements réussis depuis le round 2 (identifié
// par le critique, et déjà repéré à la main par le constructeur en round 3
// sans jamais en tirer de garde automatisée) : une silhouette de CORPS
// globalement ronde/ovale plutôt qu'anguleuse.
//
// Première piste essayée pour ce round, EXACTEMENT celle suggérée par le
// coordinateur (rapport aire de la coque convexe / aire réelle de la
// silhouette totale, icône entière anse comprise) — mesurée et NON retenue
// seule : sur les 4 icônes légitimes à 48×48, ce rapport donne
// trophy=1.4241, flag=1.4167, skull=1.0774, **lock=1.0518** — le cadenas
// RÉEL est la silhouette la PLUS proche de 1 (la plus « convexe ») des
// 4 icônes, plus proche de 1 que le crâne lui-même. Une géométrie de
// contournement construite pour ce round (corps OCTOGONAL anguleux, coins
// coupés, + anse pleine taille + 2 trous/nez façon crâne, jamais tentée
// aux rounds précédents) mesure une distance à ce même espace de mesure
// (rapport de coque convexe + circularité + rapport coque/boîte
// englobante) de seulement 0,135 par rapport au crâne — supérieure de peu
// au plancher légitime (0,133, la paire trophée/drapeau) — et donc PASSE
// cette mesure alors que, rendue et regardée à la taille réelle (24×24,
// capture ci-dessous dans DECISIONS-H.md §15), elle est sans ambiguïté un
// visage à deux yeux et un nez, pas un cadenas. **Constat honnête : la
// convexité globale de la silhouette (anse comprise), telle que suggérée,
// ne sépare pas de façon fiable ce contournement-ci.**
//
// Correctif retenu, plus proche de la vraie cause structurelle : le cadenas
// réel n'a qu'UN SEUL trou interne (le trou de serrure — un cercle et un
// triangle qui se CHEVAUCHENT et fusionnent en un seul contour fermé) alors
// que TOUTES les géométries de contournement mesurées ici (la config E du
// critique, l'octogone ci-dessus, une variante elliptique, et la config D du
// round 3 jamais rendue non plus) ont TROIS trous internes distincts (2 yeux
// séparés + 1 nez séparé) — exactement la topologie du crâne
// (`ICON_SKULL` : 2 orbites + 1 nez, également 3 trous distincts). Compter
// les composantes connexes de fond enfermées dans l'encre (remplissage par
// propagation depuis les bords du canevas, 4-connexité) donne, sur le corps
// REMPLI seul (l'anse retirée avant rasterisation : sinon l'anse, qui forme
// sa propre boucle fermée avec le haut du corps, ajoute un trou sans rapport
// avec la question posée) :
//   trophy=0   flag=6   skull=3   **lock=1**   (mesuré à 48×48)
// Testé à 8 résolutions différentes (32/40/48/56/64/80/96, voir
// DECISIONS-H.md §15) : `lock` vaut 1 ou 2 selon la résolution (la fine
// zone de chevauchement cercle/triangle est sensible à l'anti-aliasing),
// mais reste TOUJOURS strictement inférieur à `skull` (constant à 3 à
// toutes les résolutions testées) — d'où une comparaison RELATIVE
// (`holeCount(lock) < holeCount(skull)`) plutôt qu'un seuil absolu fixe,
// robuste au choix exact de résolution. Résolution retenue ici : 48×48,
// plus fine que la taille d'usage réelle (24×24, utilisée par les 3 tests
// précédents) — mesuré et documenté : à 24×24 le fin chevauchement
// cercle/triangle du vrai cadenas ne survit PAS à la rasterisation
// (`lock=2`, identique à TOUTES les géométries de contournement, `2`
// également) — la résolution de 48×48 est nécessaire ici pour refléter la
// topologie réelle du tracé vectoriel plutôt qu'un artefact de sous-
// échantillonnage à la taille d'affichage.
const HOLE_SIZE = 48;

/** Retire les éléments en CONTOUR SEUL (`fill="none"`, l'anse du cadenas,
 *  les anses du trophée) avant rasterisation, pour isoler la topologie de
 *  trous du CORPS REMPLI seul (voir commentaire ci-dessus). */
function stripStrokeOnly(svg: string): string {
  return svg.replace(/<path[^>]*\bfill="none"[^>]*\/>/g, '');
}

/** Compte les composantes connexes de fond (alpha ≤ seuil) qui ne sont PAS
 *  atteintes par une propagation 4-connexe depuis les bords du canevas —
 *  donc des trous réellement ENFERMÉS dans l'encre, pas le fond extérieur.
 *  Un filtre d'aire (≥ 2 px) ignore le bruit d'anti-aliasing résiduel. */
async function measureHoleCount(page: Page, svg: string): Promise<number> {
  return page.evaluate(async ({ svg, size }) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; });
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const ALPHA_THRESHOLD = 40;
    const ink = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) ink[i] = data[i * 4 + 3] > ALPHA_THRESHOLD ? 1 : 0;

    // Propagation depuis les bords sur le fond : marque tout ce qui est
    // atteignable de l'EXTÉRIEUR de la silhouette.
    const outside = new Uint8Array(size * size);
    const stack: number[] = [];
    for (let x = 0; x < size; x++) { stack.push(x); stack.push((size - 1) * size + x); }
    for (let y = 0; y < size; y++) { stack.push(y * size); stack.push(y * size + size - 1); }
    while (stack.length) {
      const idx = stack.pop()!;
      if (idx < 0 || idx >= size * size || ink[idx] || outside[idx]) continue;
      outside[idx] = 1;
      const x = idx % size;
      if (x > 0) stack.push(idx - 1);
      if (x < size - 1) stack.push(idx + 1);
      if (idx - size >= 0) stack.push(idx - size);
      if (idx + size < size * size) stack.push(idx + size);
    }

    // Composantes connexes du fond RESTANT (ni encre, ni atteint depuis
    // l'extérieur) : ce sont les trous enfermés.
    const visited = new Uint8Array(size * size);
    let holeCount = 0;
    for (let i = 0; i < size * size; i++) {
      if (ink[i] || outside[i] || visited[i]) continue;
      let area = 0;
      const st = [i];
      visited[i] = 1;
      while (st.length) {
        const idx = st.pop()!;
        area++;
        const x = idx % size;
        const neigh = [idx - 1, idx + 1, idx - size, idx + size];
        for (const n of neigh) {
          if (n < 0 || n >= size * size) continue;
          if (Math.abs((n % size) - x) > 1) continue; // pas de faux voisin par rebouclage de ligne
          if (!ink[n] && !outside[n] && !visited[n]) { visited[n] = 1; st.push(n); }
        }
      }
      if (area >= 2) holeCount++;
    }
    return holeCount;
  }, { svg: prepareSvgForRaster(svg), size: HOLE_SIZE });
}

test.describe('Icônes SVG — distinction géométrique réelle mesurée sur les pixels (élément H, round 2 §P1-2, round 3 renforcement, round 4 anti-contour-fin)', () => {
  test('les 4 icônes ont des métriques globales de forme séparées par une marge réelle (round 2)', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      const icons = { trophy: ICON_TROPHY, flag: ICON_FLAG, skull: ICON_SKULL, lock: ICON_LOCK };
      const metrics: Record<string, ShapeMetrics> = {};
      for (const [name, svg] of Object.entries(icons)) metrics[name] = await measureIcon(page, svg);

      const names = Object.keys(metrics);
      const pairDistances: string[] = [];
      let minPairDistance = Infinity;
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const d = distance(metrics[names[i]], metrics[names[j]]);
          pairDistances.push(`${names[i]}↔${names[j]} = ${d.toFixed(3)}`);
          if (d < minPairDistance) minPairDistance = d;
        }
      }
      expect(minPairDistance, `distances globales mesurées :\n${pairDistances.join('\n')}`).toBeGreaterThanOrEqual(MIN_DISTANCE);
    } finally {
      await server.close();
    }
  });

  test('les 4 icônes restent perceptuellement distinctes (average hash, structure locale, round 3)', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      const icons = { trophy: ICON_TROPHY, flag: ICON_FLAG, skull: ICON_SKULL, lock: ICON_LOCK };
      const hashes: Record<string, boolean[]> = {};
      for (const [name, svg] of Object.entries(icons)) hashes[name] = await measureAHash(page, svg);

      const names = Object.keys(hashes);
      const pairDistances: string[] = [];
      let minPairDistance = Infinity;
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const d = hammingDistance(hashes[names[i]], hashes[names[j]]);
          pairDistances.push(`${names[i]}↔${names[j]} = ${d}`);
          if (d < minPairDistance) minPairDistance = d;
        }
      }
      expect(minPairDistance, `distances de Hamming (aHash ${HASH_SIZE}×${HASH_SIZE}) mesurées :\n${pairDistances.join('\n')}`)
        .toBeGreaterThanOrEqual(AVERAGE_HASH_MIN_DISTANCE);
    } finally {
      await server.close();
    }
  });

  test('les 4 icônes ont un taux d\'encre absolu dans la bande calibrée (round 4, anti-contour-fin)', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      const icons = { trophy: ICON_TROPHY, flag: ICON_FLAG, skull: ICON_SKULL, lock: ICON_LOCK };
      const ratios: string[] = [];
      for (const [name, svg] of Object.entries(icons)) {
        const { inkRatio } = await measureIcon(page, svg);
        ratios.push(`${name} = ${inkRatio.toFixed(4)}`);
        expect(inkRatio, `taux d'encre de ${name} hors bande [${MIN_ABS_INK_RATIO}, ${MAX_ABS_INK_RATIO}] — tous mesurés :\n${ratios.join('\n')}`)
          .toBeGreaterThanOrEqual(MIN_ABS_INK_RATIO);
        expect(inkRatio, `taux d'encre de ${name} hors bande [${MIN_ABS_INK_RATIO}, ${MAX_ABS_INK_RATIO}] — tous mesurés :\n${ratios.join('\n')}`)
          .toBeLessThanOrEqual(MAX_ABS_INK_RATIO);
      }
    } finally {
      await server.close();
    }
  });

  test('le corps du cadenas garde une topologie de trous distincte de celle du crâne (round 5, anti-corps-rond)', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      const icons = { trophy: ICON_TROPHY, flag: ICON_FLAG, skull: ICON_SKULL, lock: ICON_LOCK };
      const holeCounts: Record<string, number> = {};
      for (const [name, svg] of Object.entries(icons)) holeCounts[name] = await measureHoleCount(page, stripStrokeOnly(svg));

      const report = Object.entries(holeCounts).map(([name, n]) => `${name} = ${n}`).join('\n');
      // Comparaison RELATIVE (pas un seuil absolu fixe) : mesurée stable sur
      // 7 résolutions différentes (32 à 96, voir DECISIONS-H.md §15), alors
      // que la valeur absolue de `lock` seule (1 ou 2) ne l'est pas.
      expect(holeCounts.lock, `le corps du cadenas (anse retirée) a ${holeCounts.lock} trou(s), pas strictement moins que le crâne — topologie de trous mesurée pour les 4 icônes :\n${report}`)
        .toBeLessThan(holeCounts.skull);
    } finally {
      await server.close();
    }
  });
});
