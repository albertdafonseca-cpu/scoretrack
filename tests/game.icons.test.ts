// Élément H (round 4, post-clôture) — remplacement des émojis système
// utilisés comme icônes fonctionnelles (🏆 victoire, 🏁 fin de manche /
// dernier perdant, 💀 élimination, 🔒 confidentialité — P1 #7 du constat
// initial) par de vraies icônes SVG inline (voir src/ui-icons.ts).
//
// Ces tests couvrent le CÂBLAGE réel dans `src/game.ts` (buildCard,
// showRecap, showWinnerModal, la surveillance de l'icône cadenas) : que la
// bonne icône apparaisse dans le bon état, pas seulement que
// `src/ui-icons.ts` sache produire les 4 SVG (couvert séparément par
// tests/ui-icons.test.ts). Import via `tests/support/loadGame.{js,d.ts}`,
// comme tests/game.injection.test.ts (voir ce fichier pour l'explication du
// contournement du conflit de types `tsconfig.test.json`, docs/audit/
// DECISIONS-B.md §4).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAppHtml } from './support/appHtml';
import { loadGame } from './support/loadGame';
import type { GameTestFacade } from './support/loadGame';
import { ICON_FLAG, ICON_LOCK, ICON_SKULL, ICON_TROPHY } from '../src/ui-icons';

let game: GameTestFacade;

/** Attend un tour de microtâches : `MutationObserver` (utilisé par
 *  `initFunctionalIcons`, voir src/game.ts) livre ses callbacks de façon
 *  asynchrone (microtâche), jamais synchronement pendant la mutation. */
function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** Normalise un fragment SVG en le faisant passer par LE MÊME moteur DOM
 *  (jsdom, ici) que celui qui a produit le HTML observé : jsdom (comme un
 *  vrai navigateur) re-sérialise les balises vides `<rect/>` en
 *  `<rect></rect>` à la lecture d'`innerHTML`, ce qui casserait une
 *  comparaison à la chaîne TypeScript brute même quand le contenu réel est
 *  identique (même piège que dans `e2e/functional-icons.spec.ts`, où la
 *  normalisation est refaite côté navigateur pour la même raison). */
function normalize(svg: string): string {
  const div = document.createElement('div');
  div.innerHTML = svg;
  return div.innerHTML;
}

