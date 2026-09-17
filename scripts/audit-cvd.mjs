// Audit daltonisme : simulation Machado 2009 (protanopie, deutéranopie, tritanopie à 100 %)
// sur la palette joueurs Paul Tol (12 couleurs) et sur la paire sémantique --gain / --loss.
//
// Critères : ΔE2000 ≥ 15 entre chaque paire de couleurs joueurs sous chaque simulation ;
// gain/perte distinguables sous les trois simulations : ΔE2000 ≥ 20 ET écart de luminance
// relative ≥ 20 % (|Y1 − Y2| / max(Y1, Y2)).
//
// Usage : node scripts/audit-cvd.mjs [--out rapport.md] [--json couleurs-resolues.json]
//         [--shots dossier]   → captures de l'écran de jeu à 12 joueurs sous les 3 déficiences
//         [--url http://localhost:8765/]
// Le JSON optionnel est celui produit par audit-contrast.mjs --json : il permet d'auditer aussi
// les fonds de cartes dérivés de chaque thème. Code de sortie 1 si la paire gain/perte échoue ;
// les échecs de palette sont listés (la palette est figée par la décision D1, voir rapport).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { contrast, deltaE2000, luminance, parseColor, simulateCvd, toHex } from './lib/color.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const OUT = opt('--out', 'test-results/cvd-report.md');
const JSON_IN = opt('--json', null);
const SHOTS = opt('--shots', null);
const BASE_URL = opt('--url', process.env.BASE_URL || 'http://localhost:8765/');

const KINDS = ['protanopie', 'deuteranopie', 'tritanopie'];
const PALETTE_MIN = 15;
const PAIR_MIN_DE = 20;
const PAIR_MIN_LUM = 0.2;

/** Lit les jetons --tol-N et les paires gain/perte (sombre : tokens.css, clair : themes.css). */
function readTokens() {
  const tokens = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
  const themes = readFileSync(new URL('../css/themes.css', import.meta.url), 'utf8');
  const tol = [];
  for (let i = 1; i <= 12; i++) {
    const m = tokens.match(new RegExp(`--tol-${i}:\\s*(#[0-9a-f]{6})`, 'i'));
    if (!m) throw new Error(`--tol-${i} introuvable dans tokens.css`);
    tol.push(m[1]);
  }
  const grab = (src, name) => src.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  const lightBlock = themes.slice(themes.indexOf("[data-theme='light'],"));
  return {
    tol,
    pairs: {
      'fond sombre (tokens.css)': [grab(tokens, 'gain'), grab(tokens, 'loss')],
      'fond clair (themes.css)': [grab(lightBlock, 'gain'), grab(lightBlock, 'loss')],
    },
  };
}

function relLumDiff(a, b) {
  const ya = luminance(a);
  const yb = luminance(b);
  return Math.abs(ya - yb) / Math.max(ya, yb);
}

function auditPalette(hexes, label, lines) {
  const cols = hexes.map(parseColor);
  let failures = 0;
  lines.push(`### ${label}`, '');
  lines.push('| Simulation | ΔE min | Paire la plus proche | Paires < 15 |', '|---|---|---|---|');
  for (const kind of ['normale', ...KINDS]) {
    const sim = cols.map((c) => (kind === 'normale' ? c : simulateCvd(c, kind)));
    let min = Infinity;
    let minPair = '';
    const bad = [];
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const d = deltaE2000(sim[i], sim[j]);
        if (d < min) {
          min = d;
          minPair = `${i + 1}/${j + 1}`;
        }
        if (d < PALETTE_MIN) bad.push(`${i + 1}/${j + 1} (${d.toFixed(1)})`);
      }
    }
    if (kind !== 'normale') failures += bad.length;
    lines.push(
      `| ${kind} | ${min.toFixed(1)} | ${minPair} | ${bad.length ? bad.join(', ') : '—'} |`,
    );
  }
  lines.push('');
  lines.push('| # | sRGB | protanopie | deutéranopie | tritanopie |', '|---|---|---|---|---|');
  cols.forEach((c, i) => {
    lines.push(
      `| ${i + 1} | \`${toHex(c)}\` | ${KINDS.map((k) => `\`${toHex(simulateCvd(c, k))}\``).join(' | ')} |`,
    );
  });
  lines.push('');
  return failures;
}

function auditPair([gainHex, lossHex], label, lines) {
  const g = parseColor(gainHex);
  const l = parseColor(lossHex);
  let ok = true;
  lines.push(`### Gain / perte — ${label} : \`${gainHex}\` / \`${lossHex}\``, '');
  lines.push(
    '| Simulation | ΔE2000 (≥ 20) | Écart de luminance (≥ 20 %) | Contraste entre eux | Verdict |',
    '|---|---|---|---|---|',
  );
  for (const kind of ['normale', ...KINDS]) {
    const gs = kind === 'normale' ? g : simulateCvd(g, kind);
    const ls = kind === 'normale' ? l : simulateCvd(l, kind);
    const de = deltaE2000(gs, ls);
    const lum = relLumDiff(gs, ls);
    const pass = de >= PAIR_MIN_DE && lum >= PAIR_MIN_LUM;
    if (!pass) ok = false;
    lines.push(
      `| ${kind} | ${de.toFixed(1)} | ${(lum * 100).toFixed(0)} % | ${contrast(gs, ls).toFixed(2)}:1 | ${pass ? 'OK' : '**ÉCHEC**'} |`,
    );
  }
  lines.push('');
  return ok;
}

