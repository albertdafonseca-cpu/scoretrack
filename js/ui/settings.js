// Page Réglages : thèmes, données (export/import), confidentialité (modale accessible),
// chargement/persistance des réglages et mémoire des derniers noms par préréglage.
import { THEMES, DEFAULT_THEME } from '../core/constants.js';
import { KEYS, parseSettings, serializeSettings } from '../core/save-schema.js';
import { logError } from '../platform/errors.js';
import { readJSON, remove, writeJSON } from '../platform/storage.js';
import { store } from '../store.js';
import { announce, rovingGroup, syncRovingTabs, trapFocus } from './a11y.js';
import { byId, el, hide, icon, qsa, show, showPage } from './dom.js';

// ── Réglages ────────────────────────────────────────────────────────

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

// ── Derniers noms par préréglage (clé versionnée, lue/écrite via storage.js) ──

export const LAST_NAMES_KEY = 'scoretrack_last_names';
const LAST_NAMES_VERSION = 1;
const NAME_MAX_LEN = 18;

/** `{ [clé de préréglage]: string[] }` normalisé à partir du JSON brut. */
export function parseLastNames(raw) {
  const src = raw && typeof raw === 'object' && raw.byPreset ? raw.byPreset : {};
  const out = {};
  for (const [key, list] of Object.entries(src)) {
    if (!Array.isArray(list)) continue;
    out[key] = list.map((n) => (typeof n === 'string' ? n.slice(0, NAME_MAX_LEN) : ''));
  }
  return out;
}

function loadLastNames() {
  return parseLastNames(readJSON(LAST_NAMES_KEY, null));
}

/** Mémorise les noms d'une partie sous la clé du préréglage (supprime l'entrée si tout est vide). */
export function rememberLastNames(key, names) {
  const all = loadLastNames();
  if (names.some((n) => n.trim())) all[key] = names.map((n) => n.trim().slice(0, NAME_MAX_LEN));
  else delete all[key];
  if (Object.keys(all).length === 0) remove(LAST_NAMES_KEY);
  else writeJSON(LAST_NAMES_KEY, { v: LAST_NAMES_VERSION, byPreset: all });
}

/** Derniers noms pour un préréglage, ajustés à `n` cases (chaînes vides en complément). */
export function lastNamesFor(key, n) {
  const list = loadLastNames()[key] || [];
  return Array.from({ length: n }, (_, i) => list[i] || '');
}

// ── Thèmes ──────────────────────────────────────────────────────────

function themeCard(t) {
  const card = el(
    'button',
    {
      type: 'button',
      className: 'theme-card',
      style: `background:${t.bg}`,
      dataset: { theme: t.id },
      'aria-pressed': String(store.settings.theme === t.id),
    },
    el('span', { className: 'theme-check', 'aria-hidden': 'true' }, icon('check', '✓')),
    el('span', { className: 'theme-card-name', style: `color:${t.a}`, text: t.name }),
    el(
      'span',
      { className: 'theme-swatches', 'aria-hidden': 'true' },
      el('span', { className: 'theme-swatch', style: `background:${t.a}` }),
      el('span', { className: 'theme-swatch', style: `background:${t.b}` }),
      el('span', {
        className: 'theme-swatch',
        style: `background:${t.bg};border:1px solid ${t.a}`,
      }),
    ),
  );
  card.addEventListener('click', () => selectTheme(t));
  return card;
}

function selectTheme(t) {
  qsa('.theme-card').forEach((c) =>
    c.setAttribute('aria-pressed', String(c.dataset.theme === t.id)),
  );
  applyTheme(t.id);
  persistSettings();
  syncRovingTabs(byId('themes-grid'), '.theme-card');
  announce(`Thème ${t.name} appliqué`);
}

/** (Re)construit la grille de thèmes. */
export function renderThemeGrid() {
  const g = byId('themes-grid');
  g.replaceChildren(...THEMES.map(themeCard));
  syncRovingTabs(g, '.theme-card');
}

/** Affiche la page Réglages. */
export function showSettings() {
  renderThemeGrid();
  setDataStatus('');
  showPage('settings-page');
  byId('settings-title').focus({ preventScroll: true });
}

/** Câblage unique de la page Réglages (navigation par flèches dans les thèmes). */
export function initSettings() {
  rovingGroup(byId('themes-grid'), '.theme-card');
}

// ── Données : export / import (module chargé à la demande) ──────────

function setDataStatus(text) {
  byId('data-status').textContent = text;
}

async function loadBackup() {
  return import('../platform/backup.js');
}

/** Télécharge un fichier JSON contenant réglages, partie en cours et prénoms. */
export async function exportData() {
  try {
    const backup = await loadBackup();
    await backup.downloadExport();
    setDataStatus('Export téléchargé.');
    announce('Export téléchargé');
  } catch (e) {
    logError(e, 'settings.export');
    setDataStatus("L'export n'est pas disponible sur cet appareil.");
    announce("L'export n'est pas disponible", 'assertive');
  }
}

/** Ouvre un sélecteur de fichier et importe une sauvegarde validée par backup.js. */
export async function importData() {
  try {
    const backup = await loadBackup();
    const result = await backup.pickAndImport();
    if (!result || (result.ok === false && /annul/i.test(result.error || ''))) return;
    if (result.ok === false) {
      setDataStatus(`Import refusé : ${result.error}`);
      announce(`Import refusé : ${result.error}`, 'assertive');
      return;
    }
    setDataStatus(`Import réussi${result.summary ? ` : ${result.summary}` : ''}. Rechargement…`);
    announce('Import réussi, rechargement de la page');
    setTimeout(() => window.location.reload(), 800);
  } catch (e) {
    logError(e, 'settings.import');
    setDataStatus("L'import n'est pas disponible sur cet appareil.");
    announce("L'import n'est pas disponible", 'assertive');
  }
}

// ── Modale de confidentialité ───────────────────────────────────────

let releasePrivacyTrap = null;
let clearArmTimer = null;

/** Ouvre la modale (dialogue modal, piège de focus, Échap ferme). */
export function openPrivacy() {
  const modal = byId('privacy-modal');
  show(modal);
  disarmClearAll();
  releasePrivacyTrap = trapFocus(modal, {
    onEscape: closePrivacy,
    initialFocus: byId('privacy-title'),
  });
}

/** Ferme la modale et rend le focus au bouton d'ouverture. */
export function closePrivacy() {
  const modal = byId('privacy-modal');
  hide(modal);
  disarmClearAll();
  if (releasePrivacyTrap) {
    releasePrivacyTrap();
    releasePrivacyTrap = null;
  }
}

function disarmClearAll() {
  clearTimeout(clearArmTimer);
  const btn = byId('btn-clear-all');
  if (!btn.dataset.armed) return;
  delete btn.dataset.armed;
  btn.querySelector('.btn-text').textContent = 'Supprimer toutes les données';
}

/**
 * Suppression en deux temps : le premier appui arme le bouton (« Confirmer la suppression »),
 * le second dans les 5 s confirme. Renvoie true quand la suppression est confirmée.
 */
export function armClearAll(btn) {
  if (btn.dataset.armed) {
    disarmClearAll();
    return true;
  }
  btn.dataset.armed = '1';
  btn.querySelector('.btn-text').textContent = 'Confirmer la suppression';
  announce('Appuyez de nouveau pour confirmer la suppression de toutes les données', 'assertive');
  clearArmTimer = setTimeout(disarmClearAll, 5000);
  return false;
}
