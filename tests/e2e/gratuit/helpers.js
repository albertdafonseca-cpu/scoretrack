// Utilitaires communs aux tests E2E de ScoreTrack sans licence (version gratuite du site principal)
const base = require('@playwright/test');
const { expect } = base;

const APP = {
  id: 'main',
  title: 'ScoreTrack — compteur de scores pour jeux de société',
  manifestName: 'ScoreTrack',
  cachePrefix: 'st-main-',
  cacheRe: /^st-main-v[0-9a-f]{10}$/, // version = empreinte du contenu (tools/build.mjs)
  maxPlayers: 6, // version gratuite : 2 à 6 joueurs
};
const XSS_NAME = '<img src=x onerror=alert(1)>';

// Fixture `page` enrichie : collecte erreurs console, réponses HTTP >= 400,
// requêtes tierces et boîtes de dialogue (confirm accepté, le reste refusé).
const test = base.test.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    const problems = [];
    const external = [];
    const dialogs = [];
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text().slice(0, 200)}`);
    });
    page.on('pageerror', (e) => problems.push('PAGEERROR: ' + e.message.slice(0, 200)));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(origin) && !/^(data|blob|about):/.test(u)) external.push(u);
    });
    page.on('dialog', async (d) => {
      dialogs.push(`${d.type()}: ${d.message()}`);
      if (d.type() === 'confirm') await d.accept(); else await d.dismiss();
    });
    page.problems = problems;
    page.external = external;
    page.dialogs = dialogs;
    await use(page);
  },
});

/** Pré-remplit localStorage avant le premier script de la page (une seule fois par onglet). */
async function seedStorage(page, entries) {
  await page.addInitScript((e) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, entries);
}

const storage = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
const json = (s) => (s == null ? null : JSON.parse(s));

/** Attend que le SW soit activé et que la page soit contrôlée. */
async function swReady(page) {
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    if (r.active.state !== 'activated') {
      await new Promise((res) => r.active.addEventListener('statechange', () => r.active.state === 'activated' && res()));
    }
  });
}

/** Première ouverture : accepte l'écran de confidentialité s'il est affiché. */
async function acceptPrivacyIfAsked(page) {
  if (await page.locator('#privacy-modal.active').count()) await page.click('#btn-privacy-accept');
  await expect(page.locator('#setup-page')).toHaveClass(/active/);
}

/** Ouvre la barre d'actions du bas (repliée par défaut). */
async function openBar(page) {
  if (!(await page.locator('#bar.open').count())) await page.click('#bar-handle-zone');
  await expect(page.locator('#bar')).toHaveClass(/open/);
}

/** Écrit un nom dans un champ en contournant maxlength (comme un profil mémorisé). */
async function setName(page, i, value) {
  await page.locator('.name-input').nth(i).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}

/** Setup → noms → partie, via l'interface (objectif par défaut de l'app). */
async function startGame(page, { players = 3, points = 20, names = [] } = {}) {
  await page.goto('/');
  await acceptPrivacyIfAsked(page);
  await page.locator('#players-grid .player-chip', { hasText: new RegExp(`^${players}$`) }).click();
  await page.fill('#points-custom', String(points));
  await page.click('#go-btn');
  await expect(page.locator('#names-page')).toHaveClass(/active/);
  for (let i = 0; i < names.length; i++) await page.locator('.name-input').nth(i).fill(names[i]);
  await page.click('#names-go-btn');
  await expect(page.locator('.pcard')).toHaveCount(players);
  // Les cartes restent masquées (visibility:hidden) le temps d'ajuster les textes : on attend qu'elles soient visibles
  await expect(page.locator('.pcard').first()).toBeVisible();
}

const score = async (page, i) => +(await page.locator('#sc-' + i).textContent()).replace(/\s/g, '');

/** Clic sur la moitié « + » ou « − » d'une carte, selon sa rotation (cf. getIsPlus). */
async function tapCard(page, i, plus) {
  const box = await page.locator('#card-' + i + ' .tap-zone').boundingBox();
  const rot = await page.evaluate((i) => players[i].rot, i);
  let x = box.x + box.width * (plus ? 0.8 : 0.2), y = box.y + box.height / 2;
  if (rot === 'rot-180') x = box.x + box.width * (plus ? 0.2 : 0.8);
  if (rot === 'rot-l') { x = box.x + box.width / 2; y = box.y + box.height * (plus ? 0.8 : 0.2); }
  if (rot === 'rot-r') { x = box.x + box.width / 2; y = box.y + box.height * (plus ? 0.2 : 0.8); }
  await page.mouse.click(x, y);
}

/** Saisie d'un delta par la modale (clavier numérique), validée par le bouton de signe. */
async function applyDelta(page, i, delta) {
  // L'ouverture peut être ignorée quelques instants après une action précédente (fin de groupe)
  await expect(async () => {
    await focusCard(page, i);
    await page.keyboard.press('Enter');
    await expect(page.locator('#score-modal')).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => document.getElementById('score-modal').contains(document.activeElement))).toBe(true);
  for (const d of String(Math.abs(delta))) await page.keyboard.press(d);
  await page.click(delta < 0 ? '#sign-minus' : '#sign-plus');
  await expect(page.locator('#score-modal')).toBeHidden();
}

/** Contraste WCAG du texte des cartes pour chaque thème (exécuté dans la page). */
function contrastByTheme(page) {
  return page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/);
      if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255];
      const r = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
      return r ? [+r[1], +r[2], +r[3]] : null;
    };
    const L = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const CR = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const out = {};
    for (const th of THEMES) {
      applyTheme(th.id);
      let min = 99, worst = '';
      document.querySelectorAll('.pcard').forEach((c) => {
        const bg = parse(getComputedStyle(c).backgroundColor);
        for (const sel of ['.pplayer', '.score']) {
          const el = c.querySelector(sel);
          if (!el) continue;
          const v = CR(parse(getComputedStyle(el).color), bg);
          if (v < min) { min = v; worst = `${c.id}${sel}`; }
        }
      });
      out[th.id] = { min: +min.toFixed(2), worst };
    }
    applyTheme('dark');
    return out;
  });
}

/** Donne le focus à une carte joueur : attend qu'elle soit visible (l'app masque les cartes
 *  le temps d'ajuster les textes) et réessaie si un rendu a remplacé l'élément. */
async function focusCard(page, i) {
  const card = page.locator('#card-' + i);
  await expect(card).toBeVisible();
  await expect(async () => {
    await card.focus();
    await expect(card).toBeFocused({ timeout: 300 });
  }).toPass({ timeout: 7000 });
}

module.exports = { focusCard, test, expect, APP, XSS_NAME, seedStorage, storage, json, swReady, startGame, score, applyDelta, tapCard, openBar, setName, acceptPrivacyIfAsked, contrastByTheme };
