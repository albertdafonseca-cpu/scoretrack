// Page d'accueil (setup) : préréglages, nombre de joueurs, points de départ/maximum, scores négatifs,
// défauts mémorisés, aperçu textuel, bannière de reprise avec aperçu de la partie sauvegardée.
import { GAME_PRESETS } from '../core/constants.js';
import { fmtNum } from '../core/format.js';
import { KEYS, parseGame } from '../core/save-schema.js';
import { readJSON } from '../platform/storage.js';
import { store } from '../store.js';
import { announce, rovingGroup, syncRovingTabs } from './a11y.js';
import { byId, el, qsa, show, hide } from './dom.js';
import { lastNamesFor, persistSettings } from './settings.js';

const { config } = store;

/** Valeurs sensées appliquées à froid (aucun défaut mémorisé) : le CTA est actif dès l'accueil. */
export const FALLBACK_DEFAULTS = Object.freeze({
  players: 4,
  start: 0,
  max: Infinity,
  neg: false,
});

/** Borne haute des saisies libres (7 chiffres, comme le pavé de jeu). */
const MAX_VALUE = 9_999_999;

/** Clé de mémoire des noms quand aucun préréglage n'est actif. */
export const CUSTOM_PRESET_KEY = 'custom';

/** Préréglage explicitement choisi (null = personnalisé). */
let activePreset = null;
let startInvalid = false;
let maxInvalid = false;

// ── État dérivé ─────────────────────────────────────────────────────

/** Nom du préréglage actif, ou `custom` : sert de clé aux derniers noms utilisés. */
export function currentPresetKey() {
  return activePreset ? activePreset.name : CUSTOM_PRESET_KEY;
}

function presetMatches(p) {
  return (
    p.players === config.numPlayers &&
    p.start === config.startPoints &&
    (p.max > 0 ? p.max : Infinity) === config.maxPoints &&
    p.neg === config.allowNeg
  );
}

/** Vrai si la configuration peut être lancée. */
export function isFormValid() {
  return (
    config.numPlayers >= 1 &&
    config.startPoints >= 0 &&
    !startInvalid &&
    !maxInvalid &&
    (config.maxPoints === Infinity || config.maxPoints >= config.startPoints)
  );
}

/** Texte d'aperçu : « 4 joueurs · départ 0 · sans limite ». */
export function summaryText() {
  const n = config.numPlayers;
  const parts = [
    `${n} joueur${n > 1 ? 's' : ''}`,
    `départ ${fmtNum(config.startPoints)}`,
    config.maxPoints === Infinity ? 'sans limite' : `max ${fmtNum(config.maxPoints)}`,
  ];
  if (config.allowNeg) parts.push('négatifs');
  return parts.join(' · ');
}

function setPressed(node, on) {
  node.classList.toggle('on', on);
  node.setAttribute('aria-pressed', on ? 'true' : 'false');
}

/** Resynchronise tout l'affichage à partir de `config` (source unique de vérité). */
function refresh() {
  revalidateMaxInput();
  if (activePreset && !presetMatches(activePreset)) activePreset = null;

  qsa('#players-grid .player-chip').forEach((c) =>
    setPressed(c, Number(c.dataset.val) === config.numPlayers),
  );
  qsa('#start-presets .points-chip').forEach((c) =>
    setPressed(c, !startInvalid && Number(c.dataset.val) === config.startPoints),
  );

  // Maximum : les puces inférieures au départ sont désactivées ; une puce pressée devenue
  // invalide est relâchée (retour à « sans limite »).
  qsa('#max-presets .points-chip').forEach((c) => {
    const v = Number(c.dataset.val);
    const disabled = v < config.startPoints;
    c.disabled = disabled;
    c.classList.toggle('disabled', disabled);
    if (disabled && config.maxPoints === v) config.maxPoints = Infinity;
    setPressed(c, !maxInvalid && config.maxPoints === v);
  });

  qsa('#presets-grid .preset-card').forEach((c) =>
    setPressed(c, activePreset !== null && c.dataset.preset === activePreset.name),
  );
  const custom = byId('preset-custom');
  custom.hidden = activePreset !== null;
  setPressed(custom, activePreset === null);

  const neg = byId('neg-toggle');
  neg.classList.toggle('on', config.allowNeg);
  neg.setAttribute('aria-checked', config.allowNeg ? 'true' : 'false');

  const ok = isFormValid();
  byId('go-btn').disabled = !ok;
  byId('names-btn').disabled = !ok;
  byId('setup-summary').textContent = ok ? summaryText() : 'Corrigez les valeurs signalées.';
  renderLastNamesHint();

  [
    ['players-grid', '.player-chip'],
    ['start-presets', '.points-chip'],
    ['max-presets', '.points-chip'],
    ['presets-grid', '.preset-card'],
  ].forEach(([id, sel]) => syncRovingTabs(byId(id), sel));
}

