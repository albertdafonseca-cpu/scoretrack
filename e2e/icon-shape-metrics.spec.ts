// Élément H, round 2 (docs/audit/H-critique-round1.md, P1-2) — la garantie
// D-PREF-1/D-CLAUDE-2 (« distinguable sans la couleur ») n'était vérifiée
// qu'une seule fois à la main (capture + désaturation, DECISIONS-H.md §3.1)
// et par un test qui ne compte que le NOMBRE de balises SVG
// (`tests/ui-icons.test.ts`, « signatures structurelles ») — une mutation
// purement géométrique (même nombre de `<path>`/`<rect>`, coordonnées
// changées) ne change aucune de ces signatures et passe donc ce test sans
// broncher, alors qu'elle peut rapprocher visuellement deux silhouettes
// (démontré par le critique : cadenas à corps presque circulaire + anse
// réduite, visuellement proche du crâne).
//
// Ce test mesure une VRAIE propriété géométrique des 4 icônes, sur les
// pixels RÉELLEMENT rendus (méthodologie du brief §3.5 : « mesurer les
// pixels rendus réels, jamais une valeur théorique ») à la taille réelle
// d'usage (24×24 px, celle de `.ui-icon` dans l'app) : ratio de couverture
// d'encre, ratio largeur/hauteur de la boîte englobante des pixels non
// transparents, centre de masse, et répartition de l'encre par quadrant —
// puis vérifie que les 4 icônes restent séparées les unes des autres par
// une marge minimale dans cet espace de mesure (pas seulement « différent »,
// une vraie marge). Import direct de `src/ui-icons.ts` : compare toujours
// la source réellement livrée, jamais une recopie qui se périmerait.
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

/** Métriques de forme mesurées sur les pixels réellement rasterisés. */
interface ShapeMetrics {
  inkRatio: number;      // part de la surface totale couverte d'encre
  bboxAspect: number;    // largeur/hauteur de la boîte englobante de l'encre
  centroidX: number;     // centre de masse, normalisé [0,1]
  centroidY: number;
  q1: number; q2: number; q3: number; q4: number; // répartition de l'encre par quadrant (somme = 1)
}

const SIZE = 24; // taille réelle d'usage de `.ui-icon` dans l'app (index.html)

/** Rasterise une icône (avec `currentColor` remplacé par un noir opaque, le
 *  damier `none`/`currentColor` du drapeau restant tel quel : `none` reste
 *  transparent, ce qui EST son encre réelle à l'écran) sur un vrai canvas
 *  du navigateur, puis calcule les métriques ci-dessus à partir des pixels
 *  réels (`getImageData`) — pas une valeur déduite du code source SVG. */
async function measureIcon(page: Page, svg: string): Promise<ShapeMetrics> {
  return page.evaluate(async ({ svg, size }) => {
    // `xmlns` est superflu pour un <svg> inline dans du HTML (déjà le cas en
    // usage réel) mais requis pour qu'un document SVG autonome (chargé ici
    // via une URI `data:image/svg+xml`, décodé comme un document XML à part
    // entière) soit valide et se charge dans un <img> — sinon Chromium
    // rejette l'image silencieusement (juste un évènement `error`).
    const colored = svg
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace(/currentColor/g, '#000000');
    const svgB64 = btoa(unescape(encodeURIComponent(colored)));
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + svgB64;
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
  }, { svg, size: SIZE });
}

/** Distance euclidienne dans l'espace des 8 métriques ci-dessus. */
function distance(a: ShapeMetrics, b: ShapeMetrics): number {
  const keys: (keyof ShapeMetrics)[] = ['inkRatio', 'bboxAspect', 'centroidX', 'centroidY', 'q1', 'q2', 'q3', 'q4'];
  let sum = 0;
  for (const k of keys) { const d = a[k] - b[k]; sum += d * d; }
  return Math.sqrt(sum);
}

// Marge minimale exigée entre CHAQUE paire d'icônes. Distances réellement
// mesurées entre les 4 icônes d'origine au moment de l'écriture de ce test
// (pixels réels, 24×24, voir méthode ci-dessus) :
//   trophy↔flag=0.470  trophy↔skull=0.323  trophy↔lock=0.551
//   flag↔skull=0.333   flag↔lock=0.539     skull↔lock=0.276  (la plus proche)
// Seuil fixé à 0.20 : nettement sous le minimum observé (0.276, une marge
// réelle d'environ 30 %), assez haut pour détecter la mutation du critique
// (cadenas au corps quasi circulaire + anse réduite, qui rapproche
// visuellement sa silhouette du crâne — voir mutation testing,
// docs/audit/DECISIONS-H.md §7).
const MIN_DISTANCE = 0.2;

test.describe('Icônes SVG — distinction géométrique réelle mesurée sur les pixels (élément H, round 2, P1-2)', () => {
  test('les 4 icônes ont des métriques de forme mesurées sur les pixels, séparées par une marge réelle', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      const icons = {
        trophy: ICON_TROPHY,
        flag: ICON_FLAG,
        skull: ICON_SKULL,
        lock: ICON_LOCK,
      };
      const metrics: Record<string, ShapeMetrics> = {};
      for (const [name, svg] of Object.entries(icons)) {
        metrics[name] = await measureIcon(page, svg);
      }

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

      // Preuve reproduite dans le rapport de test : chaque paire mesurée,
      // pas seulement la pire — permet à un futur lecteur de voir tout de
      // suite laquelle deux icônes se rapprochent le plus si ce test échoue.
      expect(minPairDistance, `distances mesurées :\n${pairDistances.join('\n')}`).toBeGreaterThanOrEqual(MIN_DISTANCE);
    } finally {
      await server.close();
    }
  });
});
