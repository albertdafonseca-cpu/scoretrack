// Audit daltonisme : simulation Machado 2009 (protanopie, deutéranopie, tritanopie à 100 %)
// sur la palette joueurs Paul Tol (12 couleurs) et sur la paire sémantique --gain / --loss.
//
// CE QUE CE SCRIPT FAIT ÉCHOUER, ET CE QU'IL SE CONTENTE DE MESURER (décision D17 : une tolérance
// assumée et écrite est légitime, une tolérance sous-entendue dans le code ne l'est pas).
//
// Portes dures — le script sort en 1 si l'une cède :
//   1. séparabilité de la sous-palette réellement en jeu jusqu'à SEPARABLE_MAX joueurs :
//      ΔE2000 ≥ SEPARABLE_MIN_DE entre chaque paire, sous les trois simulations ;
//   2. paire sémantique gain/perte : ΔE2000 ≥ PAIR_MIN_DE ET écart de luminance relative
//      ≥ PAIR_MIN_LUM, sous les trois simulations ;
//   3. identification NON CHROMATIQUE de chaque carte à 12 joueurs (D18), relevée dans la page ;
//   4. budget de régression figé sur les douze couleurs : ni une paire serrée de plus, ni un ΔE
//      minimal plus bas que la mesure du jour, simulation par simulation (PALETTE_BUDGET).
//
// Mesuré SANS faire échouer, et pourquoi : le seuil de référence ΔE2000 ≥ PALETTE_MIN appliqué aux
// 66 paires des douze couleurs. Un dichromate ne perçoit que deux axes chromatiques ; au-delà de
// trois teintes, aucune palette de douze couleurs ne tient ce seuil deux à deux — c'est une limite
// de la perception humaine, pas un réglage de l'application, et aucune valeur de couleur ne la
// lèverait. Le faire échouer rendrait le script rouge en permanence sans indiquer quoi corriger.
// Cette impossibilité n'est pas pour autant une dispense : elle est compensée par la porte 1 (la
// sous-palette réellement en jeu reste séparable), par la porte 3 (au-delà, la couleur cesse d'être
// un identifiant et chaque carte porte un numéro de siège et un nom) et par la porte 4 (l'acquis
// mesuré ne peut plus se dégrader). Les 66 paires restent listées dans le rapport, avec leur ΔE.
//
// Usage : node scripts/audit-cvd.mjs [--out rapport.md] [--json couleurs-resolues.json]
//         [--shots dossier]   → captures de l'écran de jeu à 12 joueurs sous les 3 déficiences
//         [--url http://localhost:8765/]
// Le JSON optionnel est celui produit par audit-contrast.mjs --json : il permet d'auditer aussi
// les fonds de cartes dérivés de chaque thème.
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

/**
 * Seuils réellement atteignables, MESURÉS et non supposés (la courbe complète est dans le rapport).
 *
 * Un dichromate ne perçoit que deux axes chromatiques : douze teintes n'y sont pas séparables deux
 * à deux, quelle que soit la palette. Mesure de la palette Tol dans l'ordre en place,
 * ΔE2000 minimal du préfixe de n couleurs (celles en jeu à n joueurs), pire des trois simulations :
 * L'ordre a été refait (palette et jetons réordonnés ensemble) et la mesure d'aujourd'hui donne :
 *   n=2 40,2 · n=3 29,9 · n=4 20,1 · n=5 15,7 · n=6 15,7 · n=7 11,2 · n=8 10,6 · n=9 8,6 · n=12 3,2
 * (gris --tol-6 #c4c8c4 : la paire cyan/gris tombait à 15,1 en protanopie avec #bbbbbb, à un dixième
 * de la référence — une valeur qui n'a pas de marge n'est pas un acquis, décision D21.)
 * La porte suit donc ce que le produit sait faire : SEPARABLE_MAX = 6 et SEPARABLE_MIN_DE = 15, la
 * référence elle-même, avec 0.7 de marge. Elle ne doit jamais être relâchée pour faire passer
 * une régression — c'est elle qui protège l'acquis.
 * D'où le contrat tenu, écrit tel qu'il est atteint :
 *   — jusqu'à SEPARABLE_MAX joueurs, les couleurs en jeu gardent ΔE ≥ SEPARABLE_MIN_DE (porte dure) ;
 *   — au-delà, la couleur cesse d'être un identifiant et D18 prend le relais : chaque carte porte
 *     un numéro de siège et un nom, vérifiés ci-dessous (porte dure) ;
 *   — sur les douze, aucune régression par rapport à la mesure du jour (budget figé).
 * Toute dégradation fait échouer la construction (D13, D17). Ces chiffres ne se relèvent qu'en
 * expliquant pourquoi la palette a bougé.
 */
const SEPARABLE_MAX = 6;
const SEPARABLE_MIN_DE = 15;
/** Marge de déterminisme (D21), la même que scripts/audit-contrast.mjs : sous le seuil + MARGIN, un
    ΔE est déclaré insuffisant plutôt que publié comme un résultat qui oscillerait d'une mesure à
    l'autre — un gris qui régresserait à sa valeur d'origine (ΔE 15,1) passait silencieusement à
    0,1 au-dessus du seuil brut ; il échoue désormais, comme il doit. */
