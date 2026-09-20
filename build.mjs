// Build : src/main.ts -> dist/app.js (bundle IIFE minifié, source map), puis copie
// d'index.html dans dist/ avec le script pointé sur ./app.js : dist/ est le site
// statique déployable tel quel (Vercel : outputDirectory = dist). La racine du dépôt
// reste ouvrable directement (index.html y référence dist/app.js).
// Usage : node build.mjs [--watch]
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
// version de l'app = <meta name="app-version"> d'index.html (injectée dans le worker)
const appVersion = (readFileSync('index.html', 'utf8').match(/name="app-version"\s+content="([^"]*)"/) || [])[1] || '0';

const copyHtmlPlugin = {
  name: 'copy-html',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      mkdirSync('dist', { recursive: true });
      const html = readFileSync('index.html', 'utf8').replace('src="dist/app.js"', 'src="app.js"');
      writeFileSync('dist/index.html', html);
    });
  },
};

const common = {
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'info',
};
const options = {
  ...common,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/app.js',
  sourcemap: true,
  plugins: [copyHtmlPlugin],
};
// service worker : fichier séparé (un worker depuis une URL blob: est refusé)
const swOptions = {
  ...common,
  entryPoints: ['src/sw-worker.ts'],
  outfile: 'dist/sw.js',
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
};
if (watch) {
  const ctx = await esbuild.context(options);
  const ctxSw = await esbuild.context(swOptions);
  await Promise.all([ctx.watch(), ctxSw.watch()]);
} else {
  // Les deux cibles (app.js et sw.js) sont indépendantes : on les construit
  // toutes les deux même si l'une échoue (Promise.allSettled), pour rapporter
  // en un seul passage TOUTES les erreurs plutôt que de s'arrêter à la
  // première rencontrée. Si au moins une cible échoue, on l'annonce
  // explicitement et on sort avec un code non nul (process.exit(1)) : un
  // build.mjs qui laisserait passer un code de sortie 0 après un échec
  // masquerait silencieusement une régression auprès de Vercel (qui ne
  // bloquerait alors pas le déploiement) et de quiconque enchaîne ce script
  // sans lire sa sortie (ex. `npm run build && npm run deploy`).
  const targets = [
    { label: 'src/main.ts -> dist/app.js', promise: esbuild.build(options) },
    { label: 'src/sw-worker.ts -> dist/sw.js', promise: esbuild.build(swOptions) },
  ];
  const results = await Promise.allSettled(targets.map((t) => t.promise));
  const failures = results
    .map((result, i) => ({ result, label: targets[i].label }))
    .filter(({ result }) => result.status === 'rejected');
  if (failures.length) {
    for (const { result, label } of failures) {
      console.error(`\n✘ Échec du build (${label}) :`);
      console.error(result.reason?.message ?? result.reason);
    }
    console.error(`\n${failures.length}/${targets.length} cible(s) de build en échec — dist/ n'est pas fiable, arrêt (code 1).`);
    process.exit(1);
  }
}
