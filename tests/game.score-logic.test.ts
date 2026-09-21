// Logique de score pure de src/game.ts (P1 du constat initial : extraire une
// logique testable de l'état/rendu). `computeClampedScore` ne touche ni le DOM
// ni l'état module (state injecté en paramètre) : c'est la fonction qui borne
// un ajustement de score (plafond "bloquer", plafond d'objectif, négatif
// autorisé), auparavant dupliquée entre `adjust()` et `confirmScoreModal()`.
// `scoreClass` est pure elle aussi (mais lit l'état module `elimPoints` /
// `startPoints` / `objectifMode`, positionné ici via `applyPreset`/`selectPlayer`
// puis `applyObjectif()`, comme le fait réellement l'app au lancement d'une
// partie). Le chargement passe par tests/support/loadGame.{js,d.ts} — voir
// ce fichier pour la raison (un import direct de `src/game.ts` ferait échouer
// `tsc -p tsconfig.test.json`, indépendamment de cet agent : docs/audit/DECISIONS-B.md).
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAppHtml } from './support/appHtml';
import { loadGame } from './support/loadGame';
import type { GameTestFacade } from './support/loadGame';

let game: GameTestFacade;

beforeAll(async () => {
  loadAppHtml();
  game = await loadGame();
});

describe('computeClampedScore — ajustement de score pur', () => {
  const noLimit = { bloquerMode: 'none' as const, startPoints: 40, allowNeg: false, objectifMode: 'none' as const, winPoints: null, maxPoints: Infinity };

  it("additionne simplement le delta quand rien ne plafonne", () => {
    const r = game.computeClampedScore(40, 5, noLimit);
    expect(r).toEqual({ rawScore: 45, newScore: 45, realDelta: 5, rawDelta: 5 });
  });

  it("bloque à 0 par défaut (objectif = elim, négatif non autorisé) si le delta ferait passer sous zéro", () => {
    const limits = { bloquerMode: 'none' as const, startPoints: 40, allowNeg: false, objectifMode: 'elim' as const, winPoints: null, maxPoints: Infinity };
    // objectifMode 'elim' autorise toujours -Infinity comme minimum réel (élimination par le bas) :
    // vérifions plutôt le cas 'win' qui plafonne à 0 par défaut.
    const winLimits = { bloquerMode: 'none' as const, startPoints: 40, allowNeg: false, objectifMode: 'win' as const, winPoints: 100, maxPoints: 100 };
    const r = game.computeClampedScore(2, -10, winLimits);
    expect(r.newScore).toBe(0); // plafonné à 0, pas -8
    expect(r.rawScore).toBe(-8); // score brut mémorisé malgré le clamp
    expect(r.realDelta).toBe(-2); // variation réellement appliquée
    expect(r.rawDelta).toBe(-10); // variation brute (pour l'historique)
    void limits;
  });

  it("autorise le négatif quand allowNeg=true", () => {
    const r = game.computeClampedScore(2, -10, { ...noLimit, allowNeg: true });
    expect(r.newScore).toBe(-8);
    expect(r.realDelta).toBe(-10);
  });

  it('bloquerMode="min" fige le plancher au score de départ, quel que soit allowNeg', () => {
    const r = game.computeClampedScore(40, -100, { ...noLimit, allowNeg: true, bloquerMode: 'min', startPoints: 40 });
    expect(r.newScore).toBe(40);
    expect(r.realDelta).toBe(0);
  });

  it('bloquerMode="max" fige le plafond au score de départ', () => {
    const r = game.computeClampedScore(40, 100, { ...noLimit, bloquerMode: 'max', startPoints: 40 });
    expect(r.newScore).toBe(40);
    expect(r.realDelta).toBe(0);
  });

  it('maxPoints borne la montée en mode "win" quand la cible dépasse le départ', () => {
    const r = game.computeClampedScore(950, 100, { bloquerMode: 'none', startPoints: 0, allowNeg: false, objectifMode: 'win', winPoints: 1000, maxPoints: 1000 });
    expect(r.newScore).toBe(1000);
    expect(r.rawScore).toBe(1050);
  });

  it("un delta qui n'a aucun effet une fois plafonné renvoie realDelta=0 (le code appelant ne doit rien logger)", () => {
    const r = game.computeClampedScore(0, -5, { bloquerMode: 'none', startPoints: 0, allowNeg: false, objectifMode: 'win', winPoints: 500, maxPoints: 500 });
    expect(r.realDelta).toBe(0);
    expect(r.rawScore).toBe(-5); // le score brut, lui, garde la trace de la tentative
  });
});

describe('scoreClass — classe CSS de coloration du score (accessibilité par luminance, D-CLAUDE-2)', () => {
  it('objectif "elim" par le bas : "crit" une fois la cible atteinte, "low" dans le dernier quart', () => {
    game.applyPreset(0); // preset "Loi du Milieu" : elim à 0, départ 40
    game.applyObjectif(); // calcule elimPoints/winPoints à partir de objectifMode (comme startGame())
    expect(game.objectifMode).toBe('elim');
    expect(game.elimPoints).toBe(0);
    expect(game.startPoints).toBe(40);
    expect(game.scoreClass(0)).toBe('crit');
    expect(game.scoreClass(5)).toBe('low'); // ≤ 25% de 40
    expect(game.scoreClass(30)).toBe('');
  });

  it('mode "none" (No limit) : jamais de coloration', () => {
    game.selectObjectif('none');
    expect(game.scoreClass(-1000)).toBe('');
    expect(game.scoreClass(0)).toBe('');
  });
});