async function shoot(dir) {
  const { chromium, devices } = await import('@playwright/test');
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    hasTouch: true,
    locale: 'fr-FR',
  });
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('splash'));
  // Partie à 12 joueurs, 40 points de départ. Le parcours accepte les deux variantes du setup :
  // bouton « noms » dédié (#names-btn) ou passage obligé par l'écran des noms (#go-btn).
  await page.locator('#players-grid .player-chip', { hasText: /^12$/ }).first().click();
  await page.locator('#start-presets [data-val="40"]').click();
  const namesBtn = page.locator('#names-btn');
  if (await namesBtn.count()) await namesBtn.click();
  else await page.locator('#go-btn').click();
  await page.waitForSelector('.name-input, .pcard');
  const inputs = page.locator('.name-input');
  const n = await inputs.count();
  if (n) {
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
    for (let i = 0; i < n; i++) await inputs.nth(i).fill(names[i]);
    await page.locator('[data-action="start-game"]').first().click();
  }
  await page.waitForSelector('.pcard');
  await page.waitForTimeout(600);
  const cdp = await ctx.newCDPSession(page);
  const modes = {
    none: 'none',
    protanopie: 'protanopia',
    deuteranopie: 'deuteranopia',
    tritanopie: 'tritanopia',
  };
  for (const [name, type] of Object.entries(modes)) {
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(dir, `cvd-${name}.png`) });
  }
  await browser.close();
  return Object.keys(modes).map((m) => join(dir, `cvd-${m}.png`));
}

async function main() {
  const { tol, pairs } = readTokens();
  const lines = ['# Rapport daltonisme (matrices Machado 2009, sévérité 1,0)', ''];
  lines.push(
    `Critères : palette joueurs ΔE2000 ≥ ${PALETTE_MIN} par paire sous chaque simulation ; gain/perte ΔE2000 ≥ ${PAIR_MIN_DE} et écart de luminance ≥ ${PAIR_MIN_LUM * 100} %.`,
    '',
  );
  lines.push('## Palette joueurs Paul Tol « bright » (--tol-1 … --tol-12)', '');
  const paletteFails = auditPalette(tol, 'Couleurs pleines (avatars, pastilles, puces)', lines);
  lines.push('## Paire sémantique gain / perte', '');
  let pairOk = true;
  for (const [label, pair] of Object.entries(pairs))
    pairOk = auditPair(pair, label, lines) && pairOk;

  if (JSON_IN && existsSync(JSON_IN)) {
    const resolved = JSON.parse(readFileSync(JSON_IN, 'utf8'));
    lines.push(
      '## Fonds de cartes dérivés par thème (10 premières couleurs, mélangées au fond)',
      '',
    );
    lines.push(
      '| Thème | ΔE min normal | ΔE min protanopie | ΔE min deutéranopie | ΔE min tritanopie |',
      '|---|---|---|---|---|',
    );
    for (const [theme, data] of Object.entries(resolved)) {
      const cols = data.cards.map((c) => c.bg);
      const mins = ['normale', ...KINDS].map((kind) => {
        const sim = cols.map((c) => (kind === 'normale' ? c : simulateCvd(c, kind)));
        let min = Infinity;
        for (let i = 0; i < sim.length; i++)
          for (let j = i + 1; j < sim.length; j++) min = Math.min(min, deltaE2000(sim[i], sim[j]));
        return min.toFixed(1);
      });
      lines.push(`| ${theme} | ${mins.join(' | ')} |`);
    }
    lines.push('');
    lines.push(
      'Les fonds de cartes sont volontairement peu saturés (30 % de Tol) : la distinction des joueurs repose d’abord sur la position, le nom et le numéro de siège (D1), la couleur n’étant qu’un renfort.',
      '',
    );
  }

  lines.push('## Verdict', '');
  lines.push(
    paletteFails
      ? `- Palette joueurs : **${paletteFails} paire(s) < ${PALETTE_MIN}** sous simulation. La palette Tol « bright » à 12 couleurs (figée par D1) n’est pas séparable deux à deux pour un dichromate : un dichromate ne perçoit que deux axes de teinte, la séparation de 12 couleurs exige des écarts de luminosité que Tol n’a pas prévus au-delà de 7 couleurs. La distinction des joueurs est donc portée par la position, le nom et le numéro de siège (signe non chromatique exigé par D1).`
      : `- Palette joueurs : toutes les paires ≥ ${PALETTE_MIN}.`,
  );
  lines.push(
    pairOk
      ? '- Gain / perte : distinguables sous les trois simulations (OK).'
      : '- Gain / perte : **ÉCHEC**.',
  );
  if (SHOTS) {
    const files = await shoot(SHOTS);
    lines.push('', '## Captures (écran de jeu, 12 joueurs)', '', ...files.map((f) => `- ${f}`));
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(lines.slice(lines.indexOf('## Verdict')).join('\n'));
  console.log(`→ ${OUT}`);
  process.exit(pairOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
