// Libération des ressources GPU/DOM du moteur de dés (CLAUDE.md, note sur les
// contextes WebGL simultanés + brief §mission point 2 : « le code gère-t-il
// proprement la libération des contextes/ressources après chaque rendu »).
// Deux défauts corrigés ici, tous deux vérifiés par un test qui échoue si on
// annule le correctif (mutation testing, voir docs/audit/DECISIONS-C.md) :
//  1. src/dice-ui.ts _disposeSceneResources : renderer.dispose() seul NE libère
//     PAS les géométries/matériaux/textures Three.js (vérifié en lisant
//     node_modules/three : WebGLProperties.dispose() ne fait que remplacer la
//     WeakMap interne, sans jamais appeler gl.deleteBuffer/gl.deleteTexture).
//     Sans disposal explicite, la libération réelle dépendait entièrement de
//     forceContextLoss() (silencieux si WEBGL_lose_context est indisponible) :
//     fuite GPU réelle sur des lancers/aperçus répétés.
//  2. src/dice3d/die.ts _cardBgHex : la sonde DOM temporaire n'était retirée
//     qu'en chemin heureux ; une exception en cours de route (getComputedStyle,
//     regex) laissait un <div> orphelin dans <body> — appelée jusqu'à 10× par
//     dé construit.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { loadAppHtml } from './support/appHtml';
import { _cardBgHex, _numTex } from '../src/dice3d/die';

// src/dice-ui.ts importe src/game.ts (pour adjust/players), qui touche le DOM dès
// son chargement (pavés numériques, drag du modal...) : comme tests/game.*.test.ts,
// il faut que `index.html` soit déjà chargé dans jsdom avant l'import du module.
type DiceUiModule = typeof import('../src/dice-ui');
let _disposeSceneResources: DiceUiModule['_disposeSceneResources'];

beforeAll(async () => {
  loadAppHtml();
  // src/game.ts <-> src/i18n.ts <-> src/dice-ui.ts forment un cycle d'imports ESM
  // (dette d'architecture hors périmètre C, cf. CONSTAT-INITIAL.md point 5) : le
  // MODULE ENTRÉ EN PREMIER détermine dans quel ordre les bindings circulaires
  // s'initialisent. `../src/game` est l'entrée qui fonctionne déjà (tests/game.*
  // l'utilisent) ; l'importer en premier, comme eux, évite un throw pendant
  // l'évaluation ("Cannot access 'currentLang' before initialization") qui
  // survient si `dice-ui` (ou `i18n`) est importé en premier à la place.
  await import('../src/game');
  ({ _disposeSceneResources } = await import('../src/dice-ui'));
});

describe('src/dice-ui.ts — _disposeSceneResources (fuite GPU sur dés reconstruits)', () => {
  it('dispose la géométrie et le matériau de chaque mesh de la scène', () => {
    const scene = new THREE.Scene();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x336699 });
    scene.add(new THREE.Mesh(geo, mat));
    const geoSpy = vi.spyOn(geo, 'dispose');
    const matSpy = vi.spyOn(mat, 'dispose');

    _disposeSceneResources(scene);

    expect(geoSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
  });

  it('dispose une texture NON partagée (ex. points du d6/d3/pièce, régénérés à chaque construction)', () => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(1, 1);
    const tex = new THREE.CanvasTexture(document.createElement('canvas')); // pas de userData.shared
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    scene.add(new THREE.Mesh(geo, mat));
    const texSpy = vi.spyOn(tex, 'dispose');

    _disposeSceneResources(scene);

    expect(texSpy).toHaveBeenCalledTimes(1);
  });

  it("NE dispose JAMAIS une texture marquée `shared` (cache _numTexCache : encore utilisée par d'autres dés vivants)", () => {
    // jsdom n'implémente pas de contexte canvas 2D réel (sans le paquet natif
    // `canvas`, non installé — voir docs/audit/DECISIONS-C.md) : on fournit un
    // faux contexte 2D minimal pour exercer le VRAI _numTex/dieNumTexture (pas
    // une texture reconstituée à la main), fidèle à la production.
    const ctxStub = {
      clearRect: () => {}, fillRect: () => {}, fillText: () => {}, strokeText: () => {},
      measureText: () => ({ width: 40 }),
      font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', textAlign: '', textBaseline: '',
    } as unknown as CanvasRenderingContext2D;
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctxStub);

    const scene = new THREE.Scene();
    const sharedTex = _numTex(7, 0xffffff); // passe par le cache partagé -> userData.shared = true
    getContextSpy.mockRestore();
    expect(sharedTex.userData.shared).toBe(true);
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: sharedTex });
    scene.add(new THREE.Mesh(geo, mat));
    const texSpy = vi.spyOn(sharedTex, 'dispose');

    _disposeSceneResources(scene);

    expect(texSpy).not.toHaveBeenCalled();
  });

  it('dispose aussi la render target de shadow map d\'une lumière (si déjà allouée)', () => {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.castShadow = true;
    // simule une shadow map déjà allouée par un rendu précédent (allocation
    // normalement faite par le renderer lors du premier render())
    const rt = new THREE.WebGLRenderTarget(512, 512);
    light.shadow.map = rt;
    scene.add(light);
    const rtSpy = vi.spyOn(rt, 'dispose');

    _disposeSceneResources(scene);

    expect(rtSpy).toHaveBeenCalledTimes(1);
  });

  it('ne plante pas sur une scène vide ou ne contenant que des objets sans géométrie/matériau (ex. THREE.Group)', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Group());
    expect(() => _disposeSceneResources(scene)).not.toThrow();
  });
});

describe('src/dice3d/die.ts — _cardBgHex (pas de fuite DOM si le calcul échoue en cours de route)', () => {
  it("chemin heureux : ne laisse aucune sonde `.pcard` orpheline dans <body>", () => {
    document.body.innerHTML = '';
    _cardBgHex(3);
    expect(document.body.querySelectorAll('.pcard').length).toBe(0);
  });

  it("chemin en échec (getComputedStyle lève) : la sonde est quand même retirée du DOM (try/finally)", () => {
    document.body.innerHTML = '';
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation(() => {
      throw new Error('boom');
    });
    const result = _cardBgHex(3);
    spy.mockRestore();

    expect(result).toBeNull(); // repli documenté : échec -> null, jamais une exception qui remonte
    expect(document.body.querySelectorAll('.pcard').length).toBe(0);
  });
});
