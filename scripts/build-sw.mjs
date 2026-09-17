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

export function collectFiles() {
  const files = ROOT_FILES.filter((f) => {
    try {
      return statSync(join(ROOT, f)).isFile();
    } catch {
      return false;
    }
  });
  for (const d of DIRS) files.push(...walk(d));
  return [...new Set(files)]
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((f) => f.split('\\').join('/'));
}

export function computeVersion(files) {
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update(readFileSync(join(ROOT, f)));
  }
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
  const version = computeVersion(files);
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