/** Rappelle les derniers noms mémorisés pour le préréglage actif (utilisés par « Lancer »). */
function renderLastNamesHint() {
  const hint = byId('setup-names-hint');
  const names = lastNamesFor(currentPresetKey(), config.numPlayers).filter(Boolean);
  if (!names.length) {
    hint.hidden = true;
    hint.textContent = '';
    return;
  }
  hint.hidden = false;
  hint.textContent = `Derniers noms : ${names.join(', ')}`;
}

function setFieldError(input, errorId, message) {
  const err = byId(errorId);
  const invalid = Boolean(message);
  err.textContent = message || '';
  err.hidden = !invalid;
  input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  input.classList.toggle('is-invalid', invalid);
}

/** Le champ « autre maximum » doit rester ≥ départ ; le message suit les changements de départ. */
function revalidateMaxInput() {
  const input = byId('max-custom');
  const raw = input.value.trim();
  if (raw === '') {
    maxInvalid = false;
    setFieldError(input, 'max-error', '');
    return;
  }
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 0 || v > MAX_VALUE) {
    maxInvalid = true;
    setFieldError(input, 'max-error', `Entrez un entier entre 0 et ${fmtNum(MAX_VALUE)}.`);
  } else if (v > 0 && v < config.startPoints) {
    maxInvalid = true;
    setFieldError(
      input,
      'max-error',
      `Le maximum doit être au moins égal aux points de départ (${fmtNum(config.startPoints)}).`,
    );
  } else {
    maxInvalid = false;
    setFieldError(input, 'max-error', '');
    config.maxPoints = v > 0 ? v : Infinity;
  }
}

// ── Sélections ──────────────────────────────────────────────────────

/** Sélectionne un nombre de joueurs. */
export function selectPlayer(n) {
  config.numPlayers = n;
  refresh();
}

/** Sélectionne des points de départ (puce si connue, sinon champ libre). */
export function selectStartPreset(v) {
  config.startPoints = v;
  startInvalid = false;
  const chip = byId('start-presets').querySelector(`.points-chip[data-val="${v}"]`);
  byId('points-custom').value = chip ? '' : String(v);
  setFieldError(byId('points-custom'), 'start-error', '');
  refresh();
}

/** Sélectionne un maximum (0 = sans limite). */
export function selectMaxPreset(v) {
  config.maxPoints = v > 0 ? v : Infinity;
  maxInvalid = false;
  const chip = byId('max-presets').querySelector(`.points-chip[data-val="${v}"]`);
  byId('max-custom').value = chip || v <= 0 ? '' : String(v);
  refresh();
}

/** Bascule l'autorisation des scores négatifs. */
export function toggleNegative() {
  config.allowNeg = !config.allowNeg;
  refresh();
  announce(config.allowNeg ? 'Scores négatifs autorisés' : 'Scores négatifs interdits');
}

/** Applique un préréglage complet. */
export function applyPreset(p) {
  activePreset = p;
  config.numPlayers = p.players;
  config.allowNeg = p.neg;
  selectStartPreset(p.start);
  selectMaxPreset(p.max);
  announce(`${p.name} : ${summaryText()}`);
}

/** Applique les défauts mémorisés (ou les valeurs sensées) au formulaire. */
export function applyDefaults() {
  const s = store.settings;
  activePreset = null;
  config.numPlayers = s.defPlayers > 0 ? s.defPlayers : FALLBACK_DEFAULTS.players;
  config.allowNeg = s.defNeg ?? FALLBACK_DEFAULTS.neg;
  selectStartPreset(s.defStart >= 0 ? s.defStart : FALLBACK_DEFAULTS.start);
  selectMaxPreset(s.defMax > 0 ? s.defMax : 0);
}

/** Mémorise le formulaire courant comme défaut et confirme sur le bouton. */
export function saveAsDefault(btn) {
  store.settings = {
    ...store.settings,
    defPlayers: config.numPlayers || 0,
    defStart: config.startPoints >= 0 ? config.startPoints : 0,
    defMax: config.maxPoints === Infinity ? 0 : config.maxPoints,
    defNeg: config.allowNeg,
  };
  const ok = persistSettings();
  const label = btn.querySelector('.btn-text') || btn;
  const orig = label.textContent;
  label.textContent = ok ? 'Sauvegardé' : 'Échec';
  announce(ok ? 'Réglages sauvegardés comme défaut' : 'Sauvegarde impossible', 'assertive');
  setTimeout(() => {
    label.textContent = orig;
  }, 1500);
}

