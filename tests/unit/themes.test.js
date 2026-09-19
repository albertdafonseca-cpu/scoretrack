// Cohérence du système visuel : chaque thème définit tous les jetons requis (liste générée depuis
// le :root de tokens.css), ≤ 2 familles de polices par thème, échelle typographique ≥ 11 px,
// palette Tol alignée sur constants.js, sprite SVG synchronisé avec js/ui/icons.js.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLORS, DEFAULT_THEME, THEMES } from '../../js/core/constants.js';
import { ICONS, ICON_NAMES, opticalTransform, shapeOf } from '../../js/ui/icons.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const tokensCss = read('css/tokens.css');
const themesCss = read('css/themes.css');

/** Noms des icônes exigés par CONTRACTS.md (B → tous). */
const CONTRACT_ICONS = [
  'target',
  'gear',
  'gamepad',
  'save',
  'lock',
  'trash',
  'shuffle',
  'rotate',
  'list',
  'trophy',
  'skull',
  'check',
  'close',
  'undo',
  'redo',
  'plus',
  'minus',
  'back',
  'play',
  'dice',
  'clock',
  'edit',
  'download',
  'upload',
  'info',
  'warning',
  'refresh',
  'share',
  'copy',
  'users',
  'palette',
];

/** Jetons du :root dérivés d'autres jetons ou optionnels : un thème n'a pas à les redéfinir. */
const DERIVED = new Set([
  'muted',
  'muted2',
  'muted-mix',
  'btn-font',
  'score-font',
  'chip-text',
  'card-texture-size',
]);

/** Extrait { nom → valeur } des déclarations `--x: …;` d'un bloc CSS (sans les accolades). */
function declarations(block) {
  const out = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2].trim();
  return out;
}

