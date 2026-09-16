// Page Setup : préréglages, nombre de joueurs, points de départ/maximum, scores négatifs, défauts.
import { GAME_PRESETS } from '../core/constants.js';
import { fmtNum } from '../core/format.js';
import { store } from '../store.js';
import { byId, el, qsa, show, hide } from './dom.js';
import { persistSettings } from './settings.js';

const { config } = store;

function clearPresetCards() {
  qsa('.preset-card').forEach((c) => c.classList.remove('on'));
}

/** Met à jour le bouton « Suivant » selon la validité du formulaire. */
export function checkGoBtn() {
  const ok = config.numPlayers >= 1 && config.startPoints >= 0;
  const btn = byId('go-btn');
  btn.disabled = !ok;
  btn.textContent = ok
    ? `Suivant → (${config.numPlayers}j · ${fmtNum(config.startPoints)}pts)`
    : 'Suivant →';
}

/** Désactive les puces « maximum » inférieures aux points de départ. */
function updateMaxChips() {
  qsa('#max-presets .points-chip').forEach((c) => {
    const v = parseInt(c.dataset.val);
    if (v < config.startPoints) {
      c.classList.add('disabled');
      if (c.classList.contains('on')) {
        c.classList.remove('on');
        config.maxPoints = Infinity;
        byId('max-custom').value = '';
      }
    } else c.classList.remove('disabled');
  });
  const mc = byId('max-custom');
  const v = parseInt(mc.value);
  if (!isNaN(v) && v > 0 && v < config.startPoints) {
    mc.style.borderColor = 'var(--red)';
    config.maxPoints = Infinity;
    mc.value = '';
  } else mc.style.borderColor = '';
}

/** Sélectionne un nombre de joueurs (puce correspondante). */
export function selectPlayer(n) {
  config.numPlayers = n;
  qsa('#players-grid .player-chip').forEach((c) => {
    c.classList.toggle('on', parseInt(c.textContent) === n);
  });
  checkGoBtn();
}

/** Sélectionne des points de départ (puce si connue, sinon champ libre). */
export function selectStartPreset(v) {
  config.startPoints = v;
  const chip = document.querySelector(`#start-presets .points-chip[data-val="${v}"]`);
  qsa('#start-presets .points-chip').forEach((c) => c.classList.remove('on'));
  if (chip) {
    chip.classList.add('on');
    byId('points-custom').value = '';
  } else {
    byId('points-custom').value = v > 0 ? v : '';
  }
  checkGoBtn();
  updateMaxChips();
}

/** Sélectionne un maximum (0 = sans limite). */
export function selectMaxPreset(v) {
  config.maxPoints = v > 0 ? v : Infinity;
  qsa('#max-presets .points-chip').forEach((c) => {
    c.classList.toggle('on', parseInt(c.dataset.val) === v);
  });
}

/** Bascule l'autorisation des scores négatifs. */
export function toggleNegative() {
  config.allowNeg = !config.allowNeg;
  byId('neg-toggle').classList.toggle('on', config.allowNeg);
}

/** Applique les défauts mémorisés au formulaire. */
export function applyDefaults() {
  const s = store.settings;
  if (s.defPlayers > 0) selectPlayer(s.defPlayers);
  if (s.defStart >= 0) selectStartPreset(s.defStart);
  if (s.defMax > 0) selectMaxPreset(s.defMax);
  config.allowNeg = s.defNeg;
  byId('neg-toggle').classList.toggle('on', config.allowNeg);
  clearPresetCards();
}

/** Mémorise le formulaire courant comme défaut et affiche une confirmation sur le bouton. */
export function saveAsDefault(btn) {
  store.settings = {
    ...store.settings,
    defPlayers: config.numPlayers || 0,
    defStart: config.startPoints >= 0 ? config.startPoints : 0,
    defMax: config.maxPoints === Infinity ? 0 : config.maxPoints,
    defNeg: config.allowNeg,
  };
  persistSettings();
  // Flash de confirmation (les nœuds d'origine sont restaurés tels quels)
  const orig = Array.from(btn.childNodes);
  btn.textContent = '✓ Sauvegardé !';
  setTimeout(() => btn.replaceChildren(...orig), 1500);
}

