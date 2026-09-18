// Régénère la liste de précache de sw-st.js à partir de l'arborescence et un hash de version.
// Usage : node scripts/build-sw.mjs          → réécrit sw-st.js si nécessaire
//         node scripts/build-sw.mjs --check  → code de sortie 1 si sw-st.js n'est pas à jour
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SW_PATH = join(ROOT, 'sw-st.js');

/** Dossiers précachés (récursifs) et fichiers racine. */
const DIRS = ['css', 'js', 'assets/fonts', 'assets/icons', 'assets/brand', 'icons'];
const ROOT_FILES = ['index.html', 'manifest-st.json'];
const EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.woff2',
  '.png',
  '.svg',
  '.ico',
  '.webp',
]);

/**
 * Fichiers volontairement hors précache : jamais demandés à l'exécution (les icônes vivent dans
 * `js/ui/icons.js`, la marque est inline). `assertUnreferenced` échoue si l'un d'eux devient référencé,
 * pour que l'exclusion ne puisse pas casser le hors-ligne en silence.
 */
const PRECACHE_EXCLUDE = new Set([
  'assets/brand/logo.svg',
  'assets/brand/logo-mono.svg',
  'assets/icons/sprite.svg',
  'icons/favicon-32.png',
]);

/** Sources inspectées pour vérifier qu'un fichier exclu n'est référencé nulle part. */
const SOURCE_DIRS = ['css', 'js'];
const SOURCE_FILES = ['index.html', 'manifest-st.json'];

const START = '// >>> PRECACHE (généré — ne pas éditer à la main)';
const END = '// <<< PRECACHE';

function walk(dir) {
  const abs = join(ROOT, dir);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const p = join(abs, e.name);
    if (e.isDirectory()) out.push(...walk(relative(ROOT, p)));
    else if (EXTENSIONS.has(e.name.slice(e.name.lastIndexOf('.')).toLowerCase()))
      out.push(relative(ROOT, p));
  }
  return out;
}

/** Lève si un fichier exclu du précache est référencé par le HTML, le CSS, le JS ou le manifeste. */
export function assertUnreferenced(excluded = PRECACHE_EXCLUDE) {
  const sources = [...SOURCE_FILES, ...SOURCE_DIRS.flatMap((d) => walk(d))];
  const haystack = sources
    .map((f) => {
      try {
        return readFileSync(join(ROOT, f), 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
  // Une référence réelle est toujours citée : attribut HTML, `url()` CSS ou littéral JS, avec ou sans
  // préfixe « ./ ». Les simples mentions en commentaire (backticks, parenthèses) ne comptent pas.
  const prefixes = ['"', "'", 'url(', 'url("', "url('"];
  const referenced = [...excluded].filter((f) =>
    [f, `./${f}`].some((path) => prefixes.some((prefix) => haystack.includes(prefix + path))),
  );
  if (referenced.length) {
    throw new Error(
      `Fichiers exclus du précache mais référencés (retirez-les de PRECACHE_EXCLUDE) : ${referenced.join(', ')}`,
    );
  }
}

export function collectFiles() {
  const files = ROOT_FILES.filter((f) => {
    try {
      return statSync(join(ROOT, f)).isFile();
    } catch {
      return false;
    }
  });
  for (const d of DIRS) files.push(...walk(d));
  assertUnreferenced();
  return [...new Set(files)]
    .map((f) => f.split('\\').join('/'))
    .filter((f) => !PRECACHE_EXCLUDE.has(f))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Source de `sw-st.js` privée du bloc PRECACHE généré : c'est la « logique » du service worker.
 * L'exclure du hachage évite le point fixe (le bloc contient la version qu'on est en train de calculer)
 * tout en garantissant que toute modification de comportement du SW change bien la version.
 */
export function swLogicSource(source = readFileSync(SW_PATH, 'utf8')) {
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start < 0 || end < 0) return source;
  return source.slice(0, start) + source.slice(end + END.length);
}

/**
 * Empreinte du contenu servi : tous les fichiers précachés **et** la logique de `sw-st.js` lui-même.
 * Sans ce dernier, une correction portant uniquement sur le service worker laisserait la version
 * inchangée : le nouveau SW s'installerait dans le cache déjà servi par le SW actif.
 */
export function computeVersion(files, swSource) {
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update(readFileSync(join(ROOT, f)));
  }
  h.update('sw-st.js');
  h.update(swLogicSource(swSource));
  return h.digest('hex').slice(0, 8);
}

export function renderBlock(files, version) {
  const list = ['./', ...files.map((f) => `./${f}`)];
  const lines = list.map((u) => `  '${u}',`).join('\n');
  return `${START}\nconst VERSION = '${version}';\nconst PRECACHE = [\n${lines}\n];\n${END}`;
}

export function buildSw(source) {
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start < 0 || end < 0) throw new Error('Marqueurs PRECACHE introuvables dans sw-st.js');
  const files = collectFiles();
  const version = computeVersion(files, source);
  const block = renderBlock(files, version);
  return { next: source.slice(0, start) + block + source.slice(end + END.length), files, version };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes('--check');
  const current = readFileSync(SW_PATH, 'utf8');
  const { next, files, version } = buildSw(current);
  if (next === current) {
    console.log(`sw-st.js à jour (version ${version}, ${files.length} fichiers précachés)`);
  } else if (check) {
    console.error("sw-st.js n'est pas à jour : lancez `npm run build:sw`");
    process.exit(1);
  } else {
    writeFileSync(SW_PATH, next);
    console.log(`sw-st.js régénéré (version ${version}, ${files.length} fichiers précachés)`);
  }
}
