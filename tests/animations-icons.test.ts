// Élément H, round 3 (docs/audit/H-critique-round2.md, périmètre étendu à
// deux points précis de src/animations.ts, voir docs/audit/BRIEF.md §9) :
// inspection de source anti-régression, à l'image de
// tests/recap-pdf.test.ts (élément E) pour la même famille de garantie
// (« ce mécanisme ne doit plus jamais réapparaître dans le code source »).
//
// Ne remplace pas la vérification comportementale réelle (canvas, timing,
// absence d'erreur JS) faite par e2e/anim-vectors.spec.ts : ce fichier
// protège spécifiquement contre une réintroduction du texte source
// incriminé (l'émoji lui-même, ou le mécanisme de détection retiré), ce
// qu'un test e2e comportemental ne détecterait pas forcément (le rendu
// vectoriel pourrait coexister avec un `fillText` mort mais toujours
// présent dans le fichier, par exemple).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const animationsSource = readFileSync(
  path.resolve(import.meta.dirname, '..', 'src', 'animations.ts'),
  'utf8'
);

// Émojis reconstruits par point de code (comme dans src/game.ts) : ne pas
// réintroduire de caractère émoji littéral dans CE fichier de test non plus,
// pour rester cohérent avec la convention établie au round 1.
const SKULL_EMOJI = String.fromCodePoint(0x2620); // ☠
const RACE_CAR_EMOJI = String.fromCodePoint(0x1F3CE); // 🏎

describe('src/animations.ts — round 3 : plus d\'émoji dans les deux zones étendues', () => {
  it("spawnFragments/animateFragments : plus de fillText de l'émoji tête de mort", () => {
    expect(animationsSource).not.toContain(SKULL_EMOJI);
    expect(animationsSource).not.toMatch(/fillText\(['"`]\\u2620/);
  });

  it('animateFragments appelle bien un dessin vectoriel (drawFragSkull), pas fillText, pour les fragments', () => {
    expect(animationsSource).toMatch(/function\s+drawFragSkull\(/);
    expect(animationsSource).toMatch(/drawFragSkull\(fragCtx/);
  });

  it("_FIN_RACERS/l'animation finisher : plus d'émoji voiture de course ni de détection de secours", () => {
    expect(animationsSource).not.toContain(RACE_CAR_EMOJI);
    expect(animationsSource).not.toMatch(/fillText\(['"`]\\uD83C\\uDFCE/);
    // Le mécanisme de détection et son drapeau ont été retirés (le rendu
    // vectoriel, déjà présent, est désormais toujours utilisé) — une
    // réapparition de `_finEmojiOk` signalerait une régression vers
    // l'ancien filet de secours emoji.
    expect(animationsSource).not.toMatch(/_finEmojiOk/);
  });

  it("trophée/💀/cadenas n'apparaissent nulle part dans src/animations.ts (🏁 ligne ~822 volontairement hors mandat, voir DECISIONS-H.md §11.3)", () => {
    // Couvre les émojis du P1 #7 qui NE font PAS partie du mandat explicite
    // de ce round (les deux seules zones autorisées sont couvertes par les
    // tests précédents) : s'assure qu'aucune régression n'y a été
    // introduite par erreur pendant ce correctif. `🏁` (U+1F3C1, ligne
    // ~822, code mort confirmé par le critique round 2, P2) n'est
    // volontairement PAS vérifié ici : le traiter sortirait du mandat
    // strict de ce round («aucune autre modification d'animations.ts»).
    expect(animationsSource).not.toContain(String.fromCodePoint(0x1F3C6)); // 🏆
    expect(animationsSource).not.toContain(String.fromCodePoint(0x1F480)); // 💀
    expect(animationsSource).not.toContain(String.fromCodePoint(0x1F512)); // 🔒
  });
});
