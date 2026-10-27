#!/usr/bin/env node
// Construit les sites ScoreTrack à partir du dépôt commun.
//   node tools/build.mjs              → toutes les variantes, dans dist/<variante>/
//   node tools/build.mjs light        → une seule variante
//   node tools/build.mjs --vercel     → la variante du projet Vercel, dans site/
// Une variante décrite par variants/<nom>.json est assemblée depuis src/ :
//   - fichiers statiques recopiés depuis son dossier « static » ;
//   - index.html = src/index.html, où chaque ligne « @include chemin » est remplacée par src/chemin
//     et chaque {{JETON}} par sa valeur dans « tokens » ;
//   - les lignes entre « @if drapeau » (ou « @if !drapeau ») et « @endif » ne sont gardées que si
//     le drapeau de « flags » est vrai (ou faux). Pas d'imbrication.
// Sans fichier de variante (test, jusqu'à l'étape 5), apps/<nom>/ est recopié tel quel.
import { cpSync, rmSync, readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Publiables sur Vercel ; « pro » est la future page de Test produite depuis src/ (étape 4)
const VARIANTS = ['light', 'test', 'pro'];
const DEPLOYABLE = ['light', 'test'];

// Sur Vercel : SCORETRACK_VARIANT (réglé dans le projet), sinon light.
// Garde-fou : un projet dont le domaine contient « test » ne publie jamais autre chose que Test.
function vercelVariant() {
  const v = process.env.SCORETRACK_VARIANT || 'light';
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL || '';
  if (!DEPLOYABLE.includes(v)) throw new Error(`SCORETRACK_VARIANT inconnue : ${v}`);
  if (/scoretrack-test/.test(domain) && v !== 'test') {
    throw new Error(`Le projet ${domain} doit définir SCORETRACK_VARIANT=test`);
  }
  return v;
}

// Remplace chaque ligne « @include chemin » par le fichier src/chemin (qui finit par un saut de ligne)
function render(file, def, seen = []) {
  if (seen.includes(file)) throw new Error(`Inclusion circulaire : ${[...seen, file].join(' → ')}`);
  const text = conditionals(readFileSync(join(ROOT, 'src', file), 'utf8'), def.flags || {}, file);
  return text.replace(/^@include (\S+)\n/gm, (_, inc) => render(fill(inc, def.tokens, file), def, [...seen, file]));
}

function conditionals(text, flags, where) {
  return text.replace(/^@if (!?)(\w+)\n([\s\S]*?)^@endif\n/gm, (_, not, flag, body) => {
    if (!(flag in flags)) throw new Error(`Drapeau inconnu « ${flag} » dans ${where}`);
    if (/^@if /m.test(body)) throw new Error(`@if imbriqué dans ${where}`);
    return Boolean(flags[flag]) !== (not === '!') ? body : '';
  });
}

// Remplace les {{JETON}} ; un jeton inconnu fait échouer le build
function fill(text, tokens, where) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in tokens)) throw new Error(`Jeton inconnu {{${k}}} dans ${where}`);
    return tokens[k];
  });
}

function copyStatic(src, out) {
  if (!existsSync(src)) throw new Error(`Dossier absent : ${src.slice(ROOT.length + 1)}`);
  rmSync(out, { recursive: true, force: true });
  // Les fichiers cachés (.hintrc…) servent au développement, pas au site
  cpSync(src, out, { recursive: true, filter: (p) => !p.slice(src.length).split('/').some((s) => s.startsWith('.')) });
}

function build(variant, out) {
  const def = join(ROOT, 'variants', `${variant}.json`);
  if (existsSync(def)) {
    const spec = JSON.parse(readFileSync(def, 'utf8'));
    copyStatic(join(ROOT, spec.static), out);
    const html = fill(render('index.html', spec), spec.tokens, 'index.html');
    if (/^@(if|endif|include)\b/m.test(html)) throw new Error(`Directive non traitée dans ${variant}/index.html`);
    writeFileSync(join(out, 'index.html'), html);
  } else {
    copyStatic(join(ROOT, 'apps', variant), out);
  }
  console.log(`${variant} → ${out.slice(ROOT.length + 1)} (${readdirSync(out).length} entrées)`);
}

const args = process.argv.slice(2);
if (args.includes('--vercel')) {
  build(vercelVariant(), join(ROOT, 'site'));
} else {
  const list = args.length ? args : VARIANTS;
  for (const v of list) {
    if (!VARIANTS.includes(v)) throw new Error(`Variante inconnue : ${v}`);
    build(v, join(ROOT, 'dist', v));
  }
}