describe('src/game.ts — icônes fonctionnelles SVG (élément H, P1 #7)', () => {
  beforeAll(async () => {
    loadAppHtml();
    game = await loadGame();
  });

  beforeEach(() => {
    game.players.length = 0;
    game.history.length = 0;
  });

  describe('buildCard — tuiles victoire/élimination', () => {
    it('joueur éliminé : `.elim-tag .elim-icon` contient EXACTEMENT ICON_SKULL', () => {
      game.players.push({ playerName: 'Alice', score: 0, eliminated: true, finalScore: 0, elimRank: 1 });
      const card = game.buildCard(0, 'rot-0');
      const iconEl = card.querySelector('.elim-tag .elim-icon');
      expect(iconEl).not.toBeNull();
      expect(iconEl!.innerHTML).toBe(normalize(ICON_SKULL));
    });

    it("joueur vainqueur (mode finisher par défaut, aucun objectif configuré) : `.win-tag .win-icon` contient ICON_FLAG", () => {
      // Sans `applyPreset`/`selectObjectif`, `elimPoints`/`singleWinner`/
      // `lastLoser` restent à leurs valeurs par défaut (aucun mode
      // "champion unique" actif) : `isChampCard` est donc `false` dans
      // `buildCard` -> branche « finisher » (drapeau). La branche « champion »
      // (trophée) est couverte directement via `showWinnerModal(true)`
      // ci-dessous, qui prend le booléen en paramètre explicite plutôt que
      // de dépendre d'un état de partie global à reconstruire.
      game.players.push({ playerName: 'Bob', score: 40, eliminated: false, winner: true, winRank: 1, finalScore: 40 });
      const card = game.buildCard(0, 'rot-0');
      const iconEl = card.querySelector('.win-tag .win-icon');
      expect(iconEl).not.toBeNull();
      expect(iconEl!.innerHTML).toBe(normalize(ICON_FLAG));
    });

    it('mutation testing : un crâne à la place du drapeau sur la tuile vainqueur serait détecté', () => {
      // Preuve que le test ci-dessus ne peut pas structurellement réussir
      // par accident : si `buildCard` utilisait par erreur ICON_SKULL pour
      // la tuile vainqueur (confusion victoire/élimination), l'assertion
      // stricte `toBe(ICON_FLAG)` échouerait.
      game.players.push({ playerName: 'Bob', score: 40, eliminated: false, winner: true, winRank: 1, finalScore: 40 });
      const card = game.buildCard(0, 'rot-0');
      const iconEl = card.querySelector('.win-tag .win-icon');
      expect(iconEl!.innerHTML).not.toBe(normalize(ICON_SKULL));
    });
  });

  describe('showWinnerModal — #winner-icon selon le rôle', () => {
    it('showWinnerModal(true) (champion) : #winner-icon = ICON_TROPHY', () => {
      game.showWinnerModal(true);
      const el = document.getElementById('winner-icon')!;
      expect(el.innerHTML).toBe(normalize(ICON_TROPHY));
    });
    it('showWinnerModal(false) (finisher / dernier perdant) : #winner-icon = ICON_FLAG', () => {
      game.showWinnerModal(false);
      const el = document.getElementById('winner-icon')!;
      expect(el.innerHTML).toBe(normalize(ICON_FLAG));
    });
    it('les deux appels successifs remplacent bien le contenu précédent (pas d\'empilement)', () => {
      game.showWinnerModal(true);
      game.showWinnerModal(false);
      const el = document.getElementById('winner-icon')!;
      expect(el.innerHTML).toBe(normalize(ICON_FLAG));
      expect(el.querySelectorAll('svg').length).toBe(1);
    });
  });

  describe('showRecap — badge de statut', () => {
    it('joueur éliminé : le badge `.recap-status.elim` contient ICON_SKULL', () => {
      game.players.push({ playerName: 'Carol', score: 0, eliminated: true, finalScore: 0, elimRank: 1 });
      game.showRecap();
      const badge = document.querySelector('#recap-body .recap-status.elim');
      expect(badge).not.toBeNull();
      expect(badge!.innerHTML).toContain(normalize(ICON_SKULL));
    });

    it('joueur vainqueur : le badge `.recap-status.win` contient une icône de victoire (trophée ou drapeau), jamais le crâne', () => {
      game.players.push({ playerName: 'Dan', score: 40, eliminated: false, winner: true, winRank: 1, finalScore: 40 });
      game.showRecap();
      const badge = document.querySelector('#recap-body .recap-status.win');
      expect(badge).not.toBeNull();
      const html = badge!.innerHTML;
      const hasVictoryIcon = html.includes(normalize(ICON_TROPHY)) || html.includes(normalize(ICON_FLAG));
      expect(hasVictoryIcon).toBe(true);
      expect(html).not.toContain(normalize(ICON_SKULL));
    });
  });

  describe('confidentialité — icône cadenas auto-réparée (MutationObserver, hors périmètre i18n.ts)', () => {
    // Depuis le nettoyage de l'émoji à la source (docs/audit/DECISIONS-H.md
    // §17.1, les 18 langues de translations.ts ne préfixent plus le texte),
    // `_fixLockIcon` pose l'icône de façon INCONDITIONNELLE — elle ne dépend
    // plus de la présence d'un émoji à détecter et retirer.
    it('un texte simple (sans émoji, cas réel depuis le nettoyage des traductions) reçoit l\'icône dès la surveillance posée', () => {
      const btn = document.getElementById('btn-privacy-txt')!;
      btn.textContent = 'Politique de test';
      game.initFunctionalIcons();
      expect(btn.innerHTML).toContain('<svg class="ui-icon"');
      expect(btn.innerHTML).toContain(normalize(ICON_LOCK));
      expect(btn.textContent).toBe(' Politique de test');
    });

    it('un éventuel préfixe émoji résiduel (garde défensive, aucune source connue n\'en produit plus) est retiré au passage', () => {
      const btn = document.getElementById('btn-privacy-txt')!;
      btn.textContent = '\u{1F512} Politique de test';
      game.initFunctionalIcons();
      expect(btn.innerHTML).toContain('<svg class="ui-icon"');
      expect(btn.innerHTML).toContain(normalize(ICON_LOCK));
      expect(btn.textContent).toBe(' Politique de test');
    });

    it("un texte réinjecté APRÈS coup (simulant un futur appel d'i18n.ts hors périmètre) reçoit l'icône via le MutationObserver", async () => {
      const title = document.getElementById('privacy-title-txt')!;
      title.textContent = 'Confidentialité';
      game.initFunctionalIcons();
      expect(title.innerHTML).toContain('<svg class="ui-icon"');

      // `_setText('privacy-title-txt', t('privacyTitle'))` (src/i18n.ts, hors
      // périmètre) fait `el.textContent = 'Confidentialité'` à chaque
      // changement de langue (écrase l'icône posée) — on simule exactement
      // cet effet de bord ici.
      title.textContent = 'Confidentialité';
      await flushMicrotasks();
      expect(title.innerHTML).toContain('<svg class="ui-icon"');
      expect(title.innerHTML).toContain(normalize(ICON_LOCK));
      expect(title.textContent).toBe(' Confidentialité');
    });

    it('idempotence : deux appels successifs sur un élément déjà réparé n\'empilent pas les icônes', () => {
      const el = document.createElement('div');
      el.textContent = 'Texte quelconque';
      game._fixLockIcon(el);
      game._fixLockIcon(el);
      expect(el.querySelectorAll('svg').length).toBe(1);
    });

    it("mutation testing : la garde `el.querySelector('svg.ui-icon')` rend bien l'appel sans effet une fois l'icône posée", () => {
      // Sans cette garde, le MutationObserver de production (qui observe
      // childList/subtree/characterData) se re-déclencherait indéfiniment :
      // `el.innerHTML=...` pose l'icône -> ce changement DOM notifie
      // l'observateur -> il rappelle `_fixLockIcon` -> qui recompose et
      // réaffecte `innerHTML` (nouvelle instance de nœuds, même contenu) ->
      // nouvelle notification -> boucle. Preuve directe, sans reproduire la
      // boucle elle-même (jamais souhaitable dans une suite de tests) : une
      // fois l'icône posée, un second appel ne modifie plus RIEN, pas même
      // les nœuds DOM eux-mêmes (comparaison par référence du nœud `<svg>`).
      const el = document.createElement('div');
      el.textContent = 'Texte quelconque';
      game._fixLockIcon(el);
      const svgBefore = el.querySelector('svg.ui-icon');
      const htmlBefore = el.innerHTML;
      game._fixLockIcon(el);
      expect(el.querySelector('svg.ui-icon')).toBe(svgBefore); // même nœud, jamais recréé
      expect(el.innerHTML).toBe(htmlBefore);
    });
  });
});
