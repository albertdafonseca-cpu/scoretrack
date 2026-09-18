#!/usr/bin/env node
// Récupère les polices Google utilisées par ScoreTrack et les auto-héberge
// (décision D4 : aucune requête vers fonts.googleapis.com / fonts.gstatic.com
// au runtime). Produit assets/fonts/*.woff2 et css/fonts.css.
//
// Usage : node scripts/fetch-fonts.mjs
// Requiert Node ≥ 18 (fetch natif). En cas d'échec TLS derrière un proxy :
//   NODE_EXTRA_CA_CERTS=/chemin/vers/ca-bundle.crt node scripts/fetch-fonts.mjs

import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS_DIR = join(ROOT, 'assets', 'fonts');
const CSS_OUT = join(ROOT, 'css', 'fonts.css');

// Familles et graisses réellement utilisées par l'app (voir css/themes.css).
const FAMILIES = [
  { name: 'Orbitron', weights: [400, 600, 700, 900] },
  { name: 'Share Tech Mono', weights: [400] },
  { name: 'Inter', weights: [400, 600, 700, 800] },
  { name: 'Press Start 2P', weights: [400] },
  { name: 'Cinzel', weights: [400, 600, 700] },
  { name: 'Bebas Neue', weights: [400] },
];

// Seuls ces sous-ensembles sont conservés (l'UI est en français).
const SUBSETS = new Set(['latin', 'latin-ext']);

// Un UA Chrome récent est nécessaire pour que Google renvoie du woff2 découpé
// par unicode-range (sinon on reçoit du TTF monolithique).
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function cssUrl(family) {
  const fam = family.name.replace(/ /g, '+');
  const w = family.weights.length === 1 && family.weights[0] === 400 ? '' : `:wght@${family.weights.join(';')}`;
  return `https://fonts.googleapis.com/css2?family=${fam}${w}&display=swap`;
}

// Parse les blocs "/* subset */ @font-face { ... }" renvoyés par Google.
function parseFontFaces(css) {
  const out = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const subset = m[1];
    const body = m[2];
    const prop = (k) => {
      const r = new RegExp(`${k}\\s*:\\s*([^;]+);`).exec(body);
      return r ? r[1].trim() : null;
    };
    const src = /url\(([^)]+)\)\s*format\('woff2'\)/.exec(body);
    out.push({
      subset,
      family: prop('font-family')?.replace(/^'|'$/g, ''),
      style: prop('font-style') || 'normal',
      weight: prop('font-weight') || '400',
      unicodeRange: prop('unicode-range'),
      url: src ? src[1].replace(/^['"]|['"]$/g, '') : null,
    });
  }
  return out;
}

async function fetchOk(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res;
}

/* Faces de repli à métriques ajustées (D11), réémises telles quelles : elles portent des mesures
   faites au navigateur, que ce script ne sait pas recalculer. Les remesurer si une police change
   de version (méthode décrite dans le bloc lui-même). */
const FALLBACK_FACES = String.raw`
/* ── Faces de repli à métriques ajustées (décision D11) ─────────────────────────────────────
   Tant que la police auto-hébergée n'est pas peinte, le texte est rendu par une police locale.
   Sans ces faces, la substitution déplace la mise en page : 0,031 de décalage cumulé mesuré sur
   l'écran d'accueil (H1.logo-name, DIV.presets-grid). Chaque face de repli reprend la métrique de
   la police finale — largeur moyenne (size-adjust), hauteurs d'ascendante et de descendante —
   si bien que la substitution ne bouge plus aucun bloc.

   Valeurs MESURÉES dans Chromium (canvas measureText, 100 px, échantillon latin complet) :
   size-adjust = largeur(police) / largeur(repli local) ; ascent/descent-override = métrique de la
   police divisée par size-adjust, la face de repli étant elle-même redimensionnée.

   Chaque face couvre toute la plage de graisses (100 à 1000) : sans cela, un titre en 900 ne la
   sélectionne pas et retombe sur la générique, sans métrique ajustée — le décalage réapparaît.

   | Police          | Repli local     | size-adjust | ascendante | descendante |
   | Orbitron        | Arial           |   125,65 %  |   80,4 %   |   19,1 %    |
   | Share Tech Mono | Courier New     |    89,99 %  |   98,9 %   |   26,7 %    |
   | Inter           | Arial           |   104,66 %  |   92,7 %   |   22,9 %    |
   | Press Start 2P  | Courier New     |   166,64 %  |   60,0 %   |    0,0 %    |
   | Cinzel          | Times New Roman |   118,90 %  |   82,4 %   |   31,1 %    |

   Ces familles sont référencées dans les piles de css/tokens.css et css/themes.css, juste après
   la police finale. Les deux polices du premier rendu du thème par défaut (Orbitron et Share Tech
   Mono) sont en outre préchargées depuis le <head> d'index.html. */

@font-face {
  font-family: 'Orbitron fallback';
  font-style: normal;
  font-weight: 100 1000;
  src:
    local('Arial'),
    local('Helvetica'),
    local('Liberation Sans');
  size-adjust: 125.65%;
  ascent-override: 80.4%;
  descent-override: 19.1%;
  line-gap-override: 0%;
}

@font-face {
  font-family: 'Share Tech Mono fallback';
  font-style: normal;
  font-weight: 100 1000;
  src:
    local('Courier New'),
    local('Liberation Mono');
  size-adjust: 89.99%;
  ascent-override: 98.9%;
  descent-override: 26.7%;
  line-gap-override: 0%;
}

@font-face {
  font-family: 'Inter fallback';
  font-style: normal;
  font-weight: 100 1000;
  src:
    local('Arial'),
    local('Helvetica'),
    local('Liberation Sans');
  size-adjust: 104.66%;
  ascent-override: 92.7%;
  descent-override: 22.9%;
  line-gap-override: 0%;
}

@font-face {
  font-family: 'Press Start 2P fallback';
  font-style: normal;
  font-weight: 100 1000;
  src:
    local('Courier New'),
    local('Liberation Mono');
  size-adjust: 166.64%;
  ascent-override: 60%;
  descent-override: 0%;
  line-gap-override: 0%;
}

@font-face {
  font-family: 'Cinzel fallback';
  font-style: normal;
  font-weight: 100 1000;
  src:
    local('Times New Roman'),
    local('Liberation Serif');
  size-adjust: 118.9%;
  ascent-override: 82.4%;
  descent-override: 31.1%;
  line-gap-override: 0%;
}
`;