const MARGIN = 0.2;
const PALETTE_BUDGET = {
  normale: { maxPairs: 2, minDE: 6.5 },
  protanopie: { maxPairs: 9, minDE: 5.1 },
  deuteranopie: { maxPairs: 8, minDE: 6.3 },
  tritanopie: { maxPairs: 9, minDE: 3.2 },
};
/** Tolérance d'arrondi sur le ΔE minimal figé. */
const DE_EPS = 0.05;

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
  const stats = {};
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
    stats[kind] = { count: bad.length, min };
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
  return stats;
}

/**
 * Courbe de séparabilité par nombre de joueurs : à n joueurs, seules les n premières couleurs sont
 * en jeu. Porte dure jusqu'à SEPARABLE_MAX joueurs ; au-delà, la mesure est publiée telle quelle.
 */
function auditPrefixes(hexes, lines) {
  const cols = hexes.map(parseColor);
  let worst = Infinity;
  lines.push(
    '| Joueurs | vision normale | protanopie | deutéranopie | tritanopie | porte |',
    '|---|---|---|---|---|---|',
  );
  for (let n = 2; n <= cols.length; n++) {
    const mins = ['normale', ...KINDS].map((kind) => {
      const sim = cols.slice(0, n).map((c) => (kind === 'normale' ? c : simulateCvd(c, kind)));
      let min = Infinity;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) min = Math.min(min, deltaE2000(sim[i], sim[j]));
      }
      return min;
    });
    const m = Math.min(...mins);
    const gated = n <= SEPARABLE_MAX;
    if (gated) worst = Math.min(worst, m);
    lines.push(
      `| ${n} | ${mins.map((v) => v.toFixed(1)).join(' | ')} | ${
        gated
          ? m >= SEPARABLE_MIN_DE + MARGIN
            ? `OK (≥ ${SEPARABLE_MIN_DE} + ${MARGIN})`
            : '**ÉCHEC**'
          : 'D18 (siège + nom)'
      } |`,
    );
  }
  lines.push('');
  return { ok: worst >= SEPARABLE_MIN_DE + MARGIN, worst };
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

/**
 * Pilote une partie à 12 joueurs, vérifie l'identification NON CHROMATIQUE de chaque carte (D18)
 * et, si `dir` est fourni, capture l'écran sous chaque simulation de déficience.
 */
async function inspectGame(dir) {
  const { chromium, devices } = await import('@playwright/test');
  if (dir) mkdirSync(dir, { recursive: true });
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
  await page.locator('#players-grid .player-chip[data-val="12"]').first().click();
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
  // D18 : chaque carte porte-t-elle un identifiant lisible qui ne dépend pas de la couleur ?
  const seats = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.pcard')];
    const floor = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-1'));
    const out = cards.map((card, i) => {
      const marks = [...card.querySelectorAll('.pseat, .pplayer')].filter(
        (el) => el.checkVisibility?.() && el.textContent.trim(),
      );
      const sizes = marks.map((el) => parseFloat(getComputedStyle(el).fontSize));
      return {
        card: i + 1,
        texts: marks.map((el) => el.textContent.trim()),
        size: sizes.length ? Math.max(...sizes) : 0,
      };
    });
    return { cards: cards.length, floor, out };
  });
  const missing = seats.out.filter((c) => !c.texts.length);
  const tooSmall = seats.out.filter((c) => c.texts.length && c.size < seats.floor);
  const seatResult = {
    detail: seats.out,
    ok: seats.cards > 0 && !missing.length && !tooSmall.length,
    cards: seats.cards,
    minSize: seats.out.length ? Math.min(...seats.out.map((c) => c.size)).toFixed(0) : 0,
    problem: missing.length
      ? `${missing.length} carte(s) sans identifiant non chromatique (cartes ${missing.map((c) => c.card).join(', ')})`
      : tooSmall.length
        ? `${tooSmall.length} carte(s) dont l'identifiant est sous le plancher de ${seats.floor} px`
        : '',
  };
  if (!dir) {
    await browser.close();
    return { files: [], seats: seatResult };
  }
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
  return { files: Object.keys(modes).map((m) => join(dir, `cvd-${m}.png`)), seats: seatResult };
}

