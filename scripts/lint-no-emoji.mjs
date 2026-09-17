// Lint anti-emoji : échoue si un emoji (propriété Unicode Extended_Pictographic, sélecteurs de
// variante, ZWJ, drapeaux, modificateurs de peau) subsiste dans index.html, js/**/*.js ou
// css/**/*.css hors commentaires.
//
// Exceptions (remplacées à l'exécution par js/ui/icons.js → hydrateIcons) :
//   - HTML : l'emoji est l'unique contenu d'un <span class="icon" data-icon="…">…</span> ;
//   - JS   : glyphe de secours passé en second argument à icon('nom', '…').
// Les glyphes typographiques hors sous-ensembles de polices (flèches U+2190–21FF, ⌫, ▶, ✕, ✓,
// signes pleine chasse ＋ －) sont signalés en avertissement ; `--strict` les rend bloquants.
//
// Usage : node scripts/lint-no-emoji.mjs [--strict]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STRICT = process.argv.includes('--strict');

const EMOJI = new RegExp(
  '\\p{Extended_Pictographic}|\\uFE0F|\\u200D|\\u20E3|[\\u{1F1E6}-\\u{1F1FF}]|[\\u{1F3FB}-\\u{1F3FF}]',
  'u',
);
const GLYPH = new RegExp(
  '[\\u2190-\\u21FF\\u2300-\\u23FF\\u25A0-\\u25FF\\u2700-\\u27BF\\uFF01-\\uFF60]',
  'u',
);

const ALLOWED_HTML =
  /<span\b[^>]*\bclass="[^"]*\bicon\b[^"]*"[^>]*\bdata-icon="[^"]+"[^>]*>[^<]*<\/span>/g;
const ALLOWED_JS = /\bicon\(\s*(['"])[\w-]+\1\s*,\s*(['"])[^'"]*\2\s*\)/g;

function walk(dir, ext) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (ext.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

/** Remplace le contenu des commentaires par des espaces (positions conservées). */
function blankComments(src, kind) {
  const chars = [...src];
  const blank = (from, to) => {
    for (let i = from; i < to; i++) if (chars[i] !== '\n') chars[i] = ' ';
  };
  if (kind === 'html') {
    let i = 0;
    while ((i = src.indexOf('<!--', i)) >= 0) {
      const end = src.indexOf('-->', i + 4);
      const stop = end < 0 ? src.length : end + 3;
      blank(i, stop);
      i = stop;
    }
    return chars.join('');
  }
  let i = 0;
  let quote = null;
  while (i < chars.length) {
    const c = chars[i];
    const n = chars[i + 1];
    if (quote) {
      if (c === '\\') i += 2;
      else {
        if (c === quote) quote = null;
        i++;
      }
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? chars.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (kind === 'js' && c === '/' && n === '/') {
      let j = i;
      while (j < chars.length && chars[j] !== '\n') j++;
      blank(i, j);
      i = j;
    } else {
      if (kind === 'js' && (c === '"' || c === "'" || c === '`')) quote = c;
      i++;
    }
  }
  return chars.join('');
}

/** Efface les occurrences autorisées (mêmes longueurs) pour ne pas les compter. */
function blankAllowed(src, re) {
  return src.replace(re, (m) => m.replace(/[^\n]/gu, ' '));
}

function scan(file) {
  const rel = relative(ROOT, file);
  const kind = rel.endsWith('.html') ? 'html' : rel.endsWith('.css') ? 'css' : 'js';
  let text = blankComments(readFileSync(file, 'utf8'), kind);
  if (kind === 'html') text = blankAllowed(text, ALLOWED_HTML);
  if (kind === 'js') text = blankAllowed(text, ALLOWED_JS);
  const findings = [];
  text.split('\n').forEach((line, li) => {
    for (const ch of [...line]) {
      const cp = ch.codePointAt(0);
      const isEmoji = EMOJI.test(ch);
      const isGlyph = !isEmoji && GLYPH.test(ch);
      if (!isEmoji && !isGlyph) continue;
      findings.push({
        file: rel,
        line: li + 1,
        char: ch,
        code: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
        fatal: isEmoji || STRICT,
        context: line.trim().slice(0, 80),
      });
    }
  });
  return findings;
}

const files = [
  join(ROOT, 'index.html'),
  ...walk(join(ROOT, 'js'), ['.js']),
  ...walk(join(ROOT, 'css'), ['.css']),
].filter((f) => {
  try {
    return statSync(f).isFile();
  } catch {
    return false;
  }
});

const all = files.flatMap(scan);
const fatal = all.filter((f) => f.fatal);
const warn = all.filter((f) => !f.fatal);
for (const f of all) {
  const tag = f.fatal ? 'EMOJI' : 'glyphe';
  console.log(
    `${f.fatal ? 'ERREUR' : 'avert.'} ${f.file}:${f.line} ${tag} ${f.char} (${f.code}) — ${f.context}`,
  );
}
console.log(
  `${files.length} fichiers analysés : ${fatal.length} emoji(s) hors exception, ${warn.length} glyphe(s) typographique(s) à migrer vers une icône SVG.`,
);
process.exit(fatal.length ? 1 : 0);
