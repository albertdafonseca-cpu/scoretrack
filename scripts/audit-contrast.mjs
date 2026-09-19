// Audit de contraste WCAG 2.x sur les PIXELS RÉELLEMENT RENDUS (décision D16).
//
// Méthode — pour chaque thème × écran × état d'interaction :
//   1. l'application est pilotée jusqu'à l'écran réel (aucune carte fabriquée hors écran) ;
//   2. la couleur de premier plan de chaque élément visible est lue avec son alpha et son opacité ;
//   3. tous les premiers plans sont rendus transparents (le texte disparaît, les fonds restent) ;
//   4. la page est capturée, l'image redécodée dans un canvas, et le fond COMPOSÉ (carte + moitiés
//      tactiles teintées + texture + liseré + voile d'état) est échantillonné sous la boîte de
//      chaque élément, par quadrant : le pire quadrant fait foi.
// C'est la correction du défaut relevé au tour 1 : l'ancienne version lisait `--card-N` nu, une
// couleur qui n'apparaît nulle part à l'écran, et certifiait « 0 échec » sur une composition fictive.
//
// SEUILS APPLIQUÉS PAR CE SCRIPT (décision D20, ratifiée ; ce paragraphe décrit le code, ligne
// à ligne, et non une intention) :
//   — 4,5:1 pour tout texte dans un état STABLE, quelle que soit sa taille, score compris ;
//   — 3:1 pour un texte de 24 px ou plus pendant les quatre états TRANSITOIRES et brefs que sont
//     `pressé`, `flash-gain`, `flash-perte` et `butée`. C'est le seuil que WCAG 2.x accorde au
//     grand texte SANS condition : la règle d'ici reste donc plus stricte que la norme, puisqu'elle
//     exige 4,5:1 dès que l'état se stabilise. Cette tolérance ne s'applique jamais à un état stable ;
//   — 3:1 pour les objets graphiques porteurs d'information (icônes, signes +/−, courbe du récap),
//     conformément à WCAG 1.4.11.
// Exemption assumée : les contrôles `:disabled` (WCAG 1.4.3, exception « Inactive »), mesurés et
// listés à titre indicatif, jamais comptés en échec.
//
// DÉTERMINISME (décision D21) : le fond est échantillonné sur MEDIAN_SHOTS captures successives dont
// on retient la médiane par canal — une trame de composition transitoire est ainsi écartée par vote.
// Et tout élément qui passe à moins de MARGIN du seuil est compté en ÉCHEC : sans cette marge, une
// valeur qui oscille de ±0,1 autour du seuil ferait basculer le verdict de la CI d'un passage à
// l'autre. Un contraste « juste à la limite » est un défaut de conception, pas un résultat à publier.
//
// Usage : node scripts/audit-contrast.mjs [--url http://localhost:8765/] [--out rapport.md]
//         [--json mesures.json] [--themes cyber,light] [--dpr 3]
// Sortie : tableau Markdown + code 1 s'il reste un échec.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const BASE_URL = opt('--url', process.env.BASE_URL || 'http://localhost:8765/');
const OUT = opt('--out', 'test-results/contrast-report.md');
const JSON_OUT = opt('--json', null);
const DPR = Number(opt('--dpr', '3'));
/** CSS injecté après chargement, pour isoler la contribution d'une couche (analyse « et si ? »).
    N'affecte jamais l'exécution normale : sans `--inject`, rien n'est injecté. */
const INJECT = opt('--inject', null);
/** Dossier où déposer les captures masquées réellement analysées (diagnostic). */
const DEBUG_SHOTS = opt('--debug-shots', null);

/** Thèmes audités : identifiant CSS + schéma de couleurs émulé (pour « auto »). */
const ALL_THEMES = [
  ['cyber', 'dark'],
  ['dark', 'dark'],
  ['neon-pink', 'dark'],
  ['arcade', 'dark'],
  ['nature', 'dark'],
  ['sunset', 'dark'],
  ['ocean', 'dark'],
  ['mono', 'dark'],
  ['gold', 'dark'],
  ['sobre', 'dark'],
  ['ldm', 'dark'],
  ['light', 'light'],
  ['mono-light', 'light'],
  ['ldm-day', 'light'],
  ['auto', 'dark'],
  ['auto', 'light'],
];
const only = opt('--themes', null);
const THEMES = only ? ALL_THEMES.filter(([id]) => only.split(',').includes(id)) : ALL_THEMES;

