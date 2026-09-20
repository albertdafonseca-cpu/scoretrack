// @vitest-environment node
// (esbuild.build() est incompatible avec le TextEncoder de jsdom, environnement
// par défaut de ce dépôt — voir vitest.config.ts — d'où l'environnement Node
// natif pour ce seul fichier, qui n'a de toute façon pas besoin du DOM.)
//
// Élément E/F — service worker : preuve qu'aucune requête vers un serveur
// tiers ne part à l'installation (voir docs/audit/DECISIONS-E.md §2 et le
// round 1 des critiques F/E : un bloc mort `FONT_CSS_URLS`/`FONT_HOSTS`
// contactait réellement fonts.googleapis.com à chaque installation du
// service worker, sans qu'aucun test ni qu'aucune écoute réseau Playwright
// ne le détecte — Playwright ne voit pas les fetch émis depuis un service
// worker. Deux angles de test, comme pour recap-pdf.test.ts :
// 1. Inspection de source anti-régression : aucune référence à un hôte tiers
//    connu ne doit réapparaître dans src/sw-worker.ts.
// 2. Exécution réelle du code compilé (celui qui tourne vraiment en
//    production) dans un bac à sable minimal simulant l'API service worker,
//    avec un espion sur `fetch` qui échoue si une URL absolue (donc
//    potentiellement tierce) est demandée à l'installation.
import * as esbuild from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const swSource = readFileSync(
  path.resolve(import.meta.dirname, '..', 'src', 'sw-worker.ts'),
  'utf8'
);

const THIRD_PARTY_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

describe('src/sw-worker.ts — aucun serveur tiers contacté, regression source', () => {
  it("ne référence aucun hôte tiers connu (Google Fonts, cdnjs)", () => {
    for (const host of THIRD_PARTY_HOSTS) {
      expect(swSource).not.toContain(host);
    }
  });

  it("ne contient plus de précache/branche fetch dédiée à un hôte externe", () => {
    expect(swSource).not.toMatch(/FONT_HOSTS|FONT_CSS_URLS|FONTS_CACHE/);
  });
});

describe('dist/sw.js compilé — exécution réelle, aucune requête tierce à l\'installation', () => {
  let tmpDir: string;
  let outfile: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'st-sw-test-'));
    outfile = path.join(tmpDir, 'sw.js');
    // Compile le vrai fichier source (pas dist/sw.js, qui peut être absent ou
    // périmé dans l'environnement de test) avec la même chaîne que build.mjs.
    await esbuild.build({
      entryPoints: [path.resolve(import.meta.dirname, '..', 'src', 'sw-worker.ts')],
      bundle: true,
      format: 'iife',
      outfile,
      define: { __APP_VERSION__: '"test"' },
    });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("l'installation ne demande aucune URL absolue vers un hôte tiers", async () => {
    const requestedUrls: string[] = [];
    const listeners: Record<string, (e: unknown) => void> = {};

    const fakeCache = { put: async () => {}, match: async () => undefined };
    const fakeCaches = { open: async () => fakeCache, keys: async () => [], delete: async () => true };

    const fakeSelf = {
      addEventListener: (type: string, cb: (e: unknown) => void) => { listeners[type] = cb; },
      skipWaiting: async () => {},
      clients: { claim: async () => {}, matchAll: async () => [] },
    };

    const fakeFetch = async (input: unknown) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      requestedUrls.push(url);
      // Chemins relatifs de l'app (STATIC) : simule une réponse absente
      // (comme sur un premier build sans dist/ construit), le précache
      // tolérant doit s'en accommoder sans lever d'exception.
      return { ok: false } as Response;
    };

    const compiled = readFileSync(outfile, 'utf8');
    const sandbox = {
      self: fakeSelf,
      caches: fakeCaches,
      fetch: fakeFetch,
      Response: class { constructor(public body?: unknown, public init?: unknown) {} },
      Request: class { constructor(public url: string) {} },
      URL: globalThis.URL,
      console,
    };
    const fn = new Function(...Object.keys(sandbox), compiled);
    fn(...Object.values(sandbox));

    expect(typeof listeners.install).toBe('function');
    await listeners.install({ waitUntil: (p: Promise<unknown>) => p });

    expect(requestedUrls.length).toBeGreaterThan(0); // le précache a bien tourné
    for (const url of requestedUrls) {
      for (const host of THIRD_PARTY_HOSTS) {
        expect(url).not.toContain(host);
      }
      // Toute URL absolue (http/https) serait suspecte : seuls des chemins
      // relatifs à dist/ (./..., pas de schéma) sont attendus.
      expect(url).not.toMatch(/^https?:\/\//);
    }
  });
});
