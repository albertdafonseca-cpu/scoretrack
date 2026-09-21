// Élément H, round 2 (docs/audit/H-critique-round1.md, P1-1) — l'association
// icône <-> statut dans `src/recap-pdf.ts` (trophée pour un vainqueur, crâne
// pour un éliminé) n'était couverte par AUCUN des 113 tests unitaires ni des
// 35 tests e2e du round 1 : une inversion complète des deux icônes
// (`drawTrophyIcon`/`drawSkullIcon` échangées dans le `if/else` de
// `exportRecapPDF`) passait toute la suite sans un seul échec, démontré par
// le critique indépendant.
//
// Deux niveaux de couverture, chacun catchant une classe de mutation
// différente :
// 1. `statusIconKind` — fonction pure extraite du `if/else` inline,
//    testée directement, sans jsPDF ni DOM. Catche une inversion DANS
//    cette fonction (ex. `if(p.winner) return 'skull'`).
// 2. Un vrai `exportRecapPDF()` exécuté, avec les méthodes `circle`/
//    `triangle` de l'instance jsPDF réellement construite espionnées (voir
//    `spyOnJsPdfDrawing` ci-dessous) : catche une inversion dans le
//    DISPATCH (`if(iconKind==='trophy'){...drawSkullIcon...}`), exactement
//    la mutation reproduite par le critique — indépendamment de ce que fait
//    `statusIconKind` en interne.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as jspdfModule from 'jspdf';
import { loadAppHtml } from './support/appHtml';
import { loadGame } from './support/loadGame';
import type { GameTestFacade } from './support/loadGame';
import { loadRecapPdf } from './support/loadRecapPdf';
import type { RecapPdfTestFacade } from './support/loadRecapPdf';

let game: GameTestFacade;
let recapPdf: RecapPdfTestFacade;

/** Remplace temporairement le constructeur `jsPDF` exporté par le module
 *  `jspdf` par une version qui construit un VRAI document (comportement
 *  inchangé) mais espionne au passage ses méthodes `circle`/`triangle` —
 *  les deux seules primitives de dessin utilisées par `drawTrophyIcon`
 *  (1 `triangle`, 0 `circle`) et `drawSkullIcon` (1 `triangle`, 3 `circle`)
 *  dans tout `src/recap-pdf.ts` (vérifié par lecture du fichier : aucun
 *  autre appel à `doc.circle`/`doc.triangle` ailleurs). Un compte de
 *  `circle` à 0 vs >0 distingue donc sans ambiguïté laquelle des deux
 *  fonctions a réellement dessiné, peu importe l'implémentation interne de
 *  `statusIconKind`/du dispatch. Retourne les deux espions + une fonction
 *  de restauration. */
function spyOnJsPdfDrawing() {
  const RealJsPDF = jspdfModule.jsPDF;
  const circleCalls: unknown[][] = [];
  const triangleCalls: unknown[][] = [];
  const ctorSpy = vi.spyOn(jspdfModule, 'jsPDF').mockImplementation(function (
    ...args: ConstructorParameters<typeof RealJsPDF>
  ) {
    const doc = new RealJsPDF(...args);
    const origCircle = doc.circle.bind(doc);
    doc.circle = ((...a: Parameters<typeof origCircle>) => { circleCalls.push(a); return origCircle(...a); }) as typeof doc.circle;
    const origTriangle = doc.triangle.bind(doc);
    doc.triangle = ((...a: Parameters<typeof origTriangle>) => { triangleCalls.push(a); return origTriangle(...a); }) as typeof doc.triangle;
    // `exportRecapPDF()` termine par `doc.save(filename)` : sous Node (pas un
    // vrai navigateur), jsPDF retombe sur une écriture disque réelle plutôt
    // que le téléchargement navigateur habituel — neutralisé ici (on ne
    // s'intéresse qu'aux appels de dessin ci-dessus, jamais au fichier).
    doc.save = (() => doc) as typeof doc.save;
    return doc;
  } as unknown as typeof RealJsPDF);
  return {
    circleCalls, triangleCalls,
    restore: () => ctorSpy.mockRestore(),
  };
}

