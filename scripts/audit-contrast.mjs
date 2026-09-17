// Audit de contraste WCAG 2.x sur les couleurs RÉELLEMENT calculées par Chromium (color-mix,
// light-dark, alpha…) : 14 thèmes (+ « auto » clair/sombre) × 10 cartes × 3 états de score,
// plus les paires texte/fond de l'interface (texte, muted2, accents, puces, boutons, sémantique).
//
// Usage : node scripts/audit-contrast.mjs [--url http://localhost:8765/] [--out rapport.md]
//         [--json couleurs.json]
// Sortie : tableau Markdown (défaut test-results/contrast-report.md), code 1 s'il reste un échec.
// Seuils : 4,5:1 texte (y compris le score, cible AAA du projet), 3:1 composants / anneau de focus.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { composite, contrast, toHex } from './lib/color.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const URL = opt('--url', process.env.BASE_URL || 'http://localhost:8765/');
const OUT = opt('--out', 'test-results/contrast-report.md');
const JSON_OUT = opt('--json', null);

/** Thèmes audités : identifiant CSS + schéma de couleurs émulé (pour « auto »). */
const THEMES = [
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

const TEXT = 4.5;
const UI = 3;

/**
 * Paires (premier plan, arrière-plan, seuil, libellé) exprimées en jetons.
 * Le seuil 4,5 s'applique à tout texte, quelle que soit sa taille (cible du projet) ;
 * 3 aux composants non textuels (signes tactiles, anneau de focus, état sélectionné).
 */
const UI_PAIRS = [
  ['text', 'bg', TEXT, 'texte sur page'],
  ['text', 'bg2', TEXT, 'texte sur barre/modale'],
  ['text', 'surface', TEXT, 'texte sur bouton/carte UI'],
  ['text', 'surface2', TEXT, 'texte sur bouton secondaire'],
  ['muted2', 'bg', TEXT, 'texte secondaire sur page'],
  ['muted2', 'bg2', TEXT, 'texte secondaire sur modale'],
  ['muted2', 'surface', TEXT, 'texte secondaire sur bouton'],
  ['muted2', 'surface2', TEXT, 'texte secondaire sur bouton secondaire'],
  ['accent', 'bg', TEXT, 'accent (titres, CTA) sur page'],
  ['accent', 'bg2', TEXT, 'accent sur modale/barre'],
  ['accent', 'surface', TEXT, 'accent sur bouton'],
  ['accent2', 'bg', TEXT, 'accent secondaire (libellés) sur page'],
  ['accent2', 'surface', TEXT, 'accent secondaire sur carte UI'],
  ['bg', 'accent', TEXT, 'texte du CTA plein'],
  ['chip-text', 'chip-bg', TEXT, 'puce non sélectionnée'],
  ['chip-on-text', 'chip-on', TEXT, 'puce sélectionnée'],
  ['chip-on', 'chip-bg', UI, 'état sélectionné vs non sélectionné'],
  ['gain', 'bg', TEXT, 'gain sur page'],
  ['gain', 'bg2', TEXT, 'gain sur modale'],
  ['gain', 'surface', TEXT, 'gain sur carte UI (récap)'],
  ['loss', 'bg', TEXT, 'perte sur page'],
  ['loss', 'bg2', TEXT, 'perte sur modale'],
  ['loss', 'surface', TEXT, 'perte sur carte UI (récap)'],
  ['warn', 'bg', TEXT, 'avertissement sur page'],
  ['red', 'bg2', TEXT, 'danger (compat --red) sur barre'],
  ['red', 'surface', TEXT, 'danger (compat --red) sur bouton'],
  ['green', 'bg', TEXT, 'confirmation (compat --green) sur page'],
  ['focus', 'bg', UI, 'anneau de focus sur page'],
  ['focus', 'surface', UI, 'anneau de focus sur bouton'],
  ['focus', 'surface2', UI, 'anneau de focus sur bouton secondaire'],
];

const TOKENS = [
  ...new Set(UI_PAIRS.flatMap(([a, b]) => [a, b]).concat(['card-text', 'card-sign', 'muted'])),
];

/** Exécuté dans la page : résout les jetons et les couleurs de cartes en RGBA 8 bits. */
function probeColors(tokens) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const toRgba = (str) => {
    const m = str.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = str;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255, raw: str };
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:100px;height:100px';
  document.body.appendChild(host);
  const probe = document.createElement('span');
  host.appendChild(probe);
  const out = { tokens: {}, cards: [], fonts: {} };
  for (const t of tokens) {
    probe.style.color = '';
    probe.style.color = `var(--${t})`;
    out.tokens[t] = toRgba(getComputedStyle(probe).color);
  }
  for (let i = 1; i <= 10; i++) {
    const card = document.createElement('div');
    card.className = `pcard color-${i} rot-0`;
    card.innerHTML =
      '<div class="card-inner"><div class="tap-zone"><div class="pplayer">n</div>' +
      '<div class="score-wrap"><span class="score">0</span><span class="score low">0</span>' +
      '<span class="score crit">0</span></div><span class="tap-sign-plus">+</span></div></div>';
    host.appendChild(card);
    const cs = (sel) => getComputedStyle(card.querySelector(sel));
    const signStyle = cs('.tap-sign-plus');
    const sign = toRgba(signStyle.color);
    sign.a *= Number(signStyle.opacity);
    out.cards.push({
      bg: toRgba(getComputedStyle(card).backgroundColor),
      score: toRgba(cs('.score:not(.low):not(.crit)').color),
      low: toRgba(cs('.score.low').color),
      crit: toRgba(cs('.score.crit').color),
      name: toRgba(cs('.pplayer').color),
      sign,
    });
  }
  for (const f of ['font-display', 'font-ui', 'font-score']) {
    probe.style.fontFamily = `var(--${f})`;
    out.fonts[f] = getComputedStyle(probe).fontFamily;
  }
  host.remove();
  return out;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });

  const rows = [];
  const resolved = {};
  let fails = 0;
  const check = (theme, label, fg, bg, min) => {
    const f = composite(fg, bg);
    const ratio = contrast(f, bg);
    const ok = ratio >= min;
    if (!ok) fails++;
    rows.push({ theme, label, fg: toHex(f), bg: toHex(bg), ratio, min, ok });
  };

  for (const [id, scheme] of THEMES) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t === 'cyber' ? '' : t);
    }, id);
    const name = id === 'auto' ? `auto (${scheme})` : id;
    const data = await page.evaluate(probeColors, TOKENS);
    resolved[name] = data;
    const T = data.tokens;
    data.cards.forEach((c, i) => {
      const n = i + 1;
      check(name, `carte ${n} · score`, c.score, c.bg, TEXT);
      check(name, `carte ${n} · score bas`, c.low, c.bg, TEXT);
      check(name, `carte ${n} · score critique`, c.crit, c.bg, TEXT);
      check(name, `carte ${n} · nom`, c.name, c.bg, TEXT);
      check(name, `carte ${n} · signes +/−`, c.sign, c.bg, UI);
      check(name, `carte ${n} · bulle gain`, T.gain, c.bg, UI);
      check(name, `carte ${n} · bulle perte`, T.loss, c.bg, UI);
    });
    for (const [fg, bg, min, label] of UI_PAIRS) check(name, label, T[fg], T[bg], min);
  }
  await browser.close();

  const lines = [];
  lines.push('# Rapport de contraste WCAG 2.x (couleurs calculées par Chromium)', '');
  lines.push(`URL : ${URL} — ${new Date().toISOString().slice(0, 10)}`);
  lines.push(
    `Paires vérifiées : **${rows.length}** · échecs : **${fails}** · seuils : texte ≥ ${TEXT}:1 (score inclus), composants ≥ ${UI}:1.`,
  );
  lines.push('');
  lines.push(
    'Exclusions assumées : `--muted` (gris décoratif, jamais utilisé pour du texte) ; la texture de carte `.card-inner::after` (opacité ≤ 0,28, motif linéaire) et les bordures alpha `--border` (composants identifiés par leur libellé, WCAG 1.4.11 non requis) ne sont pas comptées.',
  );
  lines.push('');
  const byTheme = new Map();
  for (const r of rows) {
    if (!byTheme.has(r.theme)) byTheme.set(r.theme, []);
    byTheme.get(r.theme).push(r);
  }
  lines.push(
    '## Synthèse par thème',
    '',
    '| Thème | Paires | Échecs | Ratio min | Familles de polices |',
    '|---|---|---|---|---|',
  );
  for (const [theme, list] of byTheme) {
    const min = Math.min(...list.map((r) => r.ratio));
    const nf = list.filter((r) => !r.ok).length;
    const fams = new Set(
      Object.values(resolved[theme].fonts).map((f) => f.split(',')[0].replace(/["']/g, '').trim()),
    );
    lines.push(
      `| ${theme} | ${list.length} | ${nf} | ${min.toFixed(2)} | ${[...fams].join(', ')} (${fams.size}) |`,
    );
  }
  lines.push(
    '',
    '## Détail',
    '',
    '| Thème | Élément | Premier plan | Fond | Ratio | Seuil | Verdict |',
    '|---|---|---|---|---|---|---|',
  );
  for (const r of rows) {
    lines.push(
      `| ${r.theme} | ${r.label} | \`${r.fg}\` | \`${r.bg}\` | ${r.ratio.toFixed(2)} | ${r.min} | ${r.ok ? 'OK' : '**ÉCHEC**'} |`,
    );
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join('\n') + '\n');
  if (JSON_OUT) {
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, JSON.stringify(resolved, null, 2));
  }
  const failing = rows.filter((r) => !r.ok);
  for (const r of failing) {
    console.log(
      `ÉCHEC ${r.theme} · ${r.label} : ${r.fg} sur ${r.bg} = ${r.ratio.toFixed(2)} (< ${r.min})`,
    );
  }
  console.log(`${rows.length} paires, ${fails} échec(s) → ${OUT}`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
