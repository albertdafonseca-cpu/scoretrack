// Correctif de l'injection HTML par nom de joueur (P0 du constat initial,
// docs/audit/CONSTAT-INITIAL.md, ex-`game.ts:510`). Un nom de joueur est une
// donnée utilisateur arbitraire : il ne doit jamais produire de balise active
// ni casser la structure du DOM lorsqu'il est affiché (carte joueur, tuile
// d'élimination/victoire, chip de profil, récapitulatif).
//
// Ces tests importent le VRAI `src/game.ts` (voir tests/support/appHtml.ts et
// tests/support/loadGame.{js,d.ts} — ce dernier explique pourquoi le
// chargement passe par une petite façade plutôt qu'un `import` direct) et
// appellent ses fonctions exportées réelles — ils échouent si le correctif est
// annulé (vérifié par mutation testing, voir docs/audit/DECISIONS-B.md).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAppHtml } from './support/appHtml';
import { loadGame } from './support/loadGame';
import type { GameTestFacade } from './support/loadGame';

let game: GameTestFacade;

// Charges utiles couvrant les 4 vecteurs cités dans le brief : balise active,
// double quote (casse un attribut HTML délimité par des guillemets doubles),
// simple quote, et fermeture prématurée d'une balise existante.
const EVIL_NAME = '<script>window.__pwned=true</script><img src=x onerror="window.__pwned2=true">"\'</span>';

describe('src/game.ts — neutralisation du nom de joueur (P0 injection HTML)', () => {
  beforeAll(async () => {
    loadAppHtml();
    game = await loadGame();
  });

  beforeEach(() => {
    // Repartir d'un état de jeu propre à chaque test (players/history sont des
    // tableaux exportés `let` : on ne peut pas réassigner le binding importé,
    // mais on peut le vider/le remplir en place).
    game.players.length = 0;
    game.history.length = 0;
    (window as unknown as { __pwned?: boolean }).__pwned = undefined;
    (window as unknown as { __pwned2?: boolean }).__pwned2 = undefined;
  });

  it("buildCard (joueur en jeu) : le nom s'affiche tel quel en texte, jamais comme balise active", () => {
    game.players.push({ playerName: EVIL_NAME, score: 12, eliminated: false });
    const card = game.buildCard(0, 'rot-0');

    // Aucune balise <script>/<img> réellement créée dans le DOM.
    expect(card.querySelectorAll('script').length).toBe(0);
    expect(card.querySelectorAll('img').length).toBe(0);
    // Le nom reste lisible tel quel en tant que texte (pas de perte de fidélité).
    const nameEl = card.querySelector('.pplayer');
    expect(nameEl).not.toBeNull();
    expect(nameEl!.textContent).toBe(EVIL_NAME);
    // La structure de la carte n'est pas cassée par un </span> injecté : les
    // éléments attendus de la zone de tap sont toujours tous présents.
    expect(card.querySelectorAll('.tap-zone').length).toBe(1);
    expect(card.querySelector('.score-wrap')).not.toBeNull();
  });

  it('buildCard (joueur éliminé) : le nom de la tuile "éliminé" est neutralisé', () => {
    game.players.push({ playerName: EVIL_NAME, score: 0, eliminated: true, finalScore: 0, elimRank: 1 });
    const card = game.buildCard(0, 'rot-0');

    expect(card.querySelectorAll('script').length).toBe(0);
    expect(card.querySelectorAll('img').length).toBe(0);
    const nameEl = card.querySelector('.elim-tag .elim-name');
    expect(nameEl).not.toBeNull();
    expect(nameEl!.textContent).toBe(EVIL_NAME);
  });

  it('buildCard (joueur vainqueur) : le nom de la tuile "vainqueur" est neutralisé', () => {
    game.players.push({ playerName: EVIL_NAME, score: 40, eliminated: false, winner: true, winRank: 1, finalScore: 40 });
    const card = game.buildCard(0, 'rot-0');

    expect(card.querySelectorAll('script').length).toBe(0);
    expect(card.querySelectorAll('img').length).toBe(0);
    const nameEl = card.querySelector('.win-tag .elim-name');
    expect(nameEl).not.toBeNull();
    expect(nameEl!.textContent).toBe(EVIL_NAME);
  });

  it('renderProfileChips : le nom du profil est affiché en texte, sans onclick construit par interpolation', () => {
    localStorage.setItem('scoretrack_profiles', JSON.stringify([EVIL_NAME]));
    game.renderProfileChips();

    const list = document.getElementById('profiles-list')!;
    expect(list.querySelectorAll('script').length).toBe(0);
    expect(list.querySelectorAll('img').length).toBe(0);
    // Aucun attribut onclick construit à partir du nom (mécanisme remplacé par
    // un vrai addEventListener — voir docs/audit/DECISIONS-B.md).
    const del = list.querySelector('.profile-chip-del') as HTMLElement | null;
    expect(del).not.toBeNull();
    expect(del!.getAttribute('onclick')).toBeNull();
    expect(list.textContent).toContain(EVIL_NAME);
  });

  it('renderProfileChips : le bouton de suppression fonctionne malgré le nom piégé (pas de casse fonctionnelle)', () => {
    localStorage.setItem('scoretrack_profiles', JSON.stringify([EVIL_NAME, 'Alice']));
    game.renderProfileChips();
    const del = document.querySelector('#profiles-list .profile-chip-del') as HTMLElement;
    del.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const remaining = JSON.parse(localStorage.getItem('scoretrack_profiles') || '[]');
    expect(remaining).toEqual(['Alice']);
  });

  it("showRecap : le nom d'un joueur dans le récapitulatif est neutralisé", () => {
    game.players.push({ playerName: EVIL_NAME, score: 40, eliminated: false });
    game.history.push({ playerIdx: 0, who: EVIL_NAME, entries: [{ delta: 5 }], open: false, rank: 1 });
    game.showRecap();

    const body = document.getElementById('recap-body')!;
    expect(body.querySelectorAll('script').length).toBe(0);
    expect(body.querySelectorAll('img').length).toBe(0);
    const nameEl = body.querySelector('.recap-player-name');
    expect(nameEl).not.toBeNull();
    expect(nameEl!.textContent).toBe(EVIL_NAME);
  });

  it("aucune charge n'a réussi à s'exécuter (garde-fou global)", () => {
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    expect((window as unknown as { __pwned2?: boolean }).__pwned2).toBeUndefined();
  });
});