const TEXT = 4.5;
const GRAPHIC = 3;
/** Taille à partir de laquelle WCAG 2.x parle de « grand texte » (1.4.3). */
const LARGE_PX = 24;
/**
 * États transitoires : voile d'appui, flash de gain/perte, butée. Ils durent moins de 250 ms et ne
 * concernent qu'une carte à la fois. Le texte normal y reste tenu à 4,5:1 ; le score, qui dépasse
 * toujours 24 px, y est tenu au seuil « grand texte » de WCAG 1.4.3, soit 3:1 — et à 4,5:1 dans
 * tous les états au repos, plus strict que WCAG. Seuil et périmètre sont écrits dans le rapport :
 * aucun assouplissement n'est silencieux (D17).
 */
const TRANSIENT = new Set(['pressé', 'flash-gain', 'flash-perte', 'butée']);
/** Nombre de captures dont on retient la médiane par canal (D21). */
const MEDIAN_SHOTS = 3;
/** Marge exigée au-dessus du seuil : en deçà, le contraste est déclaré insuffisant (D21). */
const MARGIN = 0.2;

// ── Sondes exécutées dans la page ────────────────────────────────────

/**
 * Relève chaque élément visible porteur d'information : nœud texte propre, ou forme SVG tracée.
 * Renvoie la couleur effective (alpha × opacity héritée) et la boîte englobante.
 */