describe('src/recap-pdf.ts — export PDF réel, icône vraiment dessinée selon le statut', () => {
  beforeAll(async () => {
    loadAppHtml();
    game = await loadGame();
    recapPdf = await loadRecapPdf();
  });

  beforeEach(() => {
    game.players.length = 0;
    game.history.length = 0;
  });

  it("statusIconKind : vainqueur -> 'trophy', éliminé -> 'skull', ni l'un ni l'autre -> null", () => {
    expect(recapPdf.statusIconKind({ winner: true })).toBe('trophy');
    expect(recapPdf.statusIconKind({ eliminated: true })).toBe('skull');
    expect(recapPdf.statusIconKind({})).toBeNull();
    // Un joueur ne peut normalement pas être les deux à la fois, mais la
    // fonction doit rester déterministe (priorité au trophée) plutôt que
    // de planter ou de renvoyer une valeur incohérente.
    expect(recapPdf.statusIconKind({ winner: true, eliminated: true })).toBe('trophy');
  });

  it('joueur vainqueur : le PDF dessine le trophée (1 triangle, 0 cercle) — jamais le crâne', () => {
    game.players.push({ playerName: 'Alice', score: 40, eliminated: false, winner: true, winRank: 1, finalScore: 40 });
    const spy = spyOnJsPdfDrawing();
    try {
      recapPdf.exportRecapPDF();
      expect(spy.circleCalls.length).toBe(0);
      expect(spy.triangleCalls.length).toBe(1);
    } finally {
      spy.restore();
    }
  });

  it('joueur éliminé : le PDF dessine le crâne (3 cercles : tête + 2 orbites, 1 triangle : le nez)', () => {
    game.players.push({ playerName: 'Bob', score: 0, eliminated: true, elimRank: 1, finalScore: 0 });
    const spy = spyOnJsPdfDrawing();
    try {
      recapPdf.exportRecapPDF();
      expect(spy.circleCalls.length).toBe(3);
      expect(spy.triangleCalls.length).toBe(1);
    } finally {
      spy.restore();
    }
  });

  it('un joueur vainqueur ET un joueur éliminé sur le même PDF : 3 cercles au total (le trophée n\'en ajoute aucun)', () => {
    // Preuve directe de non-confusion entre les deux lignes du tableau :
    // si les icônes étaient inversées (mutation du critique), ce total
    // resterait identique (3 cercles, 2 triangles) — c'est pourquoi les
    // deux tests précédents, un statut à la fois, sont ceux qui détectent
    // réellement une inversion (voir mutation testing ci-dessous) ; celui-ci
    // vérifie seulement l'absence d'interférence entre lignes.
    game.players.push({ playerName: 'Alice', score: 40, eliminated: false, winner: true, winRank: 1, finalScore: 40 });
    game.players.push({ playerName: 'Bob', score: 0, eliminated: true, elimRank: 1, finalScore: 0 });
    const spy = spyOnJsPdfDrawing();
    try {
      recapPdf.exportRecapPDF();
      expect(spy.circleCalls.length).toBe(3);
      expect(spy.triangleCalls.length).toBe(2);
    } finally {
      spy.restore();
    }
  });

  it('joueur ni vainqueur ni éliminé : aucune icône dessinée (0 cercle, 0 triangle)', () => {
    game.players.push({ playerName: 'Carol', score: 12, eliminated: false, winner: false });
    const spy = spyOnJsPdfDrawing();
    try {
      recapPdf.exportRecapPDF();
      expect(spy.circleCalls.length).toBe(0);
      expect(spy.triangleCalls.length).toBe(0);
    } finally {
      spy.restore();
    }
  });
});
