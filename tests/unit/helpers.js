// Outils partagés par les tests unitaires : générateur pseudo-aléatoire à graine fixe, gabarits.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Générateur mulberry32 : suite reproductible de nombres dans [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entier dans [min, max] tiré avec `next`. */
export const randInt = (next, min, max) => min + Math.floor(next() * (max - min + 1));

/** Texte brut d'un gabarit de sauvegarde (tel qu'écrit dans localStorage par l'ancienne app). */
export function fixtureText(name) {
  return readFileSync(join(here, 'fixtures', `${name}.json`), 'utf8').trim();
}

/** Gabarit parsé. */
export const fixture = (name) => JSON.parse(fixtureText(name));

/** Liste des identifiants 0..n-1. */
export const identity = (n) => Array.from({ length: n }, (_, i) => i);

/** Joueurs de test. */
export const makePlayers = (scores, names = []) =>
  scores.map((score, i) => ({ playerName: names[i] || `J${i + 1}`, score, eliminated: false }));