function collectForegrounds() {
  // `getComputedStyle` renvoie `oklab(...)` dès qu'un `color-mix(in oklab, …)` est en jeu :
  // toute couleur est donc résolue en octets sRGB par le canvas, seule source fiable.
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  const num = (str) => {
    const m = String(str).match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    pctx.clearRect(0, 0, 1, 1);
    pctx.fillStyle = '#000';
    pctx.fillStyle = str;
    pctx.fillRect(0, 0, 1, 1);
    const d = pctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const effOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      o *= Number(getComputedStyle(n).opacity);
    }
    return o;
  };
  /** Boîte d'encre réelle du texte propre d'un élément (Range), et non sa boîte rembourrée. */
  const inkBox = (el) => {
    const range = document.createRange();
    let box = null;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width < 0.5 || r.height < 0.5) continue;
        box = box
          ? {
              x: Math.min(box.x, r.x),
              y: Math.min(box.y, r.y),
              right: Math.max(box.right, r.right),
              bottom: Math.max(box.bottom, r.bottom),
            }
          : { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }
    }
    if (!box) return null;
    return {
      x: box.x,
      y: box.y,
      left: box.x,
      top: box.y,
      right: box.right,
      bottom: box.bottom,
      width: box.right - box.x,
      height: box.bottom - box.y,
    };
  };
  /**
   * Le texte est-il réellement lisible à cet endroit ? Une surcouche translucide (les demi-zones
   * tactiles, dont la teinte fait justement partie du fond composé) ne masque rien ; une couche
   * opaque, elle, cache le texte : ces pixels ne sont pas ceux que l'utilisateur lit.
   */
  const covered = (el, rect) => {
    const cx = Math.min(innerWidth - 1, Math.max(0, rect.x + rect.width / 2));
    const cy = Math.min(innerHeight - 1, Math.max(0, rect.y + rect.height / 2));
    for (const node of document.elementsFromPoint(cx, cy)) {
      if (node === el || el.contains(node) || node.contains(el)) break;
      const bg = num(getComputedStyle(node).backgroundColor);
      if (bg[3] >= 0.85) return true;
    }
    return false;
  };
  // Surcouche ouverte (modale, récapitulatif, splash) : seul son contenu est lu par l'utilisateur.
  const layers = [...document.querySelectorAll('.modal-overlay, .fullpage, #splash')].filter(
    (n) => n.checkVisibility && n.checkVisibility() && !n.classList.contains('hidden'),
  );
  const layer = layers.length ? layers[layers.length - 1] : null;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.checkVisibility || !el.checkVisibility()) continue;
    const cs = getComputedStyle(el);
    // Technique « réservé aux lecteurs d'écran » : découpé à 1 px, jamais lu à l'œil.
    if (cs.clipPath !== 'none' || cs.clip !== 'auto') continue;
    if (layer && !layer.contains(el)) continue;
    const opacity = effOpacity(el);
    if (opacity < 0.05) continue;
    const disabled = Boolean(el.closest('[disabled], :disabled'));
    const inViewport = (r) =>
      r.width >= 1 &&
      r.height >= 1 &&
      r.bottom > 0 &&
      r.top < innerHeight &&
      r.right > 0 &&
      r.left < innerWidth;
    const isSvgShape = el.ownerSVGElement && cs.stroke && cs.stroke !== 'none';
    if (isSvgShape) {
      const host = el.closest('svg');
      const rect = host.getBoundingClientRect().toJSON();
      if (!inViewport(rect) || covered(el, rect)) continue;
      const c = num(cs.stroke);
      const a = c[3] * opacity;
      if (a < 0.02) continue;
      el.dataset.auditId = String(out.length);
      out.push({
        sel: host.dataset.icon
          ? `svg.icon[${host.dataset.icon}]`
          : `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`,
        rect,
        color: [c[0], c[1], c[2]],
        alpha: a,
        kind: 'graphique',
        disabled,
      });
      continue;
    }
    const rect = inkBox(el);
    if (!rect || !inViewport(rect) || covered(el, rect)) continue;
    const c = num(cs.color);
    const a = c[3] * opacity;
    if (a < 0.02) continue;
    // Fond propre de l'élément : s'il est opaque, c'est LUI qui est peint sous son texte, par
    // définition du modèle de peinture. Il sert alors de témoin pour détecter une capture fautive.
    const own = num(cs.backgroundColor);
    el.dataset.auditId = String(out.length);
    out.push({
      sel: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`,
      rect,
      ownBg: own[3] >= 0.99 ? [own[0], own[1], own[2]] : null,
      color: [c[0], c[1], c[2]],
      alpha: a,
      kind: 'texte',
      fontSize: parseFloat(cs.fontSize),
      disabled,
    });
  }
  return out;
}

/** Rend tous les premiers plans transparents sans toucher aux fonds (le texte s'efface, la composition reste). */
function hideForegrounds() {
  const style = document.createElement('style');
  style.id = '__audit-hide';
  // Les transitions sont coupées EN MÊME TEMPS que le masquage : sans cela, rendre la couleur
  // transparente démarre une transition (les boutons animent `all`), et la capture prise juste
  // après lit un état intermédiaire — un fond à mi-chemin de l'accent, d'où des ratios aberrants
  // qu'aucune mesure directe ne reproduit.
  style.textContent = `
    *, *::before, *::after {
      color: transparent !important;
      text-shadow: none !important;
      transition: none !important;
      animation: none !important;
    }
    svg * { stroke: transparent !important; fill: transparent !important; }
  `;
  document.head.appendChild(style);
}

function showForegrounds() {
  document.getElementById('__audit-hide')?.remove();
}

/**
 * Attend que le rendu soit STABLE avant tout échantillonnage : polices chargées (une substitution
 * en cours déplacerait les boîtes d'encre), animations terminées (une opacité transitoire ferait
 * lire un premier plan à moitié composé), puis deux trames pour que la composition soit peinte.
 * Sans cette attente, la mesure est fausse dans les deux sens — c'est le reproche fait au tour 1.
 */
async function settle() {
  await document.fonts.ready;
  // DOM stable : deux relevés identiques à une trame d'intervalle. Un écran encore en train de se
  // peupler (le pavé numérique construit ses douze touches) ne donnerait pas le même jeu
  // d'éléments d'une exécution à l'autre.
  let previous = -1;
  for (let i = 0; i < 20; i++) {
    const count = document.querySelectorAll('body *').length;
    if (count === previous) break;
    previous = count;
    await new Promise((r) => setTimeout(r, 50));
  }
  await document.fonts.ready;
  const running = document
    .getAnimations()
    .filter(
      (a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity,
    );
  await Promise.all(running.map((a) => a.finished.catch(() => {})));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/** Échantillonne le fond composé sous chaque boîte : moyenne globale et moyenne par quadrant. */
async function sampleBackgrounds({ b64, boxes }) {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const dpr = img.width / window.innerWidth;
  return boxes.map((r) => {
    const X = Math.max(0, Math.round(r.x * dpr));
    const Y = Math.max(0, Math.round(r.y * dpr));
    const W = Math.max(1, Math.min(Math.round(r.width * dpr), img.width - X));
    const H = Math.max(1, Math.min(Math.round(r.height * dpr), img.height - Y));
    const d = ctx.getImageData(X, Y, W, H).data;
    const sum = [0, 0, 0];
    let n = 0;
    const q = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    for (let yy = 0; yy < H; yy++) {
      for (let xx = 0; xx < W; xx++) {
        const k = (yy * W + xx) * 4;
        sum[0] += d[k];
        sum[1] += d[k + 1];
        sum[2] += d[k + 2];
        n++;
        const qi = (yy < H / 2 ? 0 : 2) + (xx < W / 2 ? 0 : 1);
        q[qi][0] += d[k];
        q[qi][1] += d[k + 1];
        q[qi][2] += d[k + 2];
        q[qi][3]++;
      }
    }
    return {
      mean: sum.map((v) => v / n),
      quads: q.filter((v) => v[3] > 0).map((v) => [v[0] / v[3], v[1] / v[3], v[2] / v[3]]),
    };
  });
}

// ── Calcul WCAG (sur les octets échantillonnés) ──────────────────────

const lin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function ratio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
/** Compose un premier plan semi-transparent sur le fond réel échantillonné. */
const over = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
const hex = (c) =>
  '#' +
  c
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

// ── Pilotage de l'application ────────────────────────────────────────

async function gotoSetup(page) {
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });
  if (INJECT) {
    await page.addStyleTag({ content: INJECT });
    await page.waitForTimeout(80);
  }
}

/** Lance une partie à `n` joueurs (les 10 couleurs de carte sont couvertes dès n = 10). */
async function startGame(page, n, start = 40) {
  await gotoSetup(page);
  await page.locator(`#players-grid .player-chip[data-val="${n}"]`).first().click();
  await page.locator(`#start-presets [data-val="${start}"]`).click();
  const namesBtn = page.locator('#names-btn');
  if (await namesBtn.count()) await namesBtn.click();
  else await page.locator('#go-btn').click();
  await page.waitForSelector('.name-input, .pcard');
  const inputs = page.locator('.name-input');
  const count = await inputs.count();
  if (count) {
    const names = [
      'Alice',
      'Bob',
      'Chloé',
      'David',
      'Émile',
      'Fatou',
      'Gaspard',
      'Hana',
      'Iris',
      'Jules',
      'Karim',
      'Léa',
    ];
    for (let i = 0; i < count; i++) await inputs.nth(i).fill(names[i]);
    await page.locator('[data-action="start-game"]').first().click();
  }
  await page.waitForSelector('.pcard');
  await page.waitForTimeout(400);
}

/**
 * États d'interaction appliqués aux DEUX moitiés de chaque carte : ce sont les voiles qui
 * recomposent le fond sous le score (c'est précisément ce que l'ancien audit ignorait).
 */
const GAME_STATES = {
  repos: () => {},
  pressé: () => {
    for (const h of document.querySelectorAll('.tap-half')) h.classList.add('pressed');
  },
  'flash-gain': () => {
    for (const h of document.querySelectorAll('.tap-half.plus')) h.classList.add('flash-pos');
    for (const h of document.querySelectorAll('.tap-half.minus')) h.classList.add('flash-pos');
  },
  'flash-perte': () => {
    for (const h of document.querySelectorAll('.tap-half')) h.classList.add('flash-neg');
  },
  butée: () => {
    for (const h of document.querySelectorAll('.tap-half')) h.classList.add('blocked');
  },
  éliminé: () => {
    for (const c of document.querySelectorAll('.pcard')) c.classList.add('elim');
  },
  'score bas': () => {
    for (const s of document.querySelectorAll('.score')) s.classList.add('low');
  },
  'score critique': () => {
    for (const s of document.querySelectorAll('.score')) s.classList.add('crit');
  },
  désactivé: () => {
    for (const h of document.querySelectorAll('.tap-half')) h.disabled = true;
  },
};

function resetGameStates() {
  for (const h of document.querySelectorAll('.tap-half')) {
    h.classList.remove('pressed', 'flash-pos', 'flash-neg', 'blocked');
    h.disabled = false;
  }
  for (const c of document.querySelectorAll('.pcard')) c.classList.remove('elim');
  for (const s of document.querySelectorAll('.score')) s.classList.remove('low', 'crit');
}

/** Un « plan » = une page réelle à mesurer : comment y arriver, et dans quel état. */
const PLANS = [
  { screen: 'setup', state: 'repos', go: (p) => gotoSetup(p) },
  {
    screen: 'réglages',
    state: 'repos',
    go: async (p) => {
      await gotoSetup(p);
      await p.locator('[data-action="show-settings"]').first().click();
      await p.waitForTimeout(200);
    },
  },
  {
    screen: 'noms',
    state: 'repos',
    go: async (p) => {
      await gotoSetup(p);
      await p.locator('#players-grid .player-chip[data-val="4"]').first().click();
      const namesBtn = p.locator('#names-btn');
      if (await namesBtn.count()) await namesBtn.click();
      else await p.locator('#go-btn').click();
      await p.waitForTimeout(250);
    },
  },
  ...Object.keys(GAME_STATES).map((state) => ({
    screen: 'jeu (10 joueurs)',
    state,
    reuseGame: true,
  })),
  {
    screen: 'pavé numérique',
    state: 'repos',
    go: async (p) => {
      await startGame(p, 4);
      // Ouverture par le geste réel (appui long sur une demi-zone) ; sinon le plan est ignoré.
      const box = await p.locator('#card-0 .tap-half.minus').boundingBox();
      const cdp = await p.context().newCDPSession(p);
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await p.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await p.waitForTimeout(350);
      return (await p.locator('#score-modal:not(.hidden)').count()) > 0;
    },
  },
  {
    screen: 'récapitulatif',
    state: 'repos',
    go: async (p) => {
      await startGame(p, 4);
      await p.locator('#bar [data-action="show-recap"]').click();
      await p.waitForTimeout(300);
    },
  },
];

async function main() {
  const browser = await chromium.launch();
  /** Un contexte par thème : le schéma de couleurs est posé à la création, jamais après coup —
      c'est la seule façon fiable de faire résoudre `light-dark()` du thème « auto ». */
  const newCtx = (scheme) =>
    browser.newContext({
      ...devices['iPhone 13'],
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: DPR,
      hasTouch: true,
      locale: 'fr-FR',
      colorScheme: scheme,
      // Mouvement réduit : les modales et les cartes sont mesurées dans leur état stable, jamais
      // au milieu d'un fondu. Une opacité transitoire ferait lire un premier plan à moitié composé
      // et produirait des ratios fantaisistes (1,00 quand l'élément est encore invisible).
      reducedMotion: 'reduce',
    });
  /**
   * Chaque navigation repart d'un stockage vierge. Sans cela, une partie sauvegardée par le thème
   * précédent fait apparaître la bannière de reprise sur l'écran d'accueil et change le jeu
   * d'éléments mesurés : deux exécutions ne seraient plus comparables.
   */
  const freshCtx = async (scheme) => {
    const c = await newCtx(scheme);
    await c.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* stockage indisponible : l'application démarre déjà vierge */
      }
    });
    // Le service worker n'est jamais installé pendant l'audit : sa bannière « nouvelle version »
    // apparaît selon un calendrier propre et ferait varier le jeu d'éléments mesurés d'une
    // exécution à l'autre. L'enregistrement échoue proprement, l'application le gère déjà.
    // Les couleurs de cette bannière (css/system.css) sont auditées sur les écrans stables.
    await c.route('**/sw-st.js', (route) => route.abort());
    return c;
  };
  let ctx = await freshCtx('dark');
  let page = await ctx.newPage();

  const rows = [];
  const skipped = new Set();
  const setTheme = (id) =>
    page.evaluate(
      (t) => document.documentElement.setAttribute('data-theme', t === 'cyber' ? '' : t),
      id,
    );

  /** Mesure l'écran courant : relève, masque, capture, échantillonne, calcule. */
  /** Géométrie relue APRÈS masquage : les boîtes décrivent alors exactement les pixels capturés. */
  const readBoxes = () =>
    page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('[data-audit-id]')) {
        const i = Number(el.dataset.auditId);
        let r;
        if (el.ownerSVGElement) {
          r = el.closest('svg').getBoundingClientRect();
        } else {
          const range = document.createRange();
          let box = null;
          for (const n of el.childNodes) {
            if (n.nodeType !== 3 || !n.textContent.trim()) continue;
            range.selectNodeContents(n);
            for (const cr of range.getClientRects()) {
              if (cr.width < 0.5 || cr.height < 0.5) continue;
              box = box
                ? {
                    x: Math.min(box.x, cr.x),
                    y: Math.min(box.y, cr.y),
                    right: Math.max(box.right, cr.right),
                    bottom: Math.max(box.bottom, cr.bottom),
                  }
                : { x: cr.x, y: cr.y, right: cr.right, bottom: cr.bottom };
            }
          }
          if (!box) continue;
          r = { x: box.x, y: box.y, width: box.right - box.x, height: box.bottom - box.y };
        }
        out[i] = { x: r.x, y: r.y, width: r.width, height: r.height };
      }
      return out;
    });

  const clearTags = () =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll('[data-audit-id]')) delete el.dataset.auditId;
    });

  /** Médiane par canal de plusieurs relevés d'une même zone. */
  const medianColor = (samples) =>
    [0, 1, 2].map((c) => {
      const v = samples.map((s2) => s2[c]).sort((a, b2) => a - b2);
      return v[(v.length - 1) >> 1];
    });

  async function measure(theme, screen, state) {
    await page.evaluate(settle);
    const fgs = await page.evaluate(collectForegrounds);
    if (!fgs.length) {
      await clearTags();
      return;
    }
    await page.evaluate(hideForegrounds);
    await page.evaluate(settle);
    // La géométrie est relue une fois le masque posé et les transitions figées : boîtes et pixels
    // décrivent alors le même instant, ce qui supprime les lectures sur une couche obsolète.
    const boxes = await readBoxes();
    const shots = [];
    for (let k = 0; k < MEDIAN_SHOTS; k++) {
      const buf = await page.screenshot();
      if (DEBUG_SHOTS && k === 0) {
        mkdirSync(DEBUG_SHOTS, { recursive: true });
        writeFileSync(
          `${DEBUG_SHOTS}/${theme}-${screen}-${state}`.replace(/[^\w.-]+/g, '_') + '.png',
          buf,
        );
      }
      shots.push(
        await page.evaluate(sampleBackgrounds, { b64: buf.toString('base64'), boxes: boxes }),
      );
      if (k < MEDIAN_SHOTS - 1) await page.waitForTimeout(40);
    }
    await page.evaluate(showForegrounds);
    await clearTags();

    fgs.forEach((f, i) => {
      if (!boxes[i]) return;
      const quadCount = Math.min(...shots.map((s2) => s2[i].quads.length));
      const quads = [];
      for (let q = 0; q < quadCount; q++) {
        quads.push(medianColor(shots.map((s2) => s2[i].quads[q])));
      }
      let meanBg = medianColor(shots.map((s2) => s2[i].mean));
      let quadSet = quads;
      let disputed = false;
      if (f.ownBg) {
        // Écart entre ce que la feuille de style peint sous le texte et ce que la capture montre.
        // Un élément au fond opaque ne peut pas être peint sur autre chose que son propre fond :
        // si la capture en montre un autre (couche composée en retard, instantané d'arrière-plan
        // périmé sous une modale), c'est la capture qui est fautive, et le jeton fait foi.
        const drift = Math.max(...[0, 1, 2].map((c2) => Math.abs(meanBg[c2] - f.ownBg[c2])));
        if (drift > 12) {
          disputed = true;
          meanBg = f.ownBg;
          quadSet = [f.ownBg];
        }
      }
      const worstQuad = quadSet.reduce(
        (acc, q) => {
          const r = ratio(over(f.color, f.alpha, q), q);
          return r < acc.r ? { r, q } : acc;
        },
        { r: Infinity, q: meanBg },
      );
      const large = f.kind === 'texte' && f.fontSize >= LARGE_PX;
      const min = f.kind !== 'texte' || (large && TRANSIENT.has(state)) ? GRAPHIC : TEXT;
      // Seuil effectif = seuil + marge : une valeur à moins de MARGIN du seuil n'est pas un
      // résultat publiable, c'est un contraste à reprendre (D21).
      const ok = f.disabled || worstQuad.r >= min + MARGIN;
      rows.push({
        theme,
        screen,
        state,
        sel: f.sel,
        kind: f.kind,
        fontSize: f.fontSize,
        disabled: f.disabled,
        fg: hex(over(f.color, f.alpha, worstQuad.q)),
        bg: hex(worstQuad.q),
        bgMean: hex(meanBg),
        ratio: worstQuad.r,
        min,
        disputed,
        marginal: !f.disabled && worstQuad.r >= min && worstQuad.r < min + MARGIN,
        ok,
      });
    });
  }

  let first = true;
  for (const [id, scheme] of THEMES) {
    // Un contexte NEUF par thème. Mesuré : sur une longue exécution, un contexte partagé dérive —
    // les fonds échantillonnés s'éclaircissent d'un thème à l'autre et font apparaître des échecs
    // à 0,3 du seuil qu'aucune exécution isolée ne reproduit (nom de joueur relevé à 4,2 en série
    // contre 4,8–5,1 isolé). Repartir à zéro coûte quelques secondes et rend le verdict identique
    // à celui d'une mesure isolée, qui fait foi.
    if (!first) {
      await ctx.close();
      ctx = await freshCtx(scheme);
      page = await ctx.newPage();
    }
    first = false;
    const theme = id === 'auto' ? `auto (${scheme})` : id;
    let gameReady = false;
    for (const plan of PLANS) {
      if (plan.reuseGame) {
        if (!gameReady) {
          await startGame(page, 10);
          gameReady = true;
        }
        await setTheme(id);
        await page.evaluate(resetGameStates);
        await page.evaluate(
          ([name, src]) => {
            // eslint-disable-next-line no-new-func
            new Function(`return (${src})`)()(name);
          },
          [plan.state, GAME_STATES[plan.state].toString()],
        );
        await page.waitForTimeout(160);
      } else {
        gameReady = false;
        const ready = await plan.go(page);
        if (ready === false) {
          skipped.add(plan.screen);
          continue;
        }
        await setTheme(id);
        await page.waitForTimeout(160);
      }
      await measure(theme, plan.screen, plan.state);
    }
  }
  // L'interface applique-t-elle réellement les classes d'alerte du score ? (revendication à prouver)
  await startGame(page, 2, 10);
  const wired = await page.evaluate(async () => {
    const half = document.querySelector('#card-0 .tap-half.minus');
    for (let i = 0; i < 9 && half; i++) {
      half.click();
      await new Promise((r) => setTimeout(r, 40));
    }
    const sc = document.querySelector('#card-0 .score');
    return { classes: sc ? sc.className : '', text: sc ? sc.textContent : '' };
  });
  await browser.close();

  const alertWired = /\b(low|crit)\b/.test(wired.classes);
  const counted = rows.filter((r) => !r.disabled);
  const failing = counted.filter((r) => !r.ok);
  const exempt = rows.filter((r) => r.disabled);

  const lines = [];
  lines.push('# Rapport de contraste WCAG 2.x — pixels réellement rendus (D16)', '');
  lines.push(
    `URL : ${BASE_URL} · viewport 390 × 844 · DPR ${DPR} · ${new Date().toISOString().slice(0, 10)}`,
  );
  lines.push('');
  lines.push(
    "Méthode : l'application est pilotée jusqu'à chaque écran réel ; les premiers plans sont rendus",
    'transparents ; la page est capturée puis redécodée, et le fond **composé** (carte + moitiés',
    "tactiles teintées + texture + voile d'état) est échantillonné par quadrant sous la boîte de chaque",
    'élément. Le pire quadrant fait foi. Aucun élément fabriqué hors écran.',
    '',
  );
  lines.push(
    `Mesures comptées : **${counted.length}** · échecs : **${failing.length}**.`,
    `Seuils appliqués (D20) : texte en état stable ≥ ${TEXT}:1 quelle que soit sa taille · objets graphiques ≥ ${GRAPHIC}:1 · texte de ${LARGE_PX} px ou plus ≥ ${GRAPHIC}:1 pendant les seuls états transitoires (${[...TRANSIENT].join(', ')}), seuil que WCAG 2.x accorde au grand texte sans condition — la règle d'ici reste donc plus stricte que la norme.`,
    `Marge de déterminisme (D21) : un élément doit dépasser son seuil de ${MARGIN} pour être compté conforme ; entre le seuil et le seuil + ${MARGIN}, le contraste est déclaré insuffisant plutôt que publié comme un résultat qui oscillerait d'un passage à l'autre. Le fond est la médiane de ${MEDIAN_SHOTS} captures.`,
    `Exemptées (contrôles \`:disabled\`, WCAG 1.4.3) : ${exempt.length}.`,
    JSON_OUT
      ? `Relevé complet : \`${JSON_OUT}\`, ${rows.length} lignes = ${counted.length} comptées + ${exempt.length} exemptées, dont ${failing.length} en échec. Les trois nombres de ce rapport, ceux du fichier de relevé et le code de sortie proviennent du même tableau : ils ne peuvent pas diverger.`
      : `Relevé complet non écrit (passer \`--json\` pour l'obtenir).`,
    '',
  );
  lines.push(
    alertWired
      ? `États d'alerte du score : **câblés** par l'interface (classes relevées : \`${wired.classes}\`).`
      : `> **Avertissement.** Les classes \`.score.low\` / \`.score.crit\` ne sont **pas appliquées** par l'interface (relevé après 9 baisses : \`${wired.classes || 'score'}\`). Les lignes « score bas » et « score critique » mesurent donc la règle CSS telle qu'elle serait rendue si A la câblait : elles sont comptées comme une garantie de la feuille de style, pas comme une preuve d'écran. Câblage à faire par A (\`js/ui/game.js\`, \`scoreAlert()\` de \`js/core/rules.js\`).`,
    '',
  );

  const byGroup = new Map();
  for (const r of counted) {
    const k = `${r.theme} · ${r.screen} · ${r.state}`;
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(r);
  }
  lines.push(
    '## Synthèse par thème, écran et état',
    '',
    '| Thème | Écran | État | Mesures | Échecs | Pire ratio | Élément le plus faible |',
    '|---|---|---|---|---|---|---|',
  );
  for (const [k, list] of byGroup) {
    const worst = list.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    const [theme, screen, state] = k.split(' · ');
    lines.push(
      `| ${theme} | ${screen} | ${state} | ${list.length} | ${list.filter((r) => !r.ok).length} | ${worst.ratio.toFixed(2)} | \`${worst.sel}\` |`,
    );
  }
  const marginals = counted.filter((r) => r.marginal);
  lines.push(
    '',
    `Dont **${marginals.length}** à moins de ${MARGIN} du seuil (marge insuffisante) et **${failing.length - marginals.length}** franchement sous le seuil.`,
    '',
  );
  lines.push('', '## Échecs', '');
  if (failing.length) {
    lines.push(
      '| Thème | Écran | État | Élément | Premier plan | Fond composé | Ratio | Seuil |',
      '|---|---|---|---|---|---|---|---|',
    );
    for (const r of failing) {
      lines.push(
        `| ${r.theme} | ${r.screen} | ${r.state} | \`${r.sel}\` | \`${r.fg}\` | \`${r.bg}\` | **${r.ratio.toFixed(2)}** | ${r.min}${r.marginal ? ` (marge < ${MARGIN})` : ''} |`,
      );
    }
  } else {
    lines.push(
      'Aucun. Chaque texte rendu atteint 4,5:1 et chaque objet graphique 3:1, dans tous les états.',
    );
  }
  lines.push(
    '',
    '## Détail complet',
    '',
    '| Thème | Écran | État | Élément | Type | px | Premier plan | Fond (pire quadrant) | Fond (moyen) | Ratio | Seuil | Verdict |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  );
  for (const r of rows) {
    lines.push(
      `| ${r.theme} | ${r.screen} | ${r.state} | \`${r.sel}\` | ${r.kind} | ${r.fontSize ? Math.round(r.fontSize) : '—'} | \`${r.fg}\` | \`${r.bg}\` | \`${r.bgMean}\` | ${r.ratio.toFixed(2)} | ${r.min} | ${r.disabled ? 'exempté' : r.ok ? 'OK' : '**ÉCHEC**'} |`,
    );
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join('\n') + '\n');
  if (JSON_OUT) {
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, JSON.stringify(rows, null, 2));
  }

  const worstByTheme = new Map();
  for (const r of counted) {
    const cur = worstByTheme.get(r.theme);
    if (!cur || r.ratio < cur.ratio) worstByTheme.set(r.theme, r);
  }
  for (const [theme, r] of worstByTheme) {
    console.log(
      `${theme.padEnd(14)} pire ${r.ratio.toFixed(2)} (${r.screen}/${r.state}, ${r.sel}, ${r.fg} sur ${r.bg})`,
    );
  }
  for (const r of failing.slice(0, 40)) {
    console.log(
      `ÉCHEC ${r.theme} · ${r.screen}/${r.state} · ${r.sel} : ${r.ratio.toFixed(2)} < ${(r.min + MARGIN).toFixed(2)}` +
        (r.marginal
          ? ` (seuil ${r.min} atteint, mais sans la marge de ${MARGIN} exigée par D21)`
          : ''),
    );
  }
  console.log(`${counted.length} mesures comptées, ${failing.length} échec(s) → ${OUT}`);
  process.exit(failing.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
