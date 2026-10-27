#!/usr/bin/env node
// Construit les sites ScoreTrack à partir du dépôt commun.
//   node tools/build.mjs              → toutes les variantes, dans dist/<variante>/
//   node tools/build.mjs light        → une seule variante
//   node tools/build.mjs --vercel     → la variante du projet Vercel, dans site/
// Chaque variante, décrite par variants/<nom>.json, est assemblée depuis src/ :
//   - fichiers statiques recopiés depuis son dossier « static » ;
//   - index.html = src/index.html, où chaque ligne « @include chemin » est remplacée par src/chemin
//     et chaque {{JETON}} par sa valeur dans « tokens » ;
//   - les lignes entre « @if drapeau » (ou « @if !drapeau ») et « @endif » ne sont gardées que si
//     le drapeau de « flags » est vrai (ou faux). Pas d'imbrication ;
//   - sw.js = src/sw.js, avec {{VERSION}} (empreinte du contenu publié) et {{PRECACHE}} (fichiers
//     publiés, hors robots.txt, sitemap.xml et image de partage). {{VERSION}} vaut aussi dans la page.
import { cpSync, rmSync, readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VARIANTS = ['light', 'pro', 'test'];

// Sur Vercel : SCORETRACK_VARIANT (réglé dans le projet), sinon light.
// Garde-fou : le domaine de production d'un projet impose sa variante ; en cas d'écart le build
// échoue et la version en ligne reste inchangée.
const DOMAIN_VARIANT = [[/^scoretrack\.newgames\.app$/, 'pro'], [/^scoretrack-light\./, 'light'], [/^scoretrack-test\./, 'test']];
function vercelVariant() {
  const v = process.env.SCORETRACK_VARIANT || 'light';
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL || '';
  if (!VARIANTS.includes(v)) throw new Error(`SCORETRACK_VARIANT inconnue : ${v}`);
  const expected = DOMAIN_VARIANT.find(([re]) => re.test(domain))?.[1];
  if (expected && v !== expected) throw new Error(`Le projet ${domain} doit définir SCORETRACK_VARIANT=${expected}`);
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

// Fichiers publiés (chemins relatifs, séparateur /), triés pour un résultat stable
function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => relative(dir, join(d.parentPath ?? d.path, d.name)).split(sep).join('/'))
    .sort();
}

// Inutiles hors ligne : lus par les robots et les aperçus de partage seulement
const NOT_CACHED = new Set(['sw.js', 'robots.txt', 'sitemap.xml', 'icons/og-image.png']);
const VERSION_MARK = '\u0000VERSION\u0000'; // remplacé une fois l'empreinte calculée

function build(variant, out) {
  const spec = JSON.parse(readFileSync(join(ROOT, 'variants', `${variant}.json`), 'utf8'));
  copyStatic(join(ROOT, spec.static), out);
  const tokens = { ...spec.tokens, VERSION: VERSION_MARK };
  const html = fill(render('index.html', spec), tokens, 'index.html');
  if (/^@(if|endif|include)\b/m.test(html)) throw new Error(`Directive non traitée dans ${variant}/index.html`);
  writeFileSync(join(out, 'index.html'), html);

  // Empreinte = contenu de tous les fichiers publiés + modèle du service worker
  const swSrc = readFileSync(join(ROOT, 'src', 'sw.js'), 'utf8');
  const files = listFiles(out).filter((f) => f !== 'sw.js');
  const h = createHash('sha256').update(swSrc);
  for (const f of files) h.update(f + '\0').update(readFileSync(join(out, f))).update('\0');
  const version = h.digest('hex').slice(0, 10);

  writeFileSync(join(out, 'index.html'), html.split(VERSION_MARK).join(version));
  const precache = ['./', ...files.filter((f) => !NOT_CACHED.has(f)).map((f) => './' + f)];
  const list = '[\n' + precache.map((u) => `  ${JSON.stringify(u).replace(/^"|"$/g, "'")},`).join('\n') + '\n]';
  writeFileSync(join(out, 'sw.js'), fill(swSrc, { ...spec.tokens, VERSION: version, PRECACHE: list }, 'sw.js'));
  console.log(`${variant} → ${out.slice(ROOT.length + 1)} (version ${version}, ${precache.length} fichiers en cache)`);
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
