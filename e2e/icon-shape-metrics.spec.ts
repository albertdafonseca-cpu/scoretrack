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

test.describe('Icônes SVG — distinction géométrique réelle mesurée sur les pixels (élément H, round 2 §P1-2, round 3 renforcement)', () => {
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
});
