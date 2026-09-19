// Garde-fou D5.3 : aucune couleur littérale hors des feuilles de jetons.
//
// Toute couleur de l'application doit être un jeton défini dans css/tokens.css ou css/themes.css.
// Une valeur écrite en dur ailleurs échappe aux thèmes et à l'audit de contraste : elle reste
// identique sur les 14 thèmes, donc elle finit forcément par être illisible sur l'un d'eux.
//
// Ce script échoue sur toute NOUVELLE occurrence. Les occurrences déjà présentes le jour de sa mise
// en place sont listées nommément dans BASELINE, avec leur propriétaire : ce n'est pas une
// tolérance silencieuse (D17) mais une dette inscrite, que ce fichier rend impossible à agrandir et
// que chaque propriétaire résorbe en retirant sa ligne d'ici.
//
// Usage : node scripts/lint-tokens.mjs [--list]
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const LIST = process.argv.includes('--list');

/** Feuilles autorisées à porter des couleurs littérales : ce sont elles qui définissent les jetons. */
const TOKEN_SHEETS = new Set(['css/tokens.css', 'css/themes.css']);
/** Feuilles dont la couleur vient d'ailleurs (polices auto-hébergées : aucune couleur). */
const IGNORED = new Set(['css/fonts.css']);

/**
 * Dette existante au jour de la mise en place, par fichier et par propriétaire.
 * Le compte est un plafond : il ne peut que baisser.
 */
const BASELINE = {
  'css/system.css': {
    max: 10,
    owner: 'E',
    why: 'valeurs de repli du thème par défaut, lues avant le chargement des jetons',
  },
  'css/game.css': { max: 11, owner: 'A', why: 'voiles et ombres en rgb(0 0 0 / …) et white' },
  'css/setup.css': { max: 6, owner: 'C', why: 'ombres en rgba() et deux #000' },
  'css/modals.css': { max: 4, owner: 'A', why: 'voiles en white' },
  'css/base.css': { max: 1, owner: 'C', why: 'ombre en rgb(0 0 0 / …)' },
  'css/motion.css': { max: 0, owner: 'A', why: '' },
};

/** Couleurs littérales : hexadécimal, rgb()/rgba(), hsl()/hsla(), et mots-clés courants. */
const COLOR =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\b(?:white|black|red|lime|blue|yellow|magenta|cyan)\b/g;

/**
 * Retire commentaires, chaînes et `url(...)` — une couleur dans un SVG encodé n'est pas une règle
 * CSS — en CONSERVANT les retours à la ligne, sans quoi les numéros signalés désigneraient d'autres
 * lignes que les fautives.
 */
function strip(css) {
  const keepLines = (m) => m.replace(/[^\n]/g, ' ');
  return (
    css
      .replace(/\/\*[\s\S]*?\*\//g, keepLines)
      // Les NOMS de propriétés personnalisées sont effacés (`var(--red)` est un usage de jeton, pas
      // une couleur littérale) ; les VALEURS de repli, elles, restent visibles et comptent.
      .replace(/--[\w-]+/g, keepLines)
      .replace(/url\((?:[^()]|\([^()]*\))*\)/g, keepLines)
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, keepLines)
  );
}

const files = readdirSync(join(ROOT, 'css'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => `css/${f}`)
  .filter((f) => !TOKEN_SHEETS.has(f) && !IGNORED.has(f))
  .sort();

let failed = false;
const report = [];
for (const rel of files) {
  const src = strip(readFileSync(join(ROOT, rel), 'utf8'));
  const hits = [];
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(COLOR)) hits.push({ line: i + 1, text: m[0] });
  });
  const budget = BASELINE[rel];
  const max = budget ? budget.max : 0;
  const status = hits.length > max ? 'ÉCHEC' : hits.length < max ? 'dette réduite' : 'stable';
  if (hits.length > max) failed = true;
  report.push({ rel, count: hits.length, max, status, owner: budget?.owner ?? '—', hits });
}

for (const r of report) {
  if (r.count === 0 && r.max === 0) continue;
  console.log(
    `${r.rel.padEnd(18)} ${String(r.count).padStart(2)} littérale(s) / plafond ${r.max} · ${r.owner} · ${r.status}`,
  );
  if (LIST || r.count > r.max) {
    for (const h of r.hits) console.log(`    ${r.rel}:${h.line}  ${h.text}`);
  }
}

const total = report.reduce((n, r) => n + r.count, 0);
const ceiling = report.reduce((n, r) => n + r.max, 0);
console.log(
  `${files.length} feuilles hors jetons : ${total} couleur(s) littérale(s) pour un plafond de ${ceiling}.` +
    (failed ? ' Une feuille dépasse son plafond.' : ' Aucun dépassement.'),
);
if (total < ceiling) {
  console.log(
    'Dette réduite : abaissez le plafond correspondant dans BASELINE pour que le gain soit acquis.',
  );
}
process.exit(failed ? 1 : 0);