/** Remet le formulaire aux défauts (après un reset de partie). */
export function resetSetupForm() {
  byId('points-custom').value = '';
  byId('max-custom').value = '';
  startInvalid = false;
  maxInvalid = false;
  applyDefaults();
}

// ── Bannière de reprise ─────────────────────────────────────────────

/** « à l'instant », « il y a 5 min », « il y a 2 h », « il y a 3 j », puis la date. */
export function relativeTime(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return `le ${new Date(ts).toLocaleDateString('fr-FR')}`;
}

/** « Alice 12 · Bob 8 · +2 » à partir des joueurs sauvegardés. */
export function savePreviewText(players, limit = 6) {
  const items = players.map((p, i) => {
    const name = p.playerName || `Joueur ${i + 1}`;
    return `${name} ${fmtNum(p.score)}${p.eliminated ? ' (éliminé)' : ''}`;
  });
  const shown = items.slice(0, limit);
  if (items.length > limit) shown.push(`+${items.length - limit}`);
  return shown.join(' · ');
}

/** Affiche (avec aperçu : noms, scores, date relative) ou masque la bannière de reprise. */
export function setRestoreBannerVisible(visible) {
  const banner = byId('restore-banner');
  if (!visible) {
    hide(banner);
    return;
  }
  const parsed = parseGame(readJSON(KEYS.save, null));
  if (!parsed.ok) {
    hide(banner);
    return;
  }
  byId('restore-preview').textContent = savePreviewText(parsed.game.players);
  const when = byId('restore-when');
  const ts = parsed.game.ts > 0 ? parsed.game.ts : null;
  when.textContent = ts ? `Sauvegardée ${relativeTime(ts)}` : 'Sauvegardée';
  if (ts) when.setAttribute('datetime', new Date(ts).toISOString());
  else when.removeAttribute('datetime');
  show(banner);
}

// ── Construction ────────────────────────────────────────────────────

function renderPresets() {
  const g = byId('presets-grid');
  const custom = byId('preset-custom');
  g.replaceChildren(
    ...GAME_PRESETS.map((p) => {
      const c = el(
        'button',
        {
          type: 'button',
          className: 'preset-card',
          dataset: { preset: p.name },
          'aria-pressed': 'false',
        },
        el('span', { className: 'preset-card-name', text: p.name }),
        el('span', { className: 'preset-card-detail', text: p.detail }),
      );
      c.addEventListener('click', () => applyPreset(p));
      return c;
    }),
    custom,
  );
  // La carte « Personnalisé » ramène vers les réglages détaillés.
  custom.addEventListener('click', () => {
    byId('players-grid').querySelector('[tabindex="0"]')?.focus();
  });
}

function renderPlayerChips() {
  const g = byId('players-grid');
  g.replaceChildren();
  for (let i = 1; i <= 12; i++) {
    const b = el('button', {
      type: 'button',
      className: 'player-chip',
      dataset: { val: String(i) },
      'aria-pressed': 'false',
      'aria-label': `${i} joueur${i > 1 ? 's' : ''}`,
      text: String(i),
    });
    b.addEventListener('click', () => selectPlayer(i));
    g.appendChild(b);
  }
}

function wirePointsControls() {
  qsa('#start-presets .points-chip').forEach((c) => {
    c.addEventListener('click', () => selectStartPreset(Number(c.dataset.val)));
  });
  byId('points-custom').addEventListener('input', function () {
    const raw = this.value.trim();
    if (raw === '') {
      startInvalid = false;
      config.startPoints = FALLBACK_DEFAULTS.start;
      setFieldError(this, 'start-error', '');
    } else {
      const v = Number(raw);
      startInvalid = !Number.isInteger(v) || v < 0 || v > MAX_VALUE;
      if (!startInvalid) config.startPoints = v;
      setFieldError(
        this,
        'start-error',
        startInvalid ? `Entrez un entier entre 0 et ${fmtNum(MAX_VALUE)}.` : '',
      );
    }
    refresh();
  });
  qsa('#max-presets .points-chip').forEach((c) => {
    c.addEventListener('click', () => {
      const v = Number(c.dataset.val);
      selectMaxPreset(config.maxPoints === v ? 0 : v);
    });
  });
  byId('max-custom').addEventListener('input', function () {
    if (this.value.trim() === '') config.maxPoints = Infinity;
    refresh();
  });
}

/** Construit les contrôles dynamiques du setup et câble leurs écouteurs. */
export function initSetup() {
  renderPresets();
  renderPlayerChips();
  wirePointsControls();
  rovingGroup(byId('players-grid'), '.player-chip');
  rovingGroup(byId('start-presets'), '.points-chip');
  rovingGroup(byId('max-presets'), '.points-chip');
  rovingGroup(byId('presets-grid'), '.preset-card');
}
