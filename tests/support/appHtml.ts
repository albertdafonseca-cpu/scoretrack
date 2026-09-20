// Fixture DOM pour les tests de src/game.ts (périmètre élément B).
//
// `src/game.ts` accède au DOM dès son chargement (plusieurs IIFE au niveau
// module : construction des pavés numériques, drag du modal de score, tiroir
// de la barre du bas, puis `loadSettings()`...). Pour importer le module sans
// qu'il lève une exception, jsdom doit donc déjà contenir tous les ids qu'il
// référence. Plutôt que de dupliquer à la main une liste de dizaines d'ids —
// qui se périmerait silencieusement au premier changement d'`index.html`, hors
// du périmètre de cet agent (élément D) — cette fixture charge le VRAI
// `index.html` du dépôt : c'est la garantie la plus robuste que tous les ids
// utilisés par `game.ts` existent bien.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const INDEX_HTML_PATH = path.resolve(__dirname, '../../index.html');

/** Remplace le contenu du `document` jsdom courant par celui du vrai `index.html`. */
export function loadAppHtml(): void {
  const raw = readFileSync(INDEX_HTML_PATH, 'utf8');
  // On ne garde que le contenu de <html>...</html> (doctype/balise <html> retirés) :
  // assigner à `documentElement.innerHTML` s'occupe de répartir <head>/<body>.
  const inner = raw
    .replace(/^[\s\S]*?<html[^>]*>/i, '')
    .replace(/<\/html>[\s\S]*$/i, '');
  document.documentElement.innerHTML = inner;
}