/** Affiche ou masque la bannière « partie sauvegardée ». */
export function setRestoreBannerVisible(visible) {
  const b = byId('restore-banner');
  if (visible) show(b);
  else hide(b);
}

/** Remet le formulaire à zéro puis réapplique les défauts (après un reset de partie). */
export function resetSetupForm() {
  config.numPlayers = 0;
  config.startPoints = 0;
  config.maxPoints = Infinity;
  config.allowNeg = false;
  qsa('#players-grid .player-chip').forEach((c) => c.classList.remove('on'));
  qsa('#start-presets .points-chip,#max-presets .points-chip').forEach((c) => {
    c.classList.remove('on');
    c.classList.remove('disabled');
  });
  byId('points-custom').value = '';
  byId('max-custom').value = '';
  byId('neg-toggle').classList.remove('on');
  clearPresetCards();
  byId('go-btn').disabled = true;
  byId('go-btn').textContent = 'Suivant →';
  const s = store.settings;
  if (s.defPlayers > 0) selectPlayer(s.defPlayers);
  if (s.defStart >= 0) selectStartPreset(s.defStart);
  if (s.defMax > 0) selectMaxPreset(s.defMax);
}

function renderPresets() {
  const g = byId('presets-grid');
  g.replaceChildren();
  GAME_PRESETS.forEach((p) => {
    const c = el(
      'div',
      { className: 'preset-card' },
      el('div', { className: 'preset-card-name', text: p.name }),
      el('div', { className: 'preset-card-detail', text: p.detail }),
    );
    c.addEventListener('click', () => {
      clearPresetCards();
      c.classList.add('on');
      selectPlayer(p.players);
      selectStartPreset(p.start);
      if (p.max > 0) selectMaxPreset(p.max);
      else {
        config.maxPoints = Infinity;
        qsa('#max-presets .points-chip').forEach((x) => x.classList.remove('on'));
      }
      config.allowNeg = p.neg;
      byId('neg-toggle').classList.toggle('on', config.allowNeg);
    });
    g.appendChild(c);
  });
}

function renderPlayerChips() {
  const g = byId('players-grid');
  for (let i = 1; i <= 12; i++) {
    const d = el('div', { className: 'player-chip', text: String(i) });
    d.addEventListener('click', () => {
      qsa('#players-grid .player-chip').forEach((c) => c.classList.remove('on'));
      d.classList.add('on');
      config.numPlayers = i;
      checkGoBtn();
      clearPresetCards();
    });
    g.appendChild(d);
  }
}

function wirePointsControls() {
  qsa('#start-presets .points-chip').forEach((c) => {
    c.addEventListener('click', () => {
      qsa('#start-presets .points-chip').forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      config.startPoints = parseInt(c.dataset.val);
      byId('points-custom').value = '';
      checkGoBtn();
      updateMaxChips();
      clearPresetCards();
    });
  });
  byId('points-custom').addEventListener('input', function () {
    qsa('#start-presets .points-chip').forEach((x) => x.classList.remove('on'));
    const v = parseInt(this.value);
    config.startPoints = isNaN(v) ? -1 : v;
    checkGoBtn();
    updateMaxChips();
  });
  qsa('#max-presets .points-chip').forEach((c) => {
    c.addEventListener('click', () => {
      if (c.classList.contains('on')) {
        c.classList.remove('on');
        config.maxPoints = Infinity;
      } else {
        qsa('#max-presets .points-chip').forEach((x) => x.classList.remove('on'));
        c.classList.add('on');
        config.maxPoints = parseInt(c.dataset.val);
        byId('max-custom').value = '';
      }
    });
  });
  byId('max-custom').addEventListener('input', function () {
    qsa('#max-presets .points-chip').forEach((x) => x.classList.remove('on'));
    const v = parseInt(this.value);
    if (!isNaN(v) && v > 0 && v < config.startPoints) {
      this.style.borderColor = 'var(--red)';
      config.maxPoints = Infinity;
    } else {
      this.style.borderColor = '';
      config.maxPoints = !v || v <= 0 ? Infinity : v;
    }
  });
}

/** Construit les contrôles dynamiques du setup et câble leurs écouteurs. */
export function initSetup() {
  renderPresets();
  renderPlayerChips();
  wirePointsControls();
}
