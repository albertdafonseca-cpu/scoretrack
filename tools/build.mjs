#!/usr/bin/env node
// Construit les sites ScoreTrack à partir du dépôt commun.
//   node tools/build.mjs              → toutes les variantes, dans dist/<variante>/
//   node tools/build.mjs light        → une seule variante
//   node tools/build.mjs --vercel     → la variante du projet Vercel, dans site/
// Étape 1 du plan : simple copie de apps/<variante>/ (sortie identique à l'octet près).
import { cpSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VARIANTS = ['light', 'test'];

// Sur Vercel : SCORETRACK_VARIANT (réglé dans le projet), sinon light.
// Garde-fou : un projet dont le domaine contient « test » ne publie jamais autre chose que Test.
function vercelVariant() {
  const v = process.env.SCORETRACK_VARIANT || 'light';
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL || '';
  if (!VARIANTS.includes(v)) throw new Error(`SCORETRACK_VARIANT inconnue : ${v}`);
  if (/scoretrack-test/.test(domain) && v !== 'test') {
    throw new Error(`Le projet ${domain} doit définir SCORETRACK_VARIANT=test`);
  }
  return v;
}

function build(variant, out) {
  const src = join(ROOT, 'apps', variant);
  if (!existsSync(src)) throw new Error(`Variante absente : apps/${variant}`);
  rmSync(out, { recursive: true, force: true });
  // Les fichiers cachés (.hintrc…) servent au développement, pas au site
  cpSync(src, out, { recursive: true, filter: (p) => !p.slice(src.length).split('/').some((s) => s.startsWith('.')) });
  console.log(`${variant} → ${out.slice(ROOT.length + 1)} (${readdirSync(out).length} entrées)`);
}

const args = process.argv.slice(2);
if (args.includes('--vercel')) {
  build(vercelVariant(), join(ROOT, 'site'));
} else {
  const list = args.length ? args : VARIANTS;
  for (const v of list) build(v, join(ROOT, 'dist', v));
}
