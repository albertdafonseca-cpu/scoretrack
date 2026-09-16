#!/usr/bin/env node
// Génère les icônes PNG de l'app à partir de assets/brand/logo.svg via Playwright
// (Chromium). Un seul SVG source ; chaque variante ajuste le rayon du fond et
// l'échelle du pictogramme.
//
// Usage : node scripts/build-icons.mjs
// Playwright : résolu depuis node_modules, sinon depuis l'installation globale
// (PLAYWRIGHT_MODULE=/chemin/vers/playwright pour forcer).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SVG_PATH = join(ROOT, 'assets', 'brand', 'logo.svg');

// rx : rayon d'arrondi du fond en fraction du côté (0 = carré plein, coins droits).
// scale : échelle du pictogramme (1 = tel quel ; 0.9 pour la zone de sécurité maskable).
// transparent : coins transparents (sinon fond opaque jusqu'aux bords).
const VARIANTS = [
  { out: 'icons/icon-192.png', size: 192, rx: 0.22, scale: 1, transparent: true },
  { out: 'icons/icon-512.png', size: 512, rx: 0.22, scale: 1, transparent: true },
  { out: 'icons/maskable-512.png', size: 512, rx: 0, scale: 0.9, transparent: false },
  { out: 'icons/apple-touch-icon.png', size: 180, rx: 0, scale: 1, transparent: false },
  { out: 'icons/favicon-32.png', size: 32, rx: 0.22, scale: 1, transparent: true },
  // Ancien chemin référencé par les installations existantes (manifest historique).
  { out: 'favicon.png', size: 192, rx: 0.22, scale: 1, transparent: true },
];

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs'].filter(
    Boolean,
  );
  for (const c of candidates) {
    try {
      return await import(c);
    } catch {
      /* essai suivant */
    }
  }
  throw new Error('Playwright introuvable (npm i -D playwright ou PLAYWRIGHT_MODULE=...)');
}

async function main() {
  const svg = await readFile(SVG_PATH, 'utf8');
  const { chromium } = await loadPlaywright();
  const browser = await chromium
    .launch()
    .catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome' }));
  const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });

  for (const v of VARIANTS) {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;background:transparent}
        #icon{width:${v.size}px;height:${v.size}px;display:block}
        #icon svg{width:100%;height:100%;display:block}
      </style></head><body><div id="icon">${svg}</div></body></html>`,
    );
    await page.evaluate(
      ({ rx, scale }) => {
        document.getElementById('bg').setAttribute('rx', String(512 * rx));
        const t = (512 * (1 - scale)) / 2;
        document.getElementById('mark').setAttribute('transform', `translate(${t} ${t}) scale(${scale})`);
      },
      { rx: v.rx, scale: v.scale },
    );
    const outPath = join(ROOT, v.out);
    await mkdir(dirname(outPath), { recursive: true });
    const buf = await page.locator('#icon').screenshot({ type: 'png', omitBackground: v.transparent });
    await writeFile(outPath, buf);
    console.log(`OK  ${v.out.padEnd(28)} ${v.size}×${v.size}  ${(buf.length / 1024).toFixed(1)} Ko`);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