/** Bloc CSS `selector { … }` en gérant les parenthèses des valeurs (pas d'accolades imbriquées ici). */
function blocks(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let m;
  while ((m = re.exec(clean))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

/** Jetons définis par thème, en distribuant les sélecteurs groupés `[data-theme='a'], [data-theme='b']`. */
function themeTokens() {
  const byTheme = {};
  for (const { selector, body } of blocks(themesCss)) {
    const ids = [...selector.matchAll(/^\s*\[data-theme='([\w-]+)'\]\s*$/gm)].map((x) => x[1]);
    if (!ids.length) continue;
    const decl = declarations(body);
    for (const id of ids) byTheme[id] = { ...(byTheme[id] || {}), ...decl };
  }
  return byTheme;
}

const rootBlock = blocks(tokensCss).find((b) => b.selector === ':root');
const rootTokens = declarations(rootBlock.body);
const themeSection = rootBlock.body.slice(rootBlock.body.indexOf('--bg:'));
const REQUIRED = Object.keys(declarations(themeSection)).filter((k) => !DERIVED.has(k));
const byTheme = themeTokens();
const family = (v) => v.split(',')[0].replace(/["']/g, '').trim();

describe('tokens.css', () => {
  it('définit une échelle typographique relative, croissante, avec un plancher de 12 px (D10, D19)', () => {
    const BASE = 16;
    const scale = Array.from({ length: 8 }, (_, i) => {
      const raw = rootTokens[`fs-${i + 1}`];
      const rem = parseFloat(raw.match(/([\d.]+)rem/)[1]);
      const floor = raw.match(/([\d.]+)px/);
      return { raw, rem, px: rem * BASE, floor: floor ? parseFloat(floor[1]) : null };
    });
    // Relatif : aucune taille en pixels absolus, sinon le réglage système reste sans effet.
    for (const [i, s2] of scale.entries()) {
      expect(s2.rem, `--fs-${i + 1} doit être exprimé en rem`).toBeGreaterThan(0);
      expect(s2.raw, `--fs-${i + 1} ne doit pas être une taille absolue`).toMatch(/rem/);
    }
    // Croissante, et jamais sous 12 px à la base par défaut.
    for (let i = 1; i < scale.length; i++) expect(scale[i].rem).toBeGreaterThan(scale[i - 1].rem);
    for (const [i, s2] of scale.entries()) {
      expect(Math.max(s2.px, s2.floor ?? 0), `--fs-${i + 1} rendu`).toBeGreaterThanOrEqual(12);
    }
    // Les trois plus petits échelons portent un plancher explicite : réduire la base système ne
    // peut pas les faire descendre sous 12 px.
    for (const i of [0, 1, 2]) expect(scale[i].floor, `--fs-${i + 1} sans plancher`).toBe(12);
  });

  it('expose les jetons du contrat (durées, courbes, tap-min, sémantique, focus)', () => {
    for (const k of [
      'dur-1',
      'dur-2',
      'dur-3',
      'ease-out',
      'ease-spring',
      'tap-min',
      'gain',
      'loss',
      'warn',
      'focus',
      'green',
      'red',
    ]) {
      expect(rootTokens[k], `--${k}`).toBeTruthy();
    }
    expect(rootTokens['tap-min']).toBe('44px');
    expect(tokensCss).toMatch(/--ease-spring:\s*linear\(/);
  });

  it('aligne la palette --tol-1…12 sur COLORS de constants.js', () => {
    COLORS.forEach((hex, i) => {
      expect(rootTokens[`tol-${i + 1}`].toLowerCase()).toBe(hex.toLowerCase());
    });
  });

  it('dérive les 10 fonds de cartes par color-mix (aucune valeur manuelle)', () => {
    for (let i = 1; i <= 10; i++)
      expect(rootTokens[`card-${i}`]).toMatch(
        /^color-mix\(in oklab, var\(--tol-\d+\) var\(--card-mix\), var\(--card-base\)\)$/,
      );
    expect(themesCss).not.toMatch(/\.pcard\.color-\d+\s*\{\s*background:\s*#/);
  });
});

describe('themes.css', () => {
  const expected = THEMES.map((t) => t.id).filter((id) => id !== DEFAULT_THEME);

  it('contient un bloc pour chaque thème de constants.js (hors défaut) et le thème auto', () => {
    for (const id of [...expected, 'auto']) expect(Object.keys(byTheme), id).toContain(id);
  });

  it.each(Object.keys(byTheme))(
    '%s définit tous les jetons requis (générés depuis :root)',
    (id) => {
      const missing = REQUIRED.filter((k) => !(k in byTheme[id]));
      expect(missing).toEqual([]);
    },
  );

  it.each(Object.keys(byTheme))('%s utilise au plus 2 familles de polices', (id) => {
    const fams = new Set(
      ['font-display', 'font-ui', 'font-score'].map((k) => family(byTheme[id][k])),
    );
    expect(fams.size).toBeLessThanOrEqual(2);
  });

  it("les couleurs d'aperçu de la grille correspondent aux jetons du thème", () => {
    // La grille de réglages peint chaque carte avec bg/a/b de constants.js. Si ces trois valeurs
    // s'écartent des jetons réels, l'aperçu ment sur ce que l'utilisateur obtiendra — et le nom de
    // la carte, peint avec `a` sur `bg`, perd son contraste (mesuré à 4,58:1 avant resynchronisation).
    for (const t of THEMES) {
      const tok = t.id === DEFAULT_THEME ? rootTokens : byTheme[t.id];
      if (!tok || !tok.bg) continue;
      expect(tok.bg.toLowerCase(), `${t.id} : fond d'aperçu`).toBe(t.bg.toLowerCase());
      expect(tok.accent.toLowerCase(), `${t.id} : accent d'aperçu`).toBe(t.a.toLowerCase());
      expect(tok.accent2.toLowerCase(), `${t.id} : accent secondaire d'aperçu`).toBe(
        t.b.toLowerCase(),
      );
    }
  });

  it('les thèmes clairs déclarent color-scheme: light et une paire gain/perte assombrie', () => {
    for (const id of ['light', 'mono-light', 'ldm-day']) {
      const t = byTheme[id];
      expect(t.gain).not.toBe(rootTokens.gain);
      expect(t.loss).not.toBe(rootTokens.loss);
    }
    expect(themesCss).toMatch(
      /\[data-theme='light'\],\s*\[data-theme='mono-light'\],\s*\[data-theme='ldm-day'\]\s*\{\s*color-scheme:\s*light/,
    );
    expect(byTheme.auto.bg).toMatch(/^light-dark\(/);
  });
});

describe('icônes', () => {
  it('fournit toutes les icônes du contrat', () => {
    for (const name of CONTRACT_ICONS) expect(ICON_NAMES, name).toContain(name);
  });

  it('assets/icons/sprite.svg est synchronisé avec js/ui/icons.js', () => {
    const sprite = read('assets/icons/sprite.svg');
    const ids = [...sprite.matchAll(/<symbol id="([\w-]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(ICON_NAMES);
    for (const [name, def] of Object.entries(ICONS)) {
      for (const entry of def.d) {
        const { attrs } = shapeOf(entry);
        for (const [k, v] of Object.entries(attrs))
          expect(sprite, `${name} : ${k}="${v}"`).toContain(`${k}="${v}"`);
      }
    }
  });

  it('le sprite porte les mêmes transformations de taille optique', () => {
    const sprite = read('assets/icons/sprite.svg');
    for (const [name, def] of Object.entries(ICONS)) {
      const t = opticalTransform(def);
      if (!t) continue;
      expect(sprite, `${name} : transformation absente du sprite`).toContain(t);
      expect(sprite, `${name} : épaisseur compensée absente`).toContain(
        `stroke-width="${+(2 / def.k).toFixed(3)}"`,
      );
    }
  });

  it('la taille optique reste dans une bande resserrée (facteurs déclarés)', () => {
    // Mesure au pixel (scripts/audit-icons.mjs) : bande 18,0–20,3 u après harmonisation.
    // Ici on garde la contrainte vérifiable sans navigateur : aucun facteur aberrant.
    for (const [name, def] of Object.entries(ICONS)) {
      const k = def.k || 1;
      expect(k, `${name} : facteur de taille optique`).toBeGreaterThanOrEqual(0.8);
      expect(k, `${name} : facteur de taille optique`).toBeLessThanOrEqual(1.5);
    }
  });

  it('chaque tracé est sur la grille 24 × 24 (hors marque 512)', () => {
    for (const [name, def] of Object.entries(ICONS)) {
      if (def.vb) continue;
      const nums = def.d.flatMap((e) =>
        (typeof e === 'string' ? e : e.d).match(/-?\d*\.?\d+/g).map(Number),
      );
      const max = Math.max(...nums.map(Math.abs));
      expect(max, name).toBeLessThanOrEqual(24);
    }
  });
});