async function main() {
  await mkdir(FONTS_DIR, { recursive: true });
  await mkdir(dirname(CSS_OUT), { recursive: true });

  // Nettoyage des anciens woff2 pour éviter les orphelins.
  for (const f of await readdir(FONTS_DIR)) if (f.endsWith('.woff2')) await unlink(join(FONTS_DIR, f));

  const blocks = [];
  const missing = [];
  let totalBytes = 0;

  for (const family of FAMILIES) {
    let faces;
    try {
      const css = await (await fetchOk(cssUrl(family), { headers: { 'User-Agent': UA } })).text();
      faces = parseFontFaces(css).filter((f) => SUBSETS.has(f.subset) && f.url);
    } catch (err) {
      console.error(`ÉCHEC CSS ${family.name}: ${err.message}`);
      missing.push(family.name);
      continue;
    }
    if (!faces.length) {
      console.error(`Aucun @font-face woff2 latin/latin-ext pour ${family.name}`);
      missing.push(family.name);
      continue;
    }
    // Orbitron, Inter et Cinzel sont des polices variables : Google renvoie le
    // MÊME fichier pour chaque graisse demandée. On regroupe par URL pour ne
    // télécharger le fichier qu'une fois et déclarer une plage de graisses.
    const byUrl = new Map();
    for (const face of faces) {
      const key = `${face.subset}|${face.url}`;
      const g = byUrl.get(key) || { ...face, weights: [] };
      g.weights.push(Number(face.weight));
      byUrl.set(key, g);
    }

    for (const face of byUrl.values()) {
      const min = Math.min(...face.weights);
      const max = Math.max(...face.weights);
      const weightLabel = min === max ? String(min) : `${min}-${max}`;
      const weightDecl = min === max ? String(min) : `${min} ${max}`;
      const file = `${slug(family.name)}-${weightLabel}-${face.subset}.woff2`;
      try {
        const buf = Buffer.from(await (await fetchOk(face.url)).arrayBuffer());
        if (buf.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error('signature wOF2 absente');
        await writeFile(join(FONTS_DIR, file), buf);
        totalBytes += buf.length;
        console.log(`OK  ${file.padEnd(40)} ${(buf.length / 1024).toFixed(1).padStart(6)} Ko  ← ${face.url}`);
      } catch (err) {
        console.error(`ÉCHEC ${file}: ${err.message}`);
        missing.push(`${family.name} ${weightLabel} ${face.subset}`);
        continue;
      }
      blocks.push(
        `/* ${face.family} ${weightDecl} — ${face.subset}\n   source : ${face.url} */\n` +
          `@font-face {\n` +
          `  font-family: '${face.family}';\n` +
          `  font-style: ${face.style};\n` +
          `  font-weight: ${weightDecl};\n` +
          `  font-display: swap;\n` +
          `  src: url('../assets/fonts/${file}') format('woff2');\n` +
          `  unicode-range: ${face.unicodeRange};\n` +
          `}`,
      );
    }
  }

  const header =
    `/* Polices auto-hébergées — GÉNÉRÉ par scripts/fetch-fonts.mjs, ne pas éditer à la main.\n` +
    `   Source : Google Fonts (SIL Open Font License 1.1, voir assets/fonts/LICENSES.md).\n` +
    `   Sous-ensembles : latin, latin-ext. */\n\n`;
  await writeFile(CSS_OUT, header + blocks.join('\n\n') + '\n' + FALLBACK_FACES + '\n');

  console.log(`\n${blocks.length} fichiers, ${(totalBytes / 1024).toFixed(0)} Ko au total → ${CSS_OUT}`);
  if (missing.length) {
    console.error(`\nMANQUANT : ${missing.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
