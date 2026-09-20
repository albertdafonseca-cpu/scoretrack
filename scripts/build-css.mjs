// Génère les deux feuilles servies par index.html à partir des neuf feuilles sources de css/ :
//   css/critical.css  — ce qu'il faut pour peindre le premier écran (polices, jetons, thèmes, base,
//                       accueil), chargée en bloquant ;
//   css/deferred.css  — le reste (jeu, modales, mouvement, couche système), chargée après la
//                       première trame par js/start.js.
// Les sources restent la vérité et gardent leurs propriétaires ; ces deux fichiers sont des
// artefacts, minifiés (commentaires et blancs retirés), à régénérer par `npm run build:css` et
// vérifiés par `npm run check:css` (code 1 s'ils ne correspondent plus aux sources).
// La sortie est reproductible à l'octet : même entrée, même ordre, aucune date ni aléa — deux
// générations sur le même arbre produisent des fichiers identiques, ce que `--check` compare.
// Les deux fichiers sont servis : ils font partie du paquet publié (`npm run build:dist` copie
// css/ tel quel) et du précache du service worker (`scripts/build-sw.mjs` parcourt css/ ; les
// neuf sources y restent aussi tant qu'elles ne sont pas exclues, voir PRECACHE_EXCLUDE).
//
// Pourquoi : mesuré avec Lighthouse (profil mobile, réseau et processeur ralentis), neuf feuilles
// bloquantes de 111 Ko coûtaient 2,1 à 2,5 s de premier rendu et 2,6 à 3,3 s d'affichage du plus
// grand élément ; une feuille critique de 45 Ko et le reste différé ramènent le premier rendu à
// 1,4–1,8 s et le plus grand élément à 1,8–2,0 s, sans décalage de mise en page.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Ordre de cascade des sources : celui d'index.html avant la fusion. */
export const CRITICAL_SOURCES = [
  'css/fonts.css',
  'css/tokens.css',
  'css/themes.css',
  'css/base.css',
  'css/setup.css',
];
export const DEFERRED_SOURCES = [
  'css/game.css',
  'css/modals.css',
  'css/motion.css',
  'css/system.css',
];
export const OUTPUTS = {
  'css/critical.css': CRITICAL_SOURCES,
  'css/deferred.css': DEFERRED_SOURCES,
};

/** Minification prudente : commentaires, blancs et points-virgules finaux ; jamais les chaînes ni les url(). */
export function minify(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch) j += css[j] === '\\' ? 2 : 1;
      out.push(css.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (css.startsWith('url(', i)) {
      const end = css.indexOf(')', i);
      out.push(css.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    out.push(ch);
    i += 1;
  }
  return (
    out
      .join('')
      .replace(/\s+/g, ' ')
      // Jamais autour de « + », « - », « * » ni « / » : dans calc(), l'espace fait partie de la syntaxe
      // (`calc(32px+env(...))` est invalide et fait tomber la règle entière — mesuré : neuf tests de
      // bout en bout rouges sur la mise en page, la barre et la bulle de delta).
      .replace(/\s*([{};,>])\s*/g, '$1')
      // Jamais autour de « : » non plus : dans un sélecteur, `.a :is(.b)` (descendant) et `.a:is(.b)`
      // ne désignent pas le même élément — mesuré : les règles `[data-theme='ldm-day'] :is(...)` de
      // themes.css s'appliquaient à la racine au lieu des textes, et un test de contraste de A tombait.
      // Juste après « ( » et juste avant « ) » : jamais significatif (l'espace AVANT « ( » l'est :
      // `and (` dans une requête média).
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/;}/g, '}')
      .trim()
  );
}

export function build(name) {
  const sources = OUTPUTS[name];
  const body = sources.map((f) => minify(readFileSync(join(ROOT, f), 'utf8'))).join('\n');
  return `/* Généré par scripts/build-css.mjs à partir de ${sources.join(', ')} — ne pas éditer : npm run build:css */\n${body}\n`;
}

/** Contenu du fichier, ou null s'il n'existe pas encore. */
function readOrNull(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

const check = process.argv.includes('--check');
let stale = 0;
for (const name of Object.keys(OUTPUTS)) {
  const next = build(name);
  const current = readOrNull(join(ROOT, name));
  if (check) {
    if (current !== next) {
      stale += 1;
      console.error(`${name} n'est pas à jour par rapport à ses sources (npm run build:css)`);
    } else {
      console.log(`${name} à jour (${Buffer.byteLength(next)} octets)`);
    }
  } else {
    writeFileSync(join(ROOT, name), next);
    console.log(
      `${name} régénéré (${Buffer.byteLength(next)} octets depuis ${OUTPUTS[name].length} sources)`,
    );
  }
}
if (check && stale) process.exit(1);