async function main() {
  const { tol, pairs } = readTokens();
  const lines = ['# Rapport daltonisme (matrices Machado 2009, sévérité 1,0)', ''];
  lines.push(
    `Portes dures : séparabilité ΔE2000 ≥ ${SEPARABLE_MIN_DE} jusqu'à ${SEPARABLE_MAX} joueurs ; gain/perte ΔE2000 ≥ ${PAIR_MIN_DE} avec un écart de luminance ≥ ${PAIR_MIN_LUM * 100} % ; identification non chromatique de chaque carte (D18) ; budget de régression figé sur les douze couleurs. Le seuil de référence ΔE ≥ ${PALETTE_MIN} reste affiché pour situer la mesure : il n'est pas atteignable au-delà de 3 teintes en dichromatie, c'est une limite de la perception et non un réglage.`,
    '',
  );
  lines.push('## Palette joueurs Paul Tol « bright » (--tol-1 … --tol-12)', '');
  const stats = auditPalette(tol, 'Couleurs pleines (avatars, pastilles, puces)', lines);
  lines.push(
    `### Séparabilité selon le nombre de joueurs — porte dure jusqu'à ${SEPARABLE_MAX}`,
    '',
    `À n joueurs, seules les n premières couleurs sont en jeu. Jusqu'à ${SEPARABLE_MAX} joueurs, elles doivent rester séparables à ΔE2000 ≥ ${SEPARABLE_MIN_DE} sous les trois simulations ; au-delà, la couleur cesse d'être un identifiant et l'identification repose sur le numéro de siège et le nom (D18, vérifiés plus bas).`,
    '',
  );
  const subset = auditPrefixes(tol, lines);
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

  // ── Portes ────────────────────────────────────────────────────────
  const regressions = [];
  for (const [kind, budget] of Object.entries(PALETTE_BUDGET)) {
    const st = stats[kind];
    if (!st) continue;
    if (st.count > budget.maxPairs) {
      regressions.push(
        `${kind} : ${st.count} paires < ${PALETTE_MIN} (budget figé : ${budget.maxPairs})`,
      );
    }
    if (st.min < budget.minDE - DE_EPS) {
      regressions.push(
        `${kind} : ΔE minimal ${st.min.toFixed(1)} (plancher figé : ${budget.minDE})`,
      );
    }
  }
  const game = await inspectGame(SHOTS);
  const seats = game.seats;

  lines.push('## Verdict', '');
  lines.push(
    `- Palette de 12 couleurs : ${Object.entries(stats)
      .filter(([k]) => k !== 'normale')
      .map(([k, v]) => `${k} ${v.count} paires < ${PALETTE_MIN} (ΔE min ${v.min.toFixed(1)})`)
      .join(
        ', ',
      )}. Douze teintes ne sont pas séparables deux à deux en dichromatie : c'est une limite de la perception, pas un réglage. Le contrat tenu est donc double — sous-palette de ${SEPARABLE_MAX} séparable, et aucune régression sur les douze.`,
  );
  lines.push(
    subset.ok
      ? `- Séparabilité jusqu'à ${SEPARABLE_MAX} joueurs : ΔE minimal ${subset.worst.toFixed(1)} ≥ ${SEPARABLE_MIN_DE} + ${MARGIN} (marge D21) sous les trois simulations (OK).`
      : `- Séparabilité jusqu'à ${SEPARABLE_MAX} joueurs : **ÉCHEC** (ΔE minimal ${subset.worst.toFixed(1)} < ${(SEPARABLE_MIN_DE + MARGIN).toFixed(1)}, seuil ${SEPARABLE_MIN_DE} + marge D21 ${MARGIN}).`,
  );
  lines.push(
    regressions.length
      ? `- Budget de régression : **ÉCHEC** — ${regressions.join(' ; ')}.`
      : '- Budget de régression de la palette : tenu.',
  );
  lines.push(
    pairOk
      ? '- Gain / perte : distinguables sous les trois simulations (OK).'
      : '- Gain / perte : **ÉCHEC**.',
  );
  if (seats) {
    lines.push(
      seats.ok
        ? `- Identification non chromatique (D18) : les ${seats.cards} cartes portent un numéro de siège lisible (${seats.minSize} px au minimum).`
        : `- Identification non chromatique (D18) : **ÉCHEC** — ${seats.problem}.`,
    );
  }
  lines.push(
    '',
    `Ce qui fait échouer ce script : séparabilité de la sous-palette en jeu jusqu'à ${SEPARABLE_MAX} joueurs, paire gain/perte, identification non chromatique de chaque carte, budget de régression figé sur les douze couleurs. Ce qui est mesuré SANS faire échouer : le seuil de référence ΔE2000 ≥ ${PALETTE_MIN} sur les 66 paires des douze couleurs — aucune palette de douze teintes ne le tient en dichromatie, c'est une limite de la perception et non un réglage, et aucune valeur de couleur ne la lèverait. La tolérance est écrite ici et dans l'en-tête du script, jamais laissée sous-entendue (D17) ; elle est compensée par les quatre portes ci-dessus.`,
  );
  if (game.files.length) {
    lines.push(
      '',
      '## Captures (écran de jeu, 12 joueurs)',
      '',
      ...game.files.map((f) => `- ${f}`),
    );
  }
  lines.push(
    '',
    '## Identification non chromatique (D18)',
    '',
    '| Carte | Identifiants rendus | Taille max (px) |',
    '|---|---|---|',
    ...(seats.detail || []).map(
      (c) => `| ${c.card} | ${c.texts.join(' · ') || '—'} | ${c.size.toFixed(0)} |`,
    ),
  );
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(lines.slice(lines.indexOf('## Verdict')).join('\n'));
  console.log(`→ ${OUT}`);
  const ok = pairOk && subset.ok && regressions.length === 0 && (!seats || seats.ok);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
