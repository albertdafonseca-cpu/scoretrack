// Page Réglages : grille de thèmes, chargement/persistance des réglages.
import { THEMES, DEFAULT_THEME } from '../core/constants.js';
import { KEYS, parseSettings, serializeSettings } from '../core/save-schema.js';
import { readJSON, writeJSON } from '../platform/storage.js';
import { store } from '../store.js';
import { byId, el, qsa, showPage, icon } from './dom.js';

/** Applique un thème au document (le thème par défaut n'a pas d'attribut). */
export function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id === DEFAULT_THEME ? '' : id);
  store.settings.theme = id;
}

/** Charge les réglages depuis le stockage et applique le thème. */
export function loadSettings() {
  store.settings = parseSettings(readJSON(KEYS.settings, {}));
  applyTheme(store.settings.theme || DEFAULT_THEME);
}

/** Écrit les réglages courants ; renvoie true si l'écriture a réussi. */
export function persistSettings() {
  return writeJSON(KEYS.settings, serializeSettings(store.settings));
}

function themeCard(t) {
  const card = el(
    'div',
    {
      className: 'theme-card' + (store.settings.theme === t.id ? ' selected' : ''),
      style: `background:${t.bg}`,
    },
    el('div', { className: 'theme-check' }, icon('check', '✓')),
    el('div', { className: 'theme-card-name', style: `color:${t.a}`, text: t.name }),
    el(
      'div',
      { className: 'theme-swatches' },
      el('div', {
        className: 'theme-swatch',
        style: `background:${t.a};box-shadow:0 0 6px ${t.a}`,
      }),
      el('div', {
        className: 'theme-swatch',
        style: `background:${t.b};box-shadow:0 0 6px ${t.b}`,
      }),
      el('div', {
        className: 'theme-swatch',
        style: `background:${t.bg};border:1px solid ${t.a}44`,
      }),
    ),
  );
  card.addEventListener('click', () => {
    qsa('.theme-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    applyTheme(t.id);
    // Sauvegarde automatique du thème
    persistSettings();
  });
  return card;
}

/** (Re)construit la grille de thèmes. */
export function renderThemeGrid() {
  const g = byId('themes-grid');
  g.replaceChildren(...THEMES.map(themeCard));
}

/** Affiche la page Réglages. */
export function showSettings() {
  renderThemeGrid();
  showPage('settings-page');
}
